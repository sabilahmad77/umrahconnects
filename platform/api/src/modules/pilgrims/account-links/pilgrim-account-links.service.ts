import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PilgrimAccountLink, PilgrimLinkStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { AuditService } from '../../audit/audit.service';
import { findOwned } from '../../../common/tenant-scope';
import type { Principal } from '../../auth/principal';
import {
  INVITATION_TTL_MS,
  RESEND_COOLDOWN_MS,
  buildInvitationMail,
  displayName,
  effectiveLinkStatus,
  hashInvitationToken,
  newInvitationToken,
  normalizeEmail,
} from './link-rules';
import { InviteTravelerDto, RevokeAccountLinkDto } from './account-link.dto';

export interface RequestContext {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

type LinkWithAccount = PilgrimAccountLink & {
  user: { id: string; firstName: string; lastName: string; email: string | null } | null;
};

/** What the organization sees about one link. Never includes the token or its hash. */
export interface OrganizationLinkView {
  id: string;
  status: PilgrimLinkStatus;
  invitedEmail: string;
  emailSource: string;
  invitedAt: Date;
  expiresAt: Date;
  lastSentAt: Date;
  sendCount: number;
  invitedBy: { id: string; name: string } | null;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  unlinkedAt: Date | null;
  revokedAt: Date | null;
  revokedBy: { id: string; name: string } | null;
  revokedReason: string | null;
  account: { id: string; name: string; email: string | null } | null;
}

const ACCOUNT_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;

/**
 * Organization side of the traveler ↔ pilgrim link (P06, D-022): invite the
 * traveler behind one of the organization's pilgrim records, resend, revoke and
 * read the history. Every operation resolves the pilgrim inside the caller's
 * own organization first, so a foreign pilgrim or link id is a plain 404.
 */
@Injectable()
export class PilgrimAccountLinksService {
  private readonly logger = new Logger(PilgrimAccountLinksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private get webUrl(): string {
    return (this.config.get<string>('WEB_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');
  }

  private ownedPilgrim(tenantId: string, pilgrimId: string) {
    return findOwned<{ id: string; email: string | null; firstNameEn: string; lastNameEn: string }>(
      this.prisma.pilgrim,
      pilgrimId,
      tenantId,
      'Pilgrim',
      { deletedAt: null },
      { id: true, email: true, firstNameEn: true, lastNameEn: true },
    );
  }

  private async ownedLink(tenantId: string, pilgrimId: string, linkId: string): Promise<LinkWithAccount> {
    const link = await this.prisma.pilgrimAccountLink.findFirst({
      where: { id: linkId, pilgrimId, tenantId },
      include: { user: { select: ACCOUNT_SELECT } },
    });
    if (!link) throw new NotFoundException('Invitation not found');
    return link;
  }

  /** Invitations past their expiry are marked EXPIRED so a new one can be sent. */
  private async expireStaleInvitations(tenantId: string, pilgrimId: string, now: Date) {
    await this.prisma.pilgrimAccountLink.updateMany({
      where: { tenantId, pilgrimId, status: 'INVITED', expiresAt: { lte: now } },
      data: { status: 'EXPIRED', tokenHash: null },
    });
  }

  private async organizationName(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    return tenant?.name ?? 'Your travel organizer';
  }

  private async sendInvitation(link: { invitedEmail: string; expiresAt: Date }, token: string, tenantId: string) {
    const organizationName = await this.organizationName(tenantId);
    const url = `${this.webUrl}/travel-plan/link?token=${encodeURIComponent(token)}`;
    const message = buildInvitationMail({ organizationName, link: url, expiresAt: link.expiresAt });
    const result = await this.mail.send({ to: link.invitedEmail, ...message });
    if (!result.delivered) throw new Error(`mail driver ${result.driver} did not deliver`);
  }

  private assertMailAvailable() {
    // Do not create an invitation nobody can receive (same rule as password reset, D-013).
    if (!this.mail.canDeliver) {
      throw new ServiceUnavailableException('Invitation email is temporarily unavailable. Try again later.');
    }
  }

  private async record(
    actor: Principal,
    link: { id: string; tenantId: string; pilgrimId: string },
    action: 'CREATE' | 'UPDATE' | 'PERMISSION_CHANGE',
    event: string,
    ctx: RequestContext,
    metadata: Record<string, unknown> = {},
  ) {
    await this.audit.log({
      tenantId: link.tenantId,
      actorId: actor.sub,
      actorEmail: actor.email ?? undefined,
      action,
      namespace: 'crm',
      resource: 'pilgrim_account_link',
      resourceId: link.id,
      metadata: { event, pilgrimId: link.pilgrimId, ...metadata },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  }

  private async present(tenantId: string, links: LinkWithAccount[], now = new Date()): Promise<OrganizationLinkView[]> {
    // Staff names are looked up inside the organization only.
    const staffIds = [...new Set(links.flatMap((l) => [l.invitedBy, l.revokedBy]).filter((v): v is string => !!v))];
    const staff = staffIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: staffIds }, tenantId },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const staffById = new Map(staff.map((s) => [s.id, { id: s.id, name: displayName(s.firstName, s.lastName, 'Staff member') }]));
    return links.map((l) => ({
      id: l.id,
      status: effectiveLinkStatus(l, now),
      invitedEmail: l.invitedEmail,
      emailSource: l.emailSource,
      invitedAt: l.invitedAt,
      expiresAt: l.expiresAt,
      lastSentAt: l.lastSentAt,
      sendCount: l.sendCount,
      invitedBy: staffById.get(l.invitedBy) ?? null,
      acceptedAt: l.acceptedAt,
      declinedAt: l.declinedAt,
      unlinkedAt: l.unlinkedAt,
      revokedAt: l.revokedAt,
      revokedBy: l.revokedBy ? (staffById.get(l.revokedBy) ?? null) : null,
      revokedReason: l.revokedReason,
      account: l.user ? { id: l.user.id, name: displayName(l.user.firstName, l.user.lastName), email: l.user.email } : null,
    }));
  }

  private async presentOne(tenantId: string, link: LinkWithAccount) {
    return (await this.present(tenantId, [link]))[0];
  }

  // ── Reads ──────────────────────────────────────────────────────────────

  async list(tenantId: string, pilgrimId: string): Promise<OrganizationLinkView[]> {
    await this.ownedPilgrim(tenantId, pilgrimId);
    const links = await this.prisma.pilgrimAccountLink.findMany({
      where: { tenantId, pilgrimId },
      include: { user: { select: ACCOUNT_SELECT } },
      orderBy: { invitedAt: 'desc' },
      take: 50,
    });
    return this.present(tenantId, links);
  }

  // ── Invite ─────────────────────────────────────────────────────────────

  async invite(actor: Principal, pilgrimId: string, dto: InviteTravelerDto, ctx: RequestContext = {}) {
    const tenantId = actor.tenantId;
    const pilgrim = await this.ownedPilgrim(tenantId, pilgrimId);
    const onRecord = normalizeEmail(pilgrim.email);
    const entered = normalizeEmail(dto.email);
    const invitedEmail = entered || onRecord;
    if (!invitedEmail) {
      throw new BadRequestException({
        code: 'EMAIL_REQUIRED',
        message: 'This traveler record has no email address. Enter the address to send the invitation to.',
      });
    }
    this.assertMailAvailable();

    const now = new Date();
    await this.expireStaleInvitations(tenantId, pilgrim.id, now);
    const open = await this.prisma.pilgrimAccountLink.findFirst({
      where: { tenantId, pilgrimId: pilgrim.id, status: { in: ['ACTIVE', 'INVITED'] } },
      select: { status: true },
    });
    if (open?.status === 'ACTIVE') {
      throw new ConflictException({
        code: 'LINK_ALREADY_ACTIVE',
        message: 'This traveler record is already linked to a traveler account. Revoke that link before inviting again.',
      });
    }
    if (open?.status === 'INVITED') {
      throw new ConflictException({
        code: 'INVITATION_PENDING',
        message: 'An invitation for this traveler record is still waiting for an answer. Resend it or revoke it.',
      });
    }

    const token = newInvitationToken();
    let link: LinkWithAccount;
    try {
      link = await this.prisma.pilgrimAccountLink.create({
        data: {
          tenantId,
          pilgrimId: pilgrim.id,
          invitedEmail,
          emailSource: entered && entered !== onRecord ? 'ENTERED' : 'RECORD',
          tokenHash: hashInvitationToken(token),
          invitedBy: actor.sub,
          invitedAt: now,
          lastSentAt: now,
          expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
        },
        include: { user: { select: ACCOUNT_SELECT } },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Another invitation or link was created for this record at the same moment.
        throw new ConflictException({
          code: 'INVITATION_PENDING',
          message: 'An invitation for this traveler record already exists. Refresh to see it.',
        });
      }
      throw err;
    }

    try {
      await this.sendInvitation(link, token, tenantId);
    } catch (err) {
      // The invitation never left: remove it rather than show staff a pending invitation nobody received.
      this.logger.warn(`Traveler invitation email failed: ${(err as Error).message}`);
      await this.prisma.pilgrimAccountLink.delete({ where: { id: link.id } }).catch(() => undefined);
      throw new ServiceUnavailableException('The invitation email could not be sent. Try again later.');
    }

    await this.record(actor, link, 'CREATE', 'INVITED', ctx, {
      invitedEmail,
      emailSource: link.emailSource,
      expiresAt: link.expiresAt.toISOString(),
    });
    return this.presentOne(tenantId, link);
  }

  // ── Resend ─────────────────────────────────────────────────────────────

  /**
   * Emails the invitation again with a NEW token (the previous link stops
   * working) and a fresh expiry. An expired invitation can be reopened this way
   * as long as the record has no other open invitation or active link.
   */
  async resend(actor: Principal, pilgrimId: string, linkId: string, ctx: RequestContext = {}) {
    const tenantId = actor.tenantId;
    await this.ownedPilgrim(tenantId, pilgrimId);
    const link = await this.ownedLink(tenantId, pilgrimId, linkId);
    const now = new Date();
    const status = effectiveLinkStatus(link, now);
    if (status !== 'INVITED' && status !== 'EXPIRED') {
      throw new ConflictException({
        code: 'INVITATION_NOT_PENDING',
        message: 'Only an unanswered or expired invitation can be resent.',
      });
    }
    if (now.getTime() - link.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new ConflictException({
        code: 'RESEND_TOO_SOON',
        message: 'This invitation was just sent. Wait a minute before sending it again.',
      });
    }
    this.assertMailAvailable();
    if (status === 'EXPIRED') {
      const other = await this.prisma.pilgrimAccountLink.findFirst({
        where: { tenantId, pilgrimId, id: { not: link.id }, status: { in: ['ACTIVE', 'INVITED'] } },
        select: { id: true },
      });
      if (other) {
        throw new ConflictException({
          code: 'INVITATION_NOT_PENDING',
          message: 'This traveler record already has a newer invitation or an active link.',
        });
      }
    }

    const token = newInvitationToken();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    const updated = await this.prisma.pilgrimAccountLink.updateMany({
      // Guarded on the values just read, so two concurrent resends cannot both win.
      where: { id: link.id, status: link.status, lastSentAt: link.lastSentAt },
      data: {
        status: 'INVITED',
        tokenHash: hashInvitationToken(token),
        expiresAt,
        lastSentAt: now,
        sendCount: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException({ code: 'INVITATION_CHANGED', message: 'This invitation just changed. Refresh and try again.' });
    }

    try {
      await this.sendInvitation({ invitedEmail: link.invitedEmail, expiresAt }, token, tenantId);
    } catch (err) {
      this.logger.warn(`Traveler invitation resend failed: ${(err as Error).message}`);
      // Let staff retry straight away; the token that was never delivered stays unusable to anyone.
      await this.prisma.pilgrimAccountLink
        .update({ where: { id: link.id }, data: { lastSentAt: link.lastSentAt } })
        .catch(() => undefined);
      throw new ServiceUnavailableException('The invitation email could not be sent. Try again later.');
    }

    await this.record(actor, link, 'UPDATE', 'INVITATION_RESENT', ctx, {
      previousStatus: status,
      sendCount: link.sendCount + 1,
      expiresAt: expiresAt.toISOString(),
    });
    return this.presentOne(tenantId, await this.ownedLink(tenantId, pilgrimId, link.id));
  }

  // ── Revoke ─────────────────────────────────────────────────────────────

  /** Withdraws an unanswered invitation or ends an active link. Takes effect on the traveler's next request. */
  async revoke(actor: Principal, pilgrimId: string, linkId: string, dto: RevokeAccountLinkDto, ctx: RequestContext = {}) {
    const tenantId = actor.tenantId;
    await this.ownedPilgrim(tenantId, pilgrimId);
    const link = await this.ownedLink(tenantId, pilgrimId, linkId);
    const status = effectiveLinkStatus(link);
    if (status !== 'INVITED' && status !== 'ACTIVE') {
      throw new ConflictException({
        code: 'LINK_NOT_REVOCABLE',
        message: 'This invitation or link has already ended.',
      });
    }
    const now = new Date();
    const updated = await this.prisma.pilgrimAccountLink.updateMany({
      where: { id: link.id, status: link.status },
      data: { status: 'REVOKED', revokedAt: now, revokedBy: actor.sub, revokedReason: dto.reason, tokenHash: null },
    });
    if (updated.count !== 1) {
      throw new ConflictException({ code: 'INVITATION_CHANGED', message: 'This link just changed. Refresh and try again.' });
    }
    await this.record(actor, link, 'PERMISSION_CHANGE', status === 'ACTIVE' ? 'LINK_REVOKED' : 'INVITATION_REVOKED', ctx, {
      previousStatus: status,
      reason: dto.reason,
      accountId: link.userId ?? null,
    });
    return this.presentOne(tenantId, await this.ownedLink(tenantId, pilgrimId, link.id));
  }
}
