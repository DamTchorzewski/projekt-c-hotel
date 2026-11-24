import { HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from './api-error-code.enum.js';
import { ApiException } from './api-exception.js';
import type { ErrorDetailDto } from './error-response.dto.js';

// Błędy reguł biznesowych w jednym miejscu, aby każdy kanał zwracał ten sam kod i status. (DamianTchorzewski_72206)
export const domainErrors = {
  // RB-02 (DamianTchorzewski_72206)
  invalidDates: (details: ErrorDetailDto[]) =>
    new ApiException(
      HttpStatus.BAD_REQUEST,
      ApiErrorCode.INVALID_DATES,
      'The stay dates are invalid.',
      details,
    ),

  // RB-03 (DamianTchorzewski_72206)
  capacityExceeded: (maxCapacity: number) =>
    new ApiException(
      HttpStatus.BAD_REQUEST,
      ApiErrorCode.CAPACITY_EXCEEDED,
      `The selected room type accommodates at most ${maxCapacity} guests.`,
      [
        {
          field: 'guestsCount',
          message: `guestsCount must not be greater than ${maxCapacity}`,
        },
      ],
    ),

  // RB-01 (DamianTchorzewski_72206)
  roomNotAvailable: () =>
    new ApiException(
      HttpStatus.CONFLICT,
      ApiErrorCode.ROOM_NOT_AVAILABLE,
      'No room is available for the selected dates.',
    ),

  // RB-07, RB-08, RB-21 (DamianTchorzewski_72206)
  invalidState: (message: string) =>
    new ApiException(HttpStatus.CONFLICT, ApiErrorCode.INVALID_STATE, message),

  notFound: (message: string) =>
    new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, message),
};
