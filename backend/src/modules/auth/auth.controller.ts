import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import {
  SESSION_COOKIE,
  SESSION_SECURITY_NAME,
} from '../../common/constants/api.constants.js';
import {
  LOGIN_RATE_LIMIT,
  RATE_LIMIT_WINDOW_MS,
} from '../../common/rate-limit/rate-limit.constants.js';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator.js';
import {
  NodeEnvironment,
  type EnvironmentVariables,
} from '../../config/env.validation.js';
import { AuthService } from './auth.service.js';
import { LoginDto, SessionDto } from './dto/auth.dto.js';
import { SessionGuard } from './session.guard.js';
import { SESSION_HOURS, SessionService } from './session.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { limit: LOGIN_RATE_LIMIT, ttl: RATE_LIMIT_WINDOW_MS },
  })
  @ApiOperation({
    summary: 'Log in to the reception panel',
    description: `Sets the HttpOnly session cookie ${SESSION_COOKIE}, valid for ${SESSION_HOURS} hours.`,
  })
  @ApiOkResponse({ type: SessionDto })
  @ApiErrorResponses({
    400: 'Invalid request body (VALIDATION_ERROR)',
    401: 'Invalid login or password (UNAUTHORIZED)',
    429: 'Too many attempts from one address (TOO_MANY_REQUESTS)',
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionDto> {
    const token = await this.authService.login(dto.login, dto.password);
    response.cookie(SESSION_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: SESSION_HOURS * 60 * 60 * 1000,
    });

    return { login: dto.login };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Log out and clear the session cookie' })
  @ApiNoContentResponse({ description: 'The session cookie is cleared' })
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  @Get('me')
  @UseGuards(SessionGuard)
  @ApiCookieAuth(SESSION_SECURITY_NAME)
  @ApiOperation({ summary: 'Check the current reception session' })
  @ApiOkResponse({ type: SessionDto })
  @ApiErrorResponses({ 401: 'No valid session (UNAUTHORIZED)' })
  me(@Req() request: Request): SessionDto {
    return { login: this.sessions.read(request) ?? '' };
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure:
        this.config.get('NODE_ENV', { infer: true }) ===
        NodeEnvironment.Production,
      path: '/',
    };
  }
}
