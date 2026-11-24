import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { trim } from '../../../common/transformers/string.transformers.js';
import { PartnerType } from '../../../generated/prisma/enums.js';

export class AddServiceDto {
  @ApiProperty({ enum: PartnerType, enumName: 'PartnerType' })
  @IsEnum(PartnerType)
  partnerType: PartnerType;

  @ApiProperty({ maxLength: 100, example: 'A-MASSAGE-60' })
  @Transform(trim)
  @MaxLength(100)
  @IsNotEmpty()
  @IsString()
  partnerServiceId: string;
}

export class BookServiceDto {
  @ApiProperty({
    description: 'Start of the service with a time zone',
    format: 'date-time',
    example: '2026-12-02T10:00:00+01:00',
  })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/, {
    message: 'scheduledAt must contain a time zone',
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  scheduledAt: string;
}
