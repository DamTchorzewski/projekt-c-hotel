import { Injectable } from '@nestjs/common';
import { nightsBetween } from '../../common/dates/date-utils.js';
import { calculateTotalPrice } from '../../common/pricing/stay-pricing.js';
import { assertStayDates } from '../../common/validation/stay-rules.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  AvailabilityQueryDto,
  AvailabilityResponseDto,
} from './dto/availability.dto.js';
import type { OffersResponseDto } from './dto/offer.dto.js';
import { toRoomTypeDto } from './offers.mapper.js';
import { RoomAvailabilityService } from './room-availability.service.js';

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: RoomAvailabilityService,
  ) {}

  async findOffers(): Promise<OffersResponseDto> {
    const types = await this.prisma.roomType.findMany({
      orderBy: { basePricePerNight: 'asc' },
    });

    return { items: types.map(toRoomTypeDto) };
  }

  // Zbyt duża liczba osób nie jest błędem wyszukiwania: wynikiem jest pusta lista (RB-03, UAT-05). (DamianTchorzewski_72206)
  async findAvailability(
    query: AvailabilityQueryDto,
    options: { withRoomNumbers: boolean },
  ): Promise<AvailabilityResponseDto> {
    assertStayDates(query.checkIn, query.checkOut);

    const nights = nightsBetween(query.checkIn, query.checkOut);
    const [types, rooms] = await Promise.all([
      this.prisma.roomType.findMany({
        orderBy: { basePricePerNight: 'asc' },
      }),
      this.availability.findFreeRooms(query.checkIn, query.checkOut),
    ]);

    const items = types
      .filter((type) => type.maxCapacity >= query.guests)
      .map((type) => {
        const roomNumbers = rooms
          .filter((room) => room.roomTypeId === type.id)
          .map((room) => room.roomNumber);

        return {
          ...toRoomTypeDto(type),
          totalPrice: calculateTotalPrice(type.basePricePerNight, nights),
          availableRooms: roomNumbers.length,
          ...(options.withRoomNumbers ? { roomNumbers } : {}),
        };
      })
      .filter((item) => item.availableRooms > 0);

    return {
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      guests: query.guests,
      nights,
      items,
    };
  }
}
