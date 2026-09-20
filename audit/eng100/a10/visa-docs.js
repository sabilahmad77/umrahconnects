/* A10 — visa document on an application + cross-organization probes with well-formed bodies. */
'use strict';
const fs = require('fs'); const path = require('path');
const L = require('./lib');
const R = new L.Recorder('visa-docs');
const since = (id, t, re) => id.net.filter((n) => n.t >= t && (!re || re.test(`${n.method} ${n.path}`)));
const fmt = (a) => a.map((n) => `${n.method} ${n.path} ${n.status}`);
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
(async () => {
  R.reset();
  const b = await L.launch();
  const V = await L.openIdentity(b, 'visaA');
  if ((await L.login(V)).outcome !== 'signed-in') throw new Error('visaA sign-in failed');
  const p = V.page;
  const app = L.firstArray((await L.api(V, 'GET', '/compliance/visas?limit=50')).data).find((x) => /A10 Applicant/.test(JSON.stringify(x)));
  if (!app) throw new Error('no A10 application');
  await p.goto(`${L.WEB}/compliance/${app.id}`); await L.settle(V);
  await p.getByRole('tab', { name: 'Documents' }).or(p.getByRole('button', { name: 'Documents', exact: true })).first().click();
  await L.settle(V);
  const before = await L.describe(p, 'main');
  const opener = p.getByRole('button', { name: /^Add document/ }).first();
  if (await opener.isVisible().catch(() => false)) { await opener.click(); await L.sleep(600); }
  const form = await L.describe(p, 'main');
  const file = path.join(L.RUNTIME, 'a10-kyc-document.png');
  if (!fs.existsSync(file)) fs.writeFileSync(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const name = p.getByLabel('Document name *').first();
  let t = Date.now();
  // Required-field path first.
  const submit = p.getByRole('button', { name: /^(Add document|Upload|Save)/ }).last();
  await submit.click().catch(() => {}); await L.sleep(600);
  const blocked = since(V, t, /documents/).filter((x) => x.method === 'POST').length === 0;
  R.check(blocked, { area: 'visa', route: '/compliance/[id]', role: 'visaA', kind: 'invalid', action: 'add a document with no name', expected: 'blocked, no POST', actual: `${fmt(since(V, t, /documents/)).join(', ') || 'not submitted'}`, extra: { before: before.buttons, form: form.fields } });
  if (await name.count().catch(() => 0)) await name.fill(`A10 passport scan ${Date.now().toString(36)}`);
  const type = p.getByLabel('Type').first();
  if (await type.count().catch(() => 0)) { const o = await type.locator('option').evaluateAll((os) => os.map((x) => x.value).filter(Boolean)); if (o.length) await type.selectOption(o[0]); }
  const exp = p.getByLabel('Expires').first();
  if (await exp.count().catch(() => 0)) await exp.fill(day(300)).catch(() => {});
  const fi = p.locator('input[type=file]').first();
  if (await fi.count().catch(() => 0)) { await fi.setInputFiles(file).catch(() => {}); await L.sleep(1200); }
  t = Date.now();
  await p.getByRole('button', { name: /^(Add document|Upload|Save)/ }).last().click();
  for (let i = 0; i < 60 && !since(V, t, /documents/).some((x) => x.method === 'POST'); i++) await L.sleep(200);
  await L.settle(V);
  const q = since(V, t, /documents/).filter((x) => x.method === 'POST');
  const docs = L.firstArray((await L.api(V, 'GET', `/compliance/visas/${app.id}/documents`)).data);
  R.check(q.some((x) => x.status < 300) && docs.length > 0, { area: 'visa', route: '/compliance/[id]', role: 'visaA', action: 'attach a document to the application', expected: 'POST document 2xx; listed on the application', actual: `${fmt(q).join(', ') || 'no request'} documents=${docs.length}`, requests: fmt(q), readback: 'GET /api/compliance/visas/:id/documents', screenshot: await L.shot(p, 'visa-document') });
  if (docs[0]) {
    const d = docs[0];
    const ver = await L.apiProbe(V, 'PUT', `/compliance/visas/${app.id}/documents/${d.id}/verify`, { note: 'A10 QA verified' });
    const after = L.firstArray((await L.api(V, 'GET', `/compliance/visas/${app.id}/documents`)).data).find((x) => x.id === d.id);
    R.check(ver.status < 300, { area: 'visa', route: '/compliance/[id]', role: 'visaA', action: 'verify a document (decision)', expected: '2xx and the document is marked verified', actual: `PUT verify ${ver.status} ${ver.message || ''} status now=${after?.status}`, requests: [`PUT /api/compliance/visas/:id/documents/:docId/verify ${ver.status}`], readback: 'GET /api/compliance/visas/:id/documents' });
  }
  // Cross-organization probes with well-formed bodies.
  const VB = await L.openIdentity(b, 'visaB');
  if ((await L.login(VB)).outcome !== 'signed-in') throw new Error('visaB sign-in failed');
  const get = await L.apiProbe(VB, 'GET', `/compliance/visas/${app.id}`);
  const put = await L.apiProbe(VB, 'PUT', `/compliance/visas/${app.id}/approve`, { visaNumber: `A10X${Date.now().toString().slice(-6)}`, issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(), notes: 'cross-organization probe' });
  const del = await L.apiProbe(VB, 'DELETE', `/compliance/visas/${app.id}`);
  const docsB = docs[0] ? await L.apiProbe(VB, 'GET', `/compliance/visas/${app.id}/documents/${docs[0].id}`) : { status: 'n/a' };
  const after = await L.api(V, 'GET', `/compliance/visas/${app.id}`);
  R.check([403, 404].includes(get.status) && [403, 404].includes(put.status) && [403, 404].includes(del.status) && (docsB.status === 'n/a' || [403, 404].includes(docsB.status)) && after.data?.id === app.id, { area: 'visa', route: '/compliance/[id]', role: 'visaB', kind: 'tenant', action: "agency B reads, approves, deletes agency A's application and reads its document (well-formed bodies)", expected: '403/404 for every call; the record is untouched', actual: `GET=${get.status} APPROVE=${put.status} ${put.message || ''} DELETE=${del.status} DOC=${docsB.status}; owner still sees ${after.data?.status}`, requests: [`GET /api/compliance/visas/:idA ${get.status}`, `PUT /api/compliance/visas/:idA/approve ${put.status}`, `DELETE /api/compliance/visas/:idA ${del.status}`, `GET /api/compliance/visas/:idA/documents/:docId ${docsB.status}`] });
  await b.close();
  console.log(`TOTAL visa-docs: ${JSON.stringify(R.count)}`);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
