# Retry Semantics

---

## Crash Signal Definition

An agent crash is any of:
1. The agent dispatch throws an exception
2. The agent times out after 10 minutes without returning
3. The agent returns without writing its expected output artifact

**Expected output artifacts:**
- Agent i → `tmp/_reviews_errors/<run_id>-review-doc-phase{N}.json`
- Agent ii → at least one new commit since `pre_implement_head`
- Agent iii → `tmp/_reviews_errors/<run_id>-review-code-iter{N}.json`

---

## Retry-Once Rule

On any agent crash:
1. Dispatch the same agent once more with identical inputs
2. Generate a fresh `dispatch_hash` for the retry
3. If retry succeeds → continue normally
4. If retry also fails → stage-differentiated response (see failure matrix)
