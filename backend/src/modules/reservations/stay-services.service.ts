import { Injectable } from '@nestjs/common';
import { dateInHotel, formatDateOnly } from '../../common/dates/date-utils.js';
import { ApiException } from '../../common/errors/api-exception.js';
import { domainErrors } from '../../common/errors/domain-errors.js';
import {
  RejectionReason,
  ReservationStatus,
  ServiceSource,
  ServiceStatus,
  type PartnerServiceBooking,
  type Prisma,
} from '../../generated/prisma/client.js';
import { PartnerUnavailableError } from '../partners/partner-client.service.js';
import { PartnerRegistry } from '../partners/partner-registry.service.js';
import type { PartnerService } from '../partners/service-partner.adapter.js';
import type { AddServiceDto, BookServiceDto } from './dto/stay-service.dto.js';
import { ReservationLock } from './reservation-lock.service.js';
import type { ReservationWithRelations } from './reservations.mapper.js';
import { ServiceCancellation } from './service-cancellation.service.js';

const MINUTE_IN_MS = 60_000;

const OPEN_STAY: ReservationStatus[] = [
  ReservationStatus.CONFIRMED,
  ReservationStatus.CHECKED_IN,
];
const BOOKABLE: ServiceStatus[] = [
  ServiceStatus.TO_ORDER,
  ServiceStatus.REJECTED,
];

// Plan pobytu: usługi dodatkowe, rezerwacja terminu u partnera i anulowanie (US-13 - US-16). (DamianTchorzewski_72206)
@Injectable()
export class StayServicesService {
  constructor(
    private readonly lock: ReservationLock,
    private readonly partners: PartnerRegistry,
    private readonly cancellation: ServiceCancellation,
  ) {}

  add(
    reservationId: string,
    dto: AddServiceDto,
  ): Promise<PartnerServiceBooking> {
    return this.lock.run({ id: reservationId }, async (tx, reservation) => {
      this.assertOpen(reservation);

      const service = await this.findInCatalog(dto, reservation.id);
      if (!service) {
        throw ApiException.validation([
          {
            field: 'partnerServiceId',
            message: 'partnerServiceId does not exist in the partner catalog',
          },
        ]);
      }

      return tx.partnerServiceBooking.create({
        data: {
          reservationId: reservation.id,
          partnerType: dto.partnerType,
          source: ServiceSource.EXTRA,
          partnerServiceId: service.id,
          serviceName: service.name,
          price: service.price,
          durationMinutes: service.durationMinutes,
          status: ServiceStatus.TO_ORDER,
        },
      });
    });
  }

  book(
    reservationId: string,
    serviceId: string,
    dto: BookServiceDto,
  ): Promise<PartnerServiceBooking> {
    const scheduledAt = new Date(dto.scheduledAt);

    return this.lock.run({ id: reservationId }, async (tx, reservation) => {
      this.assertOpen(reservation);
      const item = this.findItem(reservation, serviceId);
      if (!BOOKABLE.includes(item.status)) {
        throw domainErrors.invalidState(
          'Only a service to order or a rejected one can be booked.',
        );
      }

      this.assertDuringStay(reservation, scheduledAt);
      // Przed wywołaniem partnera sprawdzamy kolizję z tym, co już wiemy (RB-10). (DamianTchorzewski_72206)
      this.assertNoConflict(
        reservation,
        item,
        scheduledAt,
        item.durationMinutes ?? 1,
      );

      return tx.partnerServiceBooking.update({
        where: { id: item.id },
        data: await this.bookAtPartner(reservation, item, scheduledAt),
      });
    });
  }

  cancel(
    reservationId: string,
    serviceId: string,
  ): Promise<PartnerServiceBooking> {
    return this.lock.run({ id: reservationId }, async (tx, reservation) => {
      const item = this.findItem(reservation, serviceId);
      if (item.status === ServiceStatus.CANCELLED) {
        return item;
      }
      this.assertOpen(reservation);

      return tx.partnerServiceBooking.update({
        where: { id: item.id },
        data: await this.dataAfterCancellation(item),
      });
    });
  }

  private async dataAfterCancellation(
    item: PartnerServiceBooking,
  ): Promise<Prisma.PartnerServiceBookingUpdateInput> {
    if (item.status === ServiceStatus.CONFIRMED) {
      return (await this.cancellation.cancelAtPartner(item))
        ? this.cancellation.dataAfterSingleCancellation(item)
        : { status: ServiceStatus.CANCEL_RETRY };
    }
    if (item.status === ServiceStatus.CANCEL_RETRY) {
      throw domainErrors.invalidState(
        'The cancellation is waiting on the retry list.',
      );
    }
    if (item.source === ServiceSource.PACKAGE) {
      throw domainErrors.invalidState(
        'A package service that is not booked cannot be removed.',
      );
    }
    return { status: ServiceStatus.CANCELLED };
  }

  private async bookAtPartner(
    reservation: ReservationWithRelations,
    item: PartnerServiceBooking,
    scheduledAt: Date,
  ): Promise<Prisma.PartnerServiceBookingUpdateInput> {
    const guest = reservation.guests[0];
    if (!guest) {
      throw domainErrors.invalidState('The reservation has no primary guest.');
    }

    let durationMinutes = item.durationMinutes;
    try {
      // Pozycje z pakietu nie mają czasu trwania, więc bierzemy go z katalogu partnera. (DamianTchorzewski_72206)
      durationMinutes ??=
        (
          await this.partners
            .forType(item.partnerType)
            .getServices(reservation.id)
        ).find((service) => service.id === item.partnerServiceId)
          ?.durationMinutes ?? null;
      if (durationMinutes === null) {
        return this.rejected(RejectionReason.PARTNER_ERROR);
      }
      this.assertNoConflict(reservation, item, scheduledAt, durationMinutes);

      const result = await this.partners.forType(item.partnerType).book({
        reservationId: reservation.id,
        reference: item.id,
        serviceId: item.partnerServiceId,
        startsAt: scheduledAt.toISOString(),
        hotelReservationNumber: reservation.number,
        voucherCode:
          item.source === ServiceSource.PACKAGE
            ? reservation.voucherCode
            : null,
        guest: {
          firstName: guest.firstName,
          lastName: guest.lastName,
          email: guest.email,
          phone: guest.phone,
        },
      });

      if (result.outcome === 'confirmed') {
        return {
          status: ServiceStatus.CONFIRMED,
          scheduledAt,
          durationMinutes,
          externalBookingId: result.externalBookingId,
          rejectionReason: null,
        };
      }
      return this.rejected(
        result.outcome === 'refused'
          ? RejectionReason.SLOT_TAKEN
          : RejectionReason.PARTNER_ERROR,
      );
    } catch (error) {
      if (error instanceof PartnerUnavailableError) {
        return this.rejected(RejectionReason.PARTNER_UNAVAILABLE);
      }
      throw error;
    }
  }

  // RB-13: odmowa dotyczy tylko pozycji planu, a pobyt zostaje bez zmian. (DamianTchorzewski_72206)
  private rejected(reason: RejectionReason) {
    return {
      status: ServiceStatus.REJECTED,
      rejectionReason: reason,
      scheduledAt: null,
      externalBookingId: null,
    };
  }

  private async findInCatalog(
    dto: AddServiceDto,
    reservationId: string,
  ): Promise<PartnerService | undefined> {
    try {
      const services = await this.partners
        .forType(dto.partnerType)
        .getServices(reservationId);
      return services.find((service) => service.id === dto.partnerServiceId);
    } catch (error) {
      if (error instanceof PartnerUnavailableError) {
        throw domainErrors.partnerUnavailable();
      }
      throw error;
    }
  }

  private findItem(
    reservation: ReservationWithRelations,
    serviceId: string,
  ): PartnerServiceBooking {
    const item = reservation.services.find(({ id }) => id === serviceId);
    if (!item) {
      throw domainErrors.notFound('The service does not exist.');
    }
    return item;
  }

  private assertOpen(reservation: ReservationWithRelations): void {
    if (!OPEN_STAY.includes(reservation.status)) {
      throw domainErrors.invalidState(
        'Services can be changed only in a confirmed or current stay.',
      );
    }
  }

  // RB-09: od dnia przyjazdu do dnia wyjazdu włącznie, według strefy hotelu. (DamianTchorzewski_72206)
  private assertDuringStay(
    reservation: ReservationWithRelations,
    scheduledAt: Date,
  ): void {
    const day = dateInHotel(scheduledAt);
    if (
      day < formatDateOnly(reservation.checkIn) ||
      day > formatDateOnly(reservation.checkOut)
    ) {
      throw domainErrors.serviceOutsideStay();
    }
  }

  // RB-10: usługi jednego pobytu nie mogą nakładać się w czasie. (DamianTchorzewski_72206)
  private assertNoConflict(
    reservation: ReservationWithRelations,
    item: PartnerServiceBooking,
    scheduledAt: Date,
    durationMinutes: number,
  ): void {
    const start = scheduledAt.getTime();
    const end = start + durationMinutes * MINUTE_IN_MS;
    const conflict = reservation.services.some((other) => {
      if (
        other.id === item.id ||
        other.status !== ServiceStatus.CONFIRMED ||
        other.scheduledAt === null
      ) {
        return false;
      }
      const otherStart = other.scheduledAt.getTime();
      const otherEnd = otherStart + (other.durationMinutes ?? 1) * MINUTE_IN_MS;
      return start < otherEnd && end > otherStart;
    });

    if (conflict) {
      throw domainErrors.serviceTimeConflict();
    }
  }
}
