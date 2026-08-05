# Tasks File

> Shared contract used by orchestrate and session-handoff for reading and updating a
> repo-tracked `TASKS.md`. Optional — skills that load this file operate normally when no
> tasks file exists.

## Why a tracked file

In-flight state belongs in a file the repository tracks, not in `tmp/` and not on an external
board. **A tracked file's staleness is visible in the diff.** A pull request that changes code
without touching `TASKS.md` shows the omission to a reviewer. A `tmp/` file or an external board
rots with no signal at all.

This does not replace `tmp/orchestrate-state.md` or `tmp/session-handoff.md`. Those are
single-session scratch state; `TASKS.md` is the durable, reviewable record.

## Discovery

Probe all three locations — do not stop at the first hit:

1. `TASKS.md` (repo root)
2. `docs/TASKS.md`
3. `docs/project-management/TASKS.md`

Exactly one hit → that is the tasks file. Do not assume one location. **If the file exists in
more than one of these locations, read all of them and surface the conflict to the user** — name
each path and what differs. Never silently prefer one copy, including the earliest in this list.

If no tasks file exists anywhere, skip tasks-file handling entirely. Do not create one
unprompted.

## Task Shape

Each task is one checklist item with a fixed set of sub-fields:

```markdown
- [ ] One reviewable outcome — an outcome, not an activity
  - Owner:                  # a lane, a person, or UNOWNED — which is itself a finding
  - Scope:
  - Acceptance criteria:
  - Automated validation:   # defined BEFORE implementation
  - Manual validation:
  - Rollback:
  - Blocked by:             # the specific dependency, named
  - Evidence:               # file:line / PR / commit proving current state
```

Field rules:

- The checklist line states an **outcome** ("search returns results ranked by relevance"), not an
  activity ("work on search ranking"). An activity has no done state.
- `Owner: UNOWNED` is a valid value and a reportable finding — surface it rather than guessing an
  owner.
- `Automated validation:` is defined before implementation begins, not written afterwards to match
  what was built.
- `Blocked by:` names the specific dependency. "Blocked" with no named blocker is not actionable.
- `Evidence:` cites something checkable — `file:line`, a PR, or a commit. A description of the
  state is not evidence of the state.

## Completion Rule

Move an item to Completed only after its acceptance criteria and required validation pass.

**Record skipped validation and residual risk instead of marking incomplete work done.** An item
whose automated validation was skipped is not complete; it is an item with a stated gap. Write
the gap down and leave the box unchecked.
