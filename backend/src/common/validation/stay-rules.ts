import { nightsBetween, todayInHotel } from '../dates/date-utils.js';
import { domainErrors } from '../errors/domain-errors.js';
import type { ErrorDetailDto } from '../errors/error-response.dto.js';

export const MAX_NIGHTS = 30;

// RB-02: przyjazd nie wcześniej niż dziś, co najmniej jedna i najwyżej 30 nocy. (DamianTchorzewski_72206)
export function assertStayDates(
  checkIn: string,
  checkOut: string,
  today: string = todayInHotel(),
): void {
  const details: ErrorDetailDto[] = [];

  if (checkIn < today) {
    details.push({
      field: 'checkIn',
      message: 'checkIn must not be in the past',
    });
  }
  if (checkOut <= checkIn) {
    details.push({
      field: 'checkOut',
      message: 'checkOut must be later than checkIn',
    });
  } else if (nightsBetween(checkIn, checkOut) > MAX_NIGHTS) {
    details.push({
      field: 'checkOut',
      message: `the stay must not be longer than ${MAX_NIGHTS} nights`,
    });
  }

  if (details.length > 0) {
    throw domainErrors.invalidDates(details);
  }
}
