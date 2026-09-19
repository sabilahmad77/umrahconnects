import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/tenant.decorator';
import { AnyAuthenticated } from '../../common/decorators/access.decorator';
import { Principal } from '../auth/principal';
import { ConnectionsService } from './connections.service';
import { RequestConnectionDto } from './dto/connection.dto';

/**
 * Responses use the standard `{ success, data }` envelope like every other
 * module (they used to return bare objects).
 */
@ApiTags('connections')
@ApiBearerAuth()
@Controller('connections')
// Self-service: every handler is scoped to the caller (ConnectionsService checks the parties).
@AnyAuthenticated()
export class ConnectionsController {
  constructor(private svc: ConnectionsService) {}

  @Post('request')
  async request(@CurrentUser() user: Principal, @Body() body: RequestConnectionDto) {
    return { success: true, data: await this.svc.request(user.sub, (body.recipientId ?? body.targetUserId) as string, body.message) };
  }

  @Post(':id/accept')
  async accept(@CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.svc.respond(user.sub, id, 'ACCEPTED') };
  }

  @Post(':id/reject')
  async reject(@CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.svc.respond(user.sub, id, 'REJECTED') };
  }

  /** Removes a connection, or withdraws / dismisses a pending request, with that user. */
  @Delete('with/:userId')
  async remove(@CurrentUser() user: Principal, @Param('userId', ParseUUIDPipe) userId: string) {
    return { success: true, data: await this.svc.remove(user.sub, userId) };
  }

  @Get()
  async list(@CurrentUser() user: Principal) {
    return { success: true, data: await this.svc.listAccepted(user.sub) };
  }

  /** Incoming requests awaiting the caller's answer. */
  @Get('pending')
  async pending(@CurrentUser() user: Principal) {
    return { success: true, data: await this.svc.listPending(user.sub) };
  }

  /** Requests the caller sent that are still awaiting an answer. */
  @Get('outgoing')
  async outgoing(@CurrentUser() user: Principal) {
    return { success: true, data: await this.svc.listOutgoing(user.sub) };
  }

  @Get('status/:userId')
  async status(@CurrentUser() user: Principal, @Param('userId', ParseUUIDPipe) userId: string) {
    return { success: true, data: await this.svc.status(user.sub, userId) };
  }
}
