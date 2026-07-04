import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

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
      pilgrim = await this.prisma.pilgrim.findUnique({
        where: { id: visa.pilgrimId },
        select: { id: true, firstNameEn: true, lastNameEn: true, firstNameAr: true, passportNumber: true, nationality: true, email: true, phone: true },
      });
    }
    return { ...this.serialize(visa), pilgrim };
  }

  async createVisa(tenantId: string, dto: any, createdBy?: string) {
    const appNo = dto.applicationNumber ?? `VISA-${new Date().getFullYear()}-${Math.random().toString().slice(2, 7)}`;
    const visa = await this.prisma.visaApplication.create({
      data: {
        tenantId,
        pilgrimId: dto.pilgrimId && String(dto.pilgrimId).length === 36 ? dto.pilgrimId : null,
        bookingId: dto.bookingId && String(dto.bookingId).length === 36 ? dto.bookingId : null,
        operatorId: dto.operatorId && String(dto.operatorId).length === 36 ? dto.operatorId : null,
        regulatorySystem: (dto.regulatorySystem ?? dto.system ?? 'NUSUK_MASAR') as any,
        status: (dto.status ?? 'NOT_STARTED') as any,
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
        paymentStatus: (dto.paymentStatus ?? 'UNPAID').toUpperCase(),
        notes: dto.notes,
        documents: dto.documents ?? [],
        timeline: [{ at: new Date().toISOString(), event: 'CREATED', by: createdBy ?? 'system' }],
        createdBy: createdBy && createdBy.length === 36 ? createdBy : null,
      },
    });
    return this.serialize(visa);
  }

  async updateVisa(tenantId: string, id: string, dto: any) {
    const current = await this.findVisaById(tenantId, id);
    const data: any = {};
    for (const k of ['applicantName', 'applicantPassport', 'applicantNationality', 'visaType', 'destinationCountry', 'serviceCountry', 'applicationNumber', 'requiredDocuments', 'assignedOfficer', 'notes', 'externalRef', 'rejectionReason']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.type !== undefined) data.visaType = dto.type;
    if (dto.regulatorySystem !== undefined) data.regulatorySystem = dto.regulatorySystem;
    if (dto.paymentStatus !== undefined) data.paymentStatus = String(dto.paymentStatus).toUpperCase();
    if (dto.priceCents !== undefined) data.priceCents = BigInt(Math.round(Number(dto.priceCents)));
    if (dto.price !== undefined) data.priceCents = BigInt(Math.round(Number(dto.price) * 100));
    if (dto.expectedCompletionAt !== undefined) data.expectedCompletionAt = dto.expectedCompletionAt ? new Date(dto.expectedCompletionAt) : null;
    if (dto.expiresAt !== undefined) data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.submittedAt !== undefined) data.submittedAt = dto.submittedAt ? new Date(dto.submittedAt) : null;
    if (dto.status) {
      data.status = dto.status;
      const tl = Array.isArray((current as any).timeline) ? (current as any).timeline : [];
      data.timeline = [...tl, { at: new Date().toISOString(), event: `STATUS_${dto.status}` }];
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
    return this.prisma.regulatorySubmission.create({
      data: {
        tenantId,
        regulatorySystem: dto.regulatorySystem as any,
        batchRef: dto.batchRef ?? `BATCH-${Date.now().toString(36).toUpperCase()}`,
        pilgrimIds: dto.pilgrimIds ?? [],
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
