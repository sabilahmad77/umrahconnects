// BP-08 browser proof: the visa document workflow driven by real clicks —
// add a required document, upload a real file through the file input,
// replace it (new version), verify, reject with a reason — plus the storage
// honesty banner, with a hard reload proving persistence.
const { chromium } = require('playwright-core');
const { writeFileSync, mkdtempSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const BASE = process.env.WEB_URL || 'http://localhost:3000';

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000000100000001080600000' +
  '01f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082', 'hex');

(async () => {
  const b = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const p = await b.newPage();
  let pass = 0, fail = 0;
  const chk = (label, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✓' : '✗'} ${label} ${extra}`); };
  let nativeDialog = false;
  p.on('dialog', async (d) => { nativeDialog = true; await d.dismiss(); });

  const until = async (fn, timeout = 20000, step = 300) => {
    const deadline = Date.now() + timeout;
    for (;;) {
      try { if (await fn()) return true; } catch { /* retry */ }
      if (Date.now() > deadline) return false;
      await p.waitForTimeout(step);
    }
  };

  const dir = mkdtempSync(join(tmpdir(), 'bp08-'));
  const f1 = join(dir, 'passport.png'); writeFileSync(f1, PNG);
  const f2 = join(dir, 'passport-v2.png'); writeFileSync(f2, PNG);

  await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await p.fill('input[type="email"]', 'admin@alharamain.sa');
  await p.fill('input[type="password"]', 'Admin@1234');
  await p.getByRole('button', { name: /^Sign in$/i }).click();
  await p.waitForURL((u) => !u.toString().includes('login'), { timeout: 90000 });

  // ── register screen ────────────────────────────────────────────────────
  await p.goto(BASE + '/visa-documents', { waitUntil: 'networkidle' });
  chk('document register renders', await until(() => p.getByText(/Document management/i).first().isVisible()));
  const banner = await p.textContent('body');
  chk('storage banner states where files actually live',
    /Storage: (local|s3|cloudinary)/.test(banner), (banner.match(/Storage: \w+/) || [''])[0]);
  chk('ephemeral local storage is called out honestly, not hidden',
    !/Storage: local/.test(banner) || /wiped on every deploy/i.test(banner));

  // ── open a visa application and work its Documents tab ─────────────────
  await p.goto(BASE + '/compliance', { waitUntil: 'networkidle' });
  await until(() => p.locator('a[href^="/compliance/"]').first().isVisible());
  await p.locator('a[href^="/compliance/"]').first().click();
  await until(() => /\/compliance\/[0-9a-f-]{36}/.test(p.url()));
  const appUrl = p.url();
  await p.getByRole('button', { name: /^documents$/i }).first().click();
  chk('documents tab opens on the application',
    await until(() => p.getByLabel('Document name').isVisible()));

  // add a required document
  const stamp = Date.now().toString(36).toUpperCase();
  const NAME = `Browser doc ${stamp}`;
  await p.getByLabel('Document name').fill(NAME);
  await p.getByLabel('Document type').selectOption('PASSPORT');
  await p.getByRole('button', { name: /^Add document$/ }).click();
  chk('document added to the checklist', await until(() => p.getByText(NAME).first().isVisible()));
  chk('a document with no file shows as Missing',
    await until(async () => /Missing/.test(await p.textContent('body'))));

  // ── real file upload through the hidden file input ─────────────────────
  await p.setInputFiles(`input[aria-label="Upload a file for ${NAME}"]`, f1);
  chk('uploading a real file marks it Received v1',
    await until(async () => {
      const t = await p.textContent('body');
      return t.includes('Received') && /v1/.test(t);
    }));

  // ── verify ─────────────────────────────────────────────────────────────
  await p.getByRole('button', { name: `Verify ${NAME}` }).click();
  chk('verify marks the document Verified',
    await until(async () => (await p.textContent('body')).includes('Verified')));

  // ── replace → new version, verification invalidated ────────────────────
  await p.setInputFiles(`input[aria-label="Upload a file for ${NAME}"]`, f2);
  chk('replacing the file creates v2',
    await until(async () => /v2/.test(await p.textContent('body'))));
  chk('a replacement drops the document back to Received',
    await until(async () => {
      const t = await p.textContent('body');
      return t.includes('Received');
    }));

  // ── reject requires a reason, captured in a real dialog ────────────────
  await p.getByRole('button', { name: `Reject ${NAME}` }).click();
  const dlg = p.getByRole('dialog');
  chk('reject opens an accessible dialog (role=dialog)', await until(() => dlg.isVisible()));
  const rejectBtn = dlg.getByRole('button', { name: /Reject document/i });
  chk('reject is blocked until a reason is given', await rejectBtn.isDisabled());
  await dlg.locator('textarea').fill('Glare obscures the MRZ line');
  chk('reject unlocks once a reason is typed', await rejectBtn.isEnabled());
  await rejectBtn.click();
  chk('document is rejected with its reason shown',
    await until(async () => (await p.textContent('body')).includes('Glare obscures the MRZ line')));

  // ── hard reload: everything persists ───────────────────────────────────
  await p.goto(appUrl, { waitUntil: 'networkidle' });
  await p.reload({ waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /^documents$/i }).first().click();
  await until(() => p.getByText(NAME).first().isVisible());
  const after = await p.textContent('body');
  chk('document SURVIVES hard reload', after.includes(NAME));
  chk('rejection reason SURVIVES hard reload', after.includes('Glare obscures the MRZ line'));
  chk('version number SURVIVES hard reload', /v2/.test(after));

  // version history
  await p.getByRole('button', { name: new RegExp(`Version history for ${NAME}`) }).first().click();
  chk('version history lists both versions',
    await until(async () => {
      const t = await p.textContent('body');
      return /superseded/.test(t) && /current/.test(t);
    }));

  chk('no native confirm()/prompt() in the document workflow', !nativeDialog);

  console.log(`\nBP-08 browser: ${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
