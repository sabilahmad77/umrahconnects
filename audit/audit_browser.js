/* Umrah Connect — Browser audit: logs in per role, visits every route,
   screenshots each page, and records console errors + failed API calls. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const OUT = path.join(__dirname, 'screenshots');
const findings = [];

const ROLE_TILES = {
  operator: /Operator \/ Agency/i,
  hotel: /Hotel Owner/i,
  transport: /Transport Company/i,
  visa: /Visa Agency/i,
  finance: /Finance Manager/i,
  admin: /Super Admin/i,
  traveler: /Pilgrim \/ Traveller/i,
};

const ROLE_ROUTES = {
  public:   ['/', '/login'],
  traveler: ['/social', '/discover', '/connections', '/messages', '/groups', '/marketplace', '/requests', '/my-bookings', '/my-offers', '/travel-plan', '/profile', '/settings'],
  operator: ['/dashboard', '/pilgrims', '/bookings', '/groups', '/hotels', '/transport', '/compliance', '/finance', '/reports', '/marketplace', '/social', '/settings'],
  hotel:    ['/hotel-dashboard', '/hotels', '/hotel-bookings', '/marketplace', '/finance', '/reports'],
  transport:['/transport-dashboard', '/transport', '/marketplace', '/reports'],
  visa:     ['/visa-dashboard', '/compliance', '/visa-documents', '/visa-requests', '/marketplace'],
  finance:  ['/finance-dashboard', '/finance', '/finance-payments', '/budget-plans', '/reports'],
  admin:    ['/admin-dashboard', '/admin-tenants', '/admin-users', '/admin-kyc', '/admin-roles', '/admin-listings', '/admin-logs', '/admin-settings', '/admin-support'],
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });

  async function newPage(ctx) {
    const page = await ctx.newPage();
    page.setDefaultTimeout(25000);
    page.on('console', (m) => {
      if (m.type() === 'error') {
        const t = m.text().slice(0, 160);
        if (!/favicon|Download the React DevTools|hydrat/i.test(t))
          findings.push({ kind: 'console', page: page.url(), msg: t });
      }
    });
    page.on('response', (r) => {
      if (r.status() >= 400 && r.url().includes('/api/')) {
        findings.push({ kind: 'api', page: page.url(), msg: `${r.status()} ${r.request().method()} ${r.url().split('/api/')[1]?.slice(0, 80)}` });
      }
    });
    return page;
  }

  // ── Public pages ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await newPage(ctx);
    for (const route of ROLE_ROUTES.public) {
      try {
        await page.goto(BASE + route, { waitUntil: 'networkidle' });
        await page.waitForTimeout(800);
        const name = `public${route === '/' ? '_landing' : route.replace(/\//g, '_')}.png`;
        await page.screenshot({ path: path.join(OUT, name), fullPage: route === '/' });
        console.log(`shot: ${name}`);
      } catch (e) { findings.push({ kind: 'nav', page: route, msg: e.message.slice(0, 120) }); }
    }
    // Mobile responsiveness check of landing
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(OUT, 'public_landing_mobile.png') });
    console.log('shot: public_landing_mobile.png');
    await ctx.close();
  }

  // ── Each role ──
  for (const [role, tile] of Object.entries(ROLE_TILES)) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await newPage(ctx);
    try {
      await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: tile }).first().click();
      await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 25000 });
      await page.waitForTimeout(2500);
      console.log(`[${role}] logged in → ${page.url()}`);

      for (const route of ROLE_ROUTES[role] || []) {
        try {
          await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(1200);
          const is404 = await page.locator('text=/404|not found/i').first().isVisible().catch(() => false);
          if (is404) findings.push({ kind: '404', page: route, msg: `${role}: page shows 404` });
          const name = `${role}${route.replace(/\//g, '_')}.png`;
          await page.screenshot({ path: path.join(OUT, name) });
          console.log(`shot: ${name}`);
        } catch (e) { findings.push({ kind: 'nav', page: `${role} ${route}`, msg: e.message.slice(0, 120) }); }
      }
    } catch (e) {
      findings.push({ kind: 'login', page: role, msg: 'LOGIN FAILED: ' + e.message.slice(0, 120) });
      console.log(`[${role}] LOGIN FAILED: ${e.message.slice(0, 80)}`);
    }
    await ctx.close();
  }

  // ── Mobile app (expo web render) ──
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await newPage(ctx);
    await page.goto('http://localhost:8081', { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(12000); // metro web bundle build
    await page.screenshot({ path: path.join(OUT, 'mobile_web_login.png') });
    console.log('shot: mobile_web_login.png');
    // demo login as traveler via role chip
    const chip = page.locator('text=Traveler').first();
    if (await chip.isVisible().catch(() => false)) {
      await chip.click();
      await page.waitForTimeout(6000);
      await page.screenshot({ path: path.join(OUT, 'mobile_web_home.png') });
      console.log('shot: mobile_web_home.png');
    }
  } catch (e) { findings.push({ kind: 'mobile', page: 'expo-web', msg: e.message.slice(0, 120) }); }

  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'browser_findings.json'), JSON.stringify(findings, null, 2));
  console.log(`\nFINDINGS: ${findings.length} issues recorded → audit/browser_findings.json`);
  const shots = fs.readdirSync(OUT).length;
  console.log(`SCREENSHOTS: ${shots} files in audit/screenshots/`);
})();
