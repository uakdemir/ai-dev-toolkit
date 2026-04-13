# Q3: Agent i Crash (Spec-Review)

**Trigger:** Agent i (spec-review) crashes twice (initial + retry).

---

## Response

- Skip spec + continue to next spec
- No commit (text artifacts are inert; spec file left as-is)
- Log Error to `tmp/_reviews_errors/error-logs.md`
- State → `skipped-crash-spec-review`

If phase 1 already committed before phase 2 crashes, that commit is preserved — no rollback of phase 1 work.

The partially-reviewed spec persists on disk. User can re-invoke `/orchestrate --auto` on the same spec to re-run from scratch.
