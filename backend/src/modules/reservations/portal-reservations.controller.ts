import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  GUEST_LOOKUP_RATE_LIMIT,
  RATE_LIMIT_WINDOW_MS,
} from '../../common/rate-limit/rate-limit.constants.js';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator.js';
import { ReservationSource } from '../../generated/prisma/enums.js';
import { CreatePortalReservationDto } from './dto/create-reservation.dto.js';
import { PortalReservationQueryDto } from './dto/reservation-query.dto.js';
import {
  PortalReservationDto,
  ReservationConfirmationDto,
} from './dto/reservation.dto.js';
import { ReservationsQueryService } from './reservations-query.service.js';
import {
  toConfirmationDto,
  toPortalReservationDto,
} from './reservations.mapper.js';
import { ReservationsService } from './reservations.service.js';

@ApiTags('portal')
@Controller('portal/reservations')
export class PortalReservationsController {
  constructor(
    private readonly reservations: ReservationsService,
    private readonly query: ReservationsQueryService,
  ) {}

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

  @Get(':number')
  @Throttle({
    default: { limit: GUEST_LOOKUP_RATE_LIMIT, ttl: RATE_LIMIT_WINDOW_MS },
  })
  @ApiOperation({
    summary: 'Show a reservation to the guest by number and e-mail (US-06)',
  })
  @ApiOkResponse({ type: PortalReservationDto })
  @ApiErrorResponses({
    400: 'Invalid e-mail (VALIDATION_ERROR)',
    404: 'No reservation for this number and e-mail (NOT_FOUND)',
    429: 'Too many attempts from one address (TOO_MANY_REQUESTS)',
  })
  async findOne(
    @Param('number') number: string,
    @Query() { email }: PortalReservationQueryDto,
  ): Promise<PortalReservationDto> {
    return toPortalReservationDto(await this.query.findForGuest(number, email));
  }
}
