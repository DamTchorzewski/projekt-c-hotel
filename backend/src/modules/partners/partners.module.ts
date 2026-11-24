import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PartnerAAdapter } from './partner-a.adapter.js';
import { PartnerBAdapter } from './partner-b.adapter.js';
import { PartnerClient } from './partner-client.service.js';
import { PartnerDAdapter } from './partner-d.adapter.js';
import { PartnerOffersService } from './partner-offers.service.js';
import { PartnerRegistry } from './partner-registry.service.js';
import { PartnersController } from './partners.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [PartnersController],
  providers: [
    PartnerClient,
    PartnerAAdapter,
    PartnerBAdapter,
    PartnerDAdapter,
    PartnerRegistry,
    PartnerOffersService,
  ],
  exports: [PartnerDAdapter, PartnerRegistry],
})
export class PartnersModule {}
