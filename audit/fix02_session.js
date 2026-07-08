const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage(); p.setDefaultTimeout(45000);
  const base = 'http://localhost:3000';
  let pass = 0, fail = 0;
  const log = (ok, n) => { ok ? pass++ : fail++; console.log((ok ? '✓ ' : '✗ ') + n); };

  // login (demo = real token)
  await p.goto(base + '/login', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Umrah Operator \/ Agency/i }).first().click();
  await p.waitForURL(u => !u.toString().includes('login'), { timeout: 45000 });
  log(true, 'Login OK');

  // 1. Cold deep-link to 10 role routes (full page loads) — none should bounce to /login
  const routes = ['/dashboard','/pilgrims','/bookings','/groups','/hotels','/transport','/compliance','/finance','/reports','/marketplace','/social','/connections'];
  let bounced = 0;
  for (const r of routes) {
    await p.goto(base + r, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(700);
    if (p.url().includes('/login')) { bounced++; console.log('   bounced on', r); }
  }
  log(bounced === 0, `Cold deep-link ${routes.length} routes, 0 bounces (got ${bounced})`);

  // 2. Authorized write right after login (create pilgrim) — no 401
  let writeStatus = null;
  p.on('response', res => { if (res.url().includes('/pilgrims') && res.request().method() === 'POST') writeStatus = res.status(); });
  await p.goto(base + '/pilgrims', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
  await p.getByRole('button', { name: /Add pilgrim/i }).first().click(); await p.waitForTimeout(500);
  const stamp = Date.now();
  await p.getByPlaceholder('Ahmed', { exact: true }).fill('Fix02');
  await p.getByPlaceholder('Al-Faisal').fill('Session' + stamp);
  await p.locator('div.fixed').getByRole('button', { name: /^Add pilgrim$/i }).click();
  await p.waitForTimeout(2500);
  log(writeStatus && writeStatus < 400, `Authorized create → ${writeStatus} (no 401)`);

  // 3. Expired-access-token refresh path: corrupt accessToken (keep refreshToken), hard-nav → should refresh, not bounce
  await p.evaluate(() => {
    // an obviously-expired JWT (exp far in the past); keep refreshToken intact
    const expired = 'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({ sub: 'x', exp: 1000 })).replace(/=/g,'') + '.sig';
    localStorage.setItem('accessToken', expired);
    sessionStorage.setItem('accessToken', expired);
    document.cookie = 'accessToken=' + expired + '; path=/';
  });
  await p.goto(base + '/bookings', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const afterRefresh = p.url();
  log(!afterRefresh.includes('/login'), `Expired token → silent refresh, stayed on page (${afterRefresh.replace(base,'')})`);

  console.log(`\nFIX-02: ${pass} passed, ${fail} failed`);
  await b.close();
})();
