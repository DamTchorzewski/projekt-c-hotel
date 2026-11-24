import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsCalendarDate } from '../../../common/validators/is-calendar-date.decorator.js';

export const SERVICE_PARTNERS = ['A', 'B'] as const;
export type ServicePartnerCode = (typeof SERVICE_PARTNERS)[number];

export class PartnerParamDto {
  @ApiProperty({ enum: SERVICE_PARTNERS })
  @IsIn(SERVICE_PARTNERS)
  partner: ServicePartnerCode;
}

export class SlotsQueryDto {
  @ApiProperty({ format: 'date', example: '2026-12-02' })
  @IsCalendarDate()
  date: string;

  @ApiPropertyOptional({ example: 'A-MASSAGE-60' })
  @IsOptional()
  @MaxLength(100)
  @IsString()
  serviceId?: string;
}

export class PartnerServiceDto {
  @ApiProperty({ example: 'A-MASSAGE-60' })
  id: string;

  @ApiProperty({ example: 'Masaż relaksacyjny' })
  name: string;

  @ApiProperty({ example: 'Masaż całego ciała.' })
  description: string;

  @ApiProperty({ example: 60 })
  durationMinutes: number;

  @ApiProperty({ example: 180 })
  price: number;

  @ApiProperty({ example: 'PLN' })
  currency: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  imageUrl: string | null;
}

export class PartnerServicesResponseDto {
  @ApiProperty({ type: [PartnerServiceDto] })
  items: PartnerServiceDto[];
}

export class PartnerSlotDto {
  @ApiProperty({ example: 'A-MASSAGE-60' })
  serviceId: string;

  @ApiProperty({ format: 'date-time', example: '2026-12-02T10:00:00+01:00' })
  startsAt: string;
}

export class PartnerSlotsResponseDto {
  @ApiProperty({ type: [PartnerSlotDto] })
  items: PartnerSlotDto[];
}

export class PartnerOfferDto extends PartnerServicesResponseDto {
  @ApiProperty({ enum: SERVICE_PARTNERS })
  partner: ServicePartnerCode;

  @ApiProperty({
    description:
      'False when the partner does not answer. Items then come from the last known offer and may be empty',
  })
  available: boolean;
}

export class PartnerOffersResponseDto {
  @ApiProperty({ type: [PartnerOfferDto] })
  partners: PartnerOfferDto[];
}
