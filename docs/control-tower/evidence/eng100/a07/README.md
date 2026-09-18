# A07 evidence — traveler ↔ pilgrim link (P06, D-022)

Browser check, 2026-09-18, worktree `eng100/a07` (API :4407, web :3407, DB
`umrah_eng100_a07` seeded with `prisma/scripts/seed-qa-identities.ts`).
`playwright-core` driving the installed Google Chrome, headless, one browser
context per identity, every sign-in through the real `/login` form. The
invitation link was read from the API's development mail log
(`MAIL_DRIVER=log`); no token or password is recorded here.

Result: **15 / 15 steps passed** — see `browser-check.json`.

| # | Identity | What was checked | Screenshot |
|---|---|---|---|
| 1 | Operator Admin A | "Traveler access" tab → Invite (prefilled with the email on record) → "Invitation waiting for the traveler" | `01-operator-a-invitation-sent.png` |
| 2 | Traveler B | Opens A's invitation → "This invitation is for a different email address"; token already stripped from the address bar | `02-traveler-b-wrong-account-refused.png` |
| 3 | Traveler A | Opens the link, signs in → preview names the organization and the record → accepts | `03-traveler-a-invitation-preview.png` |
| 4 | Traveler A | Travel plan shows booking QA-2026-A0001 (Partially Paid), group, visa (Submitted), labelled "Al-Noor Umrah Services"; no passport data | `04-traveler-a-travel-plan-linked.png` |
| 5 | Traveler B | Travel plan: "No trips are linked to your account yet" | `05-traveler-b-travel-plan-empty.png` |
| 6 | Operator Admin B | Operator A's record → "Information unavailable"; `GET /pilgrims/:id/account-links` → 404 | `06-operator-b-cannot-open-record.png` |
| 7 | Operator Admin A | Access tab shows "Linked to Amina Rahman" | `07-operator-a-linked.png` |
| 8 | Operator Admin A | Revoke with a reason → history shows who, when and why | `08-operator-a-revoked-with-reason.png` |
| 9 | Traveler A | After refresh the trip is gone | `09-traveler-a-after-revoke.png` |
| 10 | Traveler A | Re-opening the used link → "This invitation link cannot be used" | `10-traveler-a-replay-refused.png` |

Note: the access history in screenshot 08 also lists an invitation revoked with
the reason "Reset between browser check runs". A first run stopped at step 2
(a StrictMode-only bug in the invitation page, fixed in the same branch); the
invitation it left open was closed directly in the local database before the
passing run.
