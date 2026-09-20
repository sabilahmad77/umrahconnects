/**
 * FX1 browser self-check (F2 platform takedown, F13 payment-status honesty).
 *
 * Real Chrome through playwright-core, one context per identity, signing in
 * through the /login form. Credentials come from the QA fixture file and are
 * never printed. Evidence (screenshots + a JSON summary) goes to audit/evidence/fx1.
 */
import { chromium } from '/Users/macbook/Projects/umrah-connects/audit/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB = process.env.FX1_WEB ?? 'http://localhost:3421';
const OUT = join(process.cwd(), 'audit/evidence/fx1');
const CREDS = '/Users/macbook/Projects/umrah-connects-integration/.project/local/qa-credentials.json';
const LISTING = process.env.FX1_LISTING; // a qa-hotel-a listing id
mkdirSync(OUT, { recursive: true });

const identities = JSON.parse(readFileSync(CREDS, 'utf8')).identities;
const who = (key) => {
  const row = identities.find((i) => i.key === key);
  if (!row) throw new Error(`QA identity ${key} missing`);
  return row;
};
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
};

async function signIn(browser, key) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await context.newPage();
  const id = who(key);
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  // Let the form hydrate before typing, or React replaces what was typed.
  await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 120_000 });
  await page.waitForTimeout(2500);
  await page.fill('input[type="email"]', id.email);
  await page.fill('input[type="password"]', id.password);
  await page.click('button[type="submit"]');
  // Next routes on the client, so poll the URL instead of waiting for a document navigation
  // (the dev server compiles each route on first visit, so give the redirect room).
  const deadline = Date.now() + 180_000;
  while (new URL(page.url()).pathname.startsWith('/login')) {
    if (Date.now() > deadline) {
      await shot(page, `signin-failed-${key}`);
      throw new Error(`sign-in for ${key} did not leave /login: ${(await bodyText(page)).slice(0, 200).replace(/\n/g, ' ')}`);
    }
    await page.waitForTimeout(1000);
  }
  return { context, page, id };
}
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
const bodyText = (page) => page.evaluate(() => document.body.innerText);

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});

try {
  // ── F2: platform takedown ────────────────────────────────────────────────
  const admin = await signIn(browser, 'superAdmin');
  await admin.page.goto(`${WEB}/admin-listings`, { waitUntil: 'domcontentloaded' });
  await admin.page.waitForSelector('table', { timeout: 120_000 });
  const rowFor = (name) => admin.page.locator('tr', { hasText: name }).first();
  const listingName = process.env.FX1_LISTING_NAME ?? 'Double room in Ajyad';
  await rowFor(listingName).getByRole('button', { name: /Take down/i }).click();
  await admin.page.getByRole('dialog').waitFor({ timeout: 15_000 });
  const reason = 'QA check: photos show a different property';
  await admin.page.locator('textarea').first().fill(reason);
  await admin.page.getByRole('button', { name: /Take down listing/i }).click();
  await admin.page.waitForTimeout(2500);
  await shot(admin.page, 'f2-admin-after-takedown');
  const adminText = await bodyText(admin.page);
  check('admin listing shows TAKEN DOWN with the reason', adminText.includes('TAKEN DOWN') && adminText.includes(reason));
  check('admin offers Restore for a taken-down listing', /Restore/.test(adminText));

  // Seller: sees the takedown with its reason and no status actions.
  const seller = await signIn(browser, 'hotelA');
  await seller.page.goto(`${WEB}/marketplace?tab=mine`, { waitUntil: 'domcontentloaded' });
  await seller.page.waitForTimeout(6000);
  await shot(seller.page, 'f2-seller-listings');
  const sellerList = await bodyText(seller.page);
  check('seller list shows the takedown and reason', sellerList.includes('Taken down by the platform') && sellerList.includes(reason));
  check('seller list offers no publish action for it', !/Publish\b/.test(sellerList.split('Taken down by the platform')[1]?.slice(0, 400) ?? ''));

  if (LISTING) {
    await seller.page.goto(`${WEB}/marketplace/${LISTING}`, { waitUntil: 'domcontentloaded' });
    await seller.page.waitForTimeout(2500);
    await shot(seller.page, 'f2-seller-listing-page');
    const detail = await bodyText(seller.page);
    check('seller listing page explains the takedown', detail.includes('taken down by the platform') && detail.includes(reason));
    check('seller listing page offers no status buttons', !/\bPublish\b|\bMove to drafts\b/.test(detail));

    // Anonymous: the public page must not show it.
    const anon = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const anonPage = await anon.newPage();
    await anonPage.goto(`${WEB}/marketplace/${LISTING}`, { waitUntil: 'domcontentloaded' });
    await anonPage.waitForTimeout(2500);
    await shot(anonPage, 'f2-public-listing');
    const publicText = await bodyText(anonPage);
    check('public listing page does not show a taken-down listing', !publicText.includes('Ajyad') || /not found|no longer/i.test(publicText), publicText.slice(0, 120).replace(/\n/g, ' '));
    await anon.close();
  }

  // Restore, so the fixture data is left as it was found.
  await admin.page.reload({ waitUntil: 'domcontentloaded' });
  await admin.page.waitForSelector('table', { timeout: 120_000 });
  await rowFor(listingName).getByRole('button', { name: /Restore/i }).click();
  await admin.page.getByRole('dialog').waitFor({ timeout: 15_000 });
  await admin.page.getByRole('button', { name: /Restore and publish/i }).click();
  await admin.page.waitForTimeout(2500);
  const restored = await bodyText(admin.page);
  check('platform restore lifts the takedown', !restored.includes(reason));
  await shot(admin.page, 'f2-admin-after-restore');

  // ── F13: no payment status where no payment is linked ────────────────────
  await seller.page.goto(`${WEB}/hotel-bookings`, { waitUntil: 'domcontentloaded' });
  await seller.page.waitForTimeout(6000);
  await shot(seller.page, 'f13-hotel-bookings');
  const hotelBookings = await bodyText(seller.page);
  check('hotel bookings: no payment column or badge', !/\bUnpaid\b/i.test(hotelBookings));
  check('hotel bookings: honest note about Finance invoices', hotelBookings.includes('Bookings do not track payments'));

  await seller.page.goto(`${WEB}/hotel-dashboard`, { waitUntil: 'domcontentloaded' });
  await seller.page.waitForTimeout(6000);
  await shot(seller.page, 'f13-hotel-dashboard');
  const hotelDash = await bodyText(seller.page);
  check('hotel dashboard: booked value replaces the dead paid figures', hotelDash.includes('Booked value') && !/recorded as paid|Not yet paid/i.test(hotelDash));

  const transport = await signIn(browser, 'transportA');
  await transport.page.goto(`${WEB}/transport/bookings`, { waitUntil: 'domcontentloaded' });
  await transport.page.waitForTimeout(6000);
  await shot(transport.page, 'f13-transport-bookings');
  const trips = await bodyText(transport.page);
  check('trips: no payment column or badge', !/\bUnpaid\b/i.test(trips));
  check('trips: honest note about Finance invoices', trips.includes('Trips do not track payments'));

  await transport.page.goto(`${WEB}/transport-dashboard`, { waitUntil: 'domcontentloaded' });
  await transport.page.waitForTimeout(6000);
  await shot(transport.page, 'f13-transport-dashboard');
  const tripDash = await bodyText(transport.page);
  check('transport dashboard: booked value replaces the dead paid figures', tripDash.includes('Booked value') && !/recorded as paid|Not yet paid/i.test(tripDash));

  const visa = await signIn(browser, 'visaA');
  await visa.page.goto(`${WEB}/visa-dashboard`, { waitUntil: 'domcontentloaded' });
  await visa.page.waitForTimeout(6000);
  await shot(visa.page, 'f13-visa-dashboard');
  const visaDash = await bodyText(visa.page);
  check('visa dashboard: booked fees replace the dead paid figures', visaDash.includes('Service fees booked') && !/recorded as paid|Not yet paid/i.test(visaDash));

  await visa.page.goto(`${WEB}/compliance`, { waitUntil: 'domcontentloaded' });
  await visa.page.waitForTimeout(6000);
  const firstCase = visa.page.locator('a[href^="/compliance/"]').first();
  if (await firstCase.count()) {
    await firstCase.click();
    await visa.page.waitForTimeout(6000);
    await shot(visa.page, 'f13-visa-detail');
    const visaDetail = await bodyText(visa.page);
    check('visa detail: no payment badge', !/\bUnpaid\b/i.test(visaDetail), visaDetail.slice(0, 80).replace(/\n/g, ' '));
  }

  await admin.context.close();
  await seller.context.close();
  await transport.context.close();
  await visa.context.close();
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.pass);
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ at: new Date().toISOString(), web: WEB, results }, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}
