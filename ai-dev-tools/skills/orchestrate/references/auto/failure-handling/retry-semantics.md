# Retry Semantics

---

## Crash Signal Definition

An agent crash is any of:
1. The agent dispatch throws an exception
2. The agent times out after 10 minutes without returning
3. The agent returns without writing its expected output artifact, except a review that ran on the MECHANICAL tier, whether it ended `Not reviewed (MECHANICAL)` or `Issues Found`: it writes no review JSON by design
4. The agent writes its expected output artifact but the artifact fails schema validation

Item 4 matters because without it, malformed-but-present output falls through the crash definition entirely — it is neither a crash nor a usable result, and nothing routes it anywhere.

**Expected output artifacts:**
- Agent i → `tmp/_reviews_errors/<run_id>-phase{N}-review-doc.json` (the phase is in the run-id), except a review that ran on the MECHANICAL tier
- Agent ii → at least one new commit since `pre_implement_head`
- Agent iii → `tmp/_reviews_errors/<run_id>-iter<N>-review-code.json` (one file per iteration; the run-id carries `N`, so no dispatch overwrites another's), except a review that ran on the MECHANICAL tier

---

## Retry-Once Rule

On any agent crash:
1. Dispatch the same agent once more with identical inputs
2. Generate a fresh `dispatch_hash` for the retry
3. If retry succeeds → continue normally
4. If retry also fails → Q3 crash response (`crash.md`): wip-commit, do not rewind, stop. The response does not depend on which stage crashed.
