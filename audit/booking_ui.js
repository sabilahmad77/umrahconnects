const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const p = await ctx.newPage(); p.setDefaultTimeout(30000);
  let bookingResp = null;
  p.on('response', r => { if (r.url().includes('/bookings') && r.request().method() === 'POST') bookingResp = r.status(); });
  await p.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Umrah Operator \/ Agency/i }).first().click();
  await p.waitForURL(u => !u.toString().includes('login'), { timeout: 30000 });

  await p.goto('http://localhost:3000/bookings', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  const before = await p.locator('table tbody tr, [data-booking-row]').count().catch(() => 0);
  await p.getByRole('button', { name: /New booking|Add booking|Create booking/i }).first().click();
  await p.waitForTimeout(900);
  // fill total amount (required); package + lead pilgrim auto-selected from first option
  const amount = p.locator('div.fixed input[type=number], div.fixed input').filter({ hasNot: p.locator('[type=hidden]') });
  // find the total amount input by placeholder or just fill a number field
  const numInputs = p.locator('div.fixed input[type=number]');
  const nNum = await numInputs.count();
  // The total amount field — fill all number inputs minimally, set a clear total
  if (nNum > 0) { await numInputs.first().fill('3').catch(()=>{}); }
  // Try labelled total
  const totalField = p.locator('div.fixed input').filter({ hasText: '' });
  // Just submit; suggestedSar may auto-fill from package
  const createBtn = p.locator('div.fixed').getByRole('button', { name: /Create booking|Save|Confirm|Add booking|^Create$/i }).last();
  // ensure an amount: type into any empty text/number input that looks like amount
  const allInputs = p.locator('div.fixed input');
  const cnt = await allInputs.count();
  for (let i = 0; i < cnt; i++) {
    const ph = await allInputs.nth(i).getAttribute('placeholder') || '';
    const type = await allInputs.nth(i).getAttribute('type') || '';
    if (/amount|total|sar|price/i.test(ph) || (type === 'number')) { await allInputs.nth(i).fill('5000').catch(()=>{}); }
  }
  await createBtn.click().catch(() => {});
  await p.waitForTimeout(2500);
  const errToast = await p.locator('text=/Failed to create|Internal server|error/i').first().isVisible().catch(() => false);
  console.log('POST /bookings status:', bookingResp);
  console.log((bookingResp && bookingResp < 400 ? '✓' : '✗') + ' Booking created via UI (no 500)');
  console.log((!errToast ? '✓' : '✗') + ' No error toast shown');
  await b.close();
})();
