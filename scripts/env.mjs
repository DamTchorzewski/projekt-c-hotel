import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { BACKEND, fail, paint, ROOT } from './lib.mjs';

const ROOT_ENV = resolve(ROOT, '.env');
const BACKEND_ENV = resolve(BACKEND, '.env');

const secret = (bytes) => randomBytes(bytes).toString('hex');

export function readValue(file, key) {
  if (!existsSync(file)) {
    return '';
  }
  const match = new RegExp(`^${key}=(.*)$`, 'm').exec(
    readFileSync(file, 'utf8'),
  );
  return match ? match[1].trim().replace(/^(['"])(.*)\1$/, '$2') : '';
}

// Zmienia wartość w istniejącej linii albo dopisuje nową. Funkcja zamiast tekstu, bo skrót bcrypt zawiera znaki "$". (DamianTchorzewski_72206)
function writeValue(file, key, value) {
  const content = readFileSync(file, 'utf8');
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  writeFileSync(
    file,
    pattern.test(content)
      ? content.replace(pattern, () => line)
      : `${content.trimEnd()}\n${line}\n`,
  );
}

function databaseUrl(password) {
  const user = readValue(ROOT_ENV, 'POSTGRES_USER');
  const name = readValue(ROOT_ENV, 'POSTGRES_DB');
  const port = readValue(ROOT_ENV, 'POSTGRES_PORT');
  return `"postgresql://${user}:${password}@localhost:${port}/${name}"`;
}

function createFromExample(directory, file) {
  writeFileSync(file, readFileSync(resolve(directory, '.env.example'), 'utf8'));
  console.log(`${paint('cyan', '>')} created ${file}`);
}

// Każdy komputer dostaje własne, losowe klucze. Ustawionych wartości skrypt nie zmienia. (DamianTchorzewski_72206)
export function ensureEnvFiles() {
  if (!existsSync(ROOT_ENV)) {
    createFromExample(ROOT, ROOT_ENV);
  }
  if (!readValue(ROOT_ENV, 'POSTGRES_PASSWORD')) {
    writeValue(ROOT_ENV, 'POSTGRES_PASSWORD', secret(16));
  }

  if (!existsSync(BACKEND_ENV)) {
    createFromExample(BACKEND, BACKEND_ENV);
  }
  if (!readValue(BACKEND_ENV, 'DATABASE_URL')) {
    writeValue(
      BACKEND_ENV,
      'DATABASE_URL',
      databaseUrl(readValue(ROOT_ENV, 'POSTGRES_PASSWORD')),
    );
  }
  if (!readValue(BACKEND_ENV, 'SESSION_SECRET')) {
    writeValue(BACKEND_ENV, 'SESSION_SECRET', secret(32));
  }
  if (!readValue(BACKEND_ENV, 'INTEGRATION_API_KEYS')) {
    writeValue(BACKEND_ENV, 'INTEGRATION_API_KEYS', `partner-d:${secret(24)}`);
  }
  if (!readValue(BACKEND_ENV, 'RECEPTION_LOGIN')) {
    writeValue(BACKEND_ENV, 'RECEPTION_LOGIN', 'recepcja');
  }
}

// Hasło pokazujemy tylko raz, a w pliku zostaje jego skrót. (DamianTchorzewski_72206)
export function setReceptionPassword() {
  const { hashSync } = createRequire(resolve(BACKEND, 'package.json'))(
    'bcryptjs',
  );
  const password = randomBytes(9).toString('base64url');
  writeValue(
    BACKEND_ENV,
    'RECEPTION_PASSWORD_HASH',
    `'${hashSync(password, 10)}'`,
  );
  console.log(
    `${paint('cyan', '>')} Reception account: login ${readValue(BACKEND_ENV, 'RECEPTION_LOGIN')}, password ${paint('yellow', password)}\n  Save it now, it is not stored anywhere. A new one: npm run reception:password`,
  );
}

export function hasReceptionPassword() {
  return readValue(BACKEND_ENV, 'RECEPTION_PASSWORD_HASH') !== '';
}

// Wymienia klucze lokalne. Baza musi działać, bo jej hasło trzeba zmienić także w działającym PostgreSQL. (DamianTchorzewski_72206)
export function rotateSecrets() {
  const user = readValue(ROOT_ENV, 'POSTGRES_USER');
  const name = readValue(ROOT_ENV, 'POSTGRES_DB');
  const password = secret(16);

  const result = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'psql', '-U', user, '-d', name, '-q'],
    {
      cwd: ROOT,
      input: `ALTER USER "${user}" WITH PASSWORD '${password}';\n`,
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  );
  if (result.status !== 0) {
    fail('Could not change the database password. Nothing was changed.');
  }

  writeValue(ROOT_ENV, 'POSTGRES_PASSWORD', password);
  writeValue(BACKEND_ENV, 'DATABASE_URL', databaseUrl(password));
  writeValue(BACKEND_ENV, 'SESSION_SECRET', secret(32));
  writeValue(BACKEND_ENV, 'INTEGRATION_API_KEYS', `partner-d:${secret(24)}`);
}
