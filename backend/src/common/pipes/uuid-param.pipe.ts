import { ParseUUIDPipe } from '@nestjs/common';
import { domainErrors } from '../errors/domain-errors.js';

// Identyfikator w złym formacie nie może istnieć, więc odpowiedź jest taka sama jak dla nieznanego. (DamianTchorzewski_72206)
export const uuidParamPipe = new ParseUUIDPipe({
  exceptionFactory: () => domainErrors.notFound('The resource does not exist.'),
});
