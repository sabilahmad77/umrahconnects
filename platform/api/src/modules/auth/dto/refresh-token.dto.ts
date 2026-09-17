import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** The refresh token may come from the body (legacy web client) or the httpOnly cookie. */
export class RefreshTokenDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  refreshToken?: string;
}
