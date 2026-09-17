import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { TenantStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import type { Principal } from '../auth/principal';
import { DocumentAccessService } from '../storage/document-access.service';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
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

  async submitKyc(actor: Principal, kyc: { registrySource: string; licenseNumber?: string; registryData?: any; documents?: any[] }) {
    const tenant = await this.findById(actor.tenantId);
    DocumentAccessService.assertKycDocuments(tenant.id, kyc.documents);
    const submittable: TenantStatus[] = [TenantStatus.PENDING_KYC, TenantStatus.KYC_REJECTED];
    if (!submittable.includes(tenant.status)) {
      throw new BadRequestException(
        tenant.status === TenantStatus.KYC_SUBMITTED
          ? 'KYC is already under review'
          : 'This organization does not need KYC submission',
      );
    }
    const record = await this.prisma.$transaction(async (tx) => {
      const row = await tx.tenantKyc.create({
        data: {
          tenantId: tenant.id,
          registrySource: kyc.registrySource as any,
          registryData: kyc.registryData ?? undefined,
          documents: kyc.documents ?? [],
        },
      });
      await tx.tenant.update({
        where: { id: tenant.id },
        data: { status: TenantStatus.KYC_SUBMITTED, ...(kyc.licenseNumber ? { licenseNumber: kyc.licenseNumber } : {}) },
      });
      return row;
    });
    await this.audit.log({
      tenantId: tenant.id, actorId: actor.sub, actorEmail: actor.email ?? undefined, action: 'TENANT_CONFIG_CHANGE',
      namespace: 'core', resource: 'tenant_kyc', resourceId: record.id, metadata: { submitted: true },
    });
    return record;
  }

  kycHistory(tenantId: string) {
    return this.prisma.tenantKyc.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, registrySource: true, verifiedAt: true, rejectionReason: true, createdAt: true, documents: true },
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
