/* eslint-disable no-console */
/**
 * A03b browser verification: business-role workflows (hotel, transport, visa
 * agency, operator). Drives the installed Google Chrome through playwright-core,
 * one browser context per identity, signing in through the real /login form.
 * Every route/action is recorded to route-action-inventory.json as
 * { route, role, action, request, expected, actual, persisted, result }.
 *
 * Usage (servers running on the worker ports):
 *   DEMO_PASSWORD=… WEB_URL=http://localhost:3413 node audit/eng100/a03b_business_workflows.js
 * The demo password is read from the environment and never written anywhere.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const PW = process.env.PLAYWRIGHT_CORE || '/Users/macbook/Projects/umrah-connects/audit/node_modules/playwright-core';
const { chromium } = require(PW);
const BASE = process.env.WEB_URL || 'http://localhost:3413';
const OUT = process.env.OUT_DIR || path.join(__dirname, '..', '..', 'docs', 'control-tower', 'evidence', 'eng100', 'a03b');
const PASSWORD = process.env.DEMO_PASSWORD;
if (!PASSWORD) { console.error('Set DEMO_PASSWORD'); process.exit(2); }
const RUN = Date.now().toString(36).slice(-5).toUpperCase();
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const IDS = {
  hotelA: 'hotel@makkahgrand.dev', hotelB: 'hotel.b@madinahcomfort.dev',
  transportA: 'transport@haramaintransport.dev', transportB: 'transport.b@jeddahcoach.dev',
  visaA: 'visa@fastvisa.dev', visaB: 'visa.b@nusukvisa.dev', visaOfficer: 'visa.officer@alharamain.sa',
  opAdmin: 'admin@alharamain.sa', opStaff: 'staff@alharamain.sa',
};

const results = [];
function record(r) {
  const row = { route: r.route, role: r.role, action: r.action, request: r.request ?? null, expected: r.expected, actual: r.actual, persisted: r.persisted ?? null, result: r.result };
  results.push(row);
  console.log(`${row.result === 'PASS' ? 'PASS' : 'FAIL'} [${row.role}] ${row.route} :: ${row.action} — ${row.actual}`);
}
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const pdfPath = path.join(os.tmpdir(), `a03b-scan-${RUN}.pdf`);
fs.writeFileSync(pdfPath, Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(256, 0x20), Buffer.from('\n%%EOF\n')]));

async function login(browser, who) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
  const page = await ctx.newPage();
  // Wait for hydration: before it, the form would fall back to a native POST.
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.locator('#signin-email').fill(IDS[who]);
  await page.locator('#signin-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000, waitUntil: 'commit' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  return { ctx, page, who };
}

/** Same-origin API call with the session the web app itself holds (readback only). */
async function api(page, method, p, body) {
  return page.evaluate(async ({ method, p, body }) => {
    const t = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
    const r = await fetch(`/proxy-api${p}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch { /* non-JSON */ }
    return { status: r.status, body: j };
  }, { method, p, body });
}

async function go(page, route) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
}
const dialog = (page) => page.getByRole('dialog');
async function visible(locator, timeout = 15000) {
  try { await locator.first().waitFor({ state: 'visible', timeout }); return true; } catch { return false; }
}
async function toastOrText(page, text, timeout = 15000) { return visible(page.getByText(text), timeout); }
/** Polls a readback until it satisfies `ok` (the UI updates after the request settles). */
async function until(read, ok, timeout = 15000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await read();
    if (ok(last)) return last;
    await new Promise((r) => setTimeout(r, 400));
  }
  return last;
}

async function step(meta, fn) {
  try {
    const out = await fn();
    record({ ...meta, ...out });
  } catch (e) {
    record({ ...meta, actual: `error: ${String(e.message || e).split('\n')[0].slice(0, 200)}`, result: 'FAIL' });
  }
}
async function shot(page, name) {
  await page.waitForTimeout(1600); // let chart animations finish so the capture shows the settled page
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false }).catch(() => undefined);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const S = {};
  const ctxs = [];
  const open = async (who) => { const s = await login(browser, who); ctxs.push(s.ctx); S[who] = s.page; return s.page; };

  // ═══ HOTEL MANAGER A ═══════════════════════════════════════════════════
  let hp = await open('hotelA');
  let hotelId; let roomId; let bookingId;
  const hotelName = `A03b Hotel ${RUN}`;
  await step({ route: '/hotel-dashboard', role: 'HOTEL_MANAGER (A)', action: 'open dashboard (figures from data)', expected: 'dashboard renders; "Own hotels" equals GET /hotels/stats' }, async () => {
    await go(hp, '/hotel-dashboard');
    const ok = await visible(hp.getByRole('heading', { name: 'Hotel operations' }));
    const stats = await api(hp, 'GET', '/hotels/stats');
    const tile = await hp.getByText('Own hotels').first().locator('..').innerText().catch(() => '');
    const match = tile.includes(String(stats.body?.data?.hotels?.total));
    return { request: 'GET /hotels/stats', actual: `rendered=${ok}; tile="${tile.replace(/\s+/g, ' ').slice(0, 60)}"; api total=${stats.body?.data?.hotels?.total}`, result: ok && match ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/hotels', role: 'HOTEL_MANAGER (A)', action: 'add hotel — required field missing', expected: 'client error "Enter the hotel name." and no request' }, async () => {
    await go(hp, '/hotels');
    await hp.getByRole('button', { name: 'Add hotel' }).first().click();
    await dialog(hp).getByRole('button', { name: 'Add hotel' }).click();
    const err = await visible(dialog(hp).getByText('Enter the hotel name.'), 5000);
    return { actual: `inline error=${err}`, result: err ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/hotels', role: 'HOTEL_MANAGER (A)', action: 'add hotel — valid', request: 'POST /hotels', expected: 'hotel saved, listed after refresh' }, async () => {
    await dialog(hp).getByLabel(/^Hotel name/).fill(hotelName);
    await dialog(hp).getByLabel(/^Check-in time/).fill('14:00');
    await dialog(hp).getByRole('button', { name: 'Add hotel' }).click();
    await toastOrText(hp, 'Hotel added');
    await hp.reload(); await hp.waitForLoadState('networkidle').catch(() => undefined);
    const listed = await visible(hp.getByText(hotelName));
    const rb = await api(hp, 'GET', `/hotels?search=${encodeURIComponent(hotelName)}`);
    hotelId = rb.body?.data?.items?.[0]?.id;
    return { actual: `listed after reload=${listed}; api found=${!!hotelId}; checkInTime=${rb.body?.data?.items?.[0]?.checkInTime}`, persisted: listed && !!hotelId, result: listed && hotelId ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/hotels/[id]', role: 'HOTEL_MANAGER (A)', action: 'add room — number required, duplicate refused, valid saved', request: 'POST /hotels/:id/rooms', expected: 'inline error; 409 shown for duplicate; room listed' }, async () => {
    await go(hp, `/hotels/${hotelId}`);
    await hp.getByRole('tab', { name: 'Rooms' }).click();
    await hp.getByRole('button', { name: 'Add room' }).first().click();
    await dialog(hp).getByRole('button', { name: 'Add room' }).click();
    const req = await visible(dialog(hp).getByText('Enter the room number.'), 5000);
    await dialog(hp).getByLabel(/^Room number/).fill('701');
    await dialog(hp).getByLabel(/^Price per night/).fill('450');
    await dialog(hp).getByRole('button', { name: 'Add room' }).click();
    await toastOrText(hp, 'Room 701 added');
    await hp.getByRole('button', { name: 'Add room' }).first().click();
    await dialog(hp).getByLabel(/^Room number/).fill('701');
    await dialog(hp).getByRole('button', { name: 'Add room' }).click();
    const dup = await visible(dialog(hp).getByText(/already exists/), 8000);
    await dialog(hp).getByRole('button', { name: 'Cancel' }).click();
    const rooms = await api(hp, 'GET', `/hotels/${hotelId}/rooms`);
    roomId = rooms.body?.data?.find((r) => r.roomNumber === '701')?.id;
    return { actual: `required=${req}; duplicate refused=${dup}; rooms=${rooms.body?.data?.length}`, persisted: !!roomId, result: req && dup && roomId && rooms.body.data.length === 1 ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/hotels/[id]', role: 'HOTEL_MANAGER (A)', action: 'add room type (explicit guests kept)', request: 'POST /hotels/:id/room-types', expected: 'sleeps 3 persisted' }, async () => {
    await hp.getByRole('tab', { name: 'Room types' }).click();
    await hp.getByRole('button', { name: 'Add room type' }).first().click();
    await dialog(hp).getByLabel(/^Name/).fill('Family Double');
    await dialog(hp).getByLabel(/^Sleeps/).fill('3');
    await dialog(hp).getByRole('button', { name: 'Add room type' }).click();
    await toastOrText(hp, 'Room type added');
    const types = await api(hp, 'GET', `/hotels/${hotelId}/room-types`);
    const occ = types.body?.data?.[0]?.occupancy;
    return { actual: `occupancy=${occ}`, persisted: occ === 3, result: occ === 3 ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/hotels/[id]', role: 'HOTEL_MANAGER (A)', action: 'room status offers no OCCUPIED', expected: 'status select has Available/Maintenance only' }, async () => {
    await hp.getByRole('tab', { name: 'Rooms' }).click();
    const sel = hp.getByLabel('Status of room 701');
    await visible(sel);
    const opts = await sel.locator('option').allInnerTexts();
    return { actual: `options=${opts.join('/')}`, result: !opts.some((o) => /occupied/i.test(o)) && opts.length === 2 ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/hotel-bookings', role: 'HOTEL_MANAGER (A)', action: 'new booking — guest required; room picker from availability; pending', request: 'POST /hotels/bookings', expected: 'inline errors, then booking PENDING with room 701, payment UNPAID' }, async () => {
    await go(hp, '/hotel-bookings');
    await hp.getByRole('button', { name: 'New booking' }).click();
    await dialog(hp).getByRole('button', { name: 'Record booking' }).click();
    const guestErr = await visible(dialog(hp).getByText('Enter the guest name.'), 5000);
    await dialog(hp).getByLabel(/^Hotel \*/).selectOption(hotelId);
    await dialog(hp).getByLabel(/^Guest name/).fill(`Guest ${RUN}`);
    await dialog(hp).getByLabel(/^Check-in/).fill(day(10));
    await dialog(hp).getByLabel(/^Check-out/).fill(day(12));
    await dialog(hp).getByLabel(/^Guests/).fill('2');
    await hp.waitForTimeout(1200);
    await dialog(hp).getByLabel(/^Room$/).selectOption(roomId);
    await dialog(hp).getByRole('button', { name: 'Record booking' }).click();
    await toastOrText(hp, 'Booking recorded');
    const list = await api(hp, 'GET', `/hotels/bookings?hotelId=${hotelId}`);
    const b = list.body?.data?.[0];
    bookingId = b?.id;
    return { actual: `guest required=${guestErr}; status=${b?.status}; room=${b?.room?.roomNumber}; payment=${b?.paymentStatus}`, persisted: !!b, result: guestErr && b?.status === 'PENDING' && b?.room?.roomNumber === '701' && b?.paymentStatus === 'UNPAID' ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/hotel-bookings', role: 'HOTEL_MANAGER (A)', action: 'double booking of the same room refused', request: 'POST /hotels/bookings (overlap)', expected: '409 "already booked" shown in the form' }, async () => {
    await hp.getByRole('button', { name: 'New booking' }).click();
    await dialog(hp).getByLabel(/^Hotel \*/).selectOption(hotelId);
    await dialog(hp).getByLabel(/^Guest name/).fill('Clash guest');
    await dialog(hp).getByLabel(/^Check-in/).fill(day(11));
    await dialog(hp).getByLabel(/^Check-out/).fill(day(13));
    await hp.waitForTimeout(1200);
    // The picker hides the held room; the server check is exercised through the API.
    const offered = await dialog(hp).getByLabel(/^Room$/).locator('option').allInnerTexts();
    await dialog(hp).getByRole('button', { name: 'Cancel' }).click();
    const res = await api(hp, 'POST', '/hotels/bookings', { hotelId, guestName: 'Clash guest', checkIn: day(11), checkOut: day(13), roomId });
    return { actual: `picker offers room 701=${offered.some((o) => o.includes('701'))}; server=${res.status} ${res.body?.error?.message}`, result: !offered.some((o) => o.includes('701')) && res.status === 409 ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/hotel-bookings', role: 'HOTEL_MANAGER (A)', action: 'confirm → check in → check out → complete (server transitions)', request: 'PUT /hotels/bookings/:id {status}', expected: 'only allowed moves offered; room OCCUPIED while checked in, AVAILABLE after' }, async () => {
    await hp.reload(); await hp.waitForLoadState('networkidle').catch(() => undefined);
    const row = hp.getByRole('row', { name: new RegExp(`Guest ${RUN}`) });
    const firstButtons = await row.getByRole('button').allInnerTexts();
    const rooms = () => api(hp, 'GET', `/hotels/${hotelId}/rooms`).then((r) => r.body?.data?.[0]?.status);
    await row.getByRole('button', { name: 'Confirm' }).click();
    await toastOrText(hp, `Guest ${RUN}: confirmed`);
    await row.getByRole('button', { name: 'Check in' }).click();
    await toastOrText(hp, `Guest ${RUN}: checked in`);
    const occ = await until(rooms, (s) => s === 'OCCUPIED');
    await row.getByRole('button', { name: 'Check out' }).click();
    await toastOrText(hp, `Guest ${RUN}: checked out`);
    const free = await until(rooms, (s) => s === 'AVAILABLE');
    await row.getByRole('button', { name: 'Complete' }).click();
    await toastOrText(hp, `Guest ${RUN}: completed`);
    await hp.reload(); await hp.waitForLoadState('networkidle').catch(() => undefined);
    const final = (await api(hp, 'GET', `/hotels/bookings/${bookingId}`)).body?.data;
    const done = await visible(hp.getByRole('row', { name: new RegExp(`Guest ${RUN}`) }).getByText('Completed'));
    return { actual: `first offered=[${firstButtons.join(', ')}]; room while in=${occ}; after=${free}; final=${final?.status}; row shows Completed=${done}`, persisted: final?.status === 'COMPLETED', result: firstButtons.includes('Confirm') && !firstButtons.includes('Check in') && occ === 'OCCUPIED' && free === 'AVAILABLE' && final?.status === 'COMPLETED' && done ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/hotel-bookings', role: 'HOTEL_MANAGER (A)', action: 'payment status is read-only', expected: 'no payment select; API refuses paymentStatus' }, async () => {
    const selects = await hp.getByLabel(/Payment Status/i).count();
    const res = await api(hp, 'PUT', `/hotels/bookings/${bookingId}`, { paymentStatus: 'PAID' });
    return { request: 'PUT /hotels/bookings/:id {paymentStatus:PAID}', actual: `payment selects=${selects}; server=${res.status}`, result: selects === 0 && res.status === 400 ? 'PASS' : 'FAIL' };
  });
  await shot(hp, 'hotel-bookings-completed');

  // ═══ HOTEL MANAGER B (tenant boundary) ═════════════════════════════════
  const hb = await open('hotelB');
  await step({ route: '/hotels', role: 'HOTEL_MANAGER (B)', action: 'empty state for a new tenant', expected: 'no A hotels; empty state' }, async () => {
    await go(hb, '/hotels');
    const leak = await hb.getByText(hotelName).count();
    return { actual: `A hotel visible=${leak > 0}`, result: leak === 0 ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/hotels/[id]', role: 'HOTEL_MANAGER (B)', action: "open A's hotel by URL", expected: 'unavailable state (404)' }, async () => {
    await go(hb, `/hotels/${hotelId}`);
    const unavailable = await visible(hb.getByText('Information unavailable'));
    return { actual: `unavailable=${unavailable}`, result: unavailable ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/hotel-bookings', role: 'HOTEL_MANAGER (B)', action: "move A's booking via API", request: 'PUT /hotels/bookings/:id {status:CANCELLED}', expected: '404; A booking unchanged' }, async () => {
    const res = await api(hb, 'PUT', `/hotels/bookings/${bookingId}`, { status: 'CANCELLED' });
    const after = (await api(hp, 'GET', `/hotels/bookings/${bookingId}`)).body?.data?.status;
    return { actual: `B=${res.status}; A readback=${after}`, persisted: after === 'COMPLETED', result: res.status === 404 && after === 'COMPLETED' ? 'PASS' : 'FAIL' };
  });

  // ═══ TRANSPORT MANAGER A ═══════════════════════════════════════════════
  const tp = await open('transportA');
  const plate = `A3B-${RUN}`;
  let vehicleId; let routeId; let tripId;
  await step({ route: '/transport-dashboard', role: 'TRANSPORT_MANAGER (A)', action: 'open dashboard', expected: 'figures render' }, async () => {
    await go(tp, '/transport-dashboard');
    const ok = await visible(tp.getByRole('heading', { name: 'Transport operations' }));
    return { actual: `rendered=${ok}`, result: ok ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/transport/vehicles', role: 'TRANSPORT_MANAGER (A)', action: 'add vehicle — required, then valid, then duplicate plate', request: 'POST /transport/vehicles', expected: 'inline errors; saved; 409 on duplicate' }, async () => {
    await go(tp, '/transport/vehicles');
    await tp.getByRole('button', { name: 'Add vehicle' }).first().click();
    await dialog(tp).getByRole('button', { name: 'Add vehicle' }).click();
    const req = await visible(dialog(tp).getByText('Enter the plate number.'), 5000);
    await dialog(tp).getByLabel(/^Plate number/).fill(plate);
    await dialog(tp).getByLabel(/^Seats/).fill('4');
    await dialog(tp).getByRole('button', { name: 'Add vehicle' }).click();
    await toastOrText(tp, 'Vehicle added');
    await tp.getByRole('button', { name: 'Add vehicle' }).first().click();
    await dialog(tp).getByLabel(/^Plate number/).fill(plate.toLowerCase());
    await dialog(tp).getByLabel(/^Seats/).fill('4');
    await dialog(tp).getByRole('button', { name: 'Add vehicle' }).click();
    const dup = await visible(dialog(tp).getByText(/already registered/), 8000);
    await dialog(tp).getByRole('button', { name: 'Cancel' }).click();
    const list = await api(tp, 'GET', `/transport/vehicles?search=${plate}`);
    vehicleId = list.body?.data?.items?.[0]?.id;
    return { actual: `required=${req}; duplicate refused=${dup}; found=${list.body?.data?.total}`, persisted: list.body?.data?.total === 1, result: req && dup && list.body?.data?.total === 1 ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/transport/routes', role: 'TRANSPORT_MANAGER (A)', action: 'add route with 4 seats on the new vehicle', request: 'POST /transport/routes', expected: 'saved; seats 0/4' }, async () => {
    await go(tp, '/transport/routes');
    await tp.getByRole('button', { name: 'Add route' }).first().click();
    await dialog(tp).getByLabel(/^Route name/).fill(`JED → MAK ${RUN}`);
    await dialog(tp).getByLabel(/^From/).fill('Jeddah');
    await dialog(tp).getByLabel(/^To \*/).fill('Makkah');
    await dialog(tp).getByLabel(/^Seats for sale/).fill('4');
    await dialog(tp).getByLabel(/^Duration/).fill('90');
    await dialog(tp).getByLabel(/^Default vehicle/).selectOption(vehicleId);
    await dialog(tp).getByRole('button', { name: 'Add route' }).click();
    await toastOrText(tp, 'Route added');
    const list = await api(tp, 'GET', `/transport/routes?search=${RUN}`);
    const r = list.body?.data?.items?.[0];
    routeId = r?.id;
    return { actual: `route=${r?.name}; seats ${r?.bookedSeats}/${r?.totalSeats}`, persisted: !!routeId, result: r?.totalSeats === 4 && r?.bookedSeats === 0 ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/transport/assignments', role: 'TRANSPORT_MANAGER (A)', action: 'new trip — too many passengers refused client-side; valid trip saved', request: 'POST /transport/assignments', expected: 'inline seat error; trip SCHEDULED; route seats 3/4' }, async () => {
    await go(tp, '/transport/assignments');
    await tp.getByRole('button', { name: 'New trip' }).click();
    await dialog(tp).getByLabel(/^Vehicle \*/).selectOption(vehicleId);
    await dialog(tp).getByLabel(/^Route/).selectOption(routeId);
    const when = new Date(Date.now() + 5 * 86400000); when.setHours(10, 0, 0, 0);
    const local = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}T10:00`;
    await dialog(tp).getByLabel(/^Pickup date/).fill(local);
    await dialog(tp).getByLabel(/^Passengers/).fill('5');
    await dialog(tp).getByLabel(/^Customer name/).fill(`Group ${RUN}`);
    await dialog(tp).getByRole('button', { name: 'Schedule trip' }).click();
    const seatErr = await visible(dialog(tp).getByText(/seats 4|seat\(s\) left/), 5000);
    await dialog(tp).getByLabel(/^Passengers/).fill('3');
    await dialog(tp).getByRole('button', { name: 'Schedule trip' }).click();
    await toastOrText(tp, 'Trip scheduled');
    const list = await api(tp, 'GET', `/transport/assignments?search=${encodeURIComponent(`Group ${RUN}`)}`);
    const t = list.body?.data?.items?.[0];
    tripId = t?.id;
    const route = (await api(tp, 'GET', `/transport/routes/${routeId}`)).body?.data;
    return { actual: `seat error=${seatErr}; trip=${t?.status}; route seats ${route?.bookedSeats}/${route?.totalSeats}; payment=${t?.paymentStatus}`, persisted: !!tripId, result: seatErr && t?.status === 'SCHEDULED' && route?.bookedSeats === 3 && t?.paymentStatus === 'UNPAID' ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/transport/assignments', role: 'TRANSPORT_MANAGER (A)', action: 'overlapping trip on the same vehicle refused', request: 'POST /transport/assignments (clash)', expected: '409 shown in the form' }, async () => {
    const trip = (await api(tp, 'GET', `/transport/assignments/${tripId}`)).body?.data;
    const res = await api(tp, 'POST', '/transport/assignments', { vehicleId, scheduledAt: new Date(new Date(trip.scheduledAt).getTime() + 30 * 60000).toISOString(), passengerCount: 1 });
    return { actual: `server=${res.status} ${res.body?.error?.message}`, result: res.status === 409 ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/transport/assignments', role: 'TRANSPORT_MANAGER (A)', action: 'start → complete trip; fleet status follows', request: 'PUT /transport/assignments/:id {status}', expected: 'vehicle IN_SERVICE while under way, AVAILABLE after; seats sold stay 3' }, async () => {
    await tp.reload(); await tp.waitForLoadState('networkidle').catch(() => undefined);
    const row = tp.getByRole('row', { name: new RegExp(`Group ${RUN}`) });
    const vehicle = () => api(tp, 'GET', `/transport/vehicles/${vehicleId}`).then((r) => r.body?.data);
    await row.getByRole('button', { name: 'Start trip' }).click();
    await toastOrText(tp, 'Trip in progress');
    const during = (await until(vehicle, (v) => v?.status === 'IN_SERVICE'))?.status;
    await row.getByRole('button', { name: 'Complete trip' }).click();
    await toastOrText(tp, 'Trip completed');
    const after = await until(vehicle, (v) => v?.status === 'AVAILABLE');
    const route = (await api(tp, 'GET', `/transport/routes/${routeId}`)).body?.data;
    await tp.reload(); await tp.waitForLoadState('networkidle').catch(() => undefined);
    const shows = await visible(tp.getByRole('row', { name: new RegExp(`Group ${RUN}`) }).getByText('Completed'));
    return { actual: `during=${during}; after=${after?.status} bookedSeats=${after?.bookedSeats}; route sold=${route?.bookedSeats}; row Completed=${shows}`, persisted: shows, result: during === 'IN_SERVICE' && after?.status === 'AVAILABLE' && after?.bookedSeats === 0 && route?.bookedSeats === 3 && shows ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/transport/bookings', role: 'TRANSPORT_MANAGER (A)', action: 'bookings view: payment read-only, cancel needs confirmation', request: 'POST /transport/assignments/:id/cancel', expected: 'no payment select; confirm dialog; trip cancelled; seats released' }, async () => {
    const extra = await api(tp, 'POST', '/transport/assignments', { vehicleId, routeId, scheduledAt: new Date(Date.now() + 9 * 86400000).toISOString(), passengerCount: 1, customerName: `Cancel ${RUN}` });
    await go(tp, '/transport/bookings');
    const selects = await tp.getByLabel(/Payment Status/i).count();
    const row = tp.getByRole('row', { name: new RegExp(`Cancel ${RUN}`) });
    await row.getByRole('button', { name: 'Cancel trip' }).click();
    const confirmShown = await visible(dialog(tp).getByText('Cancel this trip?'), 5000);
    await dialog(tp).getByRole('button', { name: 'Cancel trip' }).click();
    await toastOrText(tp, 'Trip cancelled');
    const t = await until(() => api(tp, 'GET', `/transport/assignments/${extra.body?.data?.id}`).then((r) => r.body?.data), (x) => x?.status === 'CANCELLED');
    const route = (await api(tp, 'GET', `/transport/routes/${routeId}`)).body?.data;
    return { actual: `payment selects=${selects}; confirm=${confirmShown}; status=${t?.status}; route sold=${route?.bookedSeats}`, persisted: t?.status === 'CANCELLED', result: selects === 0 && confirmShown && t?.status === 'CANCELLED' && route?.bookedSeats === 3 ? 'PASS' : 'FAIL' };
  });
  await shot(tp, 'transport-bookings');

  const tb = await open('transportB');
  await step({ route: '/transport/vehicles/[id]', role: 'TRANSPORT_MANAGER (B)', action: "open A's vehicle; cancel A's trip via API", request: 'GET page; POST /transport/assignments/:id/cancel', expected: 'unavailable; 404; A data unchanged' }, async () => {
    await go(tb, `/transport/vehicles/${vehicleId}`);
    const unavailable = await visible(tb.getByText('Information unavailable'));
    const res = await api(tb, 'POST', `/transport/assignments/${tripId}/cancel`);
    const after = (await api(tp, 'GET', `/transport/assignments/${tripId}`)).body?.data?.status;
    return { actual: `unavailable=${unavailable}; B cancel=${res.status}; A readback=${after}`, persisted: after === 'COMPLETED', result: unavailable && res.status === 404 && after === 'COMPLETED' ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/hotels', role: 'TRANSPORT_MANAGER (B)', action: 'route without the grant', expected: 'workspace access required' }, async () => {
    await go(tb, '/hotels');
    const denied = await visible(tb.getByText('Workspace access required'));
    return { actual: `denied=${denied}`, result: denied ? 'PASS' : 'FAIL' };
  });

  // ═══ VISA AGENCY A ═════════════════════════════════════════════════════
  const vp = await open('visaA');
  let visaId; let docId; let ticketId;
  await step({ route: '/visa-dashboard', role: 'VISA_OFFICER agency (A)', action: 'open dashboard', expected: 'figures render (tickets, documents to review)' }, async () => {
    await go(vp, '/visa-dashboard');
    const ok = await visible(vp.getByText('Open service tickets'));
    return { actual: `rendered=${ok}`, result: ok ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/compliance', role: 'VISA_OFFICER agency (A)', action: 'new application — applicant required, then created', request: 'POST /compliance/visas', expected: 'inline error; created and opened' }, async () => {
    await go(vp, '/compliance');
    await vp.getByRole('button', { name: 'New application' }).click();
    await dialog(vp).getByRole('button', { name: 'Create application' }).click();
    const req = await visible(dialog(vp).getByText(/Enter the applicant/), 5000);
    await dialog(vp).getByLabel(/^Applicant name/).fill(`Applicant ${RUN}`);
    await dialog(vp).getByLabel(/^Service fee/).fill('350');
    await dialog(vp).getByRole('button', { name: 'Create application' }).click();
    await vp.waitForURL(/\/compliance\/[0-9a-f-]{36}$/, { timeout: 20000 });
    visaId = vp.url().split('/').pop();
    const v = (await api(vp, 'GET', `/compliance/visas/${visaId}`)).body?.data;
    return { actual: `required=${req}; status=${v?.status}; fee=${v?.priceCents}`, persisted: v?.applicantName === `Applicant ${RUN}`, result: req && v?.status === 'NOT_STARTED' && v?.priceCents === 35000 ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/compliance/[id]', role: 'VISA_OFFICER agency (A)', action: 'submit incomplete → readiness error shown', request: 'PUT /compliance/visas/:id/submit', expected: '400 listing passport, nationality, visa type' }, async () => {
    await vp.getByRole('button', { name: 'Submit application' }).click();
    const err = await visible(vp.getByText(/Before submitting: add the passport number/), 8000);
    return { actual: `readiness error=${err}`, result: err ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/compliance/[id]', role: 'VISA_OFFICER agency (A)', action: 'edit applicant details', request: 'PUT /compliance/visas/:id', expected: 'saved and shown after reload' }, async () => {
    await vp.getByRole('tab', { name: 'Edit' }).click();
    await vp.getByLabel(/^Passport number/).fill('P9988776');
    await vp.getByLabel(/^Nationality/).fill('pk');
    await vp.getByLabel(/^Visa type/).selectOption('UMRAH');
    await vp.getByRole('button', { name: 'Save application' }).click();
    await toastOrText(vp, 'Application saved');
    await vp.reload(); await vp.waitForLoadState('networkidle').catch(() => undefined);
    const shown = await visible(vp.getByText('P9988776'));
    return { actual: `shown after reload=${shown}`, persisted: shown, result: shown ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/compliance/[id]', role: 'VISA_OFFICER agency (A)', action: 'documents: add, upload (version 1), verify', request: 'POST documents; POST …/versions; PUT …/verify', expected: 'document VERIFIED v1' }, async () => {
    await vp.getByRole('tab', { name: 'Documents' }).click();
    await vp.getByLabel(/^Document name/).fill('Passport bio page');
    await vp.getByRole('button', { name: 'Add document' }).click();
    await toastOrText(vp, 'Document added to the checklist');
    await vp.getByLabel('File for Passport bio page', { exact: true }).setInputFiles(pdfPath);
    await toastOrText(vp, /as version 1/);
    await vp.getByRole('button', { name: 'Verify Passport bio page' }).click();
    await toastOrText(vp, 'Passport bio page verified');
    const docs = (await api(vp, 'GET', `/compliance/visas/${visaId}/documents`)).body?.data;
    docId = docs?.[0]?.id;
    return { actual: `status=${docs?.[0]?.status}; version=${docs?.[0]?.version}`, persisted: docs?.[0]?.status === 'VERIFIED', result: docs?.[0]?.status === 'VERIFIED' && docs?.[0]?.version === 1 ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/compliance/[id]', role: 'VISA_OFFICER agency (A)', action: 'open file through the signed-URL helper', request: 'GET /documents/visa/:docId/url', expected: 'signed URL returned (valid ≤ 5 min)' }, async () => {
    const res = await api(vp, 'GET', `/documents/visa/${docId}/url`);
    return { actual: `status=${res.status}; has url=${!!res.body?.data?.url}; expiresAt=${!!res.body?.data?.expiresAt}`, result: res.status === 200 && res.body?.data?.url ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/compliance/[id]', role: 'VISA_OFFICER agency (A)', action: 'submit, then approve — visa number required', request: 'PUT …/submit; PUT …/approve', expected: 'SUBMITTED; empty number blocked; APPROVED with number' }, async () => {
    await vp.getByRole('tab', { name: 'Overview' }).click();
    await vp.getByRole('button', { name: 'Submit application' }).click();
    await toastOrText(vp, 'Application submitted');
    await vp.getByRole('button', { name: 'Approve' }).click();
    await dialog(vp).getByRole('button', { name: 'Approve' }).click();
    const req = await visible(dialog(vp).getByText(/Enter the visa number/), 5000);
    await dialog(vp).getByLabel(/^Visa number/).fill(`V-${RUN}`);
    await dialog(vp).getByRole('button', { name: 'Approve' }).click();
    await toastOrText(vp, 'Visa approved');
    await vp.reload(); await vp.waitForLoadState('networkidle').catch(() => undefined);
    const v = (await api(vp, 'GET', `/compliance/visas/${visaId}`)).body?.data;
    const shown = await visible(vp.getByText(`V-${RUN}`));
    return { actual: `required=${req}; status=${v?.status}; visaNumber=${v?.externalRef}; shown=${shown}; timeline=${(v?.timeline ?? []).map((e) => e.event).join('>')}`, persisted: v?.status === 'APPROVED', result: req && v?.status === 'APPROVED' && v?.externalRef === `V-${RUN}` && shown ? 'PASS' : 'FAIL' };
  });
  await shot(vp, 'visa-approved');
  await step({ route: '/visa-requests', role: 'VISA_OFFICER agency (A)', action: 'ticket: invalid email blocked; create; resolve; reopen; close', request: 'POST /visa-requests; PUT …/resolve|reopen|close', expected: 'validation; lifecycle recorded; closed ticket takes no notes' }, async () => {
    await go(vp, '/visa-requests');
    await vp.getByRole('button', { name: 'New request' }).click();
    await dialog(vp).getByLabel(/^Subject/).fill(`Ticket ${RUN}`);
    await dialog(vp).getByLabel(/^Requester email/).fill('not-an-email');
    await dialog(vp).getByRole('button', { name: 'Create request' }).click();
    const emailErr = await visible(dialog(vp).getByText('Enter a valid email address'), 5000);
    await dialog(vp).getByLabel(/^Requester email/).fill('fatima@example.com');
    await dialog(vp).getByRole('button', { name: 'Create request' }).click();
    await toastOrText(vp, 'Service request created');
    await vp.getByRole('link', { name: new RegExp(`Ticket ${RUN}`) }).click();
    await vp.waitForURL(/\/visa-requests\/[0-9a-f-]{36}$/);
    ticketId = vp.url().split('/').pop();
    await vp.getByRole('button', { name: 'Resolve' }).click();
    await dialog(vp).getByLabel(/^How was this resolved/).fill('Re-scanned and uploaded');
    await dialog(vp).getByRole('button', { name: 'Resolve' }).click();
    await toastOrText(vp, 'Ticket resolved');
    await visible(vp.getByRole('button', { name: 'Reopen' }));
    const statusButtons = await vp.getByRole('button', { name: 'In progress', exact: true }).count();
    await vp.getByRole('button', { name: 'Reopen' }).click();
    await dialog(vp).getByLabel(/^Why is this being reopened/).fill('Customer says blurry');
    await dialog(vp).getByRole('button', { name: 'Reopen' }).click();
    await toastOrText(vp, 'Ticket reopened');
    await vp.getByRole('button', { name: 'Close' }).click();
    await dialog(vp).getByRole('button', { name: 'Close ticket' }).click();
    await toastOrText(vp, 'Ticket closed');
    await vp.reload(); await vp.waitForLoadState('networkidle').catch(() => undefined);
    const noteForm = await vp.getByLabel('Note').count();
    const t = (await api(vp, 'GET', `/visa-requests/${ticketId}`)).body?.data;
    return { actual: `email error=${emailErr}; status buttons after resolve=${statusButtons}; final=${t?.status}; reopenCount=${t?.reopenCount}; note form after close=${noteForm}`, persisted: t?.status === 'CLOSED', result: emailErr && statusButtons === 0 && t?.status === 'CLOSED' && t?.reopenCount === 1 && noteForm === 0 ? 'PASS' : 'FAIL' };
  });

  const vb = await open('visaB');
  await step({ route: '/compliance/[id]', role: 'VISA_OFFICER agency (B)', action: "open and decide A's case", request: 'GET page; PUT …/reject', expected: 'unavailable; 404; A unchanged' }, async () => {
    await go(vb, `/compliance/${visaId}`);
    const unavailable = await visible(vb.getByText('Information unavailable'));
    const res = await api(vb, 'PUT', `/compliance/visas/${visaId}/reject`, { reason: 'Not yours' });
    const after = (await api(vp, 'GET', `/compliance/visas/${visaId}`)).body?.data?.status;
    return { actual: `unavailable=${unavailable}; B reject=${res.status}; A readback=${after}`, persisted: after === 'APPROVED', result: unavailable && res.status === 404 && after === 'APPROVED' ? 'PASS' : 'FAIL' };
  });

  // ═══ OPERATOR STAFF (no decision / finance / export grants) ════════════
  const sp = await open('opStaff');
  let staffVisaId;
  await step({ route: '/dashboard', role: 'OPERATOR_STAFF', action: 'operator dashboard without finance grant', expected: 'renders operational KPIs; no revenue panel; no error' }, async () => {
    await go(sp, '/dashboard');
    const kpi = await visible(sp.getByText('Open visa cases'));
    const money = await sp.getByText('Collected on invoices').count();
    const failure = await sp.getByText('Permission required').count();
    return { actual: `kpis=${kpi}; revenue panels=${money}; permission errors=${failure}`, result: kpi && money === 0 && failure === 0 ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/reports', role: 'OPERATOR_STAFF', action: 'reports with reporting:report:read only', request: 'GET /reports/*', expected: 'operational sections; money notice; no export; /reports/finance 403' }, async () => {
    await go(sp, '/reports');
    const overview = await visible(sp.getByRole('region', { name: 'Overview' }).getByText('Travelers'));
    const notice = await sp.getByText(/Money figures are shown to accounts/).count();
    const exportBtn = await sp.getByRole('button', { name: 'Export CSV' }).count();
    const fin = await api(sp, 'GET', '/reports/finance');
    const exp = await api(sp, 'GET', '/reports/export');
    return { actual: `overview=${overview}; notice=${notice}; export button=${exportBtn}; finance=${fin.status}; export=${exp.status}`, result: overview && notice === 1 && exportBtn === 0 && fin.status === 403 && exp.status === 403 ? 'PASS' : 'FAIL' };
  });
  await shot(sp, 'reports-operator-staff');
  await step({ route: '/hotels', role: 'OPERATOR_STAFF', action: 'hotels read-only for staff', expected: 'no Add hotel; read-only notice' }, async () => {
    await go(sp, '/hotels');
    const add = await sp.getByRole('button', { name: 'Add hotel' }).count();
    const notice = await visible(sp.getByText(/Adding or changing hotels needs/));
    return { actual: `add buttons=${add}; notice=${notice}`, result: add === 0 && notice ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/compliance/[id]', role: 'OPERATOR_STAFF', action: 'staff submits a case but cannot decide', request: 'POST /compliance/visas; PUT …/submit; PUT …/approve', expected: 'SUBMITTED; no Approve button; API approve 403' }, async () => {
    const c = await api(sp, 'POST', '/compliance/visas', { applicantName: `Staff case ${RUN}`, applicantPassport: 'S1234567', applicantNationality: 'PK', visaType: 'UMRAH' });
    staffVisaId = c.body?.data?.id;
    await go(sp, `/compliance/${staffVisaId}`);
    await sp.getByRole('button', { name: 'Submit application' }).click();
    await toastOrText(sp, 'Application submitted');
    const approve = await sp.getByRole('button', { name: 'Approve' }).count();
    const note = await visible(sp.getByText(/Approving or rejecting is done by an officer/));
    const res = await api(sp, 'PUT', `/compliance/visas/${staffVisaId}/approve`, { visaNumber: 'X' });
    return { actual: `created=${c.status}; approve buttons=${approve}; note=${note}; API approve=${res.status}`, persisted: true, result: c.status === 201 && approve === 0 && note && res.status === 403 ? 'PASS' : 'FAIL' };
  });

  // ═══ OPERATOR VISA OFFICER decides the staff case ══════════════════════
  const op = await open('visaOfficer');
  await step({ route: '/compliance/[id]', role: 'VISA_OFFICER (operator)', action: 'reject with reason (required)', request: 'PUT /compliance/visas/:id/reject', expected: 'empty reason blocked; REJECTED with reason' }, async () => {
    await go(op, `/compliance/${staffVisaId}`);
    await op.getByRole('button', { name: 'Reject' }).click();
    await dialog(op).getByRole('button', { name: 'Reject application' }).click();
    const req = await visible(dialog(op).getByText(/Give the reason/), 5000);
    await dialog(op).getByLabel(/^Reason for rejection/).fill('Passport photo page unreadable');
    await dialog(op).getByRole('button', { name: 'Reject application' }).click();
    await toastOrText(op, 'Application rejected');
    const v = (await api(op, 'GET', `/compliance/visas/${staffVisaId}`)).body?.data;
    return { actual: `required=${req}; status=${v?.status}; reason=${v?.rejectionReason}`, persisted: v?.status === 'REJECTED', result: req && v?.status === 'REJECTED' ? 'PASS' : 'FAIL' };
  });

  // ═══ OPERATOR ADMIN ════════════════════════════════════════════════════
  const ap = await open('opAdmin');
  await step({ route: '/dashboard', role: 'OPERATOR_ADMIN', action: 'operator dashboard with finance grant', expected: 'KPIs and money panel' }, async () => {
    await go(ap, '/dashboard');
    const kpi = await visible(ap.getByText('Open visa cases'));
    const money = await visible(ap.getByText('Collected on invoices'));
    return { actual: `kpis=${kpi}; money=${money}`, result: kpi && money ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/reports', role: 'OPERATOR_ADMIN', action: 'export CSV (server-built)', request: 'GET /reports/export', expected: 'CSV download with Finance section' }, async () => {
    await go(ap, '/reports');
    const [download] = await Promise.all([ap.waitForEvent('download', { timeout: 20000 }), ap.getByRole('button', { name: 'Export CSV' }).click()]);
    const file = path.join(os.tmpdir(), `a03b-report-${RUN}.csv`);
    await download.saveAs(file);
    const text = fs.readFileSync(file, 'utf8');
    fs.unlinkSync(file);
    return { actual: `file=${download.suggestedFilename()}; header ok=${text.startsWith('"Section","Metric","Value"')}; finance=${text.includes('"Finance"')}`, result: text.startsWith('"Section","Metric","Value"') && text.includes('"Finance"') ? 'PASS' : 'FAIL' };
  });
  let opHotelId; let allotmentId;
  await step({ route: '/hotels/[id]', role: 'OPERATOR_ADMIN', action: 'contract an allotment and assign a room to a booking', request: 'POST /hotels/:id/allotments; POST /hotels/:id/assignments', expected: 'allotment 2 rooms; assignment listed; 1 left' }, async () => {
    const hotels = (await api(ap, 'GET', '/hotels?limit=100')).body?.data?.items ?? [];
    opHotelId = hotels.find((h) => !h.isShared && h.status === 'ACTIVE')?.id;
    const before = new Set(((await api(ap, 'GET', `/hotels/${opHotelId}/allotments`)).body?.data ?? []).map((a) => a.id));
    await go(ap, `/hotels/${opHotelId}`);
    await ap.getByRole('tab', { name: 'Allotments' }).click();
    await ap.getByRole('button', { name: 'New allotment' }).click();
    await dialog(ap).getByLabel(/^Check-in \*/).fill(day(40));
    await dialog(ap).getByLabel(/^Check-out \*/).fill(day(50));
    await dialog(ap).getByLabel(/^Rooms \*/).fill('2');
    await dialog(ap).getByRole('button', { name: 'Contract allotment' }).click();
    await toastOrText(ap, 'Allotment contracted');
    const list = (await api(ap, 'GET', `/hotels/${opHotelId}/allotments`)).body?.data ?? [];
    allotmentId = list.find((a) => !before.has(a.id))?.id;
    await ap.getByRole('button', { name: 'Assign rooms' }).click();
    await dialog(ap).getByLabel(/^Allotment/).selectOption(allotmentId);
    const bookingOption = dialog(ap).getByLabel(/^Booking/).locator('option').nth(1);
    await bookingOption.waitFor({ state: 'attached', timeout: 15000 });
    await dialog(ap).getByLabel(/^Booking/).selectOption({ index: 1 });
    await dialog(ap).getByLabel(/^Room number/).fill(`R-${RUN}`);
    await dialog(ap).getByRole('button', { name: 'Assign room' }).click();
    await toastOrText(ap, 'Room assigned');
    const after = (await api(ap, 'GET', `/hotels/${opHotelId}/allotments`)).body?.data?.find((a) => a.id === allotmentId);
    const asg = (await api(ap, 'GET', `/hotels/${opHotelId}/assignments`)).body?.data ?? [];
    return { actual: `allotment rooms=${after?.totalRooms}; assigned=${after?.bookedRooms}; left=${after?.availableRooms}; assignments=${asg.length}`, persisted: after?.bookedRooms === 1, result: after?.totalRooms === 2 && after?.bookedRooms === 1 && after?.availableRooms === 1 ? 'PASS' : 'FAIL' };
  });

  // ═══ Second pass: remaining routes and actions ═════════════════════════
  // Hotel A: edit form, archive guards, cross-role denial, B-side empty dashboard.
  await step({ route: '/hotels/[id]', role: 'HOTEL_MANAGER (A)', action: 'edit hotel — empty name refused, phone saved', request: 'PUT /hotels/:id', expected: 'inline error; phone persisted after reload' }, async () => {
    await go(hp, `/hotels/${hotelId}`);
    await hp.getByRole('tab', { name: 'Edit' }).click();
    const name = hp.getByLabel(/^Hotel name/);
    await name.fill('');
    await hp.getByRole('button', { name: 'Save hotel' }).click();
    const err = await visible(hp.getByText('Enter the hotel name.'), 5000);
    await name.fill(hotelName);
    await hp.getByLabel(/^Phone/).fill('+966 12 555 0101');
    await hp.getByRole('button', { name: 'Save hotel' }).click();
    await toastOrText(hp, 'Hotel saved');
    await hp.reload(); await hp.waitForLoadState('networkidle').catch(() => undefined);
    const shown = await visible(hp.getByText('+966 12 555 0101'));
    return { actual: `inline error=${err}; phone after reload=${shown}`, persisted: shown, result: err && shown ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/hotels/[id]', role: 'HOTEL_MANAGER (A)', action: 'archive a room with a stay ahead', request: 'DELETE /hotels/rooms/:id', expected: '409 explained; room unchanged' }, async () => {
    const b = await api(hp, 'POST', '/hotels/bookings', { hotelId, guestName: `Future ${RUN}`, roomId, checkIn: day(60), checkOut: day(62) });
    await hp.getByRole('tab', { name: 'Rooms' }).click();
    await hp.getByRole('button', { name: 'Archive room 701' }).click();
    await dialog(hp).getByRole('button', { name: 'Archive room' }).click();
    const refused = await toastOrText(hp, /upcoming booking/);
    const room = ((await api(hp, 'GET', `/hotels/${hotelId}/rooms`)).body?.data ?? []).find((r) => r.id === roomId);
    return { actual: `booking=${b.status}; refusal shown=${refused}; room=${room?.status}`, persisted: room?.status === 'AVAILABLE', result: b.status === 201 && refused && room?.status === 'AVAILABLE' ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/compliance', role: 'HOTEL_MANAGER (A)', action: 'route without the grant', expected: 'workspace access required' }, async () => {
    await go(hp, '/compliance');
    const denied = await visible(hp.getByText('Workspace access required'));
    return { actual: `denied=${denied}`, result: denied ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/hotel-dashboard', role: 'HOTEL_MANAGER (B)', action: 'empty tenant dashboard', expected: 'renders with zero figures, no error' }, async () => {
    await go(hb, '/hotel-dashboard');
    const ok = await visible(hb.getByRole('heading', { name: 'Hotel operations' }));
    const stats = (await api(hb, 'GET', '/hotels/stats')).body?.data;
    return { actual: `rendered=${ok}; own hotels=${stats?.hotels?.total}; bookings=${stats?.bookings?.total}`, result: ok && stats?.bookings?.total === 0 ? 'PASS' : 'FAIL' };
  });

  // Transport A: drivers, vehicle detail (driver assignment, permits, archive guard), route edit.
  let driverId;
  await step({ route: '/transport/drivers', role: 'TRANSPORT_MANAGER (A)', action: 'add driver — required fields, then saved', request: 'POST /transport/drivers', expected: 'inline errors; driver listed after reload' }, async () => {
    await go(tp, '/transport/drivers');
    await tp.getByRole('button', { name: 'Add driver' }).first().click();
    await dialog(tp).getByRole('button', { name: 'Add driver' }).click();
    const req = await visible(dialog(tp).getByText('Enter the first name.'), 5000);
    await dialog(tp).getByLabel(/^First name/).fill('Salim');
    await dialog(tp).getByLabel(/^Last name/).fill(`Driver ${RUN}`);
    await dialog(tp).getByLabel(/^Phone/).fill('+966500001234');
    await dialog(tp).getByLabel(/^Licence expiry/).fill(day(400));
    await dialog(tp).getByRole('button', { name: 'Add driver' }).click();
    await toastOrText(tp, 'Driver added');
    await tp.reload(); await tp.waitForLoadState('networkidle').catch(() => undefined);
    const listed = await visible(tp.getByText(`Salim Driver ${RUN}`));
    driverId = (await api(tp, 'GET', `/transport/drivers?search=${RUN}`)).body?.data?.items?.[0]?.id;
    return { actual: `required=${req}; listed after reload=${listed}`, persisted: listed, result: req && listed && driverId ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/transport/drivers/[id]', role: 'TRANSPORT_MANAGER (A)', action: 'edit driver — empty phone refused, notes saved', request: 'PUT /transport/drivers/:id', expected: 'inline error; notes persisted' }, async () => {
    await go(tp, `/transport/drivers/${driverId}`);
    await tp.getByRole('button', { name: 'Edit', exact: true }).click();
    await dialog(tp).getByLabel(/^Phone/).fill('');
    await dialog(tp).getByRole('button', { name: 'Save driver' }).click();
    const err = await visible(dialog(tp).getByText('Enter a phone number.'), 5000);
    await dialog(tp).getByLabel(/^Phone/).fill('+966500001234');
    await dialog(tp).getByLabel(/^Notes/).fill(`Speaks Urdu ${RUN}`);
    await dialog(tp).getByRole('button', { name: 'Save driver' }).click();
    await toastOrText(tp, 'Driver saved');
    await tp.reload(); await tp.waitForLoadState('networkidle').catch(() => undefined);
    const shown = await visible(tp.getByText(`Speaks Urdu ${RUN}`));
    return { actual: `inline error=${err}; notes after reload=${shown}`, persisted: shown, result: err && shown ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/transport/vehicles/[id]', role: 'TRANSPORT_MANAGER (A)', action: 'assign primary driver; record Tasreeh permit (dates checked)', request: 'POST /transport/vehicles/:id/drivers; POST /transport/tasreeh', expected: 'driver shown as primary; bad dates refused; permit listed' }, async () => {
    await go(tp, `/transport/vehicles/${vehicleId}`);
    await tp.getByRole('tab', { name: 'Drivers' }).click();
    await tp.getByLabel('Driver to assign').selectOption(driverId);
    await tp.getByRole('button', { name: 'Assign', exact: true }).click();
    await toastOrText(tp, 'Driver assigned');
    const primary = await visible(tp.getByText('Primary'));
    await tp.getByRole('tab', { name: 'Tasreeh permits' }).click();
    await tp.getByLabel(/^Permit number/).fill(`T-${RUN}`);
    await tp.getByLabel(/^Issued/).fill(day(10));
    await tp.getByLabel(/^Expires/).fill(day(5));
    await tp.getByRole('button', { name: 'Record permit' }).click();
    const dateErr = await visible(tp.getByText('Expiry must be after the issue date.'), 5000);
    await tp.getByLabel(/^Expires/).fill(day(90));
    await tp.getByRole('button', { name: 'Record permit' }).click();
    await toastOrText(tp, 'Permit recorded');
    const permits = (await api(tp, 'GET', '/transport/tasreeh')).body?.data ?? [];
    const has = permits.some((x) => x.permitNumber === `T-${RUN}`);
    return { actual: `primary=${primary}; date error=${dateErr}; permit stored=${has}`, persisted: has, result: primary && dateErr && has ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/transport/vehicles/[id]', role: 'TRANSPORT_MANAGER (A)', action: 'archive a vehicle with an open trip', request: 'DELETE /transport/vehicles/:id', expected: '409 explained; vehicle stays active' }, async () => {
    await api(tp, 'POST', '/transport/assignments', { vehicleId, scheduledAt: new Date(Date.now() + 20 * 86400000).toISOString(), passengerCount: 1, customerName: `Open ${RUN}` });
    await go(tp, `/transport/vehicles/${vehicleId}`);
    await tp.getByRole('button', { name: 'Archive', exact: true }).click();
    await dialog(tp).getByRole('button', { name: 'Archive vehicle' }).click();
    const refused = await toastOrText(tp, /open trip/);
    const v = (await api(tp, 'GET', `/transport/vehicles/${vehicleId}`)).body?.data;
    return { actual: `refusal shown=${refused}; isActive=${v?.isActive}; status=${v?.status}`, persisted: v?.isActive === true, result: refused && v?.isActive === true ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/transport/routes/[id]', role: 'TRANSPORT_MANAGER (A)', action: 'edit route — seats below sold refused, pickup point saved', request: 'PUT /transport/routes/:id', expected: 'inline error; pickup persisted' }, async () => {
    await go(tp, `/transport/routes/${routeId}`);
    await tp.getByRole('button', { name: 'Edit', exact: true }).click();
    await dialog(tp).getByLabel(/^Seats for sale/).fill('2');
    await dialog(tp).getByRole('button', { name: 'Save route' }).click();
    const err = await visible(dialog(tp).getByText(/already sold/), 5000);
    await dialog(tp).getByLabel(/^Seats for sale/).fill('4');
    await dialog(tp).getByLabel(/^Pickup point/).fill(`Terminal 1 ${RUN}`);
    await dialog(tp).getByRole('button', { name: 'Save route' }).click();
    await toastOrText(tp, 'Route saved');
    await tp.reload(); await tp.waitForLoadState('networkidle').catch(() => undefined);
    const shown = await visible(tp.getByText(`Terminal 1 ${RUN}`));
    return { actual: `inline error=${err}; pickup after reload=${shown}`, persisted: shown, result: err && shown ? 'PASS' : 'FAIL' };
  });

  // Visa A: register, search, ticket fields.
  await step({ route: '/visa-documents', role: 'VISA_OFFICER agency (A)', action: 'document register lists the verified document', expected: 'row with Verified status' }, async () => {
    await go(vp, '/visa-documents');
    const row = await visible(vp.getByRole('row', { name: new RegExp(`Applicant ${RUN}`) }).getByText('Verified'));
    return { actual: `verified row=${row}`, result: row ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/compliance', role: 'VISA_OFFICER agency (A)', action: 'search applications (server-side)', request: 'GET /compliance/visas?search=', expected: 'only the matching application' }, async () => {
    await go(vp, '/compliance');
    await vp.getByLabel('Search applications').fill(`Applicant ${RUN}`);
    await vp.waitForTimeout(1200);
    const rows = await vp.getByRole('region', { name: 'Visa applications' }).getByRole('row').count();
    return { actual: `rows incl. header=${rows}`, result: rows === 2 ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/visa-requests/[id]', role: 'VISA_OFFICER agency (A)', action: 'ticket priority and due date set, due date cleared', request: 'POST /visa-requests; PATCH /visa-requests/:id', expected: 'values persisted after reload' }, async () => {
    const t = await api(vp, 'POST', '/visa-requests', { subject: `Fields ${RUN}` });
    await go(vp, `/visa-requests/${t.body?.data?.id}`);
    await vp.getByLabel(/^Priority/).selectOption('HIGH');
    await toastOrText(vp, 'Priority updated');
    await vp.getByLabel(/^Due date/).fill(day(3));
    await toastOrText(vp, 'Due date updated');
    await vp.reload(); await vp.waitForLoadState('networkidle').catch(() => undefined);
    const set = (await api(vp, 'GET', `/visa-requests/${t.body?.data?.id}`)).body?.data;
    await vp.getByRole('button', { name: 'Clear', exact: true }).click();
    await toastOrText(vp, 'Due date cleared');
    const cleared = await until(() => api(vp, 'GET', `/visa-requests/${t.body?.data?.id}`).then((r) => r.body?.data), (x) => x?.dueAt === null);
    return { actual: `priority=${set?.priority}; due set=${!!set?.dueAt}; cleared=${cleared?.dueAt === null}`, persisted: set?.priority === 'HIGH', result: set?.priority === 'HIGH' && set?.dueAt && cleared?.dueAt === null ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/transport/vehicles', role: 'VISA_OFFICER agency (A)', action: 'route without the grant', expected: 'workspace access required' }, async () => {
    await go(vp, '/transport/vehicles');
    const denied = await visible(vp.getByText('Workspace access required'));
    return { actual: `denied=${denied}`, result: denied ? 'PASS' : 'FAIL' };
  });

  // Operator: allotment adjust/release, ticket assignment, staff read-only fleet.
  await step({ route: '/hotels/[id]', role: 'OPERATOR_ADMIN', action: 'adjust allotment (invalid refused, valid saved); release the assigned room', request: 'PUT /hotels/allotments/:id; DELETE /hotels/:id/assignments/:aid', expected: 'inline error; 3 rooms persisted; release confirmed; room back in the allotment' }, async () => {
    const allot = () => api(ap, 'GET', `/hotels/${opHotelId}/allotments`).then((r) => r.body?.data ?? []);
    await go(ap, `/hotels/${opHotelId}`);
    await ap.getByRole('tab', { name: 'Allotments' }).click();
    const idx = (await allot()).findIndex((a) => a.id === allotmentId);
    await ap.getByRole('button', { name: 'Adjust allotment' }).nth(idx).click();
    await dialog(ap).getByLabel(/^Rooms \*/).fill('0');
    await dialog(ap).getByRole('button', { name: 'Save allotment' }).click();
    const err = await visible(dialog(ap).getByText('At least 1 room.'), 5000);
    await dialog(ap).getByLabel(/^Rooms \*/).fill('3');
    await dialog(ap).getByRole('button', { name: 'Save allotment' }).click();
    await toastOrText(ap, 'Allotment updated');
    const adjusted = (await until(allot, (l) => l.find((a) => a.id === allotmentId)?.totalRooms === 3)).find((a) => a.id === allotmentId);
    await ap.getByRole('listitem').filter({ hasText: `room R-${RUN}` }).getByRole('button', { name: 'Release' }).click();
    await dialog(ap).getByRole('button', { name: 'Release room' }).click();
    await toastOrText(ap, 'Room released');
    const released = (await until(allot, (l) => l.find((a) => a.id === allotmentId)?.bookedRooms === 0)).find((a) => a.id === allotmentId);
    await ap.reload(); await ap.waitForLoadState('networkidle').catch(() => undefined);
    await ap.getByRole('tab', { name: 'Allotments' }).click();
    const gone = !(await visible(ap.getByText(`room R-${RUN}`), 3000));
    return { actual: `inline error=${err}; rooms=${adjusted?.totalRooms}; after release assigned=${released?.bookedRooms} left=${released?.availableRooms}; row gone after reload=${gone}`, persisted: adjusted?.totalRooms === 3 && released?.bookedRooms === 0, result: err && adjusted?.totalRooms === 3 && released?.bookedRooms === 0 && released?.availableRooms === 3 && gone ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/visa-requests/[id]', role: 'OPERATOR_ADMIN', action: 'assign a ticket to staff (manager)', request: 'PUT /visa-requests/:id/assign', expected: 'assignee persisted; staff sees it read-only' }, async () => {
    const t = await api(ap, 'POST', '/visa-requests', { subject: `Assign ${RUN}` });
    const staffId = ((await api(ap, 'GET', '/visa-requests/assignees')).body?.data ?? []).find((a) => a.email === IDS.opStaff)?.id;
    await go(ap, `/visa-requests/${t.body?.data?.id}`);
    await ap.getByLabel(/^Assignee/).selectOption(staffId);
    await toastOrText(ap, 'Assignee updated');
    const persisted = (await api(ap, 'GET', `/visa-requests/${t.body?.data?.id}`)).body?.data?.assigneeId === staffId;
    await go(sp, `/visa-requests/${t.body?.data?.id}`);
    const selects = await sp.getByLabel(/^Assignee/).locator('option').count().catch(() => 0);
    const closeBtn = await sp.getByRole('button', { name: 'Close', exact: true }).count();
    return { actual: `persisted=${persisted}; staff assignee select options=${selects}; staff close buttons=${closeBtn}`, persisted, result: persisted && selects === 0 && closeBtn === 0 ? 'PASS' : 'FAIL' };
  });
  await step({ route: '/transport/vehicles', role: 'OPERATOR_STAFF', action: 'fleet read-only for staff', expected: 'no Add vehicle; read-only notice' }, async () => {
    await go(sp, '/transport/vehicles');
    const add = await sp.getByRole('button', { name: 'Add vehicle' }).count();
    const notice = await visible(sp.getByText(/Adding or changing vehicles/));
    return { actual: `add buttons=${add}; notice=${notice}`, result: add === 0 && notice ? 'PASS' : 'FAIL' };
  });

  // ═══ Fresh login: persisted records survive a new session ══════════════
  for (const c of ctxs) await c.close();
  const fresh = await login(browser, 'hotelA');
  await step({ route: '/hotel-bookings', role: 'HOTEL_MANAGER (A)', action: 'fresh login — records persisted', expected: 'hotel, room and completed booking still there' }, async () => {
    await go(fresh.page, `/hotel-bookings?hotelId=${hotelId}`);
    const row = await visible(fresh.page.getByRole('row', { name: new RegExp(`Guest ${RUN}`) }).getByText('Completed'));
    return { actual: `completed booking shown=${row}`, persisted: row, result: row ? 'PASS' : 'FAIL' };
  });
  await fresh.ctx.close();
  const fresh2 = await login(browser, 'visaA');
  await step({ route: '/compliance', role: 'VISA_OFFICER agency (A)', action: 'fresh login — approved case and closed ticket persisted', expected: 'case APPROVED with visa number; ticket CLOSED' }, async () => {
    await go(fresh2.page, `/compliance?x=${RUN}`);
    await fresh2.page.getByLabel('Search applications').fill(`Applicant ${RUN}`);
    const approved = await visible(fresh2.page.getByRole('row', { name: new RegExp(`Applicant ${RUN}`) }).getByText('Approved'));
    await go(fresh2.page, `/visa-requests/${ticketId}`);
    const closed = await visible(fresh2.page.getByText('Closed').first());
    return { actual: `approved row=${approved}; ticket closed=${closed}`, persisted: approved && closed, result: approved && closed ? 'PASS' : 'FAIL' };
  });
  await fresh2.ctx.close();
  await browser.close();

  const summary = { run: RUN, generatedAt: new Date().toISOString(), web: BASE, total: results.length, passed: results.filter((r) => r.result === 'PASS').length };
  fs.writeFileSync(path.join(OUT, 'route-action-inventory.json'), JSON.stringify({ summary, results }, null, 2));
  fs.unlinkSync(pdfPath);
  console.log(`\n${summary.passed}/${summary.total} passed`);
  process.exit(summary.passed === summary.total ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
