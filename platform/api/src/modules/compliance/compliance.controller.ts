import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { ComplianceService } from './compliance.service';
import { VisaDocumentsService } from './visa-documents.service';
import { TenantId, CurrentUser } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@ApiTags('compliance')
@Controller({ path: 'compliance', version: '1' })
@ApiBearerAuth()
export class ComplianceController {
  constructor(
    private readonly service: ComplianceService,
    private readonly docs: VisaDocumentsService,
  ) {}

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
  async allDocuments(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
    @Query('expiringInDays') expiringInDays?: string,
  ) {
    return {
      success: true,
      data: await this.docs.listAll(tenantId, {
        status,
        expiringInDays: expiringInDays ? Number(expiringInDays) : undefined,
      }),
    };
  }

  @Get('visas/documents/stats')
  @RequirePermissions('visa:application:read')
  async documentStats(@TenantId() tenantId: string) {
    return { success: true, data: await this.docs.stats(tenantId) };
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
    return { success: true, data: await this.docs.list(tenantId, id) };
  }

  @Post('visas/:id/documents')
  @RequirePermissions('visa:application:submit')
  async addDocument(
    @TenantId() tenantId: string, @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string, @Body() body: any,
  ) {
    return { success: true, data: await this.docs.create(tenantId, id, body, user) };
  }

  @Get('visas/:id/documents/:docId')
  @RequirePermissions('visa:application:read')
  async findDocument(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
  ) {
    return { success: true, data: await this.docs.findOne(tenantId, id, docId) };
  }

  @Get('visas/:id/documents/:docId/versions')
  @RequirePermissions('visa:application:read')
  async documentVersions(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
  ) {
    return { success: true, data: await this.docs.versions(tenantId, id, docId) };
  }

  /** Upload or replace the file behind a document — always a new version. */
  @Post('visas/:id/documents/:docId/versions')
  @RequirePermissions('visa:application:submit')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async uploadDocumentVersion(
    @TenantId() tenantId: string, @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
    @UploadedFile() file: any,
  ) {
    return { success: true, data: await this.docs.addVersion(tenantId, id, docId, file, user) };
  }

  @Put('visas/:id/documents/:docId')
  @RequirePermissions('visa:application:submit')
  async updateDocument(
    @TenantId() tenantId: string, @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string, @Param('docId', ParseUUIDPipe) docId: string,
    @Body() body: { status?: string; url?: string; expiresAt?: string; notes?: string },
  ) {
    return { success: true, data: await this.docs.updateStatus(tenantId, id, docId, body, user) };
  }

  @Put('visas/:id/documents/:docId/verify')
  @RequirePermissions('visa:application:manage')
  async verifyDocument(
    @TenantId() tenantId: string, @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string, @Param('docId', ParseUUIDPipe) docId: string,
  ) {
    return { success: true, data: await this.docs.verify(tenantId, id, docId, user) };
  }

  @Put('visas/:id/documents/:docId/reject')
  @RequirePermissions('visa:application:manage')
  async rejectDocument(
    @TenantId() tenantId: string, @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string, @Param('docId', ParseUUIDPipe) docId: string,
    @Body() body: { reason: string },
  ) {
    return { success: true, data: await this.docs.reject(tenantId, id, docId, body?.reason ?? '', user) };
  }

  @Delete('visas/:id/documents/:docId')
  @RequirePermissions('visa:application:submit')
  async removeDocument(
    @TenantId() tenantId: string, @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string, @Param('docId', ParseUUIDPipe) docId: string,
  ) {
    return { success: true, data: await this.docs.remove(tenantId, id, docId, user) };
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
