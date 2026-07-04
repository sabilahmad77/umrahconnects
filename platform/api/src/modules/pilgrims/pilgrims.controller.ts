import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TenantId, CurrentUser } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PilgrimsService } from './pilgrims.service';
import { CreatePilgrimDto } from './dto/create-pilgrim.dto';
import { UpdatePilgrimDto } from './dto/update-pilgrim.dto';
import { QueryPilgrimDto } from './dto/query-pilgrim.dto';
import { AddDocumentDto } from './dto/add-document.dto';

@ApiTags('pilgrims')
@Controller({ path: 'pilgrims', version: '1' })
@ApiBearerAuth()
export class PilgrimsController {
  constructor(private readonly pilgrimsService: PilgrimsService) {}

  @Get('export')
  @RequirePermissions('crm:pilgrim:read')
  @ApiOperation({ summary: 'Export pilgrims as JSON for CSV generation' })
  async export(@TenantId() tenantId: string) {
    const data = await this.pilgrimsService.exportAll(tenantId);
    return { success: true, data };
  }

  @Get('stats')
  @RequirePermissions('crm:pilgrim:read')
  @ApiOperation({ summary: 'Get pilgrim counts by status' })
  async getStats(@TenantId() tenantId: string) {
    const data = await this.pilgrimsService.getStats(tenantId);
    return { success: true, data };
  }

  @Get()
  @RequirePermissions('crm:pilgrim:read')
  @ApiOperation({ summary: 'List pilgrims with pagination and filters' })
  async findAll(@TenantId() tenantId: string, @Query() query: QueryPilgrimDto) {
    const data = await this.pilgrimsService.findAll(tenantId, query);
    return { success: true, data };
  }

  @Post()
  @RequirePermissions('crm:pilgrim:create')
  @ApiOperation({ summary: 'Create a new pilgrim' })
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: CreatePilgrimDto,
  ) {
    const data = await this.pilgrimsService.create(tenantId, dto, user.id);
    return { success: true, data };
  }

  @Get(':id')
  @RequirePermissions('crm:pilgrim:read')
  @ApiOperation({ summary: 'Get pilgrim with documents, bookings, and visa status' })
  async findOne(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.pilgrimsService.findOne(tenantId, id);
    return { success: true, data };
  }

  @Put(':id')
  @RequirePermissions('crm:pilgrim:update')
  @ApiOperation({ summary: 'Update pilgrim' })
  async update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePilgrimDto,
  ) {
    const data = await this.pilgrimsService.update(tenantId, id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @RequirePermissions('crm:pilgrim:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete pilgrim' })
  async remove(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.pilgrimsService.remove(tenantId, id);
    return { success: true, data };
  }

  @Post(':id/documents')
  @RequirePermissions('crm:pilgrim:update')
  @ApiOperation({ summary: 'Add document to pilgrim' })
  async addDocument(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddDocumentDto,
  ) {
    const data = await this.pilgrimsService.addDocument(tenantId, id, dto);
    return { success: true, data };
  }

  @Put(':id/family-group')
  @RequirePermissions('crm:pilgrim:update')
  @ApiOperation({ summary: 'Assign or unassign pilgrim to a family group' })
  async assignToFamilyGroup(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { familyGroupId: string | null },
  ) {
    const data = await this.pilgrimsService.assignToFamilyGroup(tenantId, id, body.familyGroupId);
    return { success: true, data };
  }

  @Post(':id/bookings')
  @RequirePermissions('crm:pilgrim:update')
  @ApiOperation({ summary: 'Attach this pilgrim to an existing booking' })
  async assignToBooking(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { bookingId: string },
  ) {
    const data = await this.pilgrimsService.assignToBooking(tenantId, id, body.bookingId);
    return { success: true, data };
  }
}
