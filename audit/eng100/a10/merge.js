/* A10 — build docs/control-tower/evidence/eng100/a10/functional-matrix.json and SUMMARY.md
 * from every recorded batch. Run after each batch; it is idempotent.
 *
 * Rules:
 *  - a later row for the same (role, route, action) supersedes an earlier one (re-runs win);
 *  - rows marked "supersedes X" retire row X;
 *  - RECLASSIFIED holds checks whose first-run expectation was wrong in the harness, not in the
 *    product; each carries the reason and keeps the original result visible.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = '/Users/macbook/Projects/umrah-connects-integration';
const RUNTIME = path.join(process.env.TMPDIR || '/tmp', 'uc-a10');
const RESULTS = path.join(RUNTIME, 'results');
const EVID = path.join(ROOT, 'docs/control-tower/evidence/eng100/a10');
const STATE = path.join(RUNTIME, 'access-state.json');

/** Harness corrections: id → why the recorded evidence actually satisfies the intent. */
const RECLASSIFY = {
  'access:/social/groups/[id]:unknown-id': {
    match: (r) => r.area === 'access' && r.route === '/social/groups/[id]' && /This group is not available/.test(String(r.actual)),
    to: 'PASS',
    reason: 'The page shows its own clean refusal ("This group is not available — it is private and you are not a member, or it no longer exists"). The harness only accepted the generic "Information unavailable" state.',
  },
  'payments:sandbox-complete': {
    match: (r) => r.area === 'payments' && /complete the test payment/.test(r.action) && /Payment confirmed/.test(String(r.actual)),
    to: 'PASS',
    reason: 'The dialog says "Payment confirmed — the server recorded SAR 600.00 for this booking" and the next check reads back PAID/CONFIRMED. The harness success regex did not include "confirmed".',
  },
  'marketplace:double-cancel': {
    match: (r) => /double-click confirm cancel/.test(r.action) && /409/.test(String(r.actual)) && / 200/.test(String(r.actual)),
    to: 'PASS',
    reason: 'One cancel succeeded and the duplicate was refused with 409, which is the stated expectation; the harness compared them in arrival order. The missing client-side guard is reported once as DEF-005.',
  },
  'api-refusal:caller-scoped': {
    match: (r) => r.area === 'api-refusal' && r.result === 'FAIL' && /for a role the UI denies/.test(r.action) &&
      /(bookings\/mine|requests\/mine|groups\/mine|\/connections|social\/conversations|marketplace\/listings)/.test(r.action),
    to: 'PASS',
    reason: 'These endpoints are public or scoped to the caller, not to the page. The follow-up batch (refusal-review) confirmed every one of them returns only the caller\'s own records for these roles, which is what the route table documents ("the API scopes these to the caller; for anyone else they are empty pages").',
  },
  'api-refusal:reports-overview': {
    match: (r) => r.area === 'api-refusal' && r.result === 'FAIL' && r.route === '/dashboard' && /reports\/overview/.test(r.action),
    to: 'PASS',
    reason: '/reports/overview requires reporting:report:read, which these roles hold; the /dashboard page is denied for lack of crm:pilgrim:read. The API is consistent with its own policy.',
  },
  'pilgrims:invitation-cooldown': {
    match: (r) => /Resend the invitation/.test(r.action) && /409/.test(String(r.actual)),
    to: 'PASS',
    reason: 'The API applies a per-invitation cooldown and the workspace shows it ("This invitation was just sent…"), so the send count is unchanged by design. The harness expected an unconditional +1.',
  },
  'api-refusal:reports-policy': {
    match: (r) => r.area === 'api-refusal' && r.result === 'FAIL' && r.route === '/reports',
    to: 'FAIL',
    reason: 'Kept as a failure: tracked as DEF-002 (route rule requires finance:report:read while the API authorises these endpoints on reporting:report:read).',
  },
};

/** Rows retired because a later, better-formed batch covers the same check. */
const RETIRE = {
  'providers-0012': 'superseded by providers2 "add a driver" (the first batch used the wrong field names)',
  'providers-0013': 'superseded by providers2 "driver listed after refresh"',
  'providers-0017': 'superseded by providers2 "schedule a trip (vehicle + driver + route)"',
  'providers-0021': 'superseded by providers2 "double-click Create application"',
  'providers-0022': 'superseded by providers2 "create a visa application"',
  'providers-0027': 'superseded by visa-docs2, which probes agency B with DTO-valid bodies (404 on approve, reject and document version)',
  'visa-docs-0003': 'superseded by visa-docs3: a document with no file cannot be verified (correct refusal), and after uploading a version the verify/reject decisions succeed',
  'visa-docs-0004': 'superseded by visa-docs2 (the first probe was refused on DTO validation before authorisation, so it proved nothing)',
  'traveler-0008': 'superseded by the marketplace re-run, which compares the category badge instead of the option value',
  'traveler-0024': 'superseded by the checkout re-run',
  'admin-0008': 'superseded by admin-rerun: the rejection itself answered 200 and the founder saw KYC_REJECTED with the reviewer reason (admin-0009); only the readback field name was wrong',
  'admin-0014': 'superseded by admin-rerun "set the account status to INACTIVE" (the first batch never confirmed the modal)',
  'admin-0015': 'superseded by admin-rerun "sign in while the account is suspended"',
  'admin-0016': 'superseded by admin-rerun "restore the account status"',
  'admin-0017': 'superseded by admin-rerun "grant and revoke a role"',
  'admin-0002': 'superseded by the admin re-run, which ticks the required confirmation',
  'admin-0003': 'superseded by the admin re-run',
  'admin-0004': 'superseded by the admin re-run',
  'admin-0005': 'superseded by the admin re-run',
  'admin-0006': 'superseded by the admin re-run',
  'traveler-0011': 'superseded by the booking re-run, which completed the section',
  'traveler-0012': 'superseded by the checkout re-run, which completed the section',
  'traveler-0041': 'superseded by the connections re-run, which completed the section',
  'operator-rerun-pilgrims-invite-bookings-finance-reports-finance-manager-0031': 'superseded by the finance-manager re-run, which completed the section',
  'operator-0030': 'superseded by the finance-manager re-run',
  'operator-rerun-pilgrims-invite-bookings-finance-reports-finance-manager-0025': 'superseded by the finance re-run, which completed the refund and void steps',
  'operator-rerun-pilgrims-invite-bookings-finance-reports-finance-manager-0017': 'superseded by the bookings re-run, which completed the section',
  'operator-rerun-bookings-0007': 'superseded by the final bookings re-run',
  'operator-rerun-bookings-finance-finance-manager-0001': 'superseded by the final bookings re-run',
  'operator-rerun-bookings-0001': 'superseded by the final bookings re-run',
  'operator-0017': 'superseded by the bookings re-run',
  'operator-0022': 'superseded by the finance re-run',
  'operator-0007': 'superseded by the pilgrims re-run, which completed the section',
  'operator-0023': 'superseded by "reports page loads every report section" (the page has no tabs; every section loads at once)',
  'providers-0007': 'superseded by providers2 hotel-allotment, which completed the allotment step',
  'providers2-0014': 'superseded by visa-docs3 (document upload, verify and reject)',
  'providers2-rerun-visa-application-0002': 'superseded by visa-docs3 (document upload, verify and reject)',
  'visa-docs2-0001': 'superseded by visa-docs3: the version endpoint needs a multipart upload, which the UI performs (POST versions 201 → RECEIVED → VERIFIED → REJECTED)',
  'traveler-0010': 'superseded by the marketplace re-run, which completed the section',
  'traveler-0040': 'superseded by the social re-run, which completed the section',
  'traveler-rerun-marketplace-booking-checkout-social-connections-0038': 'superseded by the final social re-run',
  'auth-0022': 'superseded by mail-journeys: the verification link was obtained from A10’s own API instance and the journey completed',
  'auth-0024': 'superseded by mail-journeys: the reset link was obtained the same way and the journey completed',
  'admin-0020': 'superseded by the admin re-run, which completed the section',
  'mail-journeys-0009': 'superseded by travelplan, which compares the organisation name case-insensitively (the page renders it upper-case)',
  'mail-journeys-0010': 'superseded by travelplan "linked trip after refresh"',
};

/** Findings confirmed fixed on the rebuilt candidate; the original rows stay as recorded. */
const FIXED_AT = [
  { match: (r) => r.result === 'FAIL' && r.area === 'api-refusal' && r.route === '/requests' && /POST \/marketplace\/requests/.test(r.action),
    revision: '5875835', by: 'reverify: financeA and superAdmin now get 403 "Missing required permissions: marketplace:listing:read" and nothing is created; a traveler can still post one' },
  { match: (r) => r.result === 'FAIL' && r.route === '/reports' && ['api-refusal', 'access'].includes(r.area),
    revision: '5875835', by: 'reverify: /reports opens for visaA and operatorStaffA (menu entry back), money sections hidden, GET /reports/finance still 403' },
  { match: (r) => r.result === 'FAIL' && r.kind === 'double-submit',
    revision: '5875835', by: 'reverify: single-flight guard on the shared API client — one request and one record for pilgrim, hotel, vehicle, route, social post, chat message and preferences' },
];

function rows() {
  const out = [];
  for (const f of fs.readdirSync(RESULTS).filter((f) => f.endsWith('.jsonl') && !f.includes('.shots.'))) {
    for (const line of fs.readFileSync(path.join(RESULTS, f), 'utf8').trim().split('\n')) {
      if (!line.trim()) continue;
      try { const r = JSON.parse(line); r.batch = f.replace('.jsonl', ''); out.push(r); } catch {}
    }
  }
  return out.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function build() {
  const all = rows();
  // Supersede: explicit "(supersedes X)" and same (role|route|action) run later.
  const retired = new Set(Object.keys(RETIRE));
  for (const r of all) {
    const m = String(r.action).match(/supersedes (\w+-\d+)/);
    if (m) retired.add(m[1]);
  }
  const key = (r) => `${r.role}|${r.route}|${String(r.action).replace(/ \(supersedes .*\)/, '')}`;
  const latest = new Map();
  for (const r of all) {
    if (retired.has(r.id)) continue;
    const k = key(r);
    const prev = latest.get(k);
    // A completed check always beats an UNTESTED "remaining steps" placeholder of the same key.
    if (!prev || r.timestamp >= prev.timestamp) latest.set(k, r);
  }
  const checks = [...latest.values()];
  // Drop "remaining steps" placeholders whose section later completed in a re-run.
  const sectionsCompleted = new Set(all.filter((r) => /remaining steps/.test(r.action)).map((r) => r.area));
  const final = checks.filter((r) => {
    if (!/remaining steps/.test(r.action)) return true;
    const later = all.some((x) => x.area === r.area && x.timestamp > r.timestamp && !/remaining steps/.test(x.action));
    return !later;
  });
  void sectionsCompleted;
  for (const r of final) {
    if (RETIRE[r.id]) r.retiredReason = RETIRE[r.id];
    for (const f of FIXED_AT) if (f.match(r) && !/re-verified|re-checked/.test(r.action)) { r.fixedAtRevision = f.revision; r.fixedEvidence = f.by; }
    for (const [name, rule] of Object.entries(RECLASSIFY)) {
      if (rule.match(r) && r.result !== rule.to) {
        r.reclassified = { from: r.result, rule: name, reason: rule.reason };
        r.result = rule.to;
      }
    }
  }
  const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
  const counts = { PASS: 0, FAIL: 0, UNTESTED: 0 };
  for (const r of final) counts[r.result] = (counts[r.result] || 0) + 1;
  const routes = (state.routes || []).map((r) => r.template);
  const tested = new Set(final.map((r) => r.route).filter((r) => routes.includes(r)));
  const meta = {
    worker: 'A10 — independent functional browser QA',
    generatedAt: new Date().toISOString(),
    revision: execSync(`git -C ${ROOT} rev-parse --short HEAD`).toString().trim(),
    webBuild: (() => { try { return fs.statSync(path.join(ROOT, 'apps/web/.next/BUILD_ID')).mtime.toISOString(); } catch { return null; } })(),
    apiBuild: (() => { try { return fs.statSync(path.join(ROOT, 'platform/api/dist/src/main.js')).mtime.toISOString(); } catch { return null; } })(),
    web: 'http://localhost:3300', api: 'http://localhost:4300 (/api/v1)',
    browser: state.chrome ? `Google Chrome ${state.chrome} (headless, driven by playwright-core 1.49.1)` : 'Google Chrome 153.0.8010.52 (headless, driven by playwright-core 1.49.1)',
    method: 'Every session was created through the real /login form. No tokens were injected and no storage was edited. API probes are same-origin fetches issued from inside the signed-in page, using that page’s own session, exactly as the app’s API client does.',
    identities: Object.fromEntries(Object.entries(state.identities || {}).map(([k, v]) => [k, { role: v.fixtureRole, roles: v.roles, organization: v.tenant?.name, organizationSlug: v.tenant?.slug, organizationStatus: v.tenant?.status, dashboard: v.dashboardType, landing: v.landing, capabilities: v.permissions }])),
    counts,
    openFailures: final.filter((r) => r.result === 'FAIL' && !r.fixedAtRevision).length,
    failuresFixedAndReverified: final.filter((r) => r.result === 'FAIL' && r.fixedAtRevision).length,
    routesTested: tested.size,
    routesTotal: routes.length,
  };
  const inventory = (state.routes || []).map((r) => ({
    route: r.template, kind: r.workspace ? 'workspace' : 'public', file: r.file,
    rolesAllowed: [...new Set((state.visits || []).filter((v) => v.template === r.template && v.decision === 'allow').map((v) => v.key))],
    rolesDenied: [...new Set((state.visits || []).filter((v) => v.template === r.template && v.decision === 'deny').map((v) => v.key))],
    rolesRedirected: [...new Set((state.visits || []).filter((v) => v.template === r.template && v.decision === 'redirect').map((v) => v.key))],
  }));
  const controls = state.controls || {};
  fs.mkdirSync(EVID, { recursive: true });
  fs.writeFileSync(path.join(EVID, 'functional-matrix.json'), JSON.stringify({ meta, routeInventory: inventory, controlsSeen: controls, checks: final }, null, 1));
  return { meta, final, inventory };
}

if (require.main === module) {
  const { meta, final } = build();
  console.log(JSON.stringify(meta.counts), `routes ${meta.routesTested}/${meta.routesTotal}`, `checks ${final.length}`);
  const byArea = {};
  for (const r of final) { (byArea[r.area] ||= { PASS: 0, FAIL: 0, UNTESTED: 0 })[r.result]++; }
  console.log(JSON.stringify(byArea));
  for (const r of final.filter((x) => x.result === 'FAIL')) console.log('FAIL', r.id, r.role, r.route, '::', String(r.action).slice(0, 70), '::', String(r.actual).slice(0, 110));
}
module.exports = { build };
