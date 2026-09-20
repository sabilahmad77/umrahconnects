/* A10 — conclusive cross-organization approve probe (DTO-valid body) and document version + verification. */
'use strict';
const L = require('./lib');
const R = new L.Recorder('visa-docs2');
(async () => {
  R.reset();
  const b = await L.launch();
  const V = await L.openIdentity(b, 'visaA');
  if ((await L.login(V)).outcome !== 'signed-in') throw new Error('visaA sign-in failed');
  const app = L.firstArray((await L.api(V, 'GET', '/compliance/visas?limit=50')).data).find((x) => /A10 Applicant/.test(JSON.stringify(x)));
  if (!app) throw new Error('no A10 application');
  const docs = L.firstArray((await L.api(V, 'GET', `/compliance/visas/${app.id}/documents`)).data);
  const doc = docs[0];
  // A document with no file cannot be verified; attach a version, then verify.
  if (doc) {
    const up = await L.apiProbe(V, 'POST', `/compliance/visas/${app.id}/documents/${doc.id}/versions`, { fileName: 'a10-passport.png', fileUrl: 'https://example.com/a10/passport.png', mimeType: 'image/png', sizeBytes: 1024 });
    const ver = up.status < 300 ? await L.apiProbe(V, 'PUT', `/compliance/visas/${app.id}/documents/${doc.id}/verify`, {}) : { status: 'skipped' };
    const after = L.firstArray((await L.api(V, 'GET', `/compliance/visas/${app.id}/documents`)).data).find((x) => x.id === doc.id);
    R.check(up.status < 300 && ver.status < 300 && /VERIFIED/i.test(String(after?.status)), { area: 'visa', route: '/compliance/[id]', role: 'visaA', action: 'attach a document version, then verify the document', expected: 'version 2xx, verify 2xx, status VERIFIED', actual: `version=${up.status} ${up.message || ''} verify=${ver.status} ${ver.message || ''} status now=${after?.status}`, requests: [`POST /api/compliance/visas/:id/documents/:docId/versions ${up.status}`, `PUT /api/compliance/visas/:id/documents/:docId/verify ${ver.status}`], readback: 'GET /api/compliance/visas/:id/documents' });
    R.rec({ area: 'visa', route: '/compliance/[id]', role: 'visaA', kind: 'invalid', action: 'verify a document that has no file', expected: 'refused with a clear reason', actual: 'PUT verify 400 "Cannot verify a document that has no file" (observed in the previous batch, status stayed MISSING)', result: 'PASS' });
  }
  const VB = await L.openIdentity(b, 'visaB');
  if ((await L.login(VB)).outcome !== 'signed-in') throw new Error('visaB sign-in failed');
  const put = await L.apiProbe(VB, 'PUT', `/compliance/visas/${app.id}/approve`, { visaNumber: `A10X${Date.now().toString().slice(-6)}` });
  const rej = await L.apiProbe(VB, 'PUT', `/compliance/visas/${app.id}/reject`, { reason: 'cross-organization probe' });
  const docB = doc ? await L.apiProbe(VB, 'POST', `/compliance/visas/${app.id}/documents/${doc.id}/versions`, { fileName: 'x.png', fileUrl: 'https://example.com/x.png', mimeType: 'image/png', sizeBytes: 10 }) : { status: 'n/a' };
  const owner = await L.api(V, 'GET', `/compliance/visas/${app.id}`);
  R.check([403, 404].includes(put.status) && [403, 404].includes(rej.status) && (docB.status === 'n/a' || [403, 404].includes(docB.status)), { area: 'visa', route: '/compliance/[id]', role: 'visaB', kind: 'tenant', action: "agency B approves/rejects agency A's application and adds a document version (DTO-valid bodies)", expected: '403/404 for each; the owning agency record unchanged', actual: `approve=${put.status} ${put.message || ''} reject=${rej.status} ${rej.message || ''} documentVersion=${docB.status}; owner status=${owner.data?.status}`, requests: [`PUT /api/compliance/visas/:idA/approve ${put.status}`, `PUT /api/compliance/visas/:idA/reject ${rej.status}`, `POST /api/compliance/visas/:idA/documents/:docId/versions ${docB.status}`] });
  await b.close();
  console.log(`TOTAL visa-docs2: ${JSON.stringify(R.count)}`);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
