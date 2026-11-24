import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator.js';
import { ReservationSource } from '../../generated/prisma/enums.js';
import { CreatePortalReservationDto } from './dto/create-reservation.dto.js';
import { ReservationConfirmationDto } from './dto/reservation.dto.js';
import { toConfirmationDto } from './reservations.mapper.js';
import { ReservationsService } from './reservations.service.js';

@ApiTags('portal')
@Controller('portal/reservations')
export class PortalReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post()
  @ApiOperation({ summary: 'Book a stay in the guest portal (US-05)' })
  @ApiCreatedResponse({ type: ReservationConfirmationDto })
  @ApiErrorResponses({
    400: 'VALIDATION_ERROR, INVALID_DATES or CAPACITY_EXCEEDED',
    409: 'No free room of the given type (ROOM_NOT_AVAILABLE)',
  })
  async create(
    @Body() dto: CreatePortalReservationDto,
  ): Promise<ReservationConfirmationDto> {
    return toConfirmationDto(
      await this.reservations.create(dto, ReservationSource.PORTAL),
    );
  }
}
