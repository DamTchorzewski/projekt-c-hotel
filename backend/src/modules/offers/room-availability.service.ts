import { Injectable } from '@nestjs/common';
import { parseDateOnly } from '../../common/dates/date-utils.js';
import {
  ReservationStatus,
  type Prisma,
  type Room,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

// Statusy, które blokują pokój (RB-01). (DamianTchorzewski_72206)
export const BLOCKING_STATUSES = [
  ReservationStatus.CONFIRMED,
  ReservationStatus.CHECKED_IN,
];

@Injectable()
export class RoomAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  // Aktywne pokoje wolne w całym okresie, od najniższego numeru (RB-01, RB-05, RB-06). (DamianTchorzewski_72206)
  findFreeRooms(
    checkIn: string,
    checkOut: string,
    where: Prisma.RoomWhereInput = {},
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<Room[]> {
    return client.room.findMany({
      where: {
        ...where,
        isActive: true,
        reservations: {
          none: {
            status: { in: BLOCKING_STATUSES },
            checkIn: { lt: parseDateOnly(checkOut) },
            checkOut: { gt: parseDateOnly(checkIn) },
          },
        },
      },
      orderBy: { roomNumber: 'asc' },
    });
  }
}
