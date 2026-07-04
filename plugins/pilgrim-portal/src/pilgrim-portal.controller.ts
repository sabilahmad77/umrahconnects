import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PilgrimPortalService } from './pilgrim-portal.service';
import { JwtAuthGuard } from '../../../core/src/auth/jwt-auth.guard';

@ApiTags('PilgrimPortal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('portal')
export class PilgrimPortalController {
  constructor(private readonly portalService: PilgrimPortalService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the current pilgrim profile' })
  getMyProfile(@Request() req: any) {
    return this.portalService.getMyProfile(req.user.tenantId, req.user.pilgrimId);
  }

  @Patch('me/contact')
  @ApiOperation({ summary: 'Update pilgrim contact details' })
  updateContact(
    @Request() req: any,
    @Body() dto: { phone?: string; emergencyContactName?: string; emergencyContactPhone?: string },
  ) {
    return this.portalService.updateMyContact(req.user.tenantId, req.user.pilgrimId, dto);
  }

  @Get('me/booking')
  @ApiOperation({ summary: 'Get pilgrim booking summary' })
  getMyBooking(@Request() req: any) {
    return this.portalService.getMyBooking(req.user.tenantId, req.user.pilgrimId);
  }

  @Get('me/itinerary')
  @ApiOperation({ summary: 'Get trip itinerary for the pilgrim' })
  getMyItinerary(@Request() req: any) {
    return this.portalService.getMyItinerary(req.user.tenantId, req.user.pilgrimId);
  }

  @Get('me/documents')
  @ApiOperation({ summary: 'Get pilgrim documents' })
  getMyDocuments(@Request() req: any) {
    return this.portalService.getMyDocuments(req.user.tenantId, req.user.pilgrimId);
  }

  @Get('me/notifications')
  @ApiOperation({ summary: 'Get pilgrim notifications' })
  getNotifications(@Request() req: any) {
    return this.portalService.getMyNotifications(req.user.tenantId, req.user.pilgrimId);
  }

  @Patch('me/notifications/:id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  markRead(@Request() req: any, @Param('id') id: string) {
    return this.portalService.markNotificationRead(req.user.tenantId, req.user.pilgrimId, id);
  }

  @Post('token/issue/:pilgrimId')
  @ApiOperation({ summary: 'Issue a portal access token for a pilgrim (operator action)' })
  issueToken(@Request() req: any, @Param('pilgrimId') pilgrimId: string) {
    return this.portalService.issuePilgrimToken(req.user.tenantId, pilgrimId);
  }
}
