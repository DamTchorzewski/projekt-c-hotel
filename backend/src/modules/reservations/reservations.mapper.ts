import {
  formatDateOnly,
  nightsBetween,
} from '../../common/dates/date-utils.js';
import { toMoney } from '../../common/pricing/stay-pricing.js';
import type { Plain } from '../../common/types/plain.js';
import type {
  PartnerServiceBooking,
  Prisma,
} from '../../generated/prisma/client.js';
import { CURRENCY } from '../offers/offers.mapper.js';
import type { ExternalReservationDto } from './dto/external-reservation.dto.js';
import type {
  PortalReservationDto,
  ReservationConfirmationDto,
  ReservationDto,
  StayServiceDto,
} from './dto/reservation.dto.js';

export const RESERVATION_INCLUDE = {
  room: { include: { roomType: true } },
  guests: { where: { isPrimary: true } },
  services: {
    orderBy: [
      { scheduledAt: { sort: 'asc', nulls: 'last' } },
      { serviceName: 'asc' },
      { id: 'asc' },
    ],
  },
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

export function toStayServiceDto(
  service: PartnerServiceBooking,
): Plain<StayServiceDto> {
  return {
    id: service.id,
    partnerType: service.partnerType,
    source: service.source,
    partnerServiceId: service.partnerServiceId,
    serviceName: service.serviceName,
    price: service.price === null ? null : toMoney(service.price),
    scheduledAt: service.scheduledAt?.toISOString() ?? null,
    durationMinutes: service.durationMinutes,
    status: service.status,
    rejectionReason: service.rejectionReason,
  };
}

export function toPortalReservationDto(
  reservation: ReservationWithRelations,
): Plain<PortalReservationDto> {
  return {
    ...toConfirmationDto(reservation),
    services: reservation.services.map(toStayServiceDto),
  };
}

export function toExternalReservationDto(
  reservation: ReservationWithRelations,
): Plain<ExternalReservationDto> {
  const guest = reservation.guests[0];

  return {
    ...toPortalReservationDto(reservation),
    id: reservation.id,
    source: reservation.source,
    voucherStatus: reservation.voucherStatus,
    voucherCode: reservation.voucherCode,
    guest: guest
      ? {
          firstName: guest.firstName,
          lastName: guest.lastName,
          email: guest.email,
          phone: guest.phone,
        }
      : null,
  };
}

export function toReservationDto(
  reservation: ReservationWithRelations,
): Plain<ReservationDto> {
  return {
    ...toExternalReservationDto(reservation),
    notes: reservation.notes,
  };
}
