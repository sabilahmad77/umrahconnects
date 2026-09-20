/* A10 — attach a real file to a visa document through the UI, then run the verify/reject decisions. */
'use strict';
const fs = require('fs'); const path = require('path');
const L = require('./lib');
const R = new L.Recorder('visa-docs3');
const since = (id, t, re) => id.net.filter((n) => n.t >= t && (!re || re.test(`${n.method} ${n.path}`)));
const fmt = (a) => a.map((n) => `${n.method} ${n.path} ${n.status}`);
(async () => {
  R.reset();
  const b = await L.launch();
  const V = await L.openIdentity(b, 'visaA');
  if ((await L.login(V)).outcome !== 'signed-in') throw new Error('visaA sign-in failed');
  const p = V.page;
  const app = L.firstArray((await L.api(V, 'GET', '/compliance/visas?limit=50')).data).find((x) => /A10 Applicant/.test(JSON.stringify(x)));
  await p.goto(`${L.WEB}/compliance/${app.id}`); await L.settle(V);
  await p.getByRole('tab', { name: 'Documents' }).or(p.getByRole('button', { name: 'Documents', exact: true })).first().click();
  await L.settle(V);
  const file = path.join(L.RUNTIME, 'a10-kyc-document.png');
  if (!fs.existsSync(file)) fs.writeFileSync(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const before = L.firstArray((await L.api(V, 'GET', `/compliance/visas/${app.id}/documents`)).data);
  const doc = before[0];
  const view = await L.describe(p, 'main');
  // An existing "missing" document should offer an upload control.
  const upload = p.getByRole('button', { name: /Upload|Attach|Replace|New version/i }).first();
  let t = Date.now();
  if (await upload.isVisible().catch(() => false)) await upload.click();
  await L.sleep(500);
  const fi = p.locator('input[type=file]').first();
  const hasFile = await fi.count().catch(() => 0);
  if (hasFile) { await fi.setInputFiles(file); await L.sleep(500); }
  const confirm = p.getByRole('button', { name: /Upload|Save|Attach|Add/i }).last();
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  for (let i = 0; i < 60 && !since(V, t, /versions|documents|uploads/).some((x) => x.method === 'POST'); i++) await L.sleep(200);
  await L.settle(V);
  const q = since(V, t, /versions|documents|uploads/).filter((x) => x.method === 'POST');
  const after = L.firstArray((await L.api(V, 'GET', `/compliance/visas/${app.id}/documents`)).data);
  const mine = after.find((x) => x.id === doc?.id) || after[0];
  R.check(q.some((x) => x.status < 300) && !/MISSING/i.test(String(mine?.status)), { area: 'visa', route: '/compliance/[id]', role: 'visaA', action: 'upload a file for a requested document', expected: 'upload 2xx and the document leaves the MISSING state', actual: `${fmt(q).join(', ') || 'no upload request'} status now=${mine?.status} fileInputPresent=${!!hasFile}`, requests: fmt(q), extra: { controls: view.buttons.slice(0, 14) }, readback: 'GET /api/compliance/visas/:id/documents', screenshot: await L.shot(p, 'visa-document-upload') });
  if (mine && !/MISSING/i.test(String(mine.status))) {
    const ver = await L.apiProbe(V, 'PUT', `/compliance/visas/${app.id}/documents/${mine.id}/verify`, {});
    const after2 = L.firstArray((await L.api(V, 'GET', `/compliance/visas/${app.id}/documents`)).data).find((x) => x.id === mine.id);
    R.check(ver.status < 300 && /VERIFIED/i.test(String(after2?.status)), { area: 'visa', route: '/compliance/[id]', role: 'visaA', action: 'verify an uploaded document', expected: 'verify 2xx; status VERIFIED', actual: `PUT verify ${ver.status} ${ver.message || ''} status now=${after2?.status}`, requests: [`PUT /api/compliance/visas/:id/documents/:docId/verify ${ver.status}`], readback: 'GET /api/compliance/visas/:id/documents' });
    const rej = await L.apiProbe(V, 'PUT', `/compliance/visas/${app.id}/documents/${mine.id}/reject`, { reason: 'A10 QA rejection check' });
    const after3 = L.firstArray((await L.api(V, 'GET', `/compliance/visas/${app.id}/documents`)).data).find((x) => x.id === mine.id);
    R.check(rej.status < 300 && /REJECT/i.test(String(after3?.status)), { area: 'visa', route: '/compliance/[id]', role: 'visaA', action: 'reject a document with a reason', expected: 'reject 2xx; status REJECTED', actual: `PUT reject ${rej.status} ${rej.message || ''} status now=${after3?.status}`, requests: [`PUT /api/compliance/visas/:id/documents/:docId/reject ${rej.status}`] });
  }
  await b.close();
  console.log(`TOTAL visa-docs3: ${JSON.stringify(R.count)}`);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
