import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/tenant.decorator';
import { ConnectionsService } from './connections.service';

@ApiTags('connections')
@ApiBearerAuth()
@Controller('connections')
export class ConnectionsController {
  constructor(private svc: ConnectionsService) {}

  @Post('request')
  async request(
    @CurrentUser() user: any,
    @Body() body: { recipientId: string; message?: string },
  ) {
    return this.svc.request(user.sub ?? user.id, body.recipientId, body.message);
  }

  @Post(':id/accept')
  async accept(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.respond(user.sub ?? user.id, id, 'ACCEPTED');
  }

  @Post(':id/reject')
  async reject(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.respond(user.sub ?? user.id, id, 'REJECTED');
  }

  @Delete('with/:userId')
  async remove(@CurrentUser() user: any, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.svc.remove(user.sub ?? user.id, userId);
  }

  @Get()
  async list(@CurrentUser() user: any) {
    return this.svc.listAccepted(user.sub ?? user.id);
  }

  @Get('pending')
  async pending(@CurrentUser() user: any) {
    return this.svc.listPending(user.sub ?? user.id);
  }

  @Get('status/:userId')
  async status(@CurrentUser() user: any, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.svc.status(user.sub ?? user.id, userId);
  }
}
