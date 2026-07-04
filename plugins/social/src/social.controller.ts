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
import { SocialService, CreatePostDto, ReactionType, ModerationStatus, FeedOptions } from './social.service';
import { JwtAuthGuard } from '../../../core/src/auth/jwt-auth.guard';

@ApiTags('Social')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('plugins/social')
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  // ── Posts ─────────────────────────────────────────────────────────────────

  @Post('posts')
  @ApiOperation({ summary: 'Create a post' })
  createPost(@Request() req: any, @Body() dto: CreatePostDto) {
    return this.socialService.createPost(req.user.tenantId, req.user.userId, dto);
  }

  @Get('posts/:id')
  @ApiOperation({ summary: 'Get a post by ID' })
  getPost(@Param('id') id: string) {
    return this.socialService.getPost(id);
  }

  // ── Feed ──────────────────────────────────────────────────────────────────

  @Get('feed')
  @ApiOperation({ summary: 'Get personalized feed' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'groupId', required: false })
  @ApiQuery({ name: 'tags', required: false })
  getFeed(
    @Request() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('groupId') groupId?: string,
    @Query('tags') tags?: string,
  ) {
    const options: FeedOptions = {
      page,
      limit,
      groupId,
      tags: tags ? tags.split(',') : undefined,
    };
    return this.socialService.getFeed(req.user.userId, options);
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  @Post('posts/:postId/comments')
  @ApiOperation({ summary: 'Comment on a post' })
  createComment(
    @Request() req: any,
    @Param('postId') postId: string,
    @Body('body') body: string,
    @Body('parentCommentId') parentCommentId?: string,
  ) {
    return this.socialService.createComment(postId, req.user.userId, body, parentCommentId);
  }

  @Get('posts/:postId/comments')
  @ApiOperation({ summary: 'List comments on a post' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getComments(
    @Param('postId') postId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.socialService.getComments(postId, page, limit);
  }

  // ── Reactions ─────────────────────────────────────────────────────────────

  @Post('posts/:postId/reactions')
  @ApiOperation({ summary: 'Toggle a reaction on a post' })
  toggleReaction(
    @Request() req: any,
    @Param('postId') postId: string,
    @Body('type') type: ReactionType,
  ) {
    return this.socialService.toggleReaction(req.user.userId, postId, type);
  }

  // ── Follows ───────────────────────────────────────────────────────────────

  @Post('accounts/:id/follow')
  @ApiOperation({ summary: 'Follow an account' })
  follow(@Request() req: any, @Param('id') followedId: string) {
    return this.socialService.followAccount(req.user.userId, followedId);
  }

  @Delete('accounts/:id/follow')
  @ApiOperation({ summary: 'Unfollow an account' })
  unfollow(@Request() req: any, @Param('id') followedId: string) {
    return this.socialService.unfollowAccount(req.user.userId, followedId);
  }

  @Get('accounts/:id/followers')
  @ApiOperation({ summary: 'Get account followers' })
  getFollowers(@Param('id') id: string) {
    return this.socialService.getFollowers(id);
  }

  @Get('accounts/:id/following')
  @ApiOperation({ summary: 'Get accounts followed by account' })
  getFollowing(@Param('id') id: string) {
    return this.socialService.getFollowing(id);
  }

  // ── Messaging ─────────────────────────────────────────────────────────────

  @Post('conversations')
  @ApiOperation({ summary: 'Get or create a conversation' })
  getOrCreateConversation(@Body('participantIds') participantIds: string[]) {
    return this.socialService.getOrCreateConversation(participantIds);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a message in a conversation' })
  sendMessage(
    @Request() req: any,
    @Param('id') conversationId: string,
    @Body('body') body: string,
  ) {
    return this.socialService.sendMessage(conversationId, req.user.userId, body);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Get messages in a conversation' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getMessages(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.socialService.getMessages(id, page, limit);
  }

  // ── Moderation ────────────────────────────────────────────────────────────

  @Patch('posts/:id/moderate')
  @ApiOperation({ summary: 'Apply moderation decision to a post' })
  moderatePost(
    @Request() req: any,
    @Param('id') id: string,
    @Body('status') status: ModerationStatus,
    @Body('notes') notes?: string,
  ) {
    return this.socialService.moderatePost(id, req.user.userId, status, notes);
  }

  @Post('posts/:id/report')
  @ApiOperation({ summary: 'Report a post for policy violation' })
  reportPost(
    @Request() req: any,
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    return this.socialService.reportPost(id, req.user.userId, reason);
  }

  @Get('moderation/queue')
  @ApiOperation({ summary: 'Get moderation queue' })
  getModerationQueue(@Request() req: any) {
    return this.socialService.getModerationQueue(req.user.tenantId);
  }

  @Get('moderation/reports')
  @ApiOperation({ summary: 'Get reported posts' })
  getReportedPosts(@Request() req: any) {
    return this.socialService.getReportedPosts(req.user.tenantId);
  }
}
