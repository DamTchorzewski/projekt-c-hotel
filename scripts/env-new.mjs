import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { rotateSecrets, setReceptionPassword } from './env.mjs';
import {
  BACKEND,
  ensureDockerRunning,
  fail,
  hasInstalledDependencies,
  paint,
  ROOT,
  startDatabase,
} from './lib.mjs';

// Nowe klucze w istniejących plikach .env. Uruchomienie: npm run env:new (DamianTchorzewski_72206)
if (
  !existsSync(resolve(ROOT, '.env')) ||
  !existsSync(resolve(BACKEND, '.env')) ||
  !hasInstalledDependencies(BACKEND)
) {
  fail('Run "npm run setup" first.');
}

ensureDockerRunning();
startDatabase();
rotateSecrets();
setReceptionPassword();
// Kontener dostaje nową konfigurację z pliku .env. (DamianTchorzewski_72206)
startDatabase();

console.log(
  `\n${paint('green', 'Done.')} New keys are in .env and backend/.env. Restart "npm start" if it is running.\n`,
);
