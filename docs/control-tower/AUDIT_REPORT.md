# Audit report — reconciliation summary

| Source | Items | Closed & verified | Fixed, provider verification blocked | Blocked (external) | Deferred / superseded / other track |
|---|---|---|---|---|---|
| 2026-09-17 audit (AUD-001…041) | 41 | 21 | 3 (AUD-010, 011, 022) | 2 (AUD-001, 020) | 15 (frontend → Codex 8, mobile 1, backlog 4, AUD-024 UI part 1, AUD-041 superseded 1) |
| Core audit (SEC-001…045) | 45 | 44 | — | — | 1 (SEC-041 web header pending) |
| Red team (RT-001…010) | 10 | 10 | — | — | — |
| Codex dependencies (XT-001…009) | 9 | 7 | — | 1 (XT-003 product) | 1 (XT-005 deferred) |

The "Closed" column includes AUD-012 (tests exist; CI not executed on GitHub) and AUD-026 (API lint). Details for every item: FINDINGS_CHECKLIST.md.

Findings that were not simply accepted from the earlier audit but re-verified: AUD-002/003/005/006/007/008 reproduced live before the fix (runtime QA probes); AUD-041 re-evaluated (superseded by D-009). The earlier claim that isolation holds for nine entity types was only partly true — the core audit found foreign-id linking in bookings, finance, compliance and transport (SEC-009/010/017–021).
