# Q2: Endless-Loop Failure

**Trigger:** `--max-iterations` exhausted without convergence.

---

## Measurement Rule (Option Y)

Criticals counted at the final iteration's REVIEW output, BEFORE that iteration's fix phase runs. The fix phase always runs regardless.

- **≤1 critical remaining** → acceptable, treat as success
- **>1 criticals remaining** → endless-loop failure:

## Response

1. Commit wip: `wip(auto): <spec>: <spec-review|code-review> endless-loop at iter <N> — see tmp/_reviews_errors/error-logs.md`
2. Append unresolved criticals (asymmetric by stage):
   - **Agent i (spec-review):** append criticals to the spec file itself
   - **Agent iii (code-review):** append to `tmp/_reviews_errors/<run_id>-unresolved-criticals.md`
3. Log a Warning to `tmp/_reviews_errors/error-logs.md`
4. Mark spec `skipped-endless-loop` in `auto-state.md`
5. Continue to next spec
