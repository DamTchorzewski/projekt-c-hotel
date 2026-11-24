import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OffersModule } from '../offers/offers.module.js';
import { PortalReservationsController } from './portal-reservations.controller.js';
import { ReservationsController } from './reservations.controller.js';
import { ReservationsService } from './reservations.service.js';

@Module({
  imports: [AuthModule, OffersModule],
  controllers: [PortalReservationsController, ReservationsController],
  providers: [ReservationsService],
})
export class ReservationsModule {}
