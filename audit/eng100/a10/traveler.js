/* A10 — traveler journeys: marketplace, booking + sandbox checkout + cancel, requests/offers,
 * travel plan, social (post/comment/reply/edit/delete/like/save), connections, messages, notifications.
 * Records created here carry the run stamp so they are identifiable as A10's own. */
'use strict';
const L = require('./lib');
const ONLY = process.argv.slice(2);
const R = new L.Recorder(ONLY.length ? `traveler-rerun-${ONLY.join('-')}` : 'traveler');
const WEB = L.WEB;
const since = (id, t, re) => id.net.filter((n) => n.t >= t && (!re || re.test(`${n.method} ${n.path}`)));
const fmt = (arr) => arr.map((n) => `${n.method} ${n.path} ${n.status}`);
const body = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const day = (n) => { const d = new Date(Date.now() + n * 86400000); return d.toISOString().slice(0, 10); };
async function waitReq(id, re, t0, ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { if (since(id, t0, re).length) return true; await L.sleep(150); } return false; }
async function toastText(page) { return page.locator('[data-sonner-toast], [role=status] li, ol[data-sonner-toaster] li').allInnerTexts().then((a) => a.join(' | ').replace(/\s+/g, ' ')).catch(() => ''); }
const STAMP = `a10-${Date.now().toString(36)}`;
const ctx = {};

async function section(name, fn) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const t = Date.now();
  try { await fn(); console.log(`[${name}] ok in ${Math.round((Date.now() - t) / 1000)}s`); }
  catch (e) {
    console.log(`[${name}] EXCEPTION ${e.message.split('\n')[0]}`);
    R.rec({ area: name, route: '-', role: '-', action: `${name}: remaining steps`, expected: 'section completes', actual: `harness stopped: ${e.message.split('\n')[0].slice(0, 220)}`, result: 'UNTESTED', reason: 'harness exception; steps after this point in the section were not executed' });
  }
}

(async () => {
  R.reset();
  const browser = await L.launch();
  const A = await L.openIdentity(browser, 'travelerA');
  const B = await L.openIdentity(browser, 'travelerB');
  const la = await L.login(A); const lb = await L.login(B);
  if (la.outcome !== 'signed-in' || lb.outcome !== 'signed-in') throw new Error('traveler sign-in failed');
  const meA = await L.api(A, 'GET', '/social/accounts/me');
  const meB = await L.api(B, 'GET', '/social/accounts/me');
  ctx.nameA = meA.data?.displayName; ctx.nameB = meB.data?.displayName;
  ctx.userA = A.me.id; ctx.userB = B.me.id;
  console.log(`travelerA=${ctx.nameA} travelerB=${ctx.nameB} stamp=${STAMP}`);

  // ── Marketplace: search, filter, sort, pagination, tabs ──────────────────
  await section('marketplace', async () => {
    const p = A.page;
    await p.goto(`${WEB}/marketplace`); await L.settle(A);
    const countText = async () => (await p.locator('section[aria-label="Marketplace listings"] [aria-live=polite]').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    const cards = async () => p.locator('section[aria-label="Marketplace listings"] a[href^="/marketplace/"]').evaluateAll((as) => as.map((a) => ({ href: a.getAttribute('href'), text: a.innerText.replace(/\s+/g, ' ') })));
    const all = await cards();
    const total = parseInt((await countText()).match(/(\d+) listing/)?.[1] || '0', 10);
    R.check(all.length > 0 && total >= all.length, { area: 'marketplace', route: '/marketplace', role: 'travelerA', action: 'browse listings', expected: 'listing cards and a total count', actual: `${all.length} cards, count="${await countText()}"`, requests: fmt(since(A, 0, /marketplace\/listings\?/)).slice(-2) });
    // Pagination.
    const pager = p.locator('nav[aria-label="Listing pages"]');
    if (await pager.isVisible().catch(() => false)) {
      const t = Date.now();
      await pager.getByRole('button', { name: /Next/ }).click();
      await waitReq(A, /listings\?.*page=2/, t); await L.settle(A);
      const p2 = await cards();
      const pagerText = (await pager.innerText()).replace(/\s+/g, ' ');
      R.check(p2.length > 0 && p2[0].href !== all[0].href && /2/.test(pagerText), { area: 'marketplace', route: '/marketplace', role: 'travelerA', action: 'pagination: Next page', expected: 'page 2 requested and shows different listings', actual: `pager="${pagerText}" first=${p2[0]?.href}`, requests: fmt(since(A, t, /listings\?/)) });
      const t2 = Date.now();
      await pager.getByRole('button', { name: /Previous/ }).click();
      await waitReq(A, /listings\?.*page=1/, t2, 5000); await L.settle(A);
      const p1 = await cards();
      R.check(p1[0]?.href === all[0].href && await pager.getByRole('button', { name: /Previous/ }).isDisabled(), { area: 'marketplace', route: '/marketplace', role: 'travelerA', action: 'pagination: Previous page', expected: 'back to page 1, Previous disabled', actual: `first=${p1[0]?.href}` });
    } else R.rec({ area: 'marketplace', route: '/marketplace', role: 'travelerA', action: 'pagination', expected: 'pager when more than one page', actual: `total=${total} (single page)`, result: 'UNTESTED', reason: 'fewer listings than one page' });
    // Search.
    let t = Date.now();
    await p.getByLabel('Search listings').fill('Makkah');
    await waitReq(A, /listings\?.*(search|q)=Makkah/i, t); await L.settle(A);
    const sr = await cards();
    R.check(sr.length > 0 && sr.length <= Math.max(all.length, 12) && since(A, t, /listings\?.*(search|q)=Makkah/i).length >= 1, { area: 'marketplace', route: '/marketplace', role: 'travelerA', action: 'search "Makkah"', expected: 'request carries the term; matching listings shown', actual: `${sr.length} cards, count="${await countText()}"`, requests: fmt(since(A, t, /listings\?/)).slice(-2) });
    R.check(since(A, t, /listings\?/).length <= 3, { area: 'marketplace', route: '/marketplace', role: 'travelerA', kind: 'loop', action: 'search input is debounced', expected: '≤3 list requests while typing one word', actual: `${since(A, t, /listings\?/).length} requests` });
    t = Date.now();
    await p.getByLabel('Search listings').fill(`zzqx${STAMP}`);
    await waitReq(A, /listings\?/, t); await L.settle(A);
    const none = await cards();
    const bt = await body(p);
    R.check(none.length === 0 && /0 listings/.test(await countText()), { area: 'marketplace', route: '/marketplace', role: 'travelerA', kind: 'empty', action: 'search with no matches', expected: '"0 listings" and an empty state', actual: `cards=${none.length} count="${await countText()}" emptyText=${/No listings|Nothing|no results|match/i.test(bt)}`, screenshot: await L.shot(p, 'traveler-marketplace-empty-search') });
    const clear = p.getByRole('button', { name: 'Clear filters' });
    if (await clear.isVisible().catch(() => false)) { await clear.click(); await L.settle(A); }
    R.check((await p.getByLabel('Search listings').inputValue()) === '' && (await cards()).length > 0, { area: 'marketplace', route: '/marketplace', role: 'travelerA', action: 'Clear filters', expected: 'search cleared, listings back', actual: `search="${await p.getByLabel('Search listings').inputValue()}" cards=${(await cards()).length}` });
    // Category filter.
    const cats = await p.getByLabel('Category').locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    const cat = cats.find((c) => /HOTEL/i.test(c)) || cats[0];
    t = Date.now();
    await p.getByLabel('Category').selectOption(cat);
    await waitReq(A, new RegExp(`listings\\?.*category=${cat}`, 'i'), t); await L.settle(A);
    const cr = await cards();
    const badge = cat.split('_')[0].toUpperCase();
    const wrongCat = cr.filter((c) => !c.text.toUpperCase().startsWith(badge));
    R.check(cr.length > 0 && wrongCat.length === 0, { area: 'marketplace', route: '/marketplace', role: 'travelerA', action: `filter category=${cat}`, expected: `only ${cat} listings`, actual: `${cr.length} cards, ${wrongCat.length} of another category`, requests: fmt(since(A, t, /listings\?/)).slice(-1) });
    // Sort by price.
    const sorts = await p.getByLabel('Sort by').locator('option').evaluateAll((os) => os.map((o) => o.value));
    const asc = sorts.find((s) => /price.*(asc|low)/i.test(s));
    if (asc) {
      t = Date.now();
      await p.getByLabel('Sort by').selectOption(asc);
      await waitReq(A, /listings\?.*sort=/, t); await L.settle(A);
      const prices = (await cards()).map((c) => parseFloat((c.text.match(/SAR\s*([\d,]+(?:\.\d+)?)/) || [])[1]?.replace(/,/g, '') || 'NaN')).filter((n) => !Number.isNaN(n));
      const sorted = prices.every((v, i) => i === 0 || prices[i - 1] <= v);
      R.check(prices.length > 1 && sorted, { area: 'marketplace', route: '/marketplace', role: 'travelerA', action: `sort ${asc}`, expected: 'prices ascending', actual: prices.slice(0, 8).join(' ≤ '), requests: fmt(since(A, t, /listings\?/)).slice(-1) });
    } else R.rec({ area: 'marketplace', route: '/marketplace', role: 'travelerA', action: 'sort by price', expected: 'price sort option', actual: `options=${sorts.join(',')}`, result: 'UNTESTED', reason: 'no ascending price sort option' });
    // Invalid price range.
    await p.locator('section[aria-label="Marketplace listings"]').getByRole('button', { name: 'Filters', exact: true }).click();
    await p.getByLabel('Minimum price (SAR)').fill('900');
    t = Date.now();
    await p.getByLabel('Maximum price (SAR)').fill('100');
    await L.sleep(1200);
    const alertTxt = await p.locator('section[aria-label="Marketplace listings"] [role=alert]').allInnerTexts();
    const sentBad = since(A, t, /minPriceCents=90000.*maxPriceCents=10000|maxPriceCents=10000.*minPriceCents=90000/);
    R.check(alertTxt.length > 0 && sentBad.length === 0, { area: 'marketplace', route: '/marketplace', role: 'travelerA', kind: 'invalid', action: 'price filter min 900 > max 100', expected: 'inline error; the invalid range is not sent', actual: `alert=${JSON.stringify(alertTxt)} badRequests=${sentBad.length}`, screenshot: await L.shot(p, 'traveler-marketplace-bad-price') });
    // Sellers tab + persistence of the tab after reload.
    await p.goto(`${WEB}/marketplace`); await L.settle(A);
    await p.getByRole('tab', { name: /Sellers/ }).click(); await L.settle(A);
    const sellers = await p.locator('ul[aria-label="Sellers"] li').count();
    const url1 = p.url();
    await p.reload(); await L.settle(A);
    const selected = await p.getByRole('tab', { name: /Sellers/ }).getAttribute('aria-selected');
    R.check(sellers > 0 && /tab=sellers/.test(url1) && selected === 'true', { area: 'marketplace', route: '/marketplace', role: 'travelerA', kind: 'persist', action: 'Sellers tab, then refresh', expected: 'sellers listed; ?tab=sellers survives refresh', actual: `sellers=${sellers} url=${url1.replace(WEB, '')} selectedAfterReload=${selected}` });
  });

  // ── Listing detail: booking + inquiry ────────────────────────────────────
  await section('booking', async () => {
    const p = A.page;
    const lst = await L.api(A, 'GET', '/marketplace/listings?limit=50');
    const listings = L.firstArray(lst.data).sort((a, b) => (/hotel/i.test(String(b.category)) ? 1 : 0) - (/hotel/i.test(String(a.category)) ? 1 : 0));
    let listing = null;
    for (const l of listings) {
      await p.goto(`${WEB}/marketplace/${l.id}`); await L.settle(A);
      if (await p.getByRole('button', { name: 'Request booking' }).isVisible().catch(() => false)) { listing = l; break; }
    }
    if (!listing) throw new Error(`no directly bookable listing among ${listings.length}`);
    ctx.listing = { id: listing.id, name: listing.name };
    R.check(true, { area: 'marketplace', route: '/marketplace/[id]', role: 'travelerA', action: 'open a listing detail', expected: 'detail with booking and inquiry actions', actual: `${listing.name}: Request booking + Send inquiry visible; Request a quote visible=${await p.getByRole('button', { name: 'Request a quote' }).isVisible().catch(() => false)}` });
    await p.getByRole('button', { name: 'Request booking' }).click();
    const dlg = p.getByRole('dialog');
    await dlg.waitFor();
    const submit = dlg.getByRole('button', { name: /Request booking/ });
    const alertOf = async () => (await dlg.locator('[role=alert]').allInnerTexts()).join(' ');
    const t0 = Date.now();
    await dlg.getByLabel('Customer name').fill('');
    await submit.click(); await L.sleep(300);
    const e1 = await alertOf();
    await dlg.getByLabel('Customer name').fill(`A10 Traveler ${STAMP}`);
    await submit.click(); await L.sleep(300);
    const e2 = await alertOf();
    const dates = dlg.locator('input[type=date]');
    await dates.nth(0).fill(day(40)); await dates.nth(1).fill(day(38));
    await submit.click(); await L.sleep(300);
    const e3 = await alertOf();
    await dates.nth(1).fill(day(43));
    const party = dlg.locator('label:has-text("Party size") input');
    await party.fill('0');
    await submit.click(); await L.sleep(300);
    const e4 = await alertOf();
    const sentInvalid = since(A, t0, /POST \/api\/marketplace\/listings\/.*\/bookings/);
    R.check(/name the booking is for/.test(e1) && /start date/.test(e2) && /end date cannot be before/.test(e3) && /at least 1/.test(e4) && sentInvalid.length === 0, { area: 'marketplace', route: '/marketplace/[id]', role: 'travelerA', kind: 'invalid', action: 'Request booking: missing name, missing start date, end before start, party 0', expected: 'four inline errors, no request', actual: `[${e1}] [${e2}] [${e3}] [${e4}] requests=${sentInvalid.length}`, screenshot: await L.shot(p, 'traveler-booking-invalid') });
    await party.fill('2');
    await dlg.getByLabel('Notes').fill(`A10 QA booking ${STAMP} #1`);
    const t1 = Date.now();
    await submit.dblclick();
    await waitReq(A, /POST \/api\/marketplace\/listings\/.*\/bookings/, t1); await L.settle(A);
    const posts = since(A, t1, /POST \/api\/marketplace\/listings\/.*\/bookings/);
    const tt = await toastText(p);
    R.check(posts.length === 1 && posts[0].status < 300, { area: 'marketplace', route: '/marketplace/[id]', role: 'travelerA', kind: 'double-submit', action: 'double-click Request booking', expected: 'exactly one POST, 2xx', actual: fmt(posts).join(', '), requests: fmt(posts) });
    R.check(posts.some((x) => x.status < 300) && !(await dlg.isVisible().catch(() => false)), { area: 'marketplace', route: '/marketplace/[id]', role: 'travelerA', action: 'request a booking (2 pax, 3 nights)', expected: 'booking created; dialog closes; confirmation toast', actual: `${fmt(posts).join(',')} toast="${tt.slice(0, 80)}"`, requests: fmt(posts), screenshot: await L.shot(p, 'traveler-booking-requested') });
    const mine = L.firstArray((await L.api(A, 'GET', '/marketplace/bookings/mine')).data);
    const b1 = mine.find((b) => (b.notes || '').includes(`${STAMP} #1`));
    ctx.booking1 = b1 && { id: b1.id, status: b1.status, paymentStatus: b1.paymentStatus, total: b1.totalAmountCents ?? b1.totalCents };
    R.check(!!b1 && b1.status === 'PENDING' && b1.paymentStatus === 'UNPAID', { area: 'marketplace', route: '/my-bookings', role: 'travelerA', kind: 'persist', action: 'booking readback', expected: 'one booking with our notes, PENDING/UNPAID', actual: b1 ? `${b1.status}/${b1.paymentStatus} total=${b1.totalAmountCents ?? b1.totalCents}` : 'not found', readback: 'GET /api/marketplace/bookings/mine' });
    // Inquiry.
    await p.getByRole('button', { name: 'Send inquiry' }).click();
    const d2 = p.getByRole('dialog'); await d2.waitFor();
    const send = d2.getByRole('button', { name: /Send|inquiry/i }).last();
    await d2.getByLabel('Message').fill('');
    const t2 = Date.now();
    await send.click(); await L.sleep(500);
    const inqErr = (await d2.locator('[role=alert]').allInnerTexts()).join(' ');
    const inqEmpty = since(A, t2, /inquiries/);
    R.check(inqEmpty.length === 0 && inqErr.length > 0, { area: 'marketplace', route: '/marketplace/[id]', role: 'travelerA', kind: 'invalid', action: 'Send inquiry with an empty message', expected: 'inline error, no request', actual: `error="${inqErr}" requests=${inqEmpty.length}` });
    await d2.getByLabel('Message').fill(`A10 QA inquiry ${STAMP}: is the room available for 2 people?`);
    const t3 = Date.now();
    await send.click();
    await waitReq(A, /POST \/api\/marketplace\/listings\/.*\/inquiries/, t3); await L.settle(A);
    const inq = since(A, t3, /inquiries/);
    R.check(inq.some((x) => x.status < 300), { area: 'marketplace', route: '/marketplace/[id]', role: 'travelerA', action: 'Send inquiry', expected: 'POST 2xx and "Inquiry sent to the seller"', actual: `${fmt(inq).join(',')} toast="${(await toastText(p)).slice(0, 60)}"`, requests: fmt(inq) });
  });

  // ── My bookings: sandbox checkout (decline, then pay), cancel, isolation ──
  await section('checkout', async () => {
    if (!ctx.booking1) throw new Error('no booking from the booking section');
    const p = A.page;
    await p.goto(`${WEB}/my-bookings`); await L.settle(A);
    const card = async (marker) => {
      const lis = p.locator('main li');
      const n = await lis.count();
      for (let i = 0; i < n; i++) {
        const li = lis.nth(i);
        const det = li.getByRole('button', { name: 'Details' });
        if (await det.isVisible().catch(() => false)) { await det.click(); await L.sleep(150); }
        if ((await li.innerText()).includes(marker)) return li;
        const hide = li.getByRole('button', { name: 'Hide details' });
        if (await hide.isVisible().catch(() => false)) await hide.click();
      }
      return null;
    };
    const li = await card(`${STAMP} #1`);
    R.check(!!li, { area: 'marketplace', route: '/my-bookings', role: 'travelerA', kind: 'persist', action: 'new booking is listed in My bookings (Details shows notes)', expected: 'card found', actual: li ? 'found' : 'not found' });
    if (!li) throw new Error('booking card not found');
    await li.getByRole('button', { name: /Pay booking|Pay the balance/ }).click();
    const dlg = p.getByRole('dialog'); await dlg.waitFor();
    await L.settle(A);
    const sandbox = await dlg.getByText('Development sandbox').isVisible().catch(() => false);
    R.check(sandbox, { area: 'payments', route: '/my-bookings', role: 'travelerA', action: 'open checkout for the booking', expected: 'development sandbox path offered (PAYMENT_PROVIDER=sandbox)', actual: `sandbox=${sandbox} text="${(await dlg.innerText()).replace(/\s+/g, ' ').slice(0, 200)}"`, requests: fmt(since(A, Date.now() - 8000, /payments/)), screenshot: await L.shot(p, 'traveler-checkout-sandbox') });
    // Decline first.
    let t = Date.now();
    await dlg.getByRole('button', { name: 'Simulate a declined card' }).click();
    await waitReq(A, /sandbox-complete/, t); await L.settle(A);
    const declinedTxt = (await dlg.innerText().catch(() => '')).replace(/\s+/g, ' ');
    const dreq = since(A, t, /payments/);
    R.check(/declin|not go through|failed|unsuccessful/i.test(declinedTxt), { area: 'payments', route: '/my-bookings', role: 'travelerA', kind: 'error', action: 'sandbox: simulate a declined card', expected: 'declined outcome shown; booking stays unpaid; retry offered', actual: `${declinedTxt.slice(0, 220)}`, requests: fmt(dreq), screenshot: await L.shot(p, 'traveler-checkout-declined') });
    const afterDecline = L.firstArray((await L.api(A, 'GET', '/marketplace/bookings/mine')).data).find((b) => b.id === ctx.booking1.id);
    R.check(afterDecline?.paymentStatus === 'UNPAID', { area: 'payments', route: '/my-bookings', role: 'travelerA', kind: 'persist', action: 'booking after a declined payment', expected: 'paymentStatus UNPAID', actual: String(afterDecline?.paymentStatus), readback: 'GET /api/marketplace/bookings/mine' });
    // Retry → pay (double-click the pay button).
    const retry = dlg.getByRole('button', { name: /Try again|Start over|Pay again|Retry/ }).first();
    if (await retry.isVisible().catch(() => false)) { await retry.click(); await L.settle(A); }
    const payBtn = dlg.getByRole('button', { name: /Complete test payment/ });
    await payBtn.waitFor({ timeout: 15000 });
    t = Date.now();
    await payBtn.dblclick();
    await waitReq(A, /sandbox-complete/, t); await L.settle(A);
    const done = (await dlg.innerText().catch(() => '')).replace(/\s+/g, ' ');
    const creq = since(A, t, /sandbox-complete/);
    R.check(creq.length === 1, { area: 'payments', route: '/my-bookings', role: 'travelerA', kind: 'double-submit', action: 'double-click "Complete test payment"', expected: 'one sandbox-complete request', actual: fmt(creq).join(', '), requests: fmt(creq) });
    R.check(creq.some((x) => x.status < 300) && /paid|success|received|complete/i.test(done), { area: 'payments', route: '/my-bookings', role: 'travelerA', action: 'sandbox: complete the test payment (after a decline)', expected: 'payment succeeds and the dialog says so', actual: `${done.slice(0, 200)}`, requests: fmt(since(A, t, /payments/)), screenshot: await L.shot(p, 'traveler-checkout-paid') });
    await p.keyboard.press('Escape'); await L.sleep(300);
    await p.reload(); await L.settle(A);
    const li2 = await card(`${STAMP} #1`);
    const payStatus = li2 ? await li2.locator('[data-testid=booking-payment-status]').innerText().catch(() => '') : '';
    const rb = L.firstArray((await L.api(A, 'GET', '/marketplace/bookings/mine')).data).find((b) => b.id === ctx.booking1.id);
    R.check(/paid/i.test(payStatus) && !/unpaid/i.test(payStatus) && rb?.paymentStatus === 'PAID', { area: 'payments', route: '/my-bookings', role: 'travelerA', kind: 'persist', action: 'paid status after refresh', expected: 'card shows Paid; API paymentStatus PAID', actual: `card="${payStatus}" api=${rb?.paymentStatus}/${rb?.status}`, readback: 'GET /api/marketplace/bookings/mine' });
    R.check(li2 && !(await li2.getByRole('button', { name: 'Cancel booking' }).isVisible().catch(() => false)) && !(await li2.getByRole('button', { name: /Pay booking/ }).isVisible().catch(() => false)), { area: 'marketplace', route: '/my-bookings', role: 'travelerA', kind: 'invalid', action: 'paid booking offers neither Pay nor Cancel', expected: 'no Pay booking / Cancel booking', actual: li2 ? (await li2.innerText()).replace(/\s+/g, ' ').slice(0, 160) : 'card missing' });
    ctx.paymentReqs = fmt(since(A, 0, /\/api\/payments\/checkout/)).slice(-4);

    // Second booking → cancel (Keep first, then confirm).
    await p.goto(`${WEB}/marketplace/${ctx.listing.id}`); await L.settle(A);
    await p.getByRole('button', { name: 'Request booking' }).click();
    const d2 = p.getByRole('dialog'); await d2.waitFor();
    const ds = d2.locator('input[type=date]');
    await ds.nth(0).fill(day(60)); await ds.nth(1).fill(day(62));
    await d2.getByLabel('Notes').fill(`A10 QA booking ${STAMP} #2`);
    t = Date.now();
    await d2.getByRole('button', { name: /Request booking/ }).click();
    await waitReq(A, /POST \/api\/marketplace\/listings\/.*\/bookings/, t); await L.settle(A);
    await p.goto(`${WEB}/my-bookings`); await L.settle(A);
    const li3 = await card(`${STAMP} #2`);
    if (!li3) throw new Error('second booking not listed');
    await li3.getByRole('button', { name: 'Cancel booking' }).click();
    const cd = p.getByRole('dialog'); await cd.waitFor();
    await cd.getByRole('button', { name: 'Keep booking' }).click(); await L.sleep(400);
    const stillThere = (await li3.innerText()).match(/PENDING|Pending/);
    R.check(!(await cd.isVisible().catch(() => false)) && !!stillThere, { area: 'marketplace', route: '/my-bookings', role: 'travelerA', action: 'Cancel booking → Keep booking', expected: 'dialog closes, booking unchanged', actual: `dialogOpen=${await cd.isVisible().catch(() => false)} status=${stillThere?.[0]}` });
    await li3.getByRole('button', { name: 'Cancel booking' }).click();
    await cd.waitFor();
    t = Date.now();
    await cd.getByRole('button', { name: /Cancel booking|Yes/ }).last().dblclick();
    await waitReq(A, /bookings\/.*\/cancel/, t); await L.settle(A);
    const cq = since(A, t, /bookings\/.*\/cancel/);
    const mine2 = L.firstArray((await L.api(A, 'GET', '/marketplace/bookings/mine')).data);
    const b2 = mine2.find((b) => (b.notes || '').includes(`${STAMP} #2`));
    ctx.booking2 = b2?.id;
    R.check(cq.some((x) => x.status < 300) && b2?.status === 'CANCELLED', { area: 'marketplace', route: '/my-bookings', role: 'travelerA', action: 'cancel an unpaid booking', expected: 'POST cancel 2xx; status CANCELLED', actual: `${fmt(cq).join(',')} api=${b2?.status}`, requests: fmt(cq), readback: 'GET /api/marketplace/bookings/mine' });
    R.check(cq.length === 1 || cq.slice(1).every((x) => x.status >= 400 && x.status < 500), { area: 'marketplace', route: '/my-bookings', role: 'travelerA', kind: 'double-submit', action: 'double-click confirm cancel', expected: 'one cancel (or a harmless 4xx for the second)', actual: fmt(cq).join(', ') });
    await p.reload(); await L.settle(A);
    const li4 = await card(`${STAMP} #2`);
    R.check(li4 && /cancel/i.test(await li4.innerText()), { area: 'marketplace', route: '/my-bookings', role: 'travelerA', kind: 'persist', action: 'cancelled status after refresh', expected: 'card shows Cancelled', actual: li4 ? (await li4.innerText()).replace(/\s+/g, ' ').slice(0, 120) : 'missing' });
    // Isolation: travelerB.
    await B.page.goto(`${WEB}/my-bookings`); await L.settle(B);
    const bText = await body(B.page);
    R.check(!bText.includes(STAMP), { area: 'marketplace', route: '/my-bookings', role: 'travelerB', kind: 'tenant', action: "travelerB's My bookings does not show travelerA's bookings", expected: 'no A10 booking marker', actual: bText.includes(STAMP) ? 'travelerA booking visible' : 'not visible' });
    const bc = await L.apiProbe(B, 'POST', `/marketplace/bookings/${ctx.booking1.id}/cancel`, {});
    R.check([403, 404].includes(bc.status), { area: 'api-refusal', route: '/my-bookings', role: 'travelerB', kind: 'tenant', action: "API cancel travelerA's booking as travelerB", expected: '403/404', actual: `${bc.status} ${bc.code || ''} ${bc.message || ''}`, requests: [`POST /api/marketplace/bookings/:idA/cancel ${bc.status}`] });
    const bp = await L.apiProbe(B, 'POST', '/payments/checkout', { listingBookingId: ctx.booking2 || ctx.booking1.id });
    R.check([400, 403, 404, 409].includes(bp.status), { area: 'api-refusal', route: '/my-bookings', role: 'travelerB', kind: 'tenant', action: "API start checkout for travelerA's booking as travelerB", expected: '403/404 (not the payer)', actual: `${bp.status} ${bp.code || ''} ${bp.message || ''}`, requests: [`POST /api/payments/checkout ${bp.status}`] });
  });

  // ── Requests & offers ─────────────────────────────────────────────────────
  await section('requests', async () => {
    const p = A.page;
    await p.goto(`${WEB}/requests`); await L.settle(A);
    await p.getByRole('button', { name: 'New request' }).click();
    const dlg = p.getByRole('dialog'); await dlg.waitFor();
    const post = dlg.getByRole('button', { name: 'Post request' });
    const errOf = async () => (await dlg.locator('[role=alert]').allInnerTexts()).join(' ');
    const inp = (label) => dlg.locator(`label:has-text("${label}") input, label:has-text("${label}") textarea`).first();
    const t0 = Date.now();
    await post.click(); await L.sleep(300); const e1 = await errOf();
    await inp('Title').fill(`A10 QA hotel request ${STAMP}`);
    await inp('Travelers').fill('0'); await post.click(); await L.sleep(300); const e2 = await errOf();
    await inp('Travelers').fill('3');
    await inp('Budget min').fill('6000'); await inp('Budget max').fill('3000'); await post.click(); await L.sleep(300); const e3 = await errOf();
    await inp('Budget min').fill('3000'); await inp('Budget max').fill('6000');
    await inp('From').fill(day(50)); await inp('To').fill(day(45)); await post.click(); await L.sleep(300); const e4 = await errOf();
    const inv = since(A, t0, /POST \/api\/marketplace\/requests/);
    R.check(/title/.test(e1) && /between 1 and 500/.test(e2) && /minimum budget is higher/.test(e3) && /end date cannot be before/.test(e4) && inv.length === 0, { area: 'requests', route: '/requests', role: 'travelerA', kind: 'invalid', action: 'New request: no title, 0 travelers, min>max budget, reversed dates', expected: 'four inline errors, no request', actual: `[${e1}] [${e2}] [${e3}] [${e4}] requests=${inv.length}`, screenshot: await L.shot(p, 'traveler-request-invalid') });
    await inp('To').fill(day(54));
    await inp('City').fill('Makkah');
    await dlg.locator('label:has-text("Description") textarea').fill(`A10 QA: family of 3 near the Haram. ${STAMP}`);
    const hotelBtn = dlg.locator('fieldset button', { hasText: /Hotel/i }).first();
    if (await hotelBtn.isVisible().catch(() => false)) await hotelBtn.click();
    const t1 = Date.now();
    await post.dblclick();
    await waitReq(A, /POST \/api\/marketplace\/requests/, t1); await L.settle(A);
    const cr = since(A, t1, /POST \/api\/marketplace\/requests$/);
    R.check(cr.length === 1 && cr[0].status < 300, { area: 'requests', route: '/requests', role: 'travelerA', kind: 'double-submit', action: 'double-click Post request', expected: 'exactly one POST 2xx', actual: fmt(cr).join(', '), requests: fmt(cr) });
    const mine = L.firstArray((await L.api(A, 'GET', '/marketplace/requests/mine')).data);
    const req = mine.find((r) => (r.title || '').includes(STAMP));
    ctx.request = req && { id: req.id, title: req.title };
    R.check(!!req && (await body(p)).includes(STAMP), { area: 'requests', route: '/requests', role: 'travelerA', action: 'post a hotel request', expected: 'request listed under My requests', actual: req ? `${req.status} ${req.serviceType}` : 'not found', readback: 'GET /api/marketplace/requests/mine', screenshot: await L.shot(p, 'traveler-request-posted') });
    if (!req) throw new Error('request not created');
    await p.reload(); await L.settle(A);
    R.check((await body(p)).includes(STAMP), { area: 'requests', route: '/requests', role: 'travelerA', kind: 'persist', action: 'request still listed after refresh', expected: 'listed', actual: (await body(p)).includes(STAMP) ? 'listed' : 'missing' });
    // Isolation: travelerB cannot open it.
    await B.page.goto(`${WEB}/requests/${req.id}`); await L.settle(B);
    const bt = await body(B.page);
    const bapi = await L.apiProbe(B, 'GET', `/marketplace/requests/${req.id}`);
    R.check(!bt.includes(STAMP) && [403, 404].includes(bapi.status), { area: 'requests', route: '/requests/[id]', role: 'travelerB', kind: 'tenant', action: "travelerB opens travelerA's request", expected: 'not shown; API 403/404', actual: `visible=${bt.includes(STAMP)} api=${bapi.status}`, requests: [`GET /api/marketplace/requests/:id ${bapi.status}`], screenshot: await L.shot(B.page, 'traveler-b-request-of-a') });
  });

  // Providers send offers (hotelA and operatorAdminA), traveler declines one and accepts the other.
  await section('offers', async () => {
    if (!ctx.request) throw new Error('no request');
    const offers = [];
    for (const [key, price] of [['hotelA', '4500'], ['operatorAdminA', '4200']]) {
      const P = await L.openIdentity(browser, key);
      const lr = await L.login(P);
      if (lr.outcome !== 'signed-in') throw new Error(`${key} sign-in failed`);
      const pp = P.page;
      await pp.goto(`${WEB}/requests`); await L.settle(P);
      const openTab = pp.getByRole('tab', { name: 'Open requests' });
      const hasTab = await openTab.isVisible().catch(() => false);
      if (hasTab) { await openTab.click(); await L.settle(P); }
      const listed = (await body(pp)).includes(STAMP);
      R.check(hasTab && listed, { area: 'requests', route: '/requests', role: key, action: 'provider sees the open request', expected: '"Open requests" tab lists it', actual: `tab=${hasTab} listed=${listed}` });
      await pp.goto(`${WEB}/requests/${ctx.request.id}`); await L.settle(P);
      await pp.getByRole('button', { name: 'Send an offer' }).click();
      const d = pp.getByRole('dialog'); await d.waitFor();
      const sendBtn = d.getByRole('button', { name: /Send offer|Send/ }).last();
      const t0 = Date.now();
      await sendBtn.click(); await L.sleep(300);
      const e1 = (await d.locator('[role=alert]').allInnerTexts()).join(' ');
      await d.locator('label:has-text("Title") input').first().fill(`A10 offer from ${key} ${STAMP}`);
      const priceIn = d.locator('label:has-text("Price") input, label:has-text("price") input').first();
      await priceIn.fill('0'); await sendBtn.click(); await L.sleep(300);
      const e2 = (await d.locator('[role=alert]').allInnerTexts()).join(' ');
      R.check(/title/i.test(e1) && /greater than zero/i.test(e2) && since(P, t0, /offers/).length === 0, { area: 'requests', route: '/requests/[id]', role: key, kind: 'invalid', action: 'Send an offer with no title, then price 0', expected: 'inline errors, no request', actual: `[${e1}] [${e2}]` });
      await priceIn.fill(price);
      await d.getByLabel('Description').fill('A10 QA offer: breakfast included');
      const t1 = Date.now();
      await sendBtn.click();
      await waitReq(P, /POST \/api\/marketplace\/requests\/.*\/offers/, t1); await L.settle(P);
      const oq = since(P, t1, /\/offers/);
      R.check(oq.some((x) => x.status < 300), { area: 'requests', route: '/requests/[id]', role: key, action: `send an offer (SAR ${price})`, expected: 'POST offers 2xx; "Offer sent"', actual: `${fmt(oq).join(',')} toast="${(await toastText(pp)).slice(0, 60)}"`, requests: fmt(oq), screenshot: await L.shot(pp, `offer-sent-${key}`) });
      offers.push(key);
      P.keep = true; ctx[`prov_${key}`] = P;
    }
    // Traveler sees both offers.
    const p = A.page;
    await p.goto(`${WEB}/my-offers`); await L.settle(A);
    const mo = await body(p);
    R.check(mo.includes(`A10 offer from hotelA ${STAMP}`) && mo.includes(`A10 offer from operatorAdminA ${STAMP}`), { area: 'requests', route: '/my-offers', role: 'travelerA', action: 'My offers lists offers received', expected: 'both offers', actual: `hotelA=${mo.includes(`A10 offer from hotelA ${STAMP}`)} operatorA=${mo.includes(`A10 offer from operatorAdminA ${STAMP}`)}` });
    await p.goto(`${WEB}/requests/${ctx.request.id}`); await L.settle(A);
    const offerLi = (who) => p.locator('li', { hasText: `A10 offer from ${who} ${STAMP}` }).first();
    let t = Date.now();
    await offerLi('operatorAdminA').getByRole('button', { name: 'Decline' }).click();
    await waitReq(A, /offers\/.*\/reject/, t); await L.settle(A);
    const rj = since(A, t, /reject/);
    R.check(rj.some((x) => x.status < 300), { area: 'requests', route: '/requests/[id]', role: 'travelerA', action: 'Decline an offer', expected: 'POST reject 2xx; offer shows declined', actual: `${fmt(rj).join(',')} li="${(await offerLi('operatorAdminA').innerText()).replace(/\s+/g, ' ').slice(0, 120)}"`, requests: fmt(rj) });
    t = Date.now();
    await offerLi('hotelA').getByRole('button', { name: 'Accept' }).dblclick();
    await waitReq(A, /offers\/.*\/accept/, t); await L.settle(A);
    const ac = since(A, t, /accept/);
    R.check(ac.some((x) => x.status < 300), { area: 'requests', route: '/requests/[id]', role: 'travelerA', action: 'Accept an offer', expected: 'POST accept 2xx; Convert to booking offered', actual: `${fmt(ac).join(',')} convert=${await p.getByRole('button', { name: 'Convert to booking' }).isVisible().catch(() => false)}`, requests: fmt(ac), screenshot: await L.shot(p, 'traveler-offer-accepted') });
    R.check(ac.filter((x) => x.status < 300).length === 1, { area: 'requests', route: '/requests/[id]', role: 'travelerA', kind: 'double-submit', action: 'double-click Accept', expected: 'one successful accept', actual: fmt(ac).join(', ') });
    await p.reload(); await L.settle(A);
    const persisted = (await offerLi('hotelA').innerText().catch(() => '')).replace(/\s+/g, ' ');
    R.check(/accepted/i.test(persisted), { area: 'requests', route: '/requests/[id]', role: 'travelerA', kind: 'persist', action: 'accepted offer after refresh', expected: 'ACCEPTED', actual: persisted.slice(0, 140) });
    // Convert to booking.
    const conv = p.getByRole('button', { name: 'Convert to booking' });
    if (await conv.isVisible().catch(() => false)) {
      await conv.click();
      const d = p.getByRole('dialog'); await d.waitFor();
      const sel = d.locator('select');
      if (await sel.count()) { const opts = await sel.first().locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean)); if (opts.length) await sel.first().selectOption(opts[0]); }
      await d.getByLabel('Notes').fill(`A10 converted ${STAMP}`);
      t = Date.now();
      await d.getByRole('button', { name: 'Create booking' }).click();
      await waitReq(A, /convert-to-booking/, t); await L.settle(A);
      const cv = since(A, t, /convert-to-booking/);
      const convErr = (await d.locator('[role=alert]').allInnerTexts().catch(() => [])).join(' ');
      R.check(cv.some((x) => x.status < 300), { area: 'requests', route: '/requests/[id]', role: 'travelerA', action: 'Convert the accepted offer to a booking', expected: 'POST convert-to-booking 2xx; booking created', actual: `${fmt(cv).join(',')} ${convErr}`, requests: fmt(cv), screenshot: await L.shot(p, 'traveler-offer-converted') });
    } else R.rec({ area: 'requests', route: '/requests/[id]', role: 'travelerA', action: 'Convert the accepted offer to a booking', expected: 'Convert to booking button', actual: 'not offered', result: 'FAIL' });
    // Close another request: Keep it open, then Close.
    await p.goto(`${WEB}/requests`); await L.settle(A);
    await p.getByRole('button', { name: 'New request' }).click();
    const nd = p.getByRole('dialog'); await nd.waitFor();
    await nd.locator('label:has-text("Title") input').first().fill(`A10 QA request to close ${STAMP}`);
    t = Date.now();
    await nd.getByRole('button', { name: 'Post request' }).click();
    await waitReq(A, /POST \/api\/marketplace\/requests/, t); await L.settle(A);
    const r2 = L.firstArray((await L.api(A, 'GET', '/marketplace/requests/mine')).data).find((r) => (r.title || '').includes(`to close ${STAMP}`));
    if (!r2) throw new Error('second request not created');
    await p.goto(`${WEB}/requests/${r2.id}`); await L.settle(A);
    await p.getByRole('button', { name: 'Close request' }).click();
    const cd = p.getByRole('dialog'); await cd.waitFor();
    await cd.getByRole('button', { name: 'Keep it open' }).click(); await L.sleep(300);
    const st1 = L.firstArray((await L.api(A, 'GET', '/marketplace/requests/mine')).data).find((r) => r.id === r2.id)?.status;
    await p.getByRole('button', { name: 'Close request' }).click(); await cd.waitFor();
    t = Date.now();
    await cd.getByRole('button', { name: /Close request|Close/ }).last().click();
    await waitReq(A, /requests\/.*\/close/, t); await L.settle(A);
    const st2 = L.firstArray((await L.api(A, 'GET', '/marketplace/requests/mine')).data).find((r) => r.id === r2.id)?.status;
    R.check(st1 === 'OPEN' && /CLOSED|CANCELLED/.test(String(st2)) && !(await p.getByRole('button', { name: 'Close request' }).isVisible().catch(() => false)), { area: 'requests', route: '/requests/[id]', role: 'travelerA', action: 'Close request (Keep it open first, then Close)', expected: 'OPEN after "Keep it open"; CLOSED after confirming', actual: `after keep=${st1} after close=${st2}`, requests: fmt(since(A, t, /close/)) });
    // A provider cannot offer on a closed request.
    const P = ctx.prov_hotelA;
    const po = await L.apiProbe(P, 'POST', `/marketplace/requests/${r2.id}/offers`, { title: 'late offer', priceCents: 100000, currency: 'SAR' });
    R.check(po.status >= 400 && po.status < 500, { area: 'api-refusal', route: '/requests/[id]', role: 'hotelA', kind: 'invalid', action: 'API offer on a closed request', expected: '4xx', actual: `${po.status} ${po.message || ''}`, requests: [`POST /api/marketplace/requests/:id/offers ${po.status}`] });
  });

  // ── Travel plan ───────────────────────────────────────────────────────────
  await section('travel-plan', async () => {
    for (const [X, key] of [[A, 'travelerA'], [B, 'travelerB']]) {
      await X.page.goto(`${WEB}/travel-plan`); await L.settle(X);
      const txt = await body(X.page);
      const trips = await L.api(X, 'GET', '/travelers/me/trips');
      const links = await L.api(X, 'GET', '/travelers/me/links');
      const tl = L.firstArray(trips.data);
      const orgNames = tl.map((x) => x.organization?.name || x.tenantName || x.organizationName).filter(Boolean);
      R.check(trips.status === 200 && tl.length > 0 && orgNames.every((n) => txt.includes(n)), { area: 'travel-plan', route: '/travel-plan', role: key, action: 'linked trips on the travel plan', expected: 'the traveler’s linked trip(s) with the organization name', actual: `trips=${tl.length} orgs=${JSON.stringify(orgNames)} links=${L.firstArray(links.data).length}`, requests: [`GET /api/travelers/me/trips ${trips.status}`, `GET /api/travelers/me/links ${links.status}`], screenshot: await L.shot(X.page, `travel-plan-${key}`) });
      X.orgs = orgNames;
    }
    R.check((B.orgs || []).length > 0 && !(A.orgs || []).some((o) => (B.orgs || []).includes(o)), { area: 'travel-plan', route: '/travel-plan', role: 'travelerB', kind: 'tenant', action: "travelerB's plan shows only travelerB's organizations", expected: 'no Operator A trip for travelerB', actual: `A=${JSON.stringify(A.orgs)} B=${JSON.stringify(B.orgs)}` });
    await A.page.goto(`${WEB}/travel-plan/link`); await L.settle(A);
    const lt = await body(A.page);
    R.check(/link|invitation/i.test(lt) && !/Application error/.test(lt), { area: 'travel-plan', route: '/travel-plan/link', role: 'travelerA', kind: 'invalid', action: 'open the invitation page without a link', expected: 'clear "invitation link required/invalid" state', actual: lt.slice(lt.indexOf('Your journey'), lt.indexOf('Your journey') + 220) });
  });

  // ── Social: post, edit, like, save, comment, reply, delete; cross-user ────
  await section('social', async () => {
    const p = A.page;
    for (const old of L.firstArray((await L.api(A, 'GET', '/social/feed?limit=50')).data).filter((x) => /A10 (QA|debug) post a10/.test(JSON.stringify(x)) && !JSON.stringify(x).includes(STAMP))) await L.api(A, 'DELETE', `/social/posts/${old.id}`);
    await p.goto(`${WEB}/social`); await L.settle(A);
    const postBtn = p.getByRole('button', { name: /^Post$/ });
    R.check(await postBtn.isDisabled(), { area: 'social', route: '/social', role: 'travelerA', kind: 'invalid', action: 'Post with an empty composer', expected: 'Post disabled', actual: `disabled=${await postBtn.isDisabled()}` });
    const text = `A10 QA post ${STAMP} #a10qa`;
    await p.getByLabel('Write a post').fill(text);
    let t = Date.now();
    await postBtn.dblclick();
    await waitReq(A, /POST \/api\/social\/posts$/, t); await L.settle(A);
    const cp = since(A, t, /POST \/api\/social\/posts$/);
    R.check(cp.length === 1 && cp[0].status < 300, { area: 'social', route: '/social', role: 'travelerA', kind: 'double-submit', action: 'double-click Post', expected: 'one POST /social/posts', actual: fmt(cp).join(', '), requests: fmt(cp) });
    const art = () => p.locator('article', { hasText: STAMP }).first();
    await art().waitFor({ timeout: 10000 });
    const postId = await art().getAttribute('data-post-id');
    ctx.postId = postId;
    R.check(!!postId, { area: 'social', route: '/social', role: 'travelerA', action: 'publish a post', expected: 'post appears in the feed', actual: `postId=${postId}`, screenshot: await L.shot(p, 'social-post-created') });
    await p.reload(); await L.settle(A);
    R.check(await art().isVisible().catch(() => false), { area: 'social', route: '/social', role: 'travelerA', kind: 'persist', action: 'post after refresh', expected: 'still in the feed', actual: String(await art().isVisible().catch(() => false)) });
    // Edit.
    await art().getByRole('button', { name: 'Post options' }).click();
    await p.getByRole('menuitem', { name: /Edit post/ }).click();
    await art().getByLabel('Edit post').fill(`${text} (edited)`);
    t = Date.now();
    await art().getByRole('button', { name: 'Save changes' }).click();
    await waitReq(A, /PUT \/api\/social\/posts\//, t); await L.settle(A);
    await p.reload(); await L.settle(A);
    R.check((await art().innerText()).includes('(edited)'), { area: 'social', route: '/social', role: 'travelerA', action: 'edit own post', expected: 'PUT 2xx; edited text persists after refresh', actual: `${fmt(since(A, t, /PUT \/api\/social\/posts/)).join(',')} edited=${(await art().innerText()).includes('(edited)')}`, requests: fmt(since(A, t, /PUT \/api\/social\/posts/)) });
    // Like / unlike.
    t = Date.now();
    await art().getByRole('button', { name: 'Like' }).click();
    await waitReq(A, /react/, t); await L.settle(A);
    await p.reload(); await L.settle(A);
    const liked = await art().getByRole('button', { name: 'Unlike' }).getAttribute('aria-pressed').catch(() => null);
    R.check(liked === 'true', { area: 'social', route: '/social', role: 'travelerA', kind: 'persist', action: 'like a post; refresh', expected: 'Unlike shown (aria-pressed=true) after refresh', actual: `pressed=${liked} ${fmt(since(A, t, /react/)).join(',')}`, requests: fmt(since(A, t, /react/)) });
    t = Date.now();
    await art().getByRole('button', { name: 'Unlike' }).click();
    await waitReq(A, /react/, t); await L.settle(A);
    R.check(await art().getByRole('button', { name: 'Like' }).isVisible(), { area: 'social', route: '/social', role: 'travelerA', action: 'unlike', expected: 'Like shown again', actual: fmt(since(A, t, /react/)).join(',') });
    // Save / unsave.
    t = Date.now();
    await art().getByRole('button', { name: 'Save post' }).click();
    await waitReq(A, /save/, t); await L.settle(A);
    const saved = L.firstArray((await L.api(A, 'GET', '/social/saved-posts')).data).some((x) => (x.id || x.postId || x.post?.id) === postId);
    R.check(saved, { area: 'social', route: '/social', role: 'travelerA', action: 'save a post', expected: 'post in GET /social/saved-posts', actual: `${fmt(since(A, t, /save/)).join(',')} inSaved=${saved}`, readback: 'GET /api/social/saved-posts' });
    t = Date.now();
    await art().getByRole('button', { name: 'Unsave post' }).click();
    await waitReq(A, /save/, t); await L.settle(A);
    const saved2 = L.firstArray((await L.api(A, 'GET', '/social/saved-posts')).data).some((x) => (x.id || x.postId || x.post?.id) === postId);
    R.check(!saved2, { area: 'social', route: '/social', role: 'travelerA', action: 'unsave a post', expected: 'post not in saved list', actual: `inSaved=${saved2}` });
    // Comment, reply, edit comment, delete reply.
    await art().getByRole('button', { name: /Comment/ }).first().click();
    const cbox = art().getByLabel('Write a comment');
    await cbox.waitFor();
    const cpost = art().getByRole('button', { name: 'Post comment' });
    const emptyDisabled = await cpost.isDisabled().catch(() => null);
    R.check(emptyDisabled === true, { area: 'social', route: '/social', role: 'travelerA', kind: 'invalid', action: 'Post comment with empty text', expected: 'disabled', actual: `disabled=${emptyDisabled}` });
    await cbox.fill(`A10 comment ${STAMP}`);
    t = Date.now();
    await cpost.click();
    await waitReq(A, /POST \/api\/social\/posts\/.*\/comments/, t); await L.settle(A);
    R.check((await art().innerText()).includes(`A10 comment ${STAMP}`), { area: 'social', route: '/social', role: 'travelerA', action: 'comment on a post', expected: 'comment shown', actual: fmt(since(A, t, /comments/)).join(',') });
    await art().getByRole('button', { name: 'Reply' }).first().click();
    await art().getByLabel('Write a reply').fill(`A10 reply ${STAMP}`);
    t = Date.now();
    await art().getByRole('button', { name: 'Post reply' }).click();
    await waitReq(A, /POST \/api\/social\/posts\/.*\/comments/, t); await L.settle(A);
    R.check((await art().innerText()).includes(`A10 reply ${STAMP}`), { area: 'social', route: '/social', role: 'travelerA', action: 'reply to a comment', expected: 'reply shown', actual: fmt(since(A, t, /comments/)).join(',') });
    const csec = art().locator('section[aria-label=Comments]');
    const ceditBtn = csec.getByRole('button', { name: 'Edit', exact: true }).first();
    await ceditBtn.click();
    await art().getByLabel('Edit comment').fill(`A10 comment ${STAMP} (edited)`);
    t = Date.now();
    await csec.getByRole('button', { name: 'Save', exact: true }).first().click();
    await waitReq(A, /PUT \/api\/social\/posts\/.*\/comments/, t); await L.settle(A);
    R.check((await art().innerText()).includes(`A10 comment ${STAMP} (edited)`), { area: 'social', route: '/social', role: 'travelerA', action: 'edit own comment', expected: 'PUT 2xx; text updated', actual: fmt(since(A, t, /comments/)).join(',') });
    t = Date.now();
    const replyRow = csec.locator('div').filter({ hasText: `A10 reply ${STAMP}` }).filter({ has: p.getByRole('button', { name: 'Delete', exact: true }) }).last();
    await replyRow.getByRole('button', { name: 'Delete', exact: true }).first().click();
    await waitReq(A, /DELETE \/api\/social\/posts\/.*\/comments/, t); await L.settle(A);
    R.check(!(await art().innerText()).includes(`A10 reply ${STAMP}`), { area: 'social', route: '/social', role: 'travelerA', action: 'delete own reply', expected: 'DELETE 2xx; reply removed', actual: fmt(since(A, t, /comments/)).join(',') });
    // travelerB: may like/comment, may not edit/delete.
    await B.page.goto(`${WEB}/social`); await L.settle(B);
    const bArt = B.page.locator(`article[data-post-id="${postId}"]`);
    const bSees = await bArt.isVisible().catch(() => false);
    let menuItems = [];
    if (bSees) { await bArt.getByRole('button', { name: 'Post options' }).click(); menuItems = await B.page.getByRole('menuitem').allInnerTexts(); await B.page.keyboard.press('Escape'); }
    R.check(bSees && !menuItems.some((m) => /Edit post|Delete post/.test(m)), { area: 'social', route: '/social', role: 'travelerB', kind: 'denied', action: "travelerB's menu on travelerA's post", expected: 'visible; no Edit/Delete', actual: `visible=${bSees} menu=${JSON.stringify(menuItems.map((m) => m.trim()))}` });
    const bput = await L.apiProbe(B, 'PUT', `/social/posts/${postId}`, { content: 'hijack' });
    const bdel = await L.apiProbe(B, 'DELETE', `/social/posts/${postId}`);
    R.check([403, 404].includes(bput.status) && [403, 404].includes(bdel.status), { area: 'api-refusal', route: '/social', role: 'travelerB', kind: 'denied', action: "API edit/delete travelerA's post as travelerB", expected: '403/404 for both', actual: `PUT ${bput.status} DELETE ${bdel.status}`, requests: [`PUT /api/social/posts/:id ${bput.status}`, `DELETE /api/social/posts/:id ${bdel.status}`] });
    if (bSees) {
      t = Date.now();
      await bArt.getByRole('button', { name: 'Like' }).click();
      await waitReq(B, /react/, t); await L.settle(B);
      R.check(since(B, t, /react/).some((x) => x.status < 300), { area: 'social', route: '/social', role: 'travelerB', action: "like travelerA's post", expected: '2xx', actual: fmt(since(B, t, /react/)).join(',') });
    }
    // Delete own post.
    await p.goto(`${WEB}/social`); await L.settle(A);
    await art().getByRole('button', { name: 'Post options' }).click();
    t = Date.now();
    await p.getByRole('menuitem', { name: /Delete post/ }).click();
    await waitReq(A, /DELETE \/api\/social\/posts\//, t); await L.settle(A);
    await p.reload(); await L.settle(A);
    const gone = !(await p.locator(`article[data-post-id="${postId}"]`).isVisible().catch(() => false));
    const g = await L.api(A, 'GET', `/social/posts/${postId}`);
    for (const dup of L.firstArray((await L.api(A, 'GET', '/social/feed?limit=50')).data).filter((x) => JSON.stringify(x).includes(STAMP))) await L.api(A, 'DELETE', `/social/posts/${dup.id}`);
    R.check(gone && g.status === 404, { area: 'social', route: '/social', role: 'travelerA', action: 'delete own post (confirm)', expected: 'removed from the feed after refresh; GET 404', actual: `${fmt(since(A, t, /DELETE/)).join(',')} gone=${gone} GET=${g.status}`, requests: fmt(since(A, t, /DELETE/)) });
  });

  // ── Connections, messages, notifications (travelerA ↔ travelerB) ──────────
  await section('connections', async () => {
    // Start from "not connected".
    const st = await L.api(A, 'GET', `/connections/status/${ctx.userB}`);
    if (st.data && /CONNECTED|ACCEPTED|PENDING/i.test(JSON.stringify(st.data))) await L.api(A, 'DELETE', `/connections/with/${ctx.userB}`);
    const p = A.page;
    const connectFromDiscover = async () => {
      await p.goto(`${WEB}/discover`); await L.settle(A);
      await p.getByLabel(/Search people/).fill(ctx.nameB);
      await L.sleep(900); await L.settle(A);
      const card = p.locator('main div').filter({ hasText: ctx.nameB }).filter({ has: p.getByRole('button', { name: 'Connect', exact: true }) }).last();
      const t = Date.now();
      await card.getByRole('button', { name: 'Connect', exact: true }).click();
      await waitReq(A, /connections\/request/, t); await L.settle(A);
      return since(A, t, /connections\/request/);
    };
    let cr = await connectFromDiscover();
    R.check(cr.some((x) => x.status < 300), { area: 'social', route: '/discover', role: 'travelerA', action: `send a connection request to ${ctx.nameB}`, expected: 'POST 2xx; toast', actual: `${fmt(cr).join(',')} toast="${(await toastText(p)).slice(0, 70)}"`, requests: fmt(cr) });
    // travelerB declines.
    const q = B.page;
    await q.goto(`${WEB}/connections`); await L.settle(B);
    let t = Date.now();
    await q.getByRole('button', { name: `Decline the request from ${ctx.nameA}` }).click();
    await waitReq(B, /connections\/.*\/reject/, t); await L.settle(B);
    R.check(since(B, t, /reject/).some((x) => x.status < 300), { area: 'social', route: '/connections', role: 'travelerB', action: 'decline a connection request', expected: 'POST reject 2xx; request gone', actual: fmt(since(B, t, /reject/)).join(','), requests: fmt(since(B, t, /reject/)) });
    // Request again → accept.
    cr = await connectFromDiscover();
    const again = cr.some((x) => x.status < 300);
    R.check(again, { area: 'social', route: '/discover', role: 'travelerA', action: 'request again after a decline', expected: 'allowed (2xx) or a clear message', actual: `${fmt(cr).join(',')} toast="${(await toastText(p)).slice(0, 70)}"` });
    if (again) {
      await q.goto(`${WEB}/connections`); await L.settle(B);
      t = Date.now();
      await q.locator('main li, main div', { hasText: ctx.nameA }).getByRole('button', { name: /^Accept$/ }).first().click();
      await waitReq(B, /connections\/.*\/accept/, t); await L.settle(B);
      await q.reload(); await L.settle(B);
      const connectedB = await q.getByRole('button', { name: `Message ${ctx.nameA}` }).isVisible().catch(() => false);
      R.check(since(B, t, /accept/).some((x) => x.status < 300) && connectedB, { area: 'social', route: '/connections', role: 'travelerB', kind: 'persist', action: 'accept a connection request; refresh', expected: 'connected on refresh (Message button)', actual: `${fmt(since(B, t, /accept/)).join(',')} connected=${connectedB}` });
      await p.goto(`${WEB}/connections`); await L.settle(A);
      R.check(await p.getByRole('button', { name: `Message ${ctx.nameB}` }).isVisible().catch(() => false), { area: 'social', route: '/connections', role: 'travelerA', action: 'the connection shows for the requester', expected: 'listed with Message', actual: String(await p.getByRole('button', { name: `Message ${ctx.nameB}` }).isVisible().catch(() => false)) });
      // Message.
      t = Date.now();
      await p.getByRole('button', { name: `Message ${ctx.nameB}` }).click();
      await L.settle(A);
      const box = p.getByLabel('Type a message');
      await box.waitFor();
      const sendBtn = p.getByRole('button', { name: /Send/ }).last();
      R.check(await sendBtn.isDisabled().catch(() => false), { area: 'social', route: '/messages', role: 'travelerA', kind: 'invalid', action: 'Send with an empty message', expected: 'disabled', actual: `disabled=${await sendBtn.isDisabled().catch(() => null)}` });
      await box.fill(`A10 hello ${STAMP}`);
      t = Date.now();
      await sendBtn.dblclick();
      await waitReq(A, /POST \/api\/social\/conversations\/.*\/messages/, t); await L.settle(A);
      const ms = since(A, t, /POST \/api\/social\/conversations\/.*\/messages/);
      R.check(ms.length === 1 && ms[0].status < 300, { area: 'social', route: '/messages', role: 'travelerA', kind: 'double-submit', action: 'double-click Send message', expected: 'one POST', actual: fmt(ms).join(', '), requests: fmt(ms) });
      await q.goto(`${WEB}/messages`); await L.settle(B);
      await q.locator('nav[aria-label=Conversations] a, nav[aria-label=Conversations] button', { hasText: ctx.nameA }).first().click().catch(() => {});
      await L.settle(B);
      const seen = (await body(q)).includes(`A10 hello ${STAMP}`);
      R.check(seen, { area: 'social', route: '/messages', role: 'travelerB', action: 'recipient reads the message', expected: 'message visible in the conversation', actual: String(seen), screenshot: await L.shot(q, 'messages-recipient') });
      if (seen) {
        await q.getByLabel('Type a message').fill(`A10 reply ${STAMP}`);
        t = Date.now();
        await q.getByRole('button', { name: /Send/ }).last().click();
        await waitReq(B, /messages/, t); await L.settle(B);
        await p.reload(); await L.settle(A);
        R.check((await body(p)).includes(`A10 reply ${STAMP}`), { area: 'social', route: '/messages', role: 'travelerA', kind: 'persist', action: 'reply arrives; persists after refresh', expected: 'reply visible', actual: String((await body(p)).includes(`A10 reply ${STAMP}`)) });
      }
      // Notifications for travelerB.
      await q.goto(`${WEB}/notifications`); await L.settle(B);
      const nt = await body(q);
      const before = await L.api(B, 'GET', '/notifications?page=1&limit=12');
      const unreadBefore = before.meta?.unread ?? before.data?.unread ?? L.firstArray(before.data).filter((n) => !n.readAt).length;
      const markAll = q.getByRole('button', { name: /Mark all as read/ });
      if (await markAll.isVisible().catch(() => false) && !(await markAll.isDisabled())) {
        t = Date.now();
        await markAll.click();
        await waitReq(B, /notifications\/read-all/, t); await L.settle(B);
      }
      await q.reload(); await L.settle(B);
      const after = await L.api(B, 'GET', '/notifications?page=1&limit=12');
      const unreadAfter = L.firstArray(after.data).filter((n) => !n.readAt).length;
      R.check(/connection|message|request/i.test(nt) && unreadAfter === 0, { area: 'notifications', route: '/notifications', role: 'travelerB', kind: 'persist', action: 'notifications list; Mark all as read; refresh', expected: 'connection/message notifications listed; 0 unread after refresh', actual: `unread before=${unreadBefore} after=${unreadAfter}`, requests: fmt(since(B, t, /notifications/)).slice(-3), screenshot: await L.shot(q, 'notifications-b') });
      // Remove connection.
      await p.goto(`${WEB}/connections`); await L.settle(A);
      t = Date.now();
      await p.getByRole('button', { name: `Remove ${ctx.nameB}` }).click();
      await waitReq(A, /DELETE \/api\/connections\/with/, t); await L.settle(A);
      await q.goto(`${WEB}/connections`); await L.settle(B);
      R.check(since(A, t, /connections\/with/).some((x) => x.status < 300) && !(await q.getByRole('button', { name: `Message ${ctx.nameA}` }).isVisible().catch(() => false)), { area: 'social', route: '/connections', role: 'travelerA', action: 'remove a connection', expected: 'DELETE 2xx; gone for both', actual: fmt(since(A, t, /connections\/with/)).join(',') });
    }
  });

  // ── Groups (traveler side) ────────────────────────────────────────────────
  await section('groups', async () => {
    const p = A.page;
    await p.goto(`${WEB}/social/groups`); await L.settle(A);
    const g = await L.api(A, 'GET', '/groups/mine');
    const inv = await L.api(A, 'GET', '/groups/invites/mine');
    const txt = await body(p);
    const mine = L.firstArray(g.data);
    R.check(g.status === 200 && mine.every((x) => txt.includes(x.name)), { area: 'social', route: '/social/groups', role: 'travelerA', action: 'My groups lists the groups the traveler belongs to', expected: 'each group from GET /groups/mine shown', actual: `groups=${mine.length} invites=${L.firstArray(inv.data).length}`, requests: [`GET /api/groups/mine ${g.status}`, `GET /api/groups/invites/mine ${inv.status}`], screenshot: await L.shot(p, 'social-groups-a') });
    if (mine[0]) {
      await p.goto(`${WEB}/social/groups/${mine[0].id}`); await L.settle(A);
      const st = await L.pageState(p);
      R.check(st.state === 'rendered' && st.h1.length > 0, { area: 'social', route: '/social/groups/[id]', role: 'travelerA', action: 'open own group', expected: 'group page renders', actual: `${st.state} ${JSON.stringify(st.h1)}` });
      await B.page.goto(`${WEB}/social/groups/${mine[0].id}`); await L.settle(B);
      const bt = await body(B.page);
      const bg = await L.apiProbe(B, 'GET', `/groups/${mine[0].id}/posts`);
      R.check(/not available|private|not a member/i.test(bt) || [403, 404].includes(bg.status), { area: 'social', route: '/social/groups/[id]', role: 'travelerB', kind: 'tenant', action: "travelerB opens travelerA's private group", expected: 'not available; posts API 403/404', actual: `text=${/not available|private/i.test(bt)} posts API=${bg.status}` });
    } else R.rec({ area: 'social', route: '/social/groups/[id]', role: 'travelerA', action: 'open own group', expected: 'a group', actual: 'travelerA belongs to no group', result: 'UNTESTED', reason: 'fixture has no group membership' });
  });

  await browser.close();
  console.log(`TOTAL traveler: ${JSON.stringify(R.count)}`);
  require('fs').writeFileSync(require('path').join(L.RUNTIME, 'traveler-ctx.json'), JSON.stringify({ STAMP, request: ctx.request, booking1: ctx.booking1, booking2: ctx.booking2, listing: ctx.listing, postId: ctx.postId }, null, 1));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
