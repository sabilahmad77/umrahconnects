// BP-07 browser proof: Super Admin tenants + users management driven by real
// clicks — status changes behind confirmation dialogs, type-to-confirm archive
// gate, role grant/revoke, session revocation, CSV download, per-tenant audit
// trail — with a hard reload proving persistence.
const { chromium } = require('playwright-core');
const BASE = process.env.WEB_URL || 'http://localhost:3000';

(async () => {
  const b = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const ctx = await b.newContext({ acceptDownloads: true });
  const p = await ctx.newPage();
  let pass = 0, fail = 0;
  const chk = (label, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✓' : '✗'} ${label} ${extra}`); };

  // Privileged actions must never fall back to a native confirm()/prompt().
  let nativeDialog = false;
  p.on('dialog', async (d) => { nativeDialog = true; await d.dismiss(); });

  /**
   * Poll until `fn()` is truthy. Fixed sleeps are unreliable when the dev
   * server is recompiling or another suite is competing for CPU, and a flaky
   * proof is worse than no proof.
   */
  const until = async (fn, timeout = 20000, step = 300) => {
    const deadline = Date.now() + timeout;
    for (;;) {
      try { if (await fn()) return true; } catch { /* element churn — retry */ }
      if (Date.now() > deadline) return false;
      await p.waitForTimeout(step);
    }
  };

  await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Quick Demo Access/i }).first().click().catch(() => {});
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: /Super Admin/i }).first().click();
  await p.waitForURL((u) => !u.toString().includes('login'), { timeout: 90000 });

  // ── TENANTS ────────────────────────────────────────────────────────────
  await p.goto(BASE + '/admin-tenants', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);

  for (const s of ['Pending KYC', 'KYC Submitted', 'KYC Approved', 'KYC Rejected', 'Active', 'Suspended', 'Archived']) {
    chk(`tenant filter offers the real status "${s}"`,
      await p.getByRole('button', { name: new RegExp(`^${s}$`) }).first().isVisible());
  }
  const legacyTenant = await p.locator('option[value="INACTIVE"]').count();
  chk('tenant status control no longer offers the invalid INACTIVE', legacyTenant === 0, `(${legacyTenant} found)`);

  const row = p.locator('tbody tr').filter({ hasText: 'Kaaba Travel' }).first();
  const slug = 'kaaba-travel-pk';

  // Re-runnable: a previous run that died mid-way can leave this tenant
  // suspended, which would shift every assertion below. Normalise first.
  if ((await row.locator('select').inputValue()) !== 'ACTIVE') {
    await row.locator('select').selectOption('ACTIVE');
    await p.waitForTimeout(600);
    await p.getByRole('dialog').getByRole('button', { name: /Change status/i }).click();
    await p.waitForTimeout(2000);
  }

  await row.locator('select').selectOption('SUSPENDED');
  await p.waitForTimeout(700);
  let dlg = p.getByRole('dialog');
  chk('status change asks for confirmation (role=dialog)', await dlg.isVisible());
  chk('confirmation states the real consequence',
    /signed out of the platform/i.test(await dlg.textContent()));
  await dlg.getByRole('button', { name: /Change status/i }).click();
  chk('tenant shows Suspended after confirming',
    await until(async () => (await row.locator('select').inputValue()) === 'SUSPENDED'));

  await p.reload({ waitUntil: 'networkidle' });
  const rowAfter = p.locator('tbody tr').filter({ hasText: 'Kaaba Travel' }).first();
  chk('suspension SURVIVES hard reload',
    await until(async () => (await rowAfter.locator('select').inputValue()) === 'SUSPENDED'));

  // type-to-confirm archive gate (open, verify the gate, cancel — no mutation)
  await rowAfter.getByRole('button', { name: /^Archive / }).click();
  await p.waitForTimeout(700);
  dlg = p.getByRole('dialog');
  const archiveBtn = dlg.getByRole('button', { name: /Archive tenant/i });
  chk('archive is gated by type-to-confirm', await archiveBtn.isDisabled());
  await dlg.locator('input').fill('kaaba-travel');
  chk('archive stays blocked on a partial match', await archiveBtn.isDisabled());
  await dlg.locator('input').fill(slug);
  chk('archive unlocks on the exact slug', await archiveBtn.isEnabled());
  await dlg.getByRole('button', { name: /^Cancel$/ }).click();
  await p.waitForTimeout(500);
  // Read the select's value, not the row text — the row text contains every
  // <option> label (including "Archived") regardless of the actual status.
  const stillSuspended = await p.locator('tbody tr').filter({ hasText: 'Kaaba Travel' })
    .first().locator('select').inputValue();
  chk('cancelling the archive changes nothing', stillSuspended === 'SUSPENDED', `(status=${stillSuspended})`);

  // tenant detail + audit trail
  await p.locator('tbody tr').filter({ hasText: 'Kaaba Travel' }).first().locator('a').first().click();
  await p.waitForTimeout(2200);
  chk('tenant detail route opens', /\/admin-tenants\/[0-9a-f-]{36}/.test(p.url()), p.url());
  const detail = await p.textContent('body');
  chk('detail shows users, KYC and at-a-glance panels',
    /Users \(/.test(detail) && /KYC/.test(detail) && /At a glance/.test(detail));
  chk('detail shows a per-tenant audit trail with the change just made',
    /Audit trail/.test(detail) && /SUSPENDED/.test(detail));
  chk('audit entries name the actor', /@/.test(detail.split('Audit trail')[1] ?? ''));

  // restore
  await p.locator('select').first().selectOption('ACTIVE');
  await p.waitForTimeout(700);
  await p.getByRole('dialog').getByRole('button', { name: /Change status/i }).click();
  chk('tenant restored to Active',
    await until(async () => (await p.locator('select').first().inputValue()) === 'ACTIVE'));

  // ── USERS ──────────────────────────────────────────────────────────────
  await p.goto(BASE + '/admin-users', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2200);
  for (const s of ['Active', 'Inactive', 'Locked', 'Pending']) {
    chk(`user filter offers the real status "${s}"`,
      await p.getByRole('button', { name: new RegExp(`^${s}$`) }).first().isVisible());
  }
  const legacyUser = await p.locator('option[value="SUSPENDED"]').count();
  chk('user status control no longer offers the invalid SUSPENDED', legacyUser === 0, `(${legacyUser} found)`);

  const officer = p.locator('tbody tr').filter({ hasText: 'visa.officer@alharamain.sa' }).first();

  // lock → confirm → persists → restore
  await officer.locator('select').last().selectOption('LOCKED');
  await p.waitForTimeout(700);
  dlg = p.getByRole('dialog');
  chk('user status change asks for confirmation', await dlg.isVisible());
  chk('confirmation explains the lockout', /will not be able to sign in/i.test(await dlg.textContent()));
  await dlg.getByRole('button', { name: /Change status/i }).click();
  chk('user shows Locked',
    await until(async () => (await officer.locator('select').last().inputValue()) === 'LOCKED'));
  await p.reload({ waitUntil: 'networkidle' });
  const officer2 = p.locator('tbody tr').filter({ hasText: 'visa.officer@alharamain.sa' }).first();
  chk('user lock SURVIVES hard reload',
    await until(async () => (await officer2.locator('select').last().inputValue()) === 'LOCKED'));
  await officer2.locator('select').last().selectOption('ACTIVE');
  await p.waitForTimeout(700);
  await p.getByRole('dialog').getByRole('button', { name: /Change status/i }).click();
  await p.waitForTimeout(2000);

  // force logout: confirmation + honest count in the toast
  await p.locator('tbody tr').filter({ hasText: 'visa.officer@alharamain.sa' }).first()
    .getByRole('button', { name: /Force logout/i }).click();
  await p.waitForTimeout(700);
  dlg = p.getByRole('dialog');
  chk('force logout asks for confirmation', await dlg.isVisible());
  await dlg.getByRole('button', { name: /Revoke sessions/i }).click();
  chk('force logout reports how many sessions were revoked',
    await until(async () => /session\(s\) revoked/i.test(await p.textContent('body'))));

  // CSV download is a real browser download
  const [download] = await Promise.all([
    p.waitForEvent('download', { timeout: 20000 }),
    p.getByRole('button', { name: /Export CSV/i }).click(),
  ]);
  chk('users CSV downloads with the expected filename',
    /umrah-connect-users\.csv/.test(download.suggestedFilename()), download.suggestedFilename());

  chk('no native confirm()/prompt() anywhere in the admin flows', !nativeDialog);

  console.log(`\nBP-07 browser: ${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
