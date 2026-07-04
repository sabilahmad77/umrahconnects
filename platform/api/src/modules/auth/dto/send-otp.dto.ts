import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendOtpDto {
  @ApiProperty({ example: '+62812345678' })
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'Must be E.164 format' })
  phone: string;

  @ApiProperty({ default: 'login' })
  @IsString()
  purpose: string = 'login';
}
