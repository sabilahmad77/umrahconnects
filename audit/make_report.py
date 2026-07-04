#!/usr/bin/env python3
"""Generate the Umrah Connect Platform Audit Report (PDF)."""
import json, os, datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors as C
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                Image, PageBreak, KeepTogether)

BASE = "/Users/ahmadsabil77/Downloads/Umrah Connects/audit"
GREEN = C.HexColor("#0F3D37"); GOLD = C.HexColor("#C8A96B")
IVORY = C.HexColor("#F8F5EF"); RED = C.HexColor("#B54747")
AMBER = C.HexColor("#C98A13"); OK = C.HexColor("#1E8E5A")
TXT = C.HexColor("#1A1F23"); SUB = C.HexColor("#5E6974")

ss = getSampleStyleSheet()
H1 = ParagraphStyle('H1', parent=ss['Heading1'], textColor=GREEN, fontSize=20, spaceAfter=8)
H2 = ParagraphStyle('H2', parent=ss['Heading2'], textColor=GREEN, fontSize=14, spaceBefore=14, spaceAfter=6)
H3 = ParagraphStyle('H3', parent=ss['Heading3'], textColor=TXT, fontSize=11, spaceBefore=8, spaceAfter=4)
P  = ParagraphStyle('P', parent=ss['BodyText'], textColor=TXT, fontSize=9.5, leading=13)
PS = ParagraphStyle('PS', parent=P, textColor=SUB, fontSize=8.5)
PC = ParagraphStyle('PC', parent=P, alignment=1)

api = json.load(open(f"{BASE}/api_audit.json"))
bf  = json.load(open(f"{BASE}/browser_findings.json"))

doc = SimpleDocTemplate(f"{BASE}/Umrah-Connect-Audit-Report.pdf", pagesize=A4,
                        leftMargin=18*mm, rightMargin=18*mm, topMargin=16*mm, bottomMargin=16*mm)
E = []

def status_cell(s):
    color = {"WORKING": OK, "PARTIAL": AMBER, "BROKEN": RED, "MISSING": SUB, "STATIC": AMBER}.get(s, SUB)
    return Paragraph(f'<font color="{color.hexval()}"><b>{s}</b></font>', P)

def tbl(data, widths, header=True):
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ('FONTSIZE', (0,0), (-1,-1), 8.5),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.4, C.HexColor("#D9D7D0")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [C.white, IVORY]),
        ('TOPPADDING', (0,0), (-1,-1), 3), ('BOTTOMPADDING', (0,0), (-1,-1), 3),
    ]
    if header:
        style += [('BACKGROUND', (0,0), (-1,0), GREEN), ('TEXTCOLOR', (0,0), (-1,0), C.white),
                  ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold')]
    t.setStyle(TableStyle(style))
    return t

# ── COVER ──
E.append(Spacer(1, 40*mm))
E.append(Paragraph("Umrah Connect", ParagraphStyle('T', parent=H1, fontSize=34, alignment=1)))
E.append(Paragraph("Full Platform Audit &amp; Assessment Report", ParagraphStyle('T2', parent=P, fontSize=15, alignment=1, textColor=GOLD)))
E.append(Spacer(1, 8*mm))
E.append(Paragraph(datetime.date.today().strftime("%d %B %Y"), ParagraphStyle('T3', parent=PC, textColor=SUB)))
E.append(Spacer(1, 30*mm))
E.append(tbl([
    ["Scope", "Web · Backend/API · Database · Mobile (Expo/APK) · Marketplace · Social Hub · All 7 role dashboards"],
    ["Method", "Live execution + automated API audit (73 checks) + scripted Chrome walkthrough of 60+ pages with screenshots (55) + mobile code/bundle audit + database inspection"],
    ["Web tested", "http://localhost:3000 (Next.js 14 dev)"],
    ["API tested", "http://localhost:4000/api/v1 (NestJS + Prisma + PostgreSQL 15)"],
    ["Mobile tested", "Expo SDK 54 codebase · release APK 83 MB (umrah-connects.apk)"],
    ["Database", "PostgreSQL connected — 3 tenants, 3 users, 34 pilgrims, 9 bookings, 22 hotels, 20 vehicles, 23 visas, 21 invoices, 6 listings, 30 posts"],
], [30*mm, 144*mm], header=False))
E.append(PageBreak())

# ── EXEC SUMMARY ──
E.append(Paragraph("1. Executive Summary", H1))
E.append(Paragraph(
 "Umrah Connect is a functioning multi-tenant SaaS platform in late-stage development. The backend is the "
 "strongest layer: 71 of 73 audited API checks pass (97.3%), covering authentication, RBAC (39 permissions), CRM, "
 "hotels, transport, visa, finance, marketplace, social, notifications, reports and a cross-tenant Super Admin module. "
 "The web frontend renders all 60+ audited pages across the 7 roles with the approved brand system (deep green / gold, "
 "Manrope/Inter, official logo), with <b>one crashing page</b> (Operator → Hotels) and several static/placeholder areas. "
 "The mobile app has 23 screens with real create/like/comment/booking actions wired to the same backend as web, but is "
 "thinner than web (no messaging, no media upload, one legacy duplicate screen). The platform is suitable for demos and "
 "pilot testing; it is <b>not yet production-ready</b> — the gaps are concentrated in payments, media upload, notification "
 "event generation, self-serve onboarding, and operational stability (dev servers and tunnels do not stay up unattended).", P))
E.append(Spacer(1, 4*mm))

E.append(Paragraph("Overall platform health: <b>GOOD (demo-ready) — NOT production-ready</b>", H3))
E.append(Spacer(1, 2*mm))

# ── COMPLETION ──
E.append(Paragraph("2. Current Completion Estimate", H2))
comp = [["Layer", "Completion", "Basis"],
 ["Backend / API", "90%", "71/73 checks pass; missing: payment processing, media upload, notification events, self-serve registration"],
 ["Frontend (Web)", "85%", "All role dashboards render with brand; 1 crash (/hotels), settings/static areas, no password reset"],
 ["Mobile App", "70%", "23 screens, 24 write-mutations, reference design; missing messaging, media upload, group detail, profile editing"],
 ["Marketplace", "75%", "Browse/detail/booking/offers/creation work end-to-end; editing, vendor profiles, search relevance partial"],
 ["Social Hub", "75%", "Post/like/comment/share/save real + persisted; trending/suggested real; media upload + group discussions missing"],
 ["CRM (Operator)", "85%", "Pilgrim/group/hotel/visa/invoice CRUD verified; POST /bookings DTO drift breaks one creation path"],
 ["Platform overall", "80%", "Weighted across layers; demo-ready, pre-production"]]
E.append(tbl(comp, [38*mm, 22*mm, 114*mm]))

# ── FEATURE MATRIX ──
E.append(Paragraph("3. Feature Matrix (from live API audit — 73 checks)", H2))
rows = [["Area", "Feature", "Status", "HTTP / Note"]]
for r in api["results"]:
    note = (r.get("note") or "")[:46]
    rows.append([r["area"], r["name"], status_cell(r["status"]), f'{r["http"]} {note}'])
E.append(tbl(rows, [22*mm, 62*mm, 20*mm, 70*mm]))
E.append(Paragraph(f'API result: <b>{api["working"]}/{api["total"]} working ({api["pct"]}%)</b>', P))
E.append(PageBreak())

# ── UI/UX FINDINGS ──
E.append(Paragraph("4. UI/UX Audit Findings", H2))
for s in [
 "<b>Brand system implemented:</b> Deep Umrah Green #0F3D37 + Gold #C8A96B, Manrope headings / Inter body, official UC monogram on web sidebar, login, landing, and mobile (icon, splash, login). Verified in compiled CSS and on-screen.",
 "<b>Marketplace (web + mobile)</b> matches the reference: photo media cards, category pill + icon, price overlay, ratings, provider/location. Category filters use the Lucide icon system (emoji removed).",
 "<b>Social Hub (web)</b>: composer with Photo/Video/Poll row, type chips, engagement summary, full-width Like/Comment/Share bar, real Trending and real Suggested-connections panels.",
 "<b>Residual brand violations:</b> scattered emoji remain on some operator screens (dashboard greeting 'Welcome 👋', hotels list '🛏 Total Rooms', More-menu role emoji on mobile) — low effort to remove.",
 "<b>Static/placeholder areas:</b> web Settings pages are largely non-functional; password reset and self-serve signup are frontend-only; mobile Reports is read-only summary.",
 "<b>Responsiveness:</b> landing page renders correctly at 390px (screenshot evidence); dashboards are desktop-first and usable but not optimized for small screens.",
 "<b>Next.js 14.2.35 flagged outdated</b> by its own dev overlay; upgrade advisable.",
]:
    E.append(Paragraph("• " + s, P))

# ── FUNCTIONAL FINDINGS ──
E.append(Paragraph("5. Functional Audit Findings (by area)", H2))
func = [["Area", "Fully working", "Partial / Static", "Broken / Missing"],
 ["Auth", "Login, JWT, role routing, logout, wrong-cred rejection", "Signup UI (no backend), demo role tiles", "Password reset missing"],
 ["Traveler", "Social feed, like/comment/share/save, marketplace browse+book, requests, profile", "Travel plan basic, messages basic", "—"],
 ["Operator CRM", "Pilgrims CRUD, groups, visa apps, invoices, reports, dashboards", "Settings static", "/hotels page crash; POST /bookings rejects pilgrimId"],
 ["Hotel Owner", "Dashboard, hotel create, bookings list, finance", "Rooms/inventory partial, images URL-only", "—"],
 ["Transport", "Vehicles/drivers/routes lists + create (web), stats", "Assignments basic", "POST vehicle 500 on type=BUS (enum validation)"],
 ["Visa Agency", "Applications list/create, documents, stats", "Processing workflow partial", "—"],
 ["Finance", "Invoices CRUD, budget plans, dashboard stats, reports", "Payment recording manual", "Payment gateway missing"],
 ["Super Admin", "Stats, tenants, users, KYC approve/reject, roles, listings moderation, audit logs", "Settings read-only", "—"],
 ["Marketplace", "Listings, detail, booking modal (verified e2e), requests, offers, vendors", "Listing editing, search relevance", "Media upload missing"],
 ["Social Hub", "Post/like/comment/share/save persisted (verified), trending, suggested, connections", "Messaging basic", "Media upload, group discussions missing"],
 ["Notifications", "List + mark-all-read APIs; UI on web + mobile", "—", "No server-side event generation (list stays empty)"],
]
E.append(tbl(func, [24*mm, 56*mm, 46*mm, 48*mm]))
E.append(PageBreak())

# ── API ISSUES ──
E.append(Paragraph("6. API Audit Issues", H2))
E.append(Paragraph("• <b>POST /bookings → 400</b>: DTO rejects 'pilgrimId' ('property pilgrimId should not exist') while the data model supports pilgrim-linked bookings. Booking-with-pilgrim creation path broken at API level (web's marketplace Book modal uses a different path and works).", P))
E.append(Paragraph("• <b>POST /transport/vehicles → 500</b> when type='BUS': server throws instead of validating the enum (works with 'VAN'). Should be a 400 with a clear message.", P))
E.append(Paragraph("• All other 71 checks return expected 2xx, including full CRUD on pilgrims/hotels/drivers/routes/invoices/budget-plans/visas, marketplace request→offer flow, social interactions, reports, and all 11 Super Admin endpoints.", P))

# ── BROWSER FINDINGS ──
E.append(Paragraph("7. Browser Walkthrough Findings (60+ pages, 7 roles)", H2))
E.append(Paragraph("• <b>CRITICAL — Operator → /hotels crashes</b>: 'TypeError: Cannot read properties of undefined (reading toLocaleString)' at components/hotels/hotels-list.tsx:66 (stats.totalRooms unguarded). Page shows Next.js error overlay (screenshot included).", P))
E.append(Paragraph("• /transport returns 307 redirect (expected route alias); /hotel-bookings loaded on retry — transient dev-compile aborts, not product bugs.", P))
E.append(Paragraph("• No other page-level 404s or crashes across admin (9 pages), finance (5), hotel (5), transport (4), visa (5), operator (12), traveler (12), public (3).", P))
E.append(Paragraph("• Console noise is limited to the /hotels crash and benign dev warnings.", P))

# ── MOBILE ──
E.append(Paragraph("8. Mobile Audit Findings", H2))
E.append(Paragraph("• 23 screens, TypeScript clean, release APK builds (83 MB) with live API URL + brand assets baked in.", P))
E.append(Paragraph("• Reference screens implemented: Login/Signup, Social Hub (segmented tabs, premium post cards, composer, comments), Marketplace (category tiles + photo service cards fed by the same /marketplace/listings as web), Booking Review &amp; Confirm + Success, Notifications (chip tabs, real data only), Profile (green header, account rows), 5-tab nav with center '+'.", P))
E.append(Paragraph("• Write actions on mobile: posts, likes, comments, saves, hotels, vehicles, drivers, routes, pilgrims, groups, visas, invoices, marketplace requests/offers, bookings (24 mutations).", P))
E.append(Paragraph("• <b>Gaps:</b> messaging screen missing; group detail/join missing; profile editing missing; media upload missing; legacy duplicate marketplace screen (app/marketplace.tsx) still reachable from the More menu alongside the new Market tab; bookings tab is read-only.", P))
E.append(Paragraph("• Expo-web render of the app loads to login (screenshot included); full interactive mobile verification requires a device — endpoint-level verification was used instead (all mobile-called endpoints pass).", P))

# ── PRIORITIES ──
E.append(Paragraph("9. Prioritised Issue List", H2))
E.append(Paragraph("Critical (blocks core usage)", H3))
for s in ["Operator /hotels page crash (hotels-list.tsx:66 unguarded stats) — page unusable.",
          "POST /bookings rejects pilgrimId — booking-with-pilgrim creation broken at API.",
          "Operational fragility: dev servers + tunnels stop when the machine sleeps; every restart rotates public URLs and invalidates the APK's baked API URL. Needs real deployment.",]:
    E.append(Paragraph("• " + s, P))
E.append(Paragraph("Medium", H3))
for s in ["Vehicle create 500 on unknown enum (should be 400 validation).",
          "No server-side notification events (UI ready, list permanently empty).",
          "No payment processing (booking 'payment method' is display-only).",
          "No media/photo upload anywhere (posts, listings, hotels).",
          "Self-serve signup + password reset missing (frontend stubs only).",
          "Mobile: duplicate legacy marketplace screen; messaging/group-detail/profile-edit missing.",
          "Web settings pages largely static."]:
    E.append(Paragraph("• " + s, P))
E.append(Paragraph("Low", H3))
for s in ["Residual emoji on a few operator/mobile labels (brand consistency).",
          "Next.js 14.2.35 outdated; React 18/19 types collision in auth-provider (cosmetic).",
          "Trending derived only from post tags; search relevance basic.",]:
    E.append(Paragraph("• " + s, P))

# ── NEXT STEPS ──
E.append(Paragraph("10. Recommended Next Steps (in order)", H2))
for i, s in enumerate([
 "Fix the two API defects + /hotels crash (≤1 day combined).",
 "Deploy properly (web → Vercel; API+DB → managed host; stable domain) to end tunnel fragility; rebuild APK against the stable API URL.",
 "Implement notification event generation server-side (booking confirmed, comment, like, offer received).",
 "Add media upload (S3-compatible) for posts, listings, hotel images — unlocks the photo-first design with real content.",
 "Implement payments (gateway sandbox) behind the existing booking confirm UI.",
 "Mobile completion pass: messaging, group detail, profile edit, remove legacy marketplace screen.",
 "Self-serve signup + password reset with email verification.",
], 1):
    E.append(Paragraph(f"{i}. {s}", P))
E.append(PageBreak())

# ── SCREENSHOTS APPENDIX ──
E.append(Paragraph("11. Screenshots Appendix (selection — full set in audit/screenshots/, 55 files)", H1))
shots = [
 ("public_landing.png", "Landing page (brand hero)"),
 ("public_login.png", "Login — role tiles with icon system"),
 ("public_landing_mobile.png", "Landing @ 390px (responsive)"),
 ("operator_dashboard.png", "Operator dashboard — KPIs, trends, pipeline"),
 ("operator_hotels.png", "CRITICAL: /hotels crash (evidence)"),
 ("operator_pilgrims.png", "Pilgrims CRM"),
 ("operator_bookings.png", "Bookings"),
 ("traveler_social.png", "Social Hub — composer + feed"),
 ("traveler_marketplace.png", "Marketplace — photo cards"),
 ("traveler_connections.png", "Connections"),
 ("hotel_hotel-dashboard.png", "Hotel Owner dashboard"),
 ("transport_transport-dashboard.png", "Transport dashboard"),
 ("visa_visa-dashboard.png", "Visa Agency dashboard"),
 ("finance_finance-dashboard.png", "Finance dashboard"),
 ("admin_admin-dashboard.png", "Super Admin overview"),
 ("admin_admin-kyc.png", "KYC moderation"),
 ("mobile_web_login.png", "Mobile app (Expo web render) — login"),
]
for fn, cap in shots:
    p = os.path.join(BASE, "screenshots", fn)
    if not os.path.exists(p): continue
    try:
        img = Image(p)
        ratio = img.imageWidth / img.imageHeight
        w = 160*mm; h = w / ratio
        if h > 110*mm: h = 110*mm; w = h * ratio
        img.drawWidth = w; img.drawHeight = h
        E.append(KeepTogether([Paragraph(cap, H3), img, Spacer(1, 4*mm)]))
    except Exception as e:
        E.append(Paragraph(f"(could not embed {fn}: {e})", PS))

def footer(canvas, doc_):
    canvas.saveState()
    canvas.setFillColor(SUB); canvas.setFont("Helvetica", 7.5)
    canvas.drawString(18*mm, 10*mm, "Umrah Connect — Platform Audit Report")
    canvas.drawRightString(192*mm, 10*mm, f"Page {doc_.page}")
    canvas.setStrokeColor(GOLD); canvas.setLineWidth(0.6)
    canvas.line(18*mm, 13*mm, 192*mm, 13*mm)
    canvas.restoreState()

doc.build(E, onFirstPage=footer, onLaterPages=footer)
print("PDF written:", f"{BASE}/Umrah-Connect-Audit-Report.pdf")
print("Size:", round(os.path.getsize(f"{BASE}/Umrah-Connect-Audit-Report.pdf")/1048576, 1), "MB")
