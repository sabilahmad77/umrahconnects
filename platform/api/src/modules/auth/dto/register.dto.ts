import { IsEmail, IsString, IsUUID, MinLength, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Server-authoritative allow-list of roles a visitor may express interest in
 * at public signup. Privileged roles (admin / Super Admin) are NEVER accepted
 * here — they can only be granted by an existing Super Admin via admin tooling.
 * Note: actual role assignment is always server-controlled; `roleInterest` is
 * informational (routes provider onboarding) and gated by this list.
 */
export const PUBLIC_SIGNUP_ROLES = [
  'pilgrim', 'operator', 'hotel', 'transport', 'compliance', 'finance',
] as const;

export class RegisterDto {
  @ApiPropertyOptional({ enum: PUBLIC_SIGNUP_ROLES })
  @IsOptional()
  @IsString()
  roleInterest?: string;

  // Optional: self-registering travelers have no tenant — the service
  // auto-provisions them into the shared community tenant.
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+966501234567' })
  @IsOptional()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'Phone must be E.164 format' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsString()
  lastName: string;
}
