import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import {
  EXTERNAL_RATE_LIMIT,
  LOGIN_RATE_LIMIT,
} from '../src/common/rate-limit/rate-limit.constants.js';
import { createTestApp } from './create-test-app.js';

// Ten plik jako jedyny włącza limit żądań. Zmienna musi być ustawiona, zanim moduł aplikacji odczyta konfigurację. (DamianTchorzewski_72206)
vi.hoisted(() => {
  process.env['RATE_LIMIT_ENABLED'] = 'true';
});

describe('Rate limiting (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks login attempts above the limit with 429', async () => {
    const attempt = () =>
      request(app.getHttpServer()).post('/api/v1/auth/login').send({});

    // Limit liczy każde żądanie, także to z błędną walidacją, więc zgadywanie hasła nie omija limitu. (DamianTchorzewski_72206)
    for (let i = 0; i < LOGIN_RATE_LIMIT; i += 1) {
      await attempt().expect(400);
    }
    const blocked = await attempt().expect(429);

    expect(blocked.body).toMatchObject({
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
      path: '/api/v1/auth/login',
    });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('does not let the login limit affect other endpoints', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });

  it('limits partner requests before the API key is checked', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .get('/api/v1/external/offers')
        .set('X-API-Key', 'wrong-key-wrong-key-0000');

    for (let i = 0; i < EXTERNAL_RATE_LIMIT; i += 1) {
      await attempt().expect(401);
    }
    const blocked = await attempt().expect(429);

    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
  });
});
