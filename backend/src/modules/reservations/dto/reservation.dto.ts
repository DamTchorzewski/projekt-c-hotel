import { ApiProperty } from '@nestjs/swagger';
import {
  PartnerType,
  RejectionReason,
  ReservationSource,
  ReservationStatus,
  ServiceSource,
  ServiceStatus,
  VoucherStatus,
} from '../../../generated/prisma/enums.js';

// Potwierdzenie dla gościa: bez identyfikatorów technicznych i danych wewnętrznych. (DamianTchorzewski_72206)
export class ReservationConfirmationDto {
  @ApiProperty({ example: 'R-000123' })
  number: string;

  @ApiProperty({ enum: ReservationStatus, enumName: 'ReservationStatus' })
  status: ReservationStatus;

  @ApiProperty({ example: 'DBL' })
  roomTypeCode: string;

  @ApiProperty({ example: 'Pokój dwuosobowy' })
  roomTypeName: string;

  @ApiProperty({ description: 'Assigned room', example: '103' })
  roomNumber: string;

  @ApiProperty({ format: 'date', example: '2026-12-01' })
  checkIn: string;

  @ApiProperty({ format: 'date', example: '2026-12-04' })
  checkOut: string;

  @ApiProperty({ example: 3 })
  nights: number;

  @ApiProperty({ example: 2 })
  guestsCount: number;

  @ApiProperty({ example: 750 })
  totalPrice: number;

  @ApiProperty({ example: 'PLN' })
  currency: string;
}

export class ReservationGuestDto {
  @ApiProperty({ example: 'Anna' })
  firstName: string;

  @ApiProperty({ example: 'Kowalska' })
  lastName: string;

  @ApiProperty({ format: 'email', example: 'anna.kowalska@example.com' })
  email: string;

  @ApiProperty({ example: '+48123456789' })
  phone: string;
}

export class StayServiceDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: PartnerType, enumName: 'PartnerType' })
  partnerType: PartnerType;

  @ApiProperty({ enum: ServiceSource, enumName: 'ServiceSource' })
  source: ServiceSource;

  @ApiProperty({ example: 'A-MASSAGE-60' })
  partnerServiceId: string;

  @ApiProperty({ example: 'Masaż relaksacyjny' })
  serviceName: string;

  @ApiProperty({ type: Number, nullable: true, example: 180 })
  price: number | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  scheduledAt: string | null;

  @ApiProperty({ type: Number, nullable: true, example: 60 })
  durationMinutes: number | null;

  @ApiProperty({ enum: ServiceStatus, enumName: 'ServiceStatus' })
  status: ServiceStatus;

  @ApiProperty({
    enum: RejectionReason,
    enumName: 'RejectionReason',
    nullable: true,
  })
  rejectionReason: RejectionReason | null;
}

export class PortalReservationDto extends ReservationConfirmationDto {
  @ApiProperty({
    description: 'Stay plan in chronological order, unscheduled items last',
    type: [StayServiceDto],
  })
  services: StayServiceDto[];
}

export class ReservationDto extends PortalReservationDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: ReservationSource, enumName: 'ReservationSource' })
  source: ReservationSource;

  @ApiProperty({ enum: VoucherStatus, enumName: 'VoucherStatus' })
  voucherStatus: VoucherStatus;

  @ApiProperty({ type: String, nullable: true, example: null })
  voucherCode: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Późny przyjazd' })
  notes: string | null;

  @ApiProperty({ type: ReservationGuestDto, nullable: true })
  guest: ReservationGuestDto | null;
}
