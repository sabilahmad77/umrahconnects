# AI collaboration

- **Claude Code** (this track) works only in the core worktree after passing `scripts/verify-workspace.sh` (worktree mode: `UC_ALLOW_WORKTREE=1`).
- **Codex** works in the web worktree and reads `CROSS_TRACK_REQUESTS.md` for backend contracts. It records backend needs in `docs/ui-ux/BACKEND_DEPENDENCIES.md`.
- **Handoff format:** every contract change lists the route, the old and new behavior, the error codes and the frontend action (see RELEASE_EVIDENCE.md, "Request-contract changes").
- **Evidence over assertions:** claims in this directory point at a test name, command output or file in `evidence/`.
- **Generated code from chat tools** is applied only inside a verified worktree and must pass the API quality gate (SECURITY_PROTOCOL.md §12).
