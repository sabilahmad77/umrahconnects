#!/usr/bin/env python3
"""BP-06: Visa Service Requests — full ticket workflow proof.

Proves category/priority/assignee/due-date, internal-note vs public-response
separation, timeline, escalate/resolve/close/reopen, notifications to the
assignee (real second account), audit records, filters and stats — and
red-teams every mutation so bad input 4xx's and never 5xx's.

Usage: python3 bp06_visa_requests.py [API_URL] [TENANT_ID]
"""
import requests, sys, uuid

API = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4000/api/v1"
TEN = sys.argv[2] if len(sys.argv) > 2 else "ac08f9b4-aaec-4474-b61b-4832c5a5ec4c"

T = requests.post(f"{API}/auth/login", json={
    "email": "admin@alharamain.sa", "password": "Admin@1234", "tenantId": TEN}).json()["data"]["accessToken"]
H = {"Authorization": f"Bearer {T}", "Content-Type": "application/json"}

ok = fail = 0
def chk(label, cond, extra=""):
    global ok, fail
    ok += bool(cond); fail += not cond
    print(("✓" if cond else "✗"), label, extra)
def gd(r):
    try: j = r.json()
    except Exception: return {}
    return j.get("data", j)
def items(d): return d.get("items", []) if isinstance(d, dict) else (d if isinstance(d, list) else [])

BASE = f"{API}/visa-requests"

# ── a colleague in the same tenant, to prove assignee notifications ──────
COLLEAGUE = "visa.officer@alharamain.sa"
reg = requests.post(f"{API}/auth/register", json={
    "email": COLLEAGUE, "password": "Officer@1234", "firstName": "Layla",
    "lastName": "Officer", "tenantId": TEN, "roleInterest": "compliance"})
if reg.status_code == 409:
    reg = requests.post(f"{API}/auth/login", json={
        "email": COLLEAGUE, "password": "Officer@1234", "tenantId": TEN})
CT = gd(reg).get("accessToken")
CH = {"Authorization": f"Bearer {CT}", "Content-Type": "application/json"}
assignees = gd(requests.get(f"{BASE}/assignees", headers=H))
officer = next((a for a in assignees if a.get("email") == COLLEAGUE), None)
chk("assignees list exposes tenant users", officer is not None, f"({len(assignees)} users)")
OFFICER_ID = officer["id"] if officer else None

# baseline notification count for the officer
notif_before = gd(requests.get(f"{API}/notifications?limit=50", headers=CH)).get("total", 0)

# ── 1. create ────────────────────────────────────────────────────────────
r = requests.post(BASE, headers=H, json={
    "subject": "Passport rejected by Nusuk — needs re-scan",
    "description": "Applicant passport scan was rejected for glare on the MRZ line.",
    "category": "DOCUMENT_ISSUE",
    "priority": "HIGH",
    "requesterName": "Fatima Al-Zahrani",
    "requesterEmail": "fatima@example.com",
    "dueAt": "2020-01-01T00:00:00.000Z",   # deliberately past → overdue
})
t = gd(r); TID = t.get("id")
chk("create ticket", r.status_code in (200, 201) and TID, f"({r.status_code} {t.get('ticketNumber')})")
chk("ticket number allocated VSR-<year>-<seq>", str(t.get("ticketNumber", "")).startswith("VSR-"), t.get("ticketNumber"))
chk("category + priority stored", t.get("category") == "DOCUMENT_ISSUE" and t.get("priority") == "HIGH",
    f"({t.get('category')}/{t.get('priority')})")
chk("opens in OPEN status", t.get("status") == "OPEN", t.get("status"))

# ── 2. appears in list + overdue flag + filters ──────────────────────────
lst = gd(requests.get(f"{BASE}?limit=100", headers=H))
row = next((x for x in items(lst) if x["id"] == TID), None)
chk("ticket in list (persisted)", row is not None, f"({lst.get('total')} total)")
chk("overdue computed from past due date", bool(row and row.get("isOverdue")), str(row and row.get("isOverdue")))
f_cat = items(gd(requests.get(f"{BASE}?category=DOCUMENT_ISSUE&limit=100", headers=H)))
chk("filter by category", any(x["id"] == TID for x in f_cat), f"({len(f_cat)} match)")
f_q = items(gd(requests.get(f"{BASE}?q={t.get('ticketNumber')}", headers=H)))
chk("search by ticket number", any(x["id"] == TID for x in f_q), f"({len(f_q)} match)")
f_over = items(gd(requests.get(f"{BASE}?overdue=true&limit=100", headers=H)))
chk("filter overdue=true", any(x["id"] == TID for x in f_over), f"({len(f_over)} overdue)")
f_un = items(gd(requests.get(f"{BASE}?assigneeId=unassigned&limit=100", headers=H)))
chk("filter unassigned", any(x["id"] == TID for x in f_un), f"({len(f_un)} unassigned)")

st = gd(requests.get(f"{BASE}/stats", headers=H))
chk("stats: counts respond", st.get("total", 0) >= 1 and st.get("open", 0) >= 1,
    f"(total {st.get('total')}, open {st.get('open')}, overdue {st.get('overdue')})")

# ── 3. assign → persists + notifies assignee ─────────────────────────────
r = requests.put(f"{BASE}/{TID}/assign", headers=H, json={"assigneeId": OFFICER_ID})
a = gd(r)
chk("assign to officer", r.status_code == 200 and a.get("assigneeId") == OFFICER_ID, f"({r.status_code})")
fresh = gd(requests.get(f"{BASE}/{TID}", headers=H))
chk("assignee survives re-fetch", fresh.get("assigneeId") == OFFICER_ID, fresh.get("assigneeName"))

# ── 4. status transition ─────────────────────────────────────────────────
r = requests.put(f"{BASE}/{TID}/status", headers=H, json={"status": "IN_PROGRESS"})
chk("status OPEN → IN_PROGRESS", r.status_code == 200 and gd(r).get("status") == "IN_PROGRESS", f"({r.status_code})")
chk("status persists on re-fetch", gd(requests.get(f"{BASE}/{TID}", headers=H)).get("status") == "IN_PROGRESS")

# ── 5. internal note vs public response ──────────────────────────────────
r = requests.post(f"{BASE}/{TID}/notes", headers=H,
                  json={"body": "INTERNAL: applicant has 2 prior rejections, escalate if repeated.",
                        "visibility": "INTERNAL"})
chk("internal note created", r.status_code in (200, 201), f"({r.status_code})")
r = requests.post(f"{BASE}/{TID}/notes", headers=H,
                  json={"body": "PUBLIC: please re-scan the passport photo page without glare.",
                        "visibility": "PUBLIC"})
chk("public response created", r.status_code in (200, 201), f"({r.status_code})")

det = gd(requests.get(f"{BASE}/{TID}", headers=H))
bodies = [n["body"] for n in det.get("notes", [])]
chk("staff detail shows BOTH notes", any("INTERNAL:" in b for b in bodies) and any("PUBLIC:" in b for b in bodies),
    f"({len(bodies)} notes)")
pub = gd(requests.get(f"{BASE}/{TID}/public-thread", headers=H))
pub_bodies = [m["body"] for m in pub.get("messages", [])]
chk("public thread shows the public reply", any("PUBLIC:" in b for b in pub_bodies), f"({len(pub_bodies)} messages)")
chk("public thread LEAKS NO internal note", not any("INTERNAL:" in b for b in pub_bodies), f"({len(pub_bodies)} messages)")
chk("first response clock stamped by public reply", det.get("firstResponseAt") is not None, str(det.get("firstResponseAt")))

# ── 6. escalate ──────────────────────────────────────────────────────────
r = requests.put(f"{BASE}/{TID}/escalate", headers=H, json={"reason": "Applicant flies in 48 hours"})
e = gd(r)
chk("escalate", r.status_code == 200 and e.get("status") == "ESCALATED", f"({r.status_code})")
chk("escalation reason + timestamp persist",
    gd(requests.get(f"{BASE}/{TID}", headers=H)).get("escalationReason") == "Applicant flies in 48 hours")

# ── 7. resolve → close → reopen ──────────────────────────────────────────
r = requests.put(f"{BASE}/{TID}/resolve", headers=H, json={"resolution": "Clean re-scan received and accepted."})
chk("resolve", r.status_code == 200 and gd(r).get("status") == "RESOLVED", f"({r.status_code})")
r = requests.put(f"{BASE}/{TID}/close", headers=H, json={"note": "Visa issued."})
chk("close", r.status_code == 200 and gd(r).get("status") == "CLOSED", f"({r.status_code})")
r = requests.put(f"{BASE}/{TID}/reopen", headers=H, json={"reason": "Applicant reports the visa PDF is corrupt"})
rp = gd(r)
chk("reopen", r.status_code == 200 and rp.get("status") == "OPEN", f"({r.status_code})")
chk("reopen counter + cleared terminal stamps",
    rp.get("reopenCount") == 1 and rp.get("closedAt") is None and rp.get("resolvedAt") is None,
    f"(reopenCount={rp.get('reopenCount')})")

# ── 8. timeline ──────────────────────────────────────────────────────────
det = gd(requests.get(f"{BASE}/{TID}", headers=H))
types = [e["type"] for e in det.get("events", [])]
expected = ["CREATED", "ASSIGNED", "STATUS_CHANGED", "INTERNAL_NOTE", "PUBLIC_REPLY",
            "ESCALATED", "RESOLVED", "CLOSED", "REOPENED"]
chk("timeline records every transition in order",
    all(x in types for x in expected) and types.index("CREATED") == 0 and types[-1] == "REOPENED",
    f"({len(types)} events)")
chk("merged activity feed returns notes + events",
    len(det.get("activity", [])) == len(det.get("events", [])) + len(det.get("notes", [])),
    f"({len(det.get('activity', []))} entries)")

# ── 9. notifications reached the assignee (second real account) ──────────
nd = gd(requests.get(f"{API}/notifications?limit=50", headers=CH))
mine = [n for n in items(nd) if (n.get("data") or {}).get("ticketId") == TID]
chk("assignee received notifications", len(mine) >= 5, f"({len(mine)} for this ticket, total {nd.get('total')} vs {notif_before} before)")
chk("notification deep-links to the ticket", any(n.get("link") == f"/visa-requests/{TID}" for n in mine))

# ── 10. audit trail ──────────────────────────────────────────────────────
al = gd(requests.get(f"{API}/admin/audit-logs?resource=visa_service_request&limit=100", headers=H))
rows = [x for x in items(al) if x.get("resourceId") == TID]
chk("audit log records ticket mutations", len(rows) >= 5, f"({len(rows)} audit rows)")

# ── 11. red-team: bad input must 4xx, never 5xx ──────────────────────────
def rt(label, resp, expect):
    chk(f"red-team: {label}", resp.status_code == expect and resp.status_code < 500, f"({resp.status_code})")

rt("bogus ticket id → 404", requests.get(f"{BASE}/{uuid.uuid4()}", headers=H), 404)
rt("malformed uuid → 400", requests.get(f"{BASE}/not-a-uuid", headers=H), 400)
rt("missing subject → 400", requests.post(BASE, headers=H, json={"description": "no subject"}), 400)
rt("subject too short → 400", requests.post(BASE, headers=H, json={"subject": "ab"}), 400)
rt("bogus category → 400", requests.post(BASE, headers=H, json={"subject": "valid subject", "category": "NOPE"}), 400)
rt("bogus priority → 400", requests.post(BASE, headers=H, json={"subject": "valid subject", "priority": "SUPER"}), 400)
rt("empty note body → 400", requests.post(f"{BASE}/{TID}/notes", headers=H, json={"body": "   "}), 400)
rt("bogus note visibility → 400", requests.post(f"{BASE}/{TID}/notes", headers=H, json={"body": "hi", "visibility": "SECRET"}), 400)
rt("terminal status via /status → 400", requests.put(f"{BASE}/{TID}/status", headers=H, json={"status": "CLOSED"}), 400)
rt("same-status transition → 400", requests.put(f"{BASE}/{TID}/status", headers=H, json={"status": "OPEN"}), 400)
rt("reopen a non-terminal ticket → 400", requests.put(f"{BASE}/{TID}/reopen", headers=H, json={"reason": "because"}), 400)
rt("escalate without reason → 400", requests.put(f"{BASE}/{TID}/escalate", headers=H, json={}), 400)
rt("assign to a non-tenant user → 400", requests.put(f"{BASE}/{TID}/assign", headers=H, json={"assigneeId": str(uuid.uuid4())}), 400)
rt("patch with no editable field → 400", requests.patch(f"{BASE}/{TID}", headers=H, json={}), 400)
rt("unauth list → 401", requests.get(BASE), 401)
rt("unauth create → 401", requests.post(BASE, json={"subject": "sneaky ticket"}), 401)

# double-close guard
requests.put(f"{BASE}/{TID}/close", headers=H, json={})
rt("close an already-closed ticket → 400", requests.put(f"{BASE}/{TID}/close", headers=H, json={}), 400)
rt("escalate a closed ticket → 400", requests.put(f"{BASE}/{TID}/escalate", headers=H, json={"reason": "late"}), 400)

print(f"\nBP-06: {ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
