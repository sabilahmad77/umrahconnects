import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RbacService } from './rbac.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId, CurrentUser } from '../../common/decorators/tenant.decorator';

@ApiTags('rbac')
@Controller({ path: 'rbac', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('my-permissions')
  @ApiOperation({ summary: 'Get all permissions for the current user' })
  async myPermissions(@CurrentUser() user: any) {
    const permissions = await this.rbacService.getUserPermissions(user.sub, user.tenantId);
    return { success: true, data: permissions };
  }

  @Post('roles')
  @RequirePermissions('core:role:manage')
  @ApiOperation({ summary: 'Create a custom role for the current tenant' })
  async createRole(@TenantId() tenantId: string, @Body() body: { name: string; description: string; permissions: string[] }) {
    const role = await this.rbacService.createTenantRole(
      tenantId,
      body.name,
      body.description,
      body.permissions,
    );
    return { success: true, data: role };
  }

  @Post('assign')
  @RequirePermissions('core:role:manage')
  @ApiOperation({ summary: 'Assign a role to a user' })
  async assignRole(
    @CurrentUser() user: any,
    @Body() body: { userId: string; roleId: string; expiresAt?: string },
  ) {
    const result = await this.rbacService.assignRoleToUser(
      body.userId,
      body.roleId,
      user.sub,
      body.expiresAt ? new Date(body.expiresAt) : undefined,
    );
    return { success: true, data: result };
  }
}
