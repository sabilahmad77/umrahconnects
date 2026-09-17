import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/tenant.decorator';
import { AnyAuthenticated } from '../../common/decorators/access.decorator';
import { Principal } from '../auth/principal';
import { NotificationsService } from './notifications.service';
import { MarkNotificationsReadDto } from './dto/notification.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
// Self-service: NotificationsService scopes every query to recipientId = caller.
@AnyAuthenticated()
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  @Get()
  async list(
    @CurrentUser() user: Principal,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const data = await this.svc.findMine(user.sub, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      unreadOnly: unreadOnly === 'true' || unreadOnly === '1',
    });
    return { success: true, data };
  }

  @Patch('read')
  async markRead(@CurrentUser() user: Principal, @Body() body: MarkNotificationsReadDto) {
    return { success: true, data: await this.svc.markRead(user.sub, body.ids ?? []) };
  }

  @Post('read-all')
  async markAllRead(@CurrentUser() user: Principal) {
    return { success: true, data: await this.svc.markAllRead(user.sub) };
  }
}
