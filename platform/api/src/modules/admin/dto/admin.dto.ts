import { IsEnum, IsUUID, IsOptional, IsString, MaxLength } from 'class-validator';
import { TenantStatus, UserStatus } from '@prisma/client';

/**
 * Super Admin mutations are the most privileged operations on the platform,
 * so their inputs are validated against the real Prisma enums rather than
 * accepted as free-form strings (an invalid value used to reach Prisma and
 * surface as a 500).
 */
export class SetTenantStatusDto {
  @IsEnum(TenantStatus, {
    message: `status must be one of: ${Object.values(TenantStatus).join(', ')}`,
  })
  status: TenantStatus;

  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class SetUserStatusDto {
  @IsEnum(UserStatus, {
    message: `status must be one of: ${Object.values(UserStatus).join(', ')}`,
  })
  status: UserStatus;

  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class AssignRoleDto {
  @IsUUID('4', { message: 'roleId must be a valid role id' })
  roleId: string;
}
