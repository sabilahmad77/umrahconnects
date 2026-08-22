// BP-06 browser proof: the visa service-request ticket workflow driven by real
// clicks — create → internal note → public response → escalate → resolve →
// close → reopen — with a hard reload proving every state change persisted.
const { chromium } = require('playwright-core');
const BASE = process.env.WEB_URL || 'http://localhost:3000';

(async () => {
  const b = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const p = await b.newPage();
  let pass = 0, fail = 0;
  const chk = (label, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✓' : '✗'} ${label} ${extra}`); };

  // Reason dialogs replaced window.prompt — assert no native prompt ever fires.
  let nativeDialog = false;
  p.on('dialog', async (d) => { nativeDialog = true; await d.dismiss(); });

  // Real email-first sign-in (no tenant field) — the documented login path.
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await p.fill('input[type="email"]', 'admin@alharamain.sa');
  await p.fill('input[type="password"]', 'Admin@1234');
  await p.getByRole('button', { name: /^Sign in$/i }).click();
  await p.waitForURL((u) => !u.toString().includes('login'), { timeout: 45000 });

  // ── queue renders ──
  await p.goto(BASE + '/visa-requests', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  chk('service tickets tab is the default inbox',
    await p.getByRole('tab', { name: /Service tickets/i }).isVisible());
  chk('marketplace demand inbox preserved',
    await p.getByRole('tab', { name: /Marketplace demand/i }).isVisible());

  // ── inline validation blocks an empty subject ──
  await p.getByRole('button', { name: /New request/i }).click();
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: /Create request/i }).click();
  await p.waitForTimeout(600);
  const subject = p.getByLabel('Subject');
  chk('empty subject → inline error, no submit',
    (await subject.getAttribute('aria-invalid')) === 'true' &&
    await p.getByText(/Subject must be at least 3 characters/i).isVisible());

  // ── create via real form input ──
  const stamp = Date.now().toString(36).toUpperCase();
  const SUBJ = `Browser proof ticket ${stamp}`;
  await subject.fill(SUBJ);
  await p.getByLabel('Description').fill('Created by audit/bp06_browser.js with real clicks.');
  await p.getByLabel('Category').selectOption('URGENT_PROCESSING');
  await p.getByLabel('Priority').selectOption('URGENT');
  await p.getByLabel('Requester name').fill('Abubakar Suleiman');
  await p.getByRole('button', { name: /Create request/i }).click();
  await p.waitForTimeout(2500);
  chk('ticket created and listed', await p.getByText(SUBJ).first().isVisible());

  // ── open detail ──
  await p.getByText(SUBJ).first().click();
  await p.waitForTimeout(2500);
  chk('detail page opens on the new ticket', /\/visa-requests\/[0-9a-f-]{36}/.test(p.url()), p.url());
  const ticketUrl = p.url();

  // ── internal note ──
  await p.getByRole('button', { name: /^Internal note$/ }).click();
  await p.getByLabel('Note body').fill('INTERNAL ONLY: portal credentials expired, renewing now.');
  await p.getByRole('button', { name: /^Add note$/ }).click();
  await p.waitForTimeout(2000);
  chk('internal note rendered with INTERNAL badge',
    await p.getByText('INTERNAL', { exact: true }).first().isVisible());

  // ── public response ──
  await p.getByRole('button', { name: /^Public response$/ }).click();
  await p.getByLabel('Note body').fill('Your filing is with our Nusuk desk today.');
  await p.getByRole('button', { name: /^Send response$/ }).click();
  await p.waitForTimeout(2000);
  chk('public response rendered with PUBLIC badge',
    await p.getByText('PUBLIC', { exact: true }).first().isVisible());

  // ── escalate / resolve / close / reopen through the reason dialog ──
  const act = async (button, reason, expectStatus) => {
    await p.getByRole('button', { name: button }).click();
    await p.waitForTimeout(700);
    const dlg = p.getByRole('dialog');
    chk(`${button}: opens an accessible dialog (role=dialog)`, await dlg.isVisible());
    await dlg.locator('textarea').fill(reason);
    await dlg.getByRole('button', { name: button === 'Close' ? /Close ticket/ : new RegExp(`^${button}$`) }).click();
    await p.waitForTimeout(2200);
    const body = await p.textContent('body');
    chk(`${button} → status ${expectStatus}`, body.includes(expectStatus));
  };

  await act('Escalate', 'Departure in 48 hours, no Nusuk confirmation.', 'Escalated');
  await act('Resolve', 'Filing submitted and acknowledged.', 'Resolved');
  await act('Close', 'Visas collected at the Jeddah desk.', 'Closed');
  await act('Reopen', 'One visa PDF is corrupt and must be reissued.', 'Open');

  chk('no native window.prompt used anywhere in the workflow', !nativeDialog);

  // ── HARD RELOAD: everything must still be there ──
  await p.goto(ticketUrl, { waitUntil: 'networkidle' });
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const after = await p.textContent('body');

  chk('reopened status SURVIVES hard reload', /Reopened[\s\S]{0,40}1×/.test(after));
  chk('internal note SURVIVES hard reload', after.includes('INTERNAL ONLY: portal credentials expired'));
  chk('public response SURVIVES hard reload', after.includes('Your filing is with our Nusuk desk today.'));
  for (const ev of ['CREATED', 'INTERNAL_NOTE', 'PUBLIC_REPLY', 'ESCALATED', 'RESOLVED', 'CLOSED', 'REOPENED']) {
    chk(`timeline keeps ${ev} after reload`, after.includes(ev));
  }
  chk('escalation reason persisted', after.includes('Departure in 48 hours, no Nusuk confirmation.'));
  chk('resolution persisted', after.includes('Filing submitted and acknowledged.'));
  chk('first-response clock stamped by the public reply',
    /First response[\s\S]{0,40}\d/.test(after) && !/First response[\s\S]{0,10}—/.test(after));

  console.log(`\nBP-06 browser: ${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
