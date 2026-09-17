import { IsEmail, IsString, MinLength, MaxLength, IsOptional, Matches, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Roles a visitor may express interest in at public signup. This is
 * informational only: every self-registered account becomes a Traveler in the
 * community organization. Provider roles are obtained through organization
 * onboarding + KYC approval; platform roles only through a Super Admin.
 */
export const PUBLIC_SIGNUP_ROLES = ['pilgrim', 'operator', 'hotel', 'transport', 'compliance', 'finance'] as const;

export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;
export const PASSWORD_MESSAGE = 'Password must be 8–128 characters and include a letter and a number';

export const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @ApiPropertyOptional({ enum: PUBLIC_SIGNUP_ROLES })
  @IsOptional()
  @IsIn(PUBLIC_SIGNUP_ROLES as unknown as string[], { message: 'This role cannot be requested at public signup.' })
  roleInterest?: string;

  @ApiProperty()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty()
  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password!: string;

  @ApiPropertyOptional({ example: '+966501234567' })
  @IsOptional()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'Phone must be E.164 format' })
  phone?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;
}
