import { IsString, IsUUID, Matches, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OtpLoginDto {
  @ApiProperty({ example: '+62812345678' })
  @Matches(/^\+[1-9]\d{6,14}$/)
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code: string;

  @ApiProperty()
  @IsUUID()
  tenantId: string;
}

export class SendOtpDto {
  @ApiProperty({ example: '+62812345678' })
  @Matches(/^\+[1-9]\d{6,14}$/)
  phone: string;

  @ApiProperty({ example: 'login', enum: ['login', 'phone_verify', 'password_reset'] })
  @IsString()
  purpose: string = 'login';
}
