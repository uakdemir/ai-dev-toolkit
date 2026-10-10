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

The `--auto` flag short-circuits the interactive picker: on a FULL run it takes the recommendation (`per-task` when the plan's tasks barely overlap, otherwise `single`), as `/implement` defines it. A LIGHT run is `single`, and a MECHANICAL run `single` or the scripted edit, with no recommendation to take. `--auto` also suppresses Step C's write-a-plan prompt, so a spec that fires one of its hard signals is implemented directly instead of ending the dispatch with no commit.

`/implement` resolves its tier and dispatches its coders as agents, on Sonnet by the tier's row, so this stage's sub-agent can run it only where Claude Code's spawn-depth cap is at least two. Under a cap of one `/implement` stops with its no-Agent-tool error and makes no commit, which the commit check below fails, unless the tier is MECHANICAL and the run makes the scripted edit, which dispatches no agent. No nested run has measured the dispatch: `references/shared-rules/agent-dispatch-pin.md`

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

**On validator failure:** retry once (`../failure-handling/retry-semantics.md`). If the retry also fails, follow `../failure-handling/crash.md`: wip-commit, do not rewind, stop.

---

## Failure Surface

| Failure | Handling |
|---|---|
| Main agent crash | Retry once → stop (Q3, see `../failure-handling/crash.md`) |

---

## Profiling

After `/implement` returns (BEFORE the validator suite runs), append one JSONL entry to the profiling log per `references/auto/profiling-log.md`: `action=implement`, `round=1`, and `model` the coders' model the tier line names, or `none` when the run made the scripted edit, which dispatches no agent.

If the Q3 retry-once fires, the retry dispatch emits its own entry on clean return (see profiling-log.md retry rule). Write failures are silently swallowed.

---

## Next Stage

When stage ii is complete (validators passed), update `tmp/auto-state.md` state to `implementation-complete`, then load and execute `references/auto/stages/stage-iii-code-review.md`.

**Do NOT skip this step. The code review stage is mandatory.**
