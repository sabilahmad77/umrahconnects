import { RawJson } from '../../../common/decorators/raw-json.decorator';
import { IsEnum, IsUUID, IsOptional, IsString, MaxLength } from 'class-validator';
import { TenantStatus, UserStatus } from '@prisma/client';

/**
 * Super Admin mutations are the most privileged operations on the platform,
 * so their inputs are validated against the real Prisma enums rather than
 * accepted as free-form strings (an invalid value used to reach Prisma and
 * surface as a 500).
 */
export class SetTenantStatusDto {
  @IsEnum(TenantStatus, {
    message: `status must be one of: ${Object.values(TenantStatus).join(', ')}`,
  })
  status: TenantStatus;

  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class SetUserStatusDto {
  @IsEnum(UserStatus, {
    message: `status must be one of: ${Object.values(UserStatus).join(', ')}`,
  })
  status: UserStatus;

  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

/** Platform takedown of a marketplace listing (F2): the reason is shown to the listing's owner. */
export class TakeDownListingDto {
  @IsString() @MinLength(3, { message: 'Give the seller a reason of at least 3 characters' }) @MaxLength(500)
  reason!: string;
}

/** Legacy DELETE /admin/listings/:id: the reason is optional there. */
export class RemoveListingDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(500) reason?: string;
}

export class AssignRoleDto {
  @IsUUID('4', { message: 'roleId must be a valid role id' })
  roleId: string;
}

import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsObject, Max, Min, ArrayMaxSize, ArrayMinSize, ValidateNested, IsNumber, Matches, MinLength } from 'class-validator';

/** Shared list/filter query for platform admin listings (unknown keys are rejected). */
export class AdminListQueryDto {
  @IsOptional() @IsString() @MaxLength(40) status?: string;
  @IsOptional() @IsString() @MaxLength(40) type?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsUUID() tenantId?: string;
  @IsOptional() @IsUUID() actorId?: string;
  @IsOptional() @IsString() @MaxLength(40) action?: string;
  @IsOptional() @IsString() @MaxLength(100) resource?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

/** Reference to a file uploaded through POST /documents/kyc. */
export class KycDocumentRefDto {
  @IsString() @MaxLength(300) @Matches(/^kyc\/[0-9a-f-]{36}\/[\w.-]+$/) storageKey!: string;
  @IsOptional() @IsIn(['local', 'r2', 's3']) driver?: string;
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(120) mimeType?: string;
  @IsOptional() @IsNumber() sizeBytes?: number;
  @IsOptional() @IsString() @MaxLength(64) checksum?: string;
  @IsOptional() @IsString() @MaxLength(60) type?: string;
}

export const REGISTRY_SOURCES = ['NUSUK_MASAR', 'SISKOPATUH', 'NAHCON', 'DIYANET', 'TABUNG_HAJI', 'MOTAC', 'IBA_DGRP', 'MANUAL'] as const;

export class CreateKycDto {
  @IsUUID() tenantId!: string;
  @IsOptional() @IsString() @MaxLength(40) registrySource?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => KycDocumentRefDto) documents?: KycDocumentRefDto[];
  @IsOptional() @IsObject() @RawJson() registryData?: Record<string, unknown>;
}

export class KycDecisionDto {
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

/**
 * The reason is shown to the organization so it can correct its submission,
 * which is why an empty or one-word placeholder is refused.
 */
export class KycRejectDto {
  @IsString() @MinLength(3, { message: 'Give the organization a reason of at least 3 characters' }) @MaxLength(1000) reason!: string;
}

/**
 * An organization's own verification submission. At least one uploaded
 * document is required: a submission with nothing to review would only sit in
 * the queue and could never be approved on evidence.
 */
export class TenantKycSubmissionDto {
  @IsIn(REGISTRY_SOURCES as unknown as string[]) registrySource!: string;
  @IsOptional() @IsString() @MaxLength(100) licenseNumber?: string;
  @IsOptional() @IsObject() @RawJson() registryData?: Record<string, unknown>;
  @IsArray()
  @ArrayMinSize(1, { message: 'Upload at least one verification document' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => KycDocumentRefDto)
  documents!: KycDocumentRefDto[];
}
