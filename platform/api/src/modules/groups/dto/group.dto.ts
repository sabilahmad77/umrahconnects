import {
  IsString, IsOptional, IsNumber, IsDateString, IsUUID, IsArray, IsBoolean, IsIn, IsInt, IsEmail,
  MaxLength, Min, Max, ArrayMinSize, ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateGroupDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() coverUrl?: string;
  @IsOptional() @IsString() tripType?: string;
  @IsOptional() @IsString() season?: string;
  @IsOptional() @IsString() visibility?: string;
  @IsOptional() @IsUUID() packageId?: string;
  @IsOptional() @IsUUID() leadGuideId?: string;
  @IsOptional() @IsDateString() departureDate?: string;
  @IsOptional() @IsDateString() returnDate?: string;
  @IsOptional() @IsNumber() maxCapacity?: number;
  @IsOptional() @IsNumber() capacity?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() notes?: string;
}

export class UpdateGroupDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() coverUrl?: string;
  @IsOptional() @IsString() tripType?: string;
  @IsOptional() @IsString() season?: string;
  @IsOptional() @IsString() visibility?: string;
  @IsOptional() @IsUUID() leadGuideId?: string;
  @IsOptional() @IsDateString() departureDate?: string;
  @IsOptional() @IsDateString() returnDate?: string;
  @IsOptional() @IsNumber() maxCapacity?: number;
  @IsOptional() @IsNumber() capacity?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() notes?: string;
  @IsOptional() briefingNotes?: string;
  @IsOptional() itinerary?: any;
  @IsOptional() emergencyContact?: any;
}

export class QueryGroupDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() visibility?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsNumber() page?: number = 1;
  @IsOptional() @Type(() => Number) @IsNumber() limit?: number = 20;
}

export class CreateIncidentDto {
  @IsString() @MaxLength(50) type: string;
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) severity?: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsString() @MaxLength(5000) description: string;
  @IsOptional() @IsString() @MaxLength(500) location?: string;
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsOptional() @IsUUID() pilgrimId?: string;
}

export class UpdateIncidentDto {
  @IsOptional() @IsString() @MaxLength(50) status?: string;
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) severity?: string;
  @IsOptional() @IsString() @MaxLength(5000) resolution?: string;
  @IsOptional() @IsDateString() resolvedAt?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
}

// ── Hardened request bodies (security remediation) ─────────────────────────
// Every body/query the groups controller accepts is a class so the global
// ValidationPipe (whitelist + forbidNonWhitelisted) can enforce it.

export const GROUP_MEMBER_ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const;
export const GROUP_NOTE_CATEGORIES = ['GENERAL', 'PLANNING', 'ITINERARY', 'CHECKLIST', 'TRANSPORT', 'HOTEL'] as const;

export class QueryPublicGroupDto {
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;
}

export class AddGroupMemberDto {
  @IsUUID() userId: string;
  @IsOptional() @IsIn(GROUP_MEMBER_ROLES as unknown as string[]) role?: string;
}

export class CreateGroupInviteDto {
  @IsOptional() @IsUUID() inviteeUserId?: string;
  @IsOptional() @IsEmail() @MaxLength(255) inviteeEmail?: string;
  @IsOptional() @IsString() @MaxLength(2000) message?: string;
}

export class RespondGroupInviteDto {
  @IsBoolean() accept: boolean;
}

export class CreateGroupPostDto {
  @IsString() @MaxLength(5000) body: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(2048, { each: true }) mediaUrls?: string[];
  @IsOptional() @IsBoolean() isPinned?: boolean;
}

export class CreateGroupCommentDto {
  @IsString() @MaxLength(5000) body: string;
}

export class CreateGroupPollDto {
  @IsString() @MaxLength(500) question: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(200, { each: true }) options: string[];
  @IsOptional() @IsBoolean() isMultiple?: boolean;
  @IsOptional() @IsDateString() closesAt?: string;
}

export class VoteGroupPollDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsInt({ each: true }) @Min(0, { each: true }) optionIndices: number[];
}

export class CreateGroupNoteDto {
  @IsString() @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(20000) body?: string;
  @IsOptional() @IsIn(GROUP_NOTE_CATEGORIES as unknown as string[]) category?: string;
  @IsOptional() @IsBoolean() pinned?: boolean;
}

export class UpdateGroupNoteDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(20000) body?: string;
  @IsOptional() @IsIn(GROUP_NOTE_CATEGORIES as unknown as string[]) category?: string;
  @IsOptional() @IsBoolean() pinned?: boolean;
}

export class AddGroupDocumentDto {
  @IsString() @MaxLength(255) name: string;
  @IsString() @MaxLength(2048) url: string;
  @IsOptional() @IsString() @MaxLength(120) mimeType?: string;
  @IsOptional() @IsInt() @Min(0) sizeBytes?: number;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

export class AddGroupPilgrimDto {
  @IsUUID() bookingId: string;
}
