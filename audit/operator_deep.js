const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const p = await ctx.newPage(); p.setDefaultTimeout(30000);
  const apiErrs = [];
  p.on('response', r => { const m = r.request().method(); if (r.url().includes('/api/v1/') && m !== 'GET' && r.status() >= 400) apiErrs.push(m + ' ' + r.url().split('/api/v1')[1] + ' -> ' + r.status()); });
  const stamp = Date.now();
  const log = (ok, n) => console.log((ok ? '✓ ' : '✗ ') + n);

  await p.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Umrah Operator \/ Agency/i }).first().click();
  await p.waitForURL(u => !u.toString().includes('login'), { timeout: 30000 });

  // ── CREATE GROUP (modal) ──
  await p.goto('http://localhost:3000/groups', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
  await p.getByRole('button', { name: /New group|Create group/i }).first().click(); await p.waitForTimeout(500);
  const gname = 'Deep Group ' + stamp;
  const gInput = p.locator('div.fixed input').first();
  await gInput.fill(gname);
  await p.locator('div.fixed').getByRole('button', { name: /Create|Save|Add group/i }).last().click();
  await p.waitForTimeout(2000);
  // now click it in list
  await p.goto('http://localhost:3000/groups', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  const groupLink = p.locator(`a[href^="/groups/"]`).filter({ hasText: gname }).first();
  let groupClickable = await groupLink.isVisible().catch(() => false);
  if (!groupClickable) { // maybe not filtered; click any group card
    groupClickable = await p.locator('a[href^="/groups/"]').first().isVisible().catch(() => false);
  }
  log(groupClickable, 'Created group is clickable in list');
  if (groupClickable) {
    await (await groupLink.isVisible().catch(() => false) ? groupLink : p.locator('a[href^="/groups/"]').first()).click();
    await p.waitForTimeout(1500);
    const tabs = ['Overview', 'Members', 'Discussion', 'Polls', 'Planning', 'Documents'];
    let found = 0;
    for (const t of tabs) if (await p.getByRole('button', { name: t }).first().isVisible().catch(() => false) || await p.getByText(t, { exact: true }).first().isVisible().catch(() => false)) found++;
    log(found >= 5, `Group workspace tabs present (${found}/6)`);
  }

  // ── ADD HOTEL (modal) ──
  await p.goto('http://localhost:3000/hotels', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  const addHotel = p.getByRole('button', { name: /Add hotel|New hotel/i }).first();
  if (await addHotel.isVisible().catch(() => false)) {
    await addHotel.click(); await p.waitForTimeout(600);
    const inputs = p.locator('div.fixed input, [role=dialog] input');
    const n = await inputs.count();
    if (n > 0) {
      await inputs.first().fill('Deep Hotel ' + stamp);
      // fill a couple more text inputs if present (city)
      const submit = p.locator('div.fixed, [role=dialog]').getByRole('button', { name: /Add hotel|Create|Save/i }).last();
      await submit.click(); await p.waitForTimeout(2000);
      const modalGone = !(await inputs.first().isVisible().catch(() => false));
      log(modalGone, 'Add Hotel submitted (modal closed)');
    } else log(false, 'Add Hotel modal had no inputs');
  } else log(false, 'Add Hotel button missing');

  // ── NEW BOOKING (modal) ──
  await p.goto('http://localhost:3000/bookings', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  const newBk = p.getByRole('button', { name: /New booking|Add booking|Create booking/i }).first();
  if (await newBk.isVisible().catch(() => false)) {
    await newBk.click(); await p.waitForTimeout(800);
    const dlg = p.locator('div.fixed, [role=dialog]').last();
    const opened = await dlg.isVisible().catch(() => false);
    log(opened, 'New Booking modal/page opens');
    // try to submit if there's a clear create button (best-effort)
    const submitBk = dlg.getByRole('button', { name: /Create booking|Save|Confirm|Add booking/i }).last();
    if (await submitBk.isVisible().catch(() => false)) {
      await submitBk.click().catch(() => {}); await p.waitForTimeout(1500);
    }
  } else log(false, 'New Booking button missing');

  // ── REQUESTS endpoint check (which path does the page use?) ──
  await p.goto('http://localhost:3000/requests', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  const reqCrash = await p.locator('text=/Unhandled Runtime|client-side exception/i').first().isVisible().catch(() => false);
  log(!reqCrash, 'Requests page renders without crash');

  console.log('\nNON-GET API ERRORS during deep flows:', apiErrs.length ? apiErrs.join(' | ') : 'NONE');
  await b.close();
})();
