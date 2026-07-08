const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage(); p.setDefaultTimeout(45000);
  const base = 'http://localhost:3000';
  let fivexx = 0, total = 0;
  p.on('response', res => { if (res.url().includes('/proxy-api') || res.url().includes('_rsc')) { total++; if (res.status() >= 500) { fivexx++; console.log('  5xx:', res.status(), res.url().replace(base, '').slice(0, 60)); } } });

  await p.goto(base + '/login', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Umrah Operator \/ Agency/i }).first().click();
  await p.waitForURL(u => !u.toString().includes('login'), { timeout: 45000 });

  // grab a pilgrim id + invoice id to hit detail routes
  await p.goto(base + '/pilgrims', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  const pilgrimRow = p.locator('tbody tr').first();
  let detailOk = 0, detailTotal = 0;
  if (await pilgrimRow.isVisible().catch(() => false)) {
    await pilgrimRow.click(); await p.waitForTimeout(1500);
    detailTotal++; if (p.url().includes('/pilgrims/') && !(await p.locator('text=/Unhandled|error|failed to/i').first().isVisible().catch(() => false))) detailOk++;
  }
  // storm: rapid nav across list+detail routes
  const routes = ['/pilgrims','/bookings','/finance','/compliance','/hotels','/pilgrims','/finance','/bookings','/compliance'];
  for (const r of routes) { await p.goto(base + r, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(400); }

  console.log('pilgrim detail loaded clean:', detailOk + '/' + detailTotal);
  console.log('proxy/_rsc responses:', total, '| 5xx:', fivexx);
  console.log(fivexx === 0 ? '✓ no 5xx during nav storm (retry config active)' : '✗ 5xx observed');
  await b.close();
})();
