import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { IsCalendarDate } from '../../../common/validators/is-calendar-date.decorator.js';
import { RoomTypeDto } from './offer.dto.js';

// Kolejność i przeszłość dat sprawdza reguła RB-02 (INVALID_DATES), a tutaj tylko format (VALIDATION_ERROR). (DamianTchorzewski_72206)
export class AvailabilityQueryDto {
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

  @ApiProperty({ minimum: 1, example: 2 })
  @Type(() => Number)
  @Min(1)
  @IsInt()
  guests: number;
}

export class AvailableRoomTypeDto extends RoomTypeDto {
  @ApiProperty({ description: 'Cost of the whole stay', example: 750 })
  totalPrice: number;

  @ApiProperty({ description: 'Number of free rooms', example: 1 })
  availableRooms: number;

  @ApiPropertyOptional({
    description: 'Numbers of the free rooms, only for the reception session',
    type: [String],
    example: ['103'],
  })
  roomNumbers?: string[];
}

export class AvailabilityResponseDto {
  @ApiProperty({ format: 'date', example: '2026-12-01' })
  checkIn: string;

  @ApiProperty({ format: 'date', example: '2026-12-04' })
  checkOut: string;

  @ApiProperty({ example: 2 })
  guests: number;

  @ApiProperty({ example: 3 })
  nights: number;

  @ApiProperty({
    description: 'Room types with at least one free room. May be empty',
    type: [AvailableRoomTypeDto],
  })
  items: AvailableRoomTypeDto[];
}
