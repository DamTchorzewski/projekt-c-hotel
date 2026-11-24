import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { serveFrontend } from './frontend.js';
import { API_PREFIX, setupApp, SWAGGER_PATH } from './app.setup.js';
import { AppModule } from './app.module.js';
import type { EnvironmentVariables } from './config/env.validation.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  setupApp(app);

  // Pozwala poprawnie zamknąć połączenie z bazą przy sygnale SIGTERM (np. w kontenerze). (DamianTchorzewski_72206)
  app.enableShutdownHooks();

  const config =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  app.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));
  const frontend = config.get('FRONTEND_DIST', { infer: true });
  if (frontend) {
    serveFrontend(app, frontend);
  }
  const port = config.get('PORT', { infer: true });
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`API available at http://localhost:${port}/${API_PREFIX}`);
  logger.log(`Swagger docs at http://localhost:${port}/${SWAGGER_PATH}`);
}

await bootstrap();
