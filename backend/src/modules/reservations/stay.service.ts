import { Injectable } from '@nestjs/common';
import { formatDateOnly, todayInHotel } from '../../common/dates/date-utils.js';
import { domainErrors } from '../../common/errors/domain-errors.js';
import {
  ReservationStatus,
  VoucherStatus,
  type Prisma,
} from '../../generated/prisma/client.js';
import { PartnerUnavailableError } from '../partners/partner-client.service.js';
import { PartnerDAdapter } from '../partners/partner-d.adapter.js';
import { ReservationLock } from './reservation-lock.service.js';
import type { ReservationWithRelations } from './reservations.mapper.js';

type VoucherAnswer = 'yes' | 'no' | 'unavailable';

// Zameldowanie i wymeldowanie z obsługą vouchera (US-18, US-19, RB-14 - RB-16). (DamianTchorzewski_72206)
@Injectable()
export class StayService {
  constructor(
    private readonly lock: ReservationLock,
    private readonly vouchers: PartnerDAdapter,
  ) {}

  async checkIn(
    id: string,
    conditional: boolean,
  ): Promise<ReservationWithRelations> {
    const outcome = await this.lock.run({ id }, async (tx, reservation) => {
      if (reservation.status !== ReservationStatus.CONFIRMED) {
        throw domainErrors.invalidState(
          'Only a confirmed reservation can be checked in.',
        );
      }
      const today = todayInHotel();
      if (
        today < formatDateOnly(reservation.checkIn) ||
        today >= formatDateOnly(reservation.checkOut)
      ) {
        throw domainErrors.checkInNotAllowed();
      }

      if (
        reservation.voucherStatus === VoucherStatus.NONE ||
        reservation.voucherStatus === VoucherStatus.VERIFIED
      ) {
        return this.save(tx, id, { status: ReservationStatus.CHECKED_IN });
      }

      const answer = await this.verify(reservation);
      if (answer === 'yes') {
        return this.save(tx, id, {
          status: ReservationStatus.CHECKED_IN,
          voucherStatus: VoucherStatus.VERIFIED,
        });
      }
      if (answer === 'no') {
        // Status musi zostać zapisany, więc błąd zgłaszamy dopiero po zatwierdzeniu transakcji. (DamianTchorzewski_72206)
        await this.save(tx, id, { voucherStatus: VoucherStatus.INVALID });
        return 'invalid' as const;
      }
      // Zameldowanie warunkowe nie dotyczy vouchera, który D już odrzucił. (DamianTchorzewski_72206)
      if (
        conditional &&
        reservation.voucherStatus === VoucherStatus.PENDING_VERIFICATION
      ) {
        return this.save(tx, id, { status: ReservationStatus.CHECKED_IN });
      }
      return 'unavailable' as const;
    });

    if (outcome === 'invalid') {
      throw domainErrors.voucherInvalid();
    }
    if (outcome === 'unavailable') {
      throw domainErrors.partnerUnavailable();
    }
    return outcome;
  }

  // Niedostępność D nie blokuje wymeldowania (RB-16). (DamianTchorzewski_72206)
  checkOut(id: string): Promise<ReservationWithRelations> {
    return this.lock.run({ id }, async (tx, reservation) => {
      if (reservation.status !== ReservationStatus.CHECKED_IN) {
        throw domainErrors.invalidState(
          'Only a guest who is checked in can be checked out.',
        );
      }

      return this.save(tx, id, {
        status: ReservationStatus.COMPLETED,
        voucherStatus: await this.voucherAfterCheckOut(reservation),
      });
    });
  }

  async retryVerification(
    tx: Prisma.TransactionClient,
    reservation: ReservationWithRelations,
  ): Promise<ReservationWithRelations> {
    const answer = await this.verify(reservation);
    if (answer === 'unavailable') {
      return reservation;
    }
    return this.save(tx, reservation.id, {
      voucherStatus:
        answer === 'yes' ? VoucherStatus.VERIFIED : VoucherStatus.INVALID,
    });
  }

  // D sam odrzuca nieważny voucher, a powtórzone potwierdzenie nic u niego nie zmienia. (DamianTchorzewski_72206)
  async retrySettlement(
    tx: Prisma.TransactionClient,
    reservation: ReservationWithRelations,
  ): Promise<ReservationWithRelations> {
    const answer = await this.settle(reservation);
    if (answer === 'unavailable') {
      return reservation;
    }
    return this.save(tx, reservation.id, {
      voucherStatus:
        answer === 'yes' ? VoucherStatus.SETTLED : VoucherStatus.INVALID,
    });
  }

  private async voucherAfterCheckOut(
    reservation: ReservationWithRelations,
  ): Promise<VoucherStatus> {
    let status: VoucherStatus = reservation.voucherStatus;

    if (status === VoucherStatus.PENDING_VERIFICATION) {
      const answer = await this.verify(reservation);
      if (answer === 'unavailable') {
        return VoucherStatus.SETTLEMENT_RETRY;
      }
      status =
        answer === 'yes' ? VoucherStatus.VERIFIED : VoucherStatus.INVALID;
    }
    if (status !== VoucherStatus.VERIFIED) {
      return status;
    }

    const answer = await this.settle(reservation);
    if (answer === 'unavailable') {
      return VoucherStatus.SETTLEMENT_RETRY;
    }
    return answer === 'yes' ? VoucherStatus.SETTLED : VoucherStatus.INVALID;
  }

  private verify(
    reservation: ReservationWithRelations,
  ): Promise<VoucherAnswer> {
    return this.ask(reservation, (request) => this.vouchers.verify(request));
  }

  private settle(
    reservation: ReservationWithRelations,
  ): Promise<VoucherAnswer> {
    return this.ask(reservation, (request) => this.vouchers.settle(request));
  }

  private async ask(
    reservation: ReservationWithRelations,
    call: (
      request: Parameters<PartnerDAdapter['verify']>[0],
    ) => Promise<boolean>,
  ): Promise<VoucherAnswer> {
    try {
      const accepted = await call({
        reservationId: reservation.id,
        voucherCode: reservation.voucherCode ?? '',
        hotelReservationNumber: reservation.number,
      });
      return accepted ? 'yes' : 'no';
    } catch (error) {
      if (error instanceof PartnerUnavailableError) {
        return 'unavailable';
      }
      throw error;
    }
  }

  private async save(
    tx: Prisma.TransactionClient,
    id: string,
    data: Prisma.ReservationUpdateInput,
  ): Promise<ReservationWithRelations> {
    await tx.reservation.update({ where: { id }, data });
    return this.lock.reload(tx, id);
  }
}
