# Stage ii: Implement

> **GATE CHECK — MANDATORY**
> Read `tmp/auto-state.md`. Verify `state` is `spec-review-phase-2-complete`.
> If it is NOT, you have skipped stage i (spec review). **STOP. Go back and execute stage i first.**
> Do not proceed under any circumstances if this gate fails.

Dispatches `/implement <spec> --auto --run-id <id>`.

---

## Dispatch

```bash
/implement <spec> --auto --run-id <run_id>
```

The `--auto` flag short-circuits the interactive picker:

```
IF parallelism_ratio >= 0.35  → option [4]: single-agent + 1 parallel helper
ELSE                           → option [1]: single-agent
```

Options [2] subagent-per-task and [3] clear-context are excluded.

---

## Pre-Implement Anchor

Immediately before dispatching agent ii, capture:
```
pre_implement_head = HEAD
```
This is a local variable — not persisted in `auto-state.md`. Used by validators to distinguish implement commits from earlier phase commits.

---

## Agent ii Validators (post-return)

Run after implement returns, before advancing to agent iii:

1. **Commit check:** `git rev-list --count pre_implement_head..HEAD > 0` — at least one commit made.
2. **Spec existence:** spec file still exists (implement must not delete its input).
3. **Working tree policy** (uses `git status --porcelain`):
   - Untracked inside `tmp/` — allowed
   - Untracked outside `tmp/` — **validator failure**
   - Modified tracked files outside `tmp/` — **validator failure**
   - `.gitignored` files — allowed (not in `git status --porcelain`)

**On validator failure:** retry once (Q3 crash path). If retry fails, halt per Q3 crash-implement.

---

## State Update

On success: set `implement_head = HEAD` in `auto-state.md`, transition to `implementation-complete`.

---

## Failure Surface

| Failure | Handling |
|---|---|
| Main agent crash | Retry once → halt (Q3 crash-implement) |
| Helper hang/crash | Main agent absorbs helper's tasks (existing executing-plans behavior) |

---

## Next Stage

When stage ii is complete (validators passed, `implement_head` set), update `tmp/auto-state.md` state to `implementation-complete`, then load and execute `references/auto/stages/stage-iii-code-review.md`.

**Do NOT skip this step. The code review stage is mandatory.**
