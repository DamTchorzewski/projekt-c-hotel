import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trim } from '../../../common/transformers/string.transformers.js';
import { IsCalendarDate } from '../../../common/validators/is-calendar-date.decorator.js';
import {
  ReservationSource,
  ReservationStatus,
  VoucherStatus,
} from '../../../generated/prisma/enums.js';

export class ReservationsQueryDto {
  @ApiPropertyOptional({
    description: 'Part of the reservation number or of the last name',
    maxLength: 100,
    example: 'Kowalska',
  })
  @IsOptional()
  @Transform(trim)
  @MaxLength(100)
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'First day of the range, stays that overlap it are returned',
    format: 'date',
  })
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @ApiPropertyOptional({ description: 'Last day of the range', format: 'date' })
  @IsOptional()
  @IsCalendarDate()
  to?: string;

  @ApiPropertyOptional({
    enum: ReservationStatus,
    enumName: 'ReservationStatus',
  })
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @ApiPropertyOptional({
    enum: ReservationSource,
    enumName: 'ReservationSource',
  })
  @IsOptional()
  @IsEnum(ReservationSource)
  source?: ReservationSource;

  @ApiPropertyOptional({ minimum: 1, maximum: 10000, default: 1 })
  @Type(() => Number)
  @Max(10000)
  @Min(1)
  @IsInt()
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @Max(100)
  @Min(1)
  @IsInt()
  pageSize: number = 20;
}

export class PortalReservationQueryDto {
  @ApiProperty({ format: 'email', example: 'anna.kowalska@example.com' })
  @Transform(trim)
  @MaxLength(254)
  @IsEmail()
  email: string;
}

export class ReservationListItemDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'R-000001' })
  number: string;

  @ApiProperty({ example: 'Anna Kowalska' })
  guestName: string;

  @ApiProperty({ example: '102' })
  roomNumber: string;

  @ApiProperty({ example: 'DBL' })
  roomTypeCode: string;

  @ApiProperty({ format: 'date', example: '2026-12-01' })
  checkIn: string;

  @ApiProperty({ format: 'date', example: '2026-12-04' })
  checkOut: string;

  @ApiProperty({ enum: ReservationStatus, enumName: 'ReservationStatus' })
  status: ReservationStatus;

  @ApiProperty({ enum: ReservationSource, enumName: 'ReservationSource' })
  source: ReservationSource;

  @ApiProperty({ enum: VoucherStatus, enumName: 'VoucherStatus' })
  voucherStatus: VoucherStatus;
}

export class ReservationsResponseDto {
  @ApiProperty({ type: [ReservationListItemDto] })
  items: ReservationListItemDto[];

  @ApiProperty({ description: 'Number of all matching items', example: 4 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  pageSize: number;
}
