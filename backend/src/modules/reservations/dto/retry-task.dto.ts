import { ApiProperty } from '@nestjs/swagger';

export enum RetryTaskType {
  CANCEL_SERVICE = 'CANCEL_SERVICE',
  VERIFY_VOUCHER = 'VERIFY_VOUCHER',
  SETTLE_VOUCHER = 'SETTLE_VOUCHER',
}

export class RetryTaskDto {
  @ApiProperty({
    description:
      'service:<service id>, moved:<service id> (old time of a moved service) or voucher:<reservation id>',
    example: 'service:a1b2c3d4-e5f6-4890-abcd-ef1234567890',
  })
  id: string;

  @ApiProperty({ enum: RetryTaskType, enumName: 'RetryTaskType' })
  type: RetryTaskType;

  @ApiProperty({ enum: ['A', 'B', 'D'] })
  partner: 'A' | 'B' | 'D';

  @ApiProperty({ format: 'uuid' })
  reservationId: string;

  @ApiProperty({ example: 'R-000002' })
  reservationNumber: string;

  @ApiProperty({ example: 'Masaż relaksacyjny' })
  description: string;

  @ApiProperty({
    description: 'Current status of the service or of the voucher',
    example: 'CANCEL_RETRY',
  })
  status: string;
}

export class RetryTasksResponseDto {
  @ApiProperty({ type: [RetryTaskDto] })
  items: RetryTaskDto[];
}

export class RetryResultDto {
  @ApiProperty({ example: 'service:a1b2c3d4-e5f6-4890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({
    description: 'False when the partner still does not answer',
  })
  done: boolean;

  @ApiProperty({
    description: 'Status of the service or of the voucher after the attempt',
    example: 'CANCELLED',
  })
  status: string;
}
