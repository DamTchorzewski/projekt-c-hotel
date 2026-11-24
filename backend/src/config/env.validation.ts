// Dekoratory class-transformer wymagają polyfilla metadanych, więc moduł nie może zależeć od kolejności importów. (DamianTchorzewski_72206)
import 'reflect-metadata';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';
import { INTEGRATION_API_KEYS_PATTERN } from '../common/security/api-keys.js';
import { toBoolean } from '../common/transformers/string.transformers.js';

export enum NodeEnvironment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

// Zmienna wymagana w produkcji, a lokalnie opcjonalna. (DamianTchorzewski_72206)
function requiredInProduction(
  key: keyof EnvironmentVariables,
): (env: EnvironmentVariables) => boolean {
  return (env) =>
    env.NODE_ENV === NodeEnvironment.Production || env[key] !== undefined;
}

function realPartnerUrl(
  key: 'PARTNER_A_URL' | 'PARTNER_B_URL' | 'PARTNER_D_URL',
): (env: EnvironmentVariables) => boolean {
  return (env) =>
    env[key] !== undefined ||
    !(env.USE_PARTNER_MOCKS ?? env.NODE_ENV !== NodeEnvironment.Production);
}

// Zmienne środowiskowe wymagane przez aplikację wraz z wartościami domyślnymi. (DamianTchorzewski_72206)
export class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment = NodeEnvironment.Development;

  // Wartości z process.env są tekstem, więc port wymaga jawnej konwersji na liczbę. (DamianTchorzewski_72206)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  // Adres frontendu dopuszczony przez CORS. (DamianTchorzewski_72206)
  @IsUrl({ require_tld: false, require_protocol: true })
  FRONTEND_URL: string = 'http://localhost:5173';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  // Wyłączenie limitu żądań ma sens tylko lokalnie lub w testach. Domyślnie limit jest włączony. (DamianTchorzewski_72206)
  @Transform(toBoolean)
  @IsBoolean()
  RATE_LIMIT_ENABLED: boolean = true;

  // Klucze systemów partnerów dla endpointów /external. Bez nich nikt nie ma dostępu. (DamianTchorzewski_72206)
  @ValidateIf(requiredInProduction('INTEGRATION_API_KEYS'))
  @Matches(INTEGRATION_API_KEYS_PATTERN, {
    message:
      'INTEGRATION_API_KEYS must look like name:key,name:key where every key has 16 to 128 characters',
  })
  INTEGRATION_API_KEYS?: string;

  // Konto recepcji. Bez loginu i skrótu hasła nikt nie zaloguje się do panelu. (DamianTchorzewski_72206)
  @ValidateIf(requiredInProduction('RECEPTION_LOGIN'))
  @IsNotEmpty()
  @IsString()
  RECEPTION_LOGIN?: string;

  @ValidateIf(requiredInProduction('RECEPTION_PASSWORD_HASH'))
  @Matches(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/, {
    message: 'RECEPTION_PASSWORD_HASH must be a bcrypt hash',
  })
  RECEPTION_PASSWORD_HASH?: string;

  // Sekret podpisu sesji. Lokalnie może go nie być: wtedy sesje wygasają po restarcie aplikacji. (DamianTchorzewski_72206)
  @ValidateIf(requiredInProduction('SESSION_SECRET'))
  @MinLength(32)
  @IsString()
  SESSION_SECRET?: string;

  // Atrapy partnerów zamiast prawdziwych systemów. Domyślnie włączone poza produkcją. (DamianTchorzewski_72206)
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  USE_PARTNER_MOCKS?: boolean;

  @IsUrl({ require_tld: false, require_protocol: true })
  PARTNER_MOCKS_URL: string = 'http://localhost:4000';

  // Adresy i klucze prawdziwych partnerów. Adresy są wymagane, gdy atrapy są wyłączone. (DamianTchorzewski_72206)
  @ValidateIf(realPartnerUrl('PARTNER_A_URL'))
  @IsUrl({ require_tld: false, require_protocol: true })
  PARTNER_A_URL?: string;

  @ValidateIf(realPartnerUrl('PARTNER_B_URL'))
  @IsUrl({ require_tld: false, require_protocol: true })
  PARTNER_B_URL?: string;

  @ValidateIf(realPartnerUrl('PARTNER_D_URL'))
  @IsUrl({ require_tld: false, require_protocol: true })
  PARTNER_D_URL?: string;

  @IsOptional()
  @IsString()
  PARTNER_A_API_KEY?: string;

  @IsOptional()
  @IsString()
  PARTNER_B_API_KEY?: string;

  @IsOptional()
  @IsString()
  PARTNER_D_API_KEY?: string;

  // Katalog zbudowanego frontendu. Ustawiony na hostingu, gdzie API i strona mają jeden adres. (DamianTchorzewski_72206)
  @IsOptional()
  @IsString()
  FRONTEND_DIST?: string;

  // Liczba zaufanych serwerów pośredniczących (np. 1 na hostingu), aby limit żądań liczył prawdziwe adresy IP. (DamianTchorzewski_72206)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  TRUST_PROXY_HOPS: number = 0;
}

// Waliduje konfigurację przy starcie, dzięki czemu aplikacja nie uruchomi się z błędnymi ustawieniami. (DamianTchorzewski_72206)
export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  // Pusta wartość w pliku .env znaczy to samo co jej brak. (DamianTchorzewski_72206)
  const defined = Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== ''),
  );
  const validated = plainToInstance(EnvironmentVariables, defined);
  const errors = validateSync(validated);

  if (errors.length > 0) {
    const details = errors
      .map(
        (error) =>
          `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
      )
      .join('; ');
    throw new Error(`Invalid environment configuration - ${details}`);
  }

  return validated;
}
