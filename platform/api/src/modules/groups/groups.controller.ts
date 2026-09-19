import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GroupAccess, GroupsService } from './groups.service';
import {
  CreateGroupDto, UpdateGroupDto, QueryGroupDto, CreateIncidentDto, UpdateIncidentDto,
  QueryPublicGroupDto, AddGroupMemberDto, CreateGroupInviteDto, RespondGroupInviteDto,
  CreateGroupPostDto, CreateGroupCommentDto, CreateGroupPollDto, VoteGroupPollDto,
  CreateGroupNoteDto, UpdateGroupNoteDto, AddGroupDocumentDto, AddGroupPilgrimDto, QueryGroupPostsDto,
} from './dto/group.dto';
import { TenantId, CurrentUser } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AnyAuthenticated } from '../../common/decorators/access.decorator';
import { RbacService } from '../rbac/rbac.service';
import { Principal } from '../auth/principal';

/**
 * Trip groups. Management routes require a CRM capability and act inside the
 * caller's organization. Member-facing routes (@AnyAuthenticated) serve both the
 * managing organization and the group's members — travelers included — and the
 * service decides per group: organization + capability, or active membership.
 */
@ApiTags('groups')
@Controller({ path: 'groups', version: '1' })
@ApiBearerAuth()
export class GroupsController {
  constructor(
    private readonly service: GroupsService,
    private readonly rbac: RbacService,
  ) {}

  /** The caller as the groups service sees them: identity plus their CRM capabilities (from the database). */
  private async access(req: any): Promise<GroupAccess> {
    const granted = await this.rbac.permissionsFor(req);
    const user: Principal = req.user;
    return {
      userId: user.sub,
      tenantId: user.tenantId,
      email: user.email,
      canRead: granted.has('crm:pilgrim:read'),
      canUpdate: granted.has('crm:pilgrim:update'),
    };
  }

  // ── Listing & basic CRUD ────────────────────────────────────────────
  @Get()
  @RequirePermissions('crm:pilgrim:read')
  async findAll(@TenantId() tenantId: string, @Query() query: QueryGroupDto) {
    return { success: true, data: await this.service.findAll(tenantId, query) };
  }

  /** Groups the signed-in user is an active member of (travelers included). */
  @Get('mine')
  @AnyAuthenticated()
  async findMine(@CurrentUser() user: Principal) {
    return { success: true, data: await this.service.findMine(user.sub) };
  }

  @Get('public')
  @Public()
  async findPublic(@Query() query: QueryPublicGroupDto) {
    return { success: true, data: await this.service.findPublic(query) };
  }

  /** Pending invitations addressed to the signed-in user. */
  @Get('invites/mine')
  @AnyAuthenticated()
  async myInvites(@CurrentUser() user: Principal) {
    return { success: true, data: await this.service.listMyInvites({ userId: user.sub, email: user.email }) };
  }

  @Post()
  @RequirePermissions('crm:pilgrim:update')
  async create(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Body() dto: CreateGroupDto) {
    return { success: true, data: await this.service.create(tenantId, user.sub, dto) };
  }

  @Get('stats')
  @RequirePermissions('crm:pilgrim:read')
  async getStats(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getStats(tenantId) };
  }

  /** Full record for the managing organization; the public-safe view for members, invitees and link holders. */
  @Get(':id')
  @AnyAuthenticated()
  async findOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findOne(await this.access(req), id) };
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
  async addMember(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: AddGroupMemberDto) {
    return { success: true, data: await this.service.addMember(tenantId, user.sub, id, body.userId, body.role) };
  }

  @Delete(':id/members/:userId')
  @RequirePermissions('crm:pilgrim:update')
  async removeMember(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) {
    return { success: true, data: await this.service.removeMember(tenantId, id, userId) };
  }

  // ── Self-service join/leave (PUBLIC groups, or UNLISTED ones by link) ─
  @Post(':id/join')
  @AnyAuthenticated()
  async joinGroup(@CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.selfJoin(id, user.sub) };
  }

  @Post(':id/leave')
  @AnyAuthenticated()
  async leaveGroup(@CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string) {
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
  async createInvite(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: CreateGroupInviteDto) {
    return { success: true, data: await this.service.createInvite(tenantId, id, user.sub, body) };
  }

  @Post('invites/:inviteId/respond')
  @AnyAuthenticated()
  async respondInvite(@CurrentUser() user: Principal, @Param('inviteId', ParseUUIDPipe) inviteId: string, @Body() body: RespondGroupInviteDto) {
    return { success: true, data: await this.service.respondInvite(user, inviteId, body.accept) };
  }

  @Post('invites/:inviteId/revoke')
  @RequirePermissions('crm:pilgrim:update')
  async revokeInvite(@TenantId() tenantId: string, @Param('inviteId', ParseUUIDPipe) inviteId: string) {
    return { success: true, data: await this.service.revokeInvite(tenantId, inviteId) };
  }

  // ── Discussion (managing organization or active members) ────────────
  @Get(':id/posts')
  @AnyAuthenticated()
  async listPosts(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Query() query: QueryGroupPostsDto) {
    return { success: true, data: await this.service.listPosts(await this.access(req), id, query) };
  }

  @Post(':id/posts')
  @AnyAuthenticated()
  async createPost(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: CreateGroupPostDto) {
    return { success: true, data: await this.service.createPost(await this.access(req), id, body) };
  }

  @Delete('posts/:postId')
  @AnyAuthenticated()
  async deletePost(@Req() req: any, @Param('postId', ParseUUIDPipe) postId: string) {
    return { success: true, data: await this.service.deletePost(await this.access(req), postId) };
  }

  @Get('posts/:postId/comments')
  @AnyAuthenticated()
  async listComments(@Req() req: any, @Param('postId', ParseUUIDPipe) postId: string) {
    return { success: true, data: await this.service.listComments(await this.access(req), postId) };
  }

  @Post('posts/:postId/comments')
  @AnyAuthenticated()
  async createComment(@Req() req: any, @Param('postId', ParseUUIDPipe) postId: string, @Body() body: CreateGroupCommentDto) {
    return { success: true, data: await this.service.createComment(await this.access(req), postId, body.body) };
  }

  @Delete('posts/:postId/comments/:commentId')
  @AnyAuthenticated()
  async deleteComment(
    @Req() req: any,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ) {
    return { success: true, data: await this.service.deleteComment(await this.access(req), postId, commentId) };
  }

  // ── Polls ──────────────────────────────────────────────────────────
  @Get(':id/polls')
  @AnyAuthenticated()
  async listPolls(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.listPolls(await this.access(req), id) };
  }

  @Post(':id/polls')
  @RequirePermissions('crm:pilgrim:update')
  async createPoll(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: CreateGroupPollDto) {
    return { success: true, data: await this.service.createPoll(tenantId, id, user.sub, body) };
  }

  @Post('polls/:pollId/vote')
  @AnyAuthenticated()
  async vote(@Req() req: any, @Param('pollId', ParseUUIDPipe) pollId: string, @Body() body: VoteGroupPollDto) {
    return { success: true, data: await this.service.vote(await this.access(req), pollId, body.optionIndices) };
  }

  @Post('polls/:pollId/close')
  @RequirePermissions('crm:pilgrim:update')
  async closePoll(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Param('pollId', ParseUUIDPipe) pollId: string) {
    return { success: true, data: await this.service.closePoll(tenantId, user.sub, pollId) };
  }

  // ── Notes ──────────────────────────────────────────────────────────
  @Get(':id/notes')
  @RequirePermissions('crm:pilgrim:read')
  async listNotes(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.listNotes(tenantId, id) };
  }

  @Post(':id/notes')
  @RequirePermissions('crm:pilgrim:update')
  async createNote(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: CreateGroupNoteDto) {
    return { success: true, data: await this.service.createNote(tenantId, id, user.sub, body) };
  }

  @Put('notes/:noteId')
  @RequirePermissions('crm:pilgrim:update')
  async updateNote(@TenantId() tenantId: string, @Param('noteId', ParseUUIDPipe) noteId: string, @Body() body: UpdateGroupNoteDto) {
    return { success: true, data: await this.service.updateNote(tenantId, noteId, body) };
  }

  @Delete('notes/:noteId')
  @RequirePermissions('crm:pilgrim:update')
  async deleteNote(@TenantId() tenantId: string, @Param('noteId', ParseUUIDPipe) noteId: string) {
    return { success: true, data: await this.service.deleteNote(tenantId, noteId) };
  }

  // ── Documents ──────────────────────────────────────────────────────
  @Get(':id/documents')
  @RequirePermissions('crm:pilgrim:read')
  async listDocuments(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.listDocuments(tenantId, id) };
  }

  @Post(':id/documents')
  @RequirePermissions('crm:pilgrim:update')
  async addDocument(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: AddGroupDocumentDto) {
    return { success: true, data: await this.service.addDocument(tenantId, id, user.sub, body) };
  }

  @Delete('documents/:documentId')
  @RequirePermissions('crm:pilgrim:update')
  async deleteDocument(@TenantId() tenantId: string, @Param('documentId', ParseUUIDPipe) documentId: string) {
    return { success: true, data: await this.service.deleteDocument(tenantId, documentId) };
  }

  // ── Related entities (bookings, transport, etc.) ───────────────────
  @Get(':id/related')
  @RequirePermissions('crm:pilgrim:read')
  async getRelated(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.getRelated(tenantId, id) };
  }

  // ── Pilgrims / incidents ───────────────────────────────────────────
  @Post(':id/pilgrims')
  @RequirePermissions('crm:pilgrim:update')
  async addPilgrim(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: AddGroupPilgrimDto) {
    return { success: true, data: await this.service.addPilgrim(tenantId, id, body.bookingId) };
  }

  @Get(':id/incidents')
  @RequirePermissions('crm:pilgrim:read')
  async getIncidents(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.getIncidents(tenantId, id) };
  }

  @Post(':id/incidents')
  @RequirePermissions('crm:pilgrim:update')
  async createIncident(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: Principal, @Body() dto: CreateIncidentDto) {
    return { success: true, data: await this.service.createIncident(tenantId, id, user.sub, dto) };
  }

  @Put(':id/incidents/:incidentId')
  @RequirePermissions('crm:pilgrim:update')
  async updateIncident(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Param('incidentId', ParseUUIDPipe) incidentId: string, @Body() dto: UpdateIncidentDto) {
    return { success: true, data: await this.service.updateIncident(tenantId, id, incidentId, dto) };
  }
}
