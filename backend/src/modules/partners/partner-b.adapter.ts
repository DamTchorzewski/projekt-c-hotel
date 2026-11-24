import { Injectable } from '@nestjs/common';
import { PartnerClient } from './partner-client.service.js';
import { ServicePartnerAdapter } from './service-partner.adapter.js';

// System B: treningi. (DamianTchorzewski_72206)
@Injectable()
export class PartnerBAdapter extends ServicePartnerAdapter {
  constructor(client: PartnerClient) {
    super(client, 'B');
  }
}
