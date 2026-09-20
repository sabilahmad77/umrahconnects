// W30 responsive acceptance + WCAG 1.4.10 reflow and 1.4.4 resize text.
// Widths 1440/1280/1024/768/390/360 for representative routes of every role,
// plus 320 px reflow and 200 % text zoom. Usage: node responsive.cjs out.json
const fs = require('fs');
const path = require('path');
const L = require('./lib.cjs');

const BASE = process.env.BASE || 'http://localhost:3411';
const OUT = process.argv[2] || 'responsive.json';
const SHOTS = process.env.SHOTS || path.join(path.dirname(OUT), 'screenshots');
const WIDTHS = [
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [768, 1024],
  [390, 844],
  [360, 780],
];
const SHOT_WIDTHS = new Set([1440, 768, 360]);

const ROUTES = {
  anonymous: ['/', '/solutions', '/marketplace-preview', '/contact', '/signup'],
  travelerA: ['/travel-plan', '/marketplace', '/requests', '/settings'],
  operatorAdminA: ['/dashboard', '/pilgrims', '/bookings', '/finance', '/reports'],
  financeA: ['/finance-dashboard', '/finance-payments', '/budget-plans'],
  hotelA: ['/hotel-dashboard', '/hotels', '/hotel-bookings'],
  transportA: ['/transport-dashboard', '/transport/vehicles', '/transport/assignments'],
  visaA: ['/visa-dashboard', '/compliance', '/visa-requests'],
  superAdmin: ['/admin-dashboard', '/admin-tenants', '/admin-users', '/admin-listings'],
};

const results = [];
const problems = [];

/** Measure horizontal overflow of the page and of anything that sticks out. */
const measure = (page) =>
  page.evaluate(() => {
    const doc = document.documentElement;
    const main = document.querySelector('main');
    const vw = doc.clientWidth;
    const scrollers = [...document.querySelectorAll('*')].filter((el) => {
      const cs = getComputedStyle(el);
      return /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
    });
    const labelledScroller = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (/(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1) {
          const named = n.getAttribute('aria-label') || n.getAttribute('aria-labelledby');
          const focusable = n.tabIndex >= 0;
          return { tag: n.tagName, named: !!named, focusable, label: n.getAttribute('aria-label') || '' };
        }
      }
      return null;
    };
    // Elements painted past the right edge of the viewport.
    const stickingOut = [];
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right <= vw + 1) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.position === 'fixed') continue;
      if (labelledScroller(el)) continue; // inside a scrollable area: allowed, reported separately
      if (el.closest('[aria-hidden="true"]')) continue;
      stickingOut.push({
        tag: el.tagName,
        cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 90),
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
        right: Math.round(r.right),
        width: Math.round(r.width),
      });
    }
    // Keep only the outermost offenders.
    const clipped = [];
    for (const el of document.body.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.overflow !== 'hidden' && cs.overflowX !== 'hidden') continue;
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && (el.textContent || '').trim() && !/truncate|text-ellipsis|line-clamp/.test(String(el.className))) {
        // A container can report extra scrollWidth from decorative absolutely
        // positioned children; what matters is whether something with text is
        // actually cut off by the box.
        const box = el.getBoundingClientRect();
        const cut = [...el.querySelectorAll('*')].filter((child) => {
          if (!(child.textContent || '').trim()) return false;
          const r = child.getBoundingClientRect();
          return r.width > 0 && r.right > box.right + 2;
        });
        if (cut.length)
          clipped.push({ tag: el.tagName, cls: String(el.className).slice(0, 70), text: (cut[0].textContent || '').trim().slice(0, 40), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, cutOff: cut.length });
      }
    }
    return {
      viewport: vw,
      docScroll: doc.scrollWidth,
      bodyScroll: document.body.scrollWidth,
      pageOverflow: Math.max(0, doc.scrollWidth - vw, document.body.scrollWidth - vw),
      mainOverflow: main ? Math.max(0, main.scrollWidth - main.clientWidth) : 0,
      horizontalScrollers: scrollers.slice(0, 12).map((el) => ({
        tag: el.tagName,
        role: el.getAttribute('role'),
        label: el.getAttribute('aria-label'),
        focusable: el.tabIndex >= 0,
        hasTable: !!el.querySelector('table'),
        over: el.scrollWidth - el.clientWidth,
      })),
      stickingOut: stickingOut.slice(0, 8),
      clipped: clipped.slice(0, 8),
      tables: document.querySelectorAll('table').length,
      dialogs: document.querySelectorAll('[role="dialog"]').length,
      mobileNavButton: !!document.querySelector('header button[aria-label="Open workspace navigation"], header button[aria-label="Open navigation"]'),
      sidebarVisible: !!document.querySelector('aside') && [...document.querySelectorAll('aside')].some((a) => a.getBoundingClientRect().width > 0),
    };
  });

async function shoot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.jpg`), type: 'jpeg', quality: 45 });
}

(async () => {
  const browser = await L.launch();
  for (const [key, routes] of Object.entries(ROUTES)) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(90000);
    if (key !== 'anonymous') await L.login(page, BASE, key);
    for (const route of routes) {
      for (const [w, h] of WIDTHS) {
        await page.setViewportSize({ width: w, height: h });
        try {
          await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
        } catch (error) {
          console.log(`${String(w).padStart(4)} ${key.padEnd(15)} ${route.padEnd(24)} LOAD FAILED: ${String(error).slice(0, 80)}`);
          results.push({ identity: key, route, width: w, error: String(error).slice(0, 120) });
          continue;
        }
        await L.settle(page);
        const m = await measure(page);
        const entry = { identity: key, route, width: w, ...m };
        results.push(entry);
        const bad = [];
        if (m.pageOverflow > 1) bad.push(`page scrolls horizontally by ${m.pageOverflow}px`);
        if (m.mainOverflow > 1) bad.push(`main scrolls horizontally by ${m.mainOverflow}px`);
        for (const s of m.horizontalScrollers) if (!s.label && s.hasTable) bad.push(`table scroller without a label (${s.tag})`);
        for (const c of m.clipped) bad.push(`clipped text in ${c.tag}.${c.cls.split(' ')[0]}: "${c.text}"`);
        if (w <= 767 && m.sidebarVisible && key !== 'anonymous') bad.push('sidebar still occupies width at mobile size');
        if (w <= 767 && key !== 'anonymous' && !m.mobileNavButton) bad.push('no mobile navigation button');
        if (bad.length) problems.push({ identity: key, route, width: w, problems: bad, detail: { stickingOut: m.stickingOut, clipped: m.clipped } });
        console.log(`${String(w).padStart(4)} ${key.padEnd(15)} ${route.padEnd(24)} page=${m.pageOverflow} main=${m.mainOverflow} scrollers=${m.horizontalScrollers.length} ${bad.length ? 'PROBLEM: ' + bad.join('; ') : 'ok'}`);
        if (SHOT_WIDTHS.has(w) && routes.indexOf(route) === 0) await shoot(page, `${key}-${route.replace(/\W+/g, '_')}-${w}`);
      }
      // The mobile navigation drawer itself must not overflow (first route only).
      if (key !== 'anonymous' && routes.indexOf(route) === 0) {
        await page.setViewportSize({ width: 360, height: 780 });
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
        await L.settle(page);
        const open = page.locator('header button[aria-label="Open workspace navigation"]').first();
        if (await open.isVisible().catch(() => false)) {
          await open.click();
          await page.waitForTimeout(600);
          const m = await measure(page);
          results.push({ identity: key, route: `${route} (drawer)`, width: 360, ...m });
          if (m.pageOverflow > 1) problems.push({ identity: key, route: `${route} (drawer)`, width: 360, problems: [`drawer overflows by ${m.pageOverflow}px`] });
          if (routes.indexOf(route) === 0) await shoot(page, `${key}-drawer-360`);
          await page.keyboard.press('Escape');
        }
      }
    }
    await context.close();
  }

  // ── 1.4.10 reflow at 320 CSS px and 1.4.4 text resize to 200 % ──────────
  const context = await browser.newContext({ viewport: { width: 320, height: 640 } });
  const page = await context.newPage();
  await L.login(page, BASE, 'operatorAdminA');
  for (const route of ['/dashboard', '/pilgrims', '/bookings', '/finance', '/settings']) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await L.settle(page);
    const m = await measure(page);
    results.push({ identity: 'operatorAdminA', route, width: 320, reflow: true, ...m });
    if (m.pageOverflow > 1) problems.push({ identity: 'operatorAdminA', route, width: 320, problems: [`reflow: page scrolls horizontally by ${m.pageOverflow}px`], detail: m.stickingOut });
    console.log(` 320 reflow ${route.padEnd(24)} page=${m.pageOverflow} main=${m.mainOverflow} ${m.pageOverflow > 1 ? 'PROBLEM' : 'ok'}`);
    await shoot(page, `reflow320-${route.replace(/\W+/g, '_')}`);
  }
  // Text-only zoom: the root font size doubles, page width stays 1280.
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const route of ['/dashboard', '/pilgrims', '/finance', '/settings']) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await L.settle(page);
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    await page.waitForTimeout(500);
    const m = await measure(page);
    results.push({ identity: 'operatorAdminA', route, width: 1280, textZoom: '200%', ...m });
    if (m.pageOverflow > 1 || m.clipped.length) problems.push({ identity: 'operatorAdminA', route, width: '1280@200% text', problems: [m.pageOverflow > 1 ? `page scrolls horizontally by ${m.pageOverflow}px` : null, ...m.clipped.map((c) => `clipped: ${c.tag} "${c.text}"`)].filter(Boolean) });
    console.log(`1280 text200 ${route.padEnd(24)} page=${m.pageOverflow} clipped=${m.clipped.length}`);
    await shoot(page, `text200-${route.replace(/\W+/g, '_')}`);
    await page.evaluate(() => (document.documentElement.style.fontSize = ''));
  }
  // The landing hero at every width: the headline and its call to action must be
  // whole and inside the hero, and the hero art must not push the page sideways.
  const hero = [];
  for (const [w, h] of [...WIDTHS, [320, 640]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await L.settle(page);
    const info = await page.evaluate(() => {
      const h1 = document.querySelector('main h1');
      const section = h1?.closest('section') || h1?.parentElement;
      const cta = section?.querySelector('a[href="/signup"], a[href="/login"], a.uc-button');
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) };
      };
      const img = section?.querySelector('img');
      return {
        h1: h1 ? (h1.textContent || '').trim().slice(0, 60) : null,
        h1Box: box(h1),
        // Only a box that actually clips can cut its text off; a tight
        // line-height makes scrollHeight exceed clientHeight with nothing lost.
        h1Clipped: h1 ? getComputedStyle(h1).overflow !== 'visible' && (h1.scrollWidth > h1.clientWidth + 2 || h1.scrollHeight > h1.clientHeight + 2) : null,
        ctaBox: box(cta),
        ctaText: cta ? (cta.textContent || '').trim().slice(0, 30) : null,
        imgBox: box(img),
        imgFit: img ? getComputedStyle(img).objectFit : null,
        sectionBox: box(section),
        viewport: document.documentElement.clientWidth,
      };
    });
    const m = await measure(page);
    const issues = [];
    if (info.h1Clipped) issues.push('hero headline is clipped');
    if (info.h1Box && (info.h1Box.left < -1 || info.h1Box.right > info.viewport + 1)) issues.push(`hero headline outside the viewport (${info.h1Box.left}..${info.h1Box.right} of ${info.viewport})`);
    if (info.ctaBox && (info.ctaBox.left < -1 || info.ctaBox.right > info.viewport + 1)) issues.push('hero call to action outside the viewport');
    if (m.pageOverflow > 1) issues.push(`page scrolls horizontally by ${m.pageOverflow}px`);
    hero.push({ width: w, ...info, pageOverflow: m.pageOverflow, issues });
    if (issues.length) problems.push({ identity: 'anonymous', route: '/ (hero)', width: w, problems: issues });
    console.log(` hero ${String(w).padStart(4)} h1="${info.h1}" clipped=${info.h1Clipped} overflow=${m.pageOverflow} ${issues.length ? 'PROBLEM: ' + issues.join('; ') : 'ok'}`);
    await shoot(page, `hero-${w}`);
  }
  await context.close();
  await browser.close();

  L.writeJson(OUT, { base: BASE, when: new Date().toISOString(), widths: WIDTHS.map(([w]) => w), checked: results.length, problemCount: problems.length, problems, hero, results });
  console.log(`\n${results.length} measurements, ${problems.length} problems`);
})();
