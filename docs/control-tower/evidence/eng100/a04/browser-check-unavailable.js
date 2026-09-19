// A04 browser check — provider unavailable state. The API runs with
// PAYMENT_PROVIDER=stripe and no Stripe keys (as a deployment would before its
// keys are set): checkout and the staff card panel must say so honestly, start
// nothing, and fall back to manual recording. Same usage as browser-check.js.
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
async function apiLogin(email) {
  const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  return (await res.json())?.data?.accessToken;
}
async function api(token, method, p) {
  const res = await fetch(`${API}${p}`, { method, headers: { Authorization: `Bearer ${token}` } });
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
(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const travelerToken = await apiLogin('traveler@umrahconnect.dev');
  const providers = await api(travelerToken, 'GET', '/payments/providers');
  const stripe = providers.body?.data?.providers?.find((p) => p.name === 'stripe');
  check('U0', 'server reports Stripe active but not configured', providers.body?.data?.active === 'stripe' && stripe?.configured === false);
  const mine = (await api(travelerToken, 'GET', '/marketplace/bookings/mine')).body?.data ?? [];
  const before = mine.length;

  const tp = await session(browser, 'traveler@umrahconnect.dev');
  await tp.goto(`${WEB}/my-bookings`, { waitUntil: 'networkidle' });
  const payButtons = tp.getByRole('button', { name: /Pay booking|Pay the balance/ });
  if ((await payButtons.count()) > 0) {
    await payButtons.first().click();
    const dialog = tp.getByRole('dialog');
    await dialog.getByText('Card payments are not available').waitFor({ timeout: 20_000 });
    check('U1', 'traveler checkout says card payments are not available and starts nothing', (await dialog.getByText(/No payment was started/).isVisible()) && !/checkout=/.test(tp.url()));
    await tp.screenshot({ path: path.join(__dirname, 'a04-u1-provider-unavailable.png') });
  } else {
    check('U1', 'traveler has an unpaid booking to try', false, 'no payable booking found');
  }

  const fp = await session(browser, 'finance@alharamain.sa');
  const financeToken = await apiLogin('finance@alharamain.sa');
  const invoices = (await api(financeToken, 'GET', '/finance/invoices?status=PARTIALLY_PAID&limit=5')).body?.data?.items ?? [];
  if (invoices[0]) {
    await fp.goto(`${WEB}/finance/invoices/${invoices[0].id}`, { waitUntil: 'networkidle' });
    await fp.getByRole('tab', { name: 'payments' }).click();
    await fp.getByText('Card payments are not available').first().waitFor({ timeout: 20_000 });
    check('U2', 'staff card panel is honest and points to manual recording', await fp.getByText(/Record cash or bank transfers below instead/).isVisible());
    check('U3', 'manual payment recording stays available', await fp.getByRole('button', { name: /Record payment/ }).isVisible());
    await fp.screenshot({ path: path.join(__dirname, 'a04-u2-staff-provider-unavailable.png') });
  }
  const checkout = await fetch(`${API}/payments/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${travelerToken}` }, body: JSON.stringify({ listingBookingId: mine.find((b) => b.paymentStatus !== 'PAID' && !['CANCELLED','REFUNDED','COMPLETED'].includes(b.status))?.id }) });
  check('U4', 'the API answers 503 instead of pretending (checkout)', checkout.status === 503, `HTTP ${checkout.status}`);
  const after = ((await api(travelerToken, 'GET', '/marketplace/bookings/mine')).body?.data ?? []).length;
  check('U5', 'no booking or payment was created by trying', after === before);
  await browser.close();
  const passed = results.filter((r) => r.ok).length;
  fs.writeFileSync(path.join(__dirname, 'browser-check-unavailable-results.json'), JSON.stringify({ ranAt: new Date().toISOString(), provider: 'stripe selected, keys absent', passed, total: results.length, results }, null, 2));
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
