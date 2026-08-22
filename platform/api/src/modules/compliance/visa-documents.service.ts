import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { VisaDocumentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';

export interface DocActor { sub?: string; email?: string; tenantId?: string }

/** Terminal-ish states that a plain status edit must not jump into blindly. */
const DECISION_STATUSES: VisaDocumentStatus[] = [
  VisaDocumentStatus.VERIFIED,
  VisaDocumentStatus.REJECTED,
];

@Injectable()
export class VisaDocumentsService {
  private readonly logger = new Logger(VisaDocumentsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private storage: StorageService,
  ) {}

  // ── helpers ────────────────────────────────────────────────────────────

  private async mustFindApplication(tenantId: string, applicationId: string) {
    if (!tenantId) throw new BadRequestException('Missing tenant context');
    if (!applicationId) throw new BadRequestException('Application id is required');
    const app = await this.prisma.visaApplication.findFirst({
      where: { id: applicationId, tenantId },
      select: { id: true, applicantName: true, applicationNumber: true, createdBy: true },
    });
    if (!app) throw new NotFoundException('Visa application not found');
    return app;
  }

  private async mustFindDoc(tenantId: string, applicationId: string, docId: string) {
    await this.mustFindApplication(tenantId, applicationId);
    if (!docId) throw new BadRequestException('Document id is required');
    const doc = await this.prisma.visaDocument.findFirst({
      where: { id: docId, tenantId, applicationId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  /** Expiry is derived, never a stored lie: a past expiresAt reads EXPIRED. */
  private decorate<T extends { expiresAt: Date | null; status: VisaDocumentStatus }>(doc: T) {
    const isExpired = !!doc.expiresAt && doc.expiresAt.getTime() < Date.now();
    return {
      ...doc,
      isExpired,
      effectiveStatus: isExpired && doc.status !== VisaDocumentStatus.MISSING
        ? VisaDocumentStatus.EXPIRED
        : doc.status,
    };
  }

  private async trail(
    tenantId: string, actor: DocActor | undefined, action: string,
    docId: string, before?: unknown, after?: unknown, metadata?: Record<string, unknown>,
  ) {
    await this.audit.log({
      tenantId,
      actorId: actor?.sub,
      actorEmail: actor?.email,
      action,
      namespace: 'visa',
      resource: 'visa_document',
      resourceId: docId,
      beforeState: before,
      afterState: after,
      metadata,
    });
  }

  /** Notify whoever owns the application. Never fatal to the request. */
  private async notifyOwner(
    tenantId: string, ownerId: string | null | undefined, actor: DocActor | undefined,
    title: string, body: string, link: string, data: Record<string, unknown>,
  ) {
    if (!ownerId) return;
    try {
      await this.notifications.fire({
        tenantId, recipientUserId: ownerId, actorUserId: actor?.sub,
        type: 'VISA_STATUS', title, body, link, data,
      });
    } catch (err) {
      this.logger.error(`Document notification failed: ${(err as Error).message}`);
    }
  }

  // ── queries ────────────────────────────────────────────────────────────

  /**
   * Documents used to live as a JSON array on the application. Import any
   * legacy entries the first time an application's documents are read, so
   * existing (including production) records are not orphaned by the move to
   * a real table. Idempotent: only runs while the table has no rows for it.
   */
  private async migrateLegacy(tenantId: string, applicationId: string) {
    const existing = await this.prisma.visaDocument.count({ where: { tenantId, applicationId } });
    if (existing > 0) return;
    const app = await this.prisma.visaApplication.findFirst({
      where: { id: applicationId, tenantId },
      select: { documents: true },
    });
    const legacy = Array.isArray(app?.documents) ? (app!.documents as any[]) : [];
    if (!legacy.length) return;
    for (const d of legacy) {
      const status = (String(d?.status ?? 'MISSING').toUpperCase()) as VisaDocumentStatus;
      const doc = await this.prisma.visaDocument.create({
        data: {
          tenantId,
          applicationId,
          name: String(d?.name ?? 'Untitled document').slice(0, 200),
          type: String(d?.type ?? 'OTHER').slice(0, 60),
          status: (Object.values(VisaDocumentStatus) as string[]).includes(status)
            ? status : VisaDocumentStatus.MISSING,
          url: d?.url ?? null,
          version: d?.url ? 1 : 0,
          createdAt: d?.addedAt ? new Date(d.addedAt) : undefined,
        },
      });
      if (d?.url) {
        await this.prisma.visaDocumentVersion.create({
          data: { documentId: doc.id, version: 1, url: d.url, driver: 'local' },
        });
      }
    }
    this.logger.log(`Imported ${legacy.length} legacy document(s) for application ${applicationId}`);
  }

  async list(tenantId: string, applicationId: string) {
    await this.mustFindApplication(tenantId, applicationId);
    await this.migrateLegacy(tenantId, applicationId);
    const docs = await this.prisma.visaDocument.findMany({
      where: { tenantId, applicationId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { versions: true } } },
    });
    return docs.map((d) => ({ ...this.decorate(d), versionCount: d._count.versions }));
  }

  async findOne(tenantId: string, applicationId: string, docId: string) {
    const doc = await this.mustFindDoc(tenantId, applicationId, docId);
    const versions = await this.prisma.visaDocumentVersion.findMany({
      where: { documentId: docId },
      orderBy: { version: 'desc' },
    });
    return { ...this.decorate(doc), versions };
  }

  async versions(tenantId: string, applicationId: string, docId: string) {
    await this.mustFindDoc(tenantId, applicationId, docId);
    return this.prisma.visaDocumentVersion.findMany({
      where: { documentId: docId },
      orderBy: { version: 'desc' },
    });
  }

  /** Tenant-wide document register, used by the /visa-documents screen. */
  async listAll(tenantId: string, filters: { status?: string; expiringInDays?: number } = {}) {
    const where: Prisma.VisaDocumentWhereInput = { tenantId };
    if (filters.status && filters.status !== 'EXPIRED') {
      where.status = filters.status as VisaDocumentStatus;
    }
    if (filters.status === 'EXPIRED') {
      where.expiresAt = { lt: new Date() };
      where.status = { not: VisaDocumentStatus.MISSING };
    }
    if (filters.expiringInDays != null) {
      const until = new Date(Date.now() + filters.expiringInDays * 86400000);
      where.expiresAt = { gte: new Date(), lte: until };
    }

    const docs = await this.prisma.visaDocument.findMany({
      where, orderBy: { updatedAt: 'desc' }, take: 500,
    });
    const appIds = [...new Set(docs.map((d) => d.applicationId))];
    const apps = await this.prisma.visaApplication.findMany({
      where: { id: { in: appIds } },
      select: { id: true, applicantName: true, applicationNumber: true, status: true },
    });
    const byId = new Map(apps.map((a) => [a.id, a]));
    return docs.map((d) => ({
      ...this.decorate(d),
      application: byId.get(d.applicationId) ?? null,
    }));
  }

  async stats(tenantId: string) {
    const [byStatusRaw, expired, expiringSoon, total] = await Promise.all([
      this.prisma.visaDocument.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
      this.prisma.visaDocument.count({
        where: { tenantId, expiresAt: { lt: new Date() }, status: { not: VisaDocumentStatus.MISSING } },
      }),
      this.prisma.visaDocument.count({
        where: { tenantId, expiresAt: { gte: new Date(), lte: new Date(Date.now() + 30 * 86400000) } },
      }),
      this.prisma.visaDocument.count({ where: { tenantId } }),
    ]);
    const byStatus: Record<string, number> = Object.fromEntries(
      Object.values(VisaDocumentStatus).map((s) => [s, 0]),
    );
    byStatusRaw.forEach((r) => { byStatus[r.status] = r._count; });
    return { total, byStatus, expired, expiringSoon, storage: this.storage.status };
  }

  // ── mutations ──────────────────────────────────────────────────────────

  async create(
    tenantId: string, applicationId: string,
    dto: { name: string; type?: string; url?: string; status?: string; expiresAt?: string; notes?: string },
    actor?: DocActor,
  ) {
    const app = await this.mustFindApplication(tenantId, applicationId);
    const name = (dto?.name ?? '').trim();
    if (!name) throw new BadRequestException('Document name is required');

    const status = this.coerceStatus(dto.status) ?? (dto.url ? VisaDocumentStatus.RECEIVED : VisaDocumentStatus.MISSING);
    const doc = await this.prisma.visaDocument.create({
      data: {
        tenantId,
        applicationId,
        name,
        type: dto.type ?? 'OTHER',
        status,
        url: dto.url ?? null,
        version: dto.url ? 1 : 0,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        notes: dto.notes,
        createdBy: actor?.sub,
      },
    });

    // A document created straight from a URL still gets a version-1 record,
    // so history is complete no matter how the file arrived.
    if (dto.url) {
      await this.prisma.visaDocumentVersion.create({
        data: { documentId: doc.id, version: 1, url: dto.url, driver: 'local', uploadedBy: actor?.sub },
      });
    }

    await this.trail(tenantId, actor, 'DOCUMENT_UPLOAD', doc.id, undefined, doc, { applicationId, name });
    return this.decorate(doc);
  }

  private coerceStatus(v?: string): VisaDocumentStatus | undefined {
    if (!v) return undefined;
    const up = String(v).toUpperCase();
    if (!(Object.values(VisaDocumentStatus) as string[]).includes(up)) {
      throw new BadRequestException(
        `status must be one of: ${Object.values(VisaDocumentStatus).join(', ')}`,
      );
    }
    return up as VisaDocumentStatus;
  }

  /** Upload (or replace) the file behind a document — creates a new version. */
  async addVersion(
    tenantId: string, applicationId: string, docId: string,
    file: { buffer: Buffer; originalname: string; mimetype?: string },
    actor?: DocActor,
  ) {
    const app = await this.mustFindApplication(tenantId, applicationId);
    const before = await this.mustFindDoc(tenantId, applicationId, docId);
    if (!file?.buffer) throw new BadRequestException('No file uploaded (field name must be "file")');

    const stored = await this.storage.put({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      prefix: `visa-documents/${applicationId}`,
    });

    const nextVersion = before.version + 1;
    const [, doc] = await this.prisma.$transaction([
      this.prisma.visaDocumentVersion.updateMany({
        where: { documentId: docId, replacedAt: null },
        data: { replacedAt: new Date() },
      }),
      this.prisma.visaDocument.update({
        where: { id: docId },
        data: {
          url: stored.url,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          version: nextVersion,
          // A replacement invalidates any previous decision.
          status: VisaDocumentStatus.RECEIVED,
          verifiedAt: null,
          verifiedBy: null,
          rejectedAt: null,
          rejectionReason: null,
        },
      }),
    ]);
    await this.prisma.visaDocumentVersion.create({
      data: {
        documentId: docId,
        version: nextVersion,
        url: stored.url,
        storageKey: stored.storageKey,
        driver: stored.driver,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        checksum: stored.checksum,
        uploadedBy: actor?.sub,
      },
    });

    await this.trail(tenantId, actor, 'DOCUMENT_UPLOAD', docId, before, doc, {
      applicationId, version: nextVersion, driver: stored.driver, replaced: before.version > 0,
    });
    await this.notifyOwner(
      tenantId, app.createdBy, actor,
      `Document ${before.version > 0 ? 'replaced' : 'uploaded'}: ${before.name}`,
      `Version ${nextVersion} for ${app.applicantName ?? app.applicationNumber ?? 'the application'}`,
      `/compliance/${applicationId}`,
      { applicationId, documentId: docId, version: nextVersion },
    );
    return this.decorate(doc);
  }

  async updateStatus(
    tenantId: string, applicationId: string, docId: string,
    body: { status?: string; url?: string; expiresAt?: string; notes?: string },
    actor?: DocActor,
  ) {
    const before = await this.mustFindDoc(tenantId, applicationId, docId);
    const status = this.coerceStatus(body?.status);

    const data: Prisma.VisaDocumentUpdateInput = {};
    if (status) data.status = status;
    if (body.url !== undefined) data.url = body.url;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (!Object.keys(data).length) throw new BadRequestException('No document fields supplied');

    // Verification decisions carry an actor and a timestamp; a plain status
    // edit must not fabricate one.
    if (status && DECISION_STATUSES.includes(status)) {
      throw new BadRequestException(
        `Use /verify or /reject to move a document to ${status} so the decision is attributable`,
      );
    }

    const doc = await this.prisma.visaDocument.update({ where: { id: docId }, data });
    await this.trail(tenantId, actor, 'UPDATE', docId, before, doc, { applicationId });
    return this.decorate(doc);
  }

  async verify(tenantId: string, applicationId: string, docId: string, actor?: DocActor) {
    const app = await this.mustFindApplication(tenantId, applicationId);
    const before = await this.mustFindDoc(tenantId, applicationId, docId);
    if (before.status === VisaDocumentStatus.MISSING || !before.url) {
      throw new BadRequestException('Cannot verify a document that has no file');
    }
    if (before.status === VisaDocumentStatus.VERIFIED) {
      throw new BadRequestException('Document is already verified');
    }
    if (before.expiresAt && before.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Cannot verify an expired document — request a current copy');
    }

    const doc = await this.prisma.visaDocument.update({
      where: { id: docId },
      data: {
        status: VisaDocumentStatus.VERIFIED,
        verifiedAt: new Date(),
        verifiedBy: actor?.sub,
        rejectedAt: null,
        rejectionReason: null,
      },
    });
    await this.trail(tenantId, actor, 'VISA_STATUS_CHANGE', docId, before, doc, { applicationId, decision: 'VERIFIED' });
    await this.notifyOwner(
      tenantId, app.createdBy, actor, `Document verified: ${doc.name}`,
      app.applicantName ?? app.applicationNumber ?? '', `/compliance/${applicationId}`,
      { applicationId, documentId: docId },
    );
    return this.decorate(doc);
  }

  async reject(tenantId: string, applicationId: string, docId: string, reason: string, actor?: DocActor) {
    const app = await this.mustFindApplication(tenantId, applicationId);
    const before = await this.mustFindDoc(tenantId, applicationId, docId);
    const clean = (reason ?? '').trim();
    if (clean.length < 3) throw new BadRequestException('A rejection reason is required');
    if (before.status === VisaDocumentStatus.REJECTED) {
      throw new BadRequestException('Document is already rejected');
    }

    const doc = await this.prisma.visaDocument.update({
      where: { id: docId },
      data: {
        status: VisaDocumentStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: clean,
        verifiedAt: null,
        verifiedBy: null,
      },
    });
    await this.trail(tenantId, actor, 'VISA_STATUS_CHANGE', docId, before, doc, { applicationId, decision: 'REJECTED', reason: clean });
    await this.notifyOwner(
      tenantId, app.createdBy, actor, `Document rejected: ${doc.name}`, clean,
      `/compliance/${applicationId}`, { applicationId, documentId: docId },
    );
    return this.decorate(doc);
  }

  async remove(tenantId: string, applicationId: string, docId: string, actor?: DocActor) {
    const before = await this.mustFindDoc(tenantId, applicationId, docId);
    const versions = await this.prisma.visaDocumentVersion.findMany({ where: { documentId: docId } });
    await this.prisma.visaDocument.delete({ where: { id: docId } });
    for (const v of versions) await this.storage.remove(v.storageKey, v.driver as any);
    await this.trail(tenantId, actor, 'DOCUMENT_DELETE', docId, before, undefined, { applicationId });
    return { deleted: true, id: docId };
  }
}
