# Q3: Agent iii Crash (Code-Review)

**Trigger:** Agent iii (code-review) crashes twice (initial + retry).

---

## Response — Rollback + Skip

**Iter 1 crash:**
- Soft reset to `implement_head` (preserves implement work, rewinds failed iter 1)
- Stash crashed work
- State → `skipped-crash-code-review`
- Continue to next spec

**Iter N>1 crash:**
- Soft reset to `last_iteration_head` (preserves all successful iterations)
- Stash crashed work
- State → `skipped-crash-code-review`
- Continue to next spec

See `rollback-mechanism.md` for the soft-reset + stash procedure.
