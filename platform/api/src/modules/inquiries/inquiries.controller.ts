import { Body, Controller, Get, Param, Patch, Post, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { InquiriesService } from './inquiries.service';

@ApiTags('inquiries')
@Controller({ path: 'inquiries', version: '1' })
export class InquiriesController {
  constructor(private readonly service: InquiriesService) {}

  // ── Public website submissions (no auth) ──
  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a public website inquiry (contact / partner / careers / newsletter / demo)' })
  async create(@Body() dto: any) {
    return { success: true, data: await this.service.create(dto) };
  }

  // ── Admin inbox (Super Admin governance) ──
  @Get()
  @RequirePermissions('core:tenant:read')
  @ApiOperation({ summary: 'List public inquiries (admin inbox)' })
  async findAll(@Query() query: any) {
    return { success: true, data: await this.service.findAll(query) };
  }

  @Patch(':id/status')
  @RequirePermissions('core:tenant:update')
  async updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return { success: true, data: await this.service.updateStatus(id, body?.status ?? '') };
  }
}
