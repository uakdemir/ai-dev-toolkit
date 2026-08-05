# Session Bootstrap

Runs on every standard-mode invocation, before Fast-Path Detection.

---

1. Read `tmp/orchestrate-state.md` (hint file).
2. If hint file exists AND has valid cycle state (non-empty `feature` field) → no-op, proceed to Fast-Path Detection. Fast-Path Detection handles mid-cycle state.
3. If hint file missing or no valid cycle state → proceed to Fast-Path Detection (which will trigger User Prompt).

**Session-handoff processing** is NOT performed here. Session-handoff reading is gated behind the `--handoff` flag — see `references/standard/session-handoff.md`.

---

## Tasks File

Read `${CLAUDE_PLUGIN_ROOT}/references/tasks-file.md` for the discovery order, task shape, and completion rule.

If a tasks file exists, read it before Fast-Path Detection. It is durable, repo-tracked state and it complements the hint file rather than replacing it: the hint file says where this cycle is, the tasks file says what the repository still owes. Where they disagree — the hint file says `finalized` but the matching task is still unchecked — surface the disagreement to the user rather than trusting either.

Surface these without being asked:

- Tasks whose `Owner:` is `UNOWNED`.
- Tasks whose `Blocked by:` names a dependency that no open task covers.
- The file existing in more than one location: name each path and what differs. Never silently prefer one copy.

If no tasks file exists, skip this. Do not create one — a tasks file is adopted deliberately, not bootstrapped by a state check.
