import { Controller, Get, Post, Delete, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { RbacService } from './rbac.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AllowPendingTenant, AnyAuthenticated } from '../../common/decorators/access.decorator';
import { CurrentUser } from '../../common/decorators/tenant.decorator';
import type { Principal } from '../auth/principal';

class CreateRoleDto {
  @IsString() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) permissions!: string[];
}

class AssignRoleDto {
  @IsUUID() userId!: string;
  @IsUUID() roleId!: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}

@ApiTags('rbac')
@Controller({ path: 'rbac', version: '1' })
@ApiBearerAuth()
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('my-permissions')
  @AnyAuthenticated()
  @AllowPendingTenant()
  @ApiOperation({ summary: 'Effective capabilities of the current user (server-resolved)' })
  async myPermissions(@CurrentUser() user: Principal) {
    const permissions = await this.rbacService.getUserPermissions(user.sub, user.tenantId);
    return { success: true, data: permissions };
  }

  @Get('roles')
  @RequirePermissions('core:role:read')
  @ApiOperation({ summary: 'Roles that can be granted inside the current organization' })
  async roles(@CurrentUser() user: Principal) {
    return { success: true, data: await this.rbacService.assignableRoles(user.tenantId) };
  }

  @Post('roles')
  @RequirePermissions('core:role:manage')
  @ApiOperation({ summary: 'Create a custom role for the current organization' })
  async createRole(@CurrentUser() user: Principal, @Body() body: CreateRoleDto) {
    const role = await this.rbacService.createTenantRole(user, body.name, body.description, body.permissions);
    return { success: true, data: role };
  }

  @Post('assign')
  @RequirePermissions('core:role:manage')
  @ApiOperation({ summary: 'Grant a role to a user of the current organization' })
  async assignRole(@CurrentUser() user: Principal, @Body() body: AssignRoleDto) {
    const result = await this.rbacService.assignRoleInTenant(
      user,
      body.userId,
      body.roleId,
      body.expiresAt ? new Date(body.expiresAt) : undefined,
    );
    return { success: true, data: result };
  }

  @Delete('assign/:userId/:roleId')
  @RequirePermissions('core:role:manage')
  @ApiOperation({ summary: 'Revoke a role from a user of the current organization' })
  async revokeRole(
    @CurrentUser() user: Principal,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ) {
    return { success: true, data: await this.rbacService.revokeRoleInTenant(user, userId, roleId) };
  }
}
