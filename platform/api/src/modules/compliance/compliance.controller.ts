import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ComplianceService } from './compliance.service';
import { TenantId, CurrentUser } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@ApiTags('compliance')
@Controller({ path: 'compliance', version: '1' })
@ApiBearerAuth()
export class ComplianceController {
  constructor(private readonly service: ComplianceService) {}

  @Get('visas')
  @RequirePermissions('visa:application:read')
  async findVisas(@TenantId() tenantId: string, @Query() query: any) {
    return { success: true, data: await this.service.findVisas(tenantId, query) };
  }

  @Post('visas')
  @RequirePermissions('visa:application:submit')
  async createVisa(@TenantId() tenantId: string, @CurrentUser() user: any, @Body() dto: any) {
    return { success: true, data: await this.service.createVisa(tenantId, dto, user?.sub) };
  }

  @Get('visas/stats')
  @RequirePermissions('visa:application:read')
  async getStats(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getStats(tenantId) };
  }

  @Get('visas/dashboard-stats')
  @RequirePermissions('visa:application:read')
  async getDashboardStats(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getDashboardStats(tenantId) };
  }

  // Aggregate documents across all applications (collection route — before :id)
  @Get('visas/documents')
  @RequirePermissions('visa:application:read')
  async allDocuments(@TenantId() tenantId: string, @Query('status') status?: string) {
    return { success: true, data: await this.service.allDocuments(tenantId, status) };
  }

  @Get('visas/:id')
  @RequirePermissions('visa:application:read')
  async findOne(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findVisaById(tenantId, id) };
  }

  @Put('visas/:id')
  @RequirePermissions('visa:application:submit')
  async updateVisa(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return { success: true, data: await this.service.updateVisa(tenantId, id, dto) };
  }

  @Delete('visas/:id')
  @RequirePermissions('visa:application:submit')
  async deleteVisa(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.deleteVisa(tenantId, id) };
  }

  @Put('visas/:id/submit')
  @RequirePermissions('visa:application:submit')
  async submitVisa(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.submitVisa(tenantId, id) };
  }

  @Put('visas/:id/approve')
  @RequirePermissions('visa:application:manage')
  async approveVisa(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: { visaNumber?: string }) {
    return { success: true, data: await this.service.approveVisa(tenantId, id, body?.visaNumber) };
  }

  @Put('visas/:id/reject')
  @RequirePermissions('visa:application:manage')
  async rejectVisa(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: { reason: string }) {
    return { success: true, data: await this.service.rejectVisa(tenantId, id, body?.reason ?? '') };
  }

  // ── Documents on a single application ──────────────────────────────────
  @Get('visas/:id/documents')
  @RequirePermissions('visa:application:read')
  async listDocuments(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.listDocuments(tenantId, id) };
  }

  @Post('visas/:id/documents')
  @RequirePermissions('visa:application:submit')
  async addDocument(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return { success: true, data: await this.service.addDocument(tenantId, id, body) };
  }

  @Put('visas/:id/documents/:docId')
  @RequirePermissions('visa:application:submit')
  async updateDocument(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Param('docId') docId: string, @Body() body: { status: string; url?: string }) {
    return { success: true, data: await this.service.updateDocumentStatus(tenantId, id, docId, body.status, body.url) };
  }

  @Delete('visas/:id/documents/:docId')
  @RequirePermissions('visa:application:submit')
  async removeDocument(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Param('docId') docId: string) {
    return { success: true, data: await this.service.removeDocument(tenantId, id, docId) };
  }

  @Get('submissions')
  @RequirePermissions('visa:application:read')
  async findSubmissions(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.findSubmissions(tenantId) };
  }

  @Post('submissions')
  @RequirePermissions('visa:application:manage')
  async createSubmission(@TenantId() tenantId: string, @Body() dto: any) {
    return { success: true, data: await this.service.createSubmission(tenantId, dto) };
  }
}
