import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { AuditService } from '../audit/audit.service';
import { StorageService, StorageDriver } from './storage.service';
import { requireId } from '../../common/tenant-scope';
import type { Principal } from '../auth/principal';

const DOWNLOAD_AUDIENCE = 'umrah-connects-download';

interface DownloadClaims {
  purpose: 'download';
  key: string;
  name: string;
  mime: string;
}

/**
 * Private documents are read only through short-lived URLs issued after an
 * authorization check. Every issuance is audited.
 */
@Injectable()
export class DocumentAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly jwt: JwtService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private get ttlSeconds() {
    return Math.min(Number(this.config.get<string>('DOCUMENT_URL_TTL_SECONDS', '300')), 900);
  }

  /** Browser-visible API base, e.g. https://umrahconnect.io/proxy-api (the web rewrite). */
  private get publicApiBase() {
    return (this.config.get<string>('PUBLIC_API_BASE_URL') ?? '/proxy-api').replace(/\/+$/, '');
  }

  private async issue(driver: string, storageKey: string, filename: string, mime: string) {
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
    if (driver === 'local') {
      const claims: DownloadClaims = { purpose: 'download', key: storageKey, name: filename, mime };
      const token = await this.jwt.signAsync(claims, { expiresIn: this.ttlSeconds, audience: DOWNLOAD_AUDIENCE });
      return { url: `${this.publicApiBase}/documents/signed/${token}`, expiresAt };
    }
    if (driver !== this.storage.driver) throw new NotFoundException('File is stored with an unavailable driver');
    return { url: await this.storage.presignedUrl(storageKey, { filename, expiresInSeconds: this.ttlSeconds }), expiresAt };
  }

  async visaDocumentUrl(principal: Principal, docId: string, version?: number) {
    const doc = await this.prisma.visaDocument.findFirst({
      where: { id: requireId(docId, 'Document'), tenantId: principal.tenantId },
      select: { id: true, name: true, applicationId: true, version: true },
    });
    if (!doc) throw new NotFoundException('Document not found');
    const v = await this.prisma.visaDocumentVersion.findFirst({
      where: { documentId: doc.id, ...(version ? { version } : {}) },
      orderBy: { version: 'desc' },
    });
    if (!v?.storageKey) throw new NotFoundException('No file has been uploaded for this document');
    const ext = v.storageKey.split('.').pop();
    const result = await this.issue(v.driver as StorageDriver, v.storageKey, `${doc.name ?? 'document'}-v${v.version}.${ext}`, v.mimeType ?? 'application/octet-stream');
    await this.audit.log({
      tenantId: principal.tenantId, actorId: principal.sub, actorEmail: principal.email ?? undefined,
      action: 'DATA_ACCESS', namespace: 'visa', resource: 'visa_document_file', resourceId: doc.id,
      metadata: { version: v.version, applicationId: doc.applicationId },
    });
    return { ...result, version: v.version, mimeType: v.mimeType };
  }

  async uploadKycDocument(principal: Principal, file: { buffer: Buffer; originalname: string; mimetype?: string }) {
    const stored = await this.storage.put({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      prefix: `kyc/${principal.tenantId}`,
    });
    await this.audit.log({
      tenantId: principal.tenantId, actorId: principal.sub, actorEmail: principal.email ?? undefined,
      action: 'DOCUMENT_UPLOAD', namespace: 'core', resource: 'kyc_document', resourceId: stored.storageKey,
    });
    return {
      storageKey: stored.storageKey,
      driver: stored.driver,
      name: file.originalname.slice(0, 200),
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      checksum: stored.checksum,
    };
  }

  async kycDocumentUrl(principal: Principal, kycId: string, index: number) {
    const kyc = await this.prisma.tenantKyc.findUnique({ where: { id: requireId(kycId, 'KYC record') } });
    if (!kyc) throw new NotFoundException('Document not found');
    const perms = new Set(await this.rbac.getUserPermissions(principal.sub, principal.tenantId));
    const platformReviewer = perms.has('platform:kyc:review');
    const ownOrg = kyc.tenantId === principal.tenantId && perms.has('core:tenant:read');
    if (!platformReviewer && !ownOrg) throw new NotFoundException('Document not found');

    const docs = Array.isArray(kyc.documents) ? (kyc.documents as any[]) : [];
    const doc = docs[index];
    if (!doc || typeof doc.storageKey !== 'string' || !doc.storageKey.startsWith(`kyc/${kyc.tenantId}/`)) {
      throw new NotFoundException('Document not found');
    }
    const result = await this.issue(doc.driver ?? 'local', doc.storageKey, String(doc.name ?? 'kyc-document'), String(doc.mimeType ?? 'application/octet-stream'));
    await this.audit.log({
      tenantId: kyc.tenantId, actorId: principal.sub, actorEmail: principal.email ?? undefined,
      action: 'DATA_ACCESS', namespace: 'core', resource: 'kyc_document', resourceId: kyc.id,
      metadata: { index, platformReviewer },
    });
    return result;
  }

  async resolveSignedToken(token: string): Promise<DownloadClaims> {
    try {
      const claims = await this.jwt.verifyAsync<DownloadClaims>(token, { audience: DOWNLOAD_AUDIENCE });
      if (claims.purpose !== 'download' || !claims.key) throw new Error('bad claims');
      return claims;
    } catch {
      throw new UnauthorizedException('This download link is invalid or has expired');
    }
  }

  static assertKycDocuments(tenantId: string, documents: unknown[] | undefined) {
    for (const d of documents ?? []) {
      const key = (d as any)?.storageKey;
      if (key !== undefined && (typeof key !== 'string' || !key.startsWith(`kyc/${tenantId}/`))) {
        throw new ForbiddenException('KYC documents must be uploaded through /documents/kyc');
      }
    }
  }
}
