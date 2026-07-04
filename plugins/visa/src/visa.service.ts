import { Injectable, NotFoundException } from '@nestjs/common';

export type VisaSystem = 'nusuk' | 'siskopatuh' | 'manual';
export type VisaStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'expired';

export interface CreateVisaApplicationDto {
  pilgrimId: string;
  bookingId: string;
  visaType: 'umrah' | 'hajj';
  passportNumber: string;
  passportExpiry: Date;
  nationality: string;
  system: VisaSystem;
}

export interface VisaApplication extends CreateVisaApplicationDto {
  id: string;
  tenantId: string;
  status: VisaStatus;
  externalRef?: string;
  submittedAt?: Date;
  approvedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegulatorySubmission {
  id: string;
  tenantId: string;
  system: VisaSystem;
  batchRef: string;
  pilgrimIds: string[];
  submittedAt: Date;
  status: 'pending' | 'accepted' | 'rejected';
  responsePayload?: Record<string, unknown>;
}

@Injectable()
export class VisaService {
  /**
   * Create a new visa application for a pilgrim on a specific booking.
   * The `system` field determines which regulatory body the application targets.
   */
  async createApplication(
    tenantId: string,
    pilgrimId: string,
    bookingId: string,
    system: VisaSystem,
  ): Promise<VisaApplication> {
    // TODO: implement - fetch pilgrim passport data from CRM, build application record
    // TODO: validate pilgrim passport expiry >= trip end date + 6 months
    throw new Error('Not implemented');
  }

  /**
   * Submit a visa application to the Nusuk Masar API (Saudi Arabia).
   * Calls the nusuk integration connector's submitVisaApplication method.
   */
  async submitToNusuk(applicationId: string): Promise<VisaApplication> {
    // TODO: implement - load application, call NusukService.submitVisaApplication()
    // TODO: update status to 'submitted', store externalRef from Nusuk response
    throw new NotFoundException(`Application ${applicationId} not found`);
  }

  /**
   * Submit a batch of pilgrims to the Indonesian SISKOPATUH system.
   * Pilgrim IDs are grouped into a batch submission for the operator's NPU.
   */
  async submitToSiskopatuh(tenantId: string, pilgrimIds: string[]): Promise<RegulatorySubmission> {
    // TODO: implement - call SiskopatuhService.submitBatch() with pilgrim data
    // TODO: create RegulatorySubmission record, store batchRef from SISKOPATUH response
    throw new Error('Not implemented');
  }

  /**
   * Update the status and optional external reference of a visa application.
   * Called by webhooks or polling jobs.
   */
  async updateStatus(
    applicationId: string,
    status: VisaStatus,
    externalRef?: string,
  ): Promise<VisaApplication> {
    // TODO: implement - find application, apply status transition, emit domain event
    throw new NotFoundException(`Application ${applicationId} not found`);
  }

  /**
   * Retrieve all visa applications associated with a specific booking.
   */
  async getApplicationsByBooking(
    tenantId: string,
    bookingId: string,
  ): Promise<VisaApplication[]> {
    // TODO: implement - query plugin_visa.applications filtered by tenantId + bookingId
    return [];
  }

  // ── Additional helpers ────────────────────────────────────────────────────

  async getApplication(tenantId: string, applicationId: string): Promise<VisaApplication> {
    // TODO: implement - load single application scoped to tenant
    throw new NotFoundException(`Application ${applicationId} not found`);
  }

  async listApplications(
    tenantId: string,
    filters: { status?: VisaStatus; system?: VisaSystem; page?: number; limit?: number } = {},
  ): Promise<{ data: VisaApplication[]; total: number }> {
    // TODO: implement - paginated listing with filters
    return { data: [], total: 0 };
  }

  async listRegulatorySubmissions(
    tenantId: string,
    system?: VisaSystem,
  ): Promise<RegulatorySubmission[]> {
    // TODO: implement - list all regulatory submissions for tenant
    return [];
  }

  async pollNusukStatus(applicationId: string): Promise<VisaApplication> {
    // TODO: implement - call NusukService.getVisaStatus(), update local record
    throw new NotFoundException(`Application ${applicationId} not found`);
  }
}
