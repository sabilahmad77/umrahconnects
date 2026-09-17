# Agents and execution tracks — core finalization loop

Native subagents were used. Each ran with a bounded file scope. The coordinator (Agent 1) owned integration, the test database and every commit.

| Track | How it ran | Scope | Output |
|---|---|---|---|
| 1 Core coordinator / Control Tower | main session | worktree, schema, RBAC core, auth, payments, storage, infra, docs, commits | this directory |
| 2 Authentication & sessions | main session | `modules/auth`, `modules/mail`, `bootstrap/` | D-011…D-015 |
| 3 RBAC / tenant isolation | main session (core) + 4 remediation subagents | `modules/rbac`, guards, `tenant-scope.ts`; module fixes split by agent (below) | SEC-001…045 |
| 4 API & backend remediation | 4 parallel subagents, disjoint module sets: (a) hotels + transport; (b) bookings, pilgrims, finance, compliance, visa requests; (c) groups, social, connections, notifications; (d) marketplace, marketplace requests, inquiries, plugin host | typed DTOs, ownership checks, policies | compile-clean; contract-change reports merged into RELEASE_EVIDENCE |
| 5 Database / migrations | main session | Prisma Migrate baseline + migrations, seeds/scripts | D-010 |
| 6 Stripe / Google / storage | main session | providers, document access, provider integration suites | D-015…D-017 |
| 7 KVM 8 readiness | main session | Dockerfile, `infrastructure/kvm`, rehearsal | INFRASTRUCTURE.md |
| 8 Security red team | 1 subagent (sole owner of the e2e database while running) + main session follow-ups | isolation, marketplace, payments, rate-limit suites; Stripe signature unit tests | RED_TEAM_AUDIT.md (RT-001…010) |
| 9 Integration QA | main session | runtime QA script, browser check, container smoke test | RELEASE_EVIDENCE.md |
| Read-only auditors | 3 Explore subagents at the start | isolation audit (two halves), mock/env/infra inventory | FINDINGS_CHECKLIST.md |

Rules that kept parallel edits safe: disjoint file ownership per agent; agents could compile but not run e2e tests, start servers, migrate or commit; the coordinator re-ran the full suite after each merge.
