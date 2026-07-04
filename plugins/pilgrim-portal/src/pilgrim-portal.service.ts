import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

export interface PilgrimPortalToken {
  pilgrimId: string;
  tenantId: string;
  accessToken: string;
  expiresAt: Date;
}

export interface PortalBookingSummary {
  bookingId: string;
  packageName: string;
  status: string;
  departureDate: Date;
  returnDate: Date;
  pilgrimCount: number;
  totalAmount: number;
  currency: string;
  paidAmount: number;
}

export interface PortalItineraryDay {
  day: number;
  date: Date;
  activity: string;
  location: string;
  startTime?: string;
  endTime?: string;
}

export interface PortalNotification {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'action_required' | 'alert';
  readAt?: Date;
  createdAt: Date;
}

@Injectable()
export class PilgrimPortalService {
  /**
   * Issue a short-lived portal access token for a pilgrim (via OTP or operator invitation link).
   */
  async issuePilgrimToken(tenantId: string, pilgrimId: string): Promise<PilgrimPortalToken> {
    // TODO: implement - verify pilgrim belongs to tenant, issue JWT with limited scope
    throw new Error('Not implemented');
  }

  /**
   * Get the pilgrim's own profile from the portal perspective.
   */
  async getMyProfile(tenantId: string, pilgrimId: string) {
    // TODO: implement - return public profile fields (no sensitive fields)
    throw new NotFoundException(`Pilgrim ${pilgrimId} not found`);
  }

  /**
   * Get the pilgrim's booking summary for their portal dashboard.
   */
  async getMyBooking(tenantId: string, pilgrimId: string): Promise<PortalBookingSummary | null> {
    // TODO: implement - find active booking for this pilgrim and project portal view
    return null;
  }

  /**
   * Get the trip itinerary visible to the pilgrim.
   */
  async getMyItinerary(tenantId: string, pilgrimId: string): Promise<PortalItineraryDay[]> {
    // TODO: implement - load group itinerary for the pilgrim's trip group
    return [];
  }

  /**
   * Get the pilgrim's uploaded documents (passport, visa, etc.).
   */
  async getMyDocuments(tenantId: string, pilgrimId: string) {
    // TODO: implement - proxy to CrmService.getDocuments, return safe public URLs
    return [];
  }

  /**
   * Get unread notifications for the pilgrim.
   */
  async getMyNotifications(tenantId: string, pilgrimId: string): Promise<PortalNotification[]> {
    // TODO: implement - query notification log for pilgrim
    return [];
  }

  /**
   * Mark a notification as read.
   */
  async markNotificationRead(tenantId: string, pilgrimId: string, notificationId: string): Promise<void> {
    // TODO: implement
  }

  /**
   * Allow pilgrim to update limited profile fields (phone, emergency contact).
   */
  async updateMyContact(
    tenantId: string,
    pilgrimId: string,
    dto: { phone?: string; emergencyContactName?: string; emergencyContactPhone?: string },
  ): Promise<void> {
    // TODO: implement - partial update of allowed fields only
  }

  /**
   * Validate a portal access token and return the pilgrim context.
   */
  async validatePortalToken(token: string): Promise<{ tenantId: string; pilgrimId: string }> {
    // TODO: implement - verify JWT, check expiry, return claims
    throw new UnauthorizedException('Invalid portal token');
  }
}
