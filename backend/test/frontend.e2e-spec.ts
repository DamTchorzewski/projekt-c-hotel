import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import { serveFrontend } from '../src/frontend.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { prismaMock } from './create-test-app.js';

describe('Frontend served by the backend (e2e)', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hotel-front-'));
  let app: NestExpressApplication;

  beforeAll(async () => {
    writeFileSync(join(directory, 'index.html'), '<h1>Hotel C</h1>');
    writeFileSync(join(directory, 'app.js'), 'console.log(1)');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app);
    serveFrontend(app, directory);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    rmSync(directory, { recursive: true });
  });

  it.each(['/', '/panel/rezerwacje'])(
    'returns the page for %s',
    async (path) => {
      const { text } = await request(app.getHttpServer())
        .get(path)
        .set('Accept', 'text/html')
        .expect(200);

      expect(text).toContain('Hotel C');
    },
  );

  it('returns static files', async () => {
    await request(app.getHttpServer()).get('/app.js').expect(200);
  });

  it('leaves /api paths to the backend', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/unknown')
      .set('Accept', 'text/html')
      .expect(404);

    expect(body.code).toBe('NOT_FOUND');
  });
});
