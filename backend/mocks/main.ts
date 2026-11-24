import { PartnerMocks } from './partner-mocks.js';

// Uruchomienie: npm run mocks (DamianTchorzewski_72206)
const port = Number(process.env['MOCKS_PORT'] ?? 4000);
const host = process.env['MOCKS_HOST'] ?? '127.0.0.1';

const mocks = new PartnerMocks();
await mocks.start(port, host);
console.log(`Partner mocks listen on http://localhost:${port}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void mocks.stop().then(() => process.exit(0));
  });
}
