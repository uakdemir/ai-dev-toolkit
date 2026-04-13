# Auto State Schema

**Location:** `tmp/auto-state.md` — markdown with YAML frontmatter.

---

## Schema

```yaml
---
specs: [spec1.md, spec2.md, spec3.md]
current_spec: spec1.md
state: code-review-iter-2-complete
datetime: 2026-04-11T15:02:33Z

# Three hashes, three purposes:
spec_baseline: hash0           # review anchor — "start of scope"
                               # set when agent i begins, never updated
implement_head: hash2          # set when agent ii completes
                               # rollback target if code-review iter 1 crashes
last_iteration_head: hash2b    # updates after each successful code-review iter
                               # rollback target if code-review iter N>1 crashes

current_phase: 1               # 1 = spec-review phase 1, 2 = phase 2; null outside agent i
current_phase_iteration: 3     # iteration counter within current_phase; resets at phase boundary
---
```

---

## State Enum

- `spec-review-phase-1-iter-{N}-complete` (N = 1..3)
- `spec-review-phase-1-complete`
- `spec-review-phase-2-iter-{N}-complete` (N = 1..2)
- `spec-review-phase-2-complete`
- `implementation-complete`
- `code-review-iter-{N}-complete`
- `finalized`
- `skipped-endless-loop` (Q2)
- `skipped-crash-{stage}` (Q3)
- `halted-crash-implement` (Q3)

---

## Happy-Path Transitions

```
(start)
  → spec-review-phase-1-iter-1-complete
  → ... (up to iter 3)
  → spec-review-phase-1-complete
  → spec-review-phase-2-iter-1-complete
  → ... (up to iter 2)
  → spec-review-phase-2-complete
  → implementation-complete
  → code-review-iter-1-complete
  → ... (up to iter 4)
  → finalized
```

Q2/Q3 failures transition to `skipped-*` or `halted-*` terminal states.

---

## Stale-State Policy

If `tmp/auto-state.md` exists when `/orchestrate --auto` is invoked:
- `state != finalized` → print warning: `previous auto run detected at <state>; starting fresh`, overwrite.
- `state == finalized` → overwrite silently.
- Unparseable → treat as stale, overwrite with warning.

No resume mechanism — stale state is always discarded.
