/* Umrah Connect — INTERACTIVE audit: clicks buttons, opens modals, submits
   forms, tests filters & sign-out per role. Records PASS/FAIL + screenshots. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const OUT = path.join(__dirname, 'screenshots');
const results = [];
const stamp = Date.now() % 100000;

function rec(role, action, status, note = '') {
  results.push({ role, action, status, note: String(note).slice(0, 140) });
  console.log(`  ${status === 'PASS' ? '✓' : status === 'PARTIAL' ? '~' : '✗'} [${role}] ${action}${note ? ' — ' + String(note).slice(0, 80) : ''}`);
}
async function shot(page, name) {
  try { await page.screenshot({ path: path.join(OUT, `ix_${name}.png`) }); } catch {}
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });

  async function loginAs(ctx, tileRe, role) {
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: tileRe }).first().click();
    await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 25000 });
    await page.waitForTimeout(2000);
    rec(role, 'Login via role tile', 'PASS', page.url());
    return page;
  }

  /* ───────────────────────── TRAVELER ───────────────────────── */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    let page;
    try { page = await loginAs(ctx, /Pilgrim \/ Traveller/i, 'traveler'); }
    catch (e) { rec('traveler', 'Login via role tile', 'FAIL', e.message); }
    if (page) {
      // — Social: create a post —
      try {
        await page.goto(BASE + '/social', { waitUntil: 'networkidle' });
        await page.locator('textarea').first().fill(`Interactive audit post ${stamp}`);
        await page.getByRole('button', { name: /^Post$/i }).click();
        await page.waitForTimeout(2500);
        const appeared = await page.locator(`text=Interactive audit post ${stamp}`).first().isVisible().catch(() => false);
        rec('traveler', 'Social: create post (composer)', appeared ? 'PASS' : 'PARTIAL', appeared ? 'post visible in feed' : 'submitted; not visible yet');
        await shot(page, 'traveler_post_created');
      } catch (e) { rec('traveler', 'Social: create post', 'FAIL', e.message); }

      // — Social: like + comment on first post —
      try {
        const like = page.getByRole('button', { name: /^Like$/i }).first();
        await like.click(); await page.waitForTimeout(1200);
        rec('traveler', 'Social: Like button', 'PASS');
        await page.getByRole('button', { name: /^Comment$/i }).first().click();
        await page.waitForTimeout(600);
        const ci = page.locator('input[placeholder*="comment" i]').first();
        await ci.fill(`Audit comment ${stamp}`);
        await ci.press('Enter'); await page.waitForTimeout(1500);
        const cv = await page.locator(`text=Audit comment ${stamp}`).first().isVisible().catch(() => false);
        rec('traveler', 'Social: Comment (open + submit)', cv ? 'PASS' : 'PARTIAL', cv ? 'comment visible' : 'submitted');
        await shot(page, 'traveler_comment');
      } catch (e) { rec('traveler', 'Social: like/comment', 'FAIL', e.message); }

      // — Marketplace: filter + open listing + Book modal submit —
      try {
        await page.goto(BASE + '/marketplace', { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: /^Hotel$/i }).first().click();
        await page.waitForTimeout(1200);
        rec('traveler', 'Marketplace: category filter (Hotel)', 'PASS');
        await shot(page, 'traveler_market_filtered');
        await page.locator('a[href^="/marketplace/"]').first().click();
        await page.waitForTimeout(2000);
        rec('traveler', 'Marketplace: open listing detail', 'PASS', page.url());
        await page.getByRole('button', { name: /^Book$/i }).first().click();
        await page.waitForTimeout(800);
        await page.locator('input[placeholder="Customer name"]').fill('Audit User');
        await page.locator('input[placeholder="Email"]').fill('audit@test.com');
        const dates = page.locator('input[type="date"]');
        await dates.nth(0).fill('2026-08-01');
        await dates.nth(1).fill('2026-08-05');
        await shot(page, 'traveler_book_modal');
        const submit = page.getByRole('button', { name: /Book/i }).last();
        await submit.click();
        await page.waitForTimeout(2500);
        const closed = !(await page.locator('input[placeholder="Customer name"]').isVisible().catch(() => false));
        rec('traveler', 'Marketplace: Book modal submit', closed ? 'PASS' : 'FAIL', closed ? 'modal closed (booking created)' : 'modal still open');
      } catch (e) { rec('traveler', 'Marketplace booking flow', 'FAIL', e.message); }

      // — My Requests: create request modal —
      try {
        await page.goto(BASE + '/requests', { waitUntil: 'networkidle' });
        const newBtn = page.getByRole('button', { name: /new request|create|post.*request|\+/i }).first();
        if (await newBtn.isVisible().catch(() => false)) {
          await newBtn.click(); await page.waitForTimeout(800);
          const opened = await page.locator('input, textarea').count() > 2;
          rec('traveler', 'Requests: open create-request form', opened ? 'PASS' : 'PARTIAL');
          await shot(page, 'traveler_request_form');
          await page.keyboard.press('Escape');
        } else rec('traveler', 'Requests: create-request button', 'FAIL', 'button not found');
      } catch (e) { rec('traveler', 'Requests page', 'FAIL', e.message); }

      // — Notifications bell —
      try {
        await page.goto(BASE + '/social', { waitUntil: 'networkidle' });
        const bell = page.locator('button:has(svg.lucide-bell), [aria-label*="notif" i]').first();
        if (await bell.isVisible().catch(() => false)) {
          await bell.click(); await page.waitForTimeout(800);
          rec('traveler', 'Notifications: bell opens panel', 'PASS');
          await shot(page, 'traveler_notifications');
        } else rec('traveler', 'Notifications bell', 'PARTIAL', 'bell not found in header');
      } catch (e) { rec('traveler', 'Notifications bell', 'FAIL', e.message); }

      // — Sign out —
      try {
        const so = page.locator('text=/sign out/i').first();
        await so.click();
        await page.waitForURL((u) => u.pathname.includes('login') || u.pathname === '/', { timeout: 15000 });
        rec('traveler', 'Sign out', 'PASS', page.url());
      } catch (e) { rec('traveler', 'Sign out', 'FAIL', e.message); }
    }
    await ctx.close();
  }

  /* ───────────────────────── OPERATOR ───────────────────────── */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    let page;
    try { page = await loginAs(ctx, /Operator \/ Agency/i, 'operator'); }
    catch (e) { rec('operator', 'Login', 'FAIL', e.message); }
    if (page) {
      // — Pilgrims: search filter + Add Pilgrim modal submit —
      try {
        await page.goto(BASE + '/pilgrims', { waitUntil: 'networkidle' });
        const search = page.locator('input[placeholder*="search" i]').first();
        await search.fill('QA'); await page.waitForTimeout(1500);
        rec('operator', 'Pilgrims: search filter', 'PASS');
        const add = page.getByRole('button', { name: /add pilgrim|new pilgrim|\+ ?pilgrim/i }).first();
        if (await add.isVisible().catch(() => false)) {
          await add.click(); await page.waitForTimeout(900);
          await shot(page, 'operator_add_pilgrim');
          const fn = page.locator('input[name="firstName"], input[placeholder*="first" i]').first();
          if (await fn.isVisible().catch(() => false)) {
            await fn.fill('Ix');
            const ln = page.locator('input[name="lastName"], input[placeholder*="last" i]').first();
            await ln.fill(`Audit${stamp}`);
            const pp = page.locator('input[name="passportNumber"], input[placeholder*="passport" i]').first();
            if (await pp.isVisible().catch(() => false)) await pp.fill(`IX${stamp}`);
            const save = page.getByRole('button', { name: /save|create|add$/i }).last();
            await save.click(); await page.waitForTimeout(2500);
            const visible = await page.locator(`text=Audit${stamp}`).first().isVisible().catch(() => false);
            rec('operator', 'Pilgrims: Add Pilgrim form submit', visible ? 'PASS' : 'PARTIAL', visible ? 'new pilgrim in list' : 'submitted');
          } else { rec('operator', 'Pilgrims: Add Pilgrim form', 'PARTIAL', 'modal opened, fields not matched'); await page.keyboard.press('Escape'); }
        } else rec('operator', 'Pilgrims: Add Pilgrim button', 'FAIL', 'not found');
      } catch (e) { rec('operator', 'Pilgrims interactions', 'FAIL', e.message); }

      // — Bookings page actions —
      try {
        await page.goto(BASE + '/bookings', { waitUntil: 'networkidle' });
        const row = page.locator('a[href^="/bookings/"], tbody tr').first();
        const has = await row.isVisible().catch(() => false);
        if (has) { await row.click(); await page.waitForTimeout(1500); rec('operator', 'Bookings: open booking detail', 'PASS', page.url()); await shot(page, 'operator_booking_detail'); }
        else rec('operator', 'Bookings: open detail', 'PARTIAL', 'no clickable rows');
      } catch (e) { rec('operator', 'Bookings detail', 'FAIL', e.message); }

      // — Marketplace: Add Listing modal —
      try {
        await page.goto(BASE + '/marketplace', { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: /add listing/i }).first().click();
        await page.waitForTimeout(900);
        const opened = await page.locator('input, select, textarea').count() > 3;
        rec('operator', 'Marketplace: Add Listing modal opens', opened ? 'PASS' : 'FAIL');
        await shot(page, 'operator_add_listing');
        await page.keyboard.press('Escape');
      } catch (e) { rec('operator', 'Marketplace Add Listing', 'FAIL', e.message); }

      // — Hotels page (known crash — verify) —
      try {
        await page.goto(BASE + '/hotels', { waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);
        const crashed = await page.locator('text=/Unhandled Runtime Error|toLocaleString/i').first().isVisible().catch(() => false);
        rec('operator', 'Hotels page render', crashed ? 'FAIL' : 'PASS', crashed ? 'CRASH: toLocaleString on undefined' : 'renders');
        await shot(page, 'operator_hotels_check');
      } catch (e) { rec('operator', 'Hotels page', 'FAIL', e.message); }

      // — Groups: create group modal —
      try {
        await page.goto(BASE + '/groups', { waitUntil: 'networkidle' });
        const ng = page.getByRole('button', { name: /new group|create group|\+ ?group/i }).first();
        if (await ng.isVisible().catch(() => false)) {
          await ng.click(); await page.waitForTimeout(800);
          rec('operator', 'Groups: create-group modal opens', 'PASS');
          await shot(page, 'operator_group_modal');
          await page.keyboard.press('Escape');
        } else rec('operator', 'Groups: create-group button', 'PARTIAL', 'button not found');
      } catch (e) { rec('operator', 'Groups', 'FAIL', e.message); }

      // — Reports tabs —
      try {
        await page.goto(BASE + '/reports', { waitUntil: 'networkidle' });
        const tabs = page.getByRole('button').filter({ hasText: /finance|bookings|pilgrims|visa/i });
        const n = await tabs.count();
        if (n > 0) { await tabs.first().click(); await page.waitForTimeout(1200); rec('operator', `Reports: switch tab (${n} tabs)`, 'PASS'); }
        else rec('operator', 'Reports: tabs', 'PARTIAL', 'no tab buttons found');
        await shot(page, 'operator_reports_tab');
      } catch (e) { rec('operator', 'Reports', 'FAIL', e.message); }

      // — Settings page interactivity —
      try {
        await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
        const inputs = await page.locator('input, select, textarea, button:has-text("Save")').count();
        rec('operator', 'Settings: interactive controls', inputs > 2 ? 'PARTIAL' : 'FAIL', `${inputs} controls (mostly static)`);
        await shot(page, 'operator_settings');
      } catch (e) { rec('operator', 'Settings', 'FAIL', e.message); }
    }
    await ctx.close();
  }

  /* ───────────────────────── HOTEL OWNER ───────────────────────── */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    let page;
    try { page = await loginAs(ctx, /Hotel Owner/i, 'hotel'); } catch (e) { rec('hotel', 'Login', 'FAIL', e.message); }
    if (page) {
      try {
        await page.goto(BASE + '/hotels', { waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);
        const crashed = await page.locator('text=/Unhandled Runtime Error/i').first().isVisible().catch(() => false);
        if (crashed) rec('hotel', 'Hotels page', 'FAIL', 'crash (same as operator)');
        else {
          const add = page.getByRole('button', { name: /add hotel|new hotel/i }).first();
          if (await add.isVisible().catch(() => false)) {
            await add.click(); await page.waitForTimeout(900);
            rec('hotel', 'Hotels: Add Hotel form opens', 'PASS');
            await shot(page, 'hotel_add_form');
            await page.keyboard.press('Escape');
          } else rec('hotel', 'Hotels: Add Hotel button', 'PARTIAL', 'not found');
        }
      } catch (e) { rec('hotel', 'Hotels page', 'FAIL', e.message); }
      try {
        await page.goto(BASE + '/hotel-bookings', { waitUntil: 'networkidle' });
        rec('hotel', 'Hotel bookings page renders', 'PASS');
        await shot(page, 'hotel_bookings');
      } catch (e) { rec('hotel', 'Hotel bookings', 'FAIL', e.message); }
    }
    await ctx.close();
  }

  /* ───────────────────────── SUPER ADMIN ───────────────────────── */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    let page;
    try { page = await loginAs(ctx, /Super Admin/i, 'admin'); } catch (e) { rec('admin', 'Login', 'FAIL', e.message); }
    if (page) {
      try {
        await page.goto(BASE + '/admin-kyc', { waitUntil: 'networkidle' });
        const approve = page.getByRole('button', { name: /approve/i }).first();
        const hasA = await approve.isVisible().catch(() => false);
        rec('admin', 'KYC: approve action available', hasA ? 'PASS' : 'PARTIAL', hasA ? '' : 'no pending KYC rows');
        await shot(page, 'admin_kyc_actions');
      } catch (e) { rec('admin', 'KYC actions', 'FAIL', e.message); }
      try {
        await page.goto(BASE + '/admin-users', { waitUntil: 'networkidle' });
        const search = page.locator('input[placeholder*="search" i]').first();
        if (await search.isVisible().catch(() => false)) { await search.fill('admin'); await page.waitForTimeout(1200); rec('admin', 'Users: search filter', 'PASS'); }
        else rec('admin', 'Users: search', 'PARTIAL', 'no search input');
        await shot(page, 'admin_users_filter');
      } catch (e) { rec('admin', 'Users filter', 'FAIL', e.message); }
      try {
        await page.goto(BASE + '/admin-listings', { waitUntil: 'networkidle' });
        const btns = await page.getByRole('button', { name: /approve|remove/i }).count();
        rec('admin', `Listings moderation: ${btns} action buttons`, btns > 0 ? 'PASS' : 'PARTIAL');
        await shot(page, 'admin_listings_mod');
      } catch (e) { rec('admin', 'Listings moderation', 'FAIL', e.message); }
    }
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'interactions.json'), JSON.stringify(results, null, 2));
  const pass = results.filter(r => r.status === 'PASS').length;
  const part = results.filter(r => r.status === 'PARTIAL').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  console.log(`\nINTERACTIVE AUDIT: ${pass} PASS · ${part} PARTIAL · ${fail} FAIL (of ${results.length})`);
})();
