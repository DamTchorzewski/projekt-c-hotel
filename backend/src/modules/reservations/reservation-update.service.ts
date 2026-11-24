import { Injectable } from '@nestjs/common';
import {
  dateInHotel,
  formatDateOnly,
  nightsBetween,
  parseDateOnly,
} from '../../common/dates/date-utils.js';
import { ApiException } from '../../common/errors/api-exception.js';
import { isExclusionViolation } from '../../common/errors/database-errors.js';
import { domainErrors } from '../../common/errors/domain-errors.js';
import { calculateTotalPrice } from '../../common/pricing/stay-pricing.js';
import { assertStayDates } from '../../common/validation/stay-rules.js';
import {
  ReservationStatus,
  ServiceStatus,
  type Prisma,
  type RoomType,
} from '../../generated/prisma/client.js';
import { RoomAvailabilityService } from '../offers/room-availability.service.js';
import type { UpdateReservationDto } from './dto/update-reservation.dto.js';
import { ReservationLock } from './reservation-lock.service.js';
import type { ReservationWithRelations } from './reservations.mapper.js';
import { MAX_ATTEMPTS, OVERLAP_CONSTRAINT } from './reservations.service.js';

const STATUSES_WITH_EDITABLE_NOTES: ReservationStatus[] = [
  ReservationStatus.CONFIRMED,
  ReservationStatus.CHECKED_IN,
  ReservationStatus.COMPLETED,
];

// Zmiana rezerwacji przez recepcję i System D (US-09, US-23, RB-07, RB-21). (DamianTchorzewski_72206)
@Injectable()
export class ReservationUpdateService {
  constructor(
    private readonly lock: ReservationLock,
    private readonly availability: RoomAvailabilityService,
  ) {}

  async update(
    where: Prisma.ReservationWhereUniqueInput,
    dto: UpdateReservationDto,
  ): Promise<ReservationWithRelations> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.lock.run(where, async (tx, reservation) => {
          const data = await this.prepare(tx, reservation, dto);
          await tx.reservation.update({ where: { id: reservation.id }, data });
          return this.lock.reload(tx, reservation.id);
        });
      } catch (error) {
        // Inne żądanie zajęło pokój między sprawdzeniem a zapisem, więc szukamy jeszcze raz (RB-01). (DamianTchorzewski_72206)
        if (!isExclusionViolation(error, OVERLAP_CONSTRAINT)) {
          throw error;
        }
      }
    }

    throw domainErrors.roomNotAvailable();
  }

  private async prepare(
    tx: Prisma.TransactionClient,
    reservation: ReservationWithRelations,
    dto: UpdateReservationDto,
  ): Promise<Prisma.ReservationUpdateInput> {
    const changed = Object.entries(dto)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    const onlyNotes = changed.every((key) => key === 'notes');

    if (
      onlyNotes
        ? !STATUSES_WITH_EDITABLE_NOTES.includes(reservation.status)
        : reservation.status !== ReservationStatus.CONFIRMED
    ) {
      throw domainErrors.invalidState(
        'The reservation cannot be changed in its current state.',
      );
    }

    const stayChanged = changed.some(
      (key) => key !== 'notes' && key !== 'guest',
    );
    return {
      ...(stayChanged ? await this.prepareStay(tx, reservation, dto) : {}),
      ...(dto.notes === undefined ? {} : { notes: dto.notes || null }),
      ...(dto.guest
        ? {
            guests: {
              updateMany: {
                where: { isPrimary: true },
                data: {
                  firstName: dto.guest.firstName,
                  lastName: dto.guest.lastName,
                  email: dto.guest.email,
                  phone: dto.guest.phone,
                },
              },
            },
          }
        : {}),
    };
  }

  private async prepareStay(
    tx: Prisma.TransactionClient,
    reservation: ReservationWithRelations,
    dto: UpdateReservationDto,
  ): Promise<Prisma.ReservationUpdateInput> {
    const checkIn = dto.checkIn ?? formatDateOnly(reservation.checkIn);
    const checkOut = dto.checkOut ?? formatDateOnly(reservation.checkOut);
    const guestsCount = dto.guestsCount ?? reservation.guestsCount;

    if (dto.checkIn !== undefined || dto.checkOut !== undefined) {
      assertStayDates(checkIn, checkOut);
    }
    const roomType = await this.targetRoomType(tx, reservation, dto);
    if (guestsCount > roomType.maxCapacity) {
      throw domainErrors.capacityExceeded(roomType.maxCapacity);
    }

    const free = await this.availability.findFreeRooms(
      checkIn,
      checkOut,
      { roomTypeId: roomType.id, ...(dto.roomId ? { id: dto.roomId } : {}) },
      tx,
      reservation.id,
    );
    // Obecny pokój zostaje, jeśli pasuje. W przeciwnym razie wolny pokój o najniższym numerze (RB-06). (DamianTchorzewski_72206)
    const room =
      free.find((candidate) => candidate.id === reservation.roomId) ?? free[0];
    if (!room) {
      throw domainErrors.roomNotAvailable();
    }

    this.assertServicesFit(reservation, checkIn, checkOut);

    return {
      room: { connect: { id: room.id } },
      checkIn: parseDateOnly(checkIn),
      checkOut: parseDateOnly(checkOut),
      guestsCount,
      totalPrice: calculateTotalPrice(
        roomType.basePricePerNight,
        nightsBetween(checkIn, checkOut),
      ),
    };
  }

  private async targetRoomType(
    tx: Prisma.TransactionClient,
    reservation: ReservationWithRelations,
    dto: UpdateReservationDto,
  ): Promise<RoomType> {
    const requested = dto.roomTypeCode
      ? await tx.roomType.findUnique({ where: { code: dto.roomTypeCode } })
      : null;
    if (dto.roomTypeCode && !requested) {
      throw ApiException.validation([
        { field: 'roomTypeCode', message: 'roomTypeCode does not exist' },
      ]);
    }
    if (!dto.roomId) {
      return requested ?? reservation.room.roomType;
    }

    const room = await tx.room.findUnique({
      where: { id: dto.roomId },
      include: { roomType: true },
    });
    if (!room || (requested && requested.id !== room.roomTypeId)) {
      throw ApiException.validation([
        {
          field: 'roomId',
          message: 'roomId must be a room of the given room type',
        },
      ]);
    }
    return room.roomType;
  }

  // RB-07 i RB-09: potwierdzone usługi muszą mieścić się w nowym terminie. (DamianTchorzewski_72206)
  private assertServicesFit(
    reservation: ReservationWithRelations,
    checkIn: string,
    checkOut: string,
  ): void {
    const outside = reservation.services.filter((service) => {
      if (
        service.status !== ServiceStatus.CONFIRMED ||
        service.scheduledAt === null
      ) {
        return false;
      }
      const day = dateInHotel(service.scheduledAt);
      return day < checkIn || day > checkOut;
    });

    if (outside.length > 0) {
      throw domainErrors.servicesOutsideStay(
        outside.map((service) => ({
          field: `services.${service.id}`,
          message: `${service.serviceName}, ${service.scheduledAt?.toISOString() ?? ''}`,
        })),
      );
    }
  }
}
