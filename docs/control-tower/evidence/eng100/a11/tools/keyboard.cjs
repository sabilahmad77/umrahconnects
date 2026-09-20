// Keyboard and focus acceptance checks (WCAG 2.1.1, 2.1.2, 2.4.1, 2.4.3, 2.4.7,
// 2.4.11, 3.3.1, 3.3.8, 4.1.3) driven with real key presses in Chrome.
// Usage: BASE=http://localhost:3411 node keyboard.cjs out.json
const L = require('./lib.cjs');
const BASE = process.env.BASE || 'http://localhost:3411';
const OUT = process.argv[2] || 'keyboard.json';
const checks = [];
const walks = [];

function check(id, sc, where, pass, detail) {
  checks.push({ id, sc, where, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${sc.padEnd(14)} ${id} @ ${where} ${detail ? '— ' + String(detail).slice(0, 160) : ''}`);
}

const active = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { tag: 'BODY' };
    return {
      tag: el.tagName,
      id: el.id,
      role: el.getAttribute('role'),
      name: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      inDialog: !!el.closest('[role="dialog"],[role="alertdialog"]'),
      inMenu: !!el.closest('[role="menu"]'),
    };
  });

/** Tab through a page, recording each stop and whether its focus is visible and unobscured. */
async function walk(page, label, max = 160) {
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
  });
  // Start from the top of the document.
  await page.evaluate(() => {
    const s = document.createElement('span');
    s.tabIndex = -1;
    s.id = '__walk_start';
    document.body.prepend(s);
    s.focus();
  });
  const stops = [];
  let first = null;
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(60);
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el.id === '__walk_start') return { body: true };
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const vw = innerWidth, vh = innerHeight;
      // Sample points inside the element: is any of them actually this element (or inside it)?
      const pts = [
        [r.left + r.width / 2, r.top + r.height / 2],
        [r.left + 3, r.top + 3],
        [r.right - 3, r.top + 3],
        [r.left + 3, r.bottom - 3],
        [r.right - 3, r.bottom - 3],
      ].filter(([x, y]) => x >= 0 && y >= 0 && x < vw && y < vh);
      const visiblePts = pts.filter(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return hit && (hit === el || el.contains(hit) || hit.contains(el));
      }).length;
      if (!el.dataset.walkId) el.dataset.walkId = String(Math.random()).slice(2, 10);
      return {
        id: el.dataset.walkId,
        tag: el.tagName,
        role: el.getAttribute('role'),
        name: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 50),
        tabindex: el.getAttribute('tabindex'),
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        size: r.width * r.height,
        inViewport: r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw,
        samples: pts.length,
        visiblePts,
        style: {
          outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
          shadow: cs.boxShadow,
          bg: cs.backgroundColor,
          border: cs.borderColor + ' ' + cs.borderWidth,
          deco: cs.textDecorationLine,
          color: cs.color,
        },
      };
    });
    if (info.body) {
      stops.push({ body: true });
      if (stops.filter((s) => s.body).length > 1) break;
      continue;
    }
    if (first && info.id === first) break; // completed a full cycle
    if (!first) first = info.id;
    stops.push(info);
  }
  // Focus indicator: the focused style must differ from the unfocused style of the same element.
  for (const s of stops.filter((x) => !x.body)) {
    const unfocused = await page.evaluate((id) => {
      const el = document.querySelector(`[data-walk-id="${id}"]`);
      if (!el) return null;
      const probe = document.getElementById('__walk_start');
      probe?.focus();
      const cs = getComputedStyle(el);
      return {
        outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
        shadow: cs.boxShadow,
        bg: cs.backgroundColor,
        border: cs.borderColor + ' ' + cs.borderWidth,
        deco: cs.textDecorationLine,
        color: cs.color,
      };
    }, s.id);
    s.indicator = unfocused ? Object.keys(s.style).filter((k) => s.style[k] !== unfocused[k]) : ['(element gone)'];
    s.outlineVisible = /^(solid|dashed|dotted|double|auto)/.test(s.style.outline) && !/ 0px /.test(s.style.outline) && !/rgba\(0, 0, 0, 0\)|transparent/.test(s.style.outline);
  }
  const real = stops.filter((s) => !s.body);
  const positive = real.filter((s) => Number(s.tabindex) > 0);
  const noIndicator = real.filter((s) => s.indicator.length === 0);
  const hidden = real.filter((s) => s.size < 4 && !/Skip to content/.test(s.name));
  const obscured = real.filter((s) => s.inViewport && s.samples > 0 && s.visiblePts === 0);
  const offscreen = real.filter((s) => !s.inViewport);
  const reachedEnd = stops.some((s) => s.body) || real.length < max;
  walks.push({ label, stops: real.length, reachedEnd, positive: positive.length, noIndicator: noIndicator.map((s) => `${s.tag} "${s.name}"`), hidden: hidden.map((s) => `${s.tag} "${s.name}"`), obscured: obscured.map((s) => `${s.tag} "${s.name}" ${s.rect}`), offscreen: offscreen.map((s) => `${s.tag} "${s.name}"`), order: real.map((s) => `${s.tag}${s.role ? `[${s.role}]` : ''} ${s.name} ${s.indicator.join('+') || 'NO-INDICATOR'}`) });
  check('tab-cycle-completes', '2.1.1/2.1.2', label, reachedEnd, `${real.length} stops`);
  check('no-positive-tabindex', '2.4.3', label, positive.length === 0, positive.map((s) => s.name).join(', '));
  check('focus-visible-every-stop', '2.4.7', label, noIndicator.length === 0, noIndicator.map((s) => `${s.tag} "${s.name}"`).join('; '));
  check('no-invisible-stops', '2.4.3', label, hidden.length === 0, hidden.map((s) => `${s.tag} "${s.name}" ${s.rect}`).join('; '));
  check('focus-not-obscured', '2.4.11', label, obscured.length === 0, obscured.map((s) => `${s.tag} "${s.name}" ${s.rect}`).join('; '));
  return real;
}

async function skipLink(page, label, mainId) {
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
  });
  await page.evaluate(() => {
    const s = document.createElement('span');
    s.tabIndex = -1;
    document.body.prepend(s);
    s.focus();
    s.remove();
  });
  await page.keyboard.press('Tab');
  const a = await page.evaluate(() => {
    const el = document.activeElement;
    const r = el.getBoundingClientRect();
    return { text: el.textContent.trim(), href: el.getAttribute('href'), top: r.top, bottom: r.bottom, visible: r.bottom > 0 && r.top < innerHeight && r.width > 20 };
  });
  check('skip-link-first-stop', '2.4.1', label, /Skip to content/.test(a.text), a.text);
  check('skip-link-visible-on-focus', '2.4.7', label, a.visible, `top=${Math.round(a.top)}`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const after = await active(page);
  check('skip-link-moves-focus-to-main', '2.4.1', label, after.id === mainId, `${after.tag}#${after.id}`);
}

async function focusByName(page, selector) {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: 'visible', timeout: 15000 });
  await loc.focus();
  return loc;
}

/** Open a dialog from its trigger with the keyboard; check trap, Escape and focus return. */
async function dialogCheck(page, label, triggerSelector, { key = 'Enter', closeKey = 'Escape' } = {}) {
  let trigger;
  try {
    trigger = await focusByName(page, triggerSelector);
  } catch {
    check('dialog-trigger-present', '2.1.1', label, false, triggerSelector);
    return;
  }
  const triggerName = (await trigger.getAttribute('aria-label')) || (await trigger.textContent()).trim();
  await page.keyboard.press(key);
  await page.waitForTimeout(700);
  const opened = await page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').count();
  check('dialog-opens-with-keyboard', '2.1.1', label, opened > 0, triggerName);
  if (!opened) return;
  const inside0 = await active(page);
  check('dialog-moves-focus-inside', '2.4.3', label, inside0.inDialog, `${inside0.tag} "${inside0.name}"`);
  const dialogName = await page.evaluate(() => {
    const d = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].pop();
    const id = d?.getAttribute('aria-labelledby');
    return (d?.getAttribute('aria-label') || (id && document.getElementById(id)?.textContent) || '').trim();
  });
  check('dialog-has-accessible-name', '4.1.2', label, !!dialogName, dialogName);
  let escaped = 0;
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    if (!(await active(page)).inDialog) escaped++;
  }
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Shift+Tab');
    if (!(await active(page)).inDialog) escaped++;
  }
  check('dialog-traps-focus', '2.4.3', label, escaped === 0, `${escaped} of 50 Tab/Shift+Tab presses left the dialog`);
  await page.keyboard.press(closeKey);
  await page.waitForTimeout(600);
  const still = await page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').count();
  check('dialog-closes-with-escape', '2.1.2', label, still === 0);
  const back = await active(page);
  check('dialog-returns-focus-to-trigger', '2.4.3', label, back.name && triggerName && back.name.includes(triggerName.slice(0, 12)), `${back.tag} "${back.name}" (trigger "${triggerName}")`);
}

async function menuCheck(page, label) {
  await focusByName(page, 'header button[aria-label="Account menu"]');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const a1 = await active(page);
  check('menu-opens-focus-first-item', '2.1.1', label, a1.inMenu, `${a1.tag}[${a1.role}] "${a1.name}"`);
  await page.keyboard.press('ArrowDown');
  const a2 = await active(page);
  check('menu-arrow-moves-focus', '2.1.1', label, a2.inMenu && a2.name !== a1.name, `"${a1.name}" → "${a2.name}"`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const a3 = await active(page);
  check('menu-escape-returns-focus', '2.4.3', label, a3.name === 'Account menu', `${a3.tag} "${a3.name}"`);
  // Notification popover.
  const bell = page.locator('header button[aria-label^="Notifications"]').first();
  if (await bell.isVisible().catch(() => false)) {
    await bell.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    const open = await page.evaluate(() => document.querySelector('header button[aria-label^="Notifications"]')?.getAttribute('aria-expanded'));
    check('notifications-open-with-keyboard', '2.1.1', label, open === 'true', `aria-expanded=${open}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const a4 = await active(page);
    check('notifications-escape-returns-focus', '2.4.3', label, /Notifications/.test(a4.name), `${a4.tag} "${a4.name}"`);
  }
}

async function tabsCheck(page, label) {
  const first = page.locator('main [role="tab"][aria-selected="true"]').first();
  if (!(await first.isVisible().catch(() => false))) return check('tabs-present', '2.1.1', label, false);
  await first.focus();
  const before = await active(page);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  const after = await active(page);
  const selected = await page.evaluate(() => document.activeElement?.getAttribute('aria-selected'));
  check('tabs-arrow-keys-move-and-select', '2.1.1', label, after.role === 'tab' && after.name !== before.name && selected === 'true', `"${before.name}" → "${after.name}" selected=${selected}`);
  await page.keyboard.press('Tab');
  const panel = await page.evaluate(() => !!document.activeElement?.closest('[role="tabpanel"]') || document.activeElement?.getAttribute('role') === 'tabpanel');
  check('tabs-tab-moves-into-panel', '2.4.3', label, panel);
}

async function pasteCheck(page, label, selector) {
  await page.evaluate(() => navigator.clipboard.writeText('Pasted-Value-123'));
  const field = page.locator(selector).first();
  await field.click();
  await field.fill('');
  await page.keyboard.press('Meta+V');
  await page.waitForTimeout(150);
  let value = await field.inputValue();
  if (!value) {
    // Fallback: a synthetic paste event must not be cancelled by the page.
    const prevented = await field.evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'x');
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      return !el.dispatchEvent(ev);
    });
    value = prevented ? '' : '(paste event not cancelled)';
  }
  const ac = await field.getAttribute('autocomplete');
  check('auth-field-allows-paste', '3.3.8', `${label} ${selector}`, !!value, `value=${value ? 'pasted' : 'empty'} autocomplete=${ac}`);
}

(async () => {
  const browser = await L.launch();
  const ctx = async () => {
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    return c;
  };

  // ── Public site and authentication (anonymous) ──────────────────────────
  {
    const c = await ctx();
    const page = await c.newPage();
    await page.goto(`${BASE}/`);
    await L.settle(page);
    await skipLink(page, 'public /', 'public-main');
    await walk(page, 'public / (1280)');
    await page.goto(`${BASE}/login`);
    await L.settle(page);
    await walk(page, 'login (1280)');
    await pasteCheck(page, 'login', '#signin-email');
    await pasteCheck(page, 'login', '#signin-password');
    const captcha = await page.locator('iframe[src*="captcha"], [class*="captcha" i], [id*="captcha" i]').count();
    check('login-no-cognitive-test', '3.3.8', 'login', captcha === 0, `${captcha} captcha elements`);
    const ac = await page.evaluate(() => ({ email: document.querySelector('#signin-email')?.autocomplete, pw: document.querySelector('#signin-password')?.autocomplete }));
    check('login-autocomplete-tokens', '1.3.5/3.3.8', 'login', ac.email === 'username' && ac.pw === 'current-password', JSON.stringify(ac));
    // Wrong credentials: the error is announced and focus is not lost.
    await page.fill('#signin-email', L.identity('travelerA').email);
    await page.fill('#signin-password', 'Not-the-password-1');
    await page.locator('form button[type="submit"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('[role="alert"]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(400);
    const alertText = await page.locator('main [role="alert"]').first().textContent().catch(() => '');
    check('login-error-in-alert-region', '3.3.1/4.1.3', 'login', /Unable to continue/.test(alertText || ''), alertText);
    const afterFail = await active(page);
    check('login-focus-kept-after-failed-submit', '2.4.3', 'login', afterFail.tag !== 'BODY', `${afterFail.tag} "${afterFail.name}"`);
    // Signup and reset-password: paste into password fields.
    await page.goto(`${BASE}/signup`);
    await L.settle(page);
    const signupPw = await page.locator('input[type="password"]').count();
    for (let i = 0; i < signupPw; i++) await pasteCheck(page, 'signup', `input[type="password"] >> nth=${i}`);
    const signupAc = await page.evaluate(() => [...document.querySelectorAll('input[type="password"]')].map((i) => i.autocomplete));
    check('signup-new-password-autocomplete', '1.3.5', 'signup', signupAc.every((v) => v === 'new-password'), JSON.stringify(signupAc));
    // Signup empty submit: errors are identified in text and announced.
    const submit = page.locator('main form button[type="submit"]').first();
    if (await submit.isVisible().catch(() => false)) {
      await submit.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(800);
      const state = await page.evaluate(() => ({
        alerts: [...document.querySelectorAll('main [role="alert"], main [aria-live]')].map((a) => a.textContent.trim()).filter(Boolean),
        invalid: document.querySelectorAll('main [aria-invalid="true"], main :invalid').length,
        focus: document.activeElement?.tagName + ' ' + (document.activeElement?.getAttribute('name') || document.activeElement?.id || ''),
      }));
      check('signup-empty-submit-identifies-errors', '3.3.1', 'signup', state.alerts.length > 0 || state.invalid > 0, JSON.stringify(state));
    }
    await page.goto(`${BASE}/contact`);
    await L.settle(page);
    await walk(page, 'contact (1280)');
    // Mobile public navigation drawer.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/`);
    await L.settle(page);
    await dialogCheck(page, 'public mobile navigation (390)', 'header button[aria-label="Open navigation"]');
    await c.close();
  }

  // ── Traveler ────────────────────────────────────────────────────────────
  {
    const c = await ctx();
    const page = await c.newPage();
    await L.login(page, BASE, 'travelerA');
    await skipLink(page, 'traveler /travel-plan', 'workspace-main');
    await walk(page, 'traveler /travel-plan (1280)');
    await menuCheck(page, 'traveler header');
    await page.goto(`${BASE}/requests`);
    await L.settle(page);
    await dialogCheck(page, 'traveler /requests New request', 'main button:has-text("New request")');
    // Form error inside the dialog.
    await focusByName(page, 'main button:has-text("New request")');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    await focusByName(page, '[role="dialog"] button:has-text("Post request")');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    const err = await page.locator('[role="dialog"] [role="alert"]').first().textContent().catch(() => '');
    check('dialog-form-error-announced', '3.3.1/4.1.3', 'traveler New request', /title/i.test(err || ''), err);
    await page.keyboard.press('Escape');
    await page.goto(`${BASE}/social`);
    await L.settle(page);
    await tabsCheck(page, 'traveler /social tabs');
    // Mobile workspace navigation drawer.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/travel-plan`);
    await L.settle(page);
    await dialogCheck(page, 'workspace mobile navigation (390)', 'header button[aria-label="Open workspace navigation"]');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}/settings`);
    await L.settle(page);
    await walk(page, 'traveler /settings (1280)');
    await c.close();
  }

  // ── Operator administrator ──────────────────────────────────────────────
  {
    const c = await ctx();
    const page = await c.newPage();
    await L.login(page, BASE, 'operatorAdminA');
    await skipLink(page, 'operator /dashboard', 'workspace-main');
    await walk(page, 'operator /dashboard (1280)');
    await page.goto(`${BASE}/pilgrims`);
    await L.settle(page);
    await walk(page, 'operator /pilgrims (1280)');
    const addPilgrim = page.locator('main button').filter({ hasText: /^(\s*)(Add|New) pilgrim/i }).first();
    if (await addPilgrim.isVisible().catch(() => false)) await dialogCheck(page, 'operator /pilgrims add pilgrim', 'main button:text-matches("(Add|New) pilgrim", "i")');
    await page.goto(`${BASE}/bookings`);
    await L.settle(page);
    await walk(page, 'operator /bookings (1280)');
    await c.close();
  }

  // ── Other roles: one representative list page each ──────────────────────
  for (const [key, route] of [
    ['financeA', '/finance'],
    ['hotelA', '/hotels'],
    ['transportA', '/transport/vehicles'],
    ['visaA', '/compliance'],
    ['superAdmin', '/admin-tenants'],
  ]) {
    const c = await ctx();
    const page = await c.newPage();
    await L.login(page, BASE, key);
    await page.goto(`${BASE}${route}`);
    await L.settle(page);
    await walk(page, `${key} ${route} (1280)`);
    await c.close();
  }

  await browser.close();
  const summary = { total: checks.length, passed: checks.filter((c) => c.pass).length, failed: checks.filter((c) => !c.pass).length };
  L.writeJson(OUT, { base: BASE, when: new Date().toISOString(), summary, checks, walks });
  console.log(JSON.stringify(summary));
})();
