import { Injectable } from '@nestjs/common';
import {
  formatDateOnly,
  parseDateOnly,
  todayInHotel,
} from '../../common/dates/date-utils.js';
import { toMoney } from '../../common/pricing/stay-pricing.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CURRENCY } from '../offers/offers.mapper.js';
import { BLOCKING_STATUSES } from '../offers/room-availability.service.js';
import {
  RoomStatus,
  type RoomDto,
  type RoomsQueryDto,
  type RoomsResponseDto,
} from './dto/room.dto.js';

// Ewidencja pokoi z dzisiejszym statusem, tylko do odczytu (US-01). (DamianTchorzewski_72206)
@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: RoomsQueryDto,
    today: string = todayInHotel(),
  ): Promise<RoomsResponseDto> {
    const rooms = await this.prisma.room.findMany({
      where: query.type ? { roomType: { code: query.type } } : {},
      include: {
        roomType: true,
        reservations: {
          where: {
            status: { in: BLOCKING_STATUSES },
            checkOut: { gt: parseDateOnly(today) },
          },
          orderBy: { checkIn: 'asc' },
        },
      },
      orderBy: { roomNumber: 'asc' },
    });

    const items = rooms.map((room): RoomDto => {
      const reservations = room.reservations.map((reservation) => ({
        number: reservation.number,
        checkIn: formatDateOnly(reservation.checkIn),
        checkOut: formatDateOnly(reservation.checkOut),
        status: reservation.status,
      }));
      const current = reservations.find((item) => item.checkIn <= today);

      let status = RoomStatus.FREE;
      if (!room.isActive) {
        status = RoomStatus.DISABLED;
      } else if (current) {
        status = RoomStatus.OCCUPIED;
      }

      return {
        id: room.id,
        roomNumber: room.roomNumber,
        typeCode: room.roomType.code,
        typeName: room.roomType.name,
        maxCapacity: room.roomType.maxCapacity,
        pricePerNight: toMoney(room.roomType.basePricePerNight),
        currency: CURRENCY,
        amenities: room.roomType.amenities,
        status,
        currentReservationNumber: current?.number ?? null,
        upcomingReservations: reservations.filter(
          (item) => item.checkIn > today,
        ),
      };
    });

    return {
      items: query.status
        ? items.filter((item) => item.status === query.status)
        : items,
    };
  }
}
