import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { trim } from '../../../common/transformers/string.transformers.js';
import { IsCalendarDate } from '../../../common/validators/is-calendar-date.decorator.js';

// Cyfry z opcjonalnym plusem na początku. Dozwolone są spacje i myślniki, łącznie 7-20 znaków. (DamianTchorzewski_72206)
const PHONE_PATTERN = /^\+?[0-9][0-9 -]{5,18}[0-9]$/;

export class GuestDto {
  @ApiProperty({ maxLength: 100, example: 'Anna' })
  @Transform(trim)
  @MaxLength(100)
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @ApiProperty({ maxLength: 100, example: 'Kowalska' })
  @Transform(trim)
  @MaxLength(100)
  @IsNotEmpty()
  @IsString()
  lastName: string;

  @ApiProperty({
    format: 'email',
    maxLength: 254,
    example: 'anna.kowalska@example.com',
  })
  @Transform(trim)
  @MaxLength(254)
  @IsEmail()
  email: string;

  @ApiProperty({
    description:
      'Digits with an optional leading plus. Spaces and hyphens are allowed, 7 to 20 characters',
    example: '+48123456789',
  })
  @Transform(trim)
  @Matches(PHONE_PATTERN, { message: 'phone must be a valid phone number' })
  phone: string;
}

export class CreatePortalReservationDto {
  @ApiProperty({ description: 'Room type code', example: 'DBL' })
  @Transform(trim)
  @MaxLength(20)
  @IsNotEmpty()
  @IsString()
  roomTypeCode: string;

  @ApiProperty({
    description: 'Arrival date, YYYY-MM-DD. Must not be in the past',
    format: 'date',
    example: '2026-12-01',
  })
  @IsCalendarDate()
  checkIn: string;

  @ApiProperty({
    description:
      'Departure date, YYYY-MM-DD. Later than checkIn, at most 30 nights',
    format: 'date',
    example: '2026-12-04',
  })
  @IsCalendarDate()
  checkOut: string;

  @ApiProperty({
    description: 'Must not exceed the capacity of the room type',
    minimum: 1,
    example: 2,
  })
  @Min(1)
  @IsInt()
  guestsCount: number;

  @ApiProperty({ type: GuestDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => GuestDto)
  guest: GuestDto;

  @ApiPropertyOptional({ maxLength: 1000, example: 'Późny przyjazd' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(1000)
  @IsString()
  notes?: string;
}

export class CreateReceptionReservationDto extends CreatePortalReservationDto {
  @ApiPropertyOptional({
    description:
      'A specific room of the given type. Without it the system assigns the free room with the lowest number',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  roomId?: string;
}
