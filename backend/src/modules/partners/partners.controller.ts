import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SESSION_SECURITY_NAME } from '../../common/constants/api.constants.js';
import { domainErrors } from '../../common/errors/domain-errors.js';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator.js';
import { SessionGuard } from '../auth/session.guard.js';
import {
  PartnerOffersResponseDto,
  PartnerParamDto,
  PartnerServicesResponseDto,
  PartnerSlotsResponseDto,
  SlotsQueryDto,
} from './dto/partner.dto.js';
import { PartnerUnavailableError } from './partner-client.service.js';
import { PartnerOffersService } from './partner-offers.service.js';
import { PartnerRegistry } from './partner-registry.service.js';

// Zamienia niedostępność partnera na odpowiedź 503. (DamianTchorzewski_72206)
async function orUnavailable<T>(call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch (error) {
    if (error instanceof PartnerUnavailableError) {
      throw domainErrors.partnerUnavailable();
    }
    throw error;
  }
}

@ApiTags('partners')
@Controller()
export class PartnersController {
  constructor(
    private readonly registry: PartnerRegistry,
    private readonly offers: PartnerOffersService,
  ) {}

  @Get('partner-offers')
  @ApiOperation({
    summary: 'Services of partners A and B for the guest portal (US-07)',
    description: 'Cached for 15 minutes.',
  })
  @ApiOkResponse({ type: PartnerOffersResponseDto })
  findOffers(): Promise<PartnerOffersResponseDto> {
    return this.offers.findOffers();
  }

  @Get('partners/:partner/services')
  @UseGuards(SessionGuard)
  @ApiCookieAuth(SESSION_SECURITY_NAME)
  @ApiOperation({ summary: 'Current services of a partner (US-14)' })
  @ApiOkResponse({ type: PartnerServicesResponseDto })
  @ApiErrorResponses({
    400: 'Unknown partner (VALIDATION_ERROR)',
    401: 'Reception session is required (UNAUTHORIZED)',
    503: 'The partner does not answer (PARTNER_UNAVAILABLE)',
  })
  async findServices(
    @Param() { partner }: PartnerParamDto,
  ): Promise<PartnerServicesResponseDto> {
    return {
      items: await orUnavailable(this.registry.forCode(partner).getServices()),
    };
  }

  @Get('partners/:partner/slots')
  @UseGuards(SessionGuard)
  @ApiCookieAuth(SESSION_SECURITY_NAME)
  @ApiOperation({ summary: 'Free slots of a partner on a given day (US-13)' })
  @ApiOkResponse({ type: PartnerSlotsResponseDto })
  @ApiErrorResponses({
    400: 'Unknown partner or invalid date (VALIDATION_ERROR)',
    401: 'Reception session is required (UNAUTHORIZED)',
    503: 'The partner does not answer (PARTNER_UNAVAILABLE)',
  })
  async findSlots(
    @Param() { partner }: PartnerParamDto,
    @Query() query: SlotsQueryDto,
  ): Promise<PartnerSlotsResponseDto> {
    return {
      items: await orUnavailable(
        this.registry.forCode(partner).getSlots(query.date, query.serviceId),
      ),
    };
  }
}
