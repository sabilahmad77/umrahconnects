import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GroupsService } from './groups.service';
import { CreateGroupDto, UpdateGroupDto, QueryGroupDto, CreateIncidentDto, UpdateIncidentDto } from './dto/group.dto';
import { TenantId, CurrentUser } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('groups')
@Controller({ path: 'groups', version: '1' })
@ApiBearerAuth()
export class GroupsController {
  constructor(private readonly service: GroupsService) {}

  // ── Listing & basic CRUD ────────────────────────────────────────────
  @Get()
  @RequirePermissions('crm:pilgrim:read')
  async findAll(@TenantId() tenantId: string, @Query() query: QueryGroupDto) {
    return { success: true, data: await this.service.findAll(tenantId, query) };
  }

  @Get('public')
  @Public()
  async findPublic(@Query() query: any) {
    return { success: true, data: await this.service.findPublic(query) };
  }

  @Post()
  @RequirePermissions('crm:pilgrim:update')
  async create(@TenantId() tenantId: string, @CurrentUser() user: any, @Body() dto: CreateGroupDto) {
    return { success: true, data: await this.service.create(tenantId, user.sub, dto) };
  }

  @Get('stats')
  @RequirePermissions('crm:pilgrim:read')
  async getStats(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getStats(tenantId) };
  }

  @Get(':id')
  @RequirePermissions('crm:pilgrim:read')
  async findOne(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findOne(tenantId, id) };
  }

  @Put(':id')
  @RequirePermissions('crm:pilgrim:update')
  async update(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGroupDto) {
    return { success: true, data: await this.service.update(tenantId, id, dto) };
  }

  @Delete(':id')
  @RequirePermissions('crm:pilgrim:update')
  async remove(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.remove(tenantId, id) };
  }

  // ── Members ────────────────────────────────────────────────────────
  @Get(':id/members')
  @RequirePermissions('crm:pilgrim:read')
  async listMembers(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.listMembers(tenantId, id) };
  }

  @Post(':id/members')
  @RequirePermissions('crm:pilgrim:update')
  async addMember(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: { userId: string; role?: string }) {
    return { success: true, data: await this.service.addMember(tenantId, id, body.userId, body.role) };
  }

  @Delete(':id/members/:userId')
  @RequirePermissions('crm:pilgrim:update')
  async removeMember(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) {
    return { success: true, data: await this.service.removeMember(tenantId, id, userId) };
  }

  // ── Self-service join/leave (travelers — PUBLIC groups only) ───────
  @Post(':id/join')
  async joinGroup(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.selfJoin(id, user.sub) };
  }

  @Post(':id/leave')
  async leaveGroup(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.selfLeave(id, user.sub) };
  }

  // ── Invites ────────────────────────────────────────────────────────
  @Get(':id/invites')
  @RequirePermissions('crm:pilgrim:read')
  async listInvites(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.listInvites(tenantId, id) };
  }

  @Post(':id/invites')
  @RequirePermissions('crm:pilgrim:update')
  async createInvite(@TenantId() tenantId: string, @CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return { success: true, data: await this.service.createInvite(tenantId, id, user.sub, body) };
  }

  @Post('invites/:inviteId/respond')
  async respondInvite(@CurrentUser() user: any, @Param('inviteId', ParseUUIDPipe) inviteId: string, @Body() body: { accept: boolean }) {
    return { success: true, data: await this.service.respondInvite(user.sub, inviteId, body.accept) };
  }

  // ── Discussion ─────────────────────────────────────────────────────
  @Get(':id/posts')
  @RequirePermissions('crm:pilgrim:read')
  async listPosts(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.listPosts(tenantId, id) };
  }

  @Post(':id/posts')
  @RequirePermissions('crm:pilgrim:update')
  async createPost(@TenantId() tenantId: string, @CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return { success: true, data: await this.service.createPost(tenantId, id, user.sub, body) };
  }

  @Delete('posts/:postId')
  @RequirePermissions('crm:pilgrim:update')
  async deletePost(@Param('postId', ParseUUIDPipe) postId: string) {
    return { success: true, data: await this.service.deletePost('', postId) };
  }

  @Get('posts/:postId/comments')
  @RequirePermissions('crm:pilgrim:read')
  async listComments(@Param('postId', ParseUUIDPipe) postId: string) {
    return { success: true, data: await this.service.listComments(postId) };
  }

  @Post('posts/:postId/comments')
  @RequirePermissions('crm:pilgrim:update')
  async createComment(@CurrentUser() user: any, @Param('postId', ParseUUIDPipe) postId: string, @Body() body: { body: string }) {
    return { success: true, data: await this.service.createComment(postId, user.sub, body.body) };
  }

  // ── Polls ──────────────────────────────────────────────────────────
  @Get(':id/polls')
  @RequirePermissions('crm:pilgrim:read')
  async listPolls(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.listPolls(tenantId, id) };
  }

  @Post(':id/polls')
  @RequirePermissions('crm:pilgrim:update')
  async createPoll(@TenantId() tenantId: string, @CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return { success: true, data: await this.service.createPoll(tenantId, id, user.sub, body) };
  }

  @Post('polls/:pollId/vote')
  @RequirePermissions('crm:pilgrim:read')
  async vote(@CurrentUser() user: any, @Param('pollId', ParseUUIDPipe) pollId: string, @Body() body: { optionIndices: number[] }) {
    return { success: true, data: await this.service.vote(pollId, user.sub, body.optionIndices ?? []) };
  }

  @Post('polls/:pollId/close')
  @RequirePermissions('crm:pilgrim:update')
  async closePoll(@Param('pollId', ParseUUIDPipe) pollId: string) {
    return { success: true, data: await this.service.closePoll(pollId) };
  }

  // ── Notes ──────────────────────────────────────────────────────────
  @Get(':id/notes')
  @RequirePermissions('crm:pilgrim:read')
  async listNotes(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.listNotes(tenantId, id) };
  }

  @Post(':id/notes')
  @RequirePermissions('crm:pilgrim:update')
  async createNote(@TenantId() tenantId: string, @CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return { success: true, data: await this.service.createNote(tenantId, id, user.sub, body) };
  }

  @Put('notes/:noteId')
  @RequirePermissions('crm:pilgrim:update')
  async updateNote(@Param('noteId', ParseUUIDPipe) noteId: string, @Body() body: any) {
    return { success: true, data: await this.service.updateNote(noteId, body) };
  }

  @Delete('notes/:noteId')
  @RequirePermissions('crm:pilgrim:update')
  async deleteNote(@Param('noteId', ParseUUIDPipe) noteId: string) {
    return { success: true, data: await this.service.deleteNote(noteId) };
  }

  // ── Documents ──────────────────────────────────────────────────────
  @Get(':id/documents')
  @RequirePermissions('crm:pilgrim:read')
  async listDocuments(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.listDocuments(tenantId, id) };
  }

  @Post(':id/documents')
  @RequirePermissions('crm:pilgrim:update')
  async addDocument(@TenantId() tenantId: string, @CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return { success: true, data: await this.service.addDocument(tenantId, id, user.sub, body) };
  }

  @Delete('documents/:documentId')
  @RequirePermissions('crm:pilgrim:update')
  async deleteDocument(@Param('documentId', ParseUUIDPipe) documentId: string) {
    return { success: true, data: await this.service.deleteDocument(documentId) };
  }

  // ── Related entities (bookings, transport, etc.) ───────────────────
  @Get(':id/related')
  @RequirePermissions('crm:pilgrim:read')
  async getRelated(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.getRelated(tenantId, id) };
  }

  // ── Pilgrim/Incidents (legacy) ─────────────────────────────────────
  @Post(':id/pilgrims')
  @RequirePermissions('crm:pilgrim:update')
  async addPilgrim(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: { bookingId: string }) {
    return { success: true, data: await this.service.addPilgrim(tenantId, id, body.bookingId) };
  }

  @Get(':id/incidents')
  @RequirePermissions('crm:pilgrim:read')
  async getIncidents(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.getIncidents(tenantId, id) };
  }

  @Post(':id/incidents')
  @RequirePermissions('crm:pilgrim:update')
  async createIncident(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any, @Body() dto: CreateIncidentDto) {
    return { success: true, data: await this.service.createIncident(tenantId, id, user.sub, dto) };
  }

  @Put(':id/incidents/:incidentId')
  @RequirePermissions('crm:pilgrim:update')
  async updateIncident(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Param('incidentId', ParseUUIDPipe) incidentId: string, @Body() dto: UpdateIncidentDto) {
    return { success: true, data: await this.service.updateIncident(tenantId, incidentId, dto) };
  }
}
