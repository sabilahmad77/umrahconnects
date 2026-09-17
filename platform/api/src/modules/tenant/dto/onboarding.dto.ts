import { IsEmail, IsIn, IsISO31661Alpha2, IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator';

export const ONBOARDING_TYPES = ['OPERATOR', 'MU_ASSASA', 'VENDOR_HOTEL', 'VENDOR_TRANSPORT', 'VENDOR_VISA'] as const;

export class CreateOrganizationDto {
  @IsIn(ONBOARDING_TYPES as unknown as string[]) type!: (typeof ONBOARDING_TYPES)[number];
  @IsString() @MinLength(2) @MaxLength(255) name!: string;
  @IsOptional() @IsString() @MaxLength(255) nameAr?: string;
  @IsOptional() @Matches(/^[a-z0-9-]{3,100}$/, { message: 'Slug must be 3–100 lowercase letters, digits or hyphens' }) slug?: string;
  @IsOptional() @IsEmail() @MaxLength(255) email?: string;
  @IsOptional() @Matches(/^\+[1-9]\d{6,14}$/, { message: 'Phone must be E.164 format' }) phone?: string;
  @IsISO31661Alpha2() country!: string;
  @IsOptional() @IsString() @MaxLength(100) licenseNumber?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(255) website?: string;
}
