import 'dotenv/config';

// Testy integracyjne używają osobnej bazy na tym samym serwerze, aby nigdy nie dotykać danych deweloperskich. (DamianTchorzewski_72206)
function testDatabaseUrl(): string {
  const explicit = process.env['TEST_DATABASE_URL'];
  if (explicit) {
    return explicit;
  }

  const development = process.env['DATABASE_URL'];
  if (!development) {
    throw new Error('Set TEST_DATABASE_URL or run "npm run setup" first.');
  }
  const url = new URL(development);
  url.pathname = '/hotel_c_test';
  return url.toString();
}

export const TEST_DATABASE_URL = testDatabaseUrl();

// Zabezpieczenie przed uruchomieniem czyszczenia tabel na bazie, która nie jest testowa. (DamianTchorzewski_72206)
export function assertTestDatabase(url: string): string {
  const name = new URL(url).pathname.slice(1);

  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(
      `Refusing to run integration tests on database "${name}". The name must end with "_test".`,
    );
  }

  return name;
}
