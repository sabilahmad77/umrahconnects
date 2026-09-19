import { RawJson } from '../../../common/decorators/raw-json.decorator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { RegulatorySystem, VisaStatus } from '@prisma/client';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.toUpperCase() : value);
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);
/** Stored document links: absolute http(s) URLs or server-relative paths only. */
const SAFE_URL = /^(https?:\/\/|\/(?!\/))[^\s]*$/i;
const MAX_CENTS = 100_000_000_000;

export const VISA_PAYMENT_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'REFUNDED', 'WAIVED'] as const;
/** Statuses a visa application may be created in; decisions happen later. */
export const INITIAL_VISA_STATUSES = [VisaStatus.NOT_STARTED, VisaStatus.DOCUMENTS_COLLECTING] as const;
/** Statuses that are decisions — require visa:application:manage. */
export const VISA_DECISION_STATUSES: string[] = [VisaStatus.APPROVED, VisaStatus.REJECTED];

/** Legacy embedded document shape (imported into VisaDocument rows on read). */
export class LegacyVisaDocumentDto {
  @IsOptional() @IsString() @MaxLength(100) id?: string;
  @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(50) type?: string;
  @IsOptional() @Transform(upper) @IsString() @MaxLength(30) status?: string;
  @IsOptional() @IsString() @MaxLength(2048) @Matches(SAFE_URL, { message: 'url must be an http(s) URL or a server path' }) url?: string | null;
  @IsOptional() @IsDateString() addedAt?: string;
  @IsOptional() @IsDateString() updatedAt?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

class VisaFieldsDto {
  @IsOptional() @Transform(emptyToNull) @IsUUID() pilgrimId?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsUUID() bookingId?: string | null;

  @ApiPropertyOptional({ enum: RegulatorySystem })
  @IsOptional() @Transform(upper) @IsEnum(RegulatorySystem) regulatorySystem?: RegulatorySystem;

  @IsOptional() @IsString() @MaxLength(200) applicantName?: string;
  @IsOptional() @IsString() @MaxLength(50) applicantPassport?: string;
  @IsOptional() @Transform(upper) @IsString() @Length(2, 2) applicantNationality?: string;
  @IsOptional() @IsString() @MaxLength(50) visaType?: string;
  /** Alias of visaType. */
  @IsOptional() @IsString() @MaxLength(50) type?: string;
  @IsOptional() @Transform(upper) @IsString() @Length(2, 2) destinationCountry?: string;
  @IsOptional() @Transform(upper) @IsString() @Length(2, 2) serviceCountry?: string;
  @IsOptional() @IsString() @MaxLength(60) applicationNumber?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(100, { each: true })
  requiredDocuments?: string[];
  @IsOptional() @IsString() @MaxLength(150) assignedOfficer?: string;
  @IsOptional() @Transform(emptyToNull) @IsDateString() expectedCompletionAt?: string | null;

  @ApiPropertyOptional({ description: 'Price in cents' })
  @IsOptional() @IsInt() @Min(0) @Max(MAX_CENTS) priceCents?: number;
  @ApiPropertyOptional({ description: 'Price in major units (SAR)' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000_000) price?: number;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
  /** Whitelisted only so the server can refuse it explicitly — payment state comes from the payments module. */
  @ApiPropertyOptional({ deprecated: true }) @Allow() paymentStatus?: unknown;

  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class CreateVisaDto extends VisaFieldsDto {
  /** Operator the application is filed for: the caller's own organization or an ACTIVE operator organization. */
  @IsOptional() @Transform(emptyToNull) @IsUUID() operatorId?: string | null;
  /** Alias of regulatorySystem. */
  @IsOptional() @Transform(upper) @IsEnum(RegulatorySystem) system?: RegulatorySystem;

  @ApiPropertyOptional({ enum: INITIAL_VISA_STATUSES })
  @IsOptional() @Transform(upper) @IsIn(INITIAL_VISA_STATUSES as unknown as string[], {
    message: `status must be one of: ${INITIAL_VISA_STATUSES.join(', ')}`,
  })
  status?: string;

  /** Alias of applicantPassport. */
  @IsOptional() @IsString() @MaxLength(50) passportNumber?: string;
  /** Alias of applicantNationality. */
  @IsOptional() @Transform(upper) @IsString() @Length(2, 2) nationality?: string;
  /** Accepted for client compatibility; ignored. */
  @IsOptional() @IsString() @MaxLength(50) country?: string;
  /** Accepted for client compatibility; ignored. */
  @IsOptional() @IsString() @MaxLength(50) entryType?: string;
  /** Accepted for client compatibility (web "fees" field); ignored — use price/priceCents. */
  @IsOptional() @IsNumber() @Min(0) fees?: number;

  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => LegacyVisaDocumentDto)
  documents?: LegacyVisaDocumentDto[];
}

export class UpdateVisaDto extends VisaFieldsDto {
  @ApiPropertyOptional({ enum: VisaStatus })
  @IsOptional() @Transform(upper) @IsEnum(VisaStatus) status?: VisaStatus;

  /**
   * Regulator reference / issued visa number. Correcting it needs visa:application:manage.
   * Submission and decision timestamps and the rejection reason are server-stamped by
   * the submit / approve / reject actions and are not accepted here.
   */
  @IsOptional() @IsString() @MaxLength(100) externalRef?: string;
  /** Visa validity end date — only meaningful once the visa is approved. */
  @IsOptional() @Transform(emptyToNull) @IsDateString() expiresAt?: string | null;
}

export class ApproveVisaDto {
  /** Required by the service (checked after the application is found, so foreign ids stay 404). */
  @IsOptional() @IsString() @MaxLength(100) visaNumber?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class RejectVisaDto {
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class CreateVisaDocumentDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(50) type?: string;
  @IsOptional() @IsString() @MaxLength(2048) @Matches(SAFE_URL, { message: 'url must be an http(s) URL or a server path' }) url?: string;
  @IsOptional() @IsString() @MaxLength(30) status?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateVisaDocumentDto {
  @IsOptional() @IsString() @MaxLength(30) status?: string;
  @IsOptional() @IsString() @MaxLength(2048) @Matches(SAFE_URL, { message: 'url must be an http(s) URL or a server path' }) url?: string;
  @IsOptional() @Transform(emptyToNull) @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class RejectVisaDocumentDto {
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class CreateSubmissionDto {
  @ApiProperty({ enum: RegulatorySystem })
  @Transform(upper) @IsEnum(RegulatorySystem) regulatorySystem: RegulatorySystem;
  @IsOptional() @IsString() @MaxLength(100) batchRef?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(1000) @IsUUID(undefined, { each: true }) pilgrimIds?: string[];
  @IsOptional() @IsObject() @RawJson() payload?: Record<string, unknown>;
}

export class QueryVisaDto {
  @IsOptional() @Transform(upper) @IsEnum(VisaStatus) status?: VisaStatus;
  @IsOptional() @Transform(upper) @IsEnum(RegulatorySystem) system?: RegulatorySystem;
  @IsOptional() @IsUUID() pilgrimId?: string;
  @IsOptional() @IsUUID() bookingId?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;
}
