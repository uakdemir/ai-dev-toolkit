# Stage iii: Code Review Loop

> **GATE CHECK — MANDATORY**
> Read `tmp/auto-state.md`. Verify `state` is `implementation-complete`.
> If it is NOT, you have skipped stage ii (implement). **STOP. Go back and execute stage ii first.**
> Do not proceed under any circumstances if this gate fails.

Single phase. Up to 4 iterations with early exit.

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

If pre-fix criticals == 0 **AND `coverage.not_inspected` is empty** at any iteration → skip remaining iterations, advance to stage iv.

If criticals are 0 but `not_inspected` is non-empty, do NOT early-exit. The review did not see every changed file, and a later iteration may open what this one skipped — the standard-mode counterpart is step-6's Case C. Continue to the next iteration. If the final iteration still reports a non-empty `not_inspected`, record the uninspected files in the stage's error log and advance: auto mode has no user to ask, and a coverage hole that is written down is not the silent green this pipeline exists to avoid.

---

## Per-Iteration Commit (Non-Optional Invariant)

After every successful agent iii iteration, orchestrate:
1. Stages: `git add -u && git add -- . ':!tmp/'`
2. Checks: `git diff --cached --quiet` — if exit code 0 (nothing staged), skip the commit but still update `last_iteration_head = HEAD`. This handles the 0-criticals early-exit case where the review found no issues and no fix phase ran.
3. Commits (if staged changes exist): `fix(auto): <spec-slug>: code-review iter <N> — address findings`
4. Updates `last_iteration_head = HEAD` in `auto-state.md`
5. Updates `state = code-review-iter-<N>-complete` in `auto-state.md` (required — `stage-iv-verification-gate.md`'s GATE CHECK reads this)

This commit is load-bearing for rollback anchors. The hash update in step 4 always runs regardless of whether a commit was created.

**Successful iteration definition:** agent returned without exception AND the review artifact exists (`tmp/_reviews_errors/<run_id>-review-code.json`) AND that artifact passes `scripts/validate-review-json.cjs`. There is one such file per run, overwritten each iteration — stage iii passes a bare `--run-id <run_id>`, so no per-iteration JSON is produced. The per-iteration record is `-review-code-iteration-{N}.md`.

**If `node` is unavailable**, the validator cannot run and the third clause is waived — the artifact's existence and a clean agent return are sufficient. Record `schema validation not run: node unavailable` in the stage's error log, matching the same carve-out in `review-code`'s VALIDATION step and reviewer prompt. Without this waiver a machine without Node could never produce a successful iteration, so every spec in every auto run would be skipped.

An artifact that exists but does not validate is a crash (`references/auto/failure-handling/retry-semantics.md` crash item 4), not a successful iteration. Without the third clause `last_iteration_head` advances past a review that never validated, and the crash path's soft-reset to that anchor becomes a no-op — the same advance-as-clean behaviour the Output Validation section below removes, arriving by a different route.

---

## Endless-Loop Check (Iter 4)

At iter 4's REVIEW output, pre-fix:
- Pre-fix criticals ≤ 1 → acceptable, treat as success
- Pre-fix criticals > 1 → Q2 endless-loop failure

---

## Output Validation

Agent iii's output is validated like any other artifact — by `scripts/validate-review-json.cjs`, per `review-code`'s VALIDATION step. There is no optimistic-trust exemption and no fail-open at the final iteration.

Malformed or missing output is a crash (`references/auto/failure-handling/retry-semantics.md`), which means retry-once and then `references/auto/failure-handling/crash-code-review.md`: soft-reset to `last_iteration_head`, stash, state `skipped-crash-code-review`, continue to the next spec. One spec is skipped loudly and the reason is recorded; the batch is not halted and no work is destroyed.

Advancing unvalidated output as clean was a silent false green — a review that never ran, reported as a review that passed.

---

## Profiling

After each code-review iteration dispatch returns, append one JSONL entry to the profiling log per `references/auto/profiling-log.md`: `action=review-code`, `round=N` (iteration number 1–4), `model=inherited`. Early-exit iterations that never dispatch produce no entry. Write failures are silently swallowed.

---

## Next Stage

When stage iii is complete (all iterations done or early-exited on 0 criticals), load and execute `references/auto/stages/stage-iv-verification-gate.md`.
