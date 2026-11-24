import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReservationStatus } from '../../../generated/prisma/enums.js';

// Status pokoju na dziś (US-01). (DamianTchorzewski_72206)
export enum RoomStatus {
  FREE = 'FREE',
  OCCUPIED = 'OCCUPIED',
  DISABLED = 'DISABLED',
}

export class RoomsQueryDto {
  @ApiPropertyOptional({ description: 'Room type code', example: 'DBL' })
  @IsOptional()
  @MaxLength(20)
  @IsString()
  type?: string;

  @ApiPropertyOptional({ enum: RoomStatus, enumName: 'RoomStatus' })
  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;
}

export class RoomReservationDto {
  @ApiProperty({ example: 'R-000001' })
  number: string;

  @ApiProperty({ format: 'date', example: '2026-12-01' })
  checkIn: string;

  @ApiProperty({ format: 'date', example: '2026-12-04' })
  checkOut: string;

  @ApiProperty({ enum: ReservationStatus, enumName: 'ReservationStatus' })
  status: ReservationStatus;
}

export class RoomDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '102' })
  roomNumber: string;

  @ApiProperty({ example: 'DBL' })
  typeCode: string;

  @ApiProperty({ example: 'Pokój dwuosobowy' })
  typeName: string;

  @ApiProperty({ example: 2 })
  maxCapacity: number;

  @ApiProperty({ example: 250 })
  pricePerNight: number;

  @ApiProperty({ example: 'PLN' })
  currency: string;

  @ApiProperty({ type: [String], example: ['TV', 'Wi-Fi', 'balkon'] })
  amenities: string[];

  @ApiProperty({
    description: 'Status for today',
    enum: RoomStatus,
    enumName: 'RoomStatus',
  })
  status: RoomStatus;

  @ApiProperty({
    description: 'Number of the reservation that occupies the room today',
    type: String,
    nullable: true,
    example: 'R-000001',
  })
  currentReservationNumber: string | null;

  @ApiProperty({ type: [RoomReservationDto] })
  upcomingReservations: RoomReservationDto[];
}

export class RoomsResponseDto {
  @ApiProperty({ type: [RoomDto] })
  items: RoomDto[];
}
