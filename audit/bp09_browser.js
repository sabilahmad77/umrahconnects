// BP-09 browser proof: taking a card payment through the provider abstraction
// from the invoice screen — sandbox honesty banner, authorise+capture, a
// deterministic decline, the gateway transaction trail, and a refund — with a
// hard reload proving the invoice really moved.
const { chromium } = require('playwright-core');
const BASE = process.env.WEB_URL || 'http://localhost:3000';
const API = process.env.API_URL || 'http://localhost:4000/api/v1';

(async () => {
  const b = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const p = await b.newPage();
  let pass = 0, fail = 0;
  const chk = (label, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✓' : '✗'} ${label} ${extra}`); };
  let nativeDialog = false;
  p.on('dialog', async (d) => { nativeDialog = true; await d.dismiss(); });

  const until = async (fn, timeout = 25000, step = 300) => {
    const deadline = Date.now() + timeout;
    for (;;) {
      try { if (await fn()) return true; } catch { /* retry */ }
      if (Date.now() > deadline) return false;
      await p.waitForTimeout(step);
    }
  };

  await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await p.fill('input[type="email"]', 'admin@alharamain.sa');
  await p.fill('input[type="password"]', 'Admin@1234');
  await p.getByRole('button', { name: /^Sign in$/i }).click();
  await p.waitForURL((u) => !u.toString().includes('login'), { timeout: 90000 });

  // Create an invoice with a known balance up front, so the run does not
  // depend on whatever balance the seed data happens to have left.
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@alharamain.sa', password: 'Admin@1234' }),
  }).then((r) => r.json());
  const token = login?.data?.accessToken;
  const invoice = await fetch(`${API}/finance/invoices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      issuedToName: 'BP09 Browser Payer', subtotal: 500, total: 500,
      currency: 'SAR', status: 'ISSUED', type: 'CUSTOMER',
    }),
  }).then((r) => r.json());
  const invoiceId = invoice?.data?.id;
  chk('fixture invoice created with a known balance', !!invoiceId, String(invoiceId).slice(0, 8));

  const invoiceUrl = `${BASE}/finance/invoices/${invoiceId}`;
  await p.goto(invoiceUrl, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /^payments$/i }).first().click().catch(() => {});
  const opened = await until(() => p.getByLabel('Payment amount').isVisible());
  chk('invoice payments tab opens with the gateway panel', opened, p.url());

  // The provider badge arrives with its own query — wait for it rather than
  // reading the body before it has landed.
  chk('active provider is shown on the invoice',
    await until(async () => /sandbox|stripe/i.test(await p.textContent('body'))));
  const body0 = await p.textContent('body');
  chk('sandbox is labelled as moving no real money',
    !/sandbox/i.test(body0) || /moves no real money/i.test(body0));

  // ── a declined authorisation is surfaced, not swallowed ────────────────
  await p.getByLabel('Payment amount').fill('25');
  await p.getByLabel('Sandbox outcome').selectOption('decline_at_intent');
  await p.getByRole('button', { name: /Authorise & capture/i }).click();
  chk('a declined authorisation is reported to the operator',
    await until(async () => /declined at authorisation/i.test(await p.textContent('body'))));

  // ── a successful capture ───────────────────────────────────────────────
  await p.getByLabel('Payment amount').fill('30');
  await p.getByLabel('Sandbox outcome').selectOption('succeed');
  await p.getByRole('button', { name: /Authorise & capture/i }).click();
  chk('capture succeeds and is confirmed to the operator',
    await until(async () => /Captured\s+SAR/i.test(await p.textContent('body'))));
  chk('the gateway trail shows the intent and the capture',
    await until(async () => {
      const t = await p.textContent('body');
      return t.includes('INTENT_CREATED') && t.includes('CAPTURED');
    }));

  // ── hard reload: the invoice really moved ──────────────────────────────
  await p.goto(invoiceUrl, { waitUntil: 'networkidle' });
  await p.reload({ waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /^payments$/i }).first().click().catch(() => {});
  await until(() => p.getByLabel('Payment amount').isVisible());
  const afterReload = await p.textContent('body');
  chk('the captured payment SURVIVES hard reload (listed against the invoice)',
    /COMPLETED|Completed|Paid|Partial/i.test(afterReload));

  // ── refund behind a confirmation that requires a reason ────────────────
  await p.getByLabel('Payment amount').fill('20');
  await p.getByLabel('Sandbox outcome').selectOption('succeed');
  await p.getByRole('button', { name: /Authorise & capture/i }).click();
  await until(async () => /Captured\s+SAR/i.test(await p.textContent('body')));
  await p.getByRole('button', { name: /^Refund$/ }).first().click();
  const dlg = p.getByRole('dialog');
  chk('refund asks for confirmation (role=dialog)', await until(() => dlg.isVisible()));
  const refundBtn = dlg.getByRole('button', { name: /^Refund$/ });
  chk('refund is blocked until a reason is given', await refundBtn.isDisabled());
  await dlg.locator('textarea').fill('Duplicate charge');
  chk('refund unlocks once a reason is typed', await refundBtn.isEnabled());
  await refundBtn.click();
  chk('refund is processed and reported',
    await until(async () => /Refund processed|refunded/i.test(await p.textContent('body'))));

  chk('no native confirm()/prompt() in the payment flow', !nativeDialog);

  console.log(`\nBP-09 browser: ${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
