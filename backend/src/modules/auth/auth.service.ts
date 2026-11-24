import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare, hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { ApiErrorCode } from '../../common/errors/api-error-code.enum.js';
import { ApiException } from '../../common/errors/api-exception.js';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { SessionService } from './session.service.js';

// Bcrypt bierze pod uwagę tylko pierwsze 72 bajty hasła. (DamianTchorzewski_72206)
const MAX_PASSWORD_BYTES = 72;

@Injectable()
export class AuthService {
  // Skrót losowego hasła: porównanie z nim trwa tyle samo, więc czas odpowiedzi nie zdradza, czy login istnieje. (DamianTchorzewski_72206)
  private readonly dummyHash = hash(randomBytes(16).toString('hex'), 10);

  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly sessions: SessionService,
  ) {}

  async login(login: string, password: string): Promise<string> {
    const expectedLogin = this.config.get('RECEPTION_LOGIN', { infer: true });
    const expectedHash = this.config.get('RECEPTION_PASSWORD_HASH', {
      infer: true,
    });

    const passwordMatches = await compare(
      password,
      expectedHash ?? (await this.dummyHash),
    );
    const valid =
      expectedLogin !== undefined &&
      expectedHash !== undefined &&
      login === expectedLogin &&
      Buffer.byteLength(password) <= MAX_PASSWORD_BYTES &&
      passwordMatches;

    if (!valid) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        ApiErrorCode.UNAUTHORIZED,
        'Invalid login or password.',
      );
    }

    return this.sessions.issue(login);
  }
}
