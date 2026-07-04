import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsDateString, IsNumber } from 'class-validator';

export enum DocumentType {
  PASSPORT = 'PASSPORT',
  VISA = 'VISA',
  VACCINATION = 'VACCINATION',
  MEDICAL = 'MEDICAL',
  PHOTO = 'PHOTO',
  MAHRAM_CERT = 'MAHRAM_CERT',
  NISNOMORCARD = 'NISNOMORCARD',
  OTHER = 'OTHER',
}

export class AddDocumentDto {
  @ApiProperty({ enum: DocumentType })
  @IsEnum(DocumentType)
  type: DocumentType;

  @ApiProperty()
  @IsString()
  fileUrl: string;

  @ApiProperty()
  @IsString()
  fileName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  fileSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
