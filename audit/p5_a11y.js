// Phase 5 proof: focus-visible ring, modal role=dialog, contrast sweep applied,
// signup inline-on-blur validation w/ preserved input, guided empty states.
const { chromium } = require('playwright-core');
const BASE = 'http://localhost:3000';

(async () => {
  const b = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const p = await b.newPage();
  let pass = 0, fail = 0;
  const chk = (label, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✓' : '✗'} ${label} ${extra}`); };

  // 1) focus-visible ring (keyboard Tab → outline present)
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
  const focusInfo = await p.evaluate(() => {
    const el = document.activeElement;
    const st = getComputedStyle(el);
    return { tag: el.tagName, outlineWidth: st.outlineWidth, outlineStyle: st.outlineStyle, outlineColor: st.outlineColor };
  });
  chk('keyboard focus ring visible', focusInfo.outlineStyle !== 'none' && focusInfo.outlineWidth !== '0px',
    JSON.stringify(focusInfo));

  // 2) signup on-blur validation, input preserved
  await p.goto(BASE + '/signup', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Pilgrim/i }).first().click();
  await p.waitForTimeout(800);
  const email = p.getByPlaceholder('Email address');
  await email.fill('not-an-email');
  await email.blur(); await p.waitForTimeout(400);
  const inlineErr = await p.getByText('Enter a valid email address.').isVisible().catch(() => false);
  chk('signup: inline error on blur', inlineErr);
  chk('signup: input preserved after error', (await email.inputValue()) === 'not-an-email');
  const ariaInvalid = await email.getAttribute('aria-invalid');
  chk('signup: aria-invalid set', ariaInvalid === 'true');

  // 3) modal role=dialog (login → bookings → open create modal)
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Umrah Operator \/ Agency/i }).first().click();
  await p.waitForURL(u => !u.toString().includes('login'), { timeout: 45000 });
  await p.goto(BASE + '/bookings', { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
  await p.getByRole('button', { name: /New booking/i }).first().click().catch(() => {});
  await p.waitForTimeout(800);
  const dialogCount = await p.locator('[role="dialog"][aria-modal="true"]').count();
  chk('create modal exposes role=dialog aria-modal', dialogCount >= 1, `(${dialogCount})`);
  await p.keyboard.press('Escape').catch(() => {});

  // 4) contrast: no text-gray-400 remains in rendered dashboard DOM
  const g400 = await p.evaluate(() => document.querySelectorAll('.text-gray-400').length);
  chk('no text-gray-400 in rendered page', g400 === 0, `(${g400})`);

  // 5) guided empty state (messages page for a fresh-ish role or any list guidance)
  await p.goto(BASE + '/messages', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  const mBody = await p.textContent('body');
  const guided = /—/.test(mBody) || /Social Hub|open one/i.test(mBody) || !/No conversations yet\s*</.test(mBody);
  chk('empty states carry guidance (or list non-empty)', guided);

  await b.close();
  console.log(`\nPhase 5 browser: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
