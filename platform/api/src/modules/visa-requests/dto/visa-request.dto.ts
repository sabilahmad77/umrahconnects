import {
  IsString, IsOptional, IsEnum, IsUUID, IsDateString, IsInt, Min, Max,
  MaxLength, MinLength, IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  VisaRequestCategory,
  VisaRequestPriority,
  VisaRequestStatus,
  VisaRequestNoteVisibility,
} from '@prisma/client';

/**
 * Statuses a ticket can be moved to through the generic status route.
 * Terminal transitions (resolve/close/reopen/escalate) have dedicated
 * routes so their side effects (timestamps, notifications) always run.
 */
export const WORKFLOW_STATUSES = [
  VisaRequestStatus.OPEN,
  VisaRequestStatus.IN_PROGRESS,
  VisaRequestStatus.WAITING_ON_CUSTOMER,
] as const;

export class CreateVisaRequestDto {
  @IsString() @MinLength(3) @MaxLength(200) subject: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsEnum(VisaRequestCategory) category?: VisaRequestCategory;
  @IsOptional() @IsEnum(VisaRequestPriority) priority?: VisaRequestPriority;

  @IsOptional() @IsString() @MaxLength(150) requesterName?: string;
  @IsOptional() @IsString() @MaxLength(255) requesterEmail?: string;
  @IsOptional() @IsString() @MaxLength(30) requesterPhone?: string;

  @IsOptional() @IsUUID() pilgrimId?: string;
  @IsOptional() @IsUUID() visaApplicationId?: string;
  @IsOptional() @IsUUID() assigneeId?: string;
  @IsOptional() @IsDateString() dueAt?: string;
}

export class UpdateVisaRequestDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsEnum(VisaRequestCategory) category?: VisaRequestCategory;
  @IsOptional() @IsEnum(VisaRequestPriority) priority?: VisaRequestPriority;
  @IsOptional() @IsString() @MaxLength(150) requesterName?: string;
  @IsOptional() @IsString() @MaxLength(255) requesterEmail?: string;
  @IsOptional() @IsString() @MaxLength(30) requesterPhone?: string;
  @IsOptional() @IsDateString() dueAt?: string;
}

export class AssignVisaRequestDto {
  /** null / omitted unassigns the ticket. */
  @IsOptional() @IsUUID() assigneeId?: string | null;
}

export class ChangeStatusDto {
  @IsIn(WORKFLOW_STATUSES as unknown as string[], {
    message: `status must be one of: ${WORKFLOW_STATUSES.join(', ')} (use /escalate, /resolve, /close, /reopen for the others)`,
  })
  status: (typeof WORKFLOW_STATUSES)[number];
}

export class AddNoteDto {
  @IsString() @MinLength(1) @MaxLength(5000) body: string;
  @IsOptional() @IsEnum(VisaRequestNoteVisibility) visibility?: VisaRequestNoteVisibility;
}

export class EscalateDto {
  @IsString() @MinLength(3) @MaxLength(1000) reason: string;
}

export class ResolveDto {
  @IsString() @MinLength(3) @MaxLength(2000) resolution: string;
}

export class CloseDto {
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class ReopenDto {
  @IsString() @MinLength(3) @MaxLength(1000) reason: string;
}

export class QueryVisaRequestDto {
  @IsOptional() @IsEnum(VisaRequestStatus) status?: VisaRequestStatus;
  @IsOptional() @IsEnum(VisaRequestCategory) category?: VisaRequestCategory;
  @IsOptional() @IsEnum(VisaRequestPriority) priority?: VisaRequestPriority;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  /** 'true' → only tickets past their due date and not yet resolved/closed. */
  @IsOptional() @IsString() overdue?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;
}
