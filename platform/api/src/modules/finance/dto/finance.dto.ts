import { RawJson } from '../../../common/decorators/raw-json.decorator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { InvoiceStatus, PaymentStatus } from '@prisma/client';

const MAX_MAJOR = 1_000_000_000; // 1bn SAR
const MAX_CENTS = 100_000_000_000;
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.toUpperCase() : value);
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export const INVOICE_TYPES = ['CUSTOMER', 'VENDOR', 'CREDIT_NOTE'] as const;

/**
 * Line items are stored as JSON. Several shapes are in use (web: qty/unitPrice,
 * API scripts: quantity/unitPriceCents, booking-generated: qty/unitPriceCents/totalCents),
 * so all are accepted — but every field is typed and bounded.
 */
export class LineItemDto {
  @IsString() @MaxLength(500) description: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100_000) qty?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100_000) quantity?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MAJOR) unitPrice?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_CENTS) unitPriceCents?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MAJOR) total?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_CENTS) totalCents?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) vatRate?: number;
}

export class CreateInvoiceDto {
  @ApiPropertyOptional({ enum: INVOICE_TYPES })
  @IsOptional() @Transform(upper) @IsIn(INVOICE_TYPES as unknown as string[])
  type?: string;

  @IsOptional() @Transform(emptyToNull) @IsUUID() bookingId?: string | null;
  @IsOptional() @IsUUID() pilgrimId?: string;
  @IsOptional() @IsUUID() vendorId?: string;

  @IsOptional() @IsString() @MaxLength(200) issuedToName?: string;
  @IsOptional() @IsString() @MaxLength(200) counterpartyName?: string;
  /** Alias sent by API scripts. */
  @IsOptional() @IsString() @MaxLength(200) clientName?: string;
  /** Accepted for client compatibility; not persisted. */
  @IsOptional() @IsEmail() @MaxLength(255) counterpartyEmail?: string;
  @IsOptional() @IsObject() @RawJson() issuedToAddress?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Subtotal in major units (SAR)' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MAJOR) subtotal?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_CENTS) subtotalCents?: number;
  @ApiPropertyOptional({ description: 'Tax in major units (SAR)' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MAJOR) tax?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_CENTS) taxCents?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_CENTS) discountCents?: number;
  /** Ignored — the total is computed server-side (subtotal + tax − discount). */
  @IsOptional() @IsNumber() total?: number;
  /** Ignored — the total is computed server-side. */
  @IsOptional() @IsNumber() totalCents?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) vatRate?: number;

  @IsOptional() @IsString() @Length(3, 3) currency?: string;

  @IsOptional() @IsDateString() issuedAt?: string;
  /** Alias of issuedAt (date only). */
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @Transform(emptyToNull) @IsDateString() dueAt?: string | null;
  /** Alias of dueAt. */
  @IsOptional() @Transform(emptyToNull) @IsDateString() dueDate?: string | null;

  /**
   * On create: ignored — a new invoice always starts as DRAFT (use /issue, /void, /status).
   * On update: limited to valid transitions; PAID/PARTIALLY_PAID are derived from payments.
   */
  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsOptional() @Transform(upper) @IsEnum(InvoiceStatus) status?: InvoiceStatus;

  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => LineItemDto)
  lineItems?: LineItemDto[];

  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class UpdateInvoiceDto extends CreateInvoiceDto {}

export class SetInvoiceStatusDto {
  @ApiProperty({ enum: InvoiceStatus })
  @Transform(upper) @IsEnum(InvoiceStatus)
  status: InvoiceStatus;
}

export class RecordPaymentDto {
  @ApiPropertyOptional({ description: 'Amount in major units (SAR)' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MAJOR) amount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_CENTS) amountCents?: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsString() @MaxLength(50) method?: string;
  @IsOptional() @IsString() @MaxLength(50) gateway?: string;
  @IsOptional() @IsString() @MaxLength(200) referenceNumber?: string;
  @IsOptional() @IsString() @MaxLength(200) gatewayRef?: string;
  @IsOptional() @IsDateString() paidAt?: string;
  @IsOptional() @IsString() @MaxLength(200) idempotencyKey?: string;
}

/** Kept for backwards compatibility with earlier imports. */
export class CreatePaymentDto extends RecordPaymentDto {}

export class UpdatePaymentDto {
  @IsOptional() @IsString() @MaxLength(50) gateway?: string;
  @IsOptional() @IsString() @MaxLength(50) method?: string;
  @IsOptional() @IsString() @MaxLength(200) gatewayRef?: string;
  @IsOptional() @IsString() @MaxLength(200) referenceNumber?: string;
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional() @Transform(upper) @IsEnum(PaymentStatus) status?: PaymentStatus;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MAJOR) amount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_CENTS) amountCents?: number;
  @IsOptional() @Transform(emptyToNull) @IsDateString() paidAt?: string | null;
}

export class RefundPaymentDto {
  @ApiPropertyOptional({ description: 'Refund in major units (SAR); defaults to the refundable balance' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MAJOR) amount?: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export const BUDGET_PLAN_STATUSES = ['DRAFT', 'PROPOSED', 'ACCEPTED', 'COMPLETED', 'CANCELLED'] as const;
export const BUDGET_CLIENT_TYPES = ['TRAVELER', 'OPERATOR', 'EXTERNAL'] as const;

export class CreateBudgetPlanDto {
  @IsOptional() @IsUUID() clientUserId?: string;
  @IsOptional() @IsString() @MaxLength(200) clientName?: string;
  @IsOptional() @Transform(upper) @IsIn(BUDGET_CLIENT_TYPES as unknown as string[]) clientType?: string;
  @IsOptional() @IsUUID() requestId?: string;
  @IsOptional() @IsString() @MaxLength(120) destination?: string;
  @IsOptional() @Transform(emptyToNull) @IsDateString() dateFrom?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsDateString() dateTo?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(10_000) travelers?: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MAJOR) totalBudget?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MAJOR) hotelBudget?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MAJOR) transportBudget?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MAJOR) visaBudget?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MAJOR) packageBudget?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MAJOR) otherBudget?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) commissionRate?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MAJOR) commission?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @RawJson() suggestedOptions?: unknown[];
  @IsOptional() @IsObject() @RawJson() finalPlan?: Record<string, unknown>;
  @IsOptional() @Transform(upper) @IsIn(BUDGET_PLAN_STATUSES as unknown as string[]) status?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class UpdateBudgetPlanDto extends CreateBudgetPlanDto {}

export class QueryFinanceDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @Type(() => Number) @IsNumber() page?: number = 1;
  @IsOptional() @Type(() => Number) @IsNumber() limit?: number = 20;
}
