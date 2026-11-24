import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import type { Request } from 'express';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';

const PASSWORD = 'correct-horse';

function configWith(
  values: Partial<EnvironmentVariables>,
): ConfigService<EnvironmentVariables, true> {
  return {
    get: (key: keyof EnvironmentVariables) => values[key],
  } as unknown as ConfigService<EnvironmentVariables, true>;
}

function requestWith(cookie: string | undefined): Request {
  return { headers: { cookie } } as unknown as Request;
}

describe('reception login (US-27)', () => {
  let config: ConfigService<EnvironmentVariables, true>;
  let sessions: SessionService;
  let auth: AuthService;

  beforeAll(async () => {
    config = configWith({
      RECEPTION_LOGIN: 'recepcja',
      RECEPTION_PASSWORD_HASH: await hash(PASSWORD, 4),
      SESSION_SECRET: 'a'.repeat(32),
    });
    sessions = new SessionService(new JwtService(), config);
    auth = new AuthService(config, sessions);
  });

  it('issues a session that can be read back from the cookie', async () => {
    const token = await auth.login('recepcja', PASSWORD);

    expect(sessions.read(requestWith(`other=1; hotel_session=${token}`))).toBe(
      'recepcja',
    );
  });

  it.each([
    ['recepcja', 'wrong'],
    ['someone', PASSWORD],
    ['', ''],
  ])('rejects login "%s" with the same error', async (login, password) => {
    await expect(auth.login(login, password)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Invalid login or password.',
    });
  });

  it('lets nobody in when the account is not configured', async () => {
    const empty = configWith({});
    const service = new AuthService(
      empty,
      new SessionService(new JwtService(), empty),
    );

    await expect(service.login('recepcja', PASSWORD)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('ignores missing, forged and expired sessions', () => {
    const forged = new JwtService().sign(
      { sub: 'recepcja' },
      { secret: 'b'.repeat(32) },
    );
    const expired = new JwtService().sign(
      { sub: 'recepcja' },
      { secret: 'a'.repeat(32), expiresIn: -1 },
    );

    expect(sessions.read(requestWith(undefined))).toBeNull();
    expect(sessions.read(requestWith('hotel_session=abc'))).toBeNull();
    expect(sessions.read(requestWith(`hotel_session=${forged}`))).toBeNull();
    expect(sessions.read(requestWith(`hotel_session=${expired}`))).toBeNull();
  });
});
