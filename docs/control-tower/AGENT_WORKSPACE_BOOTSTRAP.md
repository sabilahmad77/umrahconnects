# Agent Workspace Bootstrap

Every engineering session must pass this gate before changing any file. This applies to Claude Code, Codex, a human pasting generated code, and parallel agents.

## Mandatory opening sequence

```bash
pwd                                   # 1. where am I
git rev-parse --show-toplevel         # 2. which repository
scripts/verify-workspace.sh           # 3. workspace verification (must exit 0)
cat .project/workspace.json           # 4. confirm project identity and layout
git status --short && git log --oneline -3   # 5. existing local work
```

Only after these steps may the session edit code (step 6).

If step 3 exits non-zero, the session **stops** and reports `WORKSPACE: WRONG`. It does not copy files in from elsewhere, create a new clone, or work in the wrong folder.

If step 5 shows uncommitted or unpushed work, the session leaves it alone and reports it. Local work is never discarded without explicit approval.

## Claude Code rule

- The session folder must be `/Users/macbook/Projects/umrah-connects`. If the desktop app opened a different folder, stop and ask the user to reopen the session on the right folder.
- Start dev servers through `.claude/launch.json` (preview launcher), not ad-hoc background shells.
- Before reporting that localhost works, run `scripts/verify-workspace.sh --runtime`.

## Codex rule

- Codex's working directory must be the canonical root. Run the same opening sequence and include its output in the task log.
- Codex does not create its own clone. If it needs isolation, it asks Control Tower for a worktree (see the parallel-agent rule below).

## ChatGPT-generated implementation rule

- Code written outside the repository, such as in a chat window, is untrusted input until someone applies it inside the canonical root, after the opening sequence has passed.
- Whoever applies it names the target files by path relative to the repository root and reviews the diff with `git diff` before committing.
- Generated code must not contain secrets, absolute paths from other machines, or references to other checkouts.

## Parallel-agent rule

- Parallel agents use **Git worktrees of this repository** (`git worktree add ...`), and only when Control Tower explicitly assigns them. Each worktree gets its own branch.
- Inside a coordinated worktree, run verification as `UC_ALLOW_WORKTREE=1 scripts/verify-workspace.sh`. The script accepts only worktrees registered on the canonical repository.
- Agents never create unrelated copies (downloaded zips, fresh `git clone`s, copied folders).
- Only one set of dev servers binds `:3000` and `:4100`. A worktree that needs its own runtime uses different ports, which Control Tower records.
- Worktrees are merged back through reviewed commits and then removed with `git worktree remove`.

## Deploy and push rule

`main` auto-deploys to production (Vercel web, Render API). No agent pushes to `main` or deploys unless a loop explicitly authorizes it.
