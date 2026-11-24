import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
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
import { domainErrors } from '../../common/errors/domain-errors.js';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator.js';
import { ReservationSource } from '../../generated/prisma/enums.js';
import { SessionGuard } from '../auth/session.guard.js';
import { CreateReceptionReservationDto } from './dto/create-reservation.dto.js';
import { ReservationDto } from './dto/reservation.dto.js';
import { toReservationDto } from './reservations.mapper.js';
import { ReservationsService } from './reservations.service.js';

// Identyfikator w złym formacie nie może istnieć, więc odpowiedź jest taka sama jak dla nieznanego. (DamianTchorzewski_72206)
const reservationIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    domainErrors.notFound('The reservation does not exist.'),
});

@ApiTags('reservations')
@ApiCookieAuth(SESSION_SECURITY_NAME)
@Controller('reservations')
@UseGuards(SessionGuard)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post()
  @ApiOperation({ summary: 'Book a stay at the reception (US-08)' })
  @ApiCreatedResponse({ type: ReservationDto })
  @ApiErrorResponses({
    400: 'VALIDATION_ERROR, INVALID_DATES or CAPACITY_EXCEEDED',
    401: 'Reception session is required (UNAUTHORIZED)',
    409: 'The room or room type is not free (ROOM_NOT_AVAILABLE)',
  })
  async create(
    @Body() dto: CreateReceptionReservationDto,
  ): Promise<ReservationDto> {
    return toReservationDto(
      await this.reservations.create(dto, ReservationSource.RECEPTION),
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a reservation, idempotent (US-10)',
    description:
      'Confirmed partner services get the CANCEL_RETRY status until partner adapters are available (US-26).',
  })
  @ApiOkResponse({ type: ReservationDto })
  @ApiErrorResponses({
    401: 'Reception session is required (UNAUTHORIZED)',
    404: 'The reservation does not exist (NOT_FOUND)',
    409: 'The stay has started or ended (INVALID_STATE)',
  })
  async cancel(
    @Param('id', reservationIdPipe) id: string,
  ): Promise<ReservationDto> {
    return toReservationDto(await this.reservations.cancel(id));
  }
}
