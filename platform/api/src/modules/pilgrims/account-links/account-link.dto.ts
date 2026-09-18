import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trimmed = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class InviteTravelerDto {
  @ApiPropertyOptional({
    description:
      "Address to invite. Omit to use the traveler record's email on file; a different " +
      'address is recorded on the invitation as entered by staff.',
  })
  @IsOptional()
  @trimmed()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(255)
  email?: string;
}

export class RevokeAccountLinkDto {
  @ApiProperty({ description: 'Why access is being withdrawn (kept on the link and in the audit log).' })
  @trimmed()
  @IsString()
  @MinLength(3, { message: 'Give a reason of at least 3 characters' })
  @MaxLength(500)
  reason: string;
}
