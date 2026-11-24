import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { BACKEND, fail, hasInstalledDependencies } from './lib.mjs';

// Wypisuje nowe klucze do panelu hostingu i nigdzie ich nie zapisuje. Uruchomienie: npm run env:production (DamianTchorzewski_72206)
if (!hasInstalledDependencies(BACKEND)) {
  fail('Run "npm run setup" first.');
}

const { hashSync } = createRequire(resolve(BACKEND, 'package.json'))('bcryptjs');
const password = randomBytes(12).toString('base64url');

console.log(`
Copy these values to the Render panel. They are not stored anywhere.

RECEPTION_LOGIN=recepcja
RECEPTION_PASSWORD_HASH=${hashSync(password, 12)}
INTEGRATION_API_KEYS=partner-d:${randomBytes(24).toString('hex')}

Reception password (keep it for yourself): ${password}
`);
