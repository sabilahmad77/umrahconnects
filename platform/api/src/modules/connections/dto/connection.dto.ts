import { IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class RequestConnectionDto {
  /** Web client field. */
  @ValidateIf((o) => o.targetUserId === undefined || o.recipientId !== undefined)
  @IsUUID()
  recipientId?: string;

  /** Mobile client alias of `recipientId`. */
  @IsOptional() @IsUUID() targetUserId?: string;

  @IsOptional() @IsString() @MaxLength(500) message?: string;
}
