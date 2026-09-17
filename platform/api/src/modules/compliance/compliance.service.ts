import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertAllOwned, assertOwnedIfPresent, requireId } from '../../common/tenant-scope';
import { VISA_DECISION_STATUSES } from './dto/compliance.dto';

const OPERATOR_TENANT_TYPES = ['OPERATOR', 'MU_ASSASA', 'SUB_AGENT'];

@Injectable()
export class ComplianceService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private serialize(v: any) {
    if (!v) return v;
    return { ...v, priceCents: v.priceCents != null ? Number(v.priceCents) : 0 };
  }

  async findVisas(tenantId: string, query: any) {
    const { status, system, pilgrimId, bookingId, search, page = 1, limit = 20 } = query;
    const skip = (+page - 1) * +limit;
    const where: any = { tenantId };
    if (status) where.status = status;
    if (system) where.regulatorySystem = system;
    if (pilgrimId) where.pilgrimId = pilgrimId;
    if (bookingId) where.bookingId = bookingId;
    if (search) where.OR = [
      { applicantName: { contains: search, mode: 'insensitive' } },
      { applicantPassport: { contains: search, mode: 'insensitive' } },
      { applicationNumber: { contains: search, mode: 'insensitive' } },
    ];
    const [items, total] = await Promise.all([
      this.prisma.visaApplication.findMany({ where, skip, take: +limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.visaApplication.count({ where }),
    ]);
    return { items: items.map((v) => this.serialize(v)), total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async findVisaById(tenantId: string, id: string) {
    const visa = await this.prisma.visaApplication.findFirst({ where: { id, tenantId } });
    if (!visa) throw new NotFoundException('Visa application not found');
    // Hydrate the linked pilgrim (if any) for display
    let pilgrim: any = null;
    if (visa.pilgrimId) {
      // Tenant-scoped: a stale/foreign pilgrimId must never expose another tenant's passport data.
      pilgrim = await this.prisma.pilgrim.findFirst({
        where: { id: visa.pilgrimId, tenantId },
        select: { id: true, firstNameEn: true, lastNameEn: true, firstNameAr: true, passportNumber: true, nationality: true, email: true, phone: true },
      });
    }
    return { ...this.serialize(visa), pilgrim };
  }

  /** Pilgrim/booking links must resolve inside the caller's tenant. */
  private async assertVisaLinks(tenantId: string, dto: { pilgrimId?: unknown; bookingId?: unknown }) {
    await assertOwnedIfPresent(this.prisma.pilgrim, dto.pilgrimId, tenantId, 'Pilgrim', { deletedAt: null });
    await assertOwnedIfPresent(this.prisma.booking, dto.bookingId, tenantId, 'Booking');
  }

  /** operatorId: the caller's own organization, or an ACTIVE operator organization (read-only link). */
  private async resolveOperatorId(tenantId: string, operatorId: unknown): Promise<string | null> {
    if (operatorId === undefined || operatorId === null || operatorId === '') return null;
    const id = requireId(operatorId, 'Operator');
    if (id === tenantId) return id;
    const op = await this.prisma.tenant.findFirst({
      where: { id, status: 'ACTIVE' as any, type: { in: OPERATOR_TENANT_TYPES as any } },
      select: { id: true },
    });
    if (!op) throw new NotFoundException('Operator not found');
    return op.id;
  }

  async createVisa(tenantId: string, dto: any, createdBy?: string) {
    await this.assertVisaLinks(tenantId, dto);
    const operatorId = await this.resolveOperatorId(tenantId, dto.operatorId);
    const status = dto.status ?? 'NOT_STARTED';
    if (!['NOT_STARTED', 'DOCUMENTS_COLLECTING'].includes(status)) {
      throw new BadRequestException('A new visa application must start as NOT_STARTED or DOCUMENTS_COLLECTING');
    }
    const appNo = dto.applicationNumber ?? `VISA-${new Date().getFullYear()}-${Math.random().toString().slice(2, 7)}`;
    const visa = await this.prisma.visaApplication.create({
      data: {
        tenantId,
        pilgrimId: dto.pilgrimId || null,
        bookingId: dto.bookingId || null,
        operatorId,
        regulatorySystem: (dto.regulatorySystem ?? dto.system ?? 'NUSUK_MASAR') as any,
        status: status as any,
        applicantName: dto.applicantName,
        applicantPassport: dto.applicantPassport ?? dto.passportNumber,
        applicantNationality: dto.applicantNationality ?? dto.nationality,
        visaType: dto.visaType ?? dto.type,
        destinationCountry: dto.destinationCountry,
        serviceCountry: dto.serviceCountry,
        applicationNumber: appNo,
        requiredDocuments: dto.requiredDocuments ?? [],
        assignedOfficer: dto.assignedOfficer,
        expectedCompletionAt: dto.expectedCompletionAt ? new Date(dto.expectedCompletionAt) : undefined,
        priceCents: dto.priceCents != null ? BigInt(Math.round(Number(dto.priceCents))) : dto.price != null ? BigInt(Math.round(Number(dto.price) * 100)) : BigInt(0),
        currency: dto.currency ?? 'SAR',
        paymentStatus: String(dto.paymentStatus ?? 'UNPAID').toUpperCase(),
        notes: dto.notes,
        documents: dto.documents ?? [],
        timeline: [{ at: new Date().toISOString(), event: 'CREATED', by: createdBy ?? 'system' }],
        createdBy: createdBy && createdBy.length === 36 ? createdBy : null,
      },
    });
    return this.serialize(visa);
  }

  async updateVisa(
    tenantId: string, id: string, dto: any,
    opts: { canDecide?: boolean; actorId?: string } = {},
  ) {
    const current = await this.findVisaById(tenantId, id);
    await this.assertVisaLinks(tenantId, dto);
    const data: any = {};
    if (dto.pilgrimId !== undefined) data.pilgrimId = dto.pilgrimId || null;
    if (dto.bookingId !== undefined) data.bookingId = dto.bookingId || null;
    for (const k of ['applicantName', 'applicantPassport', 'applicantNationality', 'visaType', 'destinationCountry', 'serviceCountry', 'applicationNumber', 'requiredDocuments', 'assignedOfficer', 'notes', 'externalRef', 'rejectionReason']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.type !== undefined) data.visaType = dto.type;
    if (dto.regulatorySystem !== undefined) data.regulatorySystem = dto.regulatorySystem;
    if (dto.paymentStatus !== undefined) data.paymentStatus = String(dto.paymentStatus).toUpperCase();
    if (dto.priceCents !== undefined) data.priceCents = BigInt(Math.round(Number(dto.priceCents)));
    if (dto.price !== undefined) data.priceCents = BigInt(Math.round(Number(dto.price) * 100));
    if (data.priceCents !== undefined && data.priceCents < BigInt(0)) {
      throw new BadRequestException('Price must not be negative');
    }
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.expectedCompletionAt !== undefined) data.expectedCompletionAt = dto.expectedCompletionAt ? new Date(dto.expectedCompletionAt) : null;
    if (dto.expiresAt !== undefined) data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.submittedAt !== undefined) data.submittedAt = dto.submittedAt ? new Date(dto.submittedAt) : null;
    if (dto.status && dto.status !== current.status) {
      if (VISA_DECISION_STATUSES.includes(dto.status) && !opts.canDecide) {
        throw new ForbiddenException('Approving or rejecting a visa application requires visa:application:manage');
      }
      data.status = dto.status;
      // Decision / submission timestamps are server-stamped.
      if (dto.status === 'APPROVED') data.approvedAt = new Date();
      if (dto.status === 'REJECTED') data.rejectedAt = new Date();
      if (dto.status === 'SUBMITTED' && data.submittedAt === undefined && !current.submittedAt) data.submittedAt = new Date();
      // The timeline is an append-only server log; clients cannot write it.
      const tl = Array.isArray((current as any).timeline) ? (current as any).timeline : [];
      data.timeline = [...tl, { at: new Date().toISOString(), event: `STATUS_${dto.status}`, by: opts.actorId ?? 'system' }];
    }
    const visa = await this.prisma.visaApplication.update({ where: { id }, data });
    return this.serialize(visa);
  }

  async deleteVisa(tenantId: string, id: string) {
    await this.findVisaById(tenantId, id);
    return this.serialize(await this.prisma.visaApplication.update({ where: { id }, data: { status: 'CANCELLED' as any } }));
  }

  async submitVisa(tenantId: string, id: string) {
    await this.findVisaById(tenantId, id);
    return this.serialize(await this.prisma.visaApplication.update({
      where: { id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    }));
  }

  async approveVisa(tenantId: string, id: string, externalRef?: string) {
    await this.findVisaById(tenantId, id);
    const visa = await this.prisma.visaApplication.update({
      where: { id },
      data: { status: 'APPROVED', approvedAt: new Date(), externalRef },
    });
    if (visa.createdBy) {
      this.notifications.fire({
        tenantId,
        recipientUserId: visa.createdBy,
        type: 'VISA_STATUS',
        title: 'Visa approved',
        body: `Visa application ${visa.id.slice(0, 8)}… has been APPROVED.`,
        link: '/compliance',
      }).catch(() => undefined);
    }
    return this.serialize(visa);
  }

  async rejectVisa(tenantId: string, id: string, reason: string) {
    await this.findVisaById(tenantId, id);
    const visa = await this.prisma.visaApplication.update({
      where: { id },
      data: { status: 'REJECTED', rejectedAt: new Date(), rejectionReason: reason },
    });
    if (visa.createdBy) {
      this.notifications.fire({
        tenantId,
        recipientUserId: visa.createdBy,
        type: 'VISA_STATUS',
        title: 'Visa rejected',
        body: `Visa application ${visa.id.slice(0, 8)}… was rejected: ${reason}`,
        link: '/compliance',
      }).catch(() => undefined);
    }
    return this.serialize(visa);
  }

  // ── Document management ────────────────────────────────────────────────
  async listDocuments(tenantId: string, id: string) {
    const visa = await this.findVisaById(tenantId, id);
    return Array.isArray((visa as any).documents) ? (visa as any).documents : [];
  }

  async addDocument(tenantId: string, id: string, dto: { name: string; type?: string; url?: string; status?: string }) {
    const visa = await this.findVisaById(tenantId, id);
    const docs = Array.isArray((visa as any).documents) ? [...(visa as any).documents] : [];
    docs.push({
      id: `doc_${Date.now().toString(36)}`,
      name: dto.name,
      type: dto.type ?? 'OTHER',
      url: dto.url ?? null,
      status: (dto.status ?? (dto.url ? 'RECEIVED' : 'MISSING')).toUpperCase(),
      addedAt: new Date().toISOString(),
    });
    return this.serialize(await this.prisma.visaApplication.update({ where: { id }, data: { documents: docs } }));
  }

  async updateDocumentStatus(tenantId: string, id: string, docId: string, status: string, url?: string) {
    const visa = await this.findVisaById(tenantId, id);
    const docs = (Array.isArray((visa as any).documents) ? (visa as any).documents : []).map((d: any) =>
      d.id === docId ? { ...d, status: status.toUpperCase(), url: url ?? d.url, updatedAt: new Date().toISOString() } : d,
    );
    return this.serialize(await this.prisma.visaApplication.update({ where: { id }, data: { documents: docs } }));
  }

  async removeDocument(tenantId: string, id: string, docId: string) {
    const visa = await this.findVisaById(tenantId, id);
    const docs = (Array.isArray((visa as any).documents) ? (visa as any).documents : []).filter((d: any) => d.id !== docId);
    return this.serialize(await this.prisma.visaApplication.update({ where: { id }, data: { documents: docs } }));
  }

  /** Aggregate of all documents across this tenant's visa applications. */
  async allDocuments(tenantId: string, statusFilter?: string) {
    const visas = await this.prisma.visaApplication.findMany({
      where: { tenantId },
      select: { id: true, applicationNumber: true, applicantName: true, documents: true, status: true },
      orderBy: { createdAt: 'desc' },
    });
    const rows: any[] = [];
    for (const v of visas) {
      const docs = Array.isArray(v.documents) ? v.documents : [];
      for (const d of docs as any[]) {
        if (!statusFilter || d.status === statusFilter) {
          rows.push({
            ...d,
            visaId: v.id,
            applicationNumber: v.applicationNumber,
            applicantName: v.applicantName,
            visaStatus: v.status,
          });
        }
      }
    }
    return rows;
  }

  async findSubmissions(tenantId: string) {
    return this.prisma.regulatorySubmission.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  async createSubmission(tenantId: string, dto: any) {
    // Every pilgrim in a regulator batch must be a live pilgrim of this tenant.
    const pilgrimIds: string[] = Array.isArray(dto.pilgrimIds) ? [...new Set<string>(dto.pilgrimIds)] : [];
    await assertAllOwned(this.prisma.pilgrim, pilgrimIds, tenantId, 'Pilgrim', { deletedAt: null });
    return this.prisma.regulatorySubmission.create({
      data: {
        tenantId,
        regulatorySystem: dto.regulatorySystem as any,
        batchRef: dto.batchRef ?? `BATCH-${Date.now().toString(36).toUpperCase()}`,
        pilgrimIds,
        submittedAt: new Date(),
        requestPayload: dto.payload ?? {},
      },
    });
  }

  // ── Stats ──────────────────────────────────────────────────────────────
  async getStats(tenantId: string) {
    const statuses = ['NOT_STARTED', 'DOCUMENTS_COLLECTING', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'];
    const counts = await Promise.all(statuses.map((s) => this.prisma.visaApplication.count({ where: { tenantId, status: s as any } })));
    const byStatus: Record<string, number> = {};
    statuses.forEach((s, i) => { byStatus[s] = counts[i]; });
    const total = counts.reduce((a, b) => a + b, 0);
    const decided = byStatus.APPROVED + byStatus.REJECTED;
    return {
      total,
      byStatus,
      successRate: decided > 0 ? byStatus.APPROVED / decided : 0,
    };
  }

  /** Rich dashboard stats for the Visa Agency role. */
  async getDashboardStats(tenantId: string) {
    const base = await this.getStats(tenantId);
    const visas = await this.prisma.visaApplication.findMany({
      where: { tenantId },
      select: { priceCents: true, paymentStatus: true, status: true, applicantName: true, applicationNumber: true, createdAt: true, id: true },
      orderBy: { createdAt: 'desc' },
    });
    const revenueCollected = visas
      .filter((v) => v.paymentStatus === 'PAID')
      .reduce((s, v) => s + Number(v.priceCents), 0);
    const pendingPayment = visas
      .filter((v) => ['UNPAID', 'PARTIAL'].includes(v.paymentStatus) && v.status !== 'CANCELLED')
      .reduce((s, v) => s + Number(v.priceCents), 0);
    const newRequests = visas.filter((v) => v.status === 'NOT_STARTED').length;
    const recentActivity = visas.slice(0, 6).map((v) => ({
      id: v.id,
      applicationNumber: v.applicationNumber,
      applicantName: v.applicantName,
      status: v.status,
      createdAt: v.createdAt,
    }));

    // Marketplace requests of type VISA addressed to this tenant
    const openServiceRequests = await this.prisma.marketplaceRequest.count({
      where: { tenantId, serviceType: 'VISA', status: { in: ['OPEN', 'IN_NEGOTIATION'] } },
    });
    const vendor = await this.prisma.vendor.findFirst({ where: { tenantId } });
    const activeListings = vendor
      ? await this.prisma.listing.count({ where: { vendorId: vendor.id, isActive: true, type: 'visa_service' } })
      : 0;

    return {
      ...base,
      newRequests,
      pendingPayment,
      revenueCollected,
      currency: 'SAR',
      openServiceRequests,
      activeListings,
      recentActivity,
    };
  }
}
