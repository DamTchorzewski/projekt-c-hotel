import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ExternalOffersController } from './external-offers.controller.js';
import { OffersController } from './offers.controller.js';
import { OffersService } from './offers.service.js';
import { RoomAvailabilityService } from './room-availability.service.js';

@Module({
  imports: [AuthModule],
  controllers: [OffersController, ExternalOffersController],
  providers: [OffersService, RoomAvailabilityService],
  exports: [RoomAvailabilityService],
})
export class OffersModule {}
