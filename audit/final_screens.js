// Phase 6: per-role sign-off screenshots against the LIVE domain.
const { chromium } = require('playwright-core');
const fs = require('fs');
const BASE = process.env.BASE || 'https://www.umrahconnect.io';
const OUT = process.env.OUT || 'screens';

const ROLES = [
  { tile: /Umrah Operator \/ Agency/i, name: 'operator', pages: ['/dashboard', '/bookings', '/pilgrims', '/packages', '/social', '/discover'] },
  { tile: /Hotel Owner/i,             name: 'hotel',    pages: ['/hotel-dashboard', '/hotels', '/hotel-bookings'] },
  { tile: /Transport Company/i,      name: 'transport',pages: ['/transport-dashboard', '/transport/vehicles', '/transport/bookings'] },
  { tile: /Visa/i,                    name: 'visa',     pages: ['/visa-dashboard', '/compliance'] },
  { tile: /Finance/i,                 name: 'finance',  pages: ['/finance-dashboard', '/finance'] },
  { tile: /Super Admin/i,             name: 'admin',    pages: ['/admin'] },
  { tile: /Pilgrim/i,                 name: 'pilgrim',  pages: ['/home', '/marketplace', '/groups'] },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  let shot = 0, errs = 0;
  for (const role of ROLES) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    try {
      await p.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 90000 });
      await p.getByRole('button', { name: role.tile }).first().click();
      await p.waitForURL(u => !u.toString().includes('login'), { timeout: 90000 });
      await p.waitForTimeout(3000);
      for (const path of role.pages) {
        await p.goto(BASE + path, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
        await p.waitForTimeout(2500);
        const file = `${OUT}/${role.name}${path.replace(/\//g, '_')}.png`;
        await p.screenshot({ path: file, fullPage: false });
        shot++;
        console.log(`✓ ${role.name} ${path} → ${file}`);
      }
    } catch (e) {
      errs++;
      console.log(`✗ ${role.name}: ${String(e).slice(0, 120)}`);
    }
    await ctx.close();
  }
  await b.close();
  console.log(`\nScreenshots: ${shot} captured, ${errs} role errors`);
  process.exit(errs ? 1 : 0);
})();
