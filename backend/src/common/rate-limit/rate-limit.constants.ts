// Okno czasowe limitów żądań, w milisekundach. (DamianTchorzewski_72206)
export const RATE_LIMIT_WINDOW_MS = 60_000;

// Ogólny limit na adres IP dla każdego endpointu osobno. Chroni przed przypadkowym zalaniem API. (DamianTchorzewski_72206)
export const DEFAULT_RATE_LIMIT = 120;

// Logowanie recepcji: utrudnia zgadywanie hasła (dokumentacja: 10 prób na minutę). (DamianTchorzewski_72206)
export const LOGIN_RATE_LIMIT = 10;

// Endpointy partnerów: limit liczony przed sprawdzeniem klucza, aby chronił także przed zgadywaniem kluczy. (DamianTchorzewski_72206)
export const EXTERNAL_RATE_LIMIT = 60;
