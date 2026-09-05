# Failure Handling Overview

Load this file when any failure occurs. Then load the specific failure-type reference.

---

## Failure Matrix

| Failure Type | Response | Reference |
|---|---|---|
| Q2: Unresolved criticals | Commit wip, report the criticals, stop | `unresolved-criticals.md` |
| Q3: Crash (retry failed) | Commit wip, do not rewind, stop | `crash.md` |

**Two failure types, two responses, no stage column.** Both end the run. Auto mode processes one
spec, so there is no "continue to the next one" — and it was that continuation, not the failures
themselves, that used to make the response depend on which stage crashed.

---

## Key Invariants

- **No `git reset` of any kind, hard or soft.** A failed run leaves the tree exactly as it is.
- Crashed work is always preserved — in a wip commit on the branch, where it is visible.
- Every failure ends the run and exits non-zero. There is no partial success to carry forward.

---

## Unusable-Output Policy

| Stage | Policy | Rationale |
|---|---|---|
| Agent i | Optimistic trust | Text artifacts — bad JSON doesn't corrupt downstream |
| Agent ii | **Strict validation → crash on failure** | Bad commits leave disk inconsistent |
| Agent iii | **Strict validation → crash on failure** | A review that could not be read is a review that did not happen |

Agent iii previously used optimistic trust, on the reasoning that the next iteration re-reads git state from scratch. That reasoning does not survive the final iteration, where there is no next iteration to recover — and it made an unreadable review indistinguishable from a clean one. Its output is now validated by `scripts/validate-review-json.cjs` and a failure routes into the normal crash path (retry-once, then soft-reset and skip the spec), which is non-destructive.
