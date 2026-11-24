import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { randomBytes } from 'node:crypto';
import { SESSION_COOKIE } from '../../common/constants/api.constants.js';
import type { EnvironmentVariables } from '../../config/env.validation.js';

export const SESSION_HOURS = 8;

// Wydaje i sprawdza sesję recepcji (JWT w ciasteczku HttpOnly, ważny 8 godzin). (DamianTchorzewski_72206)
@Injectable()
export class SessionService {
  private readonly secret: string;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.secret =
      config.get('SESSION_SECRET', { infer: true }) ??
      randomBytes(32).toString('hex');
  }

  issue(login: string): string {
    return this.jwt.sign(
      { sub: login },
      {
        secret: this.secret,
        algorithm: 'HS256',
        expiresIn: `${SESSION_HOURS}h`,
      },
    );
  }

  // Zwraca login z poprawnej sesji albo null. (DamianTchorzewski_72206)
  read(request: Request): string | null {
    const token = this.tokenFrom(request.headers.cookie);
    if (!token) {
      return null;
    }

    try {
      const payload = this.jwt.verify<{ sub?: unknown }>(token, {
        secret: this.secret,
        algorithms: ['HS256'],
      });
      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  }

  private tokenFrom(header: string | undefined): string | null {
    const prefix = `${SESSION_COOKIE}=`;
    const entry = (header ?? '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix));

    return entry ? entry.slice(prefix.length) : null;
  }
}
