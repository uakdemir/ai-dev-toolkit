# Stage iii: Code Review Loop

> **GATE CHECK — MANDATORY**
> Read `tmp/auto-state.md`. Verify `state` is `implementation-complete`.
> If it is NOT, you have skipped stage ii (implement). **STOP. Go back and execute stage ii first.**
> Do not proceed under any circumstances if this gate fails.

Single phase. Up to 4 iterations with early exit.

---

## Per-Iteration Dispatch

```bash
/review-code <spec_baseline> --against <spec_path> --run-id <run_id> --max-iterations 4
```

Every iteration reviews the **full scope** from `spec_baseline` through current HEAD:
- Iter 1: spec_baseline → HEAD (implement work)
- Iter 2: spec_baseline → HEAD (implement + iter 1 fixes)
- Iter N: spec_baseline → HEAD (all accumulated work)

This guarantees every iteration sees both original quality AND fix-introduced regressions.

---

## Early Exit

**`review-code`'s stop check owns this condition. Stage iii restates it and acts on the result.** The definition lives in `skills/review-code/SKILL.md` > Iteration Flow and has three clauses, all of which must hold at an iteration for the loop to end there:

- pre-fix criticals == 0
- verification did not regress
- `coverage.not_inspected` is empty

All three hold at any iteration → skip remaining iterations, advance to stage iv. Stage iii passes no `--verify`, so the middle clause is satisfied vacuously here; it is stated because a restatement missing a clause is how one contract becomes two, and a caller that does pass `--verify` has to get the same answer from both.

If criticals are 0 but `not_inspected` is non-empty, do NOT early-exit. The review did not see every changed file, and a later iteration may open what this one skipped — the standard-mode counterpart is step-6's Case C. Continue to the next iteration. If the final iteration still reports a non-empty `not_inspected`, log a Warning to `tmp/_reviews_errors/error-logs.md` naming the uninspected files (template: `../failure-handling/error-log-templates.md` > Stage iii coverage hole) and advance: auto mode has no user to ask, and a coverage hole that is written down is not the silent green this pipeline exists to avoid.

---

## Per-Iteration Commit (Non-Optional Invariant)

After every successful agent iii iteration, orchestrate:
1. Stages: `git add -u && git add -- . ':!tmp/'`
2. Checks: `git diff --cached --quiet` — if exit code 0 (nothing staged), skip the commit. This handles the 0-criticals early-exit case where the review found no issues and no fix phase ran.
3. Commits (if staged changes exist): `fix(auto): <spec-slug>: code-review iter <N> — address findings`
4. Updates `state = code-review-iter-<N>-complete` in `auto-state.md` (required — `stage-iv-verification-gate.md`'s GATE CHECK reads this)

This commit is what makes each iteration's fixes separately reviewable, and what `spec_baseline..HEAD` counts at the end. Step 4 runs regardless of whether a commit was created.

**Successful iteration definition:** agent returned without exception AND the review artifact exists (`tmp/_reviews_errors/<run_id>-review-code.json`) AND that artifact passes `scripts/validate-review-json.cjs`. There is one such file per run, overwritten each iteration — stage iii passes a bare `--run-id <run_id>`, so the count this definition validates is always read from that one path. The per-iteration record is the iteration log `-review-code-iteration-{N}.md` **and that round's JSON snapshots**: `review-code` copies its review JSON to `<run_id>-review-code-iteration-{N}.json` at the end of every round, and its fix report to `<run_id>-review-code-fix-report-iteration-{N}.json` whenever a fix phase ran (`skills/review-code/SKILL.md` > Cross-Iteration Tracking). Those snapshots are the durable audit record; they are not what this clause validates.

**If `node` is unavailable**, the validator cannot run and the third clause is waived — the artifact's existence and a clean agent return are sufficient. Log a Warning to `tmp/_reviews_errors/error-logs.md` recording `schema validation not run: node unavailable` (template: `../failure-handling/error-log-templates.md` > Stage iii schema check waived), matching the same carve-out in `review-code`'s VALIDATION step and reviewer prompt. Without this waiver a machine without Node could never produce a successful iteration, so no auto run on such a machine could ever reach stage iv.

An artifact that exists but does not validate is a crash (`references/auto/failure-handling/retry-semantics.md` crash item 4), not a successful iteration. Without the third clause the iteration commits, advances the state and moves on behind a review that never validated — the same advance-as-clean false green the Output Validation section below removes, arriving by a different route.

---

## Unresolved-Criticals Check (final iteration)

At the final iteration's REVIEW output, pre-fix:
- Pre-fix criticals == 0 → success
- Pre-fix criticals > 0 → Q2 unresolved-criticals failure (see `../failure-handling/unresolved-criticals.md`)

---

## Output Validation

Agent iii's output is validated like any other artifact — by `scripts/validate-review-json.cjs`, per `review-code`'s VALIDATION step. There is no optimistic-trust exemption and no fail-open at the final iteration.

Malformed or missing output is a crash (`references/auto/failure-handling/retry-semantics.md`), which means retry-once and then `references/auto/failure-handling/crash.md`: wip-commit whatever is on disk, leave the tree untouched, and stop. One spec is reviewed loudly or not at all; nothing is destroyed and nothing is silently carried forward.

Advancing unvalidated output as clean was a silent false green — a review that never ran, reported as a review that passed.

---

## Profiling

After each code-review iteration dispatch returns, append one JSONL entry to the profiling log per `references/auto/profiling-log.md`: `action=review-code`, `round=N` (iteration number 1–4), `model=inherited`. Early-exit iterations that never dispatch produce no entry. Write failures are silently swallowed.

---

## Failed Review Runs

After each iteration's dispatch returns, determine whether the run reported **Error** under
`references/shared-rules/run-failure-disclosure.md` — a review that could not complete, as distinct
from one that completed and found problems. If it did:

1. Record it in `tmp/_reviews_errors/error-logs.md` (`SKILL.md` > Auto Mode > Completion).
2. Increment `R`, the review-failure counter initialised at `SKILL.md` > Auto Mode > Initialization
   and printed by `stage-iv-verification-gate.md` step 4.
3. Treat the iteration as a crash and apply `references/auto/failure-handling/retry-semantics.md`.

---

## Next Stage

When stage iii is complete (all iterations done, or early-exited on 0 criticals with an empty `coverage.not_inspected` — see Early Exit above), load and execute `references/auto/stages/stage-iv-verification-gate.md`.
