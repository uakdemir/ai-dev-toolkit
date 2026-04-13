# Q3: Agent ii Crash (Implement)

**Trigger:** Agent ii (implement) crashes twice (initial + retry).

---

## Response — HALT PIPELINE

1. **Wip commit:** Stage every modified and untracked file:
   `wip(auto): <spec-slug>: implement crashed after retry — see tmp/_reviews_errors/error-logs.md`
   If working tree is clean (crashed before writing), skip wip commit.

2. **Auto-state transition:** → `halted-crash-implement`.
   If wip commit created: `implement_head = HEAD` of wip commit.
   If no wip commit: `implement_head` remains unset (record explicitly).

3. **Batch halt:** Any remaining specs in the batch are NOT processed.
   Emit: `[auto] batch halted, N specs unprocessed`
   Exit non-zero.

4. **Log Error** to `tmp/_reviews_errors/error-logs.md`.

---

## Rationale

Uncommitted broken code could contaminate downstream specs. Halt is the safe default.
