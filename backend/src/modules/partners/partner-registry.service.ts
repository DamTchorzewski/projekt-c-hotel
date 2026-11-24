import { Injectable } from '@nestjs/common';
import { PartnerType } from '../../generated/prisma/client.js';
import { PartnerAAdapter } from './partner-a.adapter.js';
import { PartnerBAdapter } from './partner-b.adapter.js';
import type { ServicePartnerAdapter } from './service-partner.adapter.js';

// Wybiera adapter według typu usługi w planie pobytu. (DamianTchorzewski_72206)
@Injectable()
export class PartnerRegistry {
  constructor(
    private readonly partnerA: PartnerAAdapter,
    private readonly partnerB: PartnerBAdapter,
  ) {}

  forType(type: PartnerType): ServicePartnerAdapter {
    return type === PartnerType.MASSAGE_A ? this.partnerA : this.partnerB;
  }

  forCode(code: 'A' | 'B'): ServicePartnerAdapter {
    return code === 'A' ? this.partnerA : this.partnerB;
  }
}
