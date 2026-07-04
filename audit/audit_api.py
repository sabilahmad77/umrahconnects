#!/usr/bin/env python3
"""Umrah Connect — Full API audit. Outputs JSON results for the report."""
import requests, json, time, sys

API = "http://localhost:4000/api/v1"
CRED = {"email": "admin@alharamain.sa", "password": "Admin@1234",
        "tenantId": "ac08f9b4-aaec-4474-b61b-4832c5a5ec4c"}

results = []  # {area, name, method, path, status: WORKING|BROKEN, http, note}

def rec(area, name, method, path, ok, http, note=""):
    results.append({"area": area, "name": name, "method": method, "path": path,
                    "status": "WORKING" if ok else "BROKEN", "http": http, "note": note})
    print(f"  {'✓' if ok else '✗'} [{area}] {name} ({http})")

S = requests.Session()

# ── Auth ──
r = S.post(f"{API}/auth/login", json=CRED, timeout=20)
ok = r.status_code == 200 and bool(r.json().get("data", {}).get("accessToken"))
rec("Auth", "Login", "POST", "/auth/login", ok, r.status_code)
if not ok: print("FATAL: no auth"); sys.exit(1)
T = r.json()["data"]["accessToken"]
H = {"Authorization": f"Bearer {T}", "Content-Type": "application/json"}

r = S.post(f"{API}/auth/login", json={**CRED, "password": "wrong"}, timeout=20)
rec("Auth", "Reject wrong password", "POST", "/auth/login", r.status_code in (400, 401, 403), r.status_code)
r = S.get(f"{API}/auth/me", headers=H, timeout=20)
rec("Auth", "Current user (/auth/me)", "GET", "/auth/me", r.status_code == 200, r.status_code)
r = S.get(f"{API}/rbac/my-permissions", headers=H, timeout=20)
perms = len((r.json().get("data") or [])) if r.status_code == 200 else 0
rec("Auth", f"RBAC permissions ({perms})", "GET", "/rbac/my-permissions", r.status_code == 200 and perms > 0, r.status_code)

def get(area, name, path, expect_items=False):
    try:
        r = S.get(f"{API}{path}", headers=H, timeout=20)
        ok = r.status_code == 200
        note = ""
        if ok and expect_items:
            d = r.json().get("data")
            items = d.get("items") if isinstance(d, dict) else d
            note = f"{len(items or [])} items"
        rec(area, name, "GET", path, ok, r.status_code, note)
        return r.json().get("data") if ok else None
    except Exception as e:
        rec(area, name, "GET", path, False, 0, str(e)[:60]); return None

def post(area, name, path, body, expected=(200, 201)):
    try:
        r = S.post(f"{API}{path}", headers=H, json=body, timeout=20)
        ok = r.status_code in expected
        note = "" if ok else (r.text or "")[:90]
        rec(area, name, "POST", path, ok, r.status_code, note)
        return r.json().get("data") if ok else None
    except Exception as e:
        rec(area, name, "POST", path, False, 0, str(e)[:60]); return None

u = int(time.time())

# ── Operator CRM ──
get("CRM", "Pilgrims list", "/pilgrims?limit=5", True)
get("CRM", "Pilgrims stats", "/pilgrims/stats")
p = post("CRM", "Create pilgrim", "/pilgrims", {"firstName": "Audit", "lastName": f"P{u}", "passportNumber": f"AUD{u}", "dateOfBirth": "1990-01-01", "nationality": "SA", "gender": "MALE"})
pid = (p or {}).get("id")
if pid:
    r = S.put(f"{API}/pilgrims/{pid}", headers=H, json={"phone": "+966500000099"}, timeout=20)
    rec("CRM", "Update pilgrim", "PUT", "/pilgrims/:id", r.status_code == 200, r.status_code)
get("CRM", "Bookings list", "/bookings?limit=5", True)
get("CRM", "Bookings stats", "/bookings/stats")
b = post("CRM", "Create booking", "/bookings", {"pilgrimId": pid, "totalAmountCents": 100000, "currency": "SAR", "status": "DRAFT"}) if pid else None
get("CRM", "Groups list", "/groups?limit=5", True)
post("CRM", "Create group", "/groups", {"name": f"Audit Group {u}", "tripType": "UMRAH", "capacity": 10, "visibility": "PRIVATE"})
get("CRM", "Packages list", "/packages?limit=5", True)

# ── Hotels ──
get("Hotels", "Hotels list", "/hotels?limit=5", True)
get("Hotels", "Hotels stats", "/hotels/stats")
post("Hotels", "Create hotel", "/hotels", {"name": f"Audit Hotel {u}", "city": "Makkah", "country": "SA", "starRating": 4, "totalRooms": 10})

# ── Transport ──
get("Transport", "Vehicles", "/transport/vehicles?limit=5", True)
get("Transport", "Drivers", "/transport/drivers?limit=5", True)
get("Transport", "Routes", "/transport/routes?limit=5", True)
get("Transport", "Assignments", "/transport/assignments?limit=5", True)
get("Transport", "Stats", "/transport/stats")
post("Transport", "Create vehicle", "/transport/vehicles", {"make": "Audit", "model": "Bus", "year": 2024, "plateNumber": f"AU-{u}", "capacity": 20, "type": "BUS"})
post("Transport", "Create driver", "/transport/drivers", {"firstName": "Audit", "lastName": f"D{u}", "phone": "+966522222222", "licenseNumber": f"AL{u}", "licenseExpiry": "2030-01-01"})
post("Transport", "Create route", "/transport/routes", {"name": f"Audit Route {u}", "originCity": "Jeddah", "destCity": "Makkah", "distanceKm": 90, "estimatedDuration": 80})

# ── Visa / Compliance ──
get("Visa", "Applications", "/compliance/visas?limit=5", True)
get("Visa", "Stats", "/compliance/visas/stats")
get("Visa", "Dashboard stats", "/compliance/visas/dashboard-stats")
get("Visa", "Documents", "/compliance/visas/documents")
if pid:
    post("Visa", "Create application", "/compliance/visas", {"pilgrimId": pid, "visaType": "UMRAH", "country": "SA", "regulatorySystem": "NUSUK_MASAR"})

# ── Finance ──
get("Finance", "Invoices", "/finance/invoices?limit=5", True)
get("Finance", "Budget plans", "/finance/budget-plans?limit=5", True)
get("Finance", "Dashboard stats", "/finance/dashboard-stats")
post("Finance", "Create invoice", "/finance/invoices", {"clientName": f"Audit {u}", "currency": "SAR", "dueDate": "2026-09-01", "lineItems": [{"description": "Audit", "quantity": 1, "unitPriceCents": 10000}]})
post("Finance", "Create budget plan", "/finance/budget-plans", {"clientName": f"Audit BP {u}", "clientType": "TRAVELER", "currency": "SAR", "totalBudgetCents": 100000})

# ── Marketplace ──
get("Marketplace", "Listings", "/marketplace/listings?limit=10", True)
get("Marketplace", "Open requests", "/marketplace/requests/open?limit=5", True)
get("Marketplace", "My requests", "/marketplace/requests/mine?limit=5", True)
get("Marketplace", "My offers", "/marketplace/requests/offers/mine?limit=5", True)
get("Marketplace", "Vendors", "/marketplace/vendors?limit=5", True)
req = post("Marketplace", "Create request", "/marketplace/requests", {"serviceType": "HOTEL", "title": f"Audit req {u}", "description": "Audit", "travelers": 1, "currency": "SAR"})
rid = (req or {}).get("id")
if rid:
    off = post("Marketplace", "Submit offer", f"/marketplace/requests/{rid}/offers", {"priceCents": 50000, "currency": "SAR", "message": "Audit offer"})

# ── Social ──
get("Social", "Feed", "/social/feed?limit=5", True)
sp = post("Social", "Create post", "/social/posts", {"content": f"Audit post {u}", "visibility": "PUBLIC", "type": "UPDATE"})
spid = (sp or {}).get("id")
if spid:
    post("Social", "Like post", f"/social/posts/{spid}/react", {"type": "LIKE"})
    post("Social", "Comment", f"/social/posts/{spid}/comments", {"body": "Audit comment"})
    post("Social", "Share", f"/social/posts/{spid}/react", {"type": "SHARE"})
    post("Social", "Save post", f"/social/posts/{spid}/save", {})
get("Social", "Discover people", "/social/discover/people", True)
get("Social", "Trending", "/social/discover/trending")
get("Social", "Conversations", "/social/conversations?limit=5")
get("Social", "Saved posts", "/social/saved-posts")

# ── Connections / Notifications ──
get("Connections", "List", "/connections")
get("Connections", "Pending", "/connections/pending")
get("Notifications", "List", "/notifications?limit=10")
post("Notifications", "Mark all read", "/notifications/read-all", {})

# ── Reports ──
for repname in ["overview", "finance", "bookings", "hotels", "pilgrims", "visa"]:
    get("Reports", f"Report: {repname}", f"/reports/{repname}")

# ── Admin ──
get("Admin", "Platform stats", "/admin/stats")
get("Admin", "Tenants", "/admin/tenants?limit=5", True)
get("Admin", "Users", "/admin/users?limit=5", True)
get("Admin", "KYC", "/admin/kyc?limit=5", True)
get("Admin", "Roles", "/admin/roles")
get("Admin", "Permissions", "/admin/permissions")
get("Admin", "Listings moderation", "/admin/listings?limit=5", True)
get("Admin", "All bookings", "/admin/bookings?limit=5", True)
get("Admin", "Finance summary", "/admin/finance")
get("Admin", "Audit logs", "/admin/audit-logs?limit=5", True)
get("Admin", "Settings", "/admin/settings")

# ── Logout ──
r = S.post(f"{API}/auth/logout", headers=H, json={}, timeout=20)
rec("Auth", "Logout", "POST", "/auth/logout", r.status_code in (200, 201, 204), r.status_code)

# ── Summary ──
working = sum(1 for x in results if x["status"] == "WORKING")
total = len(results)
summary = {"working": working, "total": total, "pct": round(working * 100 / total, 1), "results": results}
with open("/Users/ahmadsabil77/Downloads/Umrah Connects/audit/api_audit.json", "w") as f:
    json.dump(summary, f, indent=2)
print(f"\nAPI AUDIT: {working}/{total} working ({summary['pct']}%)")
print("Saved: audit/api_audit.json")
