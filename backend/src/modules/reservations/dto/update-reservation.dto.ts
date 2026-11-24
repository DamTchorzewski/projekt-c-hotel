import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { trim } from '../../../common/transformers/string.transformers.js';
import { IsCalendarDate } from '../../../common/validators/is-calendar-date.decorator.js';
import { GuestDto } from './create-reservation.dto.js';

// Pole można pominąć, ale nie można go ustawić na null. (DamianTchorzewski_72206)
const IfPresent = () => ValidateIf((_, value) => value !== undefined);

export class UpdateExternalReservationDto {
  @ApiPropertyOptional({ format: 'date', example: '2026-12-01' })
  @IfPresent()
  @IsCalendarDate()
  checkIn?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-12-04' })
  @IfPresent()
  @IsCalendarDate()
  checkOut?: string;

  @ApiPropertyOptional({ minimum: 1, example: 2 })
  @IfPresent()
  @Min(1)
  @IsInt()
  guestsCount?: number;

  @ApiPropertyOptional({ example: 'DBL' })
  @IfPresent()
  @Transform(trim)
  @MaxLength(20)
  @IsNotEmpty()
  @IsString()
  roomTypeCode?: string;
}

export class UpdateReservationDto extends UpdateExternalReservationDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IfPresent()
  @IsUUID()
  roomId?: string;

  @ApiPropertyOptional({ type: GuestDto })
  @IfPresent()
  @ValidateNested()
  @Type(() => GuestDto)
  guest?: GuestDto;

  @ApiPropertyOptional({
    description:
      'The only field that can be changed in CHECKED_IN and COMPLETED. An empty text removes the notes',
    maxLength: 1000,
  })
  @IfPresent()
  @Transform(trim)
  @MaxLength(1000)
  @IsString()
  notes?: string;
}
