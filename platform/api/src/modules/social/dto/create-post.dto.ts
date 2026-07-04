import { IsString, IsOptional, IsEnum, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PostType {
  UPDATE = 'UPDATE',
  OFFER = 'OFFER',
  GUIDELINE = 'GUIDELINE',
  QUESTION = 'QUESTION',
  PARTNERSHIP = 'PARTNERSHIP',
  STORY = 'STORY',
  EVENT = 'EVENT',
}

export enum PostVisibility {
  PUBLIC = 'PUBLIC',
  TENANT_ONLY = 'TENANT_ONLY',
  FOLLOWERS = 'FOLLOWERS',
}

export class CreatePostDto {
  @ApiProperty({ enum: PostType })
  @IsEnum(PostType)
  type: PostType;

  @ApiProperty()
  @IsString()
  content: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  contentAr?: string;

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  mediaUrls?: string[];

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ enum: PostVisibility })
  @IsEnum(PostVisibility)
  @IsOptional()
  visibility?: PostVisibility;
}
