import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setReceptionPassword } from './env.mjs';
import { BACKEND, fail, hasInstalledDependencies } from './lib.mjs';

// Nowe hasło konta recepcji. Uruchomienie: npm run reception:password (DamianTchorzewski_72206)
if (!existsSync(resolve(BACKEND, '.env')) || !hasInstalledDependencies(BACKEND)) {
  fail('Run "npm run setup" first.');
}

setReceptionPassword();
console.log('  Restart "npm start" if it is running.');
