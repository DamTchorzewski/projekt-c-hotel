import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiErrorCode } from '../../common/errors/api-error-code.enum.js';
import { ApiException } from '../../common/errors/api-exception.js';
import { SessionService } from './session.service.js';

// Wpuszcza tylko zalogowaną recepcję, w przeciwnym razie 401. (DamianTchorzewski_72206)
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (this.sessions.read(request) === null) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        ApiErrorCode.UNAUTHORIZED,
        'Reception session is required.',
      );
    }

    return true;
  }
}
