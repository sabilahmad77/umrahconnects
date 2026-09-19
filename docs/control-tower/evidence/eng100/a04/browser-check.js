// A04 browser checks — W16 / XT-R09 checkout (development sandbox path) and finance workflows.
//
// Drives the real UI through the real /login form, one browser context per
// identity (playwright-core + installed Google Chrome, headless). The API is
// used only to read back server state for assertions and to show that the API
// itself refuses an action the UI hides. Nothing here talks to Stripe: the
// deployment under test runs the sandbox gateway (development only).
//
// Usage:
//   PW=<path to playwright-core> WEB_URL=http://localhost:3404 API_URL=http://localhost:4404/api/v1 \
//   DEMO_PASSWORD=<seeded demo password> node browser-check.js
// Output: screenshots and browser-check-results.json next to this file (no tokens or passwords).
const { chromium } = require(process.env.PW || 'playwright-core');
const fs = require('fs');
const path = require('path');

const WEB = process.env.WEB_URL || 'http://localhost:3404';
const API = process.env.API_URL || 'http://localhost:4404/api/v1';
const PASSWORD = process.env.DEMO_PASSWORD;
const LISTING = process.env.LISTING_ID || '258f68fe-44ce-4b94-bd7e-4a74a6f7af34'; // per-seat coach, SAR 90, al-haramain-ksa
const OUT = __dirname;
const TRAVELER = 'traveler@umrahconnect.dev';
const FINANCE = 'finance@alharamain.sa';
const STAFF = 'staff@alharamain.sa';
if (!PASSWORD) throw new Error('Set DEMO_PASSWORD');

const results = [];
const check = (id, label, ok, detail = '') => {
  results.push({ id, label, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${label}${detail ? ` — ${detail}` : ''}`);
};
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const paramOf = (url, key) => new URL(url).searchParams.get(key);

async function apiLogin(email) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json();
  return body?.data?.accessToken;
}
async function api(token, method, p, body) {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, body: json };
}

async function session(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 90_000 });
  return { ctx, page };
}

async function bookListing(page, name) {
  await page.goto(`${WEB}/marketplace/${LISTING}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Book$/ }).click();
  await page.getByLabel('Customer Name').fill(name);
  // The listing form needs a start date; ten days ahead keeps it valid.
  await page.locator('input[type="date"]').first().fill(new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10));
  await page.getByRole('button', { name: /Create booking/ }).click();
  await page.getByText('Booking created').first().waitFor({ timeout: 20_000 });
}

/** The newest booking of the traveler (server read, for assertions). */
async function newestBooking(token) {
  const mine = await api(token, 'GET', '/marketplace/bookings/mine');
  return (mine.body?.data ?? []).find((b) => b.listing?.id === LISTING);
}

async function paymentsForBooking(financeToken, bookingId) {
  const res = await api(financeToken, 'GET', '/finance/payments?limit=100');
  return (res.body?.data?.items ?? []).filter((p) => p.listingBookingId === bookingId);
}

async function openPay(page) {
  await page.goto(`${WEB}/my-bookings`, { waitUntil: 'networkidle' });
  const card = page.locator('li').filter({ has: page.getByRole('button', { name: /Pay booking/ }) }).first();
  await card.getByRole('button', { name: /Pay booking/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText(/Development sandbox — no real card is charged/).waitFor({ timeout: 30_000 });
  await page.waitForURL((u) => UUID.test(new URL(u).searchParams.get('checkout') || ''), { timeout: 15_000 });
  return dialog;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const travelerToken = await apiLogin(TRAVELER);
  const financeToken = await apiLogin(FINANCE);
  const staffToken = await apiLogin(STAFF);

  // ── T1–T2 traveler books, pays through the sandbox path, sees the server's result ──
  const traveler = await session(browser, TRAVELER);
  const tp = traveler.page;
  const providers = await api(travelerToken, 'GET', '/payments/providers');
  check('T0', 'server reports the sandbox as the active provider (development)', providers.body?.data?.active === 'sandbox');

  await bookListing(tp, 'A04 Browser Traveler');
  const b1 = await newestBooking(travelerToken);
  check('T1', 'traveler booked the listing through the UI', b1 && b1.paymentStatus === 'UNPAID', `${b1?.currency} ${b1?.totalAmountCents / 100}`);

  let dialog = await openPay(tp);
  const pay1 = paramOf(tp.url(), 'checkout');
  check('T2a', 'checkout opens with the server amount and the labelled sandbox path', await dialog.getByText(/Amount due: SAR 90\.00/).isVisible(), pay1);
  check('T2b', 'the address bar carries only the attempt id', !/secret/i.test(tp.url()), tp.url().replace(WEB, ''));
  await shot(tp, 'a04-t2-checkout-sandbox');
  const beforePaid = await api(travelerToken, 'GET', `/payments/checkout/${pay1}`);
  check('T2c', 'nothing is paid before completion (server)', beforePaid.body?.data?.status === 'PENDING' && beforePaid.body?.data?.bookingPaymentStatus === 'UNPAID');

  // A double click on the completion button submits once.
  await dialog.getByRole('button', { name: /Complete test payment/ }).dblclick();
  await dialog.getByText('Payment confirmed').waitFor({ timeout: 20_000 });
  await shot(tp, 'a04-t2-confirmed');
  const after = await api(travelerToken, 'GET', `/payments/checkout/${pay1}`);
  check('T2d', 'booking shows paid only after the server says so', after.body?.data?.status === 'COMPLETED' && after.body?.data?.bookingPaymentStatus === 'PAID');
  const rows1 = await paymentsForBooking(financeToken, b1.id);
  check('T2e', 'double click created one payment attempt and one capture', rows1.length === 1 && rows1[0].status === 'COMPLETED', `${rows1.length} payment row(s)`);

  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  const card1 = tp.locator('li').filter({ hasText: 'Makkah' }).first();
  await tp.waitForTimeout(800);
  check('T2f', 'booking card shows Paid', (await card1.getByTestId('booking-payment-status').textContent()) === 'Paid');
  await tp.reload({ waitUntil: 'networkidle' });
  const firstStatus = await tp.getByTestId('booking-payment-status').first().textContent();
  check('T2g', 'paid state persists after a refresh (server)', firstStatus === 'Paid', firstStatus);

  // ── T3 refresh mid-flow, second tab, duplicate completion ──
  await bookListing(tp, 'A04 Two Tabs');
  const b2 = await newestBooking(travelerToken);
  dialog = await openPay(tp);
  const pay2 = paramOf(tp.url(), 'checkout');
  await tp.reload({ waitUntil: 'networkidle' });
  await tp.getByRole('dialog').getByText(/Development sandbox/).waitFor({ timeout: 30_000 });
  check('T3a', 'a reload mid-checkout reopens the same attempt from the server', paramOf(tp.url(), 'checkout') === pay2, pay2);

  const tab2 = await traveler.ctx.newPage();
  await tab2.goto(`${WEB}/my-bookings`, { waitUntil: 'networkidle' });
  await tab2.locator('li').filter({ has: tab2.getByRole('button', { name: /Pay booking/ }) }).first().getByRole('button', { name: /Pay booking/ }).click();
  await tab2.getByRole('dialog').getByText(/Development sandbox/).waitFor({ timeout: 30_000 });
  await tab2.waitForURL((u) => UUID.test(new URL(u).searchParams.get('checkout') || ''));
  check('T3b', 'a second tab resumes the same attempt (no second payment)', paramOf(tab2.url(), 'checkout') === pay2);
  await tab2.getByRole('dialog').getByRole('button', { name: /Complete test payment/ }).click();
  await tab2.getByRole('dialog').getByText('Payment confirmed').waitFor({ timeout: 20_000 });
  // The first tab still shows the form; completing it again cannot charge twice.
  await tp.getByRole('dialog').getByRole('button', { name: /Complete test payment/ }).click();
  await tp.getByRole('dialog').getByText('Payment confirmed').waitFor({ timeout: 20_000 });
  await shot(tp, 'a04-t3-second-tab-confirmed');
  const rows2 = await paymentsForBooking(financeToken, b2.id);
  check('T3c', 'two tabs, one payment: the stale tab shows the server result', rows2.length === 1 && rows2[0].status === 'COMPLETED', `${rows2.length} payment row(s)`);
  await tab2.close();

  // ── T4 decline, then retry ──
  await bookListing(tp, 'A04 Decline');
  const b3 = await newestBooking(travelerToken);
  dialog = await openPay(tp);
  const pay3 = paramOf(tp.url(), 'checkout');
  await dialog.getByRole('button', { name: /Simulate a declined card/ }).click();
  await dialog.getByText('Payment not completed').waitFor({ timeout: 20_000 });
  check('T4a', 'a decline says no money was taken', await dialog.getByText(/No money was taken/).isVisible());
  await shot(tp, 'a04-t4-declined');
  const declined = await api(travelerToken, 'GET', `/payments/checkout/${pay3}`);
  check('T4b', 'server: attempt failed, booking still unpaid', declined.body?.data?.status === 'FAILED' && declined.body?.data?.bookingPaymentStatus === 'UNPAID');
  await dialog.getByRole('button', { name: /Try again/ }).click();
  await dialog.getByText(/Development sandbox/).waitFor({ timeout: 20_000 });
  await tp.waitForURL((u) => (new URL(u).searchParams.get('checkout') || '') !== pay3);
  const pay3b = paramOf(tp.url(), 'checkout');
  check('T4c', 'retry opens a fresh attempt', pay3b && pay3b !== pay3);
  await dialog.getByRole('button', { name: /Complete test payment/ }).click();
  await dialog.getByText('Payment confirmed').waitFor({ timeout: 20_000 });
  const rows3 = await paymentsForBooking(financeToken, b3.id);
  check('T4d', 'after the retry: one failed and one completed attempt', rows3.map((p) => p.status).sort().join(',') === 'COMPLETED,FAILED');

  // ── F1 finance manager: draft → issue → sandbox card payment → manual payment → refund ──
  const finance = await session(browser, FINANCE);
  const fp = finance.page;
  await fp.goto(`${WEB}/finance`, { waitUntil: 'networkidle' });
  await fp.getByRole('button', { name: /New invoice/ }).click();
  await fp.getByLabel(/Customer name/).fill('A04 Browser Payer');
  await fp.getByLabel(/Subtotal/).fill('500');
  await fp.getByLabel(/^Tax$/).fill('75');
  await fp.getByRole('button', { name: /Create draft/ }).click();
  await fp.waitForURL(/\/finance\/invoices\//, { timeout: 30_000 });
  const invoiceId = fp.url().match(UUID)[0];
  await fp.getByTestId('invoice-status').filter({ hasText: 'DRAFT' }).waitFor();
  check('F1a', 'finance manager created a draft invoice (total 575.00 computed by the server)', await fp.getByText('SAR 575.00').first().isVisible(), invoiceId);
  await fp.getByRole('button', { name: 'Issue invoice' }).click();
  await fp.getByTestId('invoice-status').filter({ hasText: 'ISSUED' }).waitFor({ timeout: 15_000 });
  check('F1b', 'invoice issued', true);
  await fp.getByRole('tab', { name: 'payments' }).click();
  await fp.locator('#card-amount').fill('200');
  await fp.getByRole('button', { name: /Continue to secure payment/ }).click();
  await fp.getByText(/Development sandbox/).waitFor({ timeout: 20_000 });
  await shot(fp, 'a04-f1-card-sandbox');
  await fp.getByRole('button', { name: /Complete test payment/ }).click();
  await fp.getByText('Payment confirmed').waitFor({ timeout: 20_000 });
  await fp.getByRole('button', { name: /^Done$/ }).click();
  await fp.reload({ waitUntil: 'networkidle' });
  const inv1 = await api(financeToken, 'GET', `/finance/invoices/${invoiceId}`);
  check('F1c', 'card payment recorded by the server; invoice partially paid', inv1.body?.data?.status === 'PARTIALLY_PAID' && inv1.body?.data?.paidCents === 20_000);
  const cardPayment = (inv1.body?.data?.payments ?? []).find((p) => p.gateway === 'sandbox' && p.status === 'COMPLETED');

  await fp.getByRole('tab', { name: 'payments' }).click();
  await fp.getByLabel(/^Amount \(SAR\)/).fill('375');
  await fp.getByRole('button', { name: /Record payment/ }).dblclick();
  await fp.getByText(/Payment recorded|already recorded/).first().waitFor({ timeout: 15_000 });
  const inv2 = await api(financeToken, 'GET', `/finance/invoices/${invoiceId}`);
  const manual = (inv2.body?.data?.payments ?? []).filter((p) => p.gateway === 'bank_transfer');
  check('F1d', 'manual payment (double click) recorded once; invoice paid', inv2.body?.data?.status === 'PAID' && manual.length === 1, `${manual.length} manual row(s)`);

  await fp.reload({ waitUntil: 'networkidle' });
  await fp.getByRole('tab', { name: 'payments' }).click();
  await fp.getByRole('button', { name: /Refund payment of SAR 200\.00/ }).click();
  const refundDialog = fp.getByRole('dialog');
  await refundDialog.getByLabel(/Amount/).fill('50');
  await refundDialog.getByLabel('Reason').fill('Goodwill gesture');
  await shot(fp, 'a04-f1-refund-dialog');
  await refundDialog.getByRole('button', { name: /^Refund$/ }).click();
  await fp.getByText(/Refund sent through sandbox/).first().waitFor({ timeout: 15_000 });
  const inv3 = await api(financeToken, 'GET', `/finance/invoices/${invoiceId}`);
  const refunded = (inv3.body?.data?.payments ?? []).find((p) => p.id === cardPayment?.id);
  check('F1e', 'partial refund through the gateway; invoice back to partially paid', refunded?.status === 'PARTIALLY_REFUNDED' && refunded?.refundedCents === 5_000 && inv3.body?.data?.paidCents === 52_500 && inv3.body?.data?.status === 'PARTIALLY_PAID');
  await fp.reload({ waitUntil: 'networkidle' });
  await fp.getByRole('tab', { name: 'payments' }).click();
  await shot(fp, 'a04-f1-after-refund');

  // ── F2 staff without refund (or payment) capability ──
  const staff = await session(browser, STAFF);
  const sp = staff.page;
  await sp.goto(`${WEB}/finance/invoices/${invoiceId}`, { waitUntil: 'networkidle' });
  await sp.getByRole('tab', { name: 'payments' }).click();
  await sp.getByText('Payments (').first().waitFor();
  const refundButtons = await sp.getByRole('button', { name: /^Refund payment/ }).count();
  check('F2a', 'staff without finance:payment:refund sees no refund action', refundButtons === 0 && (await sp.getByText(/Refunds need the refund permission/).isVisible()));
  // The panel shows "Checking payment options…" until the capabilities and provider load.
  const viewOnly = await sp.getByText('View only').waitFor({ timeout: 20_000 }).then(() => true, () => false);
  check('F2b', 'staff without finance:payment:process sees the card panel as view only', viewOnly);
  await shot(sp, 'a04-f2-staff-view-only');
  const refused = await api(staffToken, 'POST', `/payments/${cardPayment.id}/refund`, { amount: 1, reason: 'not allowed' });
  check('F2c', 'the API refuses the refund for staff (403)', refused.status === 403, `HTTP ${refused.status}`);
  const refusedManual = await api(staffToken, 'POST', `/finance/invoices/${invoiceId}/payments`, { amount: 1, method: 'cash', idempotencyKey: `staff-${Date.now()}` });
  check('F2d', 'the API refuses manual payment recording for staff (403)', refusedManual.status === 403, `HTTP ${refusedManual.status}`);

  // ── F3 finance manager refunds the traveler's marketplace payment from the payments list ──
  await fp.goto(`${WEB}/finance-payments`, { waitUntil: 'networkidle' });
  const row = fp.locator('tr').filter({ hasText: 'Marketplace booking' }).filter({ hasText: 'SAR 90.00' }).first();
  await row.getByRole('button', { name: 'Refund' }).click();
  const rd = fp.getByRole('dialog');
  await rd.getByLabel('Reason').fill('Traveler cancelled with the provider');
  await rd.getByRole('button', { name: /^Refund$/ }).click();
  await fp.getByText(/Refund sent through sandbox/).first().waitFor({ timeout: 15_000 });
  const mineAfter = await api(travelerToken, 'GET', '/marketplace/bookings/mine');
  const refundedBookings = (mineAfter.body?.data ?? []).filter((b) => b.paymentStatus === 'REFUNDED');
  check('F3a', 'a full refund of a marketplace payment marks the traveler booking refunded', refundedBookings.length >= 1);
  await tp.goto(`${WEB}/my-bookings`, { waitUntil: 'networkidle' });
  await shot(tp, 'a04-f3-traveler-refunded');

  await browser.close();
  const passed = results.filter((r) => r.ok).length;
  fs.writeFileSync(
    path.join(OUT, 'browser-check-results.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), web: WEB, provider: 'sandbox (development only — not Stripe)', passed, total: results.length, results }, null, 2),
  );
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
