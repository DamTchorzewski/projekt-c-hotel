import {
  formatDateOnly,
  nightsBetween,
} from '../../common/dates/date-utils.js';
import { toMoney } from '../../common/pricing/stay-pricing.js';
import type { Plain } from '../../common/types/plain.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { CURRENCY } from '../offers/offers.mapper.js';
import type {
  ReservationConfirmationDto,
  ReservationDto,
} from './dto/reservation.dto.js';

export const RESERVATION_INCLUDE = {
  room: { include: { roomType: true } },
  guests: { where: { isPrimary: true } },
  services: { orderBy: { scheduledAt: { sort: 'asc', nulls: 'last' } } },
} satisfies Prisma.ReservationInclude;

export type ReservationWithRelations = Prisma.ReservationGetPayload<{
  include: typeof RESERVATION_INCLUDE;
}>;

export function toConfirmationDto(
  reservation: ReservationWithRelations,
): Plain<ReservationConfirmationDto> {
  const checkIn = formatDateOnly(reservation.checkIn);
  const checkOut = formatDateOnly(reservation.checkOut);

  return {
    number: reservation.number,
    status: reservation.status,
    roomTypeCode: reservation.room.roomType.code,
    roomTypeName: reservation.room.roomType.name,
    roomNumber: reservation.room.roomNumber,
    checkIn,
    checkOut,
    nights: nightsBetween(checkIn, checkOut),
    guestsCount: reservation.guestsCount,
    totalPrice: toMoney(reservation.totalPrice),
    currency: CURRENCY,
  };
}

export function toReservationDto(
  reservation: ReservationWithRelations,
): ReservationDto {
  const guest = reservation.guests[0];

  return {
    ...toConfirmationDto(reservation),
    id: reservation.id,
    source: reservation.source,
    voucherStatus: reservation.voucherStatus,
    voucherCode: reservation.voucherCode,
    notes: reservation.notes,
    guest: guest
      ? {
          firstName: guest.firstName,
          lastName: guest.lastName,
          email: guest.email,
          phone: guest.phone,
        }
      : null,
    services: reservation.services.map((service) => ({
      id: service.id,
      partnerType: service.partnerType,
      source: service.source,
      serviceName: service.serviceName,
      price: service.price === null ? null : toMoney(service.price),
      scheduledAt: service.scheduledAt?.toISOString() ?? null,
      durationMinutes: service.durationMinutes,
      status: service.status,
      rejectionReason: service.rejectionReason,
    })),
  };
}
