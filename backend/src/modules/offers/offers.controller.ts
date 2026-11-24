import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator.js';
import { SessionService } from '../auth/session.service.js';
import {
  AvailabilityQueryDto,
  AvailabilityResponseDto,
} from './dto/availability.dto.js';
import { OffersResponseDto } from './dto/offer.dto.js';
import { OffersService } from './offers.service.js';

@ApiTags('offers')
@Controller()
export class OffersController {
  constructor(
    private readonly offersService: OffersService,
    private readonly sessions: SessionService,
  ) {}

  @Get('offers')
  @ApiOperation({ summary: 'List room types (US-03)' })
  @ApiOkResponse({ type: OffersResponseDto })
  findOffers(): Promise<OffersResponseDto> {
    return this.offersService.findOffers();
  }

  @Get('availability')
  @ApiOperation({
    summary: 'Search free room types with the price of the stay (US-02)',
    description:
      'Returns room types with at least one room free in the whole period. With a reception session the response also contains the numbers of the free rooms.',
  })
  @ApiOkResponse({ type: AvailabilityResponseDto })
  @ApiErrorResponses({
    400: 'Invalid query (VALIDATION_ERROR) or stay dates (INVALID_DATES)',
  })
  findAvailability(
    @Query() query: AvailabilityQueryDto,
    @Req() request: Request,
  ): Promise<AvailabilityResponseDto> {
    return this.offersService.findAvailability(query, {
      withRoomNumbers: this.sessions.read(request) !== null,
    });
  }
}
