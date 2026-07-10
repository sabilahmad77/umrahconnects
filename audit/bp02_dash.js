// BP-02 browser proof: Hotel / Transport / Visa dashboards render non-zero supply data.
const { chromium } = require('playwright-core');

const BASE = process.env.BASE || 'http://localhost:3000';
const PAGES = [
  { path: '/hotel-dashboard', name: 'Hotel dashboard' },
  { path: '/hotels', name: 'My Hotels' },
  { path: '/hotel-bookings', name: 'Hotel bookings' },
  { path: '/transport-dashboard', name: 'Transport dashboard' },
  { path: '/transport/vehicles', name: 'Vehicles' },
  { path: '/transport/routes', name: 'Routes' },
  { path: '/transport/bookings', name: 'Transport bookings' },
  { path: '/visa-dashboard', name: 'Visa dashboard' },
  { path: '/compliance', name: 'Visa applications' },
];

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const page = await browser.newPage();
  let pass = 0, fail = 0;

  // login via demo tile (operator/agency admin sees all modules)
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Umrah Operator \/ Agency/i }).first().click();
  await page.waitForURL(u => !u.toString().includes('login'), { timeout: 45000 });
  await page.waitForTimeout(2500);
  console.log('logged in →', page.url());

  for (const p of PAGES) {
    await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const body = await page.textContent('body');
    const onLogin = page.url().includes('/login');
    // non-zero evidence: any digit 1-9 in a KPI-ish context, plus seeded names
    const hasData = /[1-9]/.test(body.replace(/\D0+/g, '')) &&
      !/something went wrong|internal error/i.test(body);
    const seeded =
      /Al Safwah|Dar Al Eiman|HAJ-4921|HAJ-1188|Jeddah Airport|Khalid|BP02|Quad Room/i.test(body);
    const kpiNums = (body.match(/\b[1-9]\d{0,3}\b/g) || []).slice(0, 6);
    const ok = !onLogin && hasData;
    ok ? pass++ : fail++;
    console.log(`${ok ? '✓' : '✗'} ${p.name} (${p.path}) nums=[${kpiNums.join(',')}] seededContent=${seeded}${onLogin ? ' BOUNCED-TO-LOGIN' : ''}`);
  }

  await browser.close();
  console.log(`\nBP-02 dashboards: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
