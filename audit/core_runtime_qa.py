"""
Core finalization — runtime QA against a running stack (real HTTP, real database).

    python3 audit/core_runtime_qa.py [BASE] [EVIDENCE_JSON]

BASE defaults to the web origin http://localhost:3200 (requests go through the
Next.js /proxy-api rewrite exactly like the browser). Uses the development role
accounts from prisma/scripts/seed-demo-roles.ts. Never prints tokens or passwords.
"""
import json
import os
import sys
import time
import uuid
import warnings

warnings.filterwarnings("ignore")
import requests  # noqa: E402

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3200").rstrip("/")
API = f"{BASE}/proxy-api"
OUT = sys.argv[2] if len(sys.argv) > 2 else None
PASSWORD = os.environ.get("DEMO_PASSWORD", "Admin@1234")

ACCOUNTS = {
    "super_admin": "superadmin@umrahconnect.dev",
    "operator_admin": "admin@alharamain.sa",
    "operator_staff": "staff@alharamain.sa",
    "finance": "finance@alharamain.sa",
    "hotel": "hotel@makkahgrand.dev",
    "transport": "transport@haramaintransport.dev",
    "visa": "visa@fastvisa.dev",
    "traveler": "traveler@umrahconnect.dev",
    "operator_b": "admin@kaabatravel.pk",
}

results = []


def record(name, ok, detail=""):
    results.append({"check": name, "result": "PASS" if ok else "FAIL", "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))


def login(email):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD}, timeout=30)
    if r.status_code != 200:
        return None, r.status_code
    return r.json()["data"]["accessToken"], 200


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


tokens = {}
for role, email in ACCOUNTS.items():
    tok, status = login(email)
    record(f"login {role}", tok is not None, f"HTTP {status}")
    if tok:
        tokens[role] = tok

health = requests.get(f"{API}/health", timeout=10)
record("API health through web proxy", health.status_code == 200 and health.json().get("db") == "connected", f"HTTP {health.status_code}")

# ── identity & roles ────────────────────────────────────────────────────────
expected_roles = {
    "super_admin": "SUPER_ADMIN", "operator_admin": "OPERATOR_ADMIN", "operator_staff": "OPERATOR_STAFF",
    "finance": "FINANCE_MANAGER", "hotel": "HOTEL_MANAGER", "transport": "TRANSPORT_MANAGER",
    "visa": "VISA_OFFICER", "traveler": "PILGRIM",
}
for role, code in expected_roles.items():
    if role not in tokens:
        continue
    me = requests.get(f"{API}/auth/me", headers=H(tokens[role]), timeout=15)
    body = me.json().get("data", {}) if me.status_code == 200 else {}
    record(f"/auth/me {role} has server role {code}", code in body.get("roles", []), f"roles={body.get('roles')}")

# ── capability matrix ───────────────────────────────────────────────────────
MATRIX = [
    ("super_admin", "/admin/users", 200), ("super_admin", "/admin/tenants", 200), ("super_admin", "/pilgrims", 403),
    ("operator_admin", "/admin/users", 403), ("operator_admin", "/admin/users/export", 403), ("operator_admin", "/admin/finance", 403),
    ("operator_admin", "/pilgrims", 200), ("operator_admin", "/bookings", 200), ("operator_admin", "/hotels", 200),
    ("operator_staff", "/pilgrims", 200), ("operator_staff", "/finance/summary", 403),
    ("finance", "/finance/invoices", 200), ("finance", "/pilgrims", 403),
    ("hotel", "/hotels", 200), ("hotel", "/pilgrims", 403), ("hotel", "/transport/vehicles", 403),
    ("transport", "/transport/vehicles", 200), ("transport", "/hotels", 403),
    ("visa", "/compliance/visas", 200), ("visa", "/hotels", 403),
    ("traveler", "/social/feed", 200), ("traveler", "/pilgrims", 403), ("traveler", "/admin/stats", 403),
    ("operator_b", "/admin/users", 403),
]
for role, path, want in MATRIX:
    if role not in tokens:
        continue
    r = requests.get(f"{API}{path}", headers=H(tokens[role]), timeout=20)
    record(f"{role} GET {path} -> {want}", r.status_code == want, f"HTTP {r.status_code}")

anon = requests.get(f"{API}/admin/users", timeout=10)
record("anonymous GET /admin/users -> 401", anon.status_code == 401, f"HTTP {anon.status_code}")

# ── cross-tenant probes on real seeded data ─────────────────────────────────
if "operator_admin" in tokens and "operator_b" in tokens:
    hotels = requests.get(f"{API}/hotels", headers=H(tokens["operator_admin"]), timeout=20).json().get("data", [])
    hotels = hotels.get("items", hotels) if isinstance(hotels, dict) else hotels
    own = [h for h in hotels if h.get("tenantId")]
    if own:
        hid = own[0]["id"]
        rd = requests.get(f"{API}/hotels/{hid}", headers=H(tokens["operator_b"]), timeout=20)
        record("AUD-003 other operator reads hotel -> 404", rd.status_code == 404, f"HTTP {rd.status_code}")
        wr = requests.put(f"{API}/hotels/{hid}", headers=H(tokens["operator_b"]), json={"phone": "+966500000999"}, timeout=20)
        record("AUD-003 other operator updates hotel -> 404", wr.status_code == 404, f"HTTP {wr.status_code}")
    pil = requests.get(f"{API}/pilgrims", headers=H(tokens["operator_admin"]), timeout=20).json().get("data", {})
    items = pil.get("items", pil) if isinstance(pil, dict) else pil
    if items:
        rd = requests.get(f"{API}/pilgrims/{items[0]['id']}", headers=H(tokens["operator_b"]), timeout=20)
        record("other operator reads pilgrim -> 404", rd.status_code == 404, f"HTTP {rd.status_code}")

# ── privilege escalation attempts ───────────────────────────────────────────
if "operator_admin" in tokens:
    me = requests.get(f"{API}/auth/me", headers=H(tokens["operator_admin"]), timeout=15).json()["data"]
    roles = requests.get(f"{API}/rbac/roles", headers=H(tokens["operator_admin"]), timeout=15).json().get("data", [])
    record("assignable roles exclude SUPER_ADMIN", all(r["name"] != "SUPER_ADMIN" for r in roles), f"{[r['name'] for r in roles]}")
    esc = requests.post(f"{API}/rbac/roles", headers=H(tokens["operator_admin"]),
                        json={"name": f"qa-{uuid.uuid4().hex[:6]}", "permissions": ["platform:user:read"]}, timeout=15)
    record("custom role with platform capability -> 403", esc.status_code == 403, f"HTTP {esc.status_code}")

anon_tenant = requests.post(f"{API}/tenants", json={"slug": f"qa-{uuid.uuid4().hex[:6]}", "name": "QA", "type": "OPERATOR", "email": "qa@example.com", "country": "SA"}, timeout=15)
record("AUD-008 anonymous tenant creation -> 401", anon_tenant.status_code == 401, f"HTTP {anon_tenant.status_code}")

# ── brute force ─────────────────────────────────────────────────────────────
victim = f"bruteforce.{uuid.uuid4().hex[:6]}@example.com"
codes = [requests.post(f"{API}/auth/login", json={"email": victim, "password": "wrong-password"}, timeout=15).status_code for _ in range(12)]
record("AUD-007 repeated bad logins are throttled (429)", 429 in codes, f"codes={codes}")

# ── signup produces a working traveler ──────────────────────────────────────
email = f"qa.traveler.{uuid.uuid4().hex[:6]}@example.com"
reg = requests.post(f"{API}/auth/register", json={"email": email, "password": "Traveler-2026", "firstName": "QA", "lastName": "Traveler", "tenantId": str(uuid.uuid4())}, timeout=20)
record("signup with client tenantId -> 400", reg.status_code == 400, f"HTTP {reg.status_code}")
reg = requests.post(f"{API}/auth/register", json={"email": email, "password": "Traveler-2026", "firstName": "QA", "lastName": "Traveler"}, timeout=20)
record("signup -> 201", reg.status_code == 201, f"HTTP {reg.status_code}")
if reg.status_code == 201:
    t = reg.json()["data"]["accessToken"]
    feed = requests.get(f"{API}/social/feed", headers=H(t), timeout=15)
    listings = requests.get(f"{API}/marketplace/listings", headers=H(t), timeout=15)
    record("AUD-005 new traveler can read feed and marketplace", feed.status_code == 200 and listings.status_code == 200,
           f"feed {feed.status_code} listings {listings.status_code}")
    refresh_cookie = "uc_rt" in reg.headers.get("set-cookie", "")
    record("refresh token issued as httpOnly cookie through the proxy", refresh_cookie and "HttpOnly" in reg.headers.get("set-cookie", ""))

# ── password reset is single use (dev mail driver logs the link server-side) ─
fp = requests.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=15)
record("forgot-password responds without leaking a link", fp.status_code == 200 and "token" not in fp.text, f"HTTP {fp.status_code}")

# ── documents are not public ────────────────────────────────────────────────
for path in ["/uploads/visa-documents/x/y.png", "/uploads/private/kyc/a.pdf"]:
    r = requests.get(f"{BASE}{path}", timeout=15)
    record(f"AUD-006 {path} not served", r.status_code == 404, f"HTTP {r.status_code}")

# ── payments: server-determined amounts, sandbox capture, refund capability ──
if "finance" in tokens:
    inv = requests.get(f"{API}/finance/invoices", headers=H(tokens["finance"]), params={"limit": 50}, timeout=20).json().get("data", {})
    items = inv.get("items", inv) if isinstance(inv, dict) else inv
    payable = [i for i in items if i.get("status") in ("ISSUED", "SENT", "PARTIALLY_PAID", "OVERDUE")]
    if payable:
        target = payable[0]
        outstanding = int(target["totalCents"]) - int(target["paidCents"])
        over = requests.post(f"{API}/payments/intents", headers=H(tokens["finance"]),
                             json={"invoiceId": target["id"], "amountCents": outstanding + 100}, timeout=20)
        record("intent above outstanding -> 400", over.status_code == 400, f"HTTP {over.status_code}")
        no_anchor = requests.post(f"{API}/payments/intents", headers=H(tokens["finance"]), json={"amount": 10}, timeout=20)
        record("intent without invoice/booking -> 400", no_anchor.status_code == 400, f"HTTP {no_anchor.status_code}")
        small = min(outstanding, 1000)
        pi = requests.post(f"{API}/payments/intents", headers=H(tokens["finance"]),
                           json={"invoiceId": target["id"], "amountCents": small, "idempotencyKey": f"qa-{uuid.uuid4()}"}, timeout=20)
        record("sandbox intent created", pi.status_code == 201, f"HTTP {pi.status_code}")
        if pi.status_code == 201:
            pid = pi.json()["data"]["id"]
            if "operator_b" in tokens:
                foreign = requests.post(f"{API}/payments/intents/{pid}/confirm", headers=H(tokens["operator_b"]), json={}, timeout=20)
                record("other operator confirms payment -> 403/404", foreign.status_code in (403, 404), f"HTTP {foreign.status_code}")
            cap = requests.post(f"{API}/payments/intents/{pid}/confirm", headers=H(tokens["finance"]), json={}, timeout=20)
            record("sandbox capture -> COMPLETED", cap.status_code in (200, 201) and cap.json()["data"]["status"] == "COMPLETED",
                   f"HTTP {cap.status_code}")
            if "operator_staff" in tokens:
                staff_refund = requests.post(f"{API}/payments/{pid}/refund", headers=H(tokens["operator_staff"]), json={"amount": 1}, timeout=20)
                record("staff refund (no finance:payment:refund) -> 403", staff_refund.status_code == 403, f"HTTP {staff_refund.status_code}")
            refund = requests.post(f"{API}/payments/{pid}/refund", headers=H(tokens["finance"]), json={"reason": "QA reversal"}, timeout=20)
            record("finance manager refund -> REFUNDED", refund.status_code in (200, 201) and refund.json()["data"]["status"] == "REFUNDED",
                   f"HTTP {refund.status_code}")
    wh = requests.post(f"{API}/payments/webhook/sandbox", data=json.dumps({"id": "evt_forged", "type": "payment.captured"}),
                       headers={"content-type": "application/json", "x-signature": "sha256=forged"}, timeout=15)
    record("forged webhook -> 400", wh.status_code == 400, f"HTTP {wh.status_code}")

passed = sum(r["result"] == "PASS" for r in results)
print(f"\n{passed}/{len(results)} checks passed against {BASE}")
if OUT:
    with open(OUT, "w") as f:
        json.dump({"base": BASE, "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                   "passed": passed, "total": len(results), "results": results}, f, indent=2)
sys.exit(0 if passed == len(results) else 1)
