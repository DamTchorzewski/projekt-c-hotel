#!/bin/sh
# Start na hostingu: migracje, dane startowe do pustej bazy, atrapy partnerów (jeśli włączone) i API. (DamianTchorzewski_72206)
set -e
npx prisma migrate deploy
npm run db:seed
if [ "$USE_PARTNER_MOCKS" = "true" ]; then
  npm run mocks &
fi
exec node dist/main.js
