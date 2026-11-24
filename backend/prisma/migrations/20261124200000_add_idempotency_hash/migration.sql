-- Skrót treści żądania pozwala odróżnić powtórzenie od innego żądania z tym samym kluczem (RB-17). (DamianTchorzewski_72206)
ALTER TABLE "reservations" ADD COLUMN "idempotency_hash" TEXT;
