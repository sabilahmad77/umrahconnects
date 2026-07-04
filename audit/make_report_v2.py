#!/usr/bin/env python3
"""Umrah Connect Audit Report v2 — adds interaction-level testing evidence."""
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
ix  = json.load(open(f"{BASE}/interactions.json"))

doc = SimpleDocTemplate(f"{BASE}/Umrah-Connect-Audit-Report.pdf", pagesize=A4,
                        leftMargin=18*mm, rightMargin=18*mm, topMargin=16*mm, bottomMargin=16*mm)
E = []

def scell(s):
    color = {"WORKING": OK, "PASS": OK, "PARTIAL": AMBER, "BROKEN": RED, "FAIL": RED}.get(s, SUB)
    return Paragraph(f'<font color="{color.hexval()}"><b>{s}</b></font>', P)

def tbl(data, widths, header=True):
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    style = [('FONTSIZE', (0,0), (-1,-1), 8.5), ('VALIGN', (0,0), (-1,-1), 'TOP'),
             ('GRID', (0,0), (-1,-1), 0.4, C.HexColor("#D9D7D0")),
             ('ROWBACKGROUNDS', (0,1), (-1,-1), [C.white, IVORY]),
             ('TOPPADDING', (0,0), (-1,-1), 3), ('BOTTOMPADDING', (0,0), (-1,-1), 3)]
    if header:
        style += [('BACKGROUND', (0,0), (-1,0), GREEN), ('TEXTCOLOR', (0,0), (-1,0), C.white),
                  ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold')]
    t.setStyle(TableStyle(style)); return t

ixp = sum(1 for r in ix if r['status']=='PASS'); ixa = sum(1 for r in ix if r['status']=='PARTIAL'); ixf = sum(1 for r in ix if r['status']=='FAIL')

# ── COVER ──
E.append(Spacer(1, 36*mm))
E.append(Paragraph("Umrah Connect", ParagraphStyle('T', parent=H1, fontSize=34, alignment=1)))
E.append(Paragraph("Full Platform Audit — Final Consolidated Report", ParagraphStyle('T2', parent=P, fontSize=14, alignment=1, textColor=GOLD)))
E.append(Spacer(1, 6*mm))
E.append(Paragraph(datetime.date.today().strftime("%d %B %Y"), ParagraphStyle('T3', parent=PC, textColor=SUB)))
E.append(Spacer(1, 22*mm))
E.append(tbl([
 ["Method", f"Live application driven in Chrome like a real user: {len(ix)} interactive tests across all 7 roles (clicks, form submits, modals, filters, sign-out, messaging, groups, signup) + 73 automated API checks (run twice, consistent) + 60-page walkthrough + mobile code/APK audit + DB inspection"],
 ["Evidence", "70+ screenshots (audit/screenshots/) incl. every dashboard, interactions, and the crash overlay"],
 ["Web tested", "http://localhost:3000 (Next.js 14)"],
 ["API tested", "http://localhost:4000/api/v1 (NestJS · Prisma · PostgreSQL 15 — connected)"],
 ["Mobile", "Expo SDK 54 · 23 screens · release APK 83 MB"],
 ["Results", f"API {api['working']}/{api['total']} ({api['pct']}%) · UI interactions {ixp} PASS / {ixa} PARTIAL / {ixf} FAIL"],
], [26*mm, 148*mm], header=False))
E.append(PageBreak())

# ── EXEC SUMMARY ──
E.append(Paragraph("1. Executive Summary", H1))
E.append(Paragraph(
 f"This audit was performed on the running application, not from code, across <b>all seven roles</b>. As a real user "
 "in Chrome we: created a social post and saw it appear in the feed; liked and commented (comment visible); filtered "
 "the marketplace, opened a listing and completed the Book modal (booking created); opened create-request, "
 "Add-Listing, Add-Pilgrim, create-group, Add-Vehicle, new-visa-application and create-invoice forms; switched fleet "
 "tabs; verified KYC approve actions; searched CRM and Admin users; opened messaging and groups; tested signup and "
 f"sign-out. <b>{ixp} of {len(ix)} interactions pass outright, {ixa} partial, {ixf} fail.</b> The backend passes "
 f"{api['working']}/{api['total']} API checks ({api['pct']}%) — re-run after a machine reboot with identical results "
 "(defects are deterministic, not flaky). The platform is genuinely interactive and demo-ready. It is held back from "
 "production by one crashing page (Hotels list — Operator and Hotel Owner, reproduced 3×), two API defects, missing "
 "web messaging composer and forgot-password entry, static areas (Settings, Reports tabs, Admin moderation buttons), "
 "missing payments/media-upload/notification-events, and dev-only operational fragility (full stack died on machine "
 "reboot during this audit, including a stale PostgreSQL lock that required manual recovery).", P))
E.append(Spacer(1, 3*mm))
E.append(Paragraph("Platform status: <b>DEMO-READY · ~80% complete · NOT yet production-ready</b>", H3))

# ── COMPLETION ──
E.append(Paragraph("2. Completion Estimates", H2))
E.append(tbl([["Layer","%","Grounding"],
 ["Backend / API","90%","71/73 live checks; missing payments, media upload, notification events, self-serve registration"],
 ["Frontend Web","85%","All pages render on-brand; 19/26 interactions pass; 1 crash; settings/reports-tabs static"],
 ["Mobile","70%","23 screens, 24 mutations, APK builds; missing messaging, media upload, group detail, profile edit"],
 ["Marketplace","80%","Filter→detail→Book verified end-to-end in UI; Add-Listing modal opens; editing/moderation gaps"],
 ["Social Hub","80%","Post→feed, like, comment verified in UI; trending/suggested real; media upload missing"],
 ["CRM","85%","Search verified; booking detail opens; Add-Pilgrim modal opens (selector mismatch only); POST /bookings DTO bug"],
 ["Overall","~80%","Weighted"]], [34*mm, 14*mm, 126*mm]))

# ── INTERACTION MATRIX ──
E.append(Paragraph("3. Interactive Test Matrix (driven in Chrome, real clicks)", H2))
rows = [["Role","Interaction","Result","Note"]]
for r in ix:
    rows.append([r['role'], r['action'], scell(r['status']), r['note'][:60]])
E.append(tbl(rows, [18*mm, 64*mm, 16*mm, 76*mm]))
E.append(PageBreak())

# ── API MATRIX (condensed by area) ──
E.append(Paragraph("4. API Audit (73 live checks)", H2))
areas = {}
for r in api['results']:
    a = areas.setdefault(r['area'], {'ok':0,'bad':0,'fails':[]})
    if r['status']=='WORKING': a['ok']+=1
    else: a['bad']+=1; a['fails'].append(f"{r['name']} ({r['http']})")
rows=[["Area","Pass","Fail","Failing checks"]]
for k,v in areas.items():
    rows.append([k, str(v['ok']), str(v['bad']), '; '.join(v['fails'])[:70] or '—'])
E.append(tbl(rows, [30*mm, 14*mm, 14*mm, 116*mm]))
E.append(Paragraph("Defects: POST /bookings rejects 'pilgrimId' (DTO drift — 400); POST /transport/vehicles returns 500 on type='BUS' (unvalidated enum). All other endpoints pass, including full Super Admin module, reports, marketplace request→offer flow, and social interactions (persistence re-verified through the UI).", P))

# ── FINDINGS ──
E.append(Paragraph("5. Key Findings", H2))
E.append(Paragraph("Critical", H3))
for s in ["Hotels list page crashes for Operator AND Hotel Owner (reproduced twice this audit): TypeError toLocaleString on undefined at components/hotels/hotels-list.tsx:66. Page unusable; blocks hotel management from the standard route.",
          "POST /bookings rejects pilgrimId — API-level booking-with-pilgrim creation broken (UI Book modal works via listing flow).",
          "Operational fragility: services + tunnels die on machine sleep; URLs rotate, invalidating the APK's baked API URL. Requires real deployment."]:
    E.append(Paragraph("• "+s, P))
E.append(Paragraph("Medium", H3))
for s in ["Web messaging page has NO compose UI (no input found) — messaging is effectively read-only shell on web.",
          "Web login has NO forgot-password link at all (mobile login has one; flow unimplemented on both).",
          "Signup page exists but has no backend (stub).",
          "Admin → Marketplace moderation shows 0 Approve/Remove buttons (actions not rendered).",
          "Reports page has no tab navigation (single static view).",
          "Settings pages mostly static (4 interactive controls).",
          "Traveler Groups page shows 0 groups while operator sees 19+ (visibility filtering hides all; group detail/discussion not implemented).",
          "Vehicle create 500 on unknown enum (should be 400).",
          "No server-side notification events; no payments; no media upload.",
          "Mobile: messaging/group-detail/profile-edit missing; legacy duplicate marketplace screen."]:
    E.append(Paragraph("• "+s, P))
E.append(Paragraph("Low", H3))
for s in ["Traveler sign-out on /social blocked by open notifications panel overlay (retry from /settings PASSED — UX z-index issue, not a broken feature).",
          "Add-Pilgrim modal uses non-standard field attributes (automation couldn't match; modal opens fine).",
          "Residual emoji on operator dashboard greeting and hotels label; Next.js 14.2.35 outdated; React types collision (cosmetic)."]:
    E.append(Paragraph("• "+s, P))

# ── ACTION PLAN ──
E.append(Paragraph("6. Prioritised Action Plan", H2))
for i,s in enumerate([
 "Fix hotels-list crash + 2 API defects (&lt;1 day).",
 "Deploy to stable infrastructure (web, API+DB, domain); rebuild APK once against the stable URL.",
 "Render Admin listing-moderation actions; add Reports tab navigation; make Settings functional.",
 "Notification event generation server-side (booking, like, comment, offer).",
 "Media upload (posts, listings, hotels) — unlocks photo-first design with real content.",
 "Payments integration behind existing booking confirm UI.",
 "Mobile completion: messaging, group detail, profile edit; remove legacy marketplace screen.",
 "Self-serve signup + password reset."],1):
    E.append(Paragraph(f"{i}. {s}", P))
E.append(PageBreak())

# ── SCREENSHOTS ──
E.append(Paragraph("7. Screenshot Evidence (selection — full set: audit/screenshots/)", H1))
shots = [
 ("ix_traveler_post_created.png","Interaction: post created via composer, visible in feed"),
 ("ix_traveler_comment.png","Interaction: comment submitted and visible"),
 ("ix_traveler_market_filtered.png","Interaction: marketplace filtered by Hotel"),
 ("ix_traveler_book_modal.png","Interaction: Book modal filled before submit"),
 ("ix_traveler_request_form.png","Interaction: create-request form open"),
 ("ix_traveler_notifications.png","Interaction: notifications panel open"),
 ("ix_operator_add_pilgrim.png","Interaction: Add Pilgrim modal"),
 ("ix_operator_booking_detail.png","Interaction: booking detail opened"),
 ("ix_operator_add_listing.png","Interaction: Add Listing modal"),
 ("ix_operator_hotels_check.png","CRITICAL: hotels page crash (reproduced)"),
 ("ix_operator_group_modal.png","Interaction: create-group modal"),
 ("ix_operator_settings.png","Settings (mostly static)"),
 ("ix_hotel_add_form.png","Hotel Owner: Add Hotel form"),
 ("ix_admin_kyc_actions.png","Admin: KYC approve actions"),
 ("ix_admin_users_filter.png","Admin: users search filter"),
 ("ix_admin_listings_mod.png","Admin: listings moderation (no action buttons — finding)"),
 ("ix_transport_tabs.png","Transport: fleet tabs (Vehicles/Drivers/Routes)"),
 ("ix_transport_add_vehicle.png","Transport: Add Vehicle form"),
 ("ix_visa_applications.png","Visa Agency: applications list"),
 ("ix_finance_new_invoice.png","Finance: create-invoice form"),
 ("ix_finance_budget_plans.png","Finance: budget plans"),
 ("ix_traveler_messages.png","Traveler messaging (no composer — finding)"),
 ("ix_traveler_groups.png","Traveler groups (0 visible — visibility finding)"),
 ("ix_public_signup.png","Signup page (backend stub)"),
 ("public_landing.png","Landing page"),
 ("operator_dashboard.png","Operator dashboard"),
 ("traveler_marketplace.png","Marketplace photo cards"),
 ("admin_admin-dashboard.png","Super Admin overview"),
 ("mobile_web_login.png","Mobile (Expo web render) login"),
]
for fn, cap in shots:
    p = os.path.join(BASE, "screenshots", fn)
    if not os.path.exists(p): continue
    try:
        img = Image(p); ratio = img.imageWidth/img.imageHeight
        w = 158*mm; h = w/ratio
        if h > 105*mm: h = 105*mm; w = h*ratio
        img.drawWidth=w; img.drawHeight=h
        E.append(KeepTogether([Paragraph(cap, H3), img, Spacer(1, 4*mm)]))
    except Exception as e:
        E.append(Paragraph(f"(skip {fn}: {e})", PS))

def footer(canvas, d):
    canvas.saveState(); canvas.setFillColor(SUB); canvas.setFont("Helvetica", 7.5)
    canvas.drawString(18*mm, 10*mm, "Umrah Connect — QA & Product Audit v2 (Interactive)")
    canvas.drawRightString(192*mm, 10*mm, f"Page {d.page}")
    canvas.setStrokeColor(GOLD); canvas.setLineWidth(0.6); canvas.line(18*mm, 13*mm, 192*mm, 13*mm)
    canvas.restoreState()

doc.build(E, onFirstPage=footer, onLaterPages=footer)
print("PDF v2 written:", f"{BASE}/Umrah-Connect-Audit-Report.pdf",
      round(os.path.getsize(f"{BASE}/Umrah-Connect-Audit-Report.pdf")/1048576,1), "MB")
