import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe, Header } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { CurrentUser } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { SetTenantStatusDto, SetUserStatusDto, AssignRoleDto, AdminListQueryDto, CreateKycDto, KycDecisionDto, KycRejectDto, TakeDownListingDto, RemoveListingDto } from './dto/admin.dto';

@ApiTags('admin')
/**
 * Platform administration. Every route requires a `platform:*` capability, which
 * only SUPER_ADMIN accounts of the PLATFORM organization hold (see rbac/catalog.ts).
 */
@Controller({ path: 'admin', version: '1' })
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly service: AdminService) {}

  // ── Overview / dashboard ───────────────────────────────────────────
  @Get('stats')
  @RequirePermissions('platform:tenant:read')
  async getStats() {
    return { success: true, data: await this.service.getStats() };
  }

  // ── Tenants ────────────────────────────────────────────────────────
  @Get('tenants')
  @RequirePermissions('platform:tenant:read')
  async listTenants(@Query() query: AdminListQueryDto) {
    return { success: true, data: await this.service.listTenants(query) };
  }

  @Get('tenants/export')
  @RequirePermissions('platform:tenant:read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="umrah-connect-tenants.csv"')
  async exportTenants(@CurrentUser() user: any, @Query() query: AdminListQueryDto) {
    return this.service.exportTenants(query, user);
  }

  @Get('tenants/:id')
  @RequirePermissions('platform:tenant:read')
  async findTenant(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findTenant(id) };
  }

  @Put('tenants/:id/status')
  @RequirePermissions('platform:tenant:manage')
  async setTenantStatus(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTenantStatusDto,
  ) {
    return { success: true, data: await this.service.updateTenantStatus(id, dto.status, user, dto.reason) };
  }

  @Delete('tenants/:id')
  @RequirePermissions('platform:tenant:manage')
  async archiveTenant(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.archiveTenant(id, user) };
  }

  // ── Users ──────────────────────────────────────────────────────────
  @Get('users')
  @RequirePermissions('platform:user:read')
  async listUsers(@Query() query: AdminListQueryDto) {
    return { success: true, data: await this.service.listUsers(query) };
  }

  @Get('users/export')
  @RequirePermissions('platform:user:read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="umrah-connect-users.csv"')
  async exportUsers(@CurrentUser() user: any, @Query() query: AdminListQueryDto) {
    return this.service.exportUsers(query, user);
  }

  @Put('users/:id/status')
  @RequirePermissions('platform:user:manage')
  async setUserStatus(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetUserStatusDto,
  ) {
    return { success: true, data: await this.service.setUserStatus(id, dto.status, user, dto.reason) };
  }

  @Post('users/:id/force-logout')
  @RequirePermissions('platform:user:manage')
  async forceLogout(@CurrentUser() actor: any, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.forceLogoutUser(id, actor) };
  }

  @Post('users/:id/roles')
  @RequirePermissions('platform:role:manage')
  async assignRole(
    @CurrentUser() actor: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRoleDto,
  ) {
    return { success: true, data: await this.service.assignUserRole(id, dto.roleId, actor) };
  }

  @Delete('users/:id/roles/:roleId')
  @RequirePermissions('platform:role:manage')
  async removeRole(
    @CurrentUser() actor: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ) {
    return { success: true, data: await this.service.removeUserRole(id, roleId, actor) };
  }

  // ── KYC ────────────────────────────────────────────────────────────
  @Get('kyc')
  @RequirePermissions('platform:kyc:review')
  async listKyc(@Query() query: AdminListQueryDto) {
    return { success: true, data: await this.service.listKyc(query) };
  }

  @Get('kyc/:id')
  @RequirePermissions('platform:kyc:review')
  async findKyc(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findKyc(id) };
  }

  @Post('kyc')
  @RequirePermissions('platform:kyc:review')
  async createKyc(@CurrentUser() user: any, @Body() body: CreateKycDto) {
    return { success: true, data: await this.service.createKyc(body.tenantId, body, user) };
  }

  @Put('kyc/:id/approve')
  @RequirePermissions('platform:kyc:review')
  async approveKyc(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any, @Body() body: KycDecisionDto) {
    return { success: true, data: await this.service.approveKyc(id, user, body?.notes) };
  }

  @Put('kyc/:id/reject')
  @RequirePermissions('platform:kyc:review')
  async rejectKyc(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any, @Body() body: KycRejectDto) {
    return { success: true, data: await this.service.rejectKyc(id, body.reason, user) };
  }

  // ── Roles & permissions ────────────────────────────────────────────
  @Get('roles')
  @RequirePermissions('platform:role:manage')
  async listRoles() {
    return { success: true, data: await this.service.listRoles() };
  }

  @Get('roles/:id')
  @RequirePermissions('platform:role:manage')
  async findRole(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findRole(id) };
  }

  @Get('permissions')
  @RequirePermissions('platform:role:manage')
  async listPermissions() {
    return { success: true, data: await this.service.listPermissions() };
  }

  // ── Marketplace control ────────────────────────────────────────────
  @Get('listings')
  @RequirePermissions('platform:marketplace:moderate')
  async listAllListings(@Query() query: AdminListQueryDto) {
    return { success: true, data: await this.service.listAllListings(query) };
  }

  @Put('listings/:id/approve')
  @RequirePermissions('platform:marketplace:moderate')
  async approveListing(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.approveListing(id, user) };
  }

  /** Platform takedown with the reason the seller sees (F2). Only a platform restore (approve) lifts it. */
  @Put('listings/:id/take-down')
  @RequirePermissions('platform:marketplace:moderate')
  async takeDownListing(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: TakeDownListingDto) {
    return { success: true, data: await this.service.removeListing(id, user, body.reason) };
  }

  @Delete('listings/:id')
  @RequirePermissions('platform:marketplace:moderate')
  async removeListing(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: RemoveListingDto) {
    return { success: true, data: await this.service.removeListing(id, user, body?.reason) };
  }

  // ── Cross-tenant bookings ──────────────────────────────────────────
  @Get('bookings')
  @RequirePermissions('platform:booking:read')
  async listAllBookings(@Query() query: AdminListQueryDto) {
    return { success: true, data: await this.service.listAllBookings(query) };
  }

  // ── Finance summary ────────────────────────────────────────────────
  @Get('finance')
  @RequirePermissions('platform:finance:read')
  async getFinanceSummary() {
    return { success: true, data: await this.service.getFinanceSummary() };
  }

  // ── Audit logs ─────────────────────────────────────────────────────
  @Get('audit-logs')
  @RequirePermissions('platform:audit:read')
  async listAuditLogs(@Query() query: AdminListQueryDto) {
    return { success: true, data: await this.service.listAuditLogs(query) };
  }

  // ── Settings ───────────────────────────────────────────────────────
  @Get('settings')
  @RequirePermissions('platform:settings:read')
  async getSettings() {
    return { success: true, data: await this.service.getSettings() };
  }
}
