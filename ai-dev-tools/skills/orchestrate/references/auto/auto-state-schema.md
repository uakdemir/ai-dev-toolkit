# Auto State Schema

**Location:** `tmp/auto-state.md` — markdown with YAML frontmatter.

---

## Schema

```yaml
---
spec: spec1.md
state: code-review-iter-2-complete
datetime: 2026-04-11T15:02:33Z

# One hash, one purpose:
spec_baseline: hash0           # review anchor — "start of scope"
                               # set when agent i begins, never updated
---
```

---

## State Enum

- `started` — written when the file is created, before stage i
- `spec-review-phase-1-iter-{N}-complete` (N = 1..2)
- `spec-review-phase-1-complete`
- `spec-review-phase-2-iter-{N}-complete` (N = 1..2)
- `spec-review-phase-2-complete`
- `implementation-complete`
- `code-review-iter-{N}-complete` (N = 1..4)
- `finalized`
- `stopped-unresolved-criticals` (Q2)
- `stopped-crash-{stage}` (Q3) — `{stage}` is the crash-site token defined in
  `failure-handling/crash.md` > Response: `agent i phase 1`, `agent i phase 2`,
  `agent ii implement`, `agent iii code-review iter {N}` (N = 1..4)

Both are terminal and both exit non-zero. `skipped-*` and `halted-*` used to be different things —
skip meant "this spec is abandoned, run the next one", halt meant "abandon the batch". With one spec
they describe the same event, so there is one shape.

`implement_head` and `last_iteration_head` are gone with them. Their only reader was the rollback
that rewound a crashed iteration so the next spec could start on a clean tree; nothing reads them
now, and state nothing reads is state that goes wrong silently.

---

## Happy-Path Transitions

```
started
  → spec-review-phase-1-iter-1-complete
  → ... (up to iter 2)
  → spec-review-phase-1-complete
  → spec-review-phase-2-iter-1-complete
  → ... (up to iter 2)
  → spec-review-phase-2-complete
  → implementation-complete
  → code-review-iter-1-complete
  → ... (up to iter 4)
  → finalized
```

Q2/Q3 failures transition to a `stopped-*` terminal state.

---

## Stale-State Policy

If `tmp/auto-state.md` exists when `/orchestrate --auto` is invoked:
- `state != finalized` → print warning: `previous auto run detected at <state>; starting fresh`, overwrite.
- `state == finalized` → overwrite silently.
- Unparseable → treat as stale, overwrite with warning.

No resume mechanism — stale state is always discarded.
