import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OffersModule } from '../offers/offers.module.js';
import { PartnersModule } from '../partners/partners.module.js';
import { ExternalReservationsController } from './external-reservations.controller.js';
import { ExternalReservationsService } from './external-reservations.service.js';
import { PortalReservationsController } from './portal-reservations.controller.js';
import { ReservationLock } from './reservation-lock.service.js';
import { ReservationUpdateService } from './reservation-update.service.js';
import { ReservationsController } from './reservations.controller.js';
import { ReservationsQueryService } from './reservations-query.service.js';
import { ReservationsService } from './reservations.service.js';
import { RetryTasksController } from './retry-tasks.controller.js';
import { RetryTasksService } from './retry-tasks.service.js';
import { ServiceCancellation } from './service-cancellation.service.js';
import { StayService } from './stay.service.js';
import { StayServicesService } from './stay-services.service.js';

@Module({
  imports: [AuthModule, OffersModule, PartnersModule],
  controllers: [
    PortalReservationsController,
    ReservationsController,
    ExternalReservationsController,
    RetryTasksController,
  ],
  providers: [
    ReservationLock,
    ReservationsService,
    ReservationsQueryService,
    ReservationUpdateService,
    ExternalReservationsService,
    ServiceCancellation,
    StayService,
    StayServicesService,
    RetryTasksService,
  ],
})
export class ReservationsModule {}
