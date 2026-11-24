import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ApiException } from '../../common/errors/api-exception.js';
import { isUniqueViolation } from '../../common/errors/database-errors.js';
import { domainErrors } from '../../common/errors/domain-errors.js';
import { ReservationSource } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BLOCKING_STATUSES } from '../offers/room-availability.service.js';
import type { CreateExternalReservationDto } from './dto/external-reservation.dto.js';
import {
  RESERVATION_INCLUDE,
  type ReservationWithRelations,
} from './reservations.mapper.js';
import { ReservationsService } from './reservations.service.js';

const KEY_PATTERN = /^[\x21-\x7e]{1,200}$/;

// Kolejność pól w JSON nie ma znaczenia dla treści żądania. (DamianTchorzewski_72206)
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

export interface ExternalCreateResult {
  created: boolean;
  reservation: ReservationWithRelations;
}

// Rezerwacja z voucherem przez API Systemu D (US-22, RB-11, RB-17, RB-18). (DamianTchorzewski_72206)
@Injectable()
export class ExternalReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationsService,
  ) {}

  async create(
    dto: CreateExternalReservationDto,
    key: string | undefined,
  ): Promise<ExternalCreateResult> {
    if (!key || !KEY_PATTERN.test(key)) {
      throw ApiException.validation([
        {
          field: 'Idempotency-Key',
          message:
            'the Idempotency-Key header is required, up to 200 characters',
        },
      ]);
    }
    if (!dto.voucherCode) {
      throw domainErrors.voucherRequired();
    }

    const hash = createHash('sha256')
      .update(JSON.stringify(canonical(dto)))
      .digest('hex');
    const repeated = await this.findRepeated(key, hash);
    if (repeated) {
      return { created: false, reservation: repeated };
    }
    await this.assertVoucherFree(dto.voucherCode);

    try {
      const reservation = await this.reservations.create(
        dto,
        ReservationSource.PARTNER_D,
        {
          voucherCode: dto.voucherCode,
          idempotencyKey: key,
          idempotencyHash: hash,
          packageServices: dto.packageServices ?? [],
        },
      );
      return { created: true, reservation };
    } catch (error) {
      // Równoległe powtórzenie: pierwsze żądanie mogło właśnie zapisać rezerwację, a drugie zobaczyć zajęty klucz, voucher lub pokój. (DamianTchorzewski_72206)
      if (
        isUniqueViolation(error, 'idempotency_key') ||
        error instanceof ApiException
      ) {
        const existing = await this.findRepeated(key, hash);
        if (existing) {
          return { created: false, reservation: existing };
        }
      }
      throw error;
    }
  }

  private async findRepeated(
    key: string,
    hash: string,
  ): Promise<ReservationWithRelations | null> {
    const existing = await this.prisma.reservation.findUnique({
      where: { idempotencyKey: key },
      include: RESERVATION_INCLUDE,
    });
    if (existing && existing.idempotencyHash !== hash) {
      throw domainErrors.idempotencyConflict();
    }
    return existing;
  }

  private async assertVoucherFree(voucherCode: string): Promise<void> {
    const active = await this.prisma.reservation.findFirst({
      where: { voucherCode, status: { in: BLOCKING_STATUSES } },
      select: { id: true },
    });
    if (active) {
      throw domainErrors.voucherAlreadyUsed();
    }
  }
}
