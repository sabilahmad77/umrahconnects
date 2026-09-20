import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as bcrypt from 'bcryptjs';
import { api, createTestApp, TestContext } from './app';
import { bearer, buildWorld, PASSWORD, World } from './fixtures';

/**
 * Closing an invoice is an approval decision.
 *
 * `PUT /finance/invoices/:id/status` and `PUT /finance/invoices/:id/void` both require
 * `finance:invoice:approve`, but the generic `PUT /finance/invoices/:id` only requires
 * `finance:invoice:create` and used to accept `status: VOID | CANCELLED` — so a custom
 * tenant role holding create without approve could close an invoice anyway (found by FX1
 * while fixing the payment-cancellation defects). No system role has create without
 * approve, which is why nothing else caught it.
 */
describe('finance: closing an invoice needs the approval capability', () => {
  let ctx: TestContext;
  let w: World;
  let token: string;
  let invoiceId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);

    // A custom role of the operator organization: issue and edit invoices, never approve.
    const role = await ctx
      .http()
      .post(api('/rbac/roles'))
      .set(bearer(w.opA))
      .send({
        name: `biller-${Date.now().toString(36)}`,
        permissions: ['finance:invoice:read', 'finance:invoice:create'],
      });
    expect(role.status).toBeLessThan(300);

    const email = `biller.${Date.now().toString(36)}@people.test`;
    const user = await ctx.prisma.user.create({
      data: {
        tenantId: w.tenants.opA,
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        firstName: 'Billing',
        lastName: 'Only',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    const assigned = await ctx
      .http()
      .post(api('/rbac/assign'))
      .set(bearer(w.opA))
      .send({ userId: user.id, roleId: role.body.data.id });
    expect(assigned.status).toBeLessThan(300);

    const signIn = await ctx.http().post(api('/auth/login')).send({ email, password: PASSWORD });
    expect(signIn.status).toBe(200);
    token = signIn.body.data.accessToken;

    const invoice = await ctx
      .http()
      .post(api('/finance/invoices'))
      .set('Authorization', `Bearer ${token}`)
      .send({ issuedToName: 'Closing test', currency: 'SAR', subtotalCents: 25_000 });
    expect(invoice.status).toBeLessThan(300);
    invoiceId = invoice.body.data.id;
  });

  afterAll(async () => ctx?.close());

  const put = (body: Record<string, unknown>) =>
    ctx.http().put(api(`/finance/invoices/${invoiceId}`)).set('Authorization', `Bearer ${token}`).send(body);

  it('refuses VOID and CANCELLED through the generic update, and the invoice does not change', async () => {
    for (const status of ['VOID', 'CANCELLED']) {
      const res = await put({ status });
      expect([status, res.status]).toEqual([status, 403]);
      expect(res.body.error.code).toBe('INVOICE_CLOSE_REQUIRES_APPROVAL');
      const after = await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
      expect(after.status).toBe('DRAFT');
    }
  });

  it('refuses the dedicated close routes too, and still allows the edits the role may make', async () => {
    const viaStatus = await ctx
      .http()
      .put(api(`/finance/invoices/${invoiceId}/status`))
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'VOID' });
    expect(viaStatus.status).toBe(403);
    const viaVoid = await ctx
      .http()
      .put(api(`/finance/invoices/${invoiceId}/void`))
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(viaVoid.status).toBe(403);

    const issued = await put({ status: 'ISSUED' });
    expect(issued.status).toBeLessThan(300);
    expect((await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).status).toBe('ISSUED');
  });
});
