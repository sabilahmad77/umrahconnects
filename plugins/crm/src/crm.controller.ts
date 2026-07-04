import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CrmService, CreatePilgrimDto, UpdatePilgrimDto, CreateFamilyGroupDto } from './crm.service';

// Guard stubs — resolved from core at runtime
import { JwtAuthGuard } from '../../../core/src/auth/jwt-auth.guard';

@ApiTags('CRM')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('plugins/crm')
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  // ── Pilgrims ──────────────────────────────────────────────────────────────

  @Post('pilgrims')
  @ApiOperation({ summary: 'Create a new pilgrim profile' })
  createPilgrim(@Request() req: any, @Body() dto: CreatePilgrimDto) {
    return this.crmService.createPilgrim({ ...dto, tenantId: req.user.tenantId });
  }

  @Get('pilgrims')
  @ApiOperation({ summary: 'List pilgrims for the current tenant' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  listPilgrims(
    @Request() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.crmService.listPilgrims(req.user.tenantId, { page, limit, search });
  }

  @Get('pilgrims/:id')
  @ApiOperation({ summary: 'Get a single pilgrim by ID' })
  getPilgrim(@Request() req: any, @Param('id') id: string) {
    return this.crmService.getPilgrim(req.user.tenantId, id);
  }

  @Patch('pilgrims/:id')
  @ApiOperation({ summary: 'Update a pilgrim profile' })
  updatePilgrim(@Request() req: any, @Param('id') id: string, @Body() dto: UpdatePilgrimDto) {
    return this.crmService.updatePilgrim(req.user.tenantId, id, dto);
  }

  @Delete('pilgrims/:id')
  @ApiOperation({ summary: 'Delete (soft) a pilgrim profile' })
  deletePilgrim(@Request() req: any, @Param('id') id: string) {
    return this.crmService.deletePilgrim(req.user.tenantId, id);
  }

  // ── Family Groups ─────────────────────────────────────────────────────────

  @Post('family-groups')
  @ApiOperation({ summary: 'Create a family group' })
  createFamilyGroup(@Request() req: any, @Body() dto: CreateFamilyGroupDto) {
    return this.crmService.createFamilyGroup({ ...dto, tenantId: req.user.tenantId });
  }

  @Get('family-groups')
  @ApiOperation({ summary: 'List family groups' })
  listFamilyGroups(@Request() req: any) {
    return this.crmService.listFamilyGroups(req.user.tenantId);
  }

  @Get('family-groups/:id')
  @ApiOperation({ summary: 'Get a single family group' })
  getFamilyGroup(@Request() req: any, @Param('id') id: string) {
    return this.crmService.getFamilyGroup(req.user.tenantId, id);
  }

  @Post('family-groups/:groupId/members/:pilgrimId')
  @ApiOperation({ summary: 'Add a pilgrim to a family group' })
  addMember(
    @Request() req: any,
    @Param('groupId') groupId: string,
    @Param('pilgrimId') pilgrimId: string,
  ) {
    return this.crmService.addPilgrimToGroup(req.user.tenantId, groupId, pilgrimId);
  }

  // ── Documents ─────────────────────────────────────────────────────────────

  @Get('pilgrims/:id/documents')
  @ApiOperation({ summary: 'List documents for a pilgrim' })
  getDocuments(@Request() req: any, @Param('id') id: string) {
    return this.crmService.getDocuments(req.user.tenantId, id);
  }

  @Delete('documents/:id')
  @ApiOperation({ summary: 'Delete a pilgrim document' })
  deleteDocument(@Request() req: any, @Param('id') id: string) {
    return this.crmService.deleteDocument(req.user.tenantId, id);
  }
}
