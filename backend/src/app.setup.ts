import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import {
  API_KEY_HEADER,
  API_KEY_SECURITY_NAME,
  SESSION_COOKIE,
  SESSION_SECURITY_NAME,
} from './common/constants/api.constants.js';
import { validationExceptionFactory } from './common/errors/validation-exception.factory.js';
import { ApiExceptionFilter } from './common/filters/api-exception.filter.js';
import { VALIDATION_OPTIONS } from './common/validation/validation.options.js';
import type { EnvironmentVariables } from './config/env.validation.js';

export const API_PREFIX = 'api/v1';
export const SWAGGER_PATH = 'api/docs';

// Wspólna konfiguracja aplikacji dla main.ts i testów e2e, aby testy sprawdzały to samo, co produkcja. (DamianTchorzewski_72206)
export function setupApp(app: INestApplication): void {
  const config =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  // Wszystkie endpointy są dostępne pod wspólnym, wersjonowanym prefiksem. (DamianTchorzewski_72206)
  app.setGlobalPrefix(API_PREFIX);

  // CORS dopuszcza tylko frontend wskazany w konfiguracji. (DamianTchorzewski_72206)
  app.enableCors({
    origin: config.get('FRONTEND_URL', { infer: true }),
    // Panel recepcji wysyła ciasteczko sesji. (DamianTchorzewski_72206)
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Odrzuca nieznane pola i konwertuje dane wejściowe na typy z DTO. (DamianTchorzewski_72206)
  app.useGlobalPipes(
    new ValidationPipe({
      ...VALIDATION_OPTIONS,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  // Każdy błąd, także nieoczekiwany, wychodzi w jednolitym formacie z kontraktu API. (DamianTchorzewski_72206)
  app.useGlobalFilters(new ApiExceptionFilter(app.get(HttpAdapterHost)));

  // Swagger musi być skonfigurowany po prefiksie, aby ścieżki w dokumentacji były poprawne. (DamianTchorzewski_72206)
  SwaggerModule.setup(SWAGGER_PATH, app, createOpenApiDocument(app));
}

// Buduje dokument OpenAPI, który jest maszynowo odczytywalną wersją kontraktu API. (DamianTchorzewski_72206)
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const options = new DocumentBuilder()
    .setTitle('Hotel C REST API')
    .setDescription(
      'Hotel system API: guest portal, reception panel and endpoints for partner systems. Follows the project documentation 0.3.',
    )
    .setVersion('0.3.0')
    // OpenAPI 3.1 opisuje null jako zwykły typ. W wersji 3.0 pole nullable z odwołaniem do schematu formalnie nie dopuszcza null. (DamianTchorzewski_72206)
    .setOpenAPIVersion('3.1.0')
    .addServer('http://localhost:3000', 'Local development')
    .addApiKey(
      { type: 'apiKey', name: API_KEY_HEADER, in: 'header' },
      API_KEY_SECURITY_NAME,
    )
    .addCookieAuth(
      SESSION_COOKIE,
      { type: 'apiKey', in: 'cookie' },
      SESSION_SECURITY_NAME,
    )
    .addTag('health', 'Application and database status')
    .addTag('auth', 'Reception login')
    .addTag('offers', 'Room types and availability')
    .addTag('portal', 'Guest portal')
    .addTag('rooms', 'Room register for the reception')
    .addTag('reservations', 'Reservations made by the reception')
    .addTag('partners', 'Services of partners A and B')
    .addTag('retry-tasks', 'Operations to retry')
    .addTag('external', 'Endpoints for partner systems')
    .build();

  return SwaggerModule.createDocument(app, options);
}
