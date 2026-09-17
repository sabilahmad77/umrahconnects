import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestApp, TestContext } from './app';
import { Actor, bearer, buildWorld, World } from './fixtures';

/**
 * Red-team isolation suite. Owners create real records through the API; attackers
 * (another organization, another traveler, another role) try to read, change,
 * delete or link them. Every refusal must look like "not found" (or 403 where a
 * capability is missing) and the victim's data must be unchanged afterwards.
 */

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(128, 0x20)]);
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Attempt = [Method, string, Record<string, unknown>?];

describe('red team: tenant isolation, vertical access and mass assignment', () => {
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
  /** Performs a request that must succeed and returns its payload. */
  const ok = async (a: Actor, method: Method, path: string, body?: Record<string, unknown>) => {
    const res = await call(a, method, path, body);
    if (res.status >= 300) throw new Error(`${a.email} ${method.toUpperCase()} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
    return res.body?.data ?? res.body;
  };
  /** Every attempt must be answered with one of `allowed`. */
  const refused = async (a: Actor, attempts: Attempt[], allowed: number[] = [404]) => {
    for (const [method, path, body] of attempts) {
      const res = await call(a, method, path, body ?? (method === 'get' || method === 'delete' ? undefined : {}));
      expect(allowed, `${a.email} ${method.toUpperCase()} ${path} → ${res.status} ${JSON.stringify(res.body?.error ?? '')}`).toContain(res.status);
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  describe('operator A vs operator B', () => {
    let pA: any; let pB: any; let pkgA: any; let pkgB: any; let bookA: any; let bookB: any;

    beforeAll(async () => {
      pA = await ok(w.opA, 'post', '/pilgrims', { firstName: 'Amina', lastName: 'A', passportNumber: `PA${uniq()}` });
      pB = await ok(w.opB, 'post', '/pilgrims', { firstName: 'Bilal', lastName: 'B', passportNumber: `PB${uniq()}` });
      pkgA = await ok(w.opA, 'post', '/packages', { name: `Pkg A ${uniq()}`, type: 'UMRAH', priceAdult: 1000 });
      pkgB = await ok(w.opB, 'post', '/packages', { name: `Pkg B ${uniq()}`, type: 'UMRAH', priceAdult: 2000 });
      bookA = await ok(w.opA, 'post', '/bookings', { packageId: pkgA.id, pilgrimIds: [pA.id] });
      bookB = await ok(w.opB, 'post', '/bookings', { packageId: pkgB.id, pilgrimIds: [pB.id] });
    });

    it('pilgrims: B cannot read, change, delete or re-link A\'s pilgrim', async () => {
      await refused(w.opB, [
        ['get', `/pilgrims/${pA.id}`],
        ['put', `/pilgrims/${pA.id}`, { firstName: 'Hacked' }],
        ['delete', `/pilgrims/${pA.id}`],
        ['post', `/pilgrims/${pA.id}/documents`, { type: 'PASSPORT', fileUrl: 'https://x.test/p.pdf', fileName: 'p.pdf' }],
        ['put', `/pilgrims/${pA.id}/family-group`, { familyGroupId: null }],
        ['post', `/pilgrims/${pA.id}/bookings`, { bookingId: bookB.id }],
        ['post', `/pilgrims/${pB.id}/bookings`, { bookingId: bookA.id }],
      ]);
      const list = await ok(w.opB, 'get', '/pilgrims?limit=100');
      expect(list.items.map((p: any) => p.id)).not.toContain(pA.id);
      const row = await ctx.prisma.pilgrim.findUniqueOrThrow({ where: { id: pA.id } });
      expect(row.firstNameEn).toBe('Amina');
      expect(row.deletedAt).toBeNull();
      expect(await ctx.prisma.pilgrimDocument.count({ where: { pilgrimId: pA.id } })).toBe(0);
      expect(await ctx.prisma.bookingPilgrim.count({ where: { pilgrimId: pB.id, bookingId: bookA.id } })).toBe(0);
    });

    it('packages: B cannot read or change A\'s package', async () => {
      await refused(w.opB, [
        ['get', `/packages/${pkgA.id}`],
        ['put', `/packages/${pkgA.id}`, { name: 'Hacked', priceAdult: 1 }],
      ]);
      const row = await ctx.prisma.package.findUniqueOrThrow({ where: { id: pkgA.id } });
      expect(row.name).toBe(pkgA.name);
      expect(Number(row.basePriceCents)).toBe(100_000);
    });

    it('bookings: B cannot touch A\'s booking; A cannot link B\'s package or pilgrim', async () => {
      const before = await ctx.prisma.booking.findUniqueOrThrow({ where: { id: bookA.id } });
      await refused(w.opB, [
        ['get', `/bookings/${bookA.id}`],
        ['put', `/bookings/${bookA.id}`, { notes: 'x' }],
        ['put', `/bookings/${bookA.id}/status`, { status: 'CANCELLED' }],
        ['put', `/bookings/${bookA.id}/payment`, { paidAmountCents: 1 }],
        ['put', `/bookings/${bookA.id}/assign-package`, { packageId: pkgB.id }],
        ['put', `/bookings/${bookA.id}/assign-group`, { groupId: null }],
        ['post', `/bookings/${bookA.id}/cancel`, { reason: 'x' }],
        ['post', `/bookings/${bookA.id}/generate-invoice`],
        ['post', `/bookings/${bookA.id}/pilgrims`, { pilgrimId: pB.id }],
        ['delete', `/bookings/${bookA.id}/pilgrims/${pA.id}`],
      ]);
      await refused(w.opA, [
        ['post', `/bookings/${bookA.id}/pilgrims`, { pilgrimId: pB.id }],
        ['put', `/bookings/${bookA.id}/assign-package`, { packageId: pkgB.id }],
        ['post', '/bookings', { packageId: pkgB.id }],
        ['post', '/bookings', { pilgrimIds: [pB.id] }],
        ['post', '/bookings', { leadPilgrimId: pB.id }],
        ['post', '/bookings', { pilgrimId: pB.id }],
        ['post', '/bookings', { pilgrims: [{ pilgrimId: pB.id }] }],
      ]);
      const after = await ctx.prisma.booking.findUniqueOrThrow({ where: { id: bookA.id }, include: { pilgrims: true } });
      expect(after.status).toBe(before.status);
      expect(after.packageId).toBe(pkgA.id);
      expect(after.paidAmountCents).toBe(before.paidAmountCents);
      expect(after.pilgrims.map((p) => p.pilgrimId)).toEqual([pA.id]);
      expect(await ctx.prisma.invoice.count({ where: { bookingId: bookA.id } })).toBe(0);
      expect(await ctx.prisma.booking.count({ where: { tenantId: w.tenants.opA, packageId: pkgB.id } })).toBe(0);
    });

    describe('finance', () => {
      let invA: any; let payA: any;
      beforeAll(async () => {
        invA = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: 'Amina', subtotal: 500, bookingId: bookA.id, pilgrimId: pA.id });
        await ok(w.opA, 'put', `/finance/invoices/${invA.id}/issue`);
        payA = await ok(w.opA, 'post', `/finance/invoices/${invA.id}/payments`, { amount: 100, method: 'cash' });
      });

      it('invoices: B cannot read or change A\'s invoice; A cannot link B\'s booking or pilgrim', async () => {
        await refused(w.opB, [
          ['get', `/finance/invoices/${invA.id}`],
          ['put', `/finance/invoices/${invA.id}`, { notes: 'x' }],
          ['put', `/finance/invoices/${invA.id}/status`, { status: 'VOID' }],
          ['put', `/finance/invoices/${invA.id}/issue`],
          ['put', `/finance/invoices/${invA.id}/void`],
          ['delete', `/finance/invoices/${invA.id}`],
          ['post', `/finance/invoices/${invA.id}/payments`, { amount: 400 }],
        ]);
        await refused(w.opA, [
          ['post', '/finance/invoices', { issuedToName: 'X', subtotal: 1, bookingId: bookB.id }],
          ['post', '/finance/invoices', { issuedToName: 'X', subtotal: 1, pilgrimId: pB.id }],
          ['put', `/finance/invoices/${invA.id}`, { bookingId: bookB.id }],
          ['put', `/finance/invoices/${invA.id}`, { pilgrimId: pB.id }],
        ]);
        const row = await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: invA.id } });
        expect(row.status).toBe('PARTIALLY_PAID');
        expect(Number(row.paidCents)).toBe(10_000);
        expect(row.bookingId).toBe(bookA.id);
        expect(row.pilgrimId).toBe(pA.id);
        const listB = await ok(w.opB, 'get', '/finance/invoices?limit=100');
        expect(JSON.stringify(listB)).not.toContain(invA.id);
      });

      it('manual payments: B cannot read, edit or refund A\'s payment', async () => {
        await refused(w.opB, [
          ['get', `/finance/payments/${payA.id}`],
          ['put', `/finance/payments/${payA.id}`, { status: 'FAILED' }],
          ['post', `/finance/payments/${payA.id}/refund`, { amount: 100 }],
          ['get', `/payments/${payA.id}`],
          ['get', `/payments/${payA.id}/transactions`],
          ['post', `/payments/${payA.id}/refund`, { amount: 1 }],
        ]);
        const row = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payA.id } });
        expect(row.status).toBe('COMPLETED');
        expect(Number(row.refundedCents)).toBe(0);
      });

      it('invoice status cannot be forced to PAID without payments (status route)', async () => {
        const inv = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: 'Force', subtotal: 50 });
        const res = await call(w.opA, 'put', `/finance/invoices/${inv.id}/status`, { status: 'PAID' });
        expect(res.status).toBe(400);
        const row = await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
        expect(row.status).toBe('DRAFT');
        expect(Number(row.paidCents)).toBe(0);
        // A voided invoice cannot be resurrected or paid.
        await ok(w.opA, 'put', `/finance/invoices/${inv.id}/void`);
        expect((await call(w.opA, 'put', `/finance/invoices/${inv.id}/issue`)).status).toBe(400);
        expect((await call(w.opA, 'post', `/finance/invoices/${inv.id}/payments`, { amount: 10 })).status).toBe(400);
        expect((await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('VOID');
      });

      it('manual payments cannot be recorded as gateway payments or in another currency', async () => {
        const before = await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: invA.id } });
        expect((await call(w.opA, 'post', `/finance/invoices/${invA.id}/payments`, { amount: 1, method: 'sandbox' })).status).toBe(400);
        expect((await call(w.opA, 'post', `/finance/invoices/${invA.id}/payments`, { amount: 1, gateway: 'stripe' })).status).toBe(400);
        expect((await call(w.opA, 'post', `/finance/invoices/${invA.id}/payments`, { amount: 1, currency: 'USD' })).status).toBe(400);
        const after = await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: invA.id } });
        expect(after.paidCents).toBe(before.paidCents);
      });
    });

    describe('groups', () => {
      let gA: any; let gPriv: any; let noteA: any; let docA: any; let incA: any; let postA: any;
      beforeAll(async () => {
        gA = await ok(w.opA, 'post', '/groups', { name: `Public A ${uniq()}`, visibility: 'PUBLIC', notes: 'secret briefing' });
        gPriv = await ok(w.opA, 'post', '/groups', { name: `Private A ${uniq()}` });
        noteA = await ok(w.opA, 'post', `/groups/${gA.id}/notes`, { title: 'Ops note', body: 'internal' });
        docA = await ok(w.opA, 'post', `/groups/${gA.id}/documents`, { name: 'Roster', url: 'https://files.test/roster.pdf' });
        incA = await ok(w.opA, 'post', `/groups/${gA.id}/incidents`, { type: 'MEDICAL', description: 'fainted', pilgrimId: pA.id });
        postA = await ok(w.opA, 'post', `/groups/${gA.id}/posts`, { body: 'Welcome' });
      });

      it('a PUBLIC group is readable through the public projection only', async () => {
        const seen = await ok(w.opB, 'get', `/groups/${gA.id}`);
        expect(seen.id).toBe(gA.id);
        for (const k of ['briefingNotes', 'emergencyContact', 'itinerary', 'leadGuideId', 'createdBy', 'tenantId']) {
          expect(seen, k).not.toHaveProperty(k);
        }
        expect((await call(w.opB, 'get', `/groups/${gPriv.id}`)).status).toBe(404);
      });

      it('B cannot write to A\'s PUBLIC group, its notes, documents, incidents or posts', async () => {
        await refused(w.opB, [
          ['put', `/groups/${gA.id}`, { name: 'Hacked', visibility: 'PRIVATE' }],
          ['delete', `/groups/${gA.id}`],
          ['get', `/groups/${gA.id}/members`],
          ['post', `/groups/${gA.id}/members`, { userId: w.opB.id }],
          ['delete', `/groups/${gA.id}/members/${w.opA.id}`],
          ['get', `/groups/${gA.id}/invites`],
          ['post', `/groups/${gA.id}/invites`, { inviteeEmail: 'x@x.test' }],
          ['get', `/groups/${gA.id}/notes`],
          ['post', `/groups/${gA.id}/notes`, { title: 'x' }],
          ['put', `/groups/notes/${noteA.id}`, { title: 'Hacked' }],
          ['delete', `/groups/notes/${noteA.id}`],
          ['get', `/groups/${gA.id}/documents`],
          ['post', `/groups/${gA.id}/documents`, { name: 'x', url: 'https://x.test' }],
          ['delete', `/groups/documents/${docA.id}`],
          ['post', `/groups/${gA.id}/incidents`, { type: 'OTHER', description: 'x' }],
          ['put', `/groups/${gA.id}/incidents/${incA.id}`, { resolution: 'x' }],
          ['get', `/groups/${gA.id}/posts`],
          ['post', `/groups/${gA.id}/posts`, { body: 'spam' }],
          ['delete', `/groups/posts/${postA.id}`],
          ['get', `/groups/posts/${postA.id}/comments`],
          ['post', `/groups/posts/${postA.id}/comments`, { body: 'spam' }],
          ['get', `/groups/${gA.id}/polls`],
          ['post', `/groups/${gA.id}/polls`, { question: 'q', options: ['a', 'b'] }],
          ['get', `/groups/${gA.id}/related`],
          ['post', `/groups/${gA.id}/pilgrims`, { bookingId: bookB.id }],
        ]);
        const incidents = await ok(w.opB, 'get', `/groups/${gA.id}/incidents`);
        expect(incidents).toEqual([]);
        await refused(w.opA, [
          ['post', `/groups/${gA.id}/pilgrims`, { bookingId: bookB.id }],
          ['post', `/groups/${gA.id}/incidents`, { type: 'OTHER', description: 'x', pilgrimId: pB.id }],
          ['post', `/groups/${gA.id}/members`, { userId: w.opB.id }],
          ['post', '/groups', { name: 'Lead guide from B', leadGuideId: w.opB.id }],
        ]);

        const g = await ctx.prisma.tripGroup.findUniqueOrThrow({ where: { id: gA.id } });
        expect(g.name).toBe(gA.name);
        expect(g.visibility).toBe('PUBLIC');
        expect((await ctx.prisma.groupNote.findUniqueOrThrow({ where: { id: noteA.id } })).title).toBe('Ops note');
        expect(await ctx.prisma.groupDocument.count({ where: { id: docA.id } })).toBe(1);
        expect(await ctx.prisma.groupPost.count({ where: { id: postA.id } })).toBe(1);
        expect(await ctx.prisma.groupPost.count({ where: { groupId: gA.id } })).toBe(1);
        expect((await ctx.prisma.incident.findUniqueOrThrow({ where: { id: incA.id } })).resolution).toBeNull();
        expect((await ctx.prisma.booking.findUniqueOrThrow({ where: { id: bookB.id } })).groupId).toBeNull();
        expect(await ctx.prisma.tripGroup.count({ where: { leadGuideId: w.opB.id } })).toBe(0);
      });

      it('self-service join/leave cannot tamper with groups the caller is not in', async () => {
        const before = await ctx.prisma.tripGroup.findMany({ where: { id: { in: [gA.id, gPriv.id] } }, select: { id: true, enrolledCount: true } });
        expect((await call(w.travelerB, 'post', `/groups/${gPriv.id}/join`)).status).toBe(403);
        for (let i = 0; i < 3; i++) {
          await call(w.travelerB, 'post', `/groups/${gPriv.id}/leave`);
          await call(w.travelerB, 'post', `/groups/${gA.id}/leave`);
          await call(w.opB, 'post', `/groups/${gA.id}/leave`);
        }
        const after = await ctx.prisma.tripGroup.findMany({ where: { id: { in: [gA.id, gPriv.id] } }, select: { id: true, enrolledCount: true } });
        expect(after.sort((a, b) => a.id.localeCompare(b.id))).toEqual(before.sort((a, b) => a.id.localeCompare(b.id)));
        // A real member joins and leaves: the counter moves once each way.
        await ok(w.travelerB, 'post', `/groups/${gA.id}/join`);
        await ok(w.travelerB, 'post', `/groups/${gA.id}/join`);
        await ok(w.travelerB, 'post', `/groups/${gA.id}/leave`);
        await ok(w.travelerB, 'post', `/groups/${gA.id}/leave`);
        const final = await ctx.prisma.tripGroup.findUniqueOrThrow({ where: { id: gA.id } });
        expect(final.enrolledCount).toBe(before.find((g) => g.id === gA.id)!.enrolledCount);
      });
    });

    describe('visa applications, documents and requests', () => {
      let vA: any; let vB: any; let docA: any; let vrA: any;
      beforeAll(async () => {
        vA = await ok(w.opA, 'post', '/compliance/visas', { applicantName: 'Amina', pilgrimId: pA.id, bookingId: bookA.id });
        vB = await ok(w.opB, 'post', '/compliance/visas', { applicantName: 'Bilal', pilgrimId: pB.id });
        docA = await ok(w.opA, 'post', `/compliance/visas/${vA.id}/documents`, { name: 'Passport', type: 'PASSPORT' });
        vrA = await ok(w.opA, 'post', '/visa-requests', { subject: 'Need a visa update', pilgrimId: pA.id, visaApplicationId: vA.id });
      });

      it('A cannot create or re-point an application at B\'s pilgrim or booking', async () => {
        await refused(w.opA, [
          ['post', '/compliance/visas', { applicantName: 'X', pilgrimId: pB.id }],
          ['post', '/compliance/visas', { applicantName: 'X', bookingId: bookB.id }],
          ['put', `/compliance/visas/${vA.id}`, { pilgrimId: pB.id }],
        ]);
        expect((await ctx.prisma.visaApplication.findUniqueOrThrow({ where: { id: vA.id } })).pilgrimId).toBe(pA.id);
      });

      it('a stale foreign pilgrim link never leaks B\'s passport data', async () => {
        await ctx.prisma.visaApplication.update({ where: { id: vA.id }, data: { pilgrimId: pB.id } });
        try {
          const seen = await ok(w.opA, 'get', `/compliance/visas/${vA.id}`);
          expect(seen.pilgrim).toBeNull();
          expect(JSON.stringify(seen)).not.toContain(pB.passportNumber);
        } finally {
          await ctx.prisma.visaApplication.update({ where: { id: vA.id }, data: { pilgrimId: pA.id } });
        }
      });

      it('B cannot read or act on A\'s application', async () => {
        await refused(w.opB, [
          ['get', `/compliance/visas/${vA.id}`],
          ['put', `/compliance/visas/${vA.id}`, { notes: 'x' }],
          ['delete', `/compliance/visas/${vA.id}`],
          ['put', `/compliance/visas/${vA.id}/submit`],
          ['put', `/compliance/visas/${vA.id}/approve`, {}],
          ['put', `/compliance/visas/${vA.id}/reject`, { reason: 'x' }],
          ['get', `/compliance/visas/${vA.id}/documents`],
          ['post', `/compliance/visas/${vA.id}/documents`, { name: 'x' }],
          ['get', `/compliance/visas/${vA.id}/documents/${docA.id}`],
          ['get', `/compliance/visas/${vB.id}/documents/${docA.id}`],
          ['put', `/compliance/visas/${vB.id}/documents/${docA.id}`, { notes: 'x' }],
          ['put', `/compliance/visas/${vA.id}/documents/${docA.id}/verify`],
          ['put', `/compliance/visas/${vA.id}/documents/${docA.id}/reject`, { reason: 'x' }],
          ['delete', `/compliance/visas/${vA.id}/documents/${docA.id}`],
          ['get', `/documents/visa/${docA.id}/url`],
        ]);
        const upload = await ctx.http().post(api(`/compliance/visas/${vB.id}/documents/${docA.id}/versions`)).set(bearer(w.opB)).attach('file', PDF, 'evil.pdf');
        expect(upload.status).toBe(404);
        const row = await ctx.prisma.visaApplication.findUniqueOrThrow({ where: { id: vA.id } });
        expect(row.status).toBe('NOT_STARTED');
        expect(row.deletedAt ?? null).toBeNull();
        expect((await ctx.prisma.visaDocument.findUniqueOrThrow({ where: { id: docA.id } })).version).toBe(0);
      });

      it('visa document files: only the owner gets a signed URL; the signature is the credential', async () => {
        const up = await ctx.http().post(api(`/compliance/visas/${vA.id}/documents/${docA.id}/versions`)).set(bearer(w.opA)).attach('file', PDF, 'passport.pdf');
        expect(up.status).toBe(201);
        expect(up.body.data.version).toBe(1);

        expect((await call(w.opB, 'get', `/documents/visa/${docA.id}/url`)).status).toBe(404);
        expect((await call(w.hotelA, 'get', `/documents/visa/${docA.id}/url`)).status).toBe(403);

        const url = await ok(w.opA, 'get', `/documents/visa/${docA.id}/url`);
        const signedPath = String(url.url).replace('/proxy-api', '/api/v1');
        const file = await ctx.http().get(signedPath);
        expect(file.status).toBe(200);
        expect(file.headers['content-type']).toBe('application/pdf');
        expect((await ctx.http().get(signedPath.slice(0, -4) + 'AAAA')).status).toBe(401);
        // An access token is not a download token.
        expect((await ctx.http().get(api(`/documents/signed/${w.opA.token}`))).status).toBe(401);
        // Nested private files are never served statically.
        const v = await ctx.prisma.visaDocumentVersion.findFirstOrThrow({ where: { documentId: docA.id, version: 1 } });
        expect((await ctx.http().get(`/uploads/${v.storageKey}`)).status).toBe(404);
      });

      it('visa requests: B cannot read or act on A\'s ticket; A cannot link B\'s records', async () => {
        await refused(w.opB, [
          ['get', `/visa-requests/${vrA.id}`],
          ['get', `/visa-requests/${vrA.id}/public-thread`],
          ['patch', `/visa-requests/${vrA.id}`, { subject: 'Hacked subject' }],
          ['put', `/visa-requests/${vrA.id}/assign`, { assigneeId: w.opB.id }],
          ['put', `/visa-requests/${vrA.id}/status`, { status: 'IN_PROGRESS' }],
          ['post', `/visa-requests/${vrA.id}/notes`, { body: 'x' }],
          ['put', `/visa-requests/${vrA.id}/escalate`, { reason: 'because' }],
          ['put', `/visa-requests/${vrA.id}/resolve`, { resolution: 'done done' }],
          ['put', `/visa-requests/${vrA.id}/close`, {}],
          ['put', `/visa-requests/${vrA.id}/reopen`, { reason: 'because' }],
          ['delete', `/visa-requests/${vrA.id}`],
        ], [400, 404]);
        await refused(w.opA, [
          ['post', '/visa-requests', { subject: 'Foreign pilgrim', pilgrimId: pB.id }],
          ['post', '/visa-requests', { subject: 'Foreign visa', visaApplicationId: vB.id }],
          ['post', '/visa-requests', { subject: 'Foreign assignee', assigneeId: w.opB.id }],
          ['put', `/visa-requests/${vrA.id}/assign`, { assigneeId: w.opB.id }],
        ], [400, 404]);
        const row = await ctx.prisma.visaServiceRequest.findUniqueOrThrow({ where: { id: vrA.id } });
        expect(row.subject).toBe('Need a visa update');
        expect(row.status).toBe(vrA.status);
        expect(row.assigneeId).toBeNull();
        expect(await ctx.prisma.visaServiceRequest.count({ where: { tenantId: w.tenants.opA, pilgrimId: pB.id } })).toBe(0);
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('hotel A vs hotel B', () => {
    let hA: any; let rtA: any; let roomA: any; let allotA: any; let hbA: any; let asgA: any;
    let hB: any; let roomB: any; let rtB: any; let bookingHotelB: any; let shared: any; let sharedRt: any;

    beforeAll(async () => {
      hA = await ok(w.hotelA, 'post', '/hotels', { name: `Hotel A ${uniq()}`, city: 'MAKKAH' });
      rtA = await ok(w.hotelA, 'post', `/hotels/${hA.id}/room-types`, { name: 'Double', capacity: 'DOUBLE', basePrice: 300 });
      roomA = await ok(w.hotelA, 'post', `/hotels/${hA.id}/rooms`, { roomNumber: '101', roomTypeId: rtA.id });
      allotA = await ok(w.hotelA, 'post', `/hotels/${hA.id}/allotments`, { checkIn: day(10), checkOut: day(20), totalRooms: 5 });
      hbA = await ok(w.hotelA, 'post', '/hotels/bookings', { hotelId: hA.id, guestName: 'Guest A', checkIn: day(11), checkOut: day(12) });
      const bookingHotelA = await ctx.prisma.booking.create({ data: { tenantId: w.tenants.hotelA, bookingRef: `RT-HA-${uniq()}`, totalAmountCents: 0n } });
      asgA = await ok(w.hotelA, 'post', `/hotels/${hA.id}/assignments`, { allotmentId: allotA.id, bookingId: bookingHotelA.id, checkIn: day(11), checkOut: day(12) });

      hB = await ok(w.hotelB, 'post', '/hotels', { name: `Hotel B ${uniq()}`, city: 'MADINAH' });
      rtB = await ok(w.hotelB, 'post', `/hotels/${hB.id}/room-types`, { name: 'Single', capacity: 'SINGLE' });
      roomB = await ok(w.hotelB, 'post', `/hotels/${hB.id}/rooms`, { roomNumber: '201' });
      bookingHotelB = await ctx.prisma.booking.create({ data: { tenantId: w.tenants.hotelB, bookingRef: `RT-HB-${uniq()}`, totalAmountCents: 0n } });

      shared = await ctx.prisma.hotel.create({ data: { tenantId: null, name: `Shared ${uniq()}`, city: 'MAKKAH', amenities: [], images: [] } });
      sharedRt = await ctx.prisma.roomType.create({ data: { hotelId: shared.id, name: 'Shared Double', occupancy: 2 } as any });
    });

    it('B cannot read or change A\'s hotel, room types, rooms, allotments, bookings or assignments', async () => {
      await refused(w.hotelB, [
        ['get', `/hotels/${hA.id}`],
        ['put', `/hotels/${hA.id}`, { name: 'Hacked' }],
        ['delete', `/hotels/${hA.id}`],
        ['get', `/hotels/${hA.id}/room-types`],
        ['post', `/hotels/${hA.id}/room-types`, { name: 'Evil' }],
        ['put', `/hotels/room-types/${rtA.id}`, { name: 'Hacked' }],
        ['get', `/hotels/${hA.id}/rooms`],
        ['post', `/hotels/${hA.id}/rooms`, { roomNumber: '666' }],
        ['put', `/hotels/rooms/${roomA.id}`, { roomNumber: '999' }],
        ['delete', `/hotels/rooms/${roomA.id}`],
        ['post', `/hotels/${hA.id}/allotments`, { checkIn: day(10), checkOut: day(11), totalRooms: 1 }],
        ['get', `/hotels/bookings/${hbA.id}`],
        ['put', `/hotels/bookings/${hbA.id}`, { guestName: 'Hacked', status: 'CANCELLED' }],
        ['post', '/hotels/bookings', { hotelId: hA.id, guestName: 'Evil', checkIn: day(11), checkOut: day(12) }],
        ['post', `/hotels/${hA.id}/assignments`, { allotmentId: allotA.id, bookingId: bookingHotelB.id, checkIn: day(11), checkOut: day(12) }],
        ['post', `/hotels/${hB.id}/assignments`, { allotmentId: allotA.id, bookingId: bookingHotelB.id, checkIn: day(11), checkOut: day(12) }],
      ]);
      // Lists are tenant-filtered: nothing of A's shows up.
      expect(await ok(w.hotelB, 'get', `/hotels/${hA.id}/allotments`)).toEqual([]);
      expect(await ok(w.hotelB, 'get', `/hotels/${hA.id}/assignments`)).toEqual([]);
      expect(JSON.stringify(await ok(w.hotelB, 'get', '/hotels/bookings'))).not.toContain(hbA.id);
      expect(JSON.stringify(await ok(w.hotelB, 'get', '/hotels?limit=100'))).not.toContain(hA.id);

      const hotel = await ctx.prisma.hotel.findUniqueOrThrow({ where: { id: hA.id } });
      expect(hotel.name).toBe(hA.name);
      expect(await ctx.prisma.roomType.count({ where: { hotelId: hA.id } })).toBe(1);
      expect((await ctx.prisma.room.findUniqueOrThrow({ where: { id: roomA.id } })).roomNumber).toBe('101');
      expect(await ctx.prisma.room.count({ where: { hotelId: hA.id } })).toBe(1);
      expect((await ctx.prisma.hotelBooking.findUniqueOrThrow({ where: { id: hbA.id } })).guestName).toBe('Guest A');
      const allot = await ctx.prisma.allotment.findUniqueOrThrow({ where: { id: allotA.id } });
      expect(allot.bookedRooms).toBe(1);
      expect(await ctx.prisma.roomAssignment.count({ where: { allotmentId: allotA.id } })).toBe(1);
      expect(asgA.allotmentId).toBe(allotA.id);
    });

    it('A cannot link B\'s rooms, room types or bookings', async () => {
      await refused(w.hotelA, [
        ['post', '/hotels/bookings', { hotelId: hA.id, guestName: 'X', checkIn: day(11), checkOut: day(12), roomId: roomB.id }],
        ['post', '/hotels/bookings', { hotelId: hA.id, guestName: 'X', checkIn: day(11), checkOut: day(12), roomTypeId: rtB.id }],
        ['put', `/hotels/bookings/${hbA.id}`, { roomId: roomB.id }],
        ['post', `/hotels/${hA.id}/rooms`, { roomNumber: '102', roomTypeId: rtB.id }],
        ['put', `/hotels/rooms/${roomA.id}`, { roomTypeId: rtB.id }],
        ['post', `/hotels/${hA.id}/allotments`, { checkIn: day(10), checkOut: day(11), totalRooms: 1, roomTypeId: rtB.id }],
        ['post', `/hotels/${hA.id}/assignments`, { allotmentId: allotA.id, bookingId: bookingHotelB.id, checkIn: day(11), checkOut: day(12) }],
      ]);
      expect((await ctx.prisma.room.findUniqueOrThrow({ where: { id: roomA.id } })).roomTypeId).toBe(rtA.id);
      expect((await ctx.prisma.allotment.findUniqueOrThrow({ where: { id: allotA.id } })).bookedRooms).toBe(1);
    });

    it('a shared (platform-wide) hotel is readable but not writable by any organization', async () => {
      for (const a of [w.hotelA, w.hotelB]) {
        expect((await call(a, 'get', `/hotels/${shared.id}`)).status).toBe(200);
        expect((await call(a, 'get', `/hotels/${shared.id}/room-types`)).status).toBe(200);
        await refused(a, [
          ['put', `/hotels/${shared.id}`, { name: 'Hijacked' }],
          ['delete', `/hotels/${shared.id}`],
          ['post', `/hotels/${shared.id}/room-types`, { name: 'Evil' }],
          ['post', `/hotels/${shared.id}/rooms`, { roomNumber: '1' }],
          ['post', '/hotels/bookings', { hotelId: shared.id, guestName: 'X', checkIn: day(11), checkOut: day(12) }],
          ['put', `/hotels/room-types/${sharedRt.id}`, { name: 'Hijacked' }],
        ], [403, 404]);
      }
      const row = await ctx.prisma.hotel.findUniqueOrThrow({ where: { id: shared.id } });
      expect(row.name).toBe(shared.name);
      expect(row.status).toBe('ACTIVE');
      expect(row.tenantId).toBeNull();
      expect(await ctx.prisma.roomType.count({ where: { hotelId: shared.id } })).toBe(1);
      expect(await ctx.prisma.room.count({ where: { hotelId: shared.id } })).toBe(0);
      expect(await ctx.prisma.hotelBooking.count({ where: { hotelId: shared.id } })).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('transport A vs transport B', () => {
    let vA: any; let dA: any; let rA: any; let asgA: any; let vB: any; let dB: any; let rB: any;

    beforeAll(async () => {
      vA = await ok(w.transportA, 'post', '/transport/vehicles', { type: 'BUS', plateNumber: `A-${uniq()}`, capacity: 40 });
      dA = await ok(w.transportA, 'post', '/transport/drivers', { firstName: 'Driver', lastName: 'A', phone: '+966500000001' });
      rA = await ok(w.transportA, 'post', '/transport/routes', { name: 'JED → MAK', originCity: 'JEDDAH', destCity: 'MAKKAH', totalSeats: 30 });
      asgA = await ok(w.transportA, 'post', '/transport/assignments', {
        vehicleId: vA.id, routeId: rA.id, driverId: dA.id, scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), passengerCount: 2,
      });
      vB = await ok(w.transportB, 'post', '/transport/vehicles', { type: 'VAN', plateNumber: `B-${uniq()}`, capacity: 12 });
      dB = await ok(w.transportB, 'post', '/transport/drivers', { firstName: 'Driver', lastName: 'B', phone: '+966500000002' });
      rB = await ok(w.transportB, 'post', '/transport/routes', { name: 'MAK → MED', originCity: 'MAKKAH', destCity: 'MADINAH', totalSeats: 10 });
    });

    it('A cannot link B\'s vehicle, driver or route; B\'s seat counters never move', async () => {
      const at = new Date(Date.now() + 2 * 86_400_000).toISOString();
      await refused(w.transportA, [
        ['post', '/transport/assignments', { vehicleId: vB.id, scheduledAt: at, passengerCount: 3 }],
        ['post', '/transport/assignments', { vehicleId: vA.id, routeId: rB.id, scheduledAt: at, passengerCount: 3 }],
        ['post', '/transport/assignments', { vehicleId: vA.id, driverId: dB.id, scheduledAt: at }],
        ['put', `/transport/assignments/${asgA.id}`, { vehicleId: vB.id }],
        ['put', `/transport/assignments/${asgA.id}`, { routeId: rB.id }],
        ['put', `/transport/assignments/${asgA.id}`, { driverId: dB.id }],
        ['post', `/transport/vehicles/${vA.id}/drivers`, { driverId: dB.id }],
        ['post', '/transport/routes', { name: 'x', originCity: 'A', destCity: 'B', vehicleId: vB.id }],
        ['post', '/transport/routes', { name: 'x', originCity: 'A', destCity: 'B', driverId: dB.id }],
        ['put', `/transport/routes/${rA.id}`, { vehicleId: vB.id }],
        ['put', `/transport/routes/${rA.id}`, { driverId: dB.id }],
        ['post', '/transport/tasreeh', { vehicleId: vB.id, permitNumber: `T-${uniq()}` }],
      ]);
      const vBrow = await ctx.prisma.vehicle.findUniqueOrThrow({ where: { id: vB.id } });
      const rBrow = await ctx.prisma.transportRoute.findUniqueOrThrow({ where: { id: rB.id } });
      expect(vBrow.bookedSeats).toBe(0);
      expect(rBrow.bookedSeats).toBe(0);
      const asg = await ctx.prisma.transportAssignment.findUniqueOrThrow({ where: { id: asgA.id } });
      expect([asg.vehicleId, asg.routeId, asg.driverId]).toEqual([vA.id, rA.id, dA.id]);
      expect(await ctx.prisma.vehicleDriver.count({ where: { driverId: dB.id } })).toBe(0);
    });

    it('B cannot read or change A\'s vehicles, drivers, routes or assignments', async () => {
      await refused(w.transportB, [
        ['get', `/transport/vehicles/${vA.id}`],
        ['put', `/transport/vehicles/${vA.id}`, { capacity: 1 }],
        ['delete', `/transport/vehicles/${vA.id}`],
        ['post', `/transport/vehicles/${vA.id}/drivers`, { driverId: dB.id }],
        ['delete', `/transport/vehicles/${vA.id}/drivers/${dA.id}`],
        ['get', `/transport/drivers/${dA.id}`],
        ['put', `/transport/drivers/${dA.id}`, { firstName: 'Hacked' }],
        ['delete', `/transport/drivers/${dA.id}`],
        ['get', `/transport/routes/${rA.id}`],
        ['put', `/transport/routes/${rA.id}`, { totalSeats: 0 }],
        ['delete', `/transport/routes/${rA.id}`],
        ['get', `/transport/assignments/${asgA.id}`],
        ['put', `/transport/assignments/${asgA.id}`, { passengerCount: 30 }],
        ['post', `/transport/assignments/${asgA.id}/cancel`],
        ['post', '/transport/assignments', { vehicleId: vA.id, scheduledAt: new Date().toISOString() }],
      ]);
      const v = await ctx.prisma.vehicle.findUniqueOrThrow({ where: { id: vA.id } });
      expect([v.capacity, v.bookedSeats, v.isActive]).toEqual([40, 2, true]);
      const r = await ctx.prisma.transportRoute.findUniqueOrThrow({ where: { id: rA.id } });
      expect([r.totalSeats, r.bookedSeats]).toEqual([30, 2]);
      expect((await ctx.prisma.driver.findUniqueOrThrow({ where: { id: dA.id } })).firstName).toBe('Driver');
      const asg = await ctx.prisma.transportAssignment.findUniqueOrThrow({ where: { id: asgA.id } });
      expect([asg.status, asg.passengerCount]).toEqual([asgA.status, 2]);
    });

    it('seat counters are server-owned', async () => {
      const r = await call(w.transportA, 'put', `/transport/routes/${rA.id}`, { bookedSeats: 999, notes: 'mass' });
      expect([200, 400]).toContain(r.status);
      expect((await ctx.prisma.transportRoute.findUniqueOrThrow({ where: { id: rA.id } })).bookedSeats).toBe(2);
      expect((await call(w.transportA, 'put', `/transport/vehicles/${vA.id}`, { bookedSeats: 0 })).status).toBe(400);
      expect((await call(w.transportA, 'post', '/transport/vehicles', { type: 'VAN', plateNumber: `M-${uniq()}`, capacity: 5, bookedSeats: 5 })).status).toBe(400);
      expect((await ctx.prisma.vehicle.findUniqueOrThrow({ where: { id: vA.id } })).bookedSeats).toBe(2);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('visa agency A vs visa agency B', () => {
    it('B cannot read or decide A\'s applications and requests', async () => {
      const app = await ok(w.visaA, 'post', '/compliance/visas', { applicantName: 'Visa client' });
      const req = await ok(w.visaA, 'post', '/visa-requests', { subject: 'Agency ticket' });
      await refused(w.visaB, [
        ['get', `/compliance/visas/${app.id}`],
        ['put', `/compliance/visas/${app.id}`, { status: 'APPROVED' }],
        ['put', `/compliance/visas/${app.id}/approve`, { visaNumber: 'V-1' }],
        ['put', `/compliance/visas/${app.id}/reject`, { reason: 'x' }],
        ['delete', `/compliance/visas/${app.id}`],
        ['get', `/visa-requests/${req.id}`],
        ['put', `/visa-requests/${req.id}/status`, { status: 'IN_PROGRESS' }],
        ['put', `/visa-requests/${req.id}/close`, {}],
        ['delete', `/visa-requests/${req.id}`],
      ], [400, 404]);
      expect(JSON.stringify(await ok(w.visaB, 'get', '/compliance/visas?limit=100'))).not.toContain(app.id);
      expect(JSON.stringify(await ok(w.visaB, 'get', '/visa-requests?limit=100'))).not.toContain(req.id);
      expect((await ctx.prisma.visaApplication.findUniqueOrThrow({ where: { id: app.id } })).status).toBe('NOT_STARTED');
      const r = await ctx.prisma.visaServiceRequest.findUniqueOrThrow({ where: { id: req.id } });
      expect(r.status).toBe(req.status);
      expect(r.deletedAt ?? null).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('traveler A vs traveler B', () => {
    it('non-public posts are invisible and untouchable for other travelers', async () => {
      const make = (visibility: string, extra: Record<string, unknown> = {}) =>
        ok(w.travelerA, 'post', '/social/posts', { content: `private ${visibility} ${uniq()}`, visibility, ...extra });
      const posts = [
        await make('FOLLOWER_SET'),
        await make('CUSTOM_SET'),
        await make('VERIFIED_ONLY'),
        await make('ROLE_SET', { targetRoles: ['HOTEL_MANAGER'] }),
      ];
      for (const p of posts) {
        await refused(w.travelerB, [
          ['get', `/social/posts/${p.id}`],
          ['put', `/social/posts/${p.id}`, { content: 'Hacked' }],
          ['delete', `/social/posts/${p.id}`],
          ['post', `/social/posts/${p.id}/comments`, { content: 'spam' }],
          ['post', `/social/posts/${p.id}/react`, { type: 'LIKE' }],
          ['post', `/social/posts/${p.id}/save`],
        ]);
        expect((await call(w.travelerA, 'get', `/social/posts/${p.id}`)).status).toBe(200);
      }
      // The role-targeted post reaches its audience only.
      expect((await call(w.hotelA, 'get', `/social/posts/${posts[3].id}`)).status).toBe(200);
      expect((await call(w.transportA, 'get', `/social/posts/${posts[3].id}`)).status).toBe(404);

      const feed = JSON.stringify(await ok(w.travelerB, 'get', '/social/feed?limit=100'));
      for (const p of posts) expect(feed).not.toContain(p.id);
      for (const p of posts) {
        const row = await ctx.prisma.post.findUniqueOrThrow({ where: { id: p.id } });
        expect(row.body).toBe(p.body);
        expect(row.deletedAt).toBeNull();
      }
      expect(await ctx.prisma.comment.count({ where: { postId: { in: posts.map((p) => p.id) } } })).toBe(0);
      expect(await ctx.prisma.reaction.count({ where: { postId: { in: posts.map((p) => p.id) } } })).toBe(0);
    });

    it('conversations: a non-participant can neither read nor write', async () => {
      const conv = await ok(w.travelerA, 'post', '/social/conversations/open', { recipientUserId: w.hotelA.id });
      await ok(w.travelerA, 'post', `/social/conversations/${conv.id}/messages`, { body: 'private hello' });
      await refused(w.travelerB, [
        ['get', `/social/conversations/${conv.id}/messages`],
        ['post', `/social/conversations/${conv.id}/messages`, { body: 'intrusion' }],
      ], [403, 404]);
      const mine = JSON.stringify(await ok(w.travelerB, 'get', '/social/conversations'));
      expect(mine).not.toContain(conv.id);
      expect(await ctx.prisma.message.count({ where: { conversationId: conv.id } })).toBe(1);
      const read = await ok(w.hotelA, 'get', `/social/conversations/${conv.id}/messages`);
      expect(read.items.map((m: any) => m.body)).toEqual(['private hello']);
    });

    it('connections: only the recipient responds; a block cannot be reopened or erased by either party', async () => {
      const req = await ok(w.travelerA, 'post', '/connections/request', { recipientId: w.opA.id, message: 'hi' });
      await refused(w.travelerB, [
        ['post', `/connections/${req.id}/accept`],
        ['post', `/connections/${req.id}/reject`],
      ], [403, 404]);
      expect((await ctx.prisma.connection.findUniqueOrThrow({ where: { id: req.id } })).status).toBe('PENDING');

      await ctx.prisma.connection.deleteMany({
        where: { OR: [{ requesterId: w.travelerA.id, recipientId: w.travelerB.id }, { requesterId: w.travelerB.id, recipientId: w.travelerA.id }] },
      });
      const block = await ctx.prisma.connection.create({ data: { requesterId: w.travelerA.id, recipientId: w.travelerB.id, status: 'BLOCKED' } });
      expect((await call(w.travelerB, 'post', '/connections/request', { recipientId: w.travelerA.id })).status).toBe(409);
      expect((await call(w.travelerA, 'post', '/connections/request', { targetUserId: w.travelerB.id })).status).toBe(409);
      await call(w.travelerB, 'delete', `/connections/with/${w.travelerA.id}`);
      expect((await call(w.travelerB, 'post', '/connections/request', { recipientId: w.travelerA.id })).status).toBe(409);
      const row = await ctx.prisma.connection.findUnique({ where: { id: block.id } });
      expect(row?.status).toBe('BLOCKED');
      expect(await ctx.prisma.connection.count({
        where: { status: 'PENDING', OR: [{ requesterId: w.travelerB.id, recipientId: w.travelerA.id }, { requesterId: w.travelerA.id, recipientId: w.travelerB.id }] },
      })).toBe(0);
    });

    it('notifications: nobody can read or mark another user\'s notifications', async () => {
      const n = await ctx.prisma.notification.create({
        data: { recipientId: w.travelerA.id, type: 'CONNECTION_REQUEST', title: `private-${uniq()}`, data: {} } as any,
      });
      const mark = await ok(w.travelerB, 'patch', '/notifications/read', { ids: [n.id] });
      expect(mark.updated).toBe(0);
      await ok(w.travelerB, 'post', '/notifications/read-all');
      await ok(w.opA, 'post', '/notifications/read-all');
      expect((await ctx.prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt).toBeNull();
      expect(JSON.stringify(await ok(w.travelerB, 'get', '/notifications?limit=50'))).not.toContain(n.id);
      expect(JSON.stringify(await ok(w.travelerA, 'get', '/notifications?limit=50'))).toContain(n.id);
    });

    it('marketplace requests: B cannot read, close, accept or convert A\'s request', async () => {
      const r = await ok(w.travelerA, 'post', '/marketplace/requests', { serviceType: 'HOTEL', title: `Makkah stay ${uniq()}`, travelers: 2 });
      const offer = await ok(w.hotelA, 'post', `/marketplace/requests/${r.id}/offers`, { priceCents: 50_000 });
      await refused(w.travelerB, [
        ['get', `/marketplace/requests/${r.id}`],
        ['post', `/marketplace/requests/${r.id}/close`],
        ['post', `/marketplace/requests/${r.id}/offers/${offer.id}/accept`],
        ['post', `/marketplace/requests/${r.id}/offers/${offer.id}/reject`],
        ['post', `/marketplace/requests/${r.id}/offers/${offer.id}/convert-to-booking`, {}],
      ]);
      expect(JSON.stringify(await ok(w.travelerB, 'get', '/marketplace/requests/mine'))).not.toContain(r.id);
      const row = await ctx.prisma.marketplaceRequest.findUniqueOrThrow({ where: { id: r.id } });
      expect(row.status).toBe('IN_NEGOTIATION');
      expect(row.acceptedOfferId).toBeNull();
      expect((await ctx.prisma.requestOffer.findUniqueOrThrow({ where: { id: offer.id } })).status).toBe('PENDING');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('vertical access', () => {
    const OPERATOR = ['/pilgrims', '/bookings', '/packages', '/groups', '/finance/invoices', '/finance/summary', '/reports/overview'];
    const HOTEL = ['/hotels', '/hotels/bookings', '/hotels/stats'];
    const TRANSPORT = ['/transport/vehicles', '/transport/drivers', '/transport/routes', '/transport/assignments', '/transport/tasreeh'];
    const VISA = ['/compliance/visas', '/compliance/submissions', '/visa-requests'];
    const ADMIN = ['/admin/stats', '/admin/tenants', '/admin/users', '/admin/kyc', '/admin/audit-logs', '/admin/finance'];

    it('travelers reach no organization or platform area', async () => {
      for (const path of [...OPERATOR, ...HOTEL, ...TRANSPORT, ...VISA, ...ADMIN, '/rbac/roles', '/tenants/me', '/marketplace/requests/open']) {
        expect((await call(w.travelerA, 'get', path)).status, path).toBe(403);
      }
      await refused(w.travelerA, [
        ['post', '/pilgrims', { firstName: 'x', lastName: 'y' }],
        ['post', '/hotels', { name: 'x' }],
        ['post', '/transport/vehicles', { type: 'VAN', plateNumber: 'x', capacity: 1 }],
        ['post', '/compliance/visas', { applicantName: 'x' }],
        ['post', '/marketplace/listings', { title: 'x', category: 'other' }],
        ['post', '/marketplace/vendors', { name: 'Traveler vendor', type: 'OTHER' }],
        ['post', '/payments/intents', { invoiceId: '00000000-0000-4000-8000-000000000000' }],
      ], [403]);
    });

    it('operators never reach /admin', async () => {
      for (const a of [w.opA, w.staffA, w.financeA]) {
        for (const path of ADMIN) expect((await call(a, 'get', path)).status, `${a.email} ${path}`).toBe(403);
      }
    });

    it('hotel, transport and visa organizations stay in their own domain', async () => {
      const matrix: [Actor, string[]][] = [
        [w.hotelA, [...TRANSPORT, ...VISA, ...OPERATOR.filter((p) => !p.startsWith('/finance') && p !== '/reports/overview'), ...ADMIN]],
        [w.transportA, [...HOTEL, ...VISA, ...OPERATOR.filter((p) => !p.startsWith('/finance') && p !== '/reports/overview'), ...ADMIN]],
        // Visa officers hold crm:pilgrim:read, which also gates /groups inside their own organization.
        [w.visaA, [...HOTEL, ...TRANSPORT, '/bookings', '/packages', '/finance/summary', ...ADMIN]],
      ];
      for (const [a, paths] of matrix) {
        for (const path of paths) expect((await call(a, 'get', path)).status, `${a.email} ${path}`).toBe(403);
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('mass assignment', () => {
    it('server-owned fields are rejected (400) or ignored', async () => {
      const rejected: [Actor, Method, string, Record<string, unknown>][] = [
        [w.opA, 'post', '/pilgrims', { firstName: 'M', lastName: 'A', tenantId: w.tenants.opB }],
        [w.opA, 'post', '/pilgrims', { firstName: 'M', lastName: 'A', createdBy: w.opB.id }],
        [w.opA, 'post', '/bookings', { tenantId: w.tenants.opB }],
        [w.opA, 'post', '/bookings', { paidAmountCents: 5 }],
        [w.opA, 'post', '/bookings', { status: 'COMPLETED' }],
        [w.opA, 'post', '/bookings', { createdBy: w.opB.id }],
        [w.opA, 'post', '/finance/invoices', { issuedToName: 'x', subtotal: 1, paidCents: 100 }],
        [w.opA, 'post', '/finance/invoices', { issuedToName: 'x', subtotal: 1, tenantId: w.tenants.opB }],
        [w.opA, 'post', '/groups', { name: 'x', tenantId: w.tenants.opB }],
        [w.opA, 'post', '/groups', { name: 'x', enrolledCount: 99 }],
        [w.hotelA, 'post', '/hotels', { name: 'x', tenantId: null }],
        [w.hotelA, 'post', '/hotels', { name: 'x', isVerified: true }],
        [w.hotelA, 'post', '/marketplace/listings', { title: 'x', category: 'other', tenantId: w.tenants.hotelB }],
        [w.transportA, 'post', '/transport/vehicles', { type: 'VAN', plateNumber: 'x', capacity: 1, tenantId: w.tenants.transportB }],
        [w.travelerA, 'post', '/social/posts', { content: 'x', authorId: w.travelerB.id }],
        [w.travelerA, 'post', '/marketplace/requests', { serviceType: 'HOTEL', title: 'x', travelerId: w.travelerB.id }],
        [w.travelerA, 'post', '/marketplace/requests', { serviceType: 'HOTEL', title: 'x', status: 'FULFILLED' }],
        [w.opA, 'put', '/tenants/me', { status: 'ACTIVE', type: 'PLATFORM' }],
        [w.opA, 'post', '/rbac/roles', { name: `r-${uniq()}`, permissions: [], tenantId: null }],
      ];
      for (const [a, method, path, body] of rejected) {
        const res = await call(a, method, path, body);
        expect(res.status, `${a.email} ${method.toUpperCase()} ${path} ${JSON.stringify(body)}`).toBe(400);
      }
      const reg = await ctx.http().post(api('/auth/register')).send({
        email: `mass.${uniq()}@people.test`, password: 'Mass-Assign-2026', firstName: 'M', lastName: 'A', role: 'SUPER_ADMIN',
      });
      expect(reg.status).toBe(400);
      const reg2 = await ctx.http().post(api('/auth/register')).send({
        email: `mass.${uniq()}@people.test`, password: 'Mass-Assign-2026', firstName: 'M', lastName: 'A', roleInterest: 'admin',
      });
      expect(reg2.status).toBe(400);
    });

    it('client totals and statuses do not override the server', async () => {
      const inv = await ok(w.opA, 'post', '/finance/invoices', { issuedToName: 'Totals', subtotal: 100, total: 1, totalCents: 1, status: 'PAID' });
      const invRow = await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
      expect([invRow.status, Number(invRow.totalCents), Number(invRow.paidCents)]).toEqual(['DRAFT', 10_000, 0]);
      expect((await call(w.opA, 'put', `/finance/invoices/${inv.id}`, { status: 'PAID' })).status).toBe(400);

      const pkg = await ok(w.opA, 'post', '/packages', { name: `Mass ${uniq()}`, type: 'UMRAH', priceAdult: 10 });
      const b = await ok(w.opA, 'post', '/bookings', { packageId: pkg.id });
      await ok(w.opA, 'put', `/bookings/${b.id}`, { totalAmountCents: 1, status: 'CONFIRMED', notes: 'n' });
      const bRow = await ctx.prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
      expect([bRow.status, Number(bRow.totalAmountCents), bRow.notes]).toEqual(['DRAFT', b.totalAmountCents, 'n']);
      expect((await call(w.opA, 'put', `/bookings/${b.id}/payment`, { paidAmountCents: Number(bRow.totalAmountCents) + 1 })).status).toBe(400);

      // Staff may submit visa cases but not decide them.
      const v = await ok(w.staffA, 'post', '/compliance/visas', { applicantName: 'Staff case' });
      expect((await call(w.staffA, 'put', `/compliance/visas/${v.id}`, { status: 'APPROVED' })).status).toBe(403);
      expect((await call(w.staffA, 'post', '/compliance/visas', { applicantName: 'x', status: 'APPROVED' })).status).toBe(400);
      expect((await ctx.prisma.visaApplication.findUniqueOrThrow({ where: { id: v.id } })).status).toBe('NOT_STARTED');
    });
  });
});
