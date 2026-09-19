import { IsOptional, IsString, IsNumber, IsInt, IsUUID, Min, Max, MaxLength, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

/** Sandbox outcomes are chosen explicitly so failures are testable. */
export const SANDBOX_SCENARIOS = ['succeed', 'decline_at_intent', 'decline_at_capture'] as const;

export class CreateIntentDto {
  /** Major units (SAR); at most two decimals. The server caps it at the outstanding balance. */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1_000_000_000) amount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100_000_000_000) amountCents?: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsUUID() invoiceId?: string;
  @IsOptional() @IsUUID() bookingId?: string;
  @IsOptional() @IsUUID() pilgrimId?: string;
  @IsOptional() @IsString() @MaxLength(40) provider?: string;
  @IsOptional() @IsIn(SANDBOX_SCENARIOS as unknown as string[]) scenario?: string;
  @IsOptional() @IsString() @MaxLength(120) idempotencyKey?: string;
}

export class ConfirmIntentDto {
  @IsOptional() @IsIn(SANDBOX_SCENARIOS as unknown as string[]) scenario?: string;
}

export class RefundDto {
  /** Major units (SAR); defaults to the whole refundable balance. */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1_000_000_000) amount?: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class CheckoutDto {
  @IsUUID() listingBookingId!: string;
  /**
   * Accepted for older clients and ignored: re-entering checkout resumes the
   * open attempt server-side, which is what makes a repeat request safe.
   */
  @IsOptional() @IsString() @MaxLength(120) idempotencyKey?: string;
}
