# Session Bootstrap

Runs on every standard-mode invocation, before Fast-Path Detection.

---

1. Read `tmp/orchestrate-state.md` (hint file).
2. If hint file exists AND has valid cycle state (non-empty `feature` field) → no-op, proceed to Fast-Path Detection. Fast-Path Detection handles mid-cycle state.
3. If hint file missing or no valid cycle state → proceed to Fast-Path Detection (which will trigger User Prompt).

**Session-handoff processing** is NOT performed here. Session-handoff reading is gated behind the `--handoff` flag — see `references/standard/session-handoff.md`.
