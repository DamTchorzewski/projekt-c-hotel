import { hashSync } from 'bcryptjs';

// Dane logowania używane wyłącznie w testach integracyjnych. (DamianTchorzewski_72206)
export const TEST_LOGIN = 'recepcja';
export const TEST_PASSWORD = 'integration-test-password';
export const TEST_PASSWORD_HASH = hashSync(TEST_PASSWORD, 4);
export const TEST_API_KEY = 'test-partner-d-key-0001';
