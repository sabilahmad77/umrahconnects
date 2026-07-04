import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { CurrentUser } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@ApiTags('admin')
@Controller({ path: 'admin', version: '1' })
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly service: AdminService) {}

  // ── Overview / dashboard ───────────────────────────────────────────
  @Get('stats')
  @RequirePermissions('core:tenant:read')
  async getStats() {
    return { success: true, data: await this.service.getStats() };
  }

  // ── Tenants ────────────────────────────────────────────────────────
  @Get('tenants')
  @RequirePermissions('core:tenant:read')
  async listTenants(@Query() query: any) {
    return { success: true, data: await this.service.listTenants(query) };
  }

  @Get('tenants/:id')
  @RequirePermissions('core:tenant:read')
  async findTenant(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findTenant(id) };
  }

  @Put('tenants/:id/status')
  @RequirePermissions('core:tenant:update')
  async setTenantStatus(@Param('id', ParseUUIDPipe) id: string, @Body() body: { status: string }) {
    return { success: true, data: await this.service.updateTenantStatus(id, body.status) };
  }

  @Delete('tenants/:id')
  @RequirePermissions('core:tenant:update')
  async archiveTenant(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.archiveTenant(id) };
  }

  // ── Users ──────────────────────────────────────────────────────────
  @Get('users')
  @RequirePermissions('core:user:read')
  async listUsers(@Query() query: any) {
    return { success: true, data: await this.service.listUsers(query) };
  }

  @Put('users/:id/status')
  @RequirePermissions('core:user:update')
  async setUserStatus(@Param('id', ParseUUIDPipe) id: string, @Body() body: { status: string }) {
    return { success: true, data: await this.service.setUserStatus(id, body.status) };
  }

  @Post('users/:id/force-logout')
  @RequirePermissions('core:user:update')
  async forceLogout(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.forceLogoutUser(id) };
  }

  @Post('users/:id/roles')
  @RequirePermissions('core:role:manage')
  async assignRole(@Param('id', ParseUUIDPipe) id: string, @Body() body: { roleId: string }) {
    return { success: true, data: await this.service.assignUserRole(id, body.roleId) };
  }

  @Delete('users/:id/roles/:roleId')
  @RequirePermissions('core:role:manage')
  async removeRole(@Param('id', ParseUUIDPipe) id: string, @Param('roleId', ParseUUIDPipe) roleId: string) {
    return { success: true, data: await this.service.removeUserRole(id, roleId) };
  }

  // ── KYC ────────────────────────────────────────────────────────────
  @Get('kyc')
  @RequirePermissions('core:tenant:read')
  async listKyc(@Query() query: any) {
    return { success: true, data: await this.service.listKyc(query) };
  }

  @Get('kyc/:id')
  @RequirePermissions('core:tenant:read')
  async findKyc(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findKyc(id) };
  }

  @Post('kyc')
  @RequirePermissions('core:tenant:update')
  async createKyc(@Body() body: { tenantId: string; registrySource?: string; documents?: any[]; registryData?: any }) {
    return { success: true, data: await this.service.createKyc(body.tenantId, body) };
  }

  @Put('kyc/:id/approve')
  @RequirePermissions('core:tenant:update')
  async approveKyc(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any, @Body() body: { notes?: string }) {
    return { success: true, data: await this.service.approveKyc(id, user?.sub, body?.notes) };
  }

  @Put('kyc/:id/reject')
  @RequirePermissions('core:tenant:update')
  async rejectKyc(@Param('id', ParseUUIDPipe) id: string, @Body() body: { reason: string }) {
    return { success: true, data: await this.service.rejectKyc(id, body.reason ?? '') };
  }

  // ── Roles & permissions ────────────────────────────────────────────
  @Get('roles')
  @RequirePermissions('core:role:manage')
  async listRoles() {
    return { success: true, data: await this.service.listRoles() };
  }

  @Get('roles/:id')
  @RequirePermissions('core:role:manage')
  async findRole(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findRole(id) };
  }

  @Get('permissions')
  @RequirePermissions('core:role:manage')
  async listPermissions() {
    return { success: true, data: await this.service.listPermissions() };
  }

  // ── Marketplace control ────────────────────────────────────────────
  @Get('listings')
  @RequirePermissions('marketplace:listing:read')
  async listAllListings(@Query() query: any) {
    return { success: true, data: await this.service.listAllListings(query) };
  }

  @Put('listings/:id/approve')
  @RequirePermissions('marketplace:listing:manage')
  async approveListing(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.approveListing(id) };
  }

  @Delete('listings/:id')
  @RequirePermissions('marketplace:listing:manage')
  async removeListing(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.removeListing(id) };
  }

  // ── Cross-tenant bookings ──────────────────────────────────────────
  @Get('bookings')
  @RequirePermissions('booking:booking:read')
  async listAllBookings(@Query() query: any) {
    return { success: true, data: await this.service.listAllBookings(query) };
  }

  // ── Finance summary ────────────────────────────────────────────────
  @Get('finance')
  @RequirePermissions('finance:report:read')
  async getFinanceSummary() {
    return { success: true, data: await this.service.getFinanceSummary() };
  }

  // ── Audit logs ─────────────────────────────────────────────────────
  @Get('audit-logs')
  @RequirePermissions('core:tenant:read')
  async listAuditLogs(@Query() query: any) {
    return { success: true, data: await this.service.listAuditLogs(query) };
  }

  // ── Settings ───────────────────────────────────────────────────────
  @Get('settings')
  @RequirePermissions('core:tenant:read')
  async getSettings() {
    return { success: true, data: await this.service.getSettings() };
  }
}
