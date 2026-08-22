import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe, Header } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { CurrentUser } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { SetTenantStatusDto, SetUserStatusDto, AssignRoleDto } from './dto/admin.dto';

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

  @Get('tenants/export')
  @RequirePermissions('core:tenant:read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="umrah-connect-tenants.csv"')
  async exportTenants(@CurrentUser() user: any, @Query() query: any) {
    return this.service.exportTenants(query, user);
  }

  @Get('tenants/:id')
  @RequirePermissions('core:tenant:read')
  async findTenant(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findTenant(id) };
  }

  @Put('tenants/:id/status')
  @RequirePermissions('core:tenant:update')
  async setTenantStatus(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTenantStatusDto,
  ) {
    return { success: true, data: await this.service.updateTenantStatus(id, dto.status, user, dto.reason) };
  }

  @Delete('tenants/:id')
  @RequirePermissions('core:tenant:update')
  async archiveTenant(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.archiveTenant(id, user) };
  }

  // ── Users ──────────────────────────────────────────────────────────
  @Get('users')
  @RequirePermissions('core:user:read')
  async listUsers(@Query() query: any) {
    return { success: true, data: await this.service.listUsers(query) };
  }

  @Get('users/export')
  @RequirePermissions('core:user:read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="umrah-connect-users.csv"')
  async exportUsers(@CurrentUser() user: any, @Query() query: any) {
    return this.service.exportUsers(query, user);
  }

  @Put('users/:id/status')
  @RequirePermissions('core:user:update')
  async setUserStatus(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetUserStatusDto,
  ) {
    return { success: true, data: await this.service.setUserStatus(id, dto.status, user, dto.reason) };
  }

  @Post('users/:id/force-logout')
  @RequirePermissions('core:user:update')
  async forceLogout(@CurrentUser() actor: any, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.forceLogoutUser(id, actor) };
  }

  @Post('users/:id/roles')
  @RequirePermissions('core:role:manage')
  async assignRole(
    @CurrentUser() actor: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRoleDto,
  ) {
    return { success: true, data: await this.service.assignUserRole(id, dto.roleId, actor) };
  }

  @Delete('users/:id/roles/:roleId')
  @RequirePermissions('core:role:manage')
  async removeRole(
    @CurrentUser() actor: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ) {
    return { success: true, data: await this.service.removeUserRole(id, roleId, actor) };
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
