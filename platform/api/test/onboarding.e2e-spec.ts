import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestApp, TestContext, tokenFromMail } from './app';
import { bearer, buildWorld, World } from './fixtures';

/**
 * Provider onboarding and KYC, end to end over HTTP (XT-R08 / W15):
 * a verified traveler founds an organization, the organization is confined to
 * onboarding routes while pending, submits KYC, is sent back with a reason,
 * resubmits, and only a Super Admin approval makes it ACTIVE.
 */
const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(256)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(256)]);
const PENDING_MESSAGE = 'Organization verification is not complete yet';

describe('provider onboarding + KYC lifecycle', () => {
  let ctx: TestContext;
  let w: World;
  let token = '';
  let organizationId = '';
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const asFounder = (path: string) => ctx.http().get(api(path)).set(auth());
  const asAdmin = (method: 'get' | 'put' | 'delete', path: string, body?: object) => {
    const req = ctx.http()[method](api(path)).set(bearer(w.superAdmin));
    return body ? req.send(body) : req;
  };
  const tenantStatus = async () =>
    (await ctx.prisma.tenant.findUniqueOrThrow({ where: { id: organizationId } })).status;
  const upload = (file: Buffer, name: string) =>
    ctx.http().post(api('/documents/kyc')).set(auth()).attach('file', file, name);

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
  });
  afterAll(async () => ctx?.close());

  it('an unverified traveler is refused; the request is validated like the form', async () => {
    const email = `founder.${uniq()}@people.test`;
    ctx.mails.length = 0;
    const reg = await ctx.http().post(api('/auth/register')).send({
      email, password: 'Founder-2026', firstName: 'Fatima', lastName: 'Founder', roleInterest: 'transport',
    });
    expect(reg.status).toBe(201);
    token = reg.body.data.accessToken;

    const org = { type: 'VENDOR_TRANSPORT', name: 'Zamzam Coaches', country: 'SA' };
    const unverified = await ctx.http().post(api('/onboarding/organization')).set(auth()).send(org);
    expect(unverified.status).toBe(403);
    expect(unverified.body.error.message).toMatch(/Confirm your email/);

    const mail = ctx.mails.find((m) => m.to === email)!;
    expect((await ctx.http().post(api('/auth/verify-email/confirm')).send({ token: tokenFromMail(mail.text) })).status).toBe(200);

    const invalid: [string, object][] = [
      ['platform type', { ...org, type: 'PLATFORM' }],
      ['unknown type', { ...org, type: 'BANK' }],
      ['short name', { ...org, name: 'Z' }],
      ['country', { ...org, country: 'Saudi' }],
      ['slug', { ...org, slug: 'Has Spaces' }],
      ['phone', { ...org, phone: '0501234567' }],
      ['website without protocol', { ...org, website: 'zamzam.example' }],
      ['email', { ...org, email: 'not-an-email' }],
      ['unknown field', { ...org, status: 'ACTIVE' }],
    ];
    for (const [label, body] of invalid) {
      const res = await ctx.http().post(api('/onboarding/organization')).set(auth()).send(body);
      expect(res.status, label).toBe(400);
    }
    const taken = await ctx.http().post(api('/onboarding/organization')).set(auth()).send({ ...org, slug: 'fx-operator-a' });
    expect(taken.status).toBe(409);
  });

  it('founding moves the traveler into a PENDING_KYC organization with a fresh session', async () => {
    const travelerToken = token;
    const created = await ctx.http().post(api('/onboarding/organization')).set(auth()).send({
      type: 'VENDOR_TRANSPORT',
      name: '  Zamzam Coaches  ',
      country: 'sa',
      slug: `zamzam-coaches-${uniq()}`,
      email: 'ops@zamzam-coaches.test',
      phone: '+966501234567',
      licenseNumber: 'TR-2026-001',
      website: 'https://zamzam-coaches.test',
    });
    expect(created.status).toBe(201);
    const { organization, role, tokens } = created.body.data;
    expect(role).toBe('TRANSPORT_MANAGER');
    expect(organization.status).toBe('PENDING_KYC');
    expect(organization.name).toBe('Zamzam Coaches');
    organizationId = organization.id;
    const stored = await ctx.prisma.tenant.findUniqueOrThrow({ where: { id: organizationId } });
    expect(stored.country).toBe('SA');
    expect(stored.phone).toBe('+966501234567');

    await new Promise((r) => setTimeout(r, 50));
    token = tokens.accessToken;
    // The traveler session is gone; the new one belongs to the new organization.
    expect((await ctx.http().get(api('/auth/me')).set({ Authorization: `Bearer ${travelerToken}` })).status).toBe(401);
    const me = (await asFounder('/auth/me')).body.data;
    expect(me.roles).toEqual(['TRANSPORT_MANAGER']);
    expect(me.tenant.status).toBe('PENDING_KYC');
    expect(me.permissions).toContain('transport:vehicle:read');
  });

  it('while pending, only onboarding routes answer', async () => {
    for (const path of ['/auth/me', '/tenants/me', '/tenants/me/kyc', '/rbac/my-permissions']) {
      expect((await asFounder(path)).status, path).toBe(200);
    }
    expect(Object.keys((await asFounder('/tenants/me')).body.data)).not.toContain('metadata');
    for (const path of ['/transport/vehicles', '/transport/stats', '/social/feed', '/notifications', '/finance/invoices', '/marketplace/listings/mine']) {
      const res = await asFounder(path);
      expect(res.status, path).toBe(401);
      expect(res.body.error.message, path).toBe(PENDING_MESSAGE);
    }
  });

  it('the platform console cannot activate an unverified organization', async () => {
    const active = await asAdmin('put', `/admin/tenants/${organizationId}/status`, { status: 'ACTIVE' });
    expect(active.status).toBe(400);
    expect(active.body.error.message).toMatch(/not been verified/);
    for (const status of ['KYC_SUBMITTED', 'KYC_APPROVED', 'KYC_REJECTED']) {
      expect((await asAdmin('put', `/admin/tenants/${organizationId}/status`, { status })).status, status).toBe(400);
    }
    expect(await tenantStatus()).toBe('PENDING_KYC');
  });

  let firstFile: any;
  let secondFile: any;
  it('KYC files are content-checked, size-limited and private to the organization', async () => {
    expect((await upload(Buffer.from('<html>not a pdf</html>'.padEnd(64)), 'licence.pdf')).status).toBe(400);
    const tooBig = await upload(Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(15 * 1024 * 1024)]), 'huge.pdf');
    expect(tooBig.status).toBe(413);

    const pdf = await upload(PDF, 'commercial-registration.pdf');
    expect(pdf.status).toBe(201);
    expect(pdf.body.data.storageKey).toMatch(new RegExp(`^kyc/${organizationId}/`));
    expect(pdf.body.data.mimeType).toBe('application/pdf');
    firstFile = pdf.body.data;
    const png = await upload(PNG, 'licence.png');
    expect(png.status).toBe(201);
    secondFile = png.body.data;
  });

  let firstSubmission = '';
  it('submission needs at least one own document and is recorded once', async () => {
    const submit = (body: object) => ctx.http().post(api('/tenants/me/kyc')).set(auth()).send(body);
    expect((await submit({ registrySource: 'MANUAL' })).status).toBe(400);
    expect((await submit({ registrySource: 'MANUAL', documents: [] })).status).toBe(400);
    expect((await submit({ registrySource: 'NOT_A_REGISTRY', documents: [firstFile] })).status).toBe(400);
    expect((await submit({ registrySource: 'MANUAL', documents: [firstFile, firstFile] })).status).toBe(400);
    const forged = await submit({ registrySource: 'MANUAL', documents: [{ ...firstFile, storageKey: `kyc/${w.tenants.opA}/x.pdf` }] });
    expect(forged.status).toBe(403);
    expect(await tenantStatus()).toBe('PENDING_KYC');

    // A double click: both requests race, exactly one submission is recorded.
    const body = {
      registrySource: 'MANUAL',
      licenseNumber: 'TR-2026-001',
      documents: [{ ...firstFile, mimeType: 'text/html' }, secondFile],
    };
    const [a, b] = await Promise.all([submit(body), submit(body)]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    firstSubmission = (a.status === 200 ? a : b).body.data.id;
    expect(await tenantStatus()).toBe('KYC_SUBMITTED');
    const history = (await asFounder('/tenants/me/kyc')).body.data;
    expect(history).toHaveLength(1);
    // The content type comes from the stored file, not the request.
    expect(history[0].documents[0].mimeType).toBe('application/pdf');
    expect(history[0].documents[1].mimeType).toBe('image/png');
    expect((await submit(body)).status).toBe(400);

    // Still pending: operational routes stay closed while under review.
    expect((await asFounder('/transport/vehicles')).status).toBe(401);
  });

  it('a rejection needs a reason, reaches the organization and keeps it restricted', async () => {
    expect((await ctx.http().put(api(`/admin/kyc/${firstSubmission}/reject`)).set(bearer(w.opA)).send({ reason: 'Unreadable' })).status).toBe(403);
    expect((await asAdmin('put', `/admin/kyc/${firstSubmission}/reject`, { reason: '  ' })).status).toBe(400);
    expect((await asAdmin('put', `/admin/kyc/${firstSubmission}/reject`, {})).status).toBe(400);

    const reason = 'The commercial registration scan is unreadable. Upload a clearer copy.';
    const rejected = await asAdmin('put', `/admin/kyc/${firstSubmission}/reject`, { reason });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.tenantStatus).toBe('KYC_REJECTED');
    expect(await tenantStatus()).toBe('KYC_REJECTED');

    // Decided once: neither decision can be taken again on this submission.
    expect((await asAdmin('put', `/admin/kyc/${firstSubmission}/approve`, {})).status).toBe(400);
    expect((await asAdmin('put', `/admin/kyc/${firstSubmission}/reject`, { reason: 'Again, differently' })).status).toBe(400);

    const history = (await asFounder('/tenants/me/kyc')).body.data;
    expect(history[0].rejectionReason).toBe(reason);
    expect(history[0].verifiedAt).toBeNull();
    expect((await asFounder('/auth/me')).body.data.tenant.status).toBe('KYC_REJECTED');
    expect((await asFounder('/transport/vehicles')).status).toBe(401);
  });

  let secondSubmission = '';
  it('the organization corrects and resubmits', async () => {
    const corrected = await upload(PDF, 'commercial-registration-clear.pdf');
    expect(corrected.status).toBe(201);
    const res = await ctx.http().post(api('/tenants/me/kyc')).set(auth()).send({
      registrySource: 'MANUAL', documents: [corrected.body.data, secondFile],
    });
    expect(res.status).toBe(200);
    secondSubmission = res.body.data.id;
    expect(await tenantStatus()).toBe('KYC_SUBMITTED');
    const history = (await asFounder('/tenants/me/kyc')).body.data;
    expect(history.map((h: any) => h.id)).toEqual([secondSubmission, firstSubmission]);
  });

  it('a suspension during review is lifted back to where verification stood', async () => {
    const suspended = await asAdmin('put', `/admin/tenants/${organizationId}/status`, { status: 'SUSPENDED', reason: 'Fraud check' });
    expect(suspended.status).toBe(200);
    expect((await asFounder('/tenants/me')).status).toBe(401);
    const detail = (await asAdmin('get', `/admin/tenants/${organizationId}`)).body.data;
    expect(detail.restoreStatus).toBe('KYC_SUBMITTED');
    expect(detail.verified).toBe(false);
    // Lifting to ACTIVE would skip review, so it is refused; lifting to the recorded status works.
    expect((await asAdmin('put', `/admin/tenants/${organizationId}/status`, { status: 'ACTIVE' })).status).toBe(400);
    expect((await asAdmin('put', `/admin/tenants/${organizationId}/status`, { status: 'KYC_SUBMITTED' })).status).toBe(200);
    expect(await tenantStatus()).toBe('KYC_SUBMITTED');
    expect((await asFounder('/tenants/me/kyc')).status).toBe(200);
  });

  let approvalNote = '';
  it('only approval activates, once, and the organization gets full access', async () => {
    expect((await ctx.http().put(api(`/admin/kyc/${secondSubmission}/approve`)).set(bearer(w.opA)).send({})).status).toBe(403);
    const [a, b] = await Promise.all([
      asAdmin('put', `/admin/kyc/${secondSubmission}/approve`, { notes: 'Registration verified by phone' }),
      asAdmin('put', `/admin/kyc/${secondSubmission}/approve`, { notes: 'Duplicate click' }),
    ]);
    expect([a.status, b.status].filter((s) => s === 200)).toHaveLength(1);
    // Whichever request won is the decision on record.
    approvalNote = a.status === 200 ? 'Registration verified by phone' : 'Duplicate click';
    expect([a.status, b.status].find((s) => s !== 200)).toBeGreaterThanOrEqual(400);
    expect(await tenantStatus()).toBe('ACTIVE');

    expect((await asFounder('/auth/me')).body.data.tenant.status).toBe('ACTIVE');
    expect((await asFounder('/transport/vehicles')).status).toBe(200);
    expect((await asFounder('/social/feed')).status).toBe(200);
    // The role still decides the rest.
    expect((await asFounder('/pilgrims')).status).toBe(403);
    expect((await asFounder('/admin/kyc')).status).toBe(403);
  });

  it('the review history and audit trail record both decisions', async () => {
    const records = (await asAdmin('get', `/admin/kyc?tenantId=${organizationId}`)).body.data as any[];
    expect(records.map((r) => r.id)).toEqual([secondSubmission, firstSubmission]);
    const [approved, rejected] = records;
    expect(approved.decisions).toEqual([
      expect.objectContaining({ decision: 'APPROVED', by: 'root@platform.test', notes: approvalNote }),
    ]);
    expect(rejected.decisions).toEqual([
      expect.objectContaining({ decision: 'REJECTED', by: 'root@platform.test', reason: expect.stringMatching(/unreadable/) }),
    ]);
    expect(approved.tenant.status).toBe('ACTIVE');
    const audit = await ctx.prisma.auditLog.count({ where: { resource: 'tenant_kyc', tenantId: organizationId } });
    expect(audit).toBeGreaterThanOrEqual(4); // two submissions, one rejection, one approval
  });

  it('a verified organization can be suspended and restored; the community cannot be suspended', async () => {
    expect((await asAdmin('put', `/admin/tenants/${organizationId}/status`, { status: 'SUSPENDED', reason: 'Chargebacks' })).status).toBe(200);
    expect((await asFounder('/transport/vehicles')).status).toBe(401);
    expect((await asAdmin('put', `/admin/tenants/${organizationId}/status`, { status: 'ACTIVE' })).status).toBe(200);
    expect((await asFounder('/transport/vehicles')).status).toBe(200);

    expect((await asAdmin('delete', `/admin/tenants/${organizationId}`)).status).toBe(200);
    expect((await asAdmin('get', `/admin/tenants/${organizationId}`)).body.data.restoreStatus).toBe('ACTIVE');
    expect((await asAdmin('put', `/admin/tenants/${organizationId}/status`, { status: 'SUSPENDED' })).status).toBe(400);
    expect((await asAdmin('put', `/admin/tenants/${organizationId}/status`, { status: 'ACTIVE' })).status).toBe(200);
    const restored = await ctx.prisma.tenant.findUniqueOrThrow({ where: { id: organizationId } });
    expect(restored.status).toBe('ACTIVE');
    expect(restored.deletedAt).toBeNull();

    expect((await asAdmin('put', `/admin/tenants/${w.tenants.community}/status`, { status: 'SUSPENDED' })).status).toBe(400);
    expect((await asAdmin('delete', `/admin/tenants/${w.tenants.community}`)).status).toBe(400);
    expect((await asAdmin('put', `/admin/tenants/${organizationId}/status`, { status: 'CHURNED' })).status).toBe(400);
  });

  it('an archived organization that never passed review is restored into review, not to ACTIVE', async () => {
    const pending = await ctx.prisma.tenant.create({
      data: { slug: `pending-${uniq()}`, name: 'Pending Hotel', type: 'VENDOR_HOTEL', status: 'KYC_REJECTED', email: 'p@hotel.test', country: 'SA' },
    });
    expect((await asAdmin('delete', `/admin/tenants/${pending.id}`)).status).toBe(200);
    expect((await asAdmin('put', `/admin/tenants/${pending.id}/status`, { status: 'ACTIVE' })).status).toBe(400);
    expect((await asAdmin('put', `/admin/tenants/${pending.id}/status`, { status: 'KYC_REJECTED' })).status).toBe(200);
    const back = await ctx.prisma.tenant.findUniqueOrThrow({ where: { id: pending.id } });
    expect(back.status).toBe('KYC_REJECTED');
    expect(back.deletedAt).toBeNull();
  });
});
