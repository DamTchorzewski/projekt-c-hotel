import { Injectable } from '@nestjs/common';
import {
  formatDateOnly,
  parseDateOnly,
  todayInHotel,
} from '../../common/dates/date-utils.js';
import { domainErrors } from '../../common/errors/domain-errors.js';
import {
  ReservationSource,
  ReservationStatus,
  type Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  ReservationsQueryDto,
  ReservationsResponseDto,
} from './dto/reservation-query.dto.js';
import {
  RESERVATION_INCLUDE,
  type ReservationWithRelations,
} from './reservations.mapper.js';

// Znaki specjalne LIKE wpisane w wyszukiwarkę mają być zwykłym tekstem. (DamianTchorzewski_72206)
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

@Injectable()
export class ReservationsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ReservationsQueryDto): Promise<ReservationsResponseDto> {
    const where = this.toWhere(query);
    const [total, reservations] = await Promise.all([
      this.prisma.reservation.count({ where }),
      this.prisma.reservation.findMany({
        where,
        include: {
          room: { include: { roomType: true } },
          guests: { where: { isPrimary: true } },
        },
        orderBy: [{ checkIn: 'asc' }, { number: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: reservations.map((reservation) => {
        const guest = reservation.guests[0];
        return {
          id: reservation.id,
          number: reservation.number,
          guestName: guest ? `${guest.firstName} ${guest.lastName}` : '',
          roomNumber: reservation.room.roomNumber,
          roomTypeCode: reservation.room.roomType.code,
          checkIn: formatDateOnly(reservation.checkIn),
          checkOut: formatDateOnly(reservation.checkOut),
          status: reservation.status,
          source: reservation.source,
          voucherStatus: reservation.voucherStatus,
        };
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findOne(
    where: Prisma.ReservationWhereUniqueInput,
  ): Promise<ReservationWithRelations> {
    const reservation = await this.prisma.reservation.findUnique({
      where,
      include: RESERVATION_INCLUDE,
    });
    if (!reservation) {
      throw domainErrors.reservationNotFound();
    }
    return reservation;
  }

  // RB-19: rezerwacja innego kanału wygląda dla Systemu D tak samo jak nieistniejąca. (DamianTchorzewski_72206)
  findForPartner(id: string): Promise<ReservationWithRelations> {
    return this.findOne({ id, source: ReservationSource.PARTNER_D });
  }

  // Zły numer i zły e-mail dają identyczną odpowiedź. E-mail porównujemy w aplikacji, bo ILIKE traktuje "_" jak symbol wieloznaczny. (DamianTchorzewski_72206)
  async findForGuest(
    number: string,
    email: string,
  ): Promise<ReservationWithRelations> {
    const reservation = await this.findOne({ number });
    if (
      reservation.guests[0]?.email.toLowerCase() !== email.trim().toLowerCase()
    ) {
      throw domainErrors.reservationNotFound();
    }
    return reservation;
  }

  private toWhere(query: ReservationsQueryDto): Prisma.ReservationWhereInput {
    const { q, from, to, status, source } = query;

    // Widok domyślny recepcji: dzisiejsze przyjazdy i wyjazdy (US-11). (DamianTchorzewski_72206)
    if (!q && !from && !to && !status && !source) {
      const today = parseDateOnly(todayInHotel());
      return {
        status: { not: ReservationStatus.CANCELLED },
        OR: [{ checkIn: today }, { checkOut: today }],
      };
    }

    const text = q ? escapeLike(q) : '';
    return {
      ...(text
        ? {
            OR: [
              { number: { contains: text, mode: 'insensitive' } },
              {
                guests: {
                  some: {
                    isPrimary: true,
                    lastName: { contains: text, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
      ...(from ? { checkOut: { gte: parseDateOnly(from) } } : {}),
      ...(to ? { checkIn: { lte: parseDateOnly(to) } } : {}),
      ...(status ? { status } : {}),
      ...(source ? { source } : {}),
    };
  }
}
