import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SESSION_SECURITY_NAME } from '../../common/constants/api.constants.js';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator.js';
import { SessionGuard } from '../auth/session.guard.js';
import { RetryResultDto, RetryTasksResponseDto } from './dto/retry-task.dto.js';
import { RetryTasksService } from './retry-tasks.service.js';

@ApiTags('retry-tasks')
@ApiCookieAuth(SESSION_SECURITY_NAME)
@Controller('retry-tasks')
@UseGuards(SessionGuard)
export class RetryTasksController {
  constructor(private readonly tasks: RetryTasksService) {}

  @Get()
  @ApiOperation({ summary: 'List operations to retry (US-20)' })
  @ApiOkResponse({ type: RetryTasksResponseDto })
  @ApiErrorResponses({ 401: 'Reception session is required (UNAUTHORIZED)' })
  findAll(): Promise<RetryTasksResponseDto> {
    return this.tasks.findAll();
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry an operation (US-20)' })
  @ApiOkResponse({ type: RetryResultDto })
  @ApiErrorResponses({
    401: 'Reception session is required (UNAUTHORIZED)',
    404: 'The task does not exist or is already done (NOT_FOUND)',
  })
  retry(@Param('id') id: string): Promise<RetryResultDto> {
    return this.tasks.retry(id);
  }
}
