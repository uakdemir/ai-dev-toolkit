# Stage iii: Code Review Loop

> **GATE CHECK — MANDATORY**
> Read `tmp/auto-state.md`. Verify `state` is `implementation-complete`.
> If it is NOT, you have skipped stage ii (implement). **STOP. Go back and execute stage ii first.**
> Do not proceed under any circumstances if this gate fails.

Single phase. Up to 4 iterations with early exit.

---

## Per-Iteration Dispatch

Orchestrate owns the iteration loop. One dispatch is one iteration, up to 4:

```bash
/review-code <spec_baseline> --against <spec_path> --run-id <run_id>-iter<N> --max-iterations 1 [--must-inspect <paths>]
```

**Model and effort.** None of `--model`, `--effort` and `--fix-effort` is passed, so `review-code` resolves the code tier and takes each agent's model and effort from the tier's row, which is Opus for every phase. This stage's sub-agent can dispatch those agents only where Claude Code's spawn-depth cap is at least two. Under a cap of one `review-code` stops with its no-Agent-tool error and writes no artifact, which `references/auto/failure-handling/retry-semantics.md` treats as a crash, unless the code tier is MECHANICAL, which dispatches no agent. No nested run has measured the dispatch: `references/shared-rules/agent-dispatch-pin.md`

**`--max-iterations 1` is forced, not a preference.** Orchestrate's `N` is what the per-iteration commit, the `code-review-iter-{N}-complete` state and the profiling entry's `round=N` all key off. Any inner cap above 1 makes each of those name a different number of rounds than actually ran — at `--max-iterations 4` this stage's own header, "up to 4 iterations", would mean up to 16. Stage i takes the other shape for a reason this stage does not have: its outer loop runs over *phases* (`--fact-check` off, then on), a genuine second axis, so its inner cap of 2 still totals 4.

**`-iter<N>` in the run-id is equally forced.** `review-code`'s Setup deletes `<run_id>-review-code*` on every run, so a bare `--run-id <run_id>` would have each dispatch erase the previous iteration's log and snapshots — the per-iteration record this stage names as its audit trail. Putting the iteration in the run-id is the device stage i already uses for the phase (`<run_id>-phase1`), and it gives every iteration a file no later dispatch can touch.

**Two different `N`s end up in play, and only one of them is this stage's.** `review-code` counts rounds *within* a dispatch — in its commit subjects (`fix(review-code): resolve N issues from iteration M`, and the self-review pass's counterpart), in its iteration logs and in its snapshots. At `--max-iterations 1` every one of those reads `iteration 1`, on all four dispatches. The stage's iteration is the `N` in the surrounding `fix(auto): … code-review iter <N>` commit and in the run-id prefix; a reader of the git log or of `<run_id>-iter2-review-code-iteration-1.json` needs both halves to parse what they are looking at.

Every iteration reviews the **full scope** from `spec_baseline` through current HEAD:
- Iter 1: spec_baseline → HEAD (implement work)
- Iter 2: spec_baseline → HEAD (implement + iter 1 fixes)
- Iter N: spec_baseline → HEAD (all accumulated work)

This guarantees every iteration sees both original quality AND fix-introduced regressions.

---

## Early Exit

**The condition is `review-code`'s; the loop is orchestrate's.** At `--max-iterations 1` every dispatch is its own final iteration, so `review-code` never decides whether another round runs — it reports, and stage iii reads the report and decides. The definition lives in `skills/review-code/SKILL.md` > Iteration Flow and has three clauses, all of which must hold for the loop to end:

- pre-fix criticals == 0
- verification did not regress
- `coverage.not_inspected` is empty

All three hold after any dispatch → skip remaining iterations, advance to stage iv. Stage iii passes no `--verify`, so the middle clause is satisfied vacuously here; it is stated because a restatement missing a clause is how one contract becomes two, and a caller that does pass `--verify` has to get the same answer from both.

**Whenever a dispatch returns a non-empty `coverage.not_inspected` and another iteration will run — at any critical count — pass that list into the next dispatch as `--must-inspect`.** This is not part of the early-exit test and must not be folded into it. A fresh-read round cannot infer its own coverage hole: the files it missed are by definition the ones it never opened, and every iteration diffs from the same `spec_baseline`, so the diff only grows and the hole survives on its own unless something changes the order the reviewer works in. Gating the handoff on zero criticals would arm it only on the iteration the loop was about to leave anyway, which is the one iteration where it cannot help.

It is scope direction, not carry-forward — it hands the next reviewer a list of files to open, never a finding, so nothing crosses the round boundary that could move a count (`references/shared-rules/counts-exclude-self-review.md`).

**A dispatch that ends `Not reviewed (MECHANICAL)` ends the loop.** The tier ran no review round, so there are zero criticals and nothing uninspected: skip the remaining iterations and advance to stage iv. Stage iii passes no `--verify`, so a MECHANICAL dispatch has no command to run and does not end `Issues Found`.

If criticals are 0 but `not_inspected` is non-empty, do NOT early-exit. The review did not see every changed file — the standard-mode counterpart is step-6's Case C. Continue to the next iteration. If the final iteration still reports a non-empty `not_inspected`, log a Warning to `tmp/_reviews_errors/error-logs.md` naming the uninspected files (template: `../failure-handling/error-log-templates.md` > Stage iii coverage hole) and advance: auto mode has no user to ask, and a coverage hole that is written down is not the silent green this pipeline exists to avoid.

---

## Per-Iteration Commit (Non-Optional Invariant)

After every successful agent iii iteration, orchestrate:
1. Stages: `git add -u && git add -- . ':!tmp/'`
2. Checks: `git diff --cached --quiet` — if exit code 0 (nothing staged), skip the commit. This handles the 0-criticals early-exit case where the review found no issues and no fix phase ran.
3. Commits (if staged changes exist): `fix(auto): <spec-slug>: code-review iter <N> — address findings`
4. Updates `state = code-review-iter-<N>-complete` in `auto-state.md` (required — `stage-iv-verification-gate.md`'s GATE CHECK reads this)

This commit is what makes each iteration's fixes separately reviewable, and what `spec_baseline..HEAD` counts at the end. Step 4 runs regardless of whether a commit was created.

**A dispatch that ended `Not reviewed (MECHANICAL)` is a successful iteration with no artifact.** It writes no review JSON by design, so the artifact clauses below do not apply to it.

**Successful iteration definition:** agent returned without exception AND the review artifact exists (`tmp/_reviews_errors/<run_id>-iter<N>-review-code.json`) AND that artifact passes `scripts/validate-review-json.cjs`. Stage iii passes `--run-id <run_id>-iter<N>`, so each iteration writes its own artifact and no later dispatch overwrites it — the count this definition validates stays readable after the iteration that wrote it has passed. The per-iteration record is that artifact together with that dispatch's iteration log, `<run_id>-iter<N>-review-code-iteration-1.md`. `review-code`'s own per-round snapshots (`skills/review-code/SKILL.md` > Cross-Iteration Tracking) still run, but at `--max-iterations 1` they duplicate a separation the run-id already provides; they earn their keep on a standalone multi-round run, not here.

**If `node` is unavailable**, the validator cannot run and the third clause is waived — the artifact's existence and a clean agent return are sufficient. Log a Warning to `tmp/_reviews_errors/error-logs.md` recording `schema validation not run: node unavailable` (template: `../failure-handling/error-log-templates.md` > Stage iii schema check waived), matching the same carve-out in `review-code`'s VALIDATION step and reviewer prompt. Without this waiver a machine without Node could never produce a successful iteration, so no auto run on such a machine could ever reach stage iv.

An artifact that exists but does not validate is a crash (`references/auto/failure-handling/retry-semantics.md` crash item 4), not a successful iteration. Without the third clause the iteration commits, advances the state and moves on behind a review that never validated — the same advance-as-clean false green the Output Validation section below removes, arriving by a different route.

---

## Unresolved-Criticals Check (final iteration)

At the final iteration's REVIEW output, pre-fix:
- Pre-fix criticals == 0 → success
- Pre-fix criticals > 0 → Q2 unresolved-criticals failure (see `../failure-handling/unresolved-criticals.md`)
- A final dispatch that ended `Not reviewed (MECHANICAL)` wrote no review JSON; the critical count reads zero → success

---

## Output Validation

Agent iii's output is validated like any other artifact — by `scripts/validate-review-json.cjs`, per `review-code`'s VALIDATION step. There is no optimistic-trust exemption and no fail-open at the final iteration.

Malformed or missing output is a crash (`references/auto/failure-handling/retry-semantics.md`), which means retry-once and then `references/auto/failure-handling/crash.md`: wip-commit whatever is on disk, leave the tree untouched, and stop. One spec is reviewed loudly or not at all; nothing is destroyed and nothing is silently carried forward. A dispatch that ended `Not reviewed (MECHANICAL)` has no artifact by design and is not malformed or missing output.

Advancing unvalidated output as clean was a silent false green — a review that never ran, reported as a review that passed.

---

## Profiling

After each code-review iteration dispatch returns, append one JSONL entry to the profiling log per `references/auto/profiling-log.md`: `action=review-code`, `round=N` (iteration number 1–4), and `model` the model the dispatch's tier line names, or `none` for a dispatch on the MECHANICAL tier, which runs no agent. Early-exit iterations that never dispatch produce no entry. Write failures are silently swallowed.

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
