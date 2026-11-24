import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { API_KEY_SECURITY_NAME } from '../../common/constants/api.constants.js';
import {
  EXTERNAL_RATE_LIMIT,
  RATE_LIMIT_WINDOW_MS,
} from '../../common/rate-limit/rate-limit.constants.js';
import { ApiKeyGuard } from '../../common/security/api-key.guard.js';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator.js';
import {
  AvailabilityQueryDto,
  AvailabilityResponseDto,
} from './dto/availability.dto.js';
import { OffersResponseDto } from './dto/offer.dto.js';
import { OffersService } from './offers.service.js';

@ApiTags('external')
@ApiSecurity(API_KEY_SECURITY_NAME)
@Controller('external')
@UseGuards(ApiKeyGuard)
@Throttle({
  default: { limit: EXTERNAL_RATE_LIMIT, ttl: RATE_LIMIT_WINDOW_MS },
})
export class ExternalOffersController {
  constructor(private readonly offersService: OffersService) {}

  @Get('offers')
  @ApiOperation({ summary: 'List room types for partner systems (US-21)' })
  @ApiOkResponse({ type: OffersResponseDto })
  @ApiErrorResponses({
    401: 'Missing or invalid API key (UNAUTHORIZED)',
    429: 'Too many requests from one address (TOO_MANY_REQUESTS)',
  })
  findOffers(): Promise<OffersResponseDto> {
    return this.offersService.findOffers();
  }

  @Get('availability')
  @ApiOperation({
    summary: 'Search free room types for partner systems (US-21)',
  })
  @ApiOkResponse({ type: AvailabilityResponseDto })
  @ApiErrorResponses({
    400: 'Invalid query (VALIDATION_ERROR) or stay dates (INVALID_DATES)',
    401: 'Missing or invalid API key (UNAUTHORIZED)',
    429: 'Too many requests from one address (TOO_MANY_REQUESTS)',
  })
  findAvailability(
    @Query() query: AvailabilityQueryDto,
  ): Promise<AvailabilityResponseDto> {
    return this.offersService.findAvailability(query, {
      withRoomNumbers: false,
    });
  }
}
