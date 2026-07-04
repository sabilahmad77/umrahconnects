import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // ── Platform-wide overview stats ─────────────────────────────────────
  async getStats() {
    const [
      totalTenants, totalUsers, totalPilgrims, totalHotels, totalVehicles, totalBookings,
      tenantByType, paidInvoices, outstandingInvoices, pendingKyc, activeListings, openInquiries,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.pilgrim.count({ where: { deletedAt: null } }),
      this.prisma.hotel.count(),
      this.prisma.vehicle.count(),
      this.prisma.booking.count(),
      this.prisma.tenant.groupBy({ by: ['type'], _count: true }),
      this.prisma.invoice.aggregate({ where: { status: 'PAID' as any }, _sum: { paidCents: true } }),
      this.prisma.invoice.aggregate({ where: { status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] as any } }, _sum: { totalCents: true } }),
      this.prisma.tenantKyc.count({ where: { verifiedAt: null, rejectionReason: null } }),
      this.prisma.listing.count({ where: { isActive: true } }),
      this.prisma.listingInquiry.count({ where: { status: 'NEW' } }),
    ]);

    const byType: Record<string, number> = {};
    for (const t of tenantByType) byType[t.type as string] = (t._count as any) ?? 0;

    const recentActivity = await this.prisma.auditLog.findMany({
      orderBy: { occurredAt: 'desc' }, take: 8,
      select: { id: true, action: true, resource: true, resourceId: true, actorEmail: true, occurredAt: true, tenantId: true },
    });

    return {
      tenants: { total: totalTenants, byType },
      users: totalUsers,
      pilgrims: totalPilgrims,
      hotels: totalHotels,
      vehicles: totalVehicles,
      bookings: totalBookings,
      revenue: {
        collectedCents: Number(paidInvoices._sum.paidCents ?? 0),
        outstandingCents: Number(outstandingInvoices._sum.totalCents ?? 0),
        currency: 'SAR',
      },
      kyc: { pending: pendingKyc },
      marketplace: { activeListings, openInquiries },
      recentActivity,
    };
  }

  // ── Tenants ──────────────────────────────────────────────────────────
  async listTenants(query: any = {}) {
    const { status, type, search, page = 1, limit = 50 } = query;
    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (search) where.name = { contains: search, mode: 'insensitive' };
    const skip = (+page - 1) * +limit;
    const [items, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where, skip, take: +limit, orderBy: { createdAt: 'desc' },
        include: { _count: { select: { users: true } } },
      }),
      this.prisma.tenant.count({ where }),
    ]);
    return { items, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async findTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, email: true, firstName: true, lastName: true, status: true } },
        kycRecords: true,
        _count: { select: { users: true, roles: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async updateTenantStatus(id: string, status: string) {
    await this.findTenant(id);
    return this.prisma.tenant.update({ where: { id }, data: { status: status as any } });
  }

  async archiveTenant(id: string) {
    await this.findTenant(id);
    return this.prisma.tenant.update({ where: { id }, data: { status: 'INACTIVE' as any, deletedAt: new Date() } });
  }

  // ── Users ────────────────────────────────────────────────────────────
  async listUsers(query: any = {}) {
    const { status, tenantId, search, page = 1, limit = 50 } = query;
    const where: any = {};
    if (status) where.status = status;
    if (tenantId) where.tenantId = tenantId;
    if (search) where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
    ];
    const skip = (+page - 1) * +limit;
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where, skip, take: +limit, orderBy: { createdAt: 'desc' },
        include: {
          tenant: { select: { id: true, name: true, type: true } },
          userRoles: { include: { role: { select: { id: true, name: true } } } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: items.map((u: any) => ({
        ...u,
        roles: u.userRoles?.map((ur: any) => ({ id: ur.role.id, name: ur.role.name })) ?? [],
      })),
      total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit),
    };
  }

  async setUserStatus(id: string, status: string) {
    return this.prisma.user.update({ where: { id }, data: { status: status as any } });
  }

  async forceLogoutUser(id: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId: id }, data: { revokedAt: new Date() } });
    return { success: true };
  }

  async assignUserRole(userId: string, roleId: string) {
    const existing = await this.prisma.userRole.findUnique({ where: { userId_roleId: { userId, roleId } } }).catch(() => null);
    if (existing) return existing;
    return this.prisma.userRole.create({ data: { userId, roleId } });
  }

  async removeUserRole(userId: string, roleId: string) {
    await this.prisma.userRole.delete({ where: { userId_roleId: { userId, roleId } } }).catch(() => undefined);
    return { success: true };
  }

  // ── KYC verification ────────────────────────────────────────────────
  async listKyc(query: any = {}) {
    const { status } = query;
    const where: any = {};
    if (status === 'PENDING') {
      where.verifiedAt = null;
      where.rejectionReason = null;
    } else if (status === 'APPROVED') {
      where.verifiedAt = { not: null };
    } else if (status === 'REJECTED') {
      where.rejectionReason = { not: null };
    }
    return this.prisma.tenantKyc.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { tenant: { select: { id: true, name: true, type: true, email: true, country: true } } },
    });
  }

  async findKyc(id: string) {
    const kyc = await this.prisma.tenantKyc.findUnique({
      where: { id },
      include: { tenant: true },
    });
    if (!kyc) throw new NotFoundException('KYC record not found');
    return kyc;
  }

  async approveKyc(id: string, actorId?: string, notes?: string) {
    const kyc = await this.findKyc(id);
    const updated = await this.prisma.tenantKyc.update({
      where: { id },
      data: { verifiedAt: new Date(), verifiedBy: actorId, rejectionReason: null },
    });
    // Bump tenant status to ACTIVE on approve
    await this.prisma.tenant.update({ where: { id: kyc.tenantId }, data: { status: 'ACTIVE' as any } });
    return updated;
  }

  async rejectKyc(id: string, reason: string) {
    const kyc = await this.findKyc(id);
    return this.prisma.tenantKyc.update({
      where: { id },
      data: { rejectionReason: reason, verifiedAt: null, verifiedBy: null },
    });
  }

  async createKyc(tenantId: string, dto: any) {
    if (!tenantId) throw new BadRequestException('tenantId is required to submit KYC');
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new BadRequestException(`Tenant ${tenantId} not found`);

    const VALID = ['NUSUK_MASAR', 'SISKOPATUH', 'NAHCON', 'DIYANET', 'TABUNG_HAJI', 'MOTAC', 'IBA_DGRP', 'MANUAL'];
    const raw = String(dto.registrySource ?? 'MANUAL').toUpperCase().replace(/[\s-]+/g, '_');
    if (!VALID.includes(raw)) {
      throw new BadRequestException(`Invalid registrySource "${dto.registrySource}". Allowed: ${VALID.join(', ')}`);
    }
    return this.prisma.tenantKyc.create({
      data: {
        tenantId,
        registrySource: raw as any,
        documents: Array.isArray(dto.documents) ? dto.documents : [],
        registryData: dto.registryData ?? undefined,
      },
    });
  }

  // ── Roles & permissions ─────────────────────────────────────────────
  async listRoles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { permissions: true, userRoles: true } },
        tenant: { select: { id: true, name: true } },
      },
    });
  }

  async findRole(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } },
        userRoles: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } },
      },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ namespace: 'asc' }, { resource: 'asc' }, { action: 'asc' }] });
  }

  // ── Marketplace control ─────────────────────────────────────────────
  async listAllListings(query: any = {}) {
    const { status, type, search, page = 1, limit = 50 } = query;
    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (search) where.name = { contains: search, mode: 'insensitive' };
    const skip = (+page - 1) * +limit;
    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where, skip, take: +limit, orderBy: { createdAt: 'desc' },
        include: { vendor: { select: { id: true, name: true, status: true, tenantId: true } } },
      }),
      this.prisma.listing.count({ where }),
    ]);
    return {
      items: items.map((l: any) => ({ ...l, priceCents: Number(l.priceCents) })),
      total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit),
    };
  }

  async approveListing(id: string) {
    return this.prisma.listing.update({ where: { id }, data: { status: 'PUBLISHED', isActive: true } });
  }

  async removeListing(id: string) {
    return this.prisma.listing.update({ where: { id }, data: { status: 'ARCHIVED', isActive: false } });
  }

  // ── Cross-tenant bookings ───────────────────────────────────────────
  async listAllBookings(query: any = {}) {
    const { status, tenantId, page = 1, limit = 50 } = query;
    const where: any = {};
    if (status) where.status = status;
    if (tenantId) where.tenantId = tenantId;
    const skip = (+page - 1) * +limit;
    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({
        where, skip, take: +limit, orderBy: { createdAt: 'desc' },
        include: { package: { select: { name: true, tripType: true } } },
      }),
      this.prisma.booking.count({ where }),
    ]);
    return {
      items: items.map((b: any) => ({
        ...b,
        totalAmountCents: Number(b.totalAmountCents),
        paidAmountCents: Number(b.paidAmountCents),
      })),
      total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit),
    };
  }

  // ── Finance summary cross-tenant ────────────────────────────────────
  async getFinanceSummary() {
    const [paidAgg, outstandingAgg, paymentsAgg, refundsAgg] = await Promise.all([
      this.prisma.invoice.aggregate({ where: { status: 'PAID' as any }, _sum: { paidCents: true } }),
      this.prisma.invoice.aggregate({ where: { status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] as any } }, _sum: { totalCents: true } }),
      this.prisma.payment.aggregate({ where: { status: 'COMPLETED' as any }, _sum: { amountCents: true } }),
      this.prisma.payment.aggregate({ where: { status: 'REFUNDED' as any }, _sum: { refundedCents: true } }),
    ]);
    return {
      revenueCollectedCents: Number(paidAgg._sum.paidCents ?? 0),
      outstandingCents: Number(outstandingAgg._sum.totalCents ?? 0),
      paymentsCents: Number(paymentsAgg._sum.amountCents ?? 0),
      refundsCents: Number(refundsAgg._sum.refundedCents ?? 0),
      currency: 'SAR',
    };
  }

  // ── Audit logs ──────────────────────────────────────────────────────
  async listAuditLogs(query: any = {}) {
    const { action, resource, tenantId, actorId, page = 1, limit = 100 } = query;
    const where: any = {};
    if (action) where.action = action;
    if (resource) where.resource = resource;
    if (tenantId) where.tenantId = tenantId;
    if (actorId) where.actorId = actorId;
    const skip = (+page - 1) * +limit;
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, skip, take: +limit, orderBy: { occurredAt: 'desc' } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  // ── Platform settings (in-memory feature flags + categories) ────────
  async getSettings() {
    // Aggregate the existing data into a settings overview
    const [marketplaceCategories, regulatorySystems] = await Promise.all([
      this.prisma.listing.groupBy({ by: ['type'], _count: true }),
      this.prisma.visaApplication.groupBy({ by: ['regulatorySystem'], _count: true }),
    ]);
    return {
      featureFlags: {
        marketplace: true,
        socialHub: true,
        groups: true,
        marketplaceRequests: true,
        budgetPlans: true,
        kyc: true,
      },
      marketplaceCategories: marketplaceCategories.map((c) => ({ category: c.type, count: (c._count as any) })),
      regulatorySystems: regulatorySystems.map((c) => ({ system: c.regulatorySystem, count: (c._count as any) })),
      policies: {
        cancellationDefaultHours: 48,
        kycRequiredFor: ['OPERATOR', 'VENDOR_HOTEL', 'VENDOR_TRANSPORT', 'VENDOR_VISA'],
      },
    };
  }
}
