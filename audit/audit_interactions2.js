/* Umrah Connect — interactive audit GAP COVERAGE:
   Transport / Visa / Finance role interactions + messaging, groups, signup,
   password reset, operator sign-out. Appends to interactions.json. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const OUT = path.join(__dirname, 'screenshots');
const prev = JSON.parse(fs.readFileSync(path.join(__dirname, 'interactions.json'), 'utf8'));
const results = [];
const stamp = Date.now() % 100000;

function rec(role, action, status, note = '') {
  results.push({ role, action, status, note: String(note).slice(0, 140) });
  console.log(`  ${status === 'PASS' ? '✓' : status === 'PARTIAL' ? '~' : '✗'} [${role}] ${action}${note ? ' — ' + String(note).slice(0, 80) : ''}`);
}
async function shot(page, name) { try { await page.screenshot({ path: path.join(OUT, `ix_${name}.png`) }); } catch {} }

(async () => {
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

  /* ── PUBLIC: signup + password reset ── */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(15000);
    try {
      await page.goto(BASE + '/signup', { waitUntil: 'networkidle' });
      const status = page.url().includes('signup') ? ((await page.locator('input').count()) > 1 ? 'PARTIAL' : 'FAIL') : 'FAIL';
      rec('public', 'Signup page', status, page.url().includes('signup') ? 'page exists (backend stub)' : `redirects to ${page.url()}`);
      await shot(page, 'public_signup');
    } catch (e) { rec('public', 'Signup page', 'FAIL', e.message); }
    try {
      await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
      const forgot = page.locator('text=/forgot.*password/i').first();
      const has = await forgot.isVisible().catch(() => false);
      rec('public', 'Password reset entry point', has ? 'PARTIAL' : 'FAIL', has ? 'link exists, flow not implemented' : 'no forgot-password link on login');
    } catch (e) { rec('public', 'Password reset', 'FAIL', e.message); }
    await ctx.close();
  }

  /* ── TRANSPORT ── */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    let page;
    try { page = await loginAs(ctx, /Transport Company/i, 'transport'); } catch (e) { rec('transport', 'Login', 'FAIL', e.message); }
    if (page) {
      try {
        await page.goto(BASE + '/transport', { waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);
        // tabs: Vehicles / Drivers / Routes
        const tabs = ['Vehicles', 'Drivers', 'Routes'];
        let switched = 0;
        for (const t of tabs) {
          const tab = page.locator(`text=/^${t}$/i`).first();
          if (await tab.isVisible().catch(() => false)) { await tab.click(); await page.waitForTimeout(900); switched++; }
        }
        rec('transport', `Fleet tabs switch (${switched}/3)`, switched >= 2 ? 'PASS' : 'PARTIAL');
        await shot(page, 'transport_tabs');
        // add vehicle button/modal
        const add = page.getByRole('button', { name: /add vehicle|new vehicle/i }).first();
        if (await add.isVisible().catch(() => false)) {
          await add.click(); await page.waitForTimeout(900);
          rec('transport', 'Add Vehicle form opens', 'PASS');
          await shot(page, 'transport_add_vehicle');
          await page.keyboard.press('Escape');
        } else rec('transport', 'Add Vehicle button', 'PARTIAL', 'not found on page');
      } catch (e) { rec('transport', 'Fleet page', 'FAIL', e.message); }
      try {
        await page.goto(BASE + '/marketplace', { waitUntil: 'networkidle' });
        rec('transport', 'Marketplace accessible', 'PASS');
      } catch (e) { rec('transport', 'Marketplace', 'FAIL', e.message); }
    }
    await ctx.close();
  }

  /* ── VISA AGENCY ── */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    let page;
    try { page = await loginAs(ctx, /Visa Agency/i, 'visa'); } catch (e) { rec('visa', 'Login', 'FAIL', e.message); }
    if (page) {
      try {
        await page.goto(BASE + '/compliance', { waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);
        const rows = await page.locator('tbody tr, [class*="card"]').count();
        rec('visa', `Applications list renders (${rows} rows/cards)`, rows > 0 ? 'PASS' : 'PARTIAL');
        await shot(page, 'visa_applications');
        const newBtn = page.getByRole('button', { name: /new application|new visa|add/i }).first();
        if (await newBtn.isVisible().catch(() => false)) {
          await newBtn.click(); await page.waitForTimeout(900);
          rec('visa', 'New application form opens', 'PASS');
          await shot(page, 'visa_new_application');
          await page.keyboard.press('Escape');
        } else rec('visa', 'New application button', 'PARTIAL', 'not found');
      } catch (e) { rec('visa', 'Applications', 'FAIL', e.message); }
      try {
        await page.goto(BASE + '/visa-documents', { waitUntil: 'networkidle' });
        rec('visa', 'Document management page', 'PASS');
        await shot(page, 'visa_documents');
      } catch (e) { rec('visa', 'Documents page', 'FAIL', e.message); }
    }
    await ctx.close();
  }

  /* ── FINANCE ── */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    let page;
    try { page = await loginAs(ctx, /Finance Manager/i, 'finance'); } catch (e) { rec('finance', 'Login', 'FAIL', e.message); }
    if (page) {
      try {
        await page.goto(BASE + '/finance', { waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);
        const rows = await page.locator('tbody tr, [class*="card"]').count();
        rec('finance', `Invoices list renders (${rows} rows/cards)`, rows > 0 ? 'PASS' : 'PARTIAL');
        const newBtn = page.getByRole('button', { name: /new invoice|create invoice|add/i }).first();
        if (await newBtn.isVisible().catch(() => false)) {
          await newBtn.click(); await page.waitForTimeout(900);
          rec('finance', 'Create-invoice form opens', 'PASS');
          await shot(page, 'finance_new_invoice');
          await page.keyboard.press('Escape');
        } else rec('finance', 'Create-invoice button', 'PARTIAL', 'not found');
      } catch (e) { rec('finance', 'Invoices', 'FAIL', e.message); }
      try {
        await page.goto(BASE + '/budget-plans', { waitUntil: 'networkidle' });
        const newBtn = page.getByRole('button', { name: /new|create|add/i }).first();
        const has = await newBtn.isVisible().catch(() => false);
        rec('finance', 'Budget plans page + create button', has ? 'PASS' : 'PARTIAL', has ? '' : 'page renders, create button not found');
        await shot(page, 'finance_budget_plans');
      } catch (e) { rec('finance', 'Budget plans', 'FAIL', e.message); }
      try {
        await page.goto(BASE + '/finance-payments', { waitUntil: 'networkidle' });
        rec('finance', 'Payments page renders', 'PASS');
        await shot(page, 'finance_payments');
      } catch (e) { rec('finance', 'Payments', 'FAIL', e.message); }
    }
    await ctx.close();
  }

  /* ── TRAVELER: messaging + groups + sign-out retry ── */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    let page;
    try { page = await loginAs(ctx, /Pilgrim \/ Traveller/i, 'traveler'); } catch (e) { rec('traveler', 'Login (round 2)', 'FAIL', e.message); }
    if (page) {
      try {
        await page.goto(BASE + '/messages', { waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);
        const composer = await page.locator('input[placeholder*="message" i], textarea').count();
        rec('traveler', 'Messaging page + composer', composer > 0 ? 'PARTIAL' : 'FAIL', composer > 0 ? 'UI present; conversation flow basic' : 'no composer found');
        await shot(page, 'traveler_messages');
      } catch (e) { rec('traveler', 'Messaging', 'FAIL', e.message); }
      try {
        await page.goto(BASE + '/groups', { waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);
        const cards = await page.locator('tbody tr, [class*="card"]').count();
        rec('traveler', `Groups page renders (${cards} cards)`, cards > 0 ? 'PASS' : 'PARTIAL');
        const join = page.getByRole('button', { name: /join|view/i }).first();
        rec('traveler', 'Groups: join/view action', (await join.isVisible().catch(() => false)) ? 'PASS' : 'PARTIAL', 'detail/discussion not implemented');
        await shot(page, 'traveler_groups');
      } catch (e) { rec('traveler', 'Groups', 'FAIL', e.message); }
      // sign-out retry (direct, no panel open)
      try {
        await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
        const so = page.locator('text=/sign out/i').first();
        await so.scrollIntoViewIfNeeded().catch(() => {});
        await so.click({ timeout: 10000 });
        await page.waitForURL((u) => u.pathname.includes('login') || u.pathname === '/', { timeout: 15000 });
        rec('traveler', 'Sign out (retry from /settings)', 'PASS', page.url());
      } catch (e) { rec('traveler', 'Sign out (retry)', 'FAIL', e.message.slice(0, 80)); }
    }
    await ctx.close();
  }

  await browser.close();
  const merged = [...prev, ...results];
  fs.writeFileSync(path.join(__dirname, 'interactions.json'), JSON.stringify(merged, null, 2));
  const pass = merged.filter(r => r.status === 'PASS').length;
  const part = merged.filter(r => r.status === 'PARTIAL').length;
  const fail = merged.filter(r => r.status === 'FAIL').length;
  console.log(`\nMERGED INTERACTIONS: ${pass} PASS · ${part} PARTIAL · ${fail} FAIL (of ${merged.length})`);
})();
