import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { TenantStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import type { Principal } from '../auth/principal';
import { DocumentAccessService } from '../storage/document-access.service';
import { StorageService } from '../storage/storage.service';

/** Organization states in which the organization may (re)submit its verification. */
const KYC_SUBMITTABLE: TenantStatus[] = [TenantStatus.PENDING_KYC, TenantStatus.KYC_REJECTED];

/**
 * Content types of stored KYC files, keyed by the extension StorageService
 * chose from the file's magic bytes. The type recorded with a submission is
 * derived from this rather than taken from the request, because it later
 * becomes the Content-Type of the reviewer's download.
 */
const KYC_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  tiff: 'image/tiff',
};

export interface KycDocumentInput {
  storageKey: string;
  driver?: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  checksum?: string;
  type?: string;
}

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
  ) {}

  async create(dto: CreateTenantDto, actor?: Principal) {
    const existing = await this.prisma.tenant.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Organization slug '${dto.slug}' is already taken`);
    if (dto.type === 'PLATFORM') throw new BadRequestException('The platform organization cannot be created here');
    if (dto.parentTenantId) {
      const parent = await this.prisma.tenant.findFirst({ where: { id: dto.parentTenantId, deletedAt: null } });
      if (!parent) throw new BadRequestException('Parent organization not found');
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        nameAr: dto.nameAr,
        type: dto.type,
        email: dto.email,
        phone: dto.phone,
        country: dto.country,
        licenseNumber: dto.licenseNumber,
        licenseCountry: dto.licenseCountry,
        licenseExpiry: dto.licenseExpiry ? new Date(dto.licenseExpiry) : undefined,
        regulatorySystem: dto.regulatorySystem,
        parentTenantId: dto.parentTenantId,
        settings: {},
      },
    });
    await this.audit.log({
      tenantId: tenant.id, actorId: actor?.sub, actorEmail: actor?.email ?? undefined, action: 'CREATE',
      namespace: 'core', resource: 'tenant', resourceId: tenant.id, metadata: { type: tenant.type },
    });
    this.logger.log(`Organization created: ${tenant.id} (${tenant.slug})`);
    return tenant;
  }

  async findById(id: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
      include: {
        subTenants: { where: { deletedAt: null }, select: { id: true, name: true, type: true, status: true } },
        pluginInstalls: { select: { pluginId: true, version: true, enabled: true, installedAt: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Organization not found');
    return tenant;
  }

  /**
   * An organization's view of itself. `metadata` holds platform-internal notes
   * (who suspended or archived it, and why) and stays on the platform side.
   */
  static ownView<T extends { metadata?: unknown }>(tenant: T): Omit<T, 'metadata'> {
    const { metadata: _internal, ...rest } = tenant;
    return rest;
  }

  async findActiveBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null, status: TenantStatus.ACTIVE, type: { not: 'PLATFORM' } },
    });
    if (!tenant) throw new NotFoundException('Organization not found');
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto) {
    await this.findById(id);
    return this.prisma.tenant.update({
      where: { id },
      data: { ...dto, licenseExpiry: dto.licenseExpiry ? new Date(dto.licenseExpiry) : undefined },
    });
  }

  /**
   * Submit (or, after a rejection, resubmit) the organization's verification.
   *
   * The organization moves to KYC_SUBMITTED and waits for a platform reviewer;
   * nothing here can make it ACTIVE. Only an approval in the admin KYC review
   * does that.
   */
  async submitKyc(
    actor: Principal,
    kyc: { registrySource: string; licenseNumber?: string; registryData?: any; documents?: KycDocumentInput[] },
  ) {
    const tenant = await this.findById(actor.tenantId);
    const documents = this.normalizeKycDocuments(tenant.id, kyc.documents);
    if (!KYC_SUBMITTABLE.includes(tenant.status)) {
      throw new BadRequestException(
        tenant.status === TenantStatus.KYC_SUBMITTED
          ? 'KYC is already under review'
          : 'This organization does not need KYC submission',
      );
    }
    const licenseNumber = kyc.licenseNumber?.trim();
    const record = await this.prisma.$transaction(async (tx) => {
      // The status precondition is re-checked by the write itself, so a double
      // click (or two administrators submitting at once) records one submission.
      const moved = await tx.tenant.updateMany({
        where: { id: tenant.id, status: { in: KYC_SUBMITTABLE } },
        data: { status: TenantStatus.KYC_SUBMITTED, ...(licenseNumber ? { licenseNumber } : {}) },
      });
      if (!moved.count) throw new BadRequestException('KYC is already under review');
      return tx.tenantKyc.create({
        data: {
          tenantId: tenant.id,
          registrySource: kyc.registrySource as any,
          registryData: kyc.registryData ?? undefined,
          documents: documents as any,
        },
      });
    });
    await this.audit.log({
      tenantId: tenant.id, actorId: actor.sub, actorEmail: actor.email ?? undefined, action: 'TENANT_CONFIG_CHANGE',
      namespace: 'core', resource: 'tenant_kyc', resourceId: record.id,
      beforeState: { status: tenant.status }, afterState: { status: TenantStatus.KYC_SUBMITTED },
      metadata: { submitted: true, resubmission: tenant.status === TenantStatus.KYC_REJECTED, documents: documents.length },
    });
    return record;
  }

  /**
   * Rebuilds each document reference from what the server knows. Only files
   * this organization uploaded through POST /documents/kyc are accepted (the
   * storage key carries the organization id), a file cannot be attached twice,
   * and the content type comes from the stored file rather than the request.
   */
  private normalizeKycDocuments(tenantId: string, documents: KycDocumentInput[] = []) {
    DocumentAccessService.assertKycDocuments(tenantId, documents);
    if (!documents.length) throw new BadRequestException('Upload at least one verification document');
    const seen = new Set<string>();
    return documents.map((doc) => {
      if (!doc?.storageKey) throw new BadRequestException('Every document must reference an uploaded file');
      if (seen.has(doc.storageKey)) throw new BadRequestException('The same document is attached more than once');
      seen.add(doc.storageKey);
      const extension = doc.storageKey.split('.').pop()?.toLowerCase() ?? '';
      const mimeType = KYC_MIME_BY_EXTENSION[extension];
      if (!mimeType) throw new BadRequestException('This document type is not accepted for verification');
      return {
        storageKey: doc.storageKey,
        driver: this.storage.driver,
        name: (doc.name?.trim() || 'Verification document').slice(0, 200),
        mimeType,
        ...(typeof doc.sizeBytes === 'number' && doc.sizeBytes >= 0 ? { sizeBytes: Math.floor(doc.sizeBytes) } : {}),
        ...(doc.checksum ? { checksum: doc.checksum } : {}),
        ...(doc.type ? { type: doc.type } : {}),
      };
    });
  }

  /**
   * The organization's own submissions, newest first. `updatedAt` is when a
   * reviewer last decided the record, so the organization can see when it was
   * approved or sent back.
   */
  kycHistory(tenantId: string) {
    return this.prisma.tenantKyc.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, registrySource: true, verifiedAt: true, rejectionReason: true,
        createdAt: true, updatedAt: true, documents: true,
      },
    });
  }

  getSubAgents(tenantId: string) {
    return this.prisma.tenant.findMany({
      where: { parentTenantId: tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, slug: true, type: true, status: true, country: true, createdAt: true },
    });
  }

  getInstalledPlugins(tenantId: string) {
    return this.prisma.tenantPlugin.findMany({
      where: { tenantId },
      orderBy: { installedAt: 'desc' },
    });
  }
}
