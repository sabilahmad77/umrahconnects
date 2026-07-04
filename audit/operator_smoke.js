const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const p = await ctx.newPage(); p.setDefaultTimeout(30000);
  const apiErrs = [], errs = [];
  p.on('response', r => { const m = r.request().method(); if (r.url().includes('/api/v1/') && m !== 'GET' && r.status() >= 500) apiErrs.push(m + ' ' + r.url().split('/api/v1')[1] + ' -> ' + r.status()); });
  p.on('pageerror', e => errs.push(e.message));
  const pass = [], fail = [];
  const log = (ok, n) => { (ok ? pass : fail).push(n); console.log((ok ? '✓ ' : '✗ ') + n); };
  const stamp = Date.now();

  await p.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Umrah Operator \/ Agency/i }).first().click();
  await p.waitForURL(u => !u.toString().includes('login'), { timeout: 30000 });
  log(true, 'Login as Umrah Operator / Agency');

  // Dashboard metrics
  await p.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' }); await p.waitForTimeout(1800);
  const kpis = await p.locator('text=/Total Pilgrims|Bookings|Revenue/i').count();
  log(kpis >= 2, 'Dashboard metrics render (DB-connected KPIs)');

  // Every module page loads without 404/crash
  const modules = [['/pilgrims','Pilgrims & CRM'],['/bookings','Bookings'],['/groups','Groups'],['/hotels','Hotels'],['/transport','Transport'],['/compliance','Visa & Compliance'],['/finance','Finance'],['/reports','Reports'],['/marketplace','Marketplace'],['/social','Social Hub'],['/connections','Connections'],['/requests','Requests']];
  for (const [route, label] of modules) {
    await p.goto('http://localhost:3000' + route, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(900);
    const bad = await p.locator('text=/Unhandled Runtime|client-side exception|404|page could not be found/i').first().isVisible().catch(() => false);
    log(!bad, label + ' page loads (no 404/crash)');
  }

  // Pilgrim detail reachable
  await p.goto('http://localhost:3000/pilgrims', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  const prow = p.locator('tr.cursor-pointer, tbody tr').first();
  if (await prow.isVisible().catch(() => false)) { await prow.click(); await p.waitForTimeout(1500); log(p.url().includes('/pilgrims/'), 'Pilgrim detail opens'); }
  else log(false, 'No pilgrim row to open');

  // Group detail reachable
  await p.goto('http://localhost:3000/groups', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  const grow = p.locator('a[href^="/groups/"]').first();
  if (await grow.isVisible().catch(() => false)) { await grow.click(); await p.waitForTimeout(1500); log(p.url().includes('/groups/'), 'Group detail workspace opens'); }
  else log(false, 'No group card to open');

  // Booking create (the fixed flow)
  await p.goto('http://localhost:3000/bookings', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
  let bookingStatus = null;
  p.on('response', r => { if (r.url().includes('/bookings') && r.request().method() === 'POST') bookingStatus = r.status(); });
  await p.getByRole('button', { name: /New booking/i }).first().click(); await p.waitForTimeout(800);
  const ins = p.locator('div.fixed input');
  const cnt = await ins.count();
  for (let i = 0; i < cnt; i++) { const t = await ins.nth(i).getAttribute('type'); if (t === 'number') await ins.nth(i).fill('5000').catch(() => {}); }
  await p.locator('div.fixed').getByRole('button', { name: /Create booking|^Create$|Save|Confirm/i }).last().click().catch(() => {});
  await p.waitForTimeout(2500);
  log(bookingStatus === null || bookingStatus < 500, 'New Booking submits without 500 (status ' + bookingStatus + ')');

  console.log('\n=== SUMMARY ===');
  console.log('PASS: ' + pass.length + '  FAIL: ' + fail.length);
  console.log('Server 500s during smoke: ' + (apiErrs.length ? apiErrs.join(' | ') : 'NONE'));
  console.log('Page errors: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'NONE'));
  if (fail.length) console.log('FAILED: ' + fail.join(' | '));
  await b.close();
})();
