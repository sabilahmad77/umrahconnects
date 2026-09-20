// Shared helpers for the A11 accessibility / responsive runs.
// Credentials are read from the QA fixture file and used only to fill the
// real /login form; they are never printed or written anywhere.
const fs = require('fs');
const path = require('path');
const { chromium } = require('/Users/macbook/Projects/umrah-connects/audit/node_modules/playwright-core');

const WORKTREE = '/Users/macbook/Projects/umrah-connects-eng100/a11';
const QA_FILE = '/Users/macbook/Projects/umrah-connects-integration/.project/local/qa-credentials.json';
const AXE_SOURCE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const AXE_VERSION = require('axe-core/package.json').version;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
// Dev-only overlays that are not part of the product (absent from `next start`).
const DEV_EXCLUDE = [['nextjs-portal'], ['.tsqd-parent-container'], ['.tsqd-open-btn-container']];

function identities() {
  return JSON.parse(fs.readFileSync(QA_FILE, 'utf8')).identities;
}
function identity(key) {
  const found = identities().find((i) => i.key === key);
  if (!found) throw new Error(`unknown identity ${key}`);
  return found;
}

/** Every page.tsx under app/, as a route pattern ("/bookings/[id]"). */
function routeInventory() {
  const appDir = path.join(WORKTREE, 'apps/web/app');
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'page.tsx') {
        const rel = path.relative(appDir, dir).split(path.sep).filter((s) => !/^\(.*\)$/.test(s));
        const dashboard = path.relative(appDir, dir).startsWith('(dashboard)');
        out.push({ pattern: '/' + rel.join('/'), dashboard });
      }
    }
  };
  walk(appDir);
  return out.map((r) => ({ ...r, pattern: r.pattern === '/' ? '/' : r.pattern.replace(/\/$/, '') })).sort((a, b) => a.pattern.localeCompare(b.pattern));
}
const isDynamic = (pattern) => /\[[^\]]+\]/.test(pattern);
const patternRegex = (pattern) => new RegExp('^' + pattern.replace(/\[[^\]]+\]/g, '[^/]+') + '$');

async function launch() {
  return chromium.launch({ executablePath: CHROME, headless: true, args: ['--disable-dev-shm-usage'] });
}

/** Wait until the workspace/page has stopped showing loading states. */
async function settle(page, { timeout = 12000 } = {}) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page
    .waitForFunction(
      () => {
        const busy = [...document.querySelectorAll('[role="status"]')].some((el) =>
          /Loading|Checking your session|Opening|Signing|Preparing/i.test(el.textContent || ''),
        );
        const pulse = document.querySelectorAll('.animate-pulse').length;
        return !busy && pulse === 0;
      },
      null,
      { timeout },
    )
    .catch(() => {});
  await page.waitForTimeout(350);
}

async function login(page, base, key) {
  const who = identity(key);
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#signin-email');
  // The submit button is disabled until the page has read its query string.
  await page.waitForFunction(() => !document.querySelector('form button[type="submit"]')?.disabled);
  await page.fill('#signin-email', who.email);
  await page.fill('#signin-password', who.password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 45000 }),
    page.click('form button[type="submit"]'),
  ]);
  await settle(page);
  return new URL(page.url()).pathname;
}

/** Map axe tags to WCAG success criteria ("wcag1410" → "1.4.10"). */
function criteria(tags) {
  return tags
    .map((t) => /^wcag(\d)(\d)(\d+)$/.exec(t))
    .filter(Boolean)
    .map((m) => `${m[1]}.${m[2]}.${m[3]}`);
}

async function runAxe(page, { include, tags = WCAG_TAGS, bestPractice = false } = {}) {
  const hasAxe = await page.evaluate(() => typeof window.axe !== 'undefined').catch(() => false);
  if (!hasAxe) await page.evaluate(AXE_SOURCE);
  const values = bestPractice ? [...tags, 'best-practice'] : tags;
  const context = { exclude: DEV_EXCLUDE };
  if (include) context.include = include;
  const res = await page.evaluate(
    async ({ context, values }) => {
      // eslint-disable-next-line no-undef
      const r = await axe.run(context, { runOnly: { type: 'tag', values }, resultTypes: ['violations', 'incomplete'] });
      const slim = (list, full) =>
        list.map((v) => ({
          id: v.id,
          impact: v.impact,
          tags: v.tags,
          help: v.help,
          helpUrl: v.helpUrl,
          nodes: v.nodes.slice(0, full ? 25 : 3).map((n) => ({
            target: n.target,
            html: (n.html || '').slice(0, 300),
            summary: (n.failureSummary || '').slice(0, 400),
            data: n.any?.[0]?.data && typeof n.any[0].data === 'object' ? n.any[0].data : undefined,
          })),
          nodeCount: v.nodes.length,
        }));
      return { violations: slim(r.violations, true), incomplete: slim(r.incomplete, false) };
    },
    { context, values },
  );
  for (const list of [res.violations, res.incomplete])
    for (const v of list) {
      v.wcag = criteria(v.tags);
      v.bestPractice = v.tags.includes('best-practice') && v.wcag.length === 0;
    }
  return res;
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1));
}

module.exports = {
  WORKTREE,
  AXE_VERSION,
  WCAG_TAGS,
  identities,
  identity,
  routeInventory,
  isDynamic,
  patternRegex,
  launch,
  settle,
  login,
  runAxe,
  criteria,
  writeJson,
};
