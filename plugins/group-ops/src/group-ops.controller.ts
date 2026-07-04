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
import { GroupOpsService, CreateTripGroupDto, CreateItineraryItemDto, CreateIncidentDto, TripGroup, Incident } from './group-ops.service';
import { JwtAuthGuard } from '../../../core/src/auth/jwt-auth.guard';

@ApiTags('GroupOps')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('plugins/group-ops')
export class GroupOpsController {
  constructor(private readonly groupOpsService: GroupOpsService) {}

  // ── Trip Groups ───────────────────────────────────────────────────────────

  @Post('groups')
  @ApiOperation({ summary: 'Create a trip group' })
  createGroup(@Request() req: any, @Body() dto: CreateTripGroupDto) {
    return this.groupOpsService.createTripGroup({ ...dto, tenantId: req.user.tenantId });
  }

  @Get('groups')
  @ApiOperation({ summary: 'List trip groups' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'packageId', required: false })
  listGroups(
    @Request() req: any,
    @Query('status') status?: TripGroup['status'],
    @Query('packageId') packageId?: string,
  ) {
    return this.groupOpsService.listTripGroups(req.user.tenantId, { status, packageId });
  }

  @Get('groups/:id')
  @ApiOperation({ summary: 'Get a trip group' })
  getGroup(@Request() req: any, @Param('id') id: string) {
    return this.groupOpsService.getTripGroup(req.user.tenantId, id);
  }

  @Post('groups/:groupId/pilgrims/:pilgrimId')
  @ApiOperation({ summary: 'Add pilgrim to trip group' })
  addPilgrim(@Param('groupId') groupId: string, @Param('pilgrimId') pilgrimId: string) {
    return this.groupOpsService.addPilgrimToGroup(groupId, pilgrimId);
  }

  @Delete('groups/:groupId/pilgrims/:pilgrimId')
  @ApiOperation({ summary: 'Remove pilgrim from trip group' })
  removePilgrim(@Param('groupId') groupId: string, @Param('pilgrimId') pilgrimId: string) {
    return this.groupOpsService.removePilgrimFromGroup(groupId, pilgrimId);
  }

  // ── Itineraries ───────────────────────────────────────────────────────────

  @Post('groups/:id/itinerary')
  @ApiOperation({ summary: 'Set/replace itinerary for a trip group' })
  setItinerary(@Request() req: any, @Param('id') id: string, @Body() items: CreateItineraryItemDto[]) {
    return this.groupOpsService.setItinerary(req.user.tenantId, id, items);
  }

  @Get('groups/:id/itinerary')
  @ApiOperation({ summary: 'Get itinerary for a trip group' })
  getItinerary(@Param('id') id: string) {
    return this.groupOpsService.getItinerary(id);
  }

  // ── Mutawif ───────────────────────────────────────────────────────────────

  @Get('mutawifs')
  @ApiOperation({ summary: 'List mutawifs' })
  listMutawifs(@Request() req: any) {
    return this.groupOpsService.listMutawifs(req.user.tenantId);
  }

  @Post('groups/:id/mutawif')
  @ApiOperation({ summary: 'Assign a mutawif to a trip group' })
  assignMutawif(
    @Request() req: any,
    @Param('id') id: string,
    @Body('mutawifId') mutawifId: string,
  ) {
    return this.groupOpsService.assignMutawif(req.user.tenantId, id, mutawifId);
  }

  // ── Incidents ─────────────────────────────────────────────────────────────

  @Post('incidents')
  @ApiOperation({ summary: 'Report an incident' })
  reportIncident(@Request() req: any, @Body() dto: CreateIncidentDto) {
    return this.groupOpsService.reportIncident(req.user.tenantId, dto);
  }

  @Get('incidents')
  @ApiOperation({ summary: 'List incidents' })
  @ApiQuery({ name: 'groupId', required: false })
  @ApiQuery({ name: 'severity', required: false })
  listIncidents(
    @Request() req: any,
    @Query('groupId') groupId?: string,
    @Query('severity') severity?: Incident['severity'],
  ) {
    return this.groupOpsService.listIncidents(req.user.tenantId, { groupId, severity });
  }

  @Patch('incidents/:id/resolve')
  @ApiOperation({ summary: 'Resolve an incident' })
  resolveIncident(
    @Request() req: any,
    @Param('id') id: string,
    @Body('resolution') resolution: string,
  ) {
    return this.groupOpsService.resolveIncident(req.user.tenantId, id, resolution);
  }
}
