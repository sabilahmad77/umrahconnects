# Blueprint checklist — loop sections §0–§38

| § | Topic | Status |
|---|---|---|
| 0 | Workspace gate | ✅ verified (root + worktree) |
| 1–2 | Parallel policy, safe branch/worktree | ✅ `claude/core-finalization` worktree; nothing under `apps/web` touched |
| 3 | Control Tower | ✅ this directory |
| 4 | Multi-agent execution | ✅ AGENTS.md (real subagents) |
| 5 | Finding reconciliation | ✅ FINDINGS_CHECKLIST.md |
| 6 | P0 security first | ✅ SEC P0 + AUD-002/003 closed |
| 7 | Role architecture | ✅ D-005/D-006, catalogue |
| 8 | Finance decision | ✅ D-004 |
| 9 | Tenant isolation | ✅ service layer + isolation suite (RLS deferred) |
| 10 | Auth finalization | ✅ |
| 11 | Google Sign-In | ✅ code + e2e; provider verification BLOCKED (credentials) |
| 12 | API remediation | ✅ 325-route inventory with policies |
| 13 | Database & migrations | ✅ |
| 14 | Core workflows backend | ✅ for implemented modules; XT-003 blocked by product decision |
| 15 | Fake/mock behaviour | ✅ backend; frontend items → Codex |
| 16 | Stripe | ✅ code + stripe-mock; test mode BLOCKED (keys) |
| 17 | R2 / storage | ✅ code + MinIO; real R2 BLOCKED (credentials) |
| 18 | KVM 8 architecture | ✅ prepared + rehearsed; not deployed |
| 19 | Obsolete hosting | ✅ inventory; Render deprecated (kept until cutover) |
| 20–21 | Vercel contract, CORS/cookies | ✅ INFRASTRUCTURE.md; web actions in CROSS_TRACK_REQUESTS |
| 22 | Input validation | ✅ |
| 23 | Rate limiting | ✅ |
| 24 | Logging & errors | ✅ |
| 25 | Headers / hardening | ✅ API + Caddy |
| 26 | Secrets | ✅ templates by name; image and repo checked |
| 27 | Backup / recovery | ✅ scripts + drill; off-site BLOCKED |
| 28 | Red team | ✅ RED_TEAM_AUDIT.md |
| 29 | Test suite | ✅ unit, e2e, integration |
| 30 | Local full-stack QA | ✅ runtime QA + browser (Stripe/Google/R2 live flows blocked) |
| 31 | Codex dependencies | ✅ statuses recorded |
| 32–33 | Scorecard, 95 % gate | ✅ calculated: 84.4 → launch not recommended |
| 34–35 | Evidence, final reconciliation | ✅ |
| 36 | Mobile untouched | ✅ |
| 37–38 | Completion gate, final report | FINAL_REPORT.md |
