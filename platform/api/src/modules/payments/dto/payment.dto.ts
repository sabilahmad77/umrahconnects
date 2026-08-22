import { IsOptional, IsString, IsNumber, IsUUID, Min, MaxLength, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

/** Sandbox outcomes are chosen explicitly so failures are testable. */
export const SANDBOX_SCENARIOS = ['succeed', 'decline_at_intent', 'decline_at_capture'] as const;

export class CreateIntentDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) amountCents?: number;
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
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) amount?: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
