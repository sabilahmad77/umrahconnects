import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RawJson } from '../../../common/decorators/raw-json.decorator';
import { EMAIL_LOCALES } from '../../auth/auth-emails';

/**
 * One optional switch per category in NOTIFICATION_CATEGORIES. `@RawJson()`
 * keeps the value exactly as sent: the global implicit conversion would
 * otherwise turn the string "false" into boolean true.
 */
export class InAppNotificationPreferencesDto {
  @IsOptional() @RawJson() @IsBoolean() community?: boolean;
  @IsOptional() @RawJson() @IsBoolean() connections?: boolean;
  @IsOptional() @RawJson() @IsBoolean() messages?: boolean;
  @IsOptional() @RawJson() @IsBoolean() groups?: boolean;
  @IsOptional() @RawJson() @IsBoolean() requests?: boolean;
  @IsOptional() @RawJson() @IsBoolean() bookings?: boolean;
  @IsOptional() @RawJson() @IsBoolean() visa?: boolean;
}

export class NotificationPreferencesDto {
  @ApiPropertyOptional({ type: InAppNotificationPreferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => InAppNotificationPreferencesDto)
  inApp?: InAppNotificationPreferencesDto;
}

/** Partial update: only the fields sent change. Unknown fields are rejected (400). */
export class UpdatePreferencesDto {
  @ApiPropertyOptional({ enum: EMAIL_LOCALES, description: 'Language of emails from Umrah Connect' })
  @IsOptional()
  @IsIn(EMAIL_LOCALES as unknown as string[])
  locale?: 'en' | 'ar';

  @ApiPropertyOptional({ example: 'Asia/Riyadh', description: 'IANA time zone' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;

  @ApiPropertyOptional({ type: NotificationPreferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationPreferencesDto)
  notifications?: NotificationPreferencesDto;
}
