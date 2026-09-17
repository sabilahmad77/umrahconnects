import { Throttle } from '@nestjs/throttler';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { InquiriesService } from './inquiries.service';
import {
  CreatePublicInquiryDto,
  ListPublicInquiriesQueryDto,
  UpdatePublicInquiryStatusDto,
} from './dto/inquiries.dto';

@ApiTags('inquiries')
@Controller({ path: 'inquiries', version: '1' })
export class InquiriesController {
  constructor(private readonly service: InquiriesService) {}

  // ── Public website submissions (no auth) ──
  @Public()
  @Post()
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a public website inquiry (contact / partner / careers / newsletter / demo)' })
  async create(@Body() dto: CreatePublicInquiryDto) {
    return { success: true, data: await this.service.create(dto) };
  }

  // ── Platform inbox (inquiries are addressed to the platform, not to organizations) ──
  @Get()
  @RequirePermissions('platform:inquiry:manage')
  @ApiOperation({ summary: 'List public inquiries (platform inbox)' })
  async findAll(@Query() query: ListPublicInquiriesQueryDto) {
    return { success: true, data: await this.service.findAll(query) };
  }

  @Patch(':id/status')
  @RequirePermissions('platform:inquiry:manage')
  async updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdatePublicInquiryStatusDto) {
    return { success: true, data: await this.service.updateStatus(id, body.status) };
  }
}
