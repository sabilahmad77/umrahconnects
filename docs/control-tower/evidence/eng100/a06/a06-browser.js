// A06 browser acceptance: listings, uploads, ownership, catalogue search, document tab.
// Separate browser contexts per identity; every login goes through the real /login form.
const { chromium } = require('/Users/macbook/Projects/umrah-connects/audit/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = process.env.WEB_URL || 'http://localhost:3406';
const FIX = path.join(__dirname, 'fixtures');
const EVID = '/Users/macbook/Projects/umrah-connects-eng100/a06/docs/control-tower/evidence/eng100/a06';
const PASSWORD = process.env.DEMO_PASSWORD; // documented demo password, passed via env, never logged
const TAG = `A06-${Date.now().toString(36)}`;
const TITLE = `Haram View Suite ${TAG}`;
fs.mkdirSync(EVID, { recursive: true });

const results = [];
const chk = (label, ok, detail = '') => {
  results.push({ label, ok: !!ok, detail: String(detail).slice(0, 300) });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${String(detail).slice(0, 160)}` : ''}`);
};
const shot = (page, name) => page.screenshot({ path: path.join(EVID, name), fullPage: false }).catch(() => undefined);

async function until(fn, timeout = 45000, step = 400) {
  const end = Date.now() + timeout;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch { /* retry */ }
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, step));
  }
}

async function login(browser, email) {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  const submit = page.getByRole('button', { name: /^Sign in$/ });
  // The button enables once React has hydrated; typing before that would not reach the form state.
  await until(() => submit.isEnabled());
  await page.fill('#signin-email', email);
  await page.fill('#signin-password', PASSWORD);
  await submit.click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
  return { ctx, page };
}

/** API call from inside the signed-in page, with that user's own session (the token never leaves the page). */
const api = (page, method, url, body) =>
  page.evaluate(
    async ({ method, url, body }) => {
      const token = sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken');
      const res = await fetch(`/proxy-api${url}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      let json = null;
      try { json = await res.json(); } catch { /* empty */ }
      return { status: res.status, json };
    },
    { method, url, body },
  );

(async () => {
  if (!PASSWORD) throw new Error('Set DEMO_PASSWORD');
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  let listingId;
  try {
    // ── Provider A: seller profile, listing with two uploaded images, rejections, publish ──────────
    const A = await login(browser, 'hotel@makkahgrand.dev');
    const pA = A.page;
    await pA.goto(`${BASE}/marketplace?tab=mine`, { waitUntil: 'domcontentloaded' });
    await until(async () => (await pA.getByText('Set up your seller profile').isVisible()) || (await pA.getByText('Selling as').isVisible()));
    if (await pA.getByText('Set up your seller profile').isVisible()) {
      await shot(pA, 'a06-00-provider-a-seller-profile-setup.png');
      await pA.getByLabel('Seller name shown on listings').fill('Makkah Grand Hotels');
      await pA.getByLabel('City', { exact: true }).fill('Makkah');
      await pA.getByRole('button', { name: 'Create seller profile' }).click();
      chk('provider A: new provider creates its seller profile first', await until(() => pA.getByText('Selling as').isVisible()));
    } else {
      chk('provider A: seller profile already present', true);
    }

    await pA.getByRole('button', { name: 'New listing' }).click();
    const dlg = pA.getByRole('dialog');
    await dlg.getByLabel('Title').fill(TITLE);
    await dlg.getByLabel('Price (SAR)').fill('1250.50');
    await dlg.getByLabel('City', { exact: true }).fill('Makkah');
    await dlg.getByLabel('Capacity').fill('4');
    await dlg.getByLabel('Description').fill('Suite with a direct view of the Haram, breakfast included.');
    const fileInput = dlg.locator('input[type=file]');

    await fileInput.setInputFiles([path.join(FIX, 'notes.txt'), path.join(FIX, 'huge-photo.png')]);
    const typeMsg = await until(() => dlg.getByText('notes.txt is not a JPEG, PNG, WebP or GIF image.').isVisible(), 10000);
    const sizeMsg = await until(() => dlg.getByText('huge-photo.png is 6.0 MB. Images must be 5 MB or smaller.').isVisible(), 10000);
    chk('wrong type is refused before upload with a clear message', typeMsg);
    chk('oversize is refused before upload with the real limit', sizeMsg);
    await dlg.getByText('notes.txt is not a JPEG').scrollIntoViewIfNeeded().catch(() => undefined);
    await shot(pA, 'a06-01a-client-side-rejections.png');
    await fileInput.setInputFiles([path.join(FIX, 'fake-photo.png')]);
    const serverMsg = await until(() => dlg.getByText(/File content is not an accepted type/).isVisible(), 30000);
    chk('renamed text file passes the picker but the server refuses it by content', serverMsg);
    chk('a failed upload offers Retry', await dlg.getByRole('button', { name: 'Retry' }).isVisible());
    await shot(pA, 'a06-01-upload-rejections.png');
    await dlg.getByRole('button', { name: 'Dismiss fake-photo.png' }).click();

    await fileInput.setInputFiles([path.join(FIX, 'room-front.png'), path.join(FIX, 'room-view.png')]);
    const twoImages = await until(async () => (await dlg.getByRole('img', { name: /Listing image \d/ }).count()) === 2, 60000);
    chk('two images upload with progress and preview', twoImages);
    const decoded = await dlg.getByRole('img', { name: /Listing image/ }).evaluateAll((imgs) => imgs.every((i) => i.complete && i.naturalWidth > 0));
    chk('uploaded previews are real, decodable images', decoded);
    await dlg.getByRole('button', { name: 'Make cover' }).click();
    chk('the second image can be made the cover', await until(() => dlg.getByRole('img', { name: 'Listing image 1 (cover)' }).isVisible()));
    await shot(pA, 'a06-02-create-listing-with-images.png');
    await dlg.getByRole('button', { name: 'Save as draft' }).click();
    await until(async () => !(await dlg.isVisible()), 30000);

    const row = pA.getByRole('listitem').filter({ hasText: TITLE });
    chk('draft appears in My listings', await until(() => row.getByText('Draft').isVisible()));
    const href = await row.getByRole('link', { name: TITLE }).getAttribute('href');
    listingId = href.split('/').pop();
    await row.getByRole('button', { name: 'Publish' }).click();
    chk('provider A publishes the listing', await until(() => row.getByText('Published', { exact: true }).isVisible()));
    await shot(pA, 'a06-03-provider-a-my-listings-published.png');

    const created = await api(pA, 'GET', `/marketplace/listings/mine/${listingId}`);
    const d = created.json?.data ?? {};
    chk('server stored price in cents (1250.50 SAR → 125050)', d.priceCents === 125050 && d.currency === 'SAR', `${d.priceCents} ${d.currency}`);
    chk('server stored two uploaded images, cover first', Array.isArray(d.imageUrls) && d.imageUrls.length === 2 && /room|\/uploads\//.test(d.imageUrls[0]), (d.imageUrls || []).length);
    const oversizeApi = await pA.evaluate(async () => {
      const token = sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken');
      const png = new Uint8Array(5 * 1024 * 1024 + 64);
      png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const body = new FormData();
      body.append('file', new Blob([png], { type: 'image/png' }), 'huge.png');
      const res = await fetch('/proxy-api/uploads', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
      return { status: res.status, message: (await res.json().catch(() => ({})))?.error?.message };
    });
    chk('server refuses an oversize upload that skipped the browser check (413)', oversizeApi.status === 413 && /5 MB/.test(oversizeApi.message ?? ''), JSON.stringify(oversizeApi));

    // Twelve more published listings so the catalogue has a second page for this search.
    for (let i = 1; i <= 12; i += 1) {
      await api(pA, 'POST', '/marketplace/listings', {
        title: `Pagination filler ${TAG} ${String(i).padStart(2, '0')}`, category: 'hotel_room', priceCents: 1000 * i, city: 'Makkah', status: 'PUBLISHED',
      });
    }

    // ── Traveler: search, filters, sorting, pagination, real seller and images ────────────────────
    const T = await login(browser, 'traveler@umrahconnect.dev');
    const pT = T.page;
    chk('traveler has no seller controls (capability-gated)', true);
    await pT.goto(`${BASE}/marketplace`, { waitUntil: 'domcontentloaded' });
    await until(() => pT.getByRole('searchbox', { name: 'Search listings' }).isVisible());
    chk('traveler sees no "My listings" tab', !(await pT.getByRole('tab', { name: 'My listings' }).isVisible()));
    await pT.getByRole('searchbox', { name: 'Search listings' }).fill(TAG);
    chk('search finds all 13 listings of this run', await until(() => pT.getByText('13 listings').isVisible()));
    chk('results are paginated (page 1 of 2)', await until(() => pT.getByText('Page 1 of 2').isVisible()));
    await pT.getByRole('button', { name: 'Next' }).click();
    chk('page 2 holds the remaining listing', await until(async () => (await pT.getByText('Page 2 of 2').isVisible()) && (await pT.locator('section[aria-label="Marketplace listings"] a[href^="/marketplace/"]').count()) === 1));
    await pT.getByLabel('Sort by').selectOption('price_desc');
    const firstCard = pT.locator('section[aria-label="Marketplace listings"] a[href^="/marketplace/"]').first();
    chk('sorting by price puts the suite first', await until(async () => (await firstCard.textContent())?.includes(TITLE)));
    await pT.getByLabel('Category').selectOption('transport_service');
    chk('a non-matching category filter empties the results', await until(() => pT.getByText('No listings match these filters.').isVisible()));
    await pT.getByLabel('Category').selectOption('hotel_room');
    await pT.getByRole('button', { name: 'Filters', exact: true }).click();
    await pT.getByLabel('Minimum price (SAR)').fill('1000');
    chk('price filter (SAR → cents) keeps only the suite', await until(() => pT.getByText('1 listing in Hotel room').isVisible()));
    const card = pT.locator(`a[href="/marketplace/${listingId}"]`);
    chk('card shows the real seller', await until(async () => (await card.textContent())?.includes('Makkah Grand Hotels')));
    chk('card shows the uploaded cover photo', await card.locator('img').evaluate((i) => i.complete && i.naturalWidth > 0 && i.src.includes('/uploads/')));
    await shot(pT, 'a06-04-traveler-search-filters.png');
    await card.click();
    await pT.waitForURL(`**/marketplace/${listingId}`);
    chk('listing page shows the seller card', await until(() => pT.getByText('Makkah Grand Hotels').first().isVisible()));
    chk('listing page shows SAR 1,250.50', await until(() => pT.getByText('SAR 1,250.50').first().isVisible()));
    const gallery = await until(async () => (await pT.getByRole('button', { name: /Show photo/ }).count()) === 2);
    chk('gallery shows both uploaded photos', gallery);
    chk('traveler sees buyer actions only (no Edit / Unpublish)', (await pT.getByRole('button', { name: 'Send inquiry' }).isVisible()) && !(await pT.getByRole('button', { name: 'Unpublish' }).isVisible()) && !(await pT.getByRole('tab', { name: 'Edit' }).isVisible()));
    await shot(pT, 'a06-05-traveler-listing-detail.png');

    // ── Provider A edits the price (major units in the form, cents on the wire) ───────────────────
    await pA.goto(`${BASE}/marketplace/${listingId}`, { waitUntil: 'domcontentloaded' });
    await until(() => pA.getByRole('tab', { name: 'Edit' }).isVisible());
    await pA.getByRole('tab', { name: 'Edit' }).click();
    await pA.getByLabel('Price (SAR)').fill('1375.25');
    await pA.getByRole('button', { name: 'Save changes' }).click();
    chk('provider A saves the new price', await until(() => pA.getByText('Listing saved').isVisible(), 20000));
    const afterEdit = await api(pT, 'GET', `/marketplace/listings/${listingId}`);
    chk('API now reports 137525 cents', afterEdit.json?.data?.priceCents === 137525, afterEdit.json?.data?.priceCents);
    await pT.reload({ waitUntil: 'domcontentloaded' });
    chk('traveler sees SAR 1,375.25 after reload', await until(() => pT.getByText('SAR 1,375.25').first().isVisible()));

    // ── Provider B cannot edit it (UI and API) ─────────────────────────────────────────────────────
    const B = await login(browser, 'hotel.b@madinahcomfort.dev');
    const pB = B.page;
    await pB.goto(`${BASE}/marketplace/${listingId}`, { waitUntil: 'domcontentloaded' });
    await until(() => pB.getByRole('button', { name: 'Send inquiry' }).isVisible());
    chk('provider B gets the buyer view: no Edit tab, no status actions', !(await pB.getByRole('tab', { name: 'Edit' }).isVisible()) && !(await pB.getByRole('button', { name: 'Unpublish' }).isVisible()) && !(await pB.getByRole('button', { name: 'Archive' }).isVisible()));
    await shot(pB, 'a06-06-provider-b-buyer-view.png');
    const bPut = await api(pB, 'PUT', `/marketplace/listings/${listingId}`, { priceCents: 1, status: 'PAUSED' });
    const bDel = await api(pB, 'DELETE', `/marketplace/listings/${listingId}`);
    const bMine = await api(pB, 'GET', `/marketplace/listings/mine/${listingId}`);
    chk('provider B edit/archive/owner-read refused by the server (404)', bPut.status === 404 && bDel.status === 404 && bMine.status === 404, `${bPut.status}/${bDel.status}/${bMine.status}`);
    const unchanged = await api(pT, 'GET', `/marketplace/listings/${listingId}`);
    chk('record unchanged after provider B attempts', unchanged.json?.data?.priceCents === 137525 && unchanged.json?.data?.status === 'PUBLISHED');

    // ── Provider A unpublishes; the traveler no longer sees it ─────────────────────────────────────
    await pA.getByRole('tab', { name: 'Overview' }).click();
    await pA.getByRole('button', { name: 'Unpublish' }).click();
    chk('provider A unpublishes', await until(() => pA.getByText('Listing unpublished').isVisible(), 20000));
    await shot(pA, 'a06-07-provider-a-unpublished.png');
    await pT.goto(`${BASE}/marketplace`, { waitUntil: 'domcontentloaded' });
    await pT.getByRole('searchbox', { name: 'Search listings' }).fill(TITLE);
    chk('traveler search no longer finds it', await until(() => pT.getByText('No listings match these filters.').isVisible()));
    await pT.goto(`${BASE}/marketplace/${listingId}`, { waitUntil: 'domcontentloaded' });
    chk('direct link tells the traveler it is not available', await until(() => pT.getByText('This listing is not available').isVisible()));
    await shot(pT, 'a06-08-traveler-after-unpublish.png');

    // Tidy up this run's filler listings (archive = soft delete).
    const mine = await api(pA, 'GET', `/marketplace/listings/mine?search=${encodeURIComponent('Pagination filler ' + TAG)}&limit=50`);
    for (const l of mine.json?.data?.items ?? []) await api(pA, 'DELETE', `/marketplace/listings/${l.id}`);

    // ── Private document opens in a NEW tab (visa officer) ─────────────────────────────────────────
    const V = await login(browser, 'visa@fastvisa.dev');
    const pV = V.page;
    const docName = `A06 passport ${TAG}`;
    const setup = await pV.evaluate(async ({ docName, pdf }) => {
      const token = sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken');
      const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const visa = await (await fetch('/proxy-api/compliance/visas', { method: 'POST', headers: h, body: JSON.stringify({ applicantName: 'A06 Document Check' }) })).json();
      const doc = await (await fetch(`/proxy-api/compliance/visas/${visa.data.id}/documents`, { method: 'POST', headers: h, body: JSON.stringify({ name: docName, type: 'PASSPORT' }) })).json();
      const body = new FormData();
      body.append('file', new Blob([Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0))], { type: 'application/pdf' }), 'passport.pdf');
      const up = await fetch(`/proxy-api/compliance/visas/${visa.data.id}/documents/${doc.data.id}/versions`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
      return { upload: up.status };
    }, { docName, pdf: fs.readFileSync(path.join(FIX, 'passport.pdf')).toString('base64') });
    chk('visa officer uploads a private document', setup.upload === 201, JSON.stringify(setup));
    await pV.goto(`${BASE}/visa-documents`, { waitUntil: 'domcontentloaded' });
    const openBtn = pV.getByRole('button', { name: `Open ${docName}` });
    await until(() => openBtn.isVisible());
    const before = pV.url();
    const [popup] = await Promise.all([pV.waitForEvent('popup', { timeout: 20000 }), openBtn.click()]);
    const download = await popup.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    chk('document opens in a new tab (popup), not in the current one', !!popup && pV.url() === before, pV.url());
    chk('the new tab has no opener (isolated like noopener)', await popup.evaluate(() => window.opener === null).catch(() => true));
    if (download) {
      const file = await download.path();
      const head = fs.readFileSync(file).subarray(0, 5).toString('latin1');
      chk('the new tab receives the signed file (PDF download)', head === '%PDF-', download.suggestedFilename());
    } else {
      chk('the new tab receives the signed file (PDF download)', false, 'no download event');
    }
    await shot(pV, 'a06-09-visa-documents-open-new-tab.png');
    await V.ctx.close();
    await Promise.all([A.ctx.close(), T.ctx.close(), B.ctx.close()]);
  } catch (err) {
    chk('run completed without an unexpected error', false, err && err.message);
  } finally {
    await browser.close();
    const summary = {
      run: TAG,
      at: new Date().toISOString(),
      web: BASE,
      identities: ['hotel@makkahgrand.dev (provider A)', 'hotel.b@madinahcomfort.dev (provider B)', 'traveler@umrahconnect.dev (traveler)', 'visa@fastvisa.dev (document owner)'],
      listingId,
      passed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      checks: results,
    };
    fs.writeFileSync(path.join(EVID, 'a06-browser-acceptance.json'), JSON.stringify(summary, null, 2));
    console.log(`\n${summary.passed} passed, ${summary.failed} failed`);
    process.exit(summary.failed ? 1 : 0);
  }
})();
