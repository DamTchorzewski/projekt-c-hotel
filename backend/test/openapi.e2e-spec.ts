import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { stringify } from 'yaml';
import { createOpenApiDocument } from '../src/app.setup.js';
import { createTestApp } from './create-test-app.js';

// Kontrakt API jest zapisany w docs/openapi.yaml i udostępniany frontendowi oraz zespołom A, B i D (US-28). (DamianTchorzewski_72206)
// Test zawodzi, gdy kod rozjedzie się z tym plikiem. Po świadomej zmianie kontraktu uruchom: npm run openapi:update (DamianTchorzewski_72206)
describe('OpenAPI contract', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('matches docs/openapi.yaml', async () => {
    const document = createOpenApiDocument(app);

    await expect(
      stringify(document, { aliasDuplicateObjects: false, lineWidth: 0 }),
    ).toMatchFileSnapshot('../../docs/openapi.yaml');
  });
});
