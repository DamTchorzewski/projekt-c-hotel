import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SESSION_SECURITY_NAME } from '../../common/constants/api.constants.js';
import { uuidParamPipe } from '../../common/pipes/uuid-param.pipe.js';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator.js';
import { ReservationSource } from '../../generated/prisma/enums.js';
import { SessionGuard } from '../auth/session.guard.js';
import { CheckInDto } from './dto/check-in.dto.js';
import { CreateReceptionReservationDto } from './dto/create-reservation.dto.js';
import {
  ReservationsQueryDto,
  ReservationsResponseDto,
} from './dto/reservation-query.dto.js';
import { ReservationDto, StayServiceDto } from './dto/reservation.dto.js';
import { AddServiceDto, BookServiceDto } from './dto/stay-service.dto.js';
import { UpdateReservationDto } from './dto/update-reservation.dto.js';
import { ReservationUpdateService } from './reservation-update.service.js';
import { ReservationsQueryService } from './reservations-query.service.js';
import { toReservationDto, toStayServiceDto } from './reservations.mapper.js';
import { ReservationsService } from './reservations.service.js';
import { StayService } from './stay.service.js';
import { StayServicesService } from './stay-services.service.js';

const SESSION_REQUIRED = 'Reception session is required (UNAUTHORIZED)';
const NOT_FOUND = 'The reservation or the service does not exist (NOT_FOUND)';

@ApiTags('reservations')
@ApiCookieAuth(SESSION_SECURITY_NAME)
@Controller('reservations')
@UseGuards(SessionGuard)
export class ReservationsController {
  constructor(
    private readonly reservations: ReservationsService,
    private readonly query: ReservationsQueryService,
    private readonly updates: ReservationUpdateService,
    private readonly stay: StayService,
    private readonly services: StayServicesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Search reservations (US-11)',
    description:
      'Sorted by the arrival date. Without filters it returns arrivals and departures of today.',
  })
  @ApiOkResponse({ type: ReservationsResponseDto })
  @ApiErrorResponses({
    400: 'Invalid query (VALIDATION_ERROR)',
    401: SESSION_REQUIRED,
  })
  findAll(
    @Query() query: ReservationsQueryDto,
  ): Promise<ReservationsResponseDto> {
    return this.query.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Reservation details with the stay plan (US-12)' })
  @ApiOkResponse({ type: ReservationDto })
  @ApiErrorResponses({ 401: SESSION_REQUIRED, 404: NOT_FOUND })
  async findOne(
    @Param('id', uuidParamPipe) id: string,
  ): Promise<ReservationDto> {
    return toReservationDto(await this.query.findOne({ id }));
  }

  @Post()
  @ApiOperation({ summary: 'Book a stay at the reception (US-08)' })
  @ApiCreatedResponse({ type: ReservationDto })
  @ApiErrorResponses({
    400: 'VALIDATION_ERROR, INVALID_DATES or CAPACITY_EXCEEDED',
    401: SESSION_REQUIRED,
    409: 'The room or room type is not free (ROOM_NOT_AVAILABLE)',
  })
  async create(
    @Body() dto: CreateReceptionReservationDto,
  ): Promise<ReservationDto> {
    return toReservationDto(
      await this.reservations.create(dto, ReservationSource.RECEPTION),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change a reservation (US-09)' })
  @ApiOkResponse({ type: ReservationDto })
  @ApiErrorResponses({
    400: 'VALIDATION_ERROR, INVALID_DATES or CAPACITY_EXCEEDED',
    401: SESSION_REQUIRED,
    404: NOT_FOUND,
    409: 'ROOM_NOT_AVAILABLE, INVALID_STATE or SERVICES_OUTSIDE_STAY',
  })
  async update(
    @Param('id', uuidParamPipe) id: string,
    @Body() dto: UpdateReservationDto,
  ): Promise<ReservationDto> {
    return toReservationDto(await this.updates.update({ id }, dto));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a reservation with its services, idempotent (US-10)',
  })
  @ApiOkResponse({ type: ReservationDto })
  @ApiErrorResponses({
    401: SESSION_REQUIRED,
    404: NOT_FOUND,
    409: 'The stay has started or ended (INVALID_STATE)',
  })
  async cancel(
    @Param('id', uuidParamPipe) id: string,
  ): Promise<ReservationDto> {
    return toReservationDto(await this.reservations.cancel({ id }));
  }

  @Post(':id/check-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check in with voucher verification (US-18)',
    description:
      'When system D does not answer, conditional=true checks the guest in and leaves the voucher to verify.',
  })
  @ApiOkResponse({ type: ReservationDto })
  @ApiErrorResponses({
    401: SESSION_REQUIRED,
    404: NOT_FOUND,
    409: 'CHECK_IN_NOT_ALLOWED or INVALID_STATE',
    422: 'The voucher is not valid (VOUCHER_INVALID)',
    503: 'System D does not answer (PARTNER_UNAVAILABLE)',
  })
  async checkIn(
    @Param('id', uuidParamPipe) id: string,
    @Body() dto: CheckInDto,
  ): Promise<ReservationDto> {
    return toReservationDto(
      await this.stay.checkIn(id, dto.conditional ?? false),
    );
  }

  @Post(':id/check-out')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check out and settle the voucher (US-19)' })
  @ApiOkResponse({ type: ReservationDto })
  @ApiErrorResponses({
    401: SESSION_REQUIRED,
    404: NOT_FOUND,
    409: 'The guest is not checked in (INVALID_STATE)',
  })
  async checkOut(
    @Param('id', uuidParamPipe) id: string,
  ): Promise<ReservationDto> {
    return toReservationDto(await this.stay.checkOut(id));
  }

  @Post(':id/services')
  @ApiOperation({ summary: 'Add an extra service of A or B (US-14)' })
  @ApiCreatedResponse({ type: StayServiceDto })
  @ApiErrorResponses({
    400: 'Unknown service (VALIDATION_ERROR)',
    401: SESSION_REQUIRED,
    404: NOT_FOUND,
    409: 'The stay is closed (INVALID_STATE)',
    503: 'The partner does not answer (PARTNER_UNAVAILABLE)',
  })
  async addService(
    @Param('id', uuidParamPipe) id: string,
    @Body() dto: AddServiceDto,
  ): Promise<StayServiceDto> {
    return toStayServiceDto(await this.services.add(id, dto));
  }

  @Post(':id/services/:serviceId/book')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Book a service at the partner (US-13, US-15)',
    description:
      'A refusal of the partner is not an HTTP error: the service gets the REJECTED status with a reason.',
  })
  @ApiOkResponse({ type: StayServiceDto })
  @ApiErrorResponses({
    400: 'Invalid time (VALIDATION_ERROR)',
    401: SESSION_REQUIRED,
    404: NOT_FOUND,
    409: 'SERVICE_OUTSIDE_STAY, SERVICE_TIME_CONFLICT or INVALID_STATE',
  })
  async bookService(
    @Param('id', uuidParamPipe) id: string,
    @Param('serviceId', uuidParamPipe) serviceId: string,
    @Body() dto: BookServiceDto,
  ): Promise<StayServiceDto> {
    return toStayServiceDto(await this.services.book(id, serviceId, dto));
  }

  @Post(':id/services/:serviceId/reschedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Move a confirmed service to another time (US-17)',
    description:
      'The new time is booked first and the old one is cancelled afterwards. When the partner refuses, the old time stays.',
  })
  @ApiOkResponse({ type: StayServiceDto })
  @ApiErrorResponses({
    400: 'Invalid time (VALIDATION_ERROR)',
    401: SESSION_REQUIRED,
    404: NOT_FOUND,
    409: 'SLOT_TAKEN, SERVICE_OUTSIDE_STAY, SERVICE_TIME_CONFLICT or INVALID_STATE',
    503: 'The partner does not answer (PARTNER_UNAVAILABLE)',
  })
  async rescheduleService(
    @Param('id', uuidParamPipe) id: string,
    @Param('serviceId', uuidParamPipe) serviceId: string,
    @Body() dto: BookServiceDto,
  ): Promise<StayServiceDto> {
    return toStayServiceDto(await this.services.reschedule(id, serviceId, dto));
  }

  @Post(':id/services/:serviceId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a single service (US-16)',
    description:
      'A package service returns to the pool. When the partner does not answer, the status is CANCEL_RETRY.',
  })
  @ApiOkResponse({ type: StayServiceDto })
  @ApiErrorResponses({
    401: SESSION_REQUIRED,
    404: NOT_FOUND,
    409: 'The service or the stay cannot be changed (INVALID_STATE)',
  })
  async cancelService(
    @Param('id', uuidParamPipe) id: string,
    @Param('serviceId', uuidParamPipe) serviceId: string,
  ): Promise<StayServiceDto> {
    return toStayServiceDto(await this.services.cancel(id, serviceId));
  }
}
