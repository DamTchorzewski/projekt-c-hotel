import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NodeEnvironment,
  type EnvironmentVariables,
} from '../../config/env.validation.js';
import type { Partner } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

// RB-20: każde wywołanie partnera ma limit 5 sekund. (DamianTchorzewski_72206)
export const PARTNER_TIMEOUT_MS = 5_000;

// Partner nie odpowiedział, odpowiedział błędem 5xx albo odpowiedzią niezgodną z kontraktem. (DamianTchorzewski_72206)
export class PartnerUnavailableError extends Error {}

export interface PartnerRequest {
  method: 'GET' | 'POST';
  // Ścieżka do logów bez danych osobowych i kodów, np. "/services/{id}/slots". (DamianTchorzewski_72206)
  endpoint: string;
  path: string;
  body?: unknown;
  reservationId?: string;
}

export interface PartnerResponse {
  status: number;
  body: unknown;
}

// Jedyne miejsce, które wysyła żądania do partnerów: limit czasu i wpis w integration_logs dla każdego wywołania. (DamianTchorzewski_72206)
@Injectable()
export class PartnerClient {
  private readonly logger = new Logger(PartnerClient.name);

  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly prisma: PrismaService,
  ) {}

  async send(
    partner: Partner,
    request: PartnerRequest,
  ): Promise<PartnerResponse> {
    const startedAt = Date.now();
    let httpStatus: number | null = null;

    try {
      const response = await fetch(`${this.baseUrl(partner)}${request.path}`, {
        method: request.method,
        headers: this.headers(partner),
        body:
          request.body === undefined ? undefined : JSON.stringify(request.body),
        redirect: 'error',
        signal: AbortSignal.timeout(PARTNER_TIMEOUT_MS),
      });
      httpStatus = response.status;
      const text = await response.text();

      if (response.status >= 500) {
        throw new PartnerUnavailableError(`HTTP ${response.status}`);
      }
      const body = this.parse(text, response.ok);
      await this.log(partner, request, startedAt, httpStatus, null);
      return { status: response.status, body };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.log(partner, request, startedAt, httpStatus, message);
      throw new PartnerUnavailableError(message);
    }
  }

  private parse(text: string, required: boolean): unknown {
    if (text === '') {
      return null;
    }
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      if (required) {
        throw error;
      }
      return null;
    }
  }

  private baseUrl(partner: Partner): string {
    if (this.usesMocks()) {
      const url = this.config.get('PARTNER_MOCKS_URL', { infer: true });
      return `${url}/${partner.toLowerCase()}`;
    }
    const url = this.config.get(`PARTNER_${partner}_URL` as const, {
      infer: true,
    });
    if (!url) {
      throw new PartnerUnavailableError('The partner URL is not configured.');
    }
    return url.replace(/\/+$/, '');
  }

  private headers(partner: Partner): Record<string, string> {
    const key = this.config.get(`PARTNER_${partner}_API_KEY` as const, {
      infer: true,
    });
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(key && !this.usesMocks() ? { 'X-API-Key': key } : {}),
    };
  }

  private usesMocks(): boolean {
    return (
      this.config.get('USE_PARTNER_MOCKS', { infer: true }) ??
      this.config.get('NODE_ENV', { infer: true }) !==
        NodeEnvironment.Production
    );
  }

  // Błąd zapisu logu nie może zmienić wyniku operacji biznesowej. (DamianTchorzewski_72206)
  private async log(
    partner: Partner,
    request: PartnerRequest,
    startedAt: number,
    httpStatus: number | null,
    errorMessage: string | null,
  ): Promise<void> {
    try {
      await this.prisma.integrationLog.create({
        data: {
          partner,
          endpoint: `${request.method} ${request.endpoint}`,
          reservationId: request.reservationId ?? null,
          httpStatus,
          latencyMs: Date.now() - startedAt,
          errorMessage: errorMessage?.slice(0, 500) ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        'Could not save an integration log.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
