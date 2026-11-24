import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ maxLength: 100, example: 'recepcja' })
  @MaxLength(100)
  @IsNotEmpty()
  @IsString()
  login: string;

  @ApiProperty({ maxLength: 200, example: 'your-password' })
  @MaxLength(200)
  @IsNotEmpty()
  @IsString()
  password: string;
}

export class SessionDto {
  @ApiProperty({ example: 'recepcja' })
  login: string;
}
