#!/usr/bin/env python3
"""BP-08: Visa Document Management — upload, version, verify/reject, expiry.

Proves the document lifecycle on a real table (not the old JSON blob):
real multipart upload, replace-creates-a-new-version with history, verify and
reject decisions that are attributable, derived expiry, the tenant-wide
register, audit rows and notifications — plus the storage abstraction
reporting honestly whether it is configured for durable cloud storage.

Usage: python3 bp08_visa_documents.py [API_URL] [TENANT_ID]
"""
import requests, sys, uuid, io, datetime

API = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4000/api/v1"
TEN = sys.argv[2] if len(sys.argv) > 2 else "ac08f9b4-aaec-4474-b61b-4832c5a5ec4c"
T = requests.post(f"{API}/auth/login", json={
    "email": "admin@alharamain.sa", "password": "Admin@1234", "tenantId": TEN}).json()["data"]["accessToken"]
H = {"Authorization": f"Bearer {T}", "Content-Type": "application/json"}
HF = {"Authorization": f"Bearer {T}"}          # multipart sets its own content-type
BOGUS = str(uuid.uuid4())

ok = fail = 0
def chk(label, cond, extra=""):
    global ok, fail
    ok += bool(cond); fail += not cond
    print(("✓" if cond else "✗"), label, extra)
def gd(r):
    try: j = r.json()
    except Exception: return {}
    return j.get("data", j)
def rt(label, resp, expect):
    chk(f"red-team: {label}", resp.status_code == expect and resp.status_code < 500, f"({resp.status_code})")

# a tiny but genuinely valid PNG
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d494844520000000100000001080600000"
    "01f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082")

# ── fixture: a fresh application ─────────────────────────────────────────
app = gd(requests.post(f"{API}/compliance/visas", headers=H, json={
    "applicantName": "BP08 Applicant", "type": "UMRAH", "regulatorySystem": "NUSUK_MASAR",
    "applicantPassport": "BP08-123", "notes": "BP-08 document management"}))
AID = app.get("id")
chk("fixture: visa application created", bool(AID), str(AID)[:8])
BASE = f"{API}/compliance/visas/{AID}/documents"

# ── 1. create a required-document placeholder ────────────────────────────
r = requests.post(BASE, headers=H, json={"name": "Passport bio page", "type": "PASSPORT"})
doc = gd(r); DID = doc.get("id")
chk("create document placeholder", r.status_code in (200, 201) and DID, f"({r.status_code})")
chk("placeholder opens as MISSING with no file", doc.get("status") == "MISSING" and not doc.get("url"),
    f"({doc.get('status')})")
chk("document is a real row, not a JSON blob entry",
    len(str(DID)) == 36 and "-" in str(DID), str(DID)[:8])

# ── 2. real multipart upload → version 1 ─────────────────────────────────
r = requests.post(f"{BASE}/{DID}/versions", headers=HF,
                  files={"file": ("passport.png", io.BytesIO(PNG), "image/png")})
v1 = gd(r)
chk("upload a real file", r.status_code in (200, 201), f"({r.status_code})")
chk("upload sets version 1, status RECEIVED, and a url",
    v1.get("version") == 1 and v1.get("status") == "RECEIVED" and v1.get("url"),
    f"(v{v1.get('version')} {v1.get('status')})")
chk("stored size recorded", v1.get("sizeBytes") == len(PNG), f"({v1.get('sizeBytes')} bytes)")

# the stored object is really retrievable
served = requests.get(f"{API.replace('/api/v1','')}{v1.get('url')}")
chk("uploaded file is actually served back", served.status_code == 200 and served.content == PNG,
    f"({served.status_code}, {len(served.content)} bytes)")

# ── 3. verify → then replace invalidates the decision ────────────────────
r = requests.put(f"{BASE}/{DID}/verify", headers=H)
ver = gd(r)
chk("verify document", r.status_code == 200 and ver.get("status") == "VERIFIED", f"({r.status_code})")
chk("verification is attributable (who + when)",
    ver.get("verifiedBy") and ver.get("verifiedAt"), f"(by={str(ver.get('verifiedBy'))[:8]})")

r = requests.post(f"{BASE}/{DID}/versions", headers=HF,
                  files={"file": ("passport-v2.png", io.BytesIO(PNG), "image/png")})
v2 = gd(r)
chk("replacing the file creates version 2", v2.get("version") == 2, f"(v{v2.get('version')})")
chk("a replacement invalidates the previous verification",
    v2.get("status") == "RECEIVED" and not v2.get("verifiedAt"), f"({v2.get('status')})")

vers = gd(requests.get(f"{BASE}/{DID}/versions", headers=H))
chk("version history keeps both versions", len(vers) == 2, f"({len(vers)} versions)")
chk("superseded version is stamped replacedAt",
    any(v.get("version") == 1 and v.get("replacedAt") for v in vers))
chk("each version records a checksum", all(v.get("checksum") for v in vers))

# ── 4. reject with a reason ──────────────────────────────────────────────
r = requests.put(f"{BASE}/{DID}/reject", headers=H, json={"reason": "Glare obscures the MRZ line"})
rej = gd(r)
chk("reject with reason", r.status_code == 200 and rej.get("status") == "REJECTED", f"({r.status_code})")
fresh = gd(requests.get(f"{BASE}/{DID}", headers=H))
chk("rejection reason persists on re-fetch", "MRZ" in str(fresh.get("rejectionReason")),
    str(fresh.get("rejectionReason"))[:40])
chk("detail returns the full version history", len(fresh.get("versions", [])) == 2)

# ── 5. expiry is derived, not a stale stored flag ────────────────────────
past = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
r = requests.put(f"{BASE}/{DID}", headers=H, json={"expiresAt": past})
exp = gd(r)
chk("expiry date accepted", r.status_code == 200, f"({r.status_code})")
chk("a past expiry reads as expired without a background job",
    exp.get("isExpired") is True and exp.get("effectiveStatus") == "EXPIRED",
    f"(isExpired={exp.get('isExpired')} effective={exp.get('effectiveStatus')})")
rt("verifying an expired document → 400",
   requests.put(f"{BASE}/{DID}/verify", headers=H), 400)
requests.put(f"{BASE}/{DID}", headers=H, json={"expiresAt": None})

# ── 6. tenant-wide register + stats + storage honesty ────────────────────
allDocs = gd(requests.get(f"{API}/compliance/visas/documents", headers=H))
chk("tenant-wide document register lists this document",
    any(d.get("id") == DID for d in allDocs), f"({len(allDocs)} documents)")
chk("register joins the owning application",
    any(d.get("id") == DID and (d.get("application") or {}).get("id") == AID for d in allDocs))
st = gd(requests.get(f"{API}/compliance/visas/documents/stats", headers=H))
chk("document stats respond", st.get("total", 0) >= 1 and "byStatus" in st,
    f"(total {st.get('total')}, expired {st.get('expired')})")
storage = st.get("storage", {})
chk("storage reports its driver and whether it is durable",
    "driver" in storage and "ephemeral" in storage,
    f"(driver={storage.get('driver')} ephemeral={storage.get('ephemeral')} configured={storage.get('configured')})")

# ── 7. audit trail ───────────────────────────────────────────────────────
al = gd(requests.get(f"{API}/admin/audit-logs?resource=visa_document&limit=200", headers=H))
rows = [x for x in (al.get("items", al) if isinstance(al, dict) else al) if x.get("resourceId") == DID]
chk("every document action is audited", len(rows) >= 5, f"({len(rows)} audit rows)")
actions = {x.get("action") for x in rows}
chk("audit distinguishes uploads from decisions",
    "DOCUMENT_UPLOAD" in actions and "VISA_STATUS_CHANGE" in actions, str(sorted(actions)))

# ── 8. legacy JSON documents are imported, not orphaned ──────────────────
legacy = gd(requests.post(f"{API}/compliance/visas", headers=H, json={
    "applicantName": "BP08 Legacy", "type": "UMRAH", "regulatorySystem": "NUSUK_MASAR",
    "documents": [{"id": "doc_legacy1", "name": "Old photo", "type": "PHOTO",
                   "status": "RECEIVED", "url": "/uploads/legacy.png"}]}))
LID = legacy.get("id")
imported = gd(requests.get(f"{API}/compliance/visas/{LID}/documents", headers=H))
chk("legacy JSON documents are imported into the table",
    len(imported) == 1 and imported[0].get("name") == "Old photo", f"({len(imported)} imported)")
chk("imported legacy document keeps its status and url",
    imported[0].get("status") == "RECEIVED" and imported[0].get("url") == "/uploads/legacy.png")
again = gd(requests.get(f"{API}/compliance/visas/{LID}/documents", headers=H))
chk("import is idempotent (no duplicates on re-read)", len(again) == 1, f"({len(again)})")

# ── 9. red team ──────────────────────────────────────────────────────────
rt("create document with no name → 400", requests.post(BASE, headers=H, json={"type": "OTHER"}), 400)
rt("bogus document id → 404", requests.get(f"{BASE}/{BOGUS}", headers=H), 404)
rt("malformed document id → 400", requests.get(f"{BASE}/not-a-uuid", headers=H), 400)
rt("document under a bogus application → 404",
   requests.get(f"{API}/compliance/visas/{BOGUS}/documents", headers=H), 404)
rt("invalid status value → 400", requests.put(f"{BASE}/{DID}", headers=H, json={"status": "NOPE"}), 400)
rt("jumping straight to VERIFIED via status edit → 400 (must use /verify)",
   requests.put(f"{BASE}/{DID}", headers=H, json={"status": "VERIFIED"}), 400)
rt("reject without a reason → 400", requests.put(f"{BASE}/{DID}/reject", headers=H, json={"reason": ""}), 400)
rt("reject twice → 400", requests.put(f"{BASE}/{DID}/reject", headers=H, json={"reason": "again"}), 400)
rt("empty patch → 400", requests.put(f"{BASE}/{DID}", headers=H, json={}), 400)
rt("upload with no file → 400", requests.post(f"{BASE}/{DID}/versions", headers=HF), 400)
rt("upload a disallowed file type → 400", requests.post(f"{BASE}/{DID}/versions", headers=HF,
   files={"file": ("payload.exe", io.BytesIO(b"MZ"), "application/octet-stream")}), 400)
placeholder = gd(requests.post(BASE, headers=H, json={"name": "No file yet", "type": "OTHER"}))
rt("verifying a document with no file → 400",
   requests.put(f"{BASE}/{placeholder['id']}/verify", headers=H), 400)
rt("unauth list → 401", requests.get(BASE), 401)
rt("unauth upload → 401", requests.post(f"{BASE}/{DID}/versions",
   files={"file": ("x.png", io.BytesIO(PNG), "image/png")}), 401)

# ── 10. delete removes the document and its versions ─────────────────────
r = requests.delete(f"{BASE}/{placeholder['id']}", headers=H)
chk("delete document", r.status_code == 200 and gd(r).get("deleted"), f"({r.status_code})")
rt("deleted document is gone → 404", requests.get(f"{BASE}/{placeholder['id']}", headers=H), 404)

print(f"\nBP-08: {ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
