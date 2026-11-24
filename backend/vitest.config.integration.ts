import { defineConfig } from 'vitest/config';
import {
  TEST_API_KEY,
  TEST_LOGIN,
  TEST_PASSWORD_HASH,
} from './test/integration/test-credentials.js';
import { TEST_DATABASE_URL } from './test/integration/test-database.js';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.integration-spec.ts'],
    globalSetup: ['./test/integration/global-setup.ts'],
    // Wszystkie pliki współdzielą jedną bazę, więc nie mogą działać równolegle. (DamianTchorzewski_72206)
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      FRONTEND_URL: 'http://localhost:5173',
      RATE_LIMIT_ENABLED: 'false',
      RECEPTION_LOGIN: TEST_LOGIN,
      RECEPTION_PASSWORD_HASH: TEST_PASSWORD_HASH,
      INTEGRATION_API_KEYS:
        `partner-d:${TEST_API_KEY}`,
    },
  },
});
