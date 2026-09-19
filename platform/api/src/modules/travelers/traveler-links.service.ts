import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemScoped } from '../../prisma/db-context';
import { AuditService } from '../audit/audit.service';
import { COMMUNITY_TENANT_SLUG } from '../rbac/catalog';
import type { Principal } from '../auth/principal';
import type { RequestContext } from '../pilgrims/account-links/pilgrim-account-links.service';
import {
  displayName,
  hashInvitationToken,
  isWellFormedInvitationToken,
  normalizeEmail,
} from '../pilgrims/account-links/link-rules';

/** Organizations whose data may still be shown to a linked traveler. */
export const VISIBLE_ORGANIZATION: Prisma.TenantWhereInput = {
  deletedAt: null,
  status: { notIn: ['SUSPENDED', 'CHURNED'] },
};

/**
 * One message for every unusable token — unknown, malformed, expired, already
 * answered, withdrawn — so a token holder learns nothing about which it was.
 */
const invalidInvitation = () =>
  new NotFoundException({
    code: 'INVITATION_INVALID',
    message:
      'This invitation link is not valid. It may have expired, been used already or been withdrawn. ' +
      'Ask your travel organizer to send a new one.',
  });

export interface InvitationPreview {
  organization: { name: string };
  traveler: { name: string };
  expiresAt: Date;
}

export interface TravelerLinkView {
  id: string;
  linkedAt: Date | null;
  organization: { name: string };
  traveler: { name: string };
}

/**
 * Traveler side of the traveler ↔ pilgrim link (P06, D-022).
 *
 * An invitation can only be previewed, accepted or declined by a signed-in
 * traveler account whose verified email is exactly the invited address. The
 * link's organization and pilgrim always come from the invitation row, never
 * from the request, so a token can never be pointed at other data.
 */
// R05: a traveler (community organization) reads and answers link rows held by the
// OPERATOR organization, so the public methods are system-scoped; every query stays
// pinned to the token hash / the caller's user id exactly as before.
@Injectable()
export class TravelerLinksService {
  private communityId?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async communityTenantId(): Promise<string | null> {
    if (this.communityId) return this.communityId;
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: COMMUNITY_TENANT_SLUG }, select: { id: true } });
    if (tenant) this.communityId = tenant.id;
    return tenant?.id ?? null;
  }

  /** Validates the token AND the signed-in account against it. Consumes nothing. */
  private async resolveInvitation(principal: Principal, token: unknown, now: Date) {
    if (!isWellFormedInvitationToken(token)) throw invalidInvitation();
    const tokenHash = hashInvitationToken(token);
    const link = await this.prisma.pilgrimAccountLink.findUnique({
      where: { tokenHash },
      include: { pilgrim: { select: { id: true, tenantId: true, firstNameEn: true, lastNameEn: true, deletedAt: true } } },
    });
    if (!link || link.status !== 'INVITED') throw invalidInvitation();
    if (link.expiresAt.getTime() <= now.getTime()) {
      await this.prisma.pilgrimAccountLink.updateMany({
        where: { id: link.id, status: 'INVITED', tokenHash },
        data: { status: 'EXPIRED', tokenHash: null },
      });
      throw invalidInvitation();
    }
    // Defence in depth: the record must still exist inside the inviting organization.
    if (link.pilgrim.deletedAt || link.pilgrim.tenantId !== link.tenantId) throw invalidInvitation();
    const organization = await this.prisma.tenant.findFirst({
      where: { id: link.tenantId, ...VISIBLE_ORGANIZATION },
      select: { name: true },
    });
    if (!organization) throw invalidInvitation();

    // Only traveler accounts (the community organization, D-007) follow trips.
    const communityId = await this.communityTenantId();
    if (!communityId || principal.tenantId !== communityId) {
      throw new ForbiddenException({
        code: 'TRAVELER_ACCOUNT_REQUIRED',
        message: 'Sign in with your traveler account to answer this invitation.',
      });
    }
    const account = await this.prisma.user.findUnique({
      where: { id: principal.sub },
      select: { email: true, emailVerifiedAt: true },
    });
    if (!account || normalizeEmail(account.email) !== link.invitedEmail) {
      throw new ForbiddenException({
        code: 'INVITATION_EMAIL_MISMATCH',
        message:
          'This invitation was sent to a different email address. Sign in with the account that uses the ' +
          'address the invitation was sent to.',
      });
    }
    if (!account.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Verify your email address first, then open the invitation link again.',
      });
    }
    return { link, tokenHash, organization };
  }

  private async record(
    principal: Principal,
    link: { id: string; tenantId: string; pilgrimId: string },
    action: 'UPDATE' | 'PERMISSION_CHANGE',
    event: string,
    ctx: RequestContext,
  ) {
    // Logged against the inviting organization, so its audit trail shows the traveler's answer.
    await this.audit.log({
      tenantId: link.tenantId,
      actorId: principal.sub,
      actorEmail: principal.email ?? undefined,
      action,
      namespace: 'crm',
      resource: 'pilgrim_account_link',
      resourceId: link.id,
      metadata: { event, pilgrimId: link.pilgrimId, travelerTenantId: principal.tenantId },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  }

  @SystemScoped('travelers.linked-records')
  async preview(principal: Principal, token: unknown): Promise<InvitationPreview> {
    const { link, organization } = await this.resolveInvitation(principal, token, new Date());
    return {
      organization: { name: organization.name },
      traveler: { name: displayName(link.pilgrim.firstNameEn, link.pilgrim.lastNameEn) },
      expiresAt: link.expiresAt,
    };
  }

  @SystemScoped('travelers.linked-records')
  async accept(principal: Principal, token: unknown, ctx: RequestContext = {}): Promise<TravelerLinkView> {
    const now = new Date();
    const { link, tokenHash, organization } = await this.resolveInvitation(principal, token, now);
    let claimed: Prisma.BatchPayload;
    try {
      // Single use: only the request that flips INVITED → ACTIVE for this exact token wins.
      claimed = await this.prisma.pilgrimAccountLink.updateMany({
        where: { id: link.id, status: 'INVITED', tokenHash, expiresAt: { gt: now } },
        data: { status: 'ACTIVE', userId: principal.sub, acceptedAt: now, tokenHash: null },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'LINK_ALREADY_ACTIVE',
          message: 'This traveler record is already linked to an account.',
        });
      }
      throw err;
    }
    if (claimed.count !== 1) throw invalidInvitation();
    await this.record(principal, link, 'PERMISSION_CHANGE', 'LINK_ACCEPTED', ctx);
    return {
      id: link.id,
      linkedAt: now,
      organization: { name: organization.name },
      traveler: { name: displayName(link.pilgrim.firstNameEn, link.pilgrim.lastNameEn) },
    };
  }

  @SystemScoped('travelers.linked-records')
  async decline(principal: Principal, token: unknown, ctx: RequestContext = {}) {
    const now = new Date();
    const { link, tokenHash } = await this.resolveInvitation(principal, token, now);
    const answered = await this.prisma.pilgrimAccountLink.updateMany({
      where: { id: link.id, status: 'INVITED', tokenHash },
      data: { status: 'DECLINED', declinedAt: now, tokenHash: null },
    });
    if (answered.count !== 1) throw invalidInvitation();
    await this.record(principal, link, 'UPDATE', 'INVITATION_DECLINED', ctx);
    return { declined: true };
  }

  /** The caller's active links whose record and organization are still visible. */
  @SystemScoped('travelers.linked-records')
  async activeLinks(principal: Principal) {
    const links = await this.prisma.pilgrimAccountLink.findMany({
      where: { userId: principal.sub, status: 'ACTIVE', pilgrim: { deletedAt: null } },
      include: { pilgrim: { select: { id: true, tenantId: true, firstNameEn: true, lastNameEn: true, status: true } } },
      orderBy: { acceptedAt: 'desc' },
      take: 50,
    });
    const scoped = links.filter((l) => l.pilgrim.tenantId === l.tenantId);
    const tenantIds = [...new Set(scoped.map((l) => l.tenantId))];
    const organizations = tenantIds.length
      ? await this.prisma.tenant.findMany({
          where: { id: { in: tenantIds }, ...VISIBLE_ORGANIZATION },
          select: { id: true, name: true },
        })
      : [];
    const names = new Map(organizations.map((o) => [o.id, o.name]));
    return scoped
      .filter((l) => names.has(l.tenantId))
      .map((l) => ({ link: l, organizationName: names.get(l.tenantId)! }));
  }

  @SystemScoped('travelers.linked-records')
  async listMine(principal: Principal): Promise<TravelerLinkView[]> {
    return (await this.activeLinks(principal)).map(({ link, organizationName }) => ({
      id: link.id,
      linkedAt: link.acceptedAt,
      organization: { name: organizationName },
      traveler: { name: displayName(link.pilgrim.firstNameEn, link.pilgrim.lastNameEn) },
    }));
  }

  @SystemScoped('travelers.linked-records')
  async unlink(principal: Principal, linkId: string, ctx: RequestContext = {}) {
    const link = await this.prisma.pilgrimAccountLink.findFirst({
      where: { id: linkId, userId: principal.sub, status: 'ACTIVE' },
      select: { id: true, tenantId: true, pilgrimId: true },
    });
    if (!link) throw new NotFoundException('Link not found');
    const ended = await this.prisma.pilgrimAccountLink.updateMany({
      where: { id: link.id, userId: principal.sub, status: 'ACTIVE' },
      data: { status: 'UNLINKED', unlinkedAt: new Date() },
    });
    if (ended.count !== 1) throw new NotFoundException('Link not found');
    await this.record(principal, link, 'PERMISSION_CHANGE', 'LINK_ENDED_BY_TRAVELER', ctx);
    return { id: link.id, status: 'UNLINKED' as const };
  }
}
