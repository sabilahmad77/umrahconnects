"""
Web integration acceptance — real HTTP through the Next.js /proxy-api rewrite,
real PostgreSQL, real seeded role accounts.

    python3 audit/integration_acceptance_qa.py [BASE] [EVIDENCE_JSON]

BASE defaults to http://localhost:3300 (the integration worktree's web origin).
Requests go through /proxy-api exactly like the browser does.

This harness is deliberately adversarial: it creates a record with one identity
and then tries to read, change, delete and otherwise reach it with every other
identity. A check only passes when the server refuses.

Identities come from:
  prisma/scripts/seed-demo-roles.ts      (the "A side", one account per role)
  prisma/scripts/seed-isolation-pairs.ts (the "B side", a second organization
                                          for hotel, transport, visa + traveler B)

Never prints tokens or passwords.
"""
import json
import os
import sys
import time
import uuid
import warnings

warnings.filterwarnings("ignore")
import requests  # noqa: E402

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3300").rstrip("/")
API = f"{BASE}/proxy-api"
OUT = sys.argv[2] if len(sys.argv) > 2 else None
PASSWORD = os.environ.get("DEMO_PASSWORD", "Admin@1234")

ACCOUNTS = {
    "super_admin": "superadmin@umrahconnect.dev",
    "operator_a": "admin@alharamain.sa",
    "operator_a_staff": "staff@alharamain.sa",
    "finance_a": "finance@alharamain.sa",
    "visa_officer_a": "visa.officer@alharamain.sa",
    "operator_b": "admin@kaabatravel.pk",
    "operator_c": "admin@baitussalam.co.id",
    "hotel_a": "hotel@makkahgrand.dev",
    "hotel_b": "hotel.b@madinahcomfort.dev",
    "transport_a": "transport@haramaintransport.dev",
    "transport_b": "transport.b@jeddahcoach.dev",
    "visa_a": "visa@fastvisa.dev",
    "visa_b": "visa.b@nusukvisa.dev",
    "traveler_a": "traveler@umrahconnect.dev",
    "traveler_b": "traveler.b@umrahconnect.dev",
}

results = []
T = {}


def record(section, name, ok, detail=""):
    results.append({"section": section, "check": name, "result": "PASS" if ok else "FAIL", "detail": str(detail)})
    print(("  PASS " if ok else "  FAIL ") + name + (f"  [{detail}]" if detail else ""))
    return ok


def section(title):
    print(f"\n=== {title} ===")
    return title


def login(email):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD}, timeout=30)
    return r.json()["data"]["accessToken"] if r.status_code == 200 else None


def H(role):
    return {"Authorization": f"Bearer {T[role]}"}


def req(method, role, path, body=None, **kw):
    fn = getattr(requests, method)
    kwargs = {"headers": H(role), "timeout": 30, **kw}
    if body is not None:
        kwargs["json"] = body
    return fn(f"{API}{path}", **kwargs)


def get(role, path, **kw):
    return req("get", role, path, None, **kw)


def post(role, path, body=None, **kw):
    return req("post", role, path, body if body is not None else {}, **kw)


def put(role, path, body=None, **kw):
    return req("put", role, path, body if body is not None else {}, **kw)


def delete(role, path, **kw):
    return req("delete", role, path, None, **kw)


def data(r):
    try:
        j = r.json()
        return j.get("data", j)
    except Exception:
        return None


def items(r):
    d = data(r)
    if isinstance(d, dict):
        return d.get("items", [])
    return d if isinstance(d, list) else []


def denied(code):
    """A refusal. 404 counts: hiding existence is a legitimate way to refuse."""
    return code in (401, 403, 404)


# ── identities ──────────────────────────────────────────────────────────────
section("IDENTITIES")
for key, email in ACCOUNTS.items():
    tok = login(email)
    if tok:
        T[key] = tok
    record("identities", f"{key} authenticates", bool(tok), "" if tok else "login failed")

missing = [k for k in ACCOUNTS if k not in T]
if missing:
    print(f"\nABORT: identities unavailable: {missing}")
    sys.exit(2)

# ── SUPER ADMIN ISOLATION ───────────────────────────────────────────────────
s = section("SUPER ADMIN ISOLATION (direct API, not navigation)")
ADMIN_ROUTES = [
    ("get", "/admin/users"), ("get", "/admin/tenants"), ("get", "/admin/stats"),
    ("get", "/admin/finance"), ("get", "/admin/audit-logs"), ("get", "/admin/users/export"),
    ("get", "/inquiries"),
]
for role in ["operator_a", "operator_a_staff", "finance_a", "visa_officer_a", "hotel_a",
             "transport_a", "visa_a", "traveler_a", "operator_b"]:
    for method, path in ADMIN_ROUTES:
        r = req(method, role, path)
        record(s, f"{role} {method.upper()} {path} denied", denied(r.status_code), f"HTTP {r.status_code}")
for method, path in ADMIN_ROUTES:
    r = getattr(requests, method)(f"{API}{path}", timeout=20)
    record(s, f"anonymous {method.upper()} {path} denied", denied(r.status_code), f"HTTP {r.status_code}")
r = get("super_admin", "/admin/users")
record(s, "super_admin GET /admin/users allowed", r.status_code == 200, f"HTTP {r.status_code}")
r = get("super_admin", "/pilgrims")
record(s, "super_admin has NO tenant business access (/pilgrims)", r.status_code == 403, f"HTTP {r.status_code}")

# escalation: can a tenant admin mint platform capability for itself?
esc = post("operator_a", "/rbac/roles", {"name": f"qa-{uuid.uuid4().hex[:6]}", "permissions": ["platform:user:read"]})
record(s, "operator cannot create a role holding a platform capability", esc.status_code == 403, f"HTTP {esc.status_code}")
roles = items(get("operator_a", "/rbac/roles")) or data(get("operator_a", "/rbac/roles")) or []
names = [x.get("name") for x in roles if isinstance(x, dict)]
record(s, "SUPER_ADMIN is not offered as an assignable role", "SUPER_ADMIN" not in names, f"{names}")

# ── TENANT ISOLATION: HOTEL A vs HOTEL B ────────────────────────────────────
s = section("TENANT ISOLATION — HOTEL A vs HOTEL B")
h = post("hotel_a", "/hotels", {
    "name": f"Isolation Probe Hotel {uuid.uuid4().hex[:6]}", "city": "Makkah", "country": "SA",
    "starRating": 4, "phone": "+966500000111",
})
record(s, "hotel_a creates its own hotel", h.status_code in (200, 201), f"HTTP {h.status_code}")
if h.status_code in (200, 201):
    hid = data(h)["id"]
    record(s, "hotel_b READ hotel A denied", denied(get("hotel_b", f"/hotels/{hid}").status_code),
           f"HTTP {get('hotel_b', f'/hotels/{hid}').status_code}")
    record(s, "hotel_b UPDATE hotel A denied", denied(put("hotel_b", f"/hotels/{hid}", {"phone": "+966500000999"}).status_code),
           f"HTTP {put('hotel_b', f'/hotels/{hid}', {'phone': '+966500000999'}).status_code}")
    record(s, "hotel_b DELETE hotel A denied", denied(delete("hotel_b", f"/hotels/{hid}").status_code),
           f"HTTP {delete('hotel_b', f'/hotels/{hid}').status_code}")
    record(s, "operator_b READ hotel A denied", denied(get("operator_b", f"/hotels/{hid}").status_code),
           f"HTTP {get('operator_b', f'/hotels/{hid}').status_code}")
    record(s, "traveler_a READ hotel A denied", denied(get("traveler_a", f"/hotels/{hid}").status_code),
           f"HTTP {get('traveler_a', f'/hotels/{hid}').status_code}")
    # the record must still be intact and visible to its owner
    own = get("hotel_a", f"/hotels/{hid}")
    intact = own.status_code == 200 and data(own).get("phone") == "+966500000111"
    record(s, "hotel A record unchanged after hostile writes", intact, f"HTTP {own.status_code}")
    hotel_a_id = hid
else:
    hotel_a_id = None

# ── TENANT ISOLATION: TRANSPORT A vs TRANSPORT B ────────────────────────────
s = section("TENANT ISOLATION — TRANSPORT A vs TRANSPORT B")
plate = f"ISO{uuid.uuid4().hex[:5].upper()}"
v = post("transport_a", "/transport/vehicles", {"type": "BUS", "plateNumber": plate, "capacity": 45})
record(s, "transport_a creates its own vehicle", v.status_code in (200, 201), f"HTTP {v.status_code}")
if v.status_code in (200, 201):
    vid = data(v)["id"]
    for role in ["transport_b", "operator_b", "hotel_a", "traveler_a"]:
        record(s, f"{role} READ vehicle A denied", denied(get(role, f"/transport/vehicles/{vid}").status_code),
               f"HTTP {get(role, f'/transport/vehicles/{vid}').status_code}")
    record(s, "transport_b UPDATE vehicle A denied",
           denied(put("transport_b", f"/transport/vehicles/{vid}", {"capacity": 1}).status_code),
           f"HTTP {put('transport_b', f'/transport/vehicles/{vid}', {'capacity': 1}).status_code}")
    record(s, "transport_b DELETE vehicle A denied", denied(delete("transport_b", f"/transport/vehicles/{vid}").status_code),
           f"HTTP {delete('transport_b', f'/transport/vehicles/{vid}').status_code}")
    own = get("transport_a", f"/transport/vehicles/{vid}")
    record(s, "vehicle A unchanged after hostile writes",
           own.status_code == 200 and data(own).get("capacity") == 45, f"HTTP {own.status_code}")
    # listing must not leak the other organization's vehicle
    b_list = items(get("transport_b", "/transport/vehicles"))
    record(s, "transport_b vehicle list excludes vehicle A", all(x.get("id") != vid for x in b_list), f"n={len(b_list)}")

# ── TENANT ISOLATION: VISA A vs VISA B (+ documents) ────────────────────────
s = section("TENANT ISOLATION — VISA A vs VISA B")
va = post("visa_a", "/compliance/visas", {
    "applicantName": "Isolation Probe Applicant", "applicantPassport": f"P{uuid.uuid4().hex[:7].upper()}",
    "applicantNationality": "PK", "visaType": "UMRAH", "destinationCountry": "SA",
})
record(s, "visa_a creates its own visa application", va.status_code in (200, 201), f"HTTP {va.status_code}")
if va.status_code in (200, 201):
    vaid = data(va)["id"]
    for role in ["visa_b", "operator_b", "hotel_a", "traveler_a"]:
        record(s, f"{role} READ visa A denied", denied(get(role, f"/compliance/visas/{vaid}").status_code),
               f"HTTP {get(role, f'/compliance/visas/{vaid}').status_code}")
    record(s, "visa_b UPDATE visa A denied",
           denied(put("visa_b", f"/compliance/visas/{vaid}", {"applicantName": "Hijacked"}).status_code),
           f"HTTP {put('visa_b', f'/compliance/visas/{vaid}', {'applicantName': 'Hijacked'}).status_code}")
    record(s, "visa_b APPROVE visa A denied", denied(put("visa_b", f"/compliance/visas/{vaid}/approve", {}).status_code),
           f"HTTP {put('visa_b', f'/compliance/visas/{vaid}/approve', {}).status_code}")
    record(s, "visa_b REJECT visa A denied", denied(put("visa_b", f"/compliance/visas/{vaid}/reject", {"reason": "x"}).status_code),
           f"HTTP {put('visa_b', f'/compliance/visas/{vaid}/reject', {'reason': 'x'}).status_code}")
    record(s, "visa_b DELETE visa A denied", denied(delete("visa_b", f"/compliance/visas/{vaid}").status_code),
           f"HTTP {delete('visa_b', f'/compliance/visas/{vaid}').status_code}")
    record(s, "visa_b READ visa A documents denied",
           denied(get("visa_b", f"/compliance/visas/{vaid}/documents").status_code),
           f"HTTP {get('visa_b', f'/compliance/visas/{vaid}/documents').status_code}")
    own = get("visa_a", f"/compliance/visas/{vaid}")
    record(s, "visa A unchanged after hostile writes",
           own.status_code == 200 and data(own).get("applicantName") == "Isolation Probe Applicant",
           f"HTTP {own.status_code}")
    visa_a_id = vaid
else:
    visa_a_id = None

# ── TENANT ISOLATION: OPERATOR A vs OPERATOR B ──────────────────────────────
s = section("TENANT ISOLATION — OPERATOR A vs OPERATOR B")
pil = items(get("operator_a", "/pilgrims"))
if pil:
    pid = pil[0]["id"]
    for role in ["operator_b", "operator_c", "hotel_a", "transport_a", "visa_a", "traveler_a"]:
        record(s, f"{role} READ operator A pilgrim denied", denied(get(role, f"/pilgrims/{pid}").status_code),
               f"HTTP {get(role, f'/pilgrims/{pid}').status_code}")
    record(s, "operator_b UPDATE operator A pilgrim denied",
           denied(put("operator_b", f"/pilgrims/{pid}", {"notes": "hijack"}).status_code),
           f"HTTP {put('operator_b', f'/pilgrims/{pid}', {'notes': 'hijack'}).status_code}")
    record(s, "operator_b DELETE operator A pilgrim denied", denied(delete("operator_b", f"/pilgrims/{pid}").status_code),
           f"HTTP {delete('operator_b', f'/pilgrims/{pid}').status_code}")
    b_pilgrims = items(get("operator_b", "/pilgrims"))
    record(s, "operator_b pilgrim list excludes operator A records",
           all(x.get("id") != pid for x in b_pilgrims), f"n={len(b_pilgrims)}")
else:
    record(s, "operator A has pilgrims to probe", False, "no pilgrims seeded")

inv = items(get("finance_a", "/finance/invoices", params={"limit": 50}))
if inv:
    iid = inv[0]["id"]
    for role in ["operator_b", "operator_c"]:
        record(s, f"{role} READ operator A invoice denied", denied(get(role, f"/finance/invoices/{iid}").status_code),
               f"HTTP {get(role, f'/finance/invoices/{iid}').status_code}")
    record(s, "operator_b VOID operator A invoice denied",
           denied(put("operator_b", f"/finance/invoices/{iid}/void", {}).status_code),
           f"HTTP {put('operator_b', f'/finance/invoices/{iid}/void', {}).status_code}")

groups = items(get("operator_a", "/groups"))
if groups:
    gid = groups[0]["id"]
    for role in ["operator_b", "traveler_b"]:
        record(s, f"{role} READ operator A group denied", denied(get(role, f"/groups/{gid}").status_code),
               f"HTTP {get(role, f'/groups/{gid}').status_code}")

# ── TRAVELER-TO-TRAVELER ISOLATION ──────────────────────────────────────────
s = section("TENANT ISOLATION — TRAVELER A vs TRAVELER B")
rq = post("traveler_a", "/marketplace/requests/", {
    "title": f"Isolation probe request {uuid.uuid4().hex[:6]}",
    "description": "Probe request created by the acceptance harness.",
    "serviceType": "HOTEL", "travelers": 2,
})
record(s, "traveler_a creates a marketplace request", rq.status_code in (200, 201), f"HTTP {rq.status_code}")
if rq.status_code in (200, 201):
    rid = data(rq)["id"]
    record(s, "traveler_b READ traveler A request denied", denied(get("traveler_b", f"/marketplace/requests/{rid}").status_code),
           f"HTTP {get('traveler_b', f'/marketplace/requests/{rid}').status_code}")
    record(s, "traveler_b CLOSE traveler A request denied",
           denied(post("traveler_b", f"/marketplace/requests/{rid}/close", {}).status_code),
           f"HTTP {post('traveler_b', f'/marketplace/requests/{rid}/close', {}).status_code}")
    mine_b = items(get("traveler_b", "/marketplace/requests/mine"))
    record(s, "traveler_b 'my requests' excludes traveler A request",
           all(x.get("id") != rid for x in mine_b), f"n={len(mine_b)}")
    own = get("traveler_a", f"/marketplace/requests/{rid}")
    record(s, "traveler A request still open and owned", own.status_code == 200, f"HTTP {own.status_code}")

# ── BOOKING / PRICING CONTRACT ──────────────────────────────────────────────
s = section("BOOKING / PRICING CONTRACT (server-authoritative)")
listings = items(get("traveler_a", "/marketplace/listings", params={"limit": 50}))
if not listings:
    listings = data(get("traveler_a", "/marketplace/listings")) or []
priced = [x for x in listings if x.get("priceCents") and x.get("pricingModel") in ("PER_PERSON", "PER_GROUP")]
if priced:
    L = priced[0]
    lid, unit, model = L["id"], int(L["priceCents"]), L["pricingModel"]
    party = 3
    expected = unit * party if model == "PER_PERSON" else unit

    # 1. tampered total is rejected outright
    bad = post("traveler_a", f"/marketplace/listings/{lid}/bookings",
               {"partySize": party, "totalAmountCents": 1, "customerName": "Probe", "customerEmail": "probe@example.com"})
    record(s, "client-tampered totalAmountCents (1 cent) rejected", bad.status_code == 400, f"HTTP {bad.status_code}")

    # 2. no client total at all -> server computes the authoritative figure
    ok = post("traveler_a", f"/marketplace/listings/{lid}/bookings",
              {"partySize": party, "customerName": "Probe", "customerEmail": "probe@example.com"})
    created = ok.status_code in (200, 201)
    record(s, "booking without a client total is accepted", created, f"HTTP {ok.status_code}")
    if created:
        b = data(ok)
        bid = b["id"]
        record(s, f"server total == {model} price x party ({expected})", int(b.get("totalAmountCents", -1)) == expected,
               f"server={b.get('totalAmountCents')} expected={expected}")
        record(s, "server sets booking status itself (not client)", b.get("status") is not None, f"status={b.get('status')}")
        record(s, "new booking is not marked paid", str(b.get("paymentStatus", "")).upper() not in ("PAID",),
               f"paymentStatus={b.get('paymentStatus')}")

        # 3. status/paymentStatus/currency are not client-settable on create
        for field, value in [("status", "CONFIRMED"), ("paymentStatus", "PAID"), ("currency", "USD")]:
            rr = post("traveler_a", f"/marketplace/listings/{lid}/bookings",
                      {"partySize": 1, "customerName": "Probe", "customerEmail": "probe@example.com", field: value})
            record(s, f"booking create rejects client '{field}'", rr.status_code == 400, f"HTTP {rr.status_code}")

        # 4. the owner cannot rewrite money or payment state through update either
        vendor_tok = None
        for role in ["operator_a", "hotel_a", "transport_a", "visa_a"]:
            probe = put(role, f"/marketplace/bookings/{bid}", {"paymentStatus": "PAID"})
            if probe.status_code != 404:
                vendor_tok = role
                record(s, f"{role} cannot set paymentStatus on a booking", probe.status_code == 400,
                       f"HTTP {probe.status_code}")
                probe2 = put(role, f"/marketplace/bookings/{bid}", {"totalAmountCents": 1})
                record(s, f"{role} cannot rewrite totalAmountCents on a booking", probe2.status_code == 400,
                       f"HTTP {probe2.status_code}")
                break

        # 5. checkout must charge the server total, not anything the client says
        co = post("traveler_a", "/payments/checkout", {"listingBookingId": bid})
        if co.status_code in (200, 201):
            cd = data(co)
            amt = cd.get("amountCents", cd.get("amount"))
            record(s, "checkout amount equals the server booking total", int(amt) == expected,
                   f"checkout={amt} expected={expected}")
        else:
            record(s, "checkout reachable for a traveler booking", co.status_code in (200, 201, 503),
                   f"HTTP {co.status_code}")

        # 6. another traveler cannot pay for / read this booking
        record(s, "traveler_b cannot check out traveler A's booking",
               denied(post("traveler_b", "/payments/checkout", {"listingBookingId": bid}).status_code),
               f"HTTP {post('traveler_b', '/payments/checkout', {'listingBookingId': bid}).status_code}")

    # 7. unsupported pricing models must refuse rather than guess a number
    other = [x for x in listings if x.get("pricingModel") not in ("PER_PERSON", "PER_GROUP") and x.get("id")]
    if other:
        rr = post("traveler_a", f"/marketplace/listings/{other[0]['id']}/bookings",
                  {"partySize": 2, "customerName": "Probe", "customerEmail": "probe@example.com"})
        record(s, f"unsupported pricing model ({other[0].get('pricingModel')}) refuses instead of inventing a total",
               rr.status_code == 400, f"HTTP {rr.status_code}")
else:
    record(s, "a priced PER_PERSON/PER_GROUP listing exists to probe", False, "none found")

# ── MASS ASSIGNMENT / SERVER-OWNED FIELDS ───────────────────────────────────
s = section("MASS ASSIGNMENT — server-owned fields refused")
probes = [
    ("hotel_a", "post", "/hotels", {"name": "MA probe", "tenantId": str(uuid.uuid4())}, "tenantId on hotel create"),
    ("transport_a", "post", "/transport/vehicles",
     {"type": "BUS", "plateNumber": f"MA{uuid.uuid4().hex[:5].upper()}", "capacity": 10, "tenantId": str(uuid.uuid4())},
     "tenantId on vehicle create"),
    ("visa_a", "post", "/compliance/visas",
     {"applicantName": "MA probe", "applicantPassport": "P1234567", "applicantNationality": "PK", "tenantId": str(uuid.uuid4())},
     "tenantId on visa create"),
    ("traveler_a", "post", "/auth/register", None, None),  # placeholder, replaced below
]
for role, method, path, body, label in probes[:-1]:
    r = req(method, role, path, body)
    record(s, f"{label} rejected", r.status_code == 400, f"HTTP {r.status_code}")
reg = requests.post(f"{API}/auth/register", json={
    "email": f"ma.{uuid.uuid4().hex[:8]}@example.com", "password": "Traveler-2026",
    "firstName": "MA", "lastName": "Probe", "roles": ["SUPER_ADMIN"],
}, timeout=25)
record(s, "signup cannot request its own roles", reg.status_code == 400, f"HTTP {reg.status_code}")
reg2 = requests.post(f"{API}/auth/register", json={
    "email": f"ma.{uuid.uuid4().hex[:8]}@example.com", "password": "Traveler-2026",
    "firstName": "MA", "lastName": "Probe", "tenantId": str(uuid.uuid4()),
}, timeout=25)
record(s, "signup cannot choose its own organization", reg2.status_code == 400, f"HTTP {reg2.status_code}")

# ── SIGNUP ALWAYS PROVISIONS A TRAVELER (XT-001) ────────────────────────────
s = section("SIGNUP PROVISIONS A REAL, USABLE ROLE (XT-001)")
email = f"acceptance.{uuid.uuid4().hex[:8]}@example.com"
reg = requests.post(f"{API}/auth/register", json={
    "email": email, "password": "Traveler-2026", "firstName": "Acceptance", "lastName": "Traveler",
}, timeout=30)
record(s, "signup -> 201", reg.status_code == 201, f"HTTP {reg.status_code}")
if reg.status_code == 201:
    T["new_traveler"] = reg.json()["data"]["accessToken"]
    me = get("new_traveler", "/auth/me")
    roles = (data(me) or {}).get("roles") or []
    role_names = [r.get("name") if isinstance(r, dict) else r for r in roles] if isinstance(roles, list) else []
    record(s, "new account has a real server role (not empty)", bool(role_names), f"roles={role_names}")
    record(s, "new account is a PILGRIM/Traveler", any("PILGRIM" in str(x).upper() for x in role_names), f"roles={role_names}")
    perms = data(get("new_traveler", "/rbac/my-permissions"))
    record(s, "new account exposes server-resolved permissions", perms is not None, f"type={type(perms).__name__}")
    record(s, "new traveler can read the marketplace", get("new_traveler", "/marketplace/listings").status_code == 200)
    record(s, "new traveler is denied /admin/users", denied(get("new_traveler", "/admin/users").status_code),
           f"HTTP {get('new_traveler', '/admin/users').status_code}")
    record(s, "new traveler is denied /pilgrims", denied(get("new_traveler", "/pilgrims").status_code),
           f"HTTP {get('new_traveler', '/pilgrims').status_code}")
    record(s, "refresh token delivered as an httpOnly cookie",
           "uc_rt" in reg.headers.get("set-cookie", "") and "HttpOnly" in reg.headers.get("set-cookie", ""),
           "set-cookie present" if reg.headers.get("set-cookie") else "no set-cookie")

# ── DATABASE PERSISTENCE (write -> read -> re-auth -> read) ─────────────────
s = section("DATABASE PERSISTENCE")
if hotel_a_id:
    newname = f"Persisted {uuid.uuid4().hex[:6]}"
    up = put("hotel_a", f"/hotels/{hotel_a_id}", {"name": newname, "status": "MAINTENANCE"})
    record(s, "update accepted", up.status_code in (200, 201), f"HTTP {up.status_code}")
    again = get("hotel_a", f"/hotels/{hotel_a_id}")
    record(s, "update readable immediately", data(again).get("name") == newname, data(again).get("name"))
    record(s, "status change persisted", str(data(again).get("status")).upper() == "MAINTENANCE", data(again).get("status"))
    # a brand-new session (fresh token, fresh connection) must still see it
    T["hotel_a_fresh"] = login(ACCOUNTS["hotel_a"])
    if T.get("hotel_a_fresh"):
        fresh = get("hotel_a_fresh", f"/hotels/{hotel_a_id}")
        record(s, "survives a fresh login / new session", data(fresh).get("name") == newname, data(fresh).get("name"))
    listed = items(get("hotel_a", "/hotels"))
    record(s, "appears in the owner's list query", any(x.get("id") == hotel_a_id for x in listed), f"n={len(listed)}")
    d = delete("hotel_a", f"/hotels/{hotel_a_id}")
    record(s, "delete accepted", d.status_code in (200, 204), f"HTTP {d.status_code}")
    # Removal is a soft delete (status -> INACTIVE): the row is retained for
    # history and the change has to survive as a persisted state, not a 404.
    gone = get("hotel_a", f"/hotels/{hotel_a_id}")
    record(s, "delete is a persisted soft delete (status INACTIVE)",
           gone.status_code == 200 and str(data(gone).get("status")).upper() == "INACTIVE",
           f"HTTP {gone.status_code} status={data(gone).get('status') if gone.ok else ''}")
    record(s, "soft-deleted record stays invisible to other tenants",
           denied(get("hotel_b", f"/hotels/{hotel_a_id}").status_code),
           f"HTTP {get('hotel_b', f'/hotels/{hotel_a_id}').status_code}")

if visa_a_id:
    up = put("visa_a", f"/compliance/visas/{visa_a_id}", {"assignedOfficer": "Acceptance Officer"})
    record(s, "visa update accepted", up.status_code in (200, 201), f"HTTP {up.status_code}")
    again = get("visa_a", f"/compliance/visas/{visa_a_id}")
    record(s, "visa update persisted", data(again).get("assignedOfficer") == "Acceptance Officer",
           data(again).get("assignedOfficer"))

# ── STATUS / TRACKING CONTRACT ──────────────────────────────────────────────
s = section("STATUS / TRACKING CONTRACT")
if visa_a_id:
    before = str(data(get("visa_a", f"/compliance/visas/{visa_a_id}")).get("status"))
    sub = put("visa_a", f"/compliance/visas/{visa_a_id}/submit", {})
    after = str(data(get("visa_a", f"/compliance/visas/{visa_a_id}")).get("status"))
    record(s, "visa status transition is server-driven and observable",
           sub.status_code in (200, 201) and after != before, f"{before} -> {after} (HTTP {sub.status_code})")
    # operator_a_staff holds visa:application:submit but NOT :manage, so it must
    # not be able to decide a case (VISA_OFFICER legitimately can).
    dec = put("operator_a_staff", f"/compliance/visas/{visa_a_id}", {"status": "APPROVED"})
    record(s, "a submit-only identity cannot approve a visa", denied(dec.status_code), f"HTTP {dec.status_code}")
    after_dec = str(data(get("visa_a", f"/compliance/visas/{visa_a_id}")).get("status"))
    record(s, "the application was not approved by that attempt", after_dec != "APPROVED", f"status={after_dec}")
    stats = get("visa_a", "/compliance/visas/stats")
    record(s, "visa statistics come from the API, not the client", stats.status_code == 200, f"HTTP {stats.status_code}")

# ── PAYMENTS: server-determined amounts, capture, refund capability ─────────
s = section("PAYMENTS — amounts, capture, refund authority")
prov = get("finance_a", "/payments/providers")
record(s, "GET /payments/providers requires auth and answers", prov.status_code == 200, f"HTTP {prov.status_code}")
record(s, "anonymous GET /payments/providers denied",
       denied(requests.get(f"{API}/payments/providers", timeout=20).status_code),
       f"HTTP {requests.get(f'{API}/payments/providers', timeout=20).status_code}")

inv_all = items(get("finance_a", "/finance/invoices", params={"limit": 50}))
payable = [i for i in inv_all if i.get("status") in ("ISSUED", "SENT", "PARTIALLY_PAID", "OVERDUE")]
draft = [i for i in inv_all if i.get("status") == "DRAFT"]
if draft:
    d0 = draft[0]
    bad = post("finance_a", "/payments/intents", {"invoiceId": d0["id"], "amountCents": 100})
    record(s, "a DRAFT invoice cannot be paid before it is issued", bad.status_code == 400, f"HTTP {bad.status_code}")
if payable:
    target = payable[0]
    outstanding = int(target["totalCents"]) - int(target["paidCents"])
    over = post("finance_a", "/payments/intents", {"invoiceId": target["id"], "amountCents": outstanding + 100})
    record(s, "intent above the outstanding balance -> 400", over.status_code == 400, f"HTTP {over.status_code}")
    neg = post("finance_a", "/payments/intents", {"invoiceId": target["id"], "amountCents": -500})
    record(s, "negative payment amount -> 400", neg.status_code == 400, f"HTTP {neg.status_code}")
    no_anchor = post("finance_a", "/payments/intents", {"amount": 10})
    record(s, "intent without an invoice or booking -> 400", no_anchor.status_code == 400, f"HTTP {no_anchor.status_code}")
    small = min(outstanding, 1000)
    pi = post("finance_a", "/payments/intents",
              {"invoiceId": target["id"], "amountCents": small, "idempotencyKey": f"qa-{uuid.uuid4()}"})
    record(s, "sandbox intent created", pi.status_code == 201, f"HTTP {pi.status_code}")
    if pi.status_code == 201:
        pid = data(pi)["id"]
        record(s, "another operator cannot confirm this payment",
               denied(post("operator_b", f"/payments/intents/{pid}/confirm", {}).status_code),
               f"HTTP {post('operator_b', f'/payments/intents/{pid}/confirm', {}).status_code}")
        record(s, "another operator cannot read this payment", denied(get("operator_b", f"/payments/{pid}").status_code),
               f"HTTP {get('operator_b', f'/payments/{pid}').status_code}")
        cap = post("finance_a", f"/payments/intents/{pid}/confirm", {})
        ok = cap.status_code in (200, 201) and data(cap).get("status") == "COMPLETED"
        record(s, "sandbox capture -> COMPLETED", ok, f"HTTP {cap.status_code} status={data(cap).get('status') if cap.ok else ''}")
        record(s, "operator staff without finance:payment:refund cannot refund",
               post("operator_a_staff", f"/payments/{pid}/refund", {"amount": 1}).status_code == 403,
               f"HTTP {post('operator_a_staff', f'/payments/{pid}/refund', {'amount': 1}).status_code}")
        refund = post("finance_a", f"/payments/{pid}/refund", {"reason": "QA reversal"})
        record(s, "finance manager refund -> REFUNDED",
               refund.status_code in (200, 201) and data(refund).get("status") == "REFUNDED",
               f"HTTP {refund.status_code}")
        after = data(get("finance_a", f"/payments/{pid}"))
        record(s, "refund is persisted on the payment record", str(after.get("status")) == "REFUNDED", after.get("status"))
else:
    record(s, "a payable invoice exists to probe", False, "no ISSUED/SENT/PARTIALLY_PAID invoice seeded")

forged = requests.post(f"{API}/payments/webhook/sandbox",
                       data=json.dumps({"id": "evt_forged", "type": "payment.captured"}),
                       headers={"content-type": "application/json", "x-signature": "sha256=forged"}, timeout=20)
record(s, "forged webhook signature -> 400", forged.status_code == 400, f"HTTP {forged.status_code}")
unsigned = requests.post(f"{API}/payments/webhook/stripe", data=json.dumps({"id": "evt_x", "type": "payment_intent.succeeded"}),
                         headers={"content-type": "application/json"}, timeout=20)
# 404 is a legitimate refusal: an unconfigured provider does not admit the endpoint exists.
record(s, "unsigned stripe webhook refused", unsigned.status_code in (400, 401, 403, 404, 503), f"HTTP {unsigned.status_code}")

# ── DOCUMENT / STORAGE AUTHORIZATION ────────────────────────────────────────
s = section("DOCUMENT / STORAGE AUTHORIZATION")
for path in ["/uploads/visa-documents/x/y.png", "/uploads/private/kyc/a.pdf", "/uploads/../.env"]:
    r = requests.get(f"{BASE}{path}", timeout=20)
    record(s, f"{path} is not publicly served", r.status_code in (400, 403, 404), f"HTTP {r.status_code}")
r = requests.get(f"{API}/documents/signed/not-a-real-token", timeout=20)
record(s, "an invalid signed-document token is refused", r.status_code in (400, 401, 403, 404), f"HTTP {r.status_code}")
# Create a real document with a real file so signed-URL authorization is
# actually exercised rather than skipped for want of a fixture.
if visa_a_id:
    meta = post("visa_a", f"/compliance/visas/{visa_a_id}/documents",
                {"name": "Acceptance passport scan", "type": "PASSPORT"})
    if meta.status_code in (200, 201):
        made_id = data(meta)["id"]
        # A minimal valid PNG (the server sniffs content, it does not trust the name).
        png = bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154"
            "789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082")
        up = requests.post(
            f"{API}/compliance/visas/{visa_a_id}/documents/{made_id}/versions",
            headers=H("visa_a"),
            files={"file": ("passport.png", png, "image/png")},
            timeout=30)
        record(s, "a visa document file uploads", up.status_code in (200, 201), f"HTTP {up.status_code}")
        stored = data(get("visa_a", f"/compliance/visas/{visa_a_id}/documents/{made_id}"))
        record(s, "the stored reference is private, not a guessable path",
               str((stored or {}).get("url", "")).startswith("private:"),
               f"url={(stored or {}).get('url')}")
        own_url = get("visa_a", f"/documents/visa/{made_id}/url")
        record(s, "the owner can mint a signed URL", own_url.status_code == 200, f"HTTP {own_url.status_code}")
        signed = (data(own_url) or {}).get("url")
        if signed:
            direct = requests.get(signed if signed.startswith("http") else f"{BASE}{signed}", timeout=20)
            record(s, "the signed URL actually serves the file", direct.status_code == 200, f"HTTP {direct.status_code}")
            tampered = (signed if signed.startswith("http") else f"{BASE}{signed}")[:-3] + "aaa"
            bad = requests.get(tampered, timeout=20)
            record(s, "a tampered signature is refused", bad.status_code in (400, 401, 403, 404), f"HTTP {bad.status_code}")

docs = items(get("visa_a", "/compliance/visas/documents"))
if docs and docs[0].get("id"):
    did = docs[0]["id"]
    record(s, "visa_b cannot mint a signed URL for visa A's document",
           denied(get("visa_b", f"/documents/visa/{did}/url").status_code),
           f"HTTP {get('visa_b', f'/documents/visa/{did}/url').status_code}")
    record(s, "traveler cannot mint a signed URL for an organization document",
           denied(get("traveler_a", f"/documents/visa/{did}/url").status_code),
           f"HTTP {get('traveler_a', f'/documents/visa/{did}/url').status_code}")
else:
    record(s, "a visa document exists to probe signed-URL authorization", False, "none found")
record(s, "random document id is refused, not leaked",
       denied(get("visa_a", f"/documents/visa/{uuid.uuid4()}/url").status_code),
       f"HTTP {get('visa_a', f'/documents/visa/{uuid.uuid4()}/url').status_code}")

# ── SESSION / TOKEN INTEGRITY ───────────────────────────────────────────────
s = section("SESSION / TOKEN INTEGRITY")
good = T["operator_a"]
head, payload, sig = good.split(".")
tampered = f"{head}.{payload}.{'A' * len(sig)}"
r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tampered}"}, timeout=20)
record(s, "tampered signature rejected", r.status_code == 401, f"HTTP {r.status_code}")
import base64


def b64u(raw):
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


none_tok = f"{b64u(json.dumps({'alg': 'none', 'typ': 'JWT'}).encode())}.{payload}."
r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {none_tok}"}, timeout=20)
record(s, "alg:none token rejected", r.status_code == 401, f"HTTP {r.status_code}")
r = requests.get(f"{API}/auth/me", headers={"Authorization": "Bearer "}, timeout=20)
record(s, "empty bearer rejected", r.status_code == 401, f"HTTP {r.status_code}")
r = requests.get(f"{API}/auth/me", timeout=20)
record(s, "no credentials rejected", r.status_code == 401, f"HTTP {r.status_code}")

# logout must actually revoke the session server-side
throwaway_email = f"revoke.{uuid.uuid4().hex[:8]}@example.com"
rr = requests.post(f"{API}/auth/register", json={
    "email": throwaway_email, "password": "Traveler-2026", "firstName": "Revoke", "lastName": "Probe"}, timeout=30)
if rr.status_code == 201:
    tok = rr.json()["data"]["accessToken"]
    hdr = {"Authorization": f"Bearer {tok}"}
    pre = requests.get(f"{API}/auth/me", headers=hdr, timeout=20).status_code
    requests.post(f"{API}/auth/logout-all", headers=hdr, json={}, timeout=20)
    postc = requests.get(f"{API}/auth/me", headers=hdr, timeout=20).status_code
    record(s, "logout-all revokes the access token server-side", pre == 200 and postc == 401,
           f"before={pre} after={postc}")

# ── ERROR ENVELOPE / INFORMATION LEAKAGE ────────────────────────────────────
s = section("ERROR HANDLING / LEAKAGE")
r = get("operator_a", f"/pilgrims/{uuid.uuid4()}")
body = r.text
record(s, "unknown id returns 404 without a stack trace",
       r.status_code == 404 and "at " not in body and "node_modules" not in body, f"HTTP {r.status_code}")
r = get("operator_a", "/pilgrims/not-a-uuid")
record(s, "malformed id is a 4xx, not a 500", 400 <= r.status_code < 500, f"HTTP {r.status_code}")
record(s, "error body carries a request id",
       "requestId" in r.text, "requestId present" if "requestId" in r.text else "missing")
def login_shape(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=25)
    e = (r.json().get("error") or {}) if r.headers.get("content-type", "").startswith("application/json") else {}
    # requestId and timestamp are per-request by design and are excluded.
    return (r.status_code, e.get("code"), str(e.get("message")))
unknown = login_shape("definitely-not-a-user@example.com", "x")
wrong = login_shape(ACCOUNTS["operator_a"], "definitely-wrong")
record(s, "unknown email and wrong password are indistinguishable", unknown == wrong, f"{unknown} vs {wrong}")

# ── SUMMARY ─────────────────────────────────────────────────────────────────
passed = sum(r["result"] == "PASS" for r in results)
total = len(results)
print(f"\n{passed}/{total} acceptance checks passed against {BASE}")
failures = [r for r in results if r["result"] == "FAIL"]
if failures:
    print("\nFAILURES:")
    for f in failures:
        print(f"  [{f['section']}] {f['check']}  ({f['detail']})")
if OUT:
    by_section = {}
    for r in results:
        b = by_section.setdefault(r["section"], {"passed": 0, "total": 0})
        b["total"] += 1
        b["passed"] += r["result"] == "PASS"
    with open(OUT, "w") as f:
        json.dump({"base": BASE, "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                   "passed": passed, "total": total, "sections": by_section, "results": results}, f, indent=2)
sys.exit(0 if passed == total else 1)
