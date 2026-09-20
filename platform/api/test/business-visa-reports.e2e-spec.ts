import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestApp, TestContext } from './app';
import { Actor, bearer, buildWorld, World } from './fixtures';
import { RbacService } from '../src/modules/rbac/rbac.service';

/**
 * Visa cases, visa service tickets and organization reports: explicit
 * submit/approve/reject actions with their required fields, attributable
 * document decisions, the ticket lifecycle, and reports split between the
 * operational grant (reporting:report:read) and money (finance:report:read).
 */

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(128, 0x20)]);

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

describe('business workflows: visa cases, service tickets and reports', () => {
  let ctx: TestContext;
  let w: World;

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
  });
  afterAll(async () => ctx?.close());

  const call = (a: Actor, method: Method, path: string, body?: Record<string, unknown>) => {
    const req = ctx.http()[method](api(path)).set(bearer(a));
    return body !== undefined ? req.send(body) : req;
  };
  const expectStatus = async (a: Actor, method: Method, path: string, body: Record<string, unknown> | undefined, status: number) => {
    const res = await call(a, method, path, body);
    expect(res.status, `${a.email} ${method.toUpperCase()} ${path} → ${res.status} ${JSON.stringify(res.body?.error ?? '')}`).toBe(status);
    return res.body?.data ?? res.body;
  };
  const ok = async (a: Actor, method: Method, path: string, body?: Record<string, unknown>) => {
    const res = await call(a, method, path, body);
    if (res.status >= 300) throw new Error(`${a.email} ${method.toUpperCase()} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
    return res.body?.data ?? res.body;
  };
  const errorOf = async (a: Actor, method: Method, path: string, body: Record<string, unknown> | undefined, status: number) => {
    const res = await call(a, method, path, body);
    expect(res.status, `${method.toUpperCase()} ${path} → ${res.status} ${JSON.stringify(res.body?.error ?? '')}`).toBe(status);
    const m = res.body?.error?.message;
    return Array.isArray(m) ? m.join(' ') : String(m ?? '');
  };
  const upload = (a: Actor, visaId: string, docId: string) =>
    ctx.http().post(api(`/compliance/visas/${visaId}/documents/${docId}/versions`)).set(bearer(a)).attach('file', PDF, 'scan.pdf');

  // ────────────────────────────────────────────────────────────────────────
  describe('visa agency cases', () => {
    let v: any; let doc: any;

    it('an application needs an applicant; payment state is server-owned', async () => {
      await expectStatus(w.visaA, 'post', '/compliance/visas', {}, 400);
      // F13: no payment is linked to visa applications, so a payment status is neither accepted nor shown.
      expect(await errorOf(w.visaA, 'post', '/compliance/visas', { applicantName: 'X', paymentStatus: 'PAID' }, 400)).toMatch(/paymentStatus should not exist/);
      v = await expectStatus(w.visaA, 'post', '/compliance/visas', { applicantName: 'Aisha Rahman', visaType: 'UMRAH', price: 350 }, 201);
      expect([v.status, 'paymentStatus' in v, v.priceCents]).toEqual(['NOT_STARTED', false, 35000]);
      expect(v.allowedTransitions).toEqual(['DOCUMENTS_COLLECTING', 'SUBMITTED', 'CANCELLED']);
    });

    it('submitting checks readiness: identity fields and documents', async () => {
      expect(await errorOf(w.visaA, 'put', `/compliance/visas/${v.id}/submit`, undefined, 400)).toMatch(/passport number.*nationality/);
      await expectStatus(w.visaA, 'put', `/compliance/visas/${v.id}`, { applicantPassport: 'P1234567', applicantNationality: 'id' }, 200);
      doc = await expectStatus(w.visaA, 'post', `/compliance/visas/${v.id}/documents`, { name: 'Passport bio page', type: 'PASSPORT' }, 201);
      expect(await errorOf(w.visaA, 'put', `/compliance/visas/${v.id}/submit`, undefined, 400)).toMatch(/Passport bio page \(missing\)/);
      expect((await upload(w.visaA, v.id, doc.id)).status).toBe(201);
      const submitted = await expectStatus(w.visaA, 'put', `/compliance/visas/${v.id}/submit`, undefined, 200);
      expect(submitted.status).toBe('SUBMITTED');
      expect(submitted.submittedAt).toBeTruthy();
      expect(submitted.allowedTransitions).toContain('APPROVED');
    });

    it('decisions need their own action and their required fields', async () => {
      expect(await errorOf(w.visaA, 'put', `/compliance/visas/${v.id}`, { status: 'APPROVED' }, 400)).toMatch(/approve or reject action/);
      await expectStatus(w.visaA, 'put', `/compliance/visas/${v.id}`, { submittedAt: new Date().toISOString() }, 400);
      await expectStatus(w.visaA, 'put', `/compliance/visas/${v.id}`, { rejectionReason: 'sneaky' }, 400);
      expect(await errorOf(w.visaA, 'put', `/compliance/visas/${v.id}/approve`, {}, 400)).toMatch(/visa number/);
      await expectStatus(w.visaA, 'put', `/compliance/visas/${v.id}/reject`, { reason: 'no' }, 400);
      expect((await ctx.prisma.visaApplication.findUniqueOrThrow({ where: { id: v.id } })).status).toBe('SUBMITTED');

      const approved = await expectStatus(w.visaA, 'put', `/compliance/visas/${v.id}/approve`, { visaNumber: 'V-2026-0001' }, 200);
      expect([approved.status, approved.externalRef]).toEqual(['APPROVED', 'V-2026-0001']);
      await expectStatus(w.visaA, 'put', `/compliance/visas/${v.id}/approve`, { visaNumber: 'V-2' }, 409);
      await expectStatus(w.visaA, 'put', `/compliance/visas/${v.id}/reject`, { reason: 'Changed our mind' }, 409);
      const row = await ctx.prisma.visaApplication.findUniqueOrThrow({ where: { id: v.id } });
      expect([row.status, row.externalRef]).toEqual(['APPROVED', 'V-2026-0001']);
      const events = (row.timeline as any[]).map((e) => e.event);
      expect(events).toEqual(['CREATED', 'STATUS_SUBMITTED', 'STATUS_APPROVED']);

      await expectStatus(w.visaA, 'put', `/compliance/visas/${v.id}`, { status: 'EXPIRED' }, 200);
      await expectStatus(w.visaA, 'put', `/compliance/visas/${v.id}`, { applicantName: 'Changed' }, 409);
      await expectStatus(w.visaA, 'put', `/compliance/visas/${v.id}`, { notes: 'Archived with the regulator' }, 200);
      expect((await ctx.prisma.visaApplication.findUniqueOrThrow({ where: { id: v.id } })).applicantName).toBe('Aisha Rahman');
    });

    it('document decisions are attributable and files only arrive as versions', async () => {
      const case2 = await ok(w.visaA, 'post', '/compliance/visas', { applicantName: 'Bilal Chaudhry' });
      await expectStatus(w.visaA, 'post', `/compliance/visas/${case2.id}/documents`, { name: 'Photo', status: 'VERIFIED' }, 400);
      const photo = await ok(w.visaA, 'post', `/compliance/visas/${case2.id}/documents`, { name: 'Photo', type: 'PHOTO' });
      await expectStatus(w.visaA, 'put', `/compliance/visas/${case2.id}/documents/${photo.id}/verify`, undefined, 400);
      expect((await upload(w.visaA, case2.id, photo.id)).status).toBe(201);
      await expectStatus(w.visaA, 'put', `/compliance/visas/${case2.id}/documents/${photo.id}/verify`, undefined, 200);
      await expectStatus(w.visaA, 'put', `/compliance/visas/${case2.id}/documents/${photo.id}`, { url: 'https://example.com/other.pdf' }, 400);
      await expectStatus(w.visaA, 'put', `/compliance/visas/${case2.id}/documents/${photo.id}`, { status: 'RECEIVED' }, 400);
      const row = await ctx.prisma.visaDocument.findUniqueOrThrow({ where: { id: photo.id } });
      expect([row.status, row.version]).toEqual(['VERIFIED', 1]);
      // Agency B cannot decide agency A's case.
      await expectStatus(w.visaB, 'put', `/compliance/visas/${case2.id}/approve`, { visaNumber: 'B-1' }, 404);
      await expectStatus(w.visaB, 'put', `/compliance/visas/${case2.id}/documents/${photo.id}/reject`, { reason: 'Not yours' }, 404);
      expect((await ctx.prisma.visaApplication.findUniqueOrThrow({ where: { id: case2.id } })).status).toBe('NOT_STARTED');
      expect((await ctx.prisma.visaDocument.findUniqueOrThrow({ where: { id: photo.id } })).status).toBe('VERIFIED');
    });
  });

  describe('operator visa desk', () => {
    it('staff submit cases and manage documents but do not decide', async () => {
      const c = await expectStatus(w.staffA, 'post', '/compliance/visas',
        { applicantName: 'Staff case', applicantPassport: 'X1234567', applicantNationality: 'PK', visaType: 'UMRAH' }, 201);
      const d = await ok(w.staffA, 'post', `/compliance/visas/${c.id}/documents`, { name: 'Passport', type: 'PASSPORT' });
      expect((await upload(w.staffA, c.id, d.id)).status).toBe(201);
      await expectStatus(w.staffA, 'put', `/compliance/visas/${c.id}/documents/${d.id}/verify`, undefined, 403);
      await expectStatus(w.opA, 'put', `/compliance/visas/${c.id}/documents/${d.id}/verify`, undefined, 200);
      await expectStatus(w.staffA, 'delete', `/compliance/visas/${c.id}/documents/${d.id}`, undefined, 403);
      await expectStatus(w.staffA, 'put', `/compliance/visas/${c.id}/submit`, undefined, 200);
      await expectStatus(w.staffA, 'put', `/compliance/visas/${c.id}/approve`, { visaNumber: 'S-1' }, 403);
      await expectStatus(w.staffA, 'put', `/compliance/visas/${c.id}`, { externalRef: 'S-1' }, 403);
      const row = await ctx.prisma.visaApplication.findUniqueOrThrow({ where: { id: c.id } });
      expect([row.status, row.externalRef]).toEqual(['SUBMITTED', null]);
      expect(await ctx.prisma.visaDocument.count({ where: { id: d.id } })).toBe(1);
      await expectStatus(w.opA, 'delete', `/compliance/visas/${c.id}/documents/${d.id}`, undefined, 200);
    });

    it('a cancelled application is closed', async () => {
      const c = await ok(w.opA, 'post', '/compliance/visas', { applicantName: 'Withdrawn case' });
      const cancelled = await expectStatus(w.opA, 'delete', `/compliance/visas/${c.id}`, undefined, 200);
      expect(cancelled.status).toBe('CANCELLED');
      await expectStatus(w.opA, 'delete', `/compliance/visas/${c.id}`, undefined, 409);
      await expectStatus(w.opA, 'post', `/compliance/visas/${c.id}/documents`, { name: 'Late document' }, 409);
      await expectStatus(w.opA, 'get', '/compliance/visas?status=NOPE', undefined, 400);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('visa service tickets', () => {
    it('resolved tickets come back through reopen; closed tickets are read-only', async () => {
      await expectStatus(w.visaA, 'post', '/visa-requests', { subject: 'Passport re-scan', requesterEmail: 'not-an-email' }, 400);
      const t = await expectStatus(w.visaA, 'post', '/visa-requests', { subject: 'Passport re-scan needed', requesterEmail: 'fatima@example.com' }, 201);
      await expectStatus(w.visaA, 'put', `/visa-requests/${t.id}/resolve`, { resolution: 'Re-scanned and uploaded' }, 200);
      expect(await errorOf(w.visaA, 'put', `/visa-requests/${t.id}/status`, { status: 'IN_PROGRESS' }, 400)).toMatch(/reopen/);
      const reopened = await expectStatus(w.visaA, 'put', `/visa-requests/${t.id}/reopen`, { reason: 'Customer says it is blurry' }, 200);
      expect([reopened.status, reopened.reopenCount]).toEqual(['OPEN', 1]);
      await expectStatus(w.visaA, 'put', `/visa-requests/${t.id}/close`, {}, 200);
      await expectStatus(w.visaA, 'post', `/visa-requests/${t.id}/notes`, { body: 'After closing' }, 400);
      await expectStatus(w.visaA, 'patch', `/visa-requests/${t.id}`, { subject: 'Rewritten subject' }, 400);
      const row = await ctx.prisma.visaServiceRequest.findUniqueOrThrow({ where: { id: t.id } });
      expect([row.status, row.subject]).toEqual(['CLOSED', 'Passport re-scan needed']);
      expect(await ctx.prisma.visaServiceRequestNote.count({ where: { requestId: t.id } })).toBe(0);
    });

    it('only people who can open visa work are assignable; staff cannot assign or close', async () => {
      // A dedicated finance-only colleague (shared fixtures may gain roles in other suites).
      const financeOnly = await ctx.prisma.user.create({
        data: { tenantId: w.tenants.opA, email: `finance-only.${uniq()}@op-a.test`, firstName: 'Finance', lastName: 'Only', status: 'ACTIVE' },
      });
      await ctx.app.get(RbacService).grantSystemRole(financeOnly.id, 'FINANCE_MANAGER');
      const t = await ok(w.opA, 'post', '/visa-requests', { subject: 'Operator desk ticket' });
      const assignees = await expectStatus(w.opA, 'get', '/visa-requests/assignees', undefined, 200);
      const ids = assignees.map((a: any) => a.id);
      expect(ids).toContain(w.staffA.id);
      expect(ids).not.toContain(financeOnly.id);
      expect(await errorOf(w.opA, 'put', `/visa-requests/${t.id}/assign`, { assigneeId: financeOnly.id }, 400)).toMatch(/visa/);
      await expectStatus(w.staffA, 'put', `/visa-requests/${t.id}/assign`, { assigneeId: w.staffA.id }, 403);
      await expectStatus(w.staffA, 'post', '/visa-requests', { subject: 'Staff ticket with assignee', assigneeId: w.staffA.id }, 403);
      expect(await ctx.prisma.visaServiceRequest.count({ where: { subject: 'Staff ticket with assignee' } })).toBe(0);
      await expectStatus(w.staffA, 'put', `/visa-requests/${t.id}/close`, {}, 403);
      const assigned = await expectStatus(w.opA, 'put', `/visa-requests/${t.id}/assign`, { assigneeId: w.staffA.id }, 200);
      expect(assigned.assigneeId).toBe(w.staffA.id);
      await expectStatus(w.staffA, 'post', `/visa-requests/${t.id}/notes`, { body: 'On it', visibility: 'INTERNAL' }, 201);
      await expectStatus(w.staffA, 'patch', `/visa-requests/${t.id}`, { dueAt: null }, 200);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('reports', () => {
    const OPERATIONAL = ['/reports/overview', '/reports/pilgrims', '/reports/bookings', '/reports/hotels', '/reports/visa', '/reports/transport'];

    it('operator staff and visa officers read operational reports without money figures', async () => {
      for (const a of [w.staffA, w.visaA]) {
        for (const path of OPERATIONAL) await expectStatus(a, 'get', path, undefined, 200);
        const overview = await ok(a, 'get', '/reports/overview');
        expect([overview.financeIncluded, overview.revenuePaidCents, overview.revenueOutstandingCents]).toEqual([false, null, null]);
        await expectStatus(a, 'get', '/reports/finance', undefined, 403);
        await expectStatus(a, 'get', '/reports/export', undefined, 403);
      }
    });

    it('finance readers see money figures; exporters get a CSV of what they may read', async () => {
      const overview = await ok(w.financeA, 'get', '/reports/overview');
      expect(overview.financeIncluded).toBe(true);
      expect(typeof overview.revenuePaidCents).toBe('number');
      await expectStatus(w.financeA, 'get', '/reports/finance', undefined, 200);
      const csv = await ctx.http().get(api('/reports/export')).set(bearer(w.financeA));
      expect(csv.status).toBe(200);
      expect(csv.headers['content-type']).toMatch(/text\/csv/);
      expect(csv.headers['content-disposition']).toMatch(/attachment/);
      expect(csv.text).toContain('"Finance"');
      expect(csv.text).toContain('"Transport"');

      // Hotel managers read money but hold no export grant.
      expect((await ok(w.hotelA, 'get', '/reports/overview')).financeIncluded).toBe(true);
      await expectStatus(w.hotelA, 'get', '/reports/export', undefined, 403);
      for (const path of [...OPERATIONAL, '/reports/finance', '/reports/export']) {
        await expectStatus(w.travelerA, 'get', path, undefined, 403);
      }
    });

    it('figures are the caller\'s own organization only', async () => {
      const before = (await ok(w.opB, 'get', '/reports/overview')).totalPilgrims;
      await ok(w.opA, 'post', '/pilgrims', { firstName: 'Report', lastName: 'Probe', passportNumber: `RP${uniq()}` });
      expect((await ok(w.opB, 'get', '/reports/overview')).totalPilgrims).toBe(before);
      const mine = await ok(w.opA, 'get', '/reports/pilgrims');
      expect(mine.total).toBe(await ctx.prisma.pilgrim.count({ where: { tenantId: w.tenants.opA, deletedAt: null } }));
    });
  });
});
