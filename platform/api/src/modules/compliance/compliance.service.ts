import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VisaStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertAllOwned, assertOwnedIfPresent, requireId } from '../../common/tenant-scope';
import { QueryVisaDto, VISA_DECISION_STATUSES } from './dto/compliance.dto';
import { VisaDocumentsService } from './visa-documents.service';
import {
  BLOCKING_DOCUMENT_STATUSES, VISA_EDIT_STATUSES, VISA_TERMINAL_STATUSES, VISA_TRANSITIONS,
  assertVisaTransition,
} from './visa-workflow';

const OPERATOR_TENANT_TYPES = ['OPERATOR', 'MU_ASSASA', 'SUB_AGENT'];

export interface VisaActor {
  sub?: string;
  /** Whether the caller holds visa:application:manage (resolved by the controller). */
  canManage?: boolean;
}

interface TransitionExtras {
  visaNumber?: string;
  reason?: string;
  expiresAt?: Date | null;
  note?: string;
}

const pilgrimName = (p: any) =>
  p ? [p.firstNameEn, p.lastNameEn].filter(Boolean).join(' ').trim() || p.firstNameAr || null : null;

@Injectable()
export class ComplianceService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private docs: VisaDocumentsService,
  ) {}

  /**
   * Every application carries the moves the server will accept next, so the UI never offers a dead end.
   * F13: no payment is linked to visa applications, so their stored payment status never changes;
   * it is neither accepted nor returned (the fee is billed as a Finance invoice).
   */
  private serialize(v: any) {
    if (!v) return v;
    const { paymentStatus: _untracked, ...row } = v;
    return {
      ...row,
      priceCents: v.priceCents != null ? Number(v.priceCents) : 0,
      allowedTransitions: VISA_TRANSITIONS[v.status] ?? [],
    };
  }

  async findVisas(tenantId: string, query: QueryVisaDto) {
    const { status, system, pilgrimId, bookingId, search, page = 1, limit = 20 } = query;
    const skip = (+page - 1) * +limit;
    const where: Prisma.VisaApplicationWhereInput = { tenantId };
    if (status) where.status = status;
    if (system) where.regulatorySystem = system;
    if (pilgrimId) where.pilgrimId = pilgrimId;
    if (bookingId) where.bookingId = bookingId;
    if (search) where.OR = [
      { applicantName: { contains: search, mode: 'insensitive' } },
      { applicantPassport: { contains: search, mode: 'insensitive' } },
      { applicationNumber: { contains: search, mode: 'insensitive' } },
      { externalRef: { contains: search, mode: 'insensitive' } },
    ];
    const [items, total] = await Promise.all([
      this.prisma.visaApplication.findMany({ where, skip, take: +limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.visaApplication.count({ where }),
    ]);
    // Applications filed for a traveler record show that traveler; tenant-scoped so a
    // stale foreign link can never expose another organization's passport data.
    const pilgrimIds = [...new Set(items.map((v) => v.pilgrimId).filter(Boolean))] as string[];
    const pilgrims = pilgrimIds.length
      ? await this.prisma.pilgrim.findMany({
          where: { id: { in: pilgrimIds }, tenantId },
          select: { id: true, firstNameEn: true, lastNameEn: true, firstNameAr: true, passportNumber: true, nationality: true },
        })
      : [];
    const byId = new Map(pilgrims.map((p) => [p.id, p]));
    return {
      items: items.map((v) => ({ ...this.serialize(v), pilgrim: v.pilgrimId ? byId.get(v.pilgrimId) ?? null : null })),
      total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit),
    };
  }

  async findVisaById(tenantId: string, id: string) {
    const visa = await this.prisma.visaApplication.findFirst({ where: { id: requireId(id, 'Visa application'), tenantId } });
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
    // The applicant snapshot comes from the linked traveler record unless typed in.
    const pilgrim = dto.pilgrimId
      ? await this.prisma.pilgrim.findFirst({
          where: { id: dto.pilgrimId, tenantId },
          select: { firstNameEn: true, lastNameEn: true, firstNameAr: true, passportNumber: true, nationality: true },
        })
      : null;
    const applicantName = (dto.applicantName ?? '').trim() || pilgrimName(pilgrim);
    if (!applicantName) {
      throw new BadRequestException('Give the applicant\'s name or link a traveler record');
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
        applicantName,
        applicantPassport: (dto.applicantPassport ?? dto.passportNumber ?? '').trim() || pilgrim?.passportNumber || null,
        applicantNationality: dto.applicantNationality ?? dto.nationality ?? pilgrim?.nationality ?? null,
        visaType: dto.visaType ?? dto.type,
        destinationCountry: dto.destinationCountry,
        serviceCountry: dto.serviceCountry,
        applicationNumber: appNo,
        requiredDocuments: dto.requiredDocuments ?? [],
        assignedOfficer: dto.assignedOfficer,
        expectedCompletionAt: dto.expectedCompletionAt ? new Date(dto.expectedCompletionAt) : undefined,
        priceCents: dto.priceCents != null ? BigInt(Math.round(Number(dto.priceCents))) : dto.price != null ? BigInt(Math.round(Number(dto.price) * 100)) : BigInt(0),
        currency: dto.currency ?? 'SAR',
        // Payment state belongs to the payments module; an application always starts unpaid.
        notes: dto.notes,
        documents: dto.documents ?? [],
        timeline: [{ at: new Date().toISOString(), event: 'CREATED', to: status, by: createdBy ?? 'system' }],
        createdBy: createdBy && createdBy.length === 36 ? createdBy : null,
      },
    });
    return this.serialize(visa);
  }

  /**
   * Everything a regulator filing needs: who the applicant is, their passport and
   * nationality, the visa type — and no document still missing, rejected or expired.
   */
  private async assertReadyToSubmit(tenantId: string, visa: any) {
    const problems: string[] = [];
    const name = visa.applicantName || pilgrimName(visa.pilgrim);
    if (!name) problems.push('the applicant\'s name');
    if (!(visa.applicantPassport || visa.pilgrim?.passportNumber)) problems.push('the passport number');
    if (!(visa.applicantNationality || visa.pilgrim?.nationality)) problems.push('the nationality');
    if (!visa.visaType) problems.push('the visa type');
    const docs = await this.docs.list(tenantId, visa.id);
    const blocking = docs.filter((d: any) => BLOCKING_DOCUMENT_STATUSES.includes(d.effectiveStatus));
    const parts: string[] = [];
    if (problems.length) parts.push(`add ${problems.join(', ')}`);
    if (blocking.length) {
      parts.push(`resolve ${blocking.map((d: any) => `${d.name} (${String(d.effectiveStatus).toLowerCase()})`).join(', ')}`);
    }
    if (parts.length) throw new BadRequestException(`Before submitting: ${parts.join('; ')}`);
  }

  /**
   * The single place an application changes status: checks the move against
   * VISA_TRANSITIONS, stamps the server-owned fields, appends the timeline and
   * notifies the filer on decisions.
   */
  private async transition(tenantId: string, current: any, to: string, actor: VisaActor, extras: TransitionExtras = {}, fields: Record<string, unknown> = {}) {
    assertVisaTransition(current.status, to);
    const now = new Date();
    const data: any = { ...fields, status: to as VisaStatus };
    if (to === 'SUBMITTED') data.submittedAt = now;
    if (to === 'APPROVED') {
      data.approvedAt = now;
      data.externalRef = extras.visaNumber;
      data.rejectedAt = null;
      data.rejectionReason = null;
      if (extras.expiresAt !== undefined) data.expiresAt = extras.expiresAt;
    }
    if (to === 'REJECTED') {
      data.rejectedAt = now;
      data.rejectionReason = extras.reason;
    }
    // The timeline is an append-only server log; clients cannot write it.
    const tl = Array.isArray(current.timeline) ? current.timeline : [];
    data.timeline = [...tl, {
      at: now.toISOString(),
      event: `STATUS_${to}`,
      from: current.status,
      to,
      by: actor.sub ?? 'system',
      ...(extras.visaNumber ? { visaNumber: extras.visaNumber } : {}),
      ...(extras.reason ? { note: extras.reason } : extras.note ? { note: extras.note } : {}),
    }];
    const visa = await this.prisma.visaApplication.update({ where: { id: current.id }, data });
    if ((to === 'APPROVED' || to === 'REJECTED') && visa.createdBy) {
      this.notifications.fire({
        tenantId,
        recipientUserId: visa.createdBy,
        actorUserId: actor.sub,
        type: 'VISA_STATUS',
        title: to === 'APPROVED' ? 'Visa approved' : 'Visa rejected',
        body: to === 'APPROVED'
          ? `Visa application ${visa.applicationNumber ?? visa.id.slice(0, 8)} was approved (visa ${extras.visaNumber}).`
          : `Visa application ${visa.applicationNumber ?? visa.id.slice(0, 8)} was rejected: ${extras.reason}`,
        link: `/compliance/${visa.id}`,
      }).catch(() => undefined);
    }
    return visa;
  }

  async updateVisa(tenantId: string, id: string, dto: any, actor: VisaActor = {}) {
    const current: any = await this.findVisaById(tenantId, id);
    if (VISA_TERMINAL_STATUSES.includes(current.status)) {
      const changed = Object.entries(dto).filter(([k, v]) => v !== undefined && k !== 'notes').map(([k]) => k);
      if (changed.length) throw new ConflictException(`This application is ${current.status}; only its notes can still change`);
    }
    await this.assertVisaLinks(tenantId, dto);
    const data: any = {};
    if (dto.pilgrimId !== undefined) data.pilgrimId = dto.pilgrimId || null;
    if (dto.bookingId !== undefined) data.bookingId = dto.bookingId || null;
    for (const k of ['applicantName', 'applicantPassport', 'applicantNationality', 'visaType', 'destinationCountry', 'serviceCountry', 'applicationNumber', 'requiredDocuments', 'assignedOfficer', 'notes']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.type !== undefined) data.visaType = dto.type;
    if (dto.regulatorySystem !== undefined) data.regulatorySystem = dto.regulatorySystem;
    if (dto.priceCents !== undefined) data.priceCents = BigInt(Math.round(Number(dto.priceCents)));
    if (dto.price !== undefined) data.priceCents = BigInt(Math.round(Number(dto.price) * 100));
    if (data.priceCents !== undefined && data.priceCents < BigInt(0)) {
      throw new BadRequestException('Price must not be negative');
    }
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.expectedCompletionAt !== undefined) data.expectedCompletionAt = dto.expectedCompletionAt ? new Date(dto.expectedCompletionAt) : null;
    if (dto.externalRef !== undefined && dto.externalRef !== current.externalRef) {
      if (!actor.canManage) throw new ForbiddenException('Changing the visa number / regulator reference requires visa:application:manage');
      data.externalRef = dto.externalRef || null;
    }
    if (dto.expiresAt !== undefined) {
      if (current.status !== 'APPROVED' && dto.status !== 'EXPIRED') {
        throw new BadRequestException('The visa expiry date is recorded once the visa is approved');
      }
      data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }

    if (dto.status && dto.status !== current.status) {
      if (VISA_DECISION_STATUSES.includes(dto.status)) {
        if (!actor.canManage) throw new ForbiddenException('Approving or rejecting a visa application requires visa:application:manage');
        throw new BadRequestException('Use the approve or reject action: approval records the visa number, rejection records the reason');
      }
      if (dto.status === 'SUBMITTED') await this.assertReadyToSubmit(tenantId, { ...current, ...data });
      else if (!VISA_EDIT_STATUSES.includes(dto.status) && dto.status !== 'CANCELLED') {
        throw new BadRequestException(`Status ${dto.status} cannot be set from the edit form`);
      }
      return this.serialize(await this.transition(tenantId, current, dto.status, actor, {}, data));
    }
    if (!Object.keys(data).length) return this.serialize(current);
    const visa = await this.prisma.visaApplication.update({ where: { id: current.id }, data });
    return this.serialize(visa);
  }

  /** Cancels (withdraws) an application. The record and its history stay. */
  async deleteVisa(tenantId: string, id: string, actor: VisaActor = {}) {
    const current = await this.findVisaById(tenantId, id);
    return this.serialize(await this.transition(tenantId, current, 'CANCELLED', actor));
  }

  async submitVisa(tenantId: string, id: string, actor: VisaActor = {}) {
    const current: any = await this.findVisaById(tenantId, id);
    assertVisaTransition(current.status, 'SUBMITTED');
    await this.assertReadyToSubmit(tenantId, current);
    return this.serialize(await this.transition(tenantId, current, 'SUBMITTED', actor));
  }

  async approveVisa(tenantId: string, id: string, body: { visaNumber?: string; expiresAt?: string }, actor: VisaActor = {}) {
    const current = await this.findVisaById(tenantId, id);
    const visaNumber = (body?.visaNumber ?? '').trim();
    if (!visaNumber) throw new BadRequestException('The issued visa number is required to approve an application');
    const expiresAt = body?.expiresAt ? new Date(body.expiresAt) : undefined;
    if (expiresAt && expiresAt.getTime() < Date.now()) throw new BadRequestException('The visa expiry date must be in the future');
    return this.serialize(await this.transition(tenantId, current, 'APPROVED', actor, { visaNumber, expiresAt }));
  }

  async rejectVisa(tenantId: string, id: string, reason: string, actor: VisaActor = {}) {
    const current = await this.findVisaById(tenantId, id);
    const clean = (reason ?? '').trim();
    if (clean.length < 3) throw new BadRequestException('A rejection reason of at least 3 characters is required');
    return this.serialize(await this.transition(tenantId, current, 'REJECTED', actor, { reason: clean }));
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
    const rows = await this.prisma.visaApplication.groupBy({ by: ['status'], where: { tenantId }, _count: true });
    const byStatus: Record<string, number> = Object.fromEntries(Object.values(VisaStatus).map((s) => [s, 0]));
    rows.forEach((r) => { byStatus[r.status] = r._count; });
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const decided = byStatus.APPROVED + byStatus.REJECTED;
    return {
      total,
      byStatus,
      decided,
      /** Share of decided applications that were approved (0–1). */
      successRate: decided > 0 ? byStatus.APPROVED / decided : 0,
    };
  }

  /** Rich dashboard stats for the Visa Agency role. */
  async getDashboardStats(tenantId: string) {
    const base = await this.getStats(tenantId);
    const visas = await this.prisma.visaApplication.findMany({
      where: { tenantId },
      select: { priceCents: true, currency: true, status: true, applicantName: true, applicationNumber: true, createdAt: true, id: true },
      orderBy: { createdAt: 'desc' },
    });
    // What was booked, not what was paid: no payment is linked to visa applications (F13) —
    // service fees are billed as Finance invoices.
    const booked = visas.filter((v) => !['CANCELLED', 'REJECTED'].includes(v.status) && v.currency === 'SAR');
    const bookedValue = booked.reduce((s, v) => s + Number(v.priceCents), 0);
    const newRequests = visas.filter((v) => v.status === 'NOT_STARTED').length;
    const recentActivity = visas.slice(0, 6).map((v) => ({
      id: v.id,
      applicationNumber: v.applicationNumber,
      applicantName: v.applicantName,
      status: v.status,
      createdAt: v.createdAt,
    }));

    const [openServiceRequests, openTickets, documentsToReview] = await Promise.all([
      // Marketplace demand an agency can answer: open VISA requests from travelers
      // (they live in the travelers' organization, not this one).
      this.prisma.marketplaceRequest.count({
        where: { serviceType: 'VISA', status: { in: ['OPEN', 'IN_NEGOTIATION'] } },
      }),
      this.prisma.visaServiceRequest.count({
        where: { tenantId, status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'ESCALATED'] } },
      }),
      this.prisma.visaDocument.count({ where: { tenantId, status: 'RECEIVED' } }),
    ]);
    const vendor = await this.prisma.vendor.findFirst({ where: { tenantId } });
    const activeListings = vendor
      ? await this.prisma.listing.count({ where: { vendorId: vendor.id, isActive: true, type: 'visa_service' } })
      : 0;

    return {
      ...base,
      newRequests,
      bookedValue: { amountCents: bookedValue, count: booked.length, currency: 'SAR' },
      currency: 'SAR',
      openServiceRequests,
      openTickets,
      documentsToReview,
      activeListings,
      recentActivity,
    };
  }
}
