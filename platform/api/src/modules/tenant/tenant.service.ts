import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantStatus } from '@prisma/client';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTenantDto) {
    const existing = await this.prisma.tenant.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException(`Tenant slug '${dto.slug}' is already taken`);
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
        licenseExpiry: dto.licenseExpiry,
        regulatorySystem: dto.regulatorySystem,
        parentTenantId: dto.parentTenantId,
        settings: {},
      },
    });

    this.logger.log(`Tenant created: ${tenant.id} (${tenant.slug})`);
    return tenant;
  }

  async findById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id, deletedAt: null },
      include: {
        subTenants: { where: { deletedAt: null }, select: { id: true, name: true, type: true, status: true } },
        pluginInstalls: true,
      },
    });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return tenant;
  }

  async findBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug, deletedAt: null },
    });
    if (!tenant) throw new NotFoundException(`Tenant '${slug}' not found`);
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto) {
    await this.findById(id);
    return this.prisma.tenant.update({ where: { id }, data: dto });
  }

  async submitKyc(tenantId: string, kycData: any) {
    const tenant = await this.findById(tenantId);

    if (tenant.status === TenantStatus.ACTIVE) {
      throw new BadRequestException('Tenant is already verified');
    }

    const kyc = await this.prisma.tenantKyc.create({
      data: {
        tenantId,
        registrySource: kycData.registrySource,
        registryData: kycData.registryData,
        documents: kycData.documents ?? [],
      },
    });

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: TenantStatus.KYC_SUBMITTED, licenseNumber: kycData.licenseNumber },
    });

    return kyc;
  }

  async approveKyc(tenantId: string, reviewerId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.tenantKyc.updateMany({
        where: { tenantId },
        data: { verifiedAt: new Date(), verifiedBy: reviewerId },
      });
      await tx.tenant.update({
        where: { id: tenantId },
        data: { status: TenantStatus.ACTIVE },
      });
    });

    this.logger.log(`Tenant KYC approved: ${tenantId} by ${reviewerId}`);
  }

  async rejectKyc(tenantId: string, reviewerId: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.tenantKyc.updateMany({
        where: { tenantId },
        data: { rejectionReason: reason },
      });
      await tx.tenant.update({
        where: { id: tenantId },
        data: { status: TenantStatus.KYC_REJECTED },
      });
    });
  }

  async getSubAgents(tenantId: string) {
    return this.prisma.tenant.findMany({
      where: { parentTenantId: tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getInstalledPlugins(tenantId: string) {
    return this.prisma.tenantPlugin.findMany({
      where: { tenantId },
      orderBy: { installedAt: 'desc' },
    });
  }
}
