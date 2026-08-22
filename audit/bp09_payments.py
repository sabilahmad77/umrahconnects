#!/usr/bin/env python3
"""BP-09: Finance payments — provider abstraction, sandbox gateway, webhooks.

Proves the full gateway path without any external account: payment intents
with idempotency, two-step authorise/capture, deterministic declines, refunds
(partial and full) with invoice reconciliation, an append-only transaction
ledger, and signature-verified, replay-safe webhooks.

Usage: python3 bp09_payments.py [API_URL] [TENANT_ID]
"""
import requests, sys, uuid, json, hmac, hashlib

API = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4000/api/v1"
TEN = sys.argv[2] if len(sys.argv) > 2 else "ac08f9b4-aaec-4474-b61b-4832c5a5ec4c"
SECRET = "dev-sandbox-webhook-secret"          # SANDBOX_WEBHOOK_SECRET default

T = requests.post(f"{API}/auth/login", json={
    "email": "admin@alharamain.sa", "password": "Admin@1234", "tenantId": TEN}).json()["data"]["accessToken"]
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

def sign(body: str) -> str:
    return "sha256=" + hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()

def post_webhook(payload: dict, signature=None, provider="sandbox"):
    body = json.dumps(payload)
    headers = {"Content-Type": "application/json"}
    headers["x-signature"] = sign(body) if signature is None else signature
    return requests.post(f"{API}/payments/webhook/{provider}", data=body, headers=headers)

# ── provider status is honest about what is live ─────────────────────────
ps = gd(requests.get(f"{API}/payments/providers", headers=H))
names = {p["name"]: p for p in ps.get("providers", [])}
chk("provider registry exposes sandbox and stripe", {"sandbox", "stripe"} <= set(names),
    f"(active={ps.get('active')})")
chk("sandbox is configured and usable with no external account",
    names.get("sandbox", {}).get("configured") is True)
chk("stripe reports itself unconfigured and names the missing keys",
    names["stripe"]["configured"] is False and "STRIPE_SECRET_KEY" in names["stripe"]["missing"],
    str(names["stripe"]["missing"]))

# ── fixture: an invoice to settle ────────────────────────────────────────
inv = gd(requests.post(f"{API}/finance/invoices", headers=H, json={
    "issuedToName": "BP09 Payer", "subtotal": 1000, "total": 1000, "currency": "SAR",
    "status": "ISSUED", "type": "CUSTOMER"}))
IID = inv.get("id")
chk("fixture: invoice created", bool(IID), f"total={inv.get('totalCents')}")

# ── 1. intent → confirm → captured ───────────────────────────────────────
key = f"bp09-{uuid.uuid4()}"
r = requests.post(f"{API}/payments/intents", headers=H, json={
    "amount": 400, "currency": "SAR", "invoiceId": IID, "idempotencyKey": key})
p1 = gd(r); PID = p1.get("id")
chk("create payment intent", r.status_code in (200, 201) and PID, f"({r.status_code})")
chk("intent starts PENDING with a gateway reference",
    p1.get("status") == "PENDING" and p1.get("gatewayRef", "").startswith("sbx_pi"),
    f"({p1.get('status')} {p1.get('gatewayRef')})")
chk("intent returns a client secret for the front end", bool(p1.get("clientSecret")))

# idempotency: replaying the same key must not create a second charge
r = requests.post(f"{API}/payments/intents", headers=H, json={
    "amount": 400, "currency": "SAR", "invoiceId": IID, "idempotencyKey": key})
dup = gd(r)
chk("replaying an idempotency key returns the original payment, not a new one",
    dup.get("id") == PID and dup.get("idempotentReplay") is True, f"({r.status_code})")

r = requests.post(f"{API}/payments/intents/{PID}/confirm", headers=H, json={})
cap = gd(r)
chk("confirm captures the payment", r.status_code in (200, 201) and cap.get("status") == "COMPLETED",
    f"({r.status_code} {cap.get('status')})")
chk("captured payment is stamped paidAt", bool(cap.get("paidAt")))

invoice = gd(requests.get(f"{API}/finance/invoices/{IID}", headers=H))
chk("invoice reconciles to PARTIALLY_PAID after a part payment",
    invoice.get("status") == "PARTIALLY_PAID" and int(invoice.get("paidCents", 0)) == 40000,
    f"({invoice.get('status')} paid={invoice.get('paidCents')})")

# ── 2. transaction ledger ────────────────────────────────────────────────
tx = gd(requests.get(f"{API}/payments/{PID}/transactions", headers=H))
types = [t["type"] for t in tx]
chk("transaction ledger records the intent and the capture",
    "INTENT_CREATED" in types and "CAPTURED" in types, str(types))
chk("ledger is ordered oldest first", types[0] == "INTENT_CREATED")

# ── 3. deterministic declines ────────────────────────────────────────────
r = requests.post(f"{API}/payments/intents", headers=H, json={
    "amount": 50, "currency": "SAR", "scenario": "decline_at_intent"})
d1 = gd(r)
chk("a declined intent is recorded as FAILED, not silently dropped",
    d1.get("status") == "FAILED" and d1.get("failureReason"), f"({d1.get('status')})")

r = requests.post(f"{API}/payments/intents", headers=H, json={"amount": 60, "currency": "SAR"})
d2 = gd(r)
r = requests.post(f"{API}/payments/intents/{d2['id']}/confirm", headers=H, json={"scenario": "decline_at_capture"})
d2c = gd(r)
chk("a capture failure marks the payment FAILED with a reason",
    d2c.get("status") == "FAILED" and "insufficient" in str(d2c.get("failureReason")),
    f"({d2c.get('status')} {d2c.get('failureReason')})")
rt("confirming an already-failed payment → 400",
   requests.post(f"{API}/payments/intents/{d2['id']}/confirm", headers=H, json={}), 400)

# ── 4. refunds: partial then full, with reconciliation ───────────────────
r = requests.post(f"{API}/payments/{PID}/refund", headers=H, json={"amount": 100, "reason": "Partial goodwill"})
rf1 = gd(r)
chk("partial refund", r.status_code in (200, 201) and int(rf1.get("refundedCents", 0)) == 10000, f"({r.status_code})")
chk("a partial refund is PARTIALLY_REFUNDED, not REFUNDED",
    rf1.get("status") == "PARTIALLY_REFUNDED", f"({rf1.get('status')})")
invoice = gd(requests.get(f"{API}/finance/invoices/{IID}", headers=H))
chk("invoice paid amount drops by the refund", int(invoice.get("paidCents", 0)) == 30000,
    f"(paid={invoice.get('paidCents')})")

rt("refunding more than the remaining balance → 400",
   requests.post(f"{API}/payments/{PID}/refund", headers=H, json={"amount": 9999}), 400)

r = requests.post(f"{API}/payments/{PID}/refund", headers=H, json={"reason": "Remainder"})
rf2 = gd(r)
chk("refunding the remainder marks it fully REFUNDED",
    rf2.get("status") == "REFUNDED" and int(rf2.get("refundedCents", 0)) == 40000, f"({rf2.get('status')})")
rt("refunding a fully refunded payment → 400",
   requests.post(f"{API}/payments/{PID}/refund", headers=H, json={"amount": 1}), 400)

# ── 5. webhooks: signature, idempotency, effect ──────────────────────────
r = requests.post(f"{API}/payments/intents", headers=H, json={"amount": 250, "currency": "SAR", "invoiceId": IID})
wp = gd(r); WID = wp["id"]; WREF = wp["gatewayRef"]

evt = {"id": f"evt_{uuid.uuid4()}", "type": "payment.captured", "data": {"providerRef": WREF}}
r = post_webhook(evt)
w1 = gd(r)
chk("a correctly signed webhook is accepted", r.status_code == 200 and w1.get("received"), f"({r.status_code})")
chk("the webhook captured the payment", w1.get("result") == "captured", str(w1.get("result")))
after = gd(requests.get(f"{API}/payments/{WID}", headers=H))
chk("payment is COMPLETED after the webhook", after.get("status") == "COMPLETED", f"({after.get('status')})")
chk("webhook is written to the transaction ledger",
    any(t["type"] == "WEBHOOK_RECEIVED" for t in after.get("transactions", [])))

r = post_webhook(evt)          # exact replay
w2 = gd(r)
chk("a replayed webhook is recognised and NOT applied twice",
    r.status_code == 200 and w2.get("duplicate") is True, f"(duplicate={w2.get('duplicate')})")
inv_after = gd(requests.get(f"{API}/finance/invoices/{IID}", headers=H))
chk("the replay did not double-count against the invoice",
    int(inv_after.get("paidCents", 0)) == 25000, f"(paid={inv_after.get('paidCents')})")

rt("webhook with a tampered signature → 400", post_webhook(
    {"id": f"evt_{uuid.uuid4()}", "type": "payment.captured", "data": {"providerRef": WREF}},
    signature="sha256=deadbeef"), 400)
rt("webhook with no signature at all → 400", requests.post(
    f"{API}/payments/webhook/sandbox", data=json.dumps({"id": "evt_x", "type": "payment.captured"}),
    headers={"Content-Type": "application/json"}), 400)
rt("webhook with a mutated body but the original signature → 400", requests.post(
    f"{API}/payments/webhook/sandbox",
    data=json.dumps({"id": evt["id"], "type": "payment.captured", "data": {"providerRef": "sbx_pi_tampered"}}),
    headers={"Content-Type": "application/json", "x-signature": sign(json.dumps(evt))}), 400)
rt("webhook for an unknown provider → 400", post_webhook(
    {"id": f"evt_{uuid.uuid4()}", "type": "payment.captured"}, provider="banana"), 400)

# ── 6. red team on intents ───────────────────────────────────────────────
rt("intent with no amount → 400", requests.post(f"{API}/payments/intents", headers=H, json={}), 400)
rt("intent with a negative amount → 400",
   requests.post(f"{API}/payments/intents", headers=H, json={"amount": -5}), 400)
rt("intent with a zero amount → 400",
   requests.post(f"{API}/payments/intents", headers=H, json={"amount": 0}), 400)
rt("intent above the invoice outstanding balance → 400",
   requests.post(f"{API}/payments/intents", headers=H, json={"amount": 99999, "invoiceId": IID}), 400)
rt("intent against a bogus invoice → 404",
   requests.post(f"{API}/payments/intents", headers=H, json={"amount": 10, "invoiceId": BOGUS}), 404)
rt("intent with an unknown provider → 400",
   requests.post(f"{API}/payments/intents", headers=H, json={"amount": 10, "provider": "banana"}), 400)
# 503 is the right answer here, and the one exception to "never 5xx": missing
# server credentials are a configuration fault, not bad client input. It must
# say so loudly rather than pretend a payment was taken.
_stripe = requests.post(f"{API}/payments/intents", headers=H, json={"amount": 10, "provider": "stripe"})
chk("intent naming the unconfigured stripe provider → 503 (config fault, not a fake success)",
    _stripe.status_code == 503 and "STRIPE_SECRET_KEY" in _stripe.text,
    f"({_stripe.status_code})")
rt("bogus sandbox scenario → 400",
   requests.post(f"{API}/payments/intents", headers=H, json={"amount": 10, "scenario": "explode"}), 400)
rt("confirm a bogus payment → 404",
   requests.post(f"{API}/payments/intents/{BOGUS}/confirm", headers=H, json={}), 404)
rt("confirm an already captured payment → 400",
   requests.post(f"{API}/payments/intents/{WID}/confirm", headers=H, json={}), 400)
rt("refund a payment that never captured → 400",
   requests.post(f"{API}/payments/{d2['id']}/refund", headers=H, json={"amount": 1}), 400)
rt("unauth intent → 401", requests.post(f"{API}/payments/intents", json={"amount": 10}), 401)
rt("unauth providers → 401", requests.get(f"{API}/payments/providers"), 401)

# ── 7. audit ─────────────────────────────────────────────────────────────
al = gd(requests.get(f"{API}/admin/audit-logs?resource=payment&limit=200", headers=H))
rows = [x for x in (al.get("items", al) if isinstance(al, dict) else al) if x.get("resourceId") in (PID, WID)]
actions = {x.get("action") for x in rows}
chk("payments are audited from initiation to completion",
    "PAYMENT_INITIATE" in actions and "PAYMENT_COMPLETE" in actions, str(sorted(actions)))

print(f"\nBP-09: {ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
