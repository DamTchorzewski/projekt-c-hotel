import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { resolve } from 'node:path';

// Podaje zbudowany frontend spod tego samego adresu co API, dzięki czemu działa ciasteczko sesji recepcji. (DamianTchorzewski_72206)
export function serveFrontend(
  app: NestExpressApplication,
  directory: string,
): void {
  const root = resolve(directory);
  app.useStaticAssets(root);

  // Adresy podstron obsługuje router frontendu, a ścieżki /api zostają dla backendu. (DamianTchorzewski_72206)
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (
      request.method !== 'GET' ||
      request.path === '/api' ||
      request.path.startsWith('/api/') ||
      !request.accepts('html')
    ) {
      next();
      return;
    }
    response.sendFile('index.html', { root });
  });
}
