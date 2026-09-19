// A04 browser check — operator booking money, packages and budget plans
// (section 9). Real /login form, one context per identity. Same usage as browser-check.js.
const { chromium } = require(process.env.PW || 'playwright-core');
const fs = require('fs');
const path = require('path');
const WEB = process.env.WEB_URL || 'http://localhost:3404';
const API = process.env.API_URL || 'http://localhost:4404/api/v1';
const PASSWORD = process.env.DEMO_PASSWORD;
if (!PASSWORD) throw new Error('Set DEMO_PASSWORD');
const results = [];
const check = (id, label, ok, detail = '') => {
  results.push({ id, label, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${label}${detail ? ` — ${detail}` : ''}`);
};
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
async function apiLogin(email) {
  const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  return (await res.json())?.data?.accessToken;
}
async function api(token, method, p, body) {
  const res = await fetch(`${API}${p}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function session(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 90_000 });
  return page;
}
const shot = (page, name) => page.screenshot({ path: path.join(__dirname, `${name}.png`) });

(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const adminToken = await apiLogin('admin@alharamain.sa');
  const stamp = Date.now().toString(36);

  // ── packages ──
  const ap = await session(browser, 'admin@alharamain.sa');
  await ap.goto(`${WEB}/packages`, { waitUntil: 'networkidle' });
  await ap.getByRole('button', { name: /New package/ }).first().click();
  await ap.getByLabel('Name').fill(`A04 Package ${stamp}`);
  await ap.getByLabel('Price Adult').fill('1000.50');
  await ap.getByLabel('Duration Days').fill('10');
  await ap.getByRole('button', { name: /Create package/ }).click();
  await ap.getByText('Package created').first().waitFor({ timeout: 15_000 });
  await ap.reload({ waitUntil: 'networkidle' });
  const pkgCard = ap.locator('div').filter({ hasText: `A04 Package ${stamp}` }).last();
  check('P1', 'package created with an exact price and it persists', await ap.getByText(`A04 Package ${stamp}`).isVisible() && (await ap.getByText('SAR 1,000.50').first().isVisible()));
  check('P2', 'trip type shown from the stored field', (await pkgCard.textContent()).includes('UMRAH'));
  const pkgs = (await api(adminToken, 'GET', '/packages')).body?.data?.items ?? [];
  const pkg = pkgs.find((p) => p.name === `A04 Package ${stamp}`);

  // ── booking with deposit: derived status, read-only money ──
  await ap.goto(`${WEB}/bookings`, { waitUntil: 'networkidle' });
  await ap.getByRole('button', { name: /New booking/ }).click();
  const modal = ap.locator('[role="dialog"]');
  await modal.locator('select').first().selectOption(pkg.id);
  await modal.getByLabel(/Travellers priced/).fill('2');
  await modal.getByText('SAR 2,001.00').first().waitFor();
  check('B1', 'the form shows the server price (package x travellers)', true);
  await modal.getByLabel(/Deposit received/).fill('3000');
  await modal.getByRole('button', { name: /Create booking/ }).click();
  await modal.getByText('The deposit cannot be more than the total.').waitFor({ timeout: 5_000 });
  check('B2', 'a deposit above the total is refused before submit', true);
  await modal.getByLabel(/Deposit received/).fill('500');
  await modal.getByRole('button', { name: /Create booking/ }).click();
  await ap.getByText('Booking created').first().waitFor({ timeout: 15_000 });
  const list = (await api(adminToken, 'GET', '/bookings?limit=5')).body?.data?.items ?? [];
  const booking = list.find((b) => b.packageId === pkg.id);
  check('B3', 'booking created with the server total and a derived paid status', booking && booking.totalAmountCents === 200_100 && booking.paidAmountCents === 50_000 && booking.status === 'PARTIALLY_PAID', `${booking?.status} ${booking?.paidAmountCents}/${booking?.totalAmountCents}`);

  await ap.goto(`${WEB}/bookings/${booking.id}`, { waitUntil: 'networkidle' });
  await ap.getByRole('tab', { name: 'payment' }).click();
  check('B4', 'booking money is read-only (no paid-amount input)', (await ap.locator('input[type="number"]').count()) === 0 && (await ap.getByTestId('booking-paid').first().textContent()) === 'SAR 500.00');
  await ap.getByRole('button', { name: /Create invoice from booking/ }).click();
  await ap.waitForURL(/\/finance\/invoices\//, { timeout: 20_000 });
  const invoiceId = ap.url().match(UUID)[0];
  const inv = (await api(adminToken, 'GET', `/finance/invoices/${invoiceId}`)).body?.data;
  check('B5', 'the invoice carries the deposit as a payment record', inv?.paidCents === 50_000 && inv.payments?.some((p) => p.gateway === 'booking_deposit'));
  await ap.getByRole('button', { name: 'Issue invoice' }).click();
  await ap.getByTestId('invoice-status').filter({ hasText: 'PARTIALLY PAID' }).waitFor({ timeout: 15_000 });
  check('B6', 'issuing an invoice that carries money derives its paid status', true);
  await ap.getByRole('tab', { name: 'payments' }).click();
  await ap.getByLabel(/^Amount \(SAR\)/).fill('1501');
  await ap.getByRole('button', { name: /Record payment/ }).click();
  await ap.getByText(/Payment recorded/).first().waitFor({ timeout: 15_000 });
  const after = (await api(adminToken, 'GET', `/bookings/${booking.id}`)).body?.data;
  check('B7', 'paying the invoice moves the booking to fully paid', after?.status === 'FULLY_PAID' && after?.paidAmountCents === 200_100, `${after?.status} ${after?.paidAmountCents}`);
  await ap.goto(`${WEB}/bookings/${booking.id}`, { waitUntil: 'networkidle' });
  await ap.getByRole('tab', { name: 'payment' }).click();
  await shot(ap, 'a04-b7-booking-paid-from-invoice');

  // ── staff: no cancel, no invoicing ──
  const sp = await session(browser, 'staff@alharamain.sa');
  await sp.goto(`${WEB}/bookings/${booking.id}`, { waitUntil: 'networkidle' });
  await sp.getByTestId('booking-status').waitFor();
  check('S1', 'staff without booking:booking:cancel sees no cancel action', (await sp.getByRole('button', { name: 'Cancel booking' }).count()) === 0);
  await sp.goto(`${WEB}/packages`, { waitUntil: 'networkidle' });
  check('S2', 'staff without booking:package:manage sees no new-package action', (await sp.getByRole('button', { name: /New package/ }).count()) === 0);

  // ── budget plans ──
  const fp = await session(browser, 'finance@alharamain.sa');
  await fp.goto(`${WEB}/budget-plans`, { waitUntil: 'networkidle' });
  await fp.getByRole('button', { name: /New budget plan/ }).click();
  await fp.getByLabel('Client name *').fill(`A04 Plan ${stamp}`);
  await fp.getByLabel('Travel from').fill('2026-12-10');
  await fp.getByLabel('Travel to').fill('2026-12-01');
  await fp.getByRole('button', { name: /Create plan/ }).click();
  await fp.getByText('The travel end date cannot be before the start date').first().waitFor({ timeout: 5_000 });
  check('BP1', 'plan dates in the wrong order are refused', true);
  await fp.getByLabel('Travel to').fill('2026-12-20');
  await fp.getByLabel('Hotel budget').fill('4000');
  await fp.getByLabel('Commission rate (%)').fill('5');
  await fp.getByRole('button', { name: /Create plan/ }).click();
  await fp.getByText('Budget plan created').first().waitFor({ timeout: 10_000 });
  const financeToken = await apiLogin('finance@alharamain.sa');
  const plans = (await api(financeToken, 'GET', '/finance/budget-plans')).body?.data?.items ?? [];
  const plan = plans.find((p) => p.clientName === `A04 Plan ${stamp}`);
  check('BP2', 'plan stored with total and commission computed by the server', plan?.totalBudgetCents === 400_000 && plan?.commissionCents === 20_000);
  const select = fp.getByRole('combobox', { name: new RegExp(`Status of ${plan.planRef}`) });
  const options = await select.locator('option').allTextContents();
  check('BP3', 'status offers only the moves the server allows', options.join(',') === 'DRAFT,PROPOSED,ACCEPTED,CANCELLED', options.join(','));
  const bad = await api(financeToken, 'PUT', `/finance/budget-plans/${plan.id}`, { status: 'COMPLETED' });
  check('BP4', 'the API refuses an invalid plan move', bad.status === 400, `HTTP ${bad.status}`);
  await shot(fp, 'a04-bp-budget-plans');

  await browser.close();
  const passed = results.filter((r) => r.ok).length;
  fs.writeFileSync(path.join(__dirname, 'browser-check-bookings-results.json'), JSON.stringify({ ranAt: new Date().toISOString(), passed, total: results.length, results }, null, 2));
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
