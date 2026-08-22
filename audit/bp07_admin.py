#!/usr/bin/env python3
"""BP-07: Super Admin — Tenants & Users management.

Proves the management surface end-to-end (status changes, archive, role
grant/revoke, session revocation, CSV export, per-entity audit trail) and
red-teams every privileged mutation: bad input must 4xx and never 5xx, and
an operation that changed nothing must never report success.

Usage: python3 bp07_admin.py [API_URL]
"""
import requests, sys, csv, io, uuid

API = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4000/api/v1"
T = requests.post(f"{API}/auth/login", json={
    "email": "admin@alharamain.sa", "password": "Admin@1234"}).json()["data"]["accessToken"]
H = {"Authorization": f"Bearer {T}", "Content-Type": "application/json"}
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

# ── fixtures ─────────────────────────────────────────────────────────────
tenants = gd(requests.get(f"{API}/admin/tenants?limit=100", headers=H))["items"]
users   = gd(requests.get(f"{API}/admin/users?limit=100", headers=H))["items"]
roles   = gd(requests.get(f"{API}/admin/roles", headers=H))
HOME    = next(t for t in tenants if t["slug"] == "al-haramain-ksa")
OTHER   = next(t for t in tenants if t["id"] != HOME["id"])
officer = next(u for u in users if u.get("email") == "visa.officer@alharamain.sa")
foreign = next(u for u in users if u["tenantId"] != HOME["id"])
home_role = next((r for r in roles if r.get("tenantId") == HOME["id"]), None)
chk("fixtures resolved (tenants/users/roles)", all([HOME, OTHER, officer, foreign, home_role]),
    f"({len(tenants)} tenants, {len(users)} users, {len(roles)} roles)")

def audit_rows(resource, rid):
    d = gd(requests.get(f"{API}/admin/audit-logs?resource={resource}&limit=200", headers=H))
    rows = d.get("items", d) if isinstance(d, dict) else d
    return [r for r in rows if r.get("resourceId") == rid]

# ── TENANTS: status lifecycle (on a tenant that is NOT the caller's own) ──
a_before = len(audit_rows("tenant", OTHER["id"]))
other_admin = next(u for u in users if u["tenantId"] == OTHER["id"] and u.get("email"))
r = requests.put(f"{API}/admin/tenants/{OTHER['id']}/status", headers=H,
                 json={"status": "SUSPENDED", "reason": "BP-07 verification"})
chk("tenant → SUSPENDED", r.status_code == 200 and gd(r).get("status") == "SUSPENDED", f"({r.status_code})")
fresh = next(t for t in gd(requests.get(f"{API}/admin/tenants?limit=100", headers=H))["items"] if t["id"] == OTHER["id"])
chk("suspension persists on re-fetch", fresh["status"] == "SUSPENDED", fresh["status"])
f_susp = gd(requests.get(f"{API}/admin/tenants?status=SUSPENDED&limit=100", headers=H))["items"]
chk("filter status=SUSPENDED finds it", any(t["id"] == OTHER["id"] for t in f_susp), f"({len(f_susp)})")
f_q = gd(requests.get(f"{API}/admin/tenants?search=Haramain&limit=100", headers=H))["items"]
chk("search by name", any(t["id"] == HOME["id"] for t in f_q), f"({len(f_q)} match)")

# suspension is enforced, not cosmetic: that tenant's user is locked out
tok = requests.post(f"{API}/auth/login", json={"email": other_admin["email"], "password": "Admin@1234"})
locked = requests.get(f"{API}/pilgrims", headers={"Authorization": f"Bearer {gd(tok).get('accessToken')}"}) \
    if tok.status_code == 200 else tok
chk("SUSPENDED tenant is actually enforced (its user is locked out)",
    locked.status_code == 401, f"({locked.status_code} {locked.json().get('error',{}).get('message','')[:40]})")

r = requests.put(f"{API}/admin/tenants/{OTHER['id']}/status", headers=H, json={"status": "ACTIVE"})
chk("reactivate → ACTIVE", r.status_code == 200 and gd(r).get("status") == "ACTIVE", f"({r.status_code})")
tok2 = requests.post(f"{API}/auth/login", json={"email": other_admin["email"], "password": "Admin@1234"})
back = requests.get(f"{API}/pilgrims", headers={"Authorization": f"Bearer {gd(tok2).get('accessToken')}"})
chk("reactivation restores that tenant's access", back.status_code == 200, f"({back.status_code})")
chk("tenant status changes are audited", len(audit_rows("tenant", OTHER["id"])) >= a_before + 2,
    f"({len(audit_rows('tenant', OTHER['id']))} rows)")

# archive round-trip on a throwaway tenant (was a guaranteed 500 before)
THIRD = next(t for t in tenants if t["id"] not in (HOME["id"], OTHER["id"]))
detail = gd(requests.get(f"{API}/admin/tenants/{THIRD['id']}", headers=H))
chk("tenant detail returns users + kyc + counts",
    "users" in detail and "_count" in detail, f"({detail.get('_count', {}).get('users')} users)")
r = requests.delete(f"{API}/admin/tenants/{THIRD['id']}", headers=H)
arch = gd(r)
chk("archive tenant (was 500: 'INACTIVE' is not a TenantStatus)",
    r.status_code == 200 and arch.get("status") == "CHURNED" and arch.get("deletedAt"),
    f"({r.status_code} → {arch.get('status')})")
rt("archive an already-archived tenant → 400", requests.delete(f"{API}/admin/tenants/{THIRD['id']}", headers=H), 400)
requests.put(f"{API}/admin/tenants/{THIRD['id']}/status", headers=H, json={"status": "ACTIVE"})
restored = gd(requests.get(f"{API}/admin/tenants/{THIRD['id']}", headers=H))
chk("archived tenant can be reactivated", restored.get("status") == "ACTIVE")
chk("reactivation clears deletedAt (no ACTIVE-and-archived limbo)",
    restored.get("deletedAt") is None, f"(deletedAt={restored.get('deletedAt')})")

# ── USERS: status, sessions, roles ───────────────────────────────────────
u_before = len(audit_rows("user", officer["id"]))
r = requests.put(f"{API}/admin/users/{officer['id']}/status", headers=H,
                 json={"status": "LOCKED", "reason": "BP-07 verification"})
chk("user → LOCKED", r.status_code == 200 and gd(r).get("status") == "LOCKED", f"({r.status_code})")
again = next(u for u in gd(requests.get(f"{API}/admin/users?search=visa.officer", headers=H))["items"])
chk("user status persists on re-fetch", again["status"] == "LOCKED", again["status"])
r = requests.put(f"{API}/admin/users/{officer['id']}/status", headers=H, json={"status": "ACTIVE"})
chk("reactivate user → ACTIVE", r.status_code == 200 and gd(r).get("status") == "ACTIVE", f"({r.status_code})")
chk("user status changes are audited", len(audit_rows("user", officer["id"])) >= u_before + 2,
    f"({len(audit_rows('user', officer['id']))} rows)")

# force logout must report the real number of revoked sessions
sess = requests.post(f"{API}/auth/login", json={"email": "visa.officer@alharamain.sa", "password": "Officer@1234"})
chk("officer can obtain a session", sess.status_code == 200, f"({sess.status_code})")
r = requests.post(f"{API}/admin/users/{officer['id']}/force-logout", headers=H)
fl = gd(r)
chk("force-logout reports sessions actually revoked (not a bare ok)",
    r.status_code in (200, 201) and fl.get("sessionsRevoked", 0) >= 1, f"({fl.get('sessionsRevoked')} revoked)")
refresh = requests.post(f"{API}/auth/refresh", json={"refreshToken": gd(sess).get("refreshToken")})
chk("revoked refresh token is rejected", refresh.status_code >= 400, f"({refresh.status_code})")
r = requests.post(f"{API}/admin/users/{officer['id']}/force-logout", headers=H)
chk("second force-logout honestly reports 0", gd(r).get("sessionsRevoked") == 0, f"({gd(r).get('sessionsRevoked')})")

# role grant / revoke
requests.delete(f"{API}/admin/users/{officer['id']}/roles/{home_role['id']}", headers=H)
r = requests.post(f"{API}/admin/users/{officer['id']}/roles", headers=H, json={"roleId": home_role["id"]})
chk("grant role", r.status_code in (200, 201), f"({r.status_code})")
after = next(u for u in gd(requests.get(f"{API}/admin/users?search=visa.officer", headers=H))["items"])
chk("granted role shows on the user", any(x["id"] == home_role["id"] for x in after.get("roles", [])),
    str([x["name"] for x in after.get("roles", [])]))
chk("role grant is audited", len(audit_rows("user_role", officer["id"])) >= 1,
    f"({len(audit_rows('user_role', officer['id']))} rows)")
r = requests.delete(f"{API}/admin/users/{officer['id']}/roles/{home_role['id']}", headers=H)
chk("revoke role", r.status_code == 200 and gd(r).get("revoked"), f"({r.status_code} {gd(r).get('revoked')})")
after2 = next(u for u in gd(requests.get(f"{API}/admin/users?search=visa.officer", headers=H))["items"])
chk("revoked role is gone on re-fetch", not any(x["id"] == home_role["id"] for x in after2.get("roles", [])))

# ── EXPORT ───────────────────────────────────────────────────────────────
r = requests.get(f"{API}/admin/tenants/export", headers=H)
chk("tenants CSV export", r.status_code == 200 and "text/csv" in r.headers.get("content-type", ""),
    f"({r.status_code} {r.headers.get('content-type','')})")
rows = list(csv.reader(io.StringIO(r.text)))
chk("tenants CSV has a header + one row per tenant", rows and rows[0][0] == "id" and len(rows) - 1 == len(tenants),
    f"({len(rows)-1} rows vs {len(tenants)} tenants)")
chk("tenants CSV attachment filename set",
    "filename=" in r.headers.get("content-disposition", ""), r.headers.get("content-disposition", ""))
r = requests.get(f"{API}/admin/users/export?status=ACTIVE", headers=H)
urows = list(csv.reader(io.StringIO(r.text)))
chk("users CSV export honours the filter",
    r.status_code == 200 and urows[0][0] == "id" and all(x[5] == "ACTIVE" for x in urows[1:]),
    f"({len(urows)-1} rows)")
chk("exports are audited as DATA_EXPORT",
    len(audit_rows("tenant", "export")) >= 1 and len(audit_rows("user", "export")) >= 1)

# ── RED TEAM ─────────────────────────────────────────────────────────────
rt("tenant status: invalid enum → 400 (was 500)",
   requests.put(f"{API}/admin/tenants/{HOME['id']}/status", headers=H, json={"status": "NOT_A_STATUS"}), 400)
rt("tenant status: legacy 'INACTIVE' → 400 (was 500)",
   requests.put(f"{API}/admin/tenants/{HOME['id']}/status", headers=H, json={"status": "INACTIVE"}), 400)
rt("tenant status: empty body → 400 (was a silent 200 no-op)",
   requests.put(f"{API}/admin/tenants/{HOME['id']}/status", headers=H, json={}), 400)
rt("tenant status: same status → 400",
   requests.put(f"{API}/admin/tenants/{HOME['id']}/status", headers=H, json={"status": "ACTIVE"}), 400)
rt("suspending YOUR OWN tenant → 400 (self-lockout guard)",
   requests.put(f"{API}/admin/tenants/{HOME['id']}/status", headers=H, json={"status": "SUSPENDED"}), 400)
rt("archiving YOUR OWN tenant → 400 (self-lockout guard)",
   requests.delete(f"{API}/admin/tenants/{HOME['id']}", headers=H), 400)
rt("tenant status: unknown tenant → 404",
   requests.put(f"{API}/admin/tenants/{BOGUS}/status", headers=H, json={"status": "ACTIVE"}), 404)
rt("user status: invalid enum → 400 (was 500)",
   requests.put(f"{API}/admin/users/{officer['id']}/status", headers=H, json={"status": "WAT"}), 400)
rt("user status: legacy 'SUSPENDED' → 400 (was 500)",
   requests.put(f"{API}/admin/users/{officer['id']}/status", headers=H, json={"status": "SUSPENDED"}), 400)
rt("user status: empty body → 400 (was a silent 200 no-op)",
   requests.put(f"{API}/admin/users/{officer['id']}/status", headers=H, json={}), 400)
rt("user status: unknown user → 404 (was 500)",
   requests.put(f"{API}/admin/users/{BOGUS}/status", headers=H, json={"status": "ACTIVE"}), 404)
rt("force-logout unknown user → 404 (was a lying 201 ok)",
   requests.post(f"{API}/admin/users/{BOGUS}/force-logout", headers=H), 404)
rt("assign unknown role → 404 (was 500)",
   requests.post(f"{API}/admin/users/{officer['id']}/roles", headers=H, json={"roleId": BOGUS}), 404)
rt("assign role to unknown user → 404 (was 500)",
   requests.post(f"{API}/admin/users/{BOGUS}/roles", headers=H, json={"roleId": home_role['id']}), 404)
rt("assign a malformed roleId → 400",
   requests.post(f"{API}/admin/users/{officer['id']}/roles", headers=H, json={"roleId": "nope"}), 400)
rt("CROSS-TENANT role grant → 400 (was accepted 201)",
   requests.post(f"{API}/admin/users/{foreign['id']}/roles", headers=H, json={"roleId": home_role['id']}), 400)
rt("revoke a role the user never had → 404 (was a lying 200 ok)",
   requests.delete(f"{API}/admin/users/{officer['id']}/roles/{BOGUS}", headers=H), 404)
rt("archive unknown tenant → 404", requests.delete(f"{API}/admin/tenants/{BOGUS}", headers=H), 404)
rt("unauth tenants list → 401", requests.get(f"{API}/admin/tenants"), 401)
rt("unauth users list → 401", requests.get(f"{API}/admin/users"), 401)
rt("unauth export → 401", requests.get(f"{API}/admin/tenants/export"), 401)
rt("unauth force-logout → 401", requests.post(f"{API}/admin/users/{officer['id']}/force-logout"), 401)

# duplicate grant guard
requests.post(f"{API}/admin/users/{officer['id']}/roles", headers=H, json={"roleId": home_role['id']})
rt("granting a role twice → 400", requests.post(f"{API}/admin/users/{officer['id']}/roles", headers=H,
   json={"roleId": home_role['id']}), 400)
requests.delete(f"{API}/admin/users/{officer['id']}/roles/{home_role['id']}", headers=H)

print(f"\nBP-07: {ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
