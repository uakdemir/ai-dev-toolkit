# Stage iii: Code Review Loop

Single phase, opus-only. Up to 4 iterations with early exit.

---

## Per-Iteration Dispatch

```bash
/review-code <spec_baseline> --against <spec_path> --run-id <run_id>
```

Every iteration reviews the **full scope** from `spec_baseline` through current HEAD:
- Iter 1: spec_baseline → HEAD (implement work)
- Iter 2: spec_baseline → HEAD (implement + iter 1 fixes)
- Iter N: spec_baseline → HEAD (all accumulated work)

This guarantees every iteration sees both original quality AND fix-introduced regressions.

---

## Early Exit

If pre-fix criticals == 0 at any iteration → skip remaining iterations, advance to stage iv.

---

## Per-Iteration Commit (Non-Optional Invariant)

After every successful agent iii iteration, orchestrate:
1. Stages: `git add -u && git add -- . ':!tmp/'`
2. Checks: `git diff --cached --quiet` — if exit code 0 (nothing staged), skip the commit but still update `last_iteration_head = HEAD`. This handles the 0-criticals early-exit case where the review found no issues and no fix phase ran.
3. Commits (if staged changes exist): `fix(auto): <spec-slug>: code-review iter <N> — address findings`
4. Updates `last_iteration_head = HEAD` in `auto-state.md`

This commit is load-bearing for rollback anchors. The hash update in step 4 always runs regardless of whether a commit was created.

**Successful iteration definition:** agent returned without exception AND iteration log file exists (`tmp/_reviews_errors/<run_id>-review-code-iter{N}.json`).

---

## Endless-Loop Check (Iter 4)

At iter 4's REVIEW output, pre-fix:
- Pre-fix criticals ≤ 1 → acceptable, treat as success
- Pre-fix criticals > 1 → Q2 endless-loop failure

---

## Unusable-Output Policy

Optimistic trust. Orchestrate does NOT validate review JSON for agent iii. Missing or malformed → treat as "no criticals" and advance. Residual criticals caught by the next iteration.

**Exception:** If iter 4 JSON is unreadable, assume critical count = 0 (fail open).
