-- Stary termin u partnera, który czeka na anulowanie po przeniesieniu usługi (US-17). (DamianTchorzewski_72206)
ALTER TABLE "partner_service_bookings" ADD COLUMN "previous_external_booking_id" TEXT;
