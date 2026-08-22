import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { VisaRequestsService } from './visa-requests.service';
import { TenantId, CurrentUser } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CreateVisaRequestDto, UpdateVisaRequestDto, QueryVisaRequestDto, AssignVisaRequestDto,
  ChangeStatusDto, AddNoteDto, EscalateDto, ResolveDto, CloseDto, ReopenDto,
} from './dto/visa-request.dto';

/**
 * Visa service requests — the agency's support-ticket queue, distinct from
 * VisaApplication (the regulator filing) and from marketplace demand.
 * Reuses the visa:application:* permission set already granted to visa roles.
 */
@ApiTags('visa-requests')
@Controller({ path: 'visa-requests', version: '1' })
@ApiBearerAuth()
export class VisaRequestsController {
  constructor(private readonly service: VisaRequestsService) {}

  @Get()
  @RequirePermissions('visa:application:read')
  async findAll(@TenantId() tenantId: string, @Query() query: QueryVisaRequestDto) {
    return { success: true, data: await this.service.findAll(tenantId, query) };
  }

  // Collection routes must be declared before :id so they are not shadowed.
  @Get('stats')
  @RequirePermissions('visa:application:read')
  async stats(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.stats(tenantId) };
  }

  @Get('assignees')
  @RequirePermissions('visa:application:read')
  async assignees(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.assignees(tenantId) };
  }

  @Post()
  @RequirePermissions('visa:application:submit')
  async create(@TenantId() tenantId: string, @CurrentUser() user: any, @Body() dto: CreateVisaRequestDto) {
    return { success: true, data: await this.service.create(tenantId, dto, user) };
  }

  @Get(':id')
  @RequirePermissions('visa:application:read')
  async findOne(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findOne(tenantId, id) };
  }

  /** Requester-facing thread — public replies only, never internal notes. */
  @Get(':id/public-thread')
  @RequirePermissions('visa:application:read')
  async publicThread(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.publicThread(tenantId, id) };
  }

  @Patch(':id')
  @RequirePermissions('visa:application:submit')
  async update(
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVisaRequestDto,
  ) {
    return { success: true, data: await this.service.update(tenantId, id, dto, user) };
  }

  @Put(':id/assign')
  @RequirePermissions('visa:application:manage')
  async assign(
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignVisaRequestDto,
  ) {
    return { success: true, data: await this.service.assign(tenantId, id, dto?.assigneeId ?? null, user) };
  }

  @Put(':id/status')
  @RequirePermissions('visa:application:submit')
  async changeStatus(
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
  ) {
    return { success: true, data: await this.service.changeStatus(tenantId, id, dto, user) };
  }

  @Post(':id/notes')
  @RequirePermissions('visa:application:submit')
  async addNote(
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddNoteDto,
  ) {
    return { success: true, data: await this.service.addNote(tenantId, id, dto, user) };
  }

  @Put(':id/escalate')
  @RequirePermissions('visa:application:manage')
  async escalate(
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EscalateDto,
  ) {
    return { success: true, data: await this.service.escalate(tenantId, id, dto, user) };
  }

  @Put(':id/resolve')
  @RequirePermissions('visa:application:submit')
  async resolve(
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDto,
  ) {
    return { success: true, data: await this.service.resolve(tenantId, id, dto, user) };
  }

  @Put(':id/close')
  @RequirePermissions('visa:application:manage')
  async close(
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseDto,
  ) {
    return { success: true, data: await this.service.close(tenantId, id, dto, user) };
  }

  @Put(':id/reopen')
  @RequirePermissions('visa:application:manage')
  async reopen(
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenDto,
  ) {
    return { success: true, data: await this.service.reopen(tenantId, id, dto, user) };
  }

  @Delete(':id')
  @RequirePermissions('visa:application:manage')
  async remove(@TenantId() tenantId: string, @CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.remove(tenantId, id, user) };
  }
}
