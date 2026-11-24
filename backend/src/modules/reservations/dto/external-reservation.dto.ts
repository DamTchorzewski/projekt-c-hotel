import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { trim } from '../../../common/transformers/string.transformers.js';
import { PartnerType } from '../../../generated/prisma/enums.js';
import { CreatePortalReservationDto } from './create-reservation.dto.js';
import { ReservationDto } from './reservation.dto.js';

export class PackageServiceDto {
  @ApiProperty({ enum: PartnerType, enumName: 'PartnerType' })
  @IsEnum(PartnerType)
  partnerType: PartnerType;

  @ApiProperty({ maxLength: 100, example: 'A-MASSAGE-60' })
  @Transform(trim)
  @MaxLength(100)
  @IsNotEmpty()
  @IsString()
  partnerServiceId: string;

  @ApiProperty({ maxLength: 200, example: 'Masaż relaksacyjny' })
  @Transform(trim)
  @MaxLength(200)
  @IsNotEmpty()
  @IsString()
  serviceName: string;

  @ApiProperty({ minimum: 1, maximum: 10, example: 1 })
  @Max(10)
  @Min(1)
  @IsInt()
  quantity: number;
}

export class CreateExternalReservationDto extends OmitType(
  CreatePortalReservationDto,
  ['notes'] as const,
) {
  // Brak kodu ma własny kod błędu VOUCHER_REQUIRED, dlatego pole jest tu opcjonalne. (DamianTchorzewski_72206)
  @ApiProperty({ maxLength: 50, example: 'TEST-C-0001' })
  @IsOptional()
  @Transform(trim)
  @Matches(/^[A-Za-z0-9_-]{0,50}$/, {
    message:
      'voucherCode may contain only letters, digits, hyphens and underscores, up to 50 characters',
  })
  @IsString()
  voucherCode?: string;

  @ApiPropertyOptional({ type: [PackageServiceDto], maxItems: 20 })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PackageServiceDto)
  @ArrayMaxSize(20)
  @IsArray()
  packageServices?: PackageServiceDto[];
}

// System D nie widzi uwag recepcji. (DamianTchorzewski_72206)
export class ExternalReservationDto extends OmitType(ReservationDto, [
  'notes',
] as const) {}
