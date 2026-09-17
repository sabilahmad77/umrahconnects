import { RawJson } from '../../../common/decorators/raw-json.decorator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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
  @ApiPropertyOptional({ enum: VISA_PAYMENT_STATUSES })
  @IsOptional() @Transform(upper) @IsIn(VISA_PAYMENT_STATUSES as unknown as string[]) paymentStatus?: string;

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

  @IsOptional() @IsString() @MaxLength(100) externalRef?: string;
  @IsOptional() @IsString() @MaxLength(2000) rejectionReason?: string;
  @IsOptional() @Transform(emptyToNull) @IsDateString() expiresAt?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsDateString() submittedAt?: string | null;
  /** Accepted for client compatibility; decision timestamps are server-stamped. */
  @IsOptional() @Transform(emptyToNull) @IsDateString() decisionAt?: string | null;
}

export class ApproveVisaDto {
  @IsOptional() @IsString() @MaxLength(100) visaNumber?: string;
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
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() system?: string;
  @IsOptional() @IsString() pilgrimId?: string;
  @IsOptional() @IsString() bookingId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() page?: number = 1;
  @IsOptional() @Type(() => Number) @IsNumber() limit?: number = 20;
}
