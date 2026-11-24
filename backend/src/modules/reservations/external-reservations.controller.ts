import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { API_KEY_SECURITY_NAME } from '../../common/constants/api.constants.js';
import { uuidParamPipe } from '../../common/pipes/uuid-param.pipe.js';
import {
  EXTERNAL_RATE_LIMIT,
  RATE_LIMIT_WINDOW_MS,
} from '../../common/rate-limit/rate-limit.constants.js';
import { ApiKeyGuard } from '../../common/security/api-key.guard.js';
import { ReservationsClientGuard } from '../../common/security/reservations-client.guard.js';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator.js';
import { ReservationSource } from '../../generated/prisma/enums.js';
import {
  CreateExternalReservationDto,
  ExternalReservationDto,
} from './dto/external-reservation.dto.js';
import { UpdateExternalReservationDto } from './dto/update-reservation.dto.js';
import { ExternalReservationsService } from './external-reservations.service.js';
import { ReservationUpdateService } from './reservation-update.service.js';
import { ReservationsQueryService } from './reservations-query.service.js';
import { toExternalReservationDto } from './reservations.mapper.js';
import { ReservationsService } from './reservations.service.js';

// RB-19: System D widzi wyłącznie rezerwacje utworzone przez siebie. (DamianTchorzewski_72206)
const ownReservation = (id: string) => ({
  id,
  source: ReservationSource.PARTNER_D,
});

@ApiTags('external')
@ApiSecurity(API_KEY_SECURITY_NAME)
@Controller('external/reservations')
@UseGuards(ApiKeyGuard, ReservationsClientGuard)
@Throttle({
  default: { limit: EXTERNAL_RATE_LIMIT, ttl: RATE_LIMIT_WINDOW_MS },
})
export class ExternalReservationsController {
  constructor(
    private readonly external: ExternalReservationsService,
    private readonly query: ReservationsQueryService,
    private readonly updates: ReservationUpdateService,
    private readonly reservations: ReservationsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Book a stay with a voucher (US-22)' })
  @ApiHeader({
    name: 'Idempotency-Key',
    description:
      'Required. A repeated request with the same key and body returns the existing reservation',
    required: false,
  })
  @ApiCreatedResponse({ type: ExternalReservationDto })
  @ApiOkResponse({
    type: ExternalReservationDto,
    description: 'Repeated request, nothing was created',
  })
  @ApiErrorResponses({
    400: 'VALIDATION_ERROR, VOUCHER_REQUIRED, INVALID_DATES or CAPACITY_EXCEEDED',
    401: 'Missing or invalid API key (UNAUTHORIZED)',
    403: 'The key does not give access to reservations (FORBIDDEN)',
    409: 'ROOM_NOT_AVAILABLE, VOUCHER_ALREADY_USED or IDEMPOTENCY_CONFLICT',
    429: 'Too many requests from one address (TOO_MANY_REQUESTS)',
  })
  async create(
    @Body() dto: CreateExternalReservationDto,
    @Headers('idempotency-key') key: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ExternalReservationDto> {
    const { created, reservation } = await this.external.create(dto, key);
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return toExternalReservationDto(reservation);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read an own reservation and its plan (US-23)' })
  @ApiOkResponse({ type: ExternalReservationDto })
  @ApiErrorResponses({
    401: 'Missing or invalid API key (UNAUTHORIZED)',
    404: 'Unknown reservation or one from another channel (NOT_FOUND)',
  })
  async findOne(
    @Param('id', uuidParamPipe) id: string,
  ): Promise<ExternalReservationDto> {
    return toExternalReservationDto(await this.query.findForPartner(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change an own reservation (US-23)' })
  @ApiOkResponse({ type: ExternalReservationDto })
  @ApiErrorResponses({
    400: 'VALIDATION_ERROR, INVALID_DATES or CAPACITY_EXCEEDED',
    401: 'Missing or invalid API key (UNAUTHORIZED)',
    404: 'Unknown reservation or one from another channel (NOT_FOUND)',
    409: 'ROOM_NOT_AVAILABLE, INVALID_STATE or SERVICES_OUTSIDE_STAY',
  })
  async update(
    @Param('id', uuidParamPipe) id: string,
    @Body() dto: UpdateExternalReservationDto,
  ): Promise<ExternalReservationDto> {
    return toExternalReservationDto(
      await this.updates.update(ownReservation(id), dto),
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an own reservation, idempotent (US-23)' })
  @ApiOkResponse({ type: ExternalReservationDto })
  @ApiErrorResponses({
    401: 'Missing or invalid API key (UNAUTHORIZED)',
    404: 'Unknown reservation or one from another channel (NOT_FOUND)',
    409: 'The stay has started or ended (INVALID_STATE)',
  })
  async cancel(
    @Param('id', uuidParamPipe) id: string,
  ): Promise<ExternalReservationDto> {
    return toExternalReservationDto(
      await this.reservations.cancel(ownReservation(id)),
    );
  }
}
