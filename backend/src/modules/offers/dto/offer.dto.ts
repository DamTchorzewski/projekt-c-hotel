import { ApiProperty } from '@nestjs/swagger';

export class RoomTypeDto {
  @ApiProperty({ description: 'Room type code', example: 'DBL' })
  code: string;

  @ApiProperty({ example: 'Pokój dwuosobowy' })
  name: string;

  @ApiProperty({
    example: 'Pokój z łóżkiem małżeńskim i balkonem.',
  })
  description: string;

  @ApiProperty({ minimum: 1, maximum: 6, example: 2 })
  maxCapacity: number;

  @ApiProperty({ type: [String], example: ['TV', 'Wi-Fi', 'balkon'] })
  amenities: string[];

  @ApiProperty({ description: 'Price per night', example: 250 })
  pricePerNight: number;

  @ApiProperty({ example: 'PLN' })
  currency: string;

  @ApiProperty({
    format: 'uri',
    example: 'https://picsum.photos/seed/hotel-c-dbl/800/600',
  })
  imageUrl: string;
}

export class OffersResponseDto {
  @ApiProperty({ type: [RoomTypeDto] })
  items: RoomTypeDto[];
}
