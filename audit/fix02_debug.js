const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage(); p.setDefaultTimeout(45000);
  const base = 'http://localhost:3000';
  const calls = [];
  p.on('response', res => { if (res.url().includes('/auth/refresh')) calls.push('refresh -> ' + res.status()); });

  await p.goto(base + '/login', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Umrah Operator \/ Agency/i }).first().click();
  await p.waitForURL(u => !u.toString().includes('login'), { timeout: 45000 });
  await p.waitForTimeout(1000);

  const store = await p.evaluate(() => ({
    refreshToken: (localStorage.getItem('refreshToken') || '').slice(0, 20),
    hasRefresh: !!localStorage.getItem('refreshToken'),
    currentUser: !!localStorage.getItem('currentUser'),
    accessToken: (localStorage.getItem('accessToken') || '').slice(0, 15),
  }));
  console.log('after login storage:', JSON.stringify(store));

  // expire access token, keep refresh
  await p.evaluate(() => {
    const expired = 'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({ sub: 'x', exp: 1000 })).replace(/=/g, '') + '.sig';
    localStorage.setItem('accessToken', expired);
    sessionStorage.setItem('accessToken', expired);
    document.cookie = 'accessToken=' + expired + '; path=/';
  });
  await p.goto(base + '/bookings', { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  console.log('url after nav:', p.url().replace(base, ''));
  console.log('refresh calls:', calls.length ? calls.join(', ') : 'NONE MADE');
  await b.close();
})();
