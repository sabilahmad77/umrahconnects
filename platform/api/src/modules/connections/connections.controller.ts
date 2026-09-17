import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/tenant.decorator';
import { AnyAuthenticated } from '../../common/decorators/access.decorator';
import { Principal } from '../auth/principal';
import { ConnectionsService } from './connections.service';
import { RequestConnectionDto } from './dto/connection.dto';

@ApiTags('connections')
@ApiBearerAuth()
@Controller('connections')
// Self-service: every handler is scoped to the caller (ConnectionsService checks the parties).
@AnyAuthenticated()
export class ConnectionsController {
  constructor(private svc: ConnectionsService) {}

  @Post('request')
  async request(
    @CurrentUser() user: Principal,
    @Body() body: RequestConnectionDto,
  ) {
    return this.svc.request(user.sub, (body.recipientId ?? body.targetUserId) as string, body.message);
  }

  @Post(':id/accept')
  async accept(@CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.respond(user.sub, id, 'ACCEPTED');
  }

  @Post(':id/reject')
  async reject(@CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.respond(user.sub, id, 'REJECTED');
  }

  @Delete('with/:userId')
  async remove(@CurrentUser() user: Principal, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.svc.remove(user.sub, userId);
  }

  @Get()
  async list(@CurrentUser() user: Principal) {
    return this.svc.listAccepted(user.sub);
  }

  @Get('pending')
  async pending(@CurrentUser() user: Principal) {
    return this.svc.listPending(user.sub);
  }

  @Get('status/:userId')
  async status(@CurrentUser() user: Principal, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.svc.status(user.sub, userId);
  }
}
