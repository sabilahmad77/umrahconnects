import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { normalizeEmail } from './register.dto';

export class LoginDto {
  @ApiProperty({ example: 'admin@maktour.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ description: 'Only needed to disambiguate an email registered in multiple workspaces.' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}
