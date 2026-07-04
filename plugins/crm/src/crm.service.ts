import { Injectable, NotFoundException } from '@nestjs/common';

export interface CreatePilgrimDto {
  tenantId: string;
  firstName: string;
  lastName: string;
  passportNumber: string;
  nationality: string;
  dateOfBirth: string;
  gender: 'male' | 'female';
  email?: string;
  phone?: string;
  familyGroupId?: string;
}

export interface UpdatePilgrimDto extends Partial<CreatePilgrimDto> {}

export interface Pilgrim extends CreatePilgrimDto {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFamilyGroupDto {
  tenantId: string;
  name: string;
  mahramId?: string;
}

export interface FamilyGroup extends CreateFamilyGroupDto {
  id: string;
  members: Pilgrim[];
  createdAt: Date;
}

export interface PilgrimDocument {
  id: string;
  pilgrimId: string;
  type: 'passport' | 'visa' | 'vaccination' | 'photo' | 'other';
  fileUrl: string;
  expiresAt?: Date;
  uploadedAt: Date;
}

@Injectable()
export class CrmService {
  // ── Pilgrims ──────────────────────────────────────────────────────────────

  async createPilgrim(dto: CreatePilgrimDto): Promise<Pilgrim> {
    // TODO: implement - persist pilgrim to plugin_crm.pilgrims
    throw new Error('Not implemented');
  }

  async getPilgrim(tenantId: string, pilgrimId: string): Promise<Pilgrim> {
    // TODO: implement - query by tenantId + pilgrimId
    throw new NotFoundException(`Pilgrim ${pilgrimId} not found`);
  }

  async listPilgrims(
    tenantId: string,
    options: { page?: number; limit?: number; search?: string } = {},
  ): Promise<{ data: Pilgrim[]; total: number }> {
    // TODO: implement - paginated query filtered by tenantId
    return { data: [], total: 0 };
  }

  async updatePilgrim(tenantId: string, pilgrimId: string, dto: UpdatePilgrimDto): Promise<Pilgrim> {
    // TODO: implement - patch pilgrim record
    throw new NotFoundException(`Pilgrim ${pilgrimId} not found`);
  }

  async deletePilgrim(tenantId: string, pilgrimId: string): Promise<void> {
    // TODO: implement - soft-delete pilgrim
  }

  // ── Family Groups ─────────────────────────────────────────────────────────

  async createFamilyGroup(dto: CreateFamilyGroupDto): Promise<FamilyGroup> {
    // TODO: implement - create family group record
    throw new Error('Not implemented');
  }

  async getFamilyGroup(tenantId: string, groupId: string): Promise<FamilyGroup> {
    // TODO: implement - load group with members
    throw new NotFoundException(`FamilyGroup ${groupId} not found`);
  }

  async listFamilyGroups(tenantId: string): Promise<FamilyGroup[]> {
    // TODO: implement - list groups for tenant
    return [];
  }

  async addPilgrimToGroup(tenantId: string, groupId: string, pilgrimId: string): Promise<void> {
    // TODO: implement - associate pilgrim with family group
  }

  // ── Documents ─────────────────────────────────────────────────────────────

  async uploadDocument(
    tenantId: string,
    pilgrimId: string,
    type: PilgrimDocument['type'],
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<PilgrimDocument> {
    // TODO: implement - store file in object storage, save record
    throw new Error('Not implemented');
  }

  async getDocuments(tenantId: string, pilgrimId: string): Promise<PilgrimDocument[]> {
    // TODO: implement - list documents for pilgrim
    return [];
  }

  async deleteDocument(tenantId: string, documentId: string): Promise<void> {
    // TODO: implement - remove document record and file
  }
}
