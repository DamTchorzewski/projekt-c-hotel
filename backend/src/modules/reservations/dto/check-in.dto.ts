import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class CheckInDto {
  @ApiPropertyOptional({
    description:
      'The reception consciously accepts a voucher that could not be verified',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  conditional?: boolean;
}
