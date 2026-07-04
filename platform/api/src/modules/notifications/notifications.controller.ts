import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/tenant.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  @Get()
  async list(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const data = await this.svc.findMine(user.sub ?? user.id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      unreadOnly: unreadOnly === 'true' || unreadOnly === '1',
    });
    return { success: true, data };
  }

  @Patch('read')
  async markRead(@CurrentUser() user: any, @Body() body: { ids: string[] }) {
    return { success: true, data: await this.svc.markRead(user.sub ?? user.id, body.ids ?? []) };
  }

  @Post('read-all')
  async markAllRead(@CurrentUser() user: any) {
    return { success: true, data: await this.svc.markAllRead(user.sub ?? user.id) };
  }
}
