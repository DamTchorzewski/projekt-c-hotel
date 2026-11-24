import { HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from './api-error-code.enum.js';
import { ApiException } from './api-exception.js';
import type { ErrorDetailDto } from './error-response.dto.js';

function conflict(
  code: ApiErrorCode,
  message: string,
  details: ErrorDetailDto[] = [],
): ApiException {
  return new ApiException(HttpStatus.CONFLICT, code, message, details);
}

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
    conflict(
      ApiErrorCode.ROOM_NOT_AVAILABLE,
      'No room is available for the selected dates.',
    ),

  // RB-07, RB-08, RB-21 (DamianTchorzewski_72206)
  invalidState: (message: string) =>
    conflict(ApiErrorCode.INVALID_STATE, message),

  // RB-07 (DamianTchorzewski_72206)
  servicesOutsideStay: (details: ErrorDetailDto[]) =>
    conflict(
      ApiErrorCode.SERVICES_OUTSIDE_STAY,
      'Confirmed services do not fit in the new dates. Cancel or move them first.',
      details,
    ),

  // RB-09 (DamianTchorzewski_72206)
  serviceOutsideStay: () =>
    conflict(
      ApiErrorCode.SERVICE_OUTSIDE_STAY,
      'The service must take place during the stay.',
    ),

  // RB-10 (DamianTchorzewski_72206)
  serviceTimeConflict: () =>
    conflict(
      ApiErrorCode.SERVICE_TIME_CONFLICT,
      'The guest has another service at this time.',
    ),

  // RB-14 (DamianTchorzewski_72206)
  checkInNotAllowed: () =>
    conflict(
      ApiErrorCode.CHECK_IN_NOT_ALLOWED,
      'Check-in is possible from the arrival day to the day before departure. Change the reservation first.',
    ),

  // RB-15 (DamianTchorzewski_72206)
  voucherInvalid: () =>
    new ApiException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ApiErrorCode.VOUCHER_INVALID,
      'The voucher is not valid.',
    ),

  voucherRequired: () =>
    new ApiException(
      HttpStatus.BAD_REQUEST,
      ApiErrorCode.VOUCHER_REQUIRED,
      'voucherCode is required.',
      [{ field: 'voucherCode', message: 'voucherCode should not be empty' }],
    ),

  // RB-18 (DamianTchorzewski_72206)
  voucherAlreadyUsed: () =>
    conflict(
      ApiErrorCode.VOUCHER_ALREADY_USED,
      'The voucher is assigned to another active reservation.',
    ),

  // RB-17 (DamianTchorzewski_72206)
  idempotencyConflict: () =>
    conflict(
      ApiErrorCode.IDEMPOTENCY_CONFLICT,
      'The Idempotency-Key was used with a different request.',
    ),

  // RB-20 (DamianTchorzewski_72206)
  partnerUnavailable: () =>
    new ApiException(
      HttpStatus.SERVICE_UNAVAILABLE,
      ApiErrorCode.PARTNER_UNAVAILABLE,
      'The partner system is temporarily unavailable.',
    ),

  notFound: (message: string) =>
    new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, message),

  reservationNotFound: () =>
    new ApiException(
      HttpStatus.NOT_FOUND,
      ApiErrorCode.NOT_FOUND,
      'The reservation does not exist.',
    ),
};
