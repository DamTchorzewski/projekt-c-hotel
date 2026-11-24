import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SESSION_SECURITY_NAME } from '../../common/constants/api.constants.js';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator.js';
import { SessionGuard } from '../auth/session.guard.js';
import { RoomsQueryDto, RoomsResponseDto } from './dto/room.dto.js';
import { RoomsService } from './rooms.service.js';

@ApiTags('rooms')
@ApiCookieAuth(SESSION_SECURITY_NAME)
@Controller('rooms')
@UseGuards(SessionGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  @ApiOperation({
    summary: 'List rooms with the status for today, read only (US-01)',
  })
  @ApiOkResponse({ type: RoomsResponseDto })
  @ApiErrorResponses({
    400: 'Invalid query (VALIDATION_ERROR)',
    401: 'Reception session is required (UNAUTHORIZED)',
  })
  findAll(@Query() query: RoomsQueryDto): Promise<RoomsResponseDto> {
    return this.roomsService.findAll(query);
  }
}
