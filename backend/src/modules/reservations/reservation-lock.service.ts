import { Injectable } from '@nestjs/common';
import { domainErrors } from '../../common/errors/domain-errors.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  RESERVATION_INCLUDE,
  type ReservationWithRelations,
} from './reservations.mapper.js';

// Operacja może czekać na odpowiedzi partnerów (do 5 s każda, najwyżej trzy po kolei). (DamianTchorzewski_72206)
const TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 25_000 };

// Wykonuje operacje na jednej rezerwacji po kolei, więc np. anulowanie nie minie się z rezerwacją usługi. (DamianTchorzewski_72206)
// Blokada NO KEY UPDATE nie wstrzymuje zapisu integration_logs, które odwołują się do rezerwacji. (DamianTchorzewski_72206)
@Injectable()
export class ReservationLock {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(
    where: Prisma.ReservationWhereUniqueInput,
    operation: (
      tx: Prisma.TransactionClient,
      reservation: ReservationWithRelations,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.reservation.findUnique({
        where,
        select: { id: true },
      });
      if (!found) {
        throw domainErrors.reservationNotFound();
      }

      await tx.$queryRaw`SELECT 1 FROM "reservations" WHERE "id" = ${found.id}::uuid FOR NO KEY UPDATE`;
      const reservation = await tx.reservation.findUniqueOrThrow({
        where: { id: found.id },
        include: RESERVATION_INCLUDE,
      });

      return operation(tx, reservation);
    }, TRANSACTION_OPTIONS);
  }

  reload(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<ReservationWithRelations> {
    return tx.reservation.findUniqueOrThrow({
      where: { id },
      include: RESERVATION_INCLUDE,
    });
  }
}
