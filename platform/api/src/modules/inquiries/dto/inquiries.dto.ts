import { RawJson } from '../../../common/decorators/raw-json.decorator';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateBy,
  ValidationOptions,
  buildMessage,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { InquiryStatus, InquiryType } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const blankToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? undefined : t;
};
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export const MAX_METADATA_BYTES = 5 * 1024;

/** The value serializes to JSON of at most `maxBytes` bytes. */
function MaxJsonBytes(maxBytes: number, options?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'maxJsonBytes',
      validator: {
        validate: (value: unknown) => {
          try {
            return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8') <= maxBytes;
          } catch {
            return false;
          }
        },
        defaultMessage: buildMessage((prefix) => `${prefix}$property must not exceed ${maxBytes} bytes of JSON`, options),
      },
    },
    options,
  );
}

export class CreatePublicInquiryDto {
  @ApiPropertyOptional({ enum: InquiryType, default: InquiryType.CONTACT })
  @Transform(upper) @IsOptional() @IsEnum(InquiryType)
  type?: InquiryType;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(200)
  name?: string;

  @ApiProperty() @Transform(trim) @IsEmail() @MaxLength(200)
  email: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(200)
  company?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(240)
  subject?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(5000)
  message?: string;

  @ApiPropertyOptional({ description: 'Free-form context (source page, role interest…), max 5 KB of JSON' })
  @IsOptional() @IsObject() @RawJson() @MaxJsonBytes(MAX_METADATA_BYTES)
  metadata?: Record<string, unknown>;
}

export class ListPublicInquiriesQueryDto {
  @ApiPropertyOptional({ enum: InquiryType })
  @Transform(({ value }) => (value === '' ? undefined : upper({ value }))) @IsOptional() @IsEnum(InquiryType)
  type?: InquiryType;

  @ApiPropertyOptional({ enum: InquiryStatus })
  @Transform(({ value }) => (value === '' ? undefined : upper({ value }))) @IsOptional() @IsEnum(InquiryStatus)
  status?: InquiryStatus;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
}

export class UpdatePublicInquiryStatusDto {
  @ApiProperty({ enum: InquiryStatus })
  @Transform(upper) @IsEnum(InquiryStatus)
  status: InquiryStatus;
}
