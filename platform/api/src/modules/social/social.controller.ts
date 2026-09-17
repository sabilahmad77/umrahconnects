import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SocialService } from './social.service';
import { TenantId, CurrentUser } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AnyAuthenticated } from '../../common/decorators/access.decorator';
import { Principal } from '../auth/principal';
import {
  QueryFeedDto, CreatePostDto, UpdatePostDto, CreateCommentDto, ReactDto,
  UpdateSocialAccountDto, OpenConversationDto, SendMessageDto,
} from './dto/social.dto';

@ApiTags('social')
@Controller({ path: 'social', version: '1' })
@ApiBearerAuth()
export class SocialController {
  constructor(private readonly service: SocialService) {}

  @Get('feed')
  @RequirePermissions('social:post:read')
  async getFeed(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Query() query: QueryFeedDto) {
    return { success: true, data: await this.service.getFeed(tenantId, user.sub, query, user.roles) };
  }

  @Post('posts')
  @RequirePermissions('social:post:create')
  async createPost(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Body() dto: CreatePostDto) {
    return { success: true, data: await this.service.createPost(tenantId, user.sub, dto) };
  }

  @Get('posts/:id')
  @RequirePermissions('social:post:read')
  async getPost(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.getPost(user.sub, id, user.roles) };
  }

  @Put('posts/:id')
  @RequirePermissions('social:post:create')
  async updatePost(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePostDto) {
    return { success: true, data: await this.service.updatePost(tenantId, user.sub, id, dto) };
  }

  @Delete('posts/:id')
  @RequirePermissions('social:post:create')
  async deletePost(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.deletePost(tenantId, user.sub, id) };
  }

  @Post('posts/:id/comments')
  @RequirePermissions('social:post:create')
  async addComment(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateCommentDto) {
    return { success: true, data: await this.service.addComment(tenantId, user.sub, id, dto, user.roles) };
  }

  @Delete('posts/:id/comments/:commentId')
  @RequirePermissions('social:post:create')
  async deleteComment(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string, @Param('commentId', ParseUUIDPipe) commentId: string) {
    return { success: true, data: await this.service.deleteComment(tenantId, user.sub, id, commentId) };
  }

  @Post('posts/:id/react')
  @RequirePermissions('social:post:create')
  async react(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReactDto) {
    return { success: true, data: await this.service.toggleReaction(tenantId, user.sub, id, dto ?? {}, user.roles) };
  }

  @Get('accounts/me')
  @RequirePermissions('social:post:read')
  async getMyAccount(@TenantId() tenantId: string, @CurrentUser() user: Principal) {
    return { success: true, data: await this.service.getOrCreateAccount(tenantId, user.sub) };
  }

  @Put('accounts/me')
  @RequirePermissions('social:post:create')
  async updateMyAccount(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Body() dto: UpdateSocialAccountDto) {
    return { success: true, data: await this.service.updateAccount(tenantId, user.sub, dto) };
  }

  @Post('accounts/:id/follow')
  @RequirePermissions('social:post:create')
  async toggleFollow(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.toggleFollow(tenantId, user.sub, id) };
  }

  // ─── Messaging ───────────────────────────────────────────────────────
  @Get('conversations')
  @AnyAuthenticated()
  async listConversations(@TenantId() tenantId: string, @CurrentUser() user: Principal) {
    return { success: true, data: await this.service.listConversations(tenantId, user.sub) };
  }

  @Post('conversations/open')
  @AnyAuthenticated()
  async openConversation(
    @TenantId() tenantId: string,
    @CurrentUser() user: Principal,
    @Body() body: OpenConversationDto,
  ) {
    return { success: true, data: await this.service.openConversation(tenantId, user.sub, body.recipientUserId) };
  }

  @Get('conversations/:id/messages')
  @AnyAuthenticated()
  async listMessages(
    @TenantId() tenantId: string,
    @CurrentUser() user: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      success: true,
      data: await this.service.listMessages(tenantId, user.sub, id, {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  @Post('conversations/:id/messages')
  @AnyAuthenticated()
  async sendMessage(
    @TenantId() tenantId: string,
    @CurrentUser() user: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SendMessageDto,
  ) {
    const text = body.body ?? body.content ?? '';
    return { success: true, data: await this.service.sendMessage(tenantId, user.sub, id, text) };
  }

  // ─── Save / bookmark posts ──────────────────────────────────────────
  @Post('posts/:id/save')
  @RequirePermissions('social:post:read')
  async toggleSavePost(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.toggleSavePost(tenantId, user.sub, id, user.roles) };
  }

  @Get('saved-posts')
  @RequirePermissions('social:post:read')
  async listSavedPosts(@TenantId() tenantId: string, @CurrentUser() user: Principal) {
    return { success: true, data: await this.service.listSavedPosts(tenantId, user.sub, user.roles) };
  }

  // ─── Discover ──────────────────────────────────────────────────────
  @Get('discover/people')
  @RequirePermissions('social:post:read')
  async discoverPeople(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Query('search') search?: string, @Query('limit') limit?: string) {
    return { success: true, data: await this.service.discoverPeople(tenantId, user.sub, { search, limit: limit ? Number(limit) : undefined }) };
  }

  @Get('discover/groups')
  @RequirePermissions('social:post:read')
  async discoverGroups(@Query('search') search?: string, @Query('limit') limit?: string) {
    return { success: true, data: await this.service.discoverGroups({ search, limit: limit ? Number(limit) : undefined }) };
  }

  @Get('discover/trending')
  @RequirePermissions('social:post:read')
  async discoverTrending(@Query('limit') limit?: string) {
    return { success: true, data: await this.service.trendingPosts(limit ? Number(limit) : undefined) };
  }
}
