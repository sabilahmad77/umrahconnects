/* A10 — travel plan after the invitation was accepted (supersedes the earlier pre-link checks). */
'use strict';
const L = require('./lib');
const R = new L.Recorder('travelplan');
const body = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
(async () => {
  R.reset();
  const browser = await L.launch();
  const A = await L.openIdentity(browser, 'travelerA');
  if ((await L.login(A)).outcome !== 'signed-in') throw new Error('travelerA sign-in failed');
  await A.page.goto(L.WEB + '/travel-plan'); await L.settle(A);
  const trips = L.firstArray((await L.api(A, 'GET', '/travelers/me/trips')).data);
  const txt = (await body(A.page)).toLowerCase();
  const orgs = trips.map((t) => t.organization?.name).filter(Boolean);
  const shown = orgs.filter((o) => txt.includes(o.toLowerCase()));
  const bookingRefs = trips.flatMap((t) => (t.bookings || []).map((b) => b.bookingRef)).filter(Boolean);
  const refsShown = bookingRefs.filter((r) => txt.includes(r.toLowerCase()));
  R.check(trips.length > 0 && shown.length === orgs.length && refsShown.length === bookingRefs.length, { area: 'travel-plan', route: '/travel-plan', role: 'travelerA', action: 'linked trips on the travel plan (supersedes traveler-0032)', expected: 'each linked organization and its booking reference shown', actual: `trips=${trips.length} organizations=${JSON.stringify(orgs)} shown=${shown.length}/${orgs.length} bookingRefs=${JSON.stringify(bookingRefs)} shown=${refsShown.length}/${bookingRefs.length}`, readback: 'GET /api/travelers/me/trips', screenshot: await L.shot(A.page, 'travel-plan-linked-trip') });
  const unlink = await A.page.getByRole('button', { name: /Unlink/i }).first().isVisible().catch(() => false);
  R.check(unlink, { area: 'travel-plan', route: '/travel-plan', role: 'travelerA', action: 'the traveler can end the link', expected: 'an Unlink control on the linked trip', actual: `unlink=${unlink}` });
  await A.page.reload(); await L.settle(A);
  const after = (await body(A.page)).toLowerCase();
  R.check(orgs.every((o) => after.includes(o.toLowerCase())), { area: 'travel-plan', route: '/travel-plan', role: 'travelerA', kind: 'persist', action: 'linked trip after refresh (supersedes traveler-0033)', expected: 'still shown', actual: orgs.map((o) => `${o}:${after.includes(o.toLowerCase())}`).join(' ') });
  const B = await L.openIdentity(browser, 'travelerB');
  if ((await L.login(B)).outcome === 'signed-in') {
    await B.page.goto(L.WEB + '/travel-plan'); await L.settle(B);
    const bt = (await body(B.page)).toLowerCase();
    const bTrips = L.firstArray((await L.api(B, 'GET', '/travelers/me/trips')).data);
    R.check(!orgs.some((o) => bt.includes(o.toLowerCase())) && !bTrips.some((t) => orgs.includes(t.organization?.name)), { area: 'travel-plan', route: '/travel-plan', role: 'travelerB', kind: 'tenant', action: "travelerB's plan shows only travelerB's own links (supersedes traveler-0034)", expected: "travelerA's organization is absent for travelerB", actual: `A=${JSON.stringify(orgs)} B trips=${bTrips.length} pageMentionsA=${orgs.some((o) => bt.includes(o.toLowerCase()))}`, readback: 'GET /api/travelers/me/trips', screenshot: await L.shot(B.page, 'travel-plan-b') });
  }
  await browser.close();
  console.log(`TOTAL travelplan: ${JSON.stringify(R.count)}`);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
