# Loops backlog (after the core loop)

| Priority | Loop | Content |
|---|---|---|
| 1 | Credentials & staging | Supply BLK-02…BLK-05. Run provider suites against real R2, SMTP, Stripe test mode and Google. Stand up staging on KVM. |
| 1 | Codex integration | XT-R01…R10 (P1 first), then a combined browser QA per role |
| 1 | KVM cutover | Provision (runbook §1), migrate the Render database (§3), point Vercel at the new API, uptime monitoring, retire Render |
| 2 | Background jobs | Overdue invoices, visa/document expiry reminders, orphaned object cleanup, expired OAuth ticket / OTP purge (AUD-038, O04) |
| 2 | RLS defence in depth | Non-owner DB role, policies per tenant table, transaction-scoped tenant context, bypass role for platform/migrations (D-009) |
| 2 | Traveler ↔ pilgrim link | Product decision + consented linking; unlocks "my visa" (XT-003) |
| 3 | Preferences & notifications | User preferences model (XT-005), email notifications via MailService, realtime channel (AUD-034) |
| 3 | Consistency | Unified response envelope for legacy controllers, reference-number collisions (random 5-digit suffixes), seed realism (AUD-028) |
| 3 | Scale readiness | Redis throttler store before horizontal scaling; structured JSON logging; metrics |
| 3 | Compliance | ZATCA e-invoicing, regulator integrations (Nusuk/SISKOPATUH/NAHCON) |
| — | Mobile | Native app remediation, after the web + core + integration gates |
