import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ApiErrorCode } from '../errors/api-error-code.enum.js';
import { ApiException } from '../errors/api-exception.js';
import type { IntegrationRequest } from './api-key.guard.js';

// Nazwa klienta w INTEGRATION_API_KEYS, który może rezerwować pobyty. (DamianTchorzewski_72206)
export const VOUCHER_CLIENT = 'partner-d';

// Klucze innych systemów dają dostęp tylko do oferty i dostępności (RB-19). (DamianTchorzewski_72206)
@Injectable()
export class ReservationsClientGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<IntegrationRequest>();

    if (request.integrationClient !== VOUCHER_CLIENT) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        ApiErrorCode.FORBIDDEN,
        'This API key does not give access to reservations.',
      );
    }

    return true;
  }
}
