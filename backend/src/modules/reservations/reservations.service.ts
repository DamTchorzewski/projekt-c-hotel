import { Injectable } from '@nestjs/common';
import { nightsBetween, parseDateOnly } from '../../common/dates/date-utils.js';
import { ApiException } from '../../common/errors/api-exception.js';
import { isExclusionViolation } from '../../common/errors/database-errors.js';
import { domainErrors } from '../../common/errors/domain-errors.js';
import { calculateTotalPrice } from '../../common/pricing/stay-pricing.js';
import { assertStayDates } from '../../common/validation/stay-rules.js';
import {
  ReservationSource,
  ReservationStatus,
  ServiceStatus,
  type Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RoomAvailabilityService } from '../offers/room-availability.service.js';
import type { CreateReceptionReservationDto } from './dto/create-reservation.dto.js';
import {
  RESERVATION_INCLUDE,
  type ReservationWithRelations,
} from './reservations.mapper.js';

const OVERLAP_CONSTRAINT = 'reservations_no_overlap';
const MAX_ATTEMPTS = 5;

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: RoomAvailabilityService,
  ) {}

  async create(
    dto: CreateReceptionReservationDto,
    source: ReservationSource,
  ): Promise<ReservationWithRelations> {
    assertStayDates(dto.checkIn, dto.checkOut);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction((tx) =>
          this.createInTransaction(tx, dto, source),
        );
      } catch (error) {
        // Ostateczną ochroną przed podwójną rezerwacją jest ograniczenie w bazie (RB-01): dwa równoległe żądania
        // mogą oba przejść sprawdzenie dostępności. Przegrany próbuje jeszcze raz z innym wolnym pokojem. (DamianTchorzewski_72206)
        if (!isExclusionViolation(error, OVERLAP_CONSTRAINT)) {
          throw error;
        }
      }
    }

    throw domainErrors.roomNotAvailable();
  }

  // RB-08: anulowanie tylko z CONFIRMED, ponowne anulowanie nic nie zmienia. (DamianTchorzewski_72206)
  async cancel(id: string): Promise<ReservationWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      // Warunek na status w samym UPDATE sprawia, że przy równoległych żądaniach zadziała tylko jedno. (DamianTchorzewski_72206)
      const { count } = await tx.reservation.updateMany({
        where: { id, status: ReservationStatus.CONFIRMED },
        data: { status: ReservationStatus.CANCELLED },
      });

      if (count > 0) {
        await tx.partnerServiceBooking.updateMany({
          where: {
            reservationId: id,
            status: { in: [ServiceStatus.TO_ORDER, ServiceStatus.REJECTED] },
          },
          data: { status: ServiceStatus.CANCELLED },
        });
        // Anulowanie u partnera dojdzie z adapterami (US-26). Do tego czasu usługa czeka na liście do ponowienia. (DamianTchorzewski_72206)
        await tx.partnerServiceBooking.updateMany({
          where: { reservationId: id, status: ServiceStatus.CONFIRMED },
          data: { status: ServiceStatus.CANCEL_RETRY },
        });
      }

      const reservation = await tx.reservation.findUnique({
        where: { id },
        include: RESERVATION_INCLUDE,
      });
      if (!reservation) {
        throw domainErrors.notFound('The reservation does not exist.');
      }
      if (reservation.status !== ReservationStatus.CANCELLED) {
        throw domainErrors.invalidState(
          'Only a confirmed reservation can be cancelled.',
        );
      }

      return reservation;
    });
  }

  private async createInTransaction(
    tx: Prisma.TransactionClient,
    dto: CreateReceptionReservationDto,
    source: ReservationSource,
  ): Promise<ReservationWithRelations> {
    const roomType = await tx.roomType.findUnique({
      where: { code: dto.roomTypeCode },
    });
    if (!roomType) {
      throw ApiException.validation([
        { field: 'roomTypeCode', message: 'roomTypeCode does not exist' },
      ]);
    }
    if (dto.guestsCount > roomType.maxCapacity) {
      throw domainErrors.capacityExceeded(roomType.maxCapacity);
    }
    if (dto.roomId) {
      const requested = await tx.room.findFirst({
        where: { id: dto.roomId, roomTypeId: roomType.id },
      });
      if (!requested) {
        throw ApiException.validation([
          {
            field: 'roomId',
            message: 'roomId must be a room of the given room type',
          },
        ]);
      }
    }

    // RB-06: wolny pokój o najniższym numerze albo konkretny wskazany przez recepcję. (DamianTchorzewski_72206)
    const [room] = await this.availability.findFreeRooms(
      dto.checkIn,
      dto.checkOut,
      { roomTypeId: roomType.id, ...(dto.roomId ? { id: dto.roomId } : {}) },
      tx,
    );
    if (!room) {
      throw domainErrors.roomNotAvailable();
    }

    return tx.reservation.create({
      data: {
        roomId: room.id,
        checkIn: parseDateOnly(dto.checkIn),
        checkOut: parseDateOnly(dto.checkOut),
        guestsCount: dto.guestsCount,
        totalPrice: calculateTotalPrice(
          roomType.basePricePerNight,
          nightsBetween(dto.checkIn, dto.checkOut),
        ),
        source,
        notes: dto.notes || null,
        guests: {
          create: {
            firstName: dto.guest.firstName,
            lastName: dto.guest.lastName,
            email: dto.guest.email,
            phone: dto.guest.phone,
            isPrimary: true,
          },
        },
      },
      include: RESERVATION_INCLUDE,
    });
  }
}
