import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsNumber, IsDateString, IsUUID, IsInt, Min } from 'class-validator';

export enum AllotmentStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export class CreateAllotmentDto {
  @ApiProperty()
  @IsUUID()
  roomTypeId: string;

  @ApiProperty()
  @IsDateString()
  checkIn: string;

  @ApiProperty()
  @IsDateString()
  checkOut: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  totalRooms: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  contractPrice: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractRef?: string;

  @ApiPropertyOptional({ enum: AllotmentStatus })
  @IsOptional()
  @IsEnum(AllotmentStatus)
  status?: AllotmentStatus;
}
