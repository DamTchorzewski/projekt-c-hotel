import { Injectable } from '@nestjs/common';
import { nightsBetween, parseDateOnly } from '../../common/dates/date-utils.js';
import { ApiException } from '../../common/errors/api-exception.js';
import {
  isExclusionViolation,
  isUniqueViolation,
} from '../../common/errors/database-errors.js';
import { domainErrors } from '../../common/errors/domain-errors.js';
import { calculateTotalPrice } from '../../common/pricing/stay-pricing.js';
import { assertStayDates } from '../../common/validation/stay-rules.js';
import {
  ReservationSource,
  ReservationStatus,
  ServiceSource,
  ServiceStatus,
  VoucherStatus,
  type Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RoomAvailabilityService } from '../offers/room-availability.service.js';
import type { CreateReceptionReservationDto } from './dto/create-reservation.dto.js';
import type { PackageServiceDto } from './dto/external-reservation.dto.js';
import { ReservationLock } from './reservation-lock.service.js';
import {
  RESERVATION_INCLUDE,
  type ReservationWithRelations,
} from './reservations.mapper.js';
import { ServiceCancellation } from './service-cancellation.service.js';

export const OVERLAP_CONSTRAINT = 'reservations_no_overlap';
export const MAX_ATTEMPTS = 5;

// Dane rezerwacji z vouchera, których nie ma w innych kanałach. (DamianTchorzewski_72206)
export interface VoucherReservation {
  voucherCode: string;
  idempotencyKey: string;
  idempotencyHash: string;
  packageServices: PackageServiceDto[];
}

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: RoomAvailabilityService,
    private readonly lock: ReservationLock,
    private readonly serviceCancellation: ServiceCancellation,
  ) {}

  async create(
    dto: CreateReceptionReservationDto,
    source: ReservationSource,
    voucher?: VoucherReservation,
  ): Promise<ReservationWithRelations> {
    assertStayDates(dto.checkIn, dto.checkOut);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction((tx) =>
          this.createInTransaction(tx, dto, source, voucher),
        );
      } catch (error) {
        // RB-18 przy dwóch równoległych żądaniach z tym samym voucherem. (DamianTchorzewski_72206)
        if (isUniqueViolation(error, 'voucher')) {
          throw domainErrors.voucherAlreadyUsed();
        }
        // Ostateczną ochroną przed podwójną rezerwacją jest ograniczenie w bazie (RB-01): dwa równoległe żądania
        // mogą oba przejść sprawdzenie dostępności. Przegrany próbuje jeszcze raz z innym wolnym pokojem. (DamianTchorzewski_72206)
        if (!isExclusionViolation(error, OVERLAP_CONSTRAINT)) {
          throw error;
        }
      }
    }

    throw domainErrors.roomNotAvailable();
  }

  // RB-08: anulowanie tylko z CONFIRMED, ponowne anulowanie nic nie zmienia. Usługi są anulowane także u partnerów. (DamianTchorzewski_72206)
  cancel(
    where: Prisma.ReservationWhereUniqueInput,
  ): Promise<ReservationWithRelations> {
    return this.lock.run(where, async (tx, reservation) => {
      if (reservation.status === ReservationStatus.CANCELLED) {
        return reservation;
      }
      if (reservation.status !== ReservationStatus.CONFIRMED) {
        throw domainErrors.invalidState(
          'Only a confirmed reservation can be cancelled.',
        );
      }

      // Partnerów pytamy równolegle, żeby kilka usług nie wydłużało anulowania ponad 5 sekund. (DamianTchorzewski_72206)
      const statuses = await Promise.all(
        reservation.services.map(async (service) => ({
          id: service.id,
          status:
            await this.serviceCancellation.statusAfterStayCancellation(service),
        })),
      );
      for (const { id, status } of statuses) {
        await tx.partnerServiceBooking.update({
          where: { id },
          data: { status },
        });
      }
      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.CANCELLED },
      });

      return this.lock.reload(tx, reservation.id);
    });
  }

  private async createInTransaction(
    tx: Prisma.TransactionClient,
    dto: CreateReceptionReservationDto,
    source: ReservationSource,
    voucher: VoucherReservation | undefined,
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
        ...(voucher
          ? {
              voucherCode: voucher.voucherCode,
              voucherStatus: VoucherStatus.PENDING_VERIFICATION,
              idempotencyKey: voucher.idempotencyKey,
              idempotencyHash: voucher.idempotencyHash,
              services: { create: toPackageItems(voucher.packageServices) },
            }
          : {}),
      },
      include: RESERVATION_INCLUDE,
    });
  }
}

// RB-11: każda sztuka z puli pakietu to osobna pozycja planu. (DamianTchorzewski_72206)
function toPackageItems(services: PackageServiceDto[]) {
  return services.flatMap((service) =>
    Array.from({ length: service.quantity }, () => ({
      partnerType: service.partnerType,
      partnerServiceId: service.partnerServiceId,
      serviceName: service.serviceName,
      source: ServiceSource.PACKAGE,
      status: ServiceStatus.TO_ORDER,
    })),
  );
}
