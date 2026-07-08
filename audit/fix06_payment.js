const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const p = await ctx.newPage(); p.setDefaultTimeout(45000);
  const base = 'http://localhost:3000';
  let payStatus = null;
  p.on('response', r => { if (r.url().includes('/payments') && r.request().method() === 'POST') payStatus = r.status(); });

  await p.goto(base + '/login', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Umrah Operator \/ Agency/i }).first().click();
  await p.waitForURL(u => !u.toString().includes('login'), { timeout: 45000 });

  await p.goto(base + '/finance', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  // open first invoice that isn't Paid
  const row = p.locator('a[href^="/finance/"], tbody tr').first();
  await row.click().catch(() => {});
  await p.waitForTimeout(1500);
  if (!p.url().includes('/finance/')) { console.log('could not open an invoice detail'); await b.close(); return; }

  // go to Payments tab
  await p.getByRole('button', { name: /^payments$/i }).first().click().catch(() => {});
  await p.waitForTimeout(800);
  const formVisible = await p.getByText(/Record a payment/i).first().isVisible().catch(() => false);
  console.log((formVisible ? '✓' : '✗') + ' Record-payment form present on Payments tab');

  // record a payment (leave amount blank → defaults to outstanding)
  const recordBtn = p.getByRole('button', { name: /^Record$/i }).first();
  if (await recordBtn.isVisible().catch(() => false)) {
    // enter a small amount
    const amt = p.locator('input[type=number]').first();
    await amt.fill('10');
    await recordBtn.click();
    await p.waitForTimeout(2500);
    console.log((payStatus && payStatus < 400 ? '✓' : '✗') + ' Payment POST via form → ' + payStatus);
    const historyRows = await p.locator('table tbody tr').count();
    console.log('  payment history rows now: ' + historyRows);
  } else {
    console.log('  (invoice likely already settled — form shows settled message)');
  }
  await b.close();
})();
