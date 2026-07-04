import { IsString, IsOptional, IsNumber, IsDateString, IsArray, IsUUID, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class LineItemDto {
  @IsString() description: string;
  @IsNumber() qty: number;
  @IsNumber() unitPrice: number;
  @IsOptional() @IsNumber() vatRate?: number;
}
export class CreateInvoiceDto {
  @IsString() type: string;
  @IsOptional() @IsUUID() bookingId?: string;
  @IsString() counterpartyName: string;
  @IsOptional() @IsString() counterpartyEmail?: string;
  @IsDateString() issueDate: string;
  @IsDateString() dueDate: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() vatRate?: number;
  @IsArray() lineItems: LineItemDto[];
  @IsOptional() @IsString() notes?: string;
}
export class CreatePaymentDto {
  @IsNumber() amount: number;
  @IsOptional() @IsString() currency?: string;
  @IsString() method: string;
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsDateString() paidAt?: string;
}
export class QueryFinanceDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @Type(() => Number) @IsNumber() page?: number = 1;
  @IsOptional() @Type(() => Number) @IsNumber() limit?: number = 20;
}
