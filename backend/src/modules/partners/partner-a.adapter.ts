import { Injectable } from '@nestjs/common';
import { PartnerClient } from './partner-client.service.js';
import { ServicePartnerAdapter } from './service-partner.adapter.js';

// System A: masaże. (DamianTchorzewski_72206)
@Injectable()
export class PartnerAAdapter extends ServicePartnerAdapter {
  constructor(client: PartnerClient) {
    super(client, 'A');
  }
}
