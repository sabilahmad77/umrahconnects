import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID,
  Matches, Max, MaxLength, Min, ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PostType, PostVisibility } from '@prisma/client';
import { ROLE_CODES } from '../../rbac/catalog';

export const REACTION_TYPES = ['LIKE', 'SAVE', 'SHARE'];
export const AUDIENCE_LEVELS = ['PUBLIC', 'CONNECTIONS', 'PRIVATE'];

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.toUpperCase() : value);

// ── Feed ────────────────────────────────────────────────────────────────────
export class QueryFeedDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;
  @IsOptional() @IsEnum(PostType) type?: PostType;
  // Read the raw value: implicit conversion would turn the string 'false' into true.
  @IsOptional()
  @Transform(({ obj, key }) => obj[key] === true || obj[key] === 'true' || obj[key] === '1')
  @IsBoolean()
  followingOnly?: boolean;
}

// ── Posts ───────────────────────────────────────────────────────────────────
export class CreatePostDto {
  @IsOptional() @IsEnum(PostType) type?: PostType;
  /** `content` is what the clients send; `body` is the legacy alias. */
  @IsOptional() @IsString() @MaxLength(2000) content?: string;
  @IsOptional() @IsString() @MaxLength(2000) body?: string;
  @IsOptional() @IsEnum(PostVisibility) visibility?: PostVisibility;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(2048, { each: true }) mediaUrls?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(50, { each: true }) tags?: string[];
  @IsOptional() @IsString() @MaxLength(10) language?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsIn(ROLE_CODES, { each: true }) targetRoles?: string[];
}

export class UpdatePostDto {
  @IsOptional() @IsString() @MaxLength(2000) content?: string;
  @IsOptional() @IsString() @MaxLength(2000) body?: string;
  @IsOptional() @IsEnum(PostVisibility) visibility?: PostVisibility;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(50, { each: true }) tags?: string[];
}

export class CreateCommentDto {
  @IsOptional() @IsString() @MaxLength(1000) content?: string;
  @IsOptional() @IsString() @MaxLength(1000) body?: string;
  @IsOptional() @IsUUID() parentId?: string;
}

export class ReactDto {
  @IsOptional() @IsIn(REACTION_TYPES) type?: string;
  /** Alias of `type`. */
  @IsOptional() @IsIn(REACTION_TYPES) reaction?: string;
}

// ── Account ─────────────────────────────────────────────────────────────────
export class UpdateSocialAccountDto {
  @IsOptional() @IsString() @MaxLength(100) displayName?: string;
  /** Sent by the mobile app; not persisted (no column). */
  @IsOptional() @IsString() @MaxLength(200) headline?: string;
  @IsOptional() @IsString() @MaxLength(2000) bio?: string;
  @IsOptional() @IsString() @MaxLength(2048) avatarUrl?: string;
  @IsOptional() @IsString() @MaxLength(2048) coverUrl?: string;
  @IsOptional() @IsEnum(PostVisibility) privacyDefault?: PostVisibility;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @Matches(/^([A-Za-z]{2})?$/, { message: 'nationality must be an ISO-3166 alpha-2 code' }) nationality?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(50, { each: true }) travelInterests?: string[];
  @IsOptional() @ValidateIf((_, v) => v !== '') @IsDateString() preferredDateFrom?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== '') @IsDateString() preferredDateTo?: string | null;
  @IsOptional() @Transform(upper) @IsIn(AUDIENCE_LEVELS) profileVisibility?: string;
  @IsOptional() @Transform(upper) @IsIn(AUDIENCE_LEVELS) contactVisibility?: string;
}

// ── Messaging ───────────────────────────────────────────────────────────────
export class OpenConversationDto {
  @IsUUID() recipientUserId: string;
}

export class SendMessageDto {
  @IsOptional() @IsString() @MaxLength(4000) body?: string;
  /** Alias of `body`. */
  @IsOptional() @IsString() @MaxLength(4000) content?: string;
}
