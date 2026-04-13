# Failure Handling Overview

Load this file when any failure occurs. Then load the specific failure-type reference.

---

## Failure Matrix

| Failure Type | Stage | Response | Reference |
|---|---|---|---|
| Q2: Endless loop | Agent i (phase 2 final iter) | Commit wip, skip spec, continue | `endless-loop.md` |
| Q2: Endless loop | Agent iii (iter 4) | Commit wip, skip spec, continue | `endless-loop.md` |
| Q3: Crash (retry failed) | Agent i | Skip spec, no commit, continue | `crash-text-stage.md` |
| Q3: Crash (retry failed) | Agent ii | Commit wip, **HALT pipeline** | `crash-implement.md` |
| Q3: Crash (retry failed) | Agent iii iter 1 | Soft reset to implement_head, stash, skip, continue | `crash-code-review.md` |
| Q3: Crash (retry failed) | Agent iii iter N>1 | Soft reset to last_iteration_head, stash, skip, continue | `crash-code-review.md` |

---

## Key Invariants

- `git reset --hard` is **NEVER** used anywhere in auto mode
- All rewinds use `git reset --soft` + `git stash push --include-untracked`
- Crashed work is always preserved (stash list or reflog)
- Implement crash halts the whole pipeline; other stage crashes skip the current spec

---

## Unusable-Output Policy (Asymmetric)

| Stage | Policy | Rationale |
|---|---|---|
| Agent i | Optimistic trust | Text artifacts — bad JSON doesn't corrupt downstream |
| Agent ii | **Strict validation → crash on failure** | Bad commits leave disk inconsistent |
| Agent iii | Optimistic trust | Next iteration re-reads git state from scratch |
