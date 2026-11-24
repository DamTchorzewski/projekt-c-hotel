import { Injectable } from '@nestjs/common';
import {
  ServiceSource,
  ServiceStatus,
  type PartnerServiceBooking,
} from '../../generated/prisma/client.js';
import { PartnerRegistry } from '../partners/partner-registry.service.js';

// Wspólne reguły anulowania usługi: pojedynczo, z całym pobytem i z listy do ponowienia (RB-08, RB-11). (DamianTchorzewski_72206)
@Injectable()
export class ServiceCancellation {
  constructor(private readonly partners: PartnerRegistry) {}

  // Zwraca false, gdy partner nie potwierdził anulowania. Wtedy operacja czeka na ponowienie. (DamianTchorzewski_72206)
  async cancelAtPartner(service: PartnerServiceBooking): Promise<boolean> {
    if (!service.externalBookingId) {
      return true;
    }
    try {
      return await this.partners
        .forType(service.partnerType)
        .cancel(service.externalBookingId, service.reservationId);
    } catch {
      return false;
    }
  }

  // Anuluje stary termin, który został po przeniesieniu usługi (US-17). (DamianTchorzewski_72206)
  cancelPreviousAtPartner(service: PartnerServiceBooking): Promise<boolean> {
    return this.cancelAtPartner({
      ...service,
      externalBookingId: service.previousExternalBookingId,
    });
  }

  async statusAfterStayCancellation(
    service: PartnerServiceBooking,
  ): Promise<ServiceStatus> {
    if (
      service.status !== ServiceStatus.CONFIRMED &&
      service.status !== ServiceStatus.CANCEL_RETRY
    ) {
      return ServiceStatus.CANCELLED;
    }
    return (await this.cancelAtPartner(service))
      ? ServiceStatus.CANCELLED
      : ServiceStatus.CANCEL_RETRY;
  }

  // Po anulowaniu pojedynczej usługi pozycja z pakietu wraca do puli, a dodatkowa jest anulowana. (DamianTchorzewski_72206)
  dataAfterSingleCancellation(service: PartnerServiceBooking) {
    return service.source === ServiceSource.PACKAGE
      ? {
          status: ServiceStatus.TO_ORDER,
          scheduledAt: null,
          externalBookingId: null,
          rejectionReason: null,
        }
      : { status: ServiceStatus.CANCELLED };
  }
}
