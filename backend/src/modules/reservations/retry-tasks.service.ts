import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { domainErrors } from '../../common/errors/domain-errors.js';
import {
  PartnerType,
  ReservationStatus,
  ServiceStatus,
  VoucherStatus,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  RetryTaskType,
  type RetryResultDto,
  type RetryTaskDto,
  type RetryTasksResponseDto,
} from './dto/retry-task.dto.js';
import { ReservationLock } from './reservation-lock.service.js';
import { ServiceCancellation } from './service-cancellation.service.js';
import { StayService } from './stay.service.js';

// Lista "Do ponowienia": operacje przerwane niedostępnością partnera (US-20). (DamianTchorzewski_72206)
@Injectable()
export class RetryTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: ReservationLock,
    private readonly cancellation: ServiceCancellation,
    private readonly stay: StayService,
  ) {}

  async findAll(): Promise<RetryTasksResponseDto> {
    const [services, moved, reservations] = await Promise.all([
      this.prisma.partnerServiceBooking.findMany({
        where: { status: ServiceStatus.CANCEL_RETRY },
        include: { reservation: true },
        orderBy: { updatedAt: 'asc' },
      }),
      this.prisma.partnerServiceBooking.findMany({
        where: { previousExternalBookingId: { not: null } },
        include: { reservation: true },
        orderBy: { updatedAt: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: {
          OR: [
            { voucherStatus: VoucherStatus.SETTLEMENT_RETRY },
            {
              voucherStatus: VoucherStatus.PENDING_VERIFICATION,
              status: ReservationStatus.CHECKED_IN,
            },
          ],
        },
        orderBy: { updatedAt: 'asc' },
      }),
    ]);

    return {
      items: [
        ...[
          ...services.map((service) => ({ kind: 'service', service })),
          ...moved.map((service) => ({ kind: 'moved', service })),
        ].map(({ kind, service }): RetryTaskDto => ({
          id: `${kind}:${service.id}`,
          type: RetryTaskType.CANCEL_SERVICE,
          partner: service.partnerType === PartnerType.MASSAGE_A ? 'A' : 'B',
          reservationId: service.reservationId,
          reservationNumber: service.reservation.number,
          description: service.serviceName,
          status: service.status,
        })),
        ...reservations.map((reservation): RetryTaskDto => ({
          id: `voucher:${reservation.id}`,
          type:
            reservation.voucherStatus === VoucherStatus.SETTLEMENT_RETRY
              ? RetryTaskType.SETTLE_VOUCHER
              : RetryTaskType.VERIFY_VOUCHER,
          partner: 'D',
          reservationId: reservation.id,
          reservationNumber: reservation.number,
          description: reservation.voucherCode ?? '',
          status: reservation.voucherStatus,
        })),
      ],
    };
  }

  async retry(taskId: string): Promise<RetryResultDto> {
    const [kind, id] = taskId.split(':', 2);
    if (!id || !isUUID(id)) {
      throw this.notFound();
    }
    if (kind === 'service') {
      return this.retryService(taskId, id);
    }
    if (kind === 'moved') {
      return this.retryMoved(taskId, id);
    }
    if (kind === 'voucher') {
      return this.retryVoucher(taskId, id);
    }
    throw this.notFound();
  }

  private async retryService(
    taskId: string,
    serviceId: string,
  ): Promise<RetryResultDto> {
    const owner = await this.prisma.partnerServiceBooking.findUnique({
      where: { id: serviceId },
    });
    if (!owner) {
      throw this.notFound();
    }

    return this.lock.run(
      { id: owner.reservationId },
      async (tx, reservation) => {
        const service = reservation.services.find(
          (item) => item.id === serviceId,
        );
        if (service?.status !== ServiceStatus.CANCEL_RETRY) {
          throw this.notFound();
        }
        if (!(await this.cancellation.cancelAtPartner(service))) {
          return { id: taskId, done: false, status: service.status };
        }

        // Pozycja z pakietu wraca do puli tylko wtedy, gdy pobyt nie został anulowany (RB-11). (DamianTchorzewski_72206)
        const updated = await tx.partnerServiceBooking.update({
          where: { id: service.id },
          data:
            reservation.status === ReservationStatus.CANCELLED ||
            reservation.status === ReservationStatus.COMPLETED
              ? { status: ServiceStatus.CANCELLED }
              : this.cancellation.dataAfterSingleCancellation(service),
        });
        return { id: taskId, done: true, status: updated.status };
      },
    );
  }

  private async retryMoved(
    taskId: string,
    serviceId: string,
  ): Promise<RetryResultDto> {
    const owner = await this.prisma.partnerServiceBooking.findUnique({
      where: { id: serviceId },
    });
    if (!owner) {
      throw this.notFound();
    }

    return this.lock.run(
      { id: owner.reservationId },
      async (tx, reservation) => {
        const service = reservation.services.find(
          (item) => item.id === serviceId,
        );
        if (!service?.previousExternalBookingId) {
          throw this.notFound();
        }
        const done = await this.cancellation.cancelPreviousAtPartner(service);
        if (done) {
          await tx.partnerServiceBooking.update({
            where: { id: service.id },
            data: { previousExternalBookingId: null },
          });
        }
        return { id: taskId, done, status: service.status };
      },
    );
  }

  private retryVoucher(
    taskId: string,
    reservationId: string,
  ): Promise<RetryResultDto> {
    return this.lock.run({ id: reservationId }, async (tx, reservation) => {
      const before = reservation.voucherStatus;
      let after = reservation;

      if (before === VoucherStatus.SETTLEMENT_RETRY) {
        after = await this.stay.retrySettlement(tx, reservation);
      } else if (
        before === VoucherStatus.PENDING_VERIFICATION &&
        reservation.status === ReservationStatus.CHECKED_IN
      ) {
        after = await this.stay.retryVerification(tx, reservation);
      } else {
        throw this.notFound();
      }

      return {
        id: taskId,
        done: after.voucherStatus !== before,
        status: after.voucherStatus,
      };
    });
  }

  private notFound() {
    return domainErrors.notFound('The retry task does not exist.');
  }
}
