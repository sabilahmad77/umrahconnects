import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

/**
 * The invitation token travels in the request body — never in a URL path or
 * query — so it cannot end up in access logs, the audit trail or a Referer.
 * Its shape is checked by the service, which answers every unusable token the
 * same way.
 */
export class InvitationTokenDto {
  @ApiProperty({ description: 'The token from the invitation link' })
  @IsString()
  @MaxLength(200)
  token: string;
}
