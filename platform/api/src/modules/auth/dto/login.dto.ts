import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@maktour.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: 'uuid-of-tenant', description: 'Optional — only needed to disambiguate an email registered in multiple workspaces.' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}
