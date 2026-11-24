import { toMoney } from '../../common/pricing/stay-pricing.js';
import type { Plain } from '../../common/types/plain.js';
import type { RoomType } from '../../generated/prisma/client.js';
import type { RoomTypeDto } from './dto/offer.dto.js';

export const CURRENCY = 'PLN';

export function toRoomTypeDto(type: RoomType): Plain<RoomTypeDto> {
  return {
    code: type.code,
    name: type.name,
    description: type.description,
    maxCapacity: type.maxCapacity,
    amenities: type.amenities,
    pricePerNight: toMoney(type.basePricePerNight),
    currency: CURRENCY,
    imageUrl: type.imageUrl,
  };
}
