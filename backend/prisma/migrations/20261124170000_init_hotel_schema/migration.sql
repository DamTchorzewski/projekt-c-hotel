-- Sekwencja numerów rezerwacji R-000001 - R-999999. Musi powstać przed tabelą, która z niej korzysta. (DamianTchorzewski_72206)
CREATE SEQUENCE "reservation_number_seq" MAXVALUE 999999;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationSource" AS ENUM ('PORTAL', 'RECEPTION', 'PARTNER_D');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('NONE', 'PENDING_VERIFICATION', 'VERIFIED', 'INVALID', 'SETTLED', 'SETTLEMENT_RETRY');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('MASSAGE_A', 'TRAINING_B');

-- CreateEnum
CREATE TYPE "ServiceSource" AS ENUM ('PACKAGE', 'EXTRA');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('TO_ORDER', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'CANCEL_RETRY');

-- CreateEnum
CREATE TYPE "RejectionReason" AS ENUM ('SLOT_TAKEN', 'PARTNER_UNAVAILABLE', 'PARTNER_ERROR');

-- CreateEnum
CREATE TYPE "Partner" AS ENUM ('A', 'B', 'D');

-- CreateTable
CREATE TABLE "room_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "max_capacity" SMALLINT NOT NULL,
    "base_price_per_night" DECIMAL(10,2) NOT NULL,
    "amenities" TEXT[],
    "description" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,

    CONSTRAINT "room_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "room_number" TEXT NOT NULL,
    "room_type_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL DEFAULT ('R-'::text || lpad((nextval('reservation_number_seq'::regclass))::text, 6, '0'::text)),
    "room_id" UUID NOT NULL,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "guests_count" SMALLINT NOT NULL,
    "total_price" DECIMAL(10,2) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" "ReservationSource" NOT NULL,
    "voucher_code" TEXT,
    "voucher_status" "VoucherStatus" NOT NULL DEFAULT 'NONE',
    "idempotency_key" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_guests" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "reservation_guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_service_bookings" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "partner_type" "PartnerType" NOT NULL,
    "source" "ServiceSource" NOT NULL,
    "partner_service_id" TEXT NOT NULL,
    "service_name" TEXT NOT NULL,
    "price" DECIMAL(10,2),
    "scheduled_at" TIMESTAMPTZ,
    "duration_minutes" SMALLINT,
    "status" "ServiceStatus" NOT NULL DEFAULT 'TO_ORDER',
    "external_booking_id" TEXT,
    "rejection_reason" "RejectionReason",
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "partner_service_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_logs" (
    "id" BIGSERIAL NOT NULL,
    "partner" "Partner" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "reservation_id" UUID,
    "http_status" INTEGER,
    "latency_ms" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "room_types_code_key" ON "room_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_room_number_key" ON "rooms"("room_number");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_number_key" ON "reservations"("number");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_idempotency_key_key" ON "reservations"("idempotency_key");

-- CreateIndex
CREATE INDEX "reservations_room_id_check_in_check_out_idx" ON "reservations"("room_id", "check_in", "check_out");

-- CreateIndex
CREATE INDEX "partner_service_bookings_reservation_id_idx" ON "partner_service_bookings"("reservation_id");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_guests" ADD CONSTRAINT "reservation_guests_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_service_bookings" ADD CONSTRAINT "partner_service_bookings_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_logs" ADD CONSTRAINT "integration_logs_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Poniższe ograniczenia dodano ręcznie, ponieważ Prisma nie potrafi ich opisać w schemacie. (DamianTchorzewski_72206)
ALTER SEQUENCE "reservation_number_seq" OWNED BY "reservations"."number";

ALTER TABLE "room_types" ADD CONSTRAINT "room_types_capacity_check" CHECK ("max_capacity" BETWEEN 1 AND 6);
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_price_check" CHECK ("base_price_per_night" > 0);

-- RB-02 i RB-03: co najmniej jedna noc i jeden gość. (DamianTchorzewski_72206)
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_dates_check" CHECK ("check_out" > "check_in");
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_guests_check" CHECK ("guests_count" > 0);

-- RB-01: jeden pokój nie może mieć dwóch aktywnych rezerwacji o nakładających się terminach. (DamianTchorzewski_72206)
-- Zakres [) oznacza, że dzień wyjazdu jednego gościa może być dniem przyjazdu kolejnego. (DamianTchorzewski_72206)
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_no_overlap"
    EXCLUDE USING gist ("room_id" WITH =, daterange("check_in", "check_out", '[)') WITH &&)
    WHERE ("status" IN ('CONFIRMED', 'CHECKED_IN'));

-- RB-18: jeden voucher, jedna aktywna rezerwacja. (DamianTchorzewski_72206)
CREATE UNIQUE INDEX "reservations_active_voucher_key" ON "reservations"("voucher_code")
    WHERE "voucher_code" IS NOT NULL AND "status" IN ('CONFIRMED', 'CHECKED_IN');

-- Rezerwacja ma najwyżej jednego gościa głównego. (DamianTchorzewski_72206)
CREATE UNIQUE INDEX "reservation_guests_primary_key" ON "reservation_guests"("reservation_id") WHERE "is_primary";
