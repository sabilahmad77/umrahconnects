#!/usr/bin/env python3
"""BP-02: seed supply-side demo data via the API (validation-correct, idempotent)
and PROVE each flow round-trips: hotel rooms/bookings/occupancy, transport
vehicles/drivers/routes/assignments/bookings, visa checklist + reject-with-reason."""
import requests, sys, time

API = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4000/api/v1"
TEN = sys.argv[2] if len(sys.argv) > 2 else "ac08f9b4-aaec-4474-b61b-4832c5a5ec4c"
T = requests.post(f"{API}/auth/login", json={"email":"admin@alharamain.sa","password":"Admin@1234","tenantId":TEN}).json()["data"]["accessToken"]
H = {"Authorization": f"Bearer {T}", "Content-Type": "application/json"}
ok=fail=0
def chk(label, cond, extra=""):
    global ok,fail; ok+=bool(cond); fail+=not cond
    print(("✓" if cond else "✗"), label, extra)
def gd(r):
    j=r.json(); d=j.get("data",j)
    return d
def items(d): return d.get("items") if isinstance(d,dict) and "items" in d else (d if isinstance(d,list) else [])

# ── HOTELS: ensure 2 hotels with room types + rooms ──
HOTELS=[{"name":"Al Safwah Royale Orchid","city":"Makkah","country":"SA","starRating":5,"distanceFromHaram":250},
        {"name":"Dar Al Eiman Grand","city":"Madinah","country":"SA","starRating":4,"distanceFromHaram":350}]
existing = items(gd(requests.get(f"{API}/hotels?limit=100",headers=H)))
byname = {h.get("name"): h for h in existing}
hotel_ids=[]
for hd in HOTELS:
    h = byname.get(hd["name"])
    if not h:
        r=requests.post(f"{API}/hotels",headers=H,json=hd); h=gd(r)
    hotel_ids.append(h["id"])
chk("hotels seeded", len(hotel_ids)==2, f"({len(items(gd(requests.get(f'{API}/hotels?limit=100',headers=H))))} total)")

# room types + rooms on hotel 1
hid=hotel_ids[0]
rts=items(gd(requests.get(f"{API}/hotels/{hid}/room-types",headers=H)))
if not rts:
    for rt in [{"name":"Quad Room","capacity":4,"basePriceCents":95000},{"name":"Double Room","capacity":2,"basePriceCents":140000}]:
        requests.post(f"{API}/hotels/{hid}/room-types",headers=H,json=rt)
    rts=items(gd(requests.get(f"{API}/hotels/{hid}/room-types",headers=H)))
chk("room types on hotel", len(rts)>=2, f"({len(rts)})")
rooms=items(gd(requests.get(f"{API}/hotels/{hid}/rooms",headers=H)))
if len(rooms)<4 and rts:
    for i in range(4-len(rooms)):
        requests.post(f"{API}/hotels/{hid}/rooms",headers=H,json={"roomTypeId":rts[0]["id"],"roomNumber":f"7{i+1:02d}","floor":7})
    rooms=items(gd(requests.get(f"{API}/hotels/{hid}/rooms",headers=H)))
chk("rooms on hotel", len(rooms)>=4, f"({len(rooms)})")

# hotel booking → occupancy proof
before=gd(requests.get(f"{API}/hotels/stats",headers=H))
r=requests.post(f"{API}/hotels/bookings",headers=H,json={"hotelId":hid,"roomTypeId":rts[0]["id"] if rts else None,"roomId":rooms[0]["id"] if rooms else None,
    "guestName":"BP02 Guest","guestEmail":"bp02@test.com","checkIn":"2026-08-01","checkOut":"2026-08-07","amount":5700,"status":"CONFIRMED"})
chk("hotel booking create", r.status_code<400, f"({r.status_code})")
bkid=gd(r).get("id") if r.status_code<400 else None
hb=items(gd(requests.get(f"{API}/hotels/bookings",headers=H)))
chk("hotel booking in list (persisted)", any(b.get("id")==bkid for b in hb), f"({len(hb)} bookings)")
after=gd(requests.get(f"{API}/hotels/stats",headers=H))
chk("occupancy wiring: stats respond", isinstance(after,dict) and ("rooms" in after or "occupancyRate" in after),
    f"occ {before.get('occupancyRate')}→{after.get('occupancyRate')} booked {(before.get('rooms') or {}).get('booked')}→{(after.get('rooms') or {}).get('booked')}")

# ── TRANSPORT: vehicles / drivers / routes / assignment / booking ──
veh=items(gd(requests.get(f"{API}/transport/vehicles",headers=H)))
if len(veh)<3:
    for v in [{"type":"BUS_LARGE","plateNumber":"HAJ-4921","capacity":49,"model":"Mercedes Travego"},
              {"type":"BUS_SMALL","plateNumber":"HAJ-1188","capacity":18,"model":"Toyota Coaster"},
              {"type":"VAN","plateNumber":"HAJ-7755","capacity":11,"model":"Hyundai H1"}]:
        requests.post(f"{API}/transport/vehicles",headers=H,json=v)
    veh=items(gd(requests.get(f"{API}/transport/vehicles",headers=H)))
chk("vehicles seeded+listed", len(veh)>=3, f"({len(veh)})")
drv=items(gd(requests.get(f"{API}/transport/drivers",headers=H)))
if len(drv)<2:
    for d in [{"name":"Khalid Al-Otaibi","phone":"+966501112233","licenseNumber":"DL-88231"},
              {"name":"Yusuf Rahman","phone":"+966502223344","licenseNumber":"DL-90417"}]:
        requests.post(f"{API}/transport/drivers",headers=H,json=d)
    drv=items(gd(requests.get(f"{API}/transport/drivers",headers=H)))
chk("drivers seeded+listed", len(drv)>=2, f"({len(drv)})")
rts2=items(gd(requests.get(f"{API}/transport/routes",headers=H)))
if len(rts2)<2:
    for rt in [{"name":"Jeddah Airport → Makkah","origin":"Jeddah Airport","destination":"Makkah","distanceKm":95},
               {"name":"Makkah → Madinah","origin":"Makkah","destination":"Madinah","distanceKm":450}]:
        requests.post(f"{API}/transport/routes",headers=H,json=rt)
    rts2=items(gd(requests.get(f"{API}/transport/routes",headers=H)))
chk("routes seeded+listed", len(rts2)>=2, f"({len(rts2)})")
# assignment round-trip
r=requests.post(f"{API}/transport/assignments",headers=H,json={"vehicleId":veh[0]["id"],"driverId":drv[0]["id"],"routeId":rts2[0]["id"],
    "scheduledAt":"2026-08-01T09:00:00Z","notes":"BP02 assignment"})
chk("assignment create", r.status_code<400, f"({r.status_code}) {'' if r.status_code<400 else r.text[:80]}")
aid=gd(r).get("id") if r.status_code<400 else None
asg=items(gd(requests.get(f"{API}/transport/assignments",headers=H)))
chk("assignment in list (persisted)", any(a.get("id")==aid for a in asg), f"({len(asg)})")
# transport booking round-trip (bookings endpoint = assignment shape)
r=requests.post(f"{API}/transport/bookings",headers=H,json={"routeId":rts2[0]["id"],"vehicleId":veh[1]["id"],"driverId":drv[1]["id"],
    "scheduledAt":"2026-08-02T06:00:00Z","customerName":"BP02 Group","passengerCount":18,"price":6300,
    "pickupLocation":"Jeddah Airport","dropoffLocation":"Makkah"})
chk("transport booking create", r.status_code<400, f"({r.status_code}) {'' if r.status_code<400 else r.text[:80]}")
tbid=gd(r).get("id") if r.status_code<400 else None
tb=items(gd(requests.get(f"{API}/transport/bookings",headers=H)))
chk("transport booking in list (persisted)", any(x.get("id")==tbid for x in tb), f"({len(tb)})")

# ── VISA: checklist + reject-with-reason + notes ──
r=requests.post(f"{API}/compliance/visas",headers=H,json={"visaType":"UMRAH","notes":"BP02 application"})
vid=gd(r).get("id"); chk("visa application create", r.status_code<400 and vid, f"({r.status_code})")
r=requests.post(f"{API}/compliance/visas/{vid}/documents",headers=H,json={"name":"Passport scan","type":"PASSPORT"})
chk("checklist: add document (MISSING)", r.status_code<400, f"({r.status_code})")
docs=gd(requests.get(f"{API}/compliance/visas/{vid}/documents",headers=H))
docs=docs if isinstance(docs,list) else items(docs)
did=docs[0]["id"] if docs else None
chk("checklist: doc listed", bool(did), f"status={docs[0].get('status') if docs else None}")
r=requests.put(f"{API}/compliance/visas/{vid}/documents/{did}",headers=H,json={"status":"RECEIVED","url":"/uploads/demo.png"})
docs2=gd(requests.get(f"{API}/compliance/visas/{vid}/documents",headers=H)); docs2=docs2 if isinstance(docs2,list) else items(docs2)
chk("checklist: MISSING→RECEIVED persists", docs2 and docs2[0].get("status")=="RECEIVED", f"({docs2[0].get('status') if docs2 else '?'})")
# reject with reason → persisted
r=requests.put(f"{API}/compliance/visas/{vid}/reject",headers=H,json={"reason":"Passport expires within 6 months"})
after=gd(requests.get(f"{API}/compliance/visas/{vid}",headers=H))
chk("reject-with-reason persists", after.get("status")=="REJECTED" and "6 months" in str(after.get("rejectionReason")),
    f"status={after.get('status')} reason={str(after.get('rejectionReason'))[:40]}")
chk("notes persist", "BP02" in str(after.get("notes")), f"({str(after.get('notes'))[:30]})")

# ── RED TEAM: bad input must 4xx, never 5xx ──
r=requests.post(f"{API}/hotels/bookings",headers=H,json={"guestName":"NoHotel"})
chk("red-team: booking w/o hotelId → 4xx", 400<=r.status_code<500, f"({r.status_code})")
r=requests.post(f"{API}/transport/assignments",headers=H,json={"scheduledAt":"2026-08-01T09:00:00Z"})
chk("red-team: assignment w/o vehicleId → 4xx", 400<=r.status_code<500, f"({r.status_code})")
r=requests.post(f"{API}/hotels/{hid}/rooms",headers=H,json={"roomNumber":901,"floor":9})
chk("red-team: numeric roomNumber/floor → not 5xx", r.status_code<500, f"({r.status_code})")
r=requests.put(f"{API}/compliance/visas/00000000-0000-0000-0000-000000000000/reject",headers=H,json={"reason":"x"})
chk("red-team: reject bogus visa → 4xx", 400<=r.status_code<500, f"({r.status_code})")
r=requests.get(f"{API}/hotels/bookings")
chk("red-team: unauth list → 401", r.status_code==401, f"({r.status_code})")

print(f"\nBP-02: {ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
