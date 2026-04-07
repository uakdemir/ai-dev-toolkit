# Item 01: review-doc — always run final gate on last allowed iteration

**Date:** 2026-04-07
**Status:** Draft
**Source:** `tmp/ai-dev-tool-improvement-prompt.md` (verbatim incident report)

## Problem

`review-doc` runs an iterative loop with two model tiers:
- **min-model (sonnet)** for early rounds
- **max-model (opus) + fact-checker** for the "final gate"

The current rule (`SKILL.md` lines 115-117) is **event-triggered**: the final gate fires only when `critical_count` reaches zero in an early round. If criticals never reach zero before `max_iterations`, the loop exits with **no opus pass and no fact-check** at all.

### Recorded incident

```
/ai-dev-tools:review-doc tmp/2026-04-06-calibration-improvements-spec.md --max-iterations 2
```

| Round | Reviewer model | Critical count after review | Loop state |
|---|---|---|---|
| Iter 1 | sonnet | 4 | `is_final_gate=false` (criticals > 0) → sonnet fixer runs |
| Iter 2 | sonnet | 3 | `is_final_gate=false` (criticals > 0) → sonnet fixer runs |
| Iter 3 | — | — | Loop exits: `3 > max_iterations(2) AND is_final_gate=false` |

**Opus never ran. The fact-checker never ran.** The spec was reviewed and fixed twice by sonnet, then the loop exited because the cap was hit and `is_final_gate` had never flipped.

The user mental model is: **"`--max-iterations N` is a budget I'm willing to spend, and the last round of that budget should be the highest-quality pass."** Today the highest-quality pass is reserved for "after we're done finding criticals," which means complex specs that take more than N–1 rounds to converge get *no* opus pass at all.

## Scope

**In scope:** Core fix only — promote the last allowed iteration to the final gate via a pre-review check.

**Out of scope:**
- `--no-final-gate` flag (listed as optional follow-up in source prompt — deferred)
- Cross-iteration tracking changes (counters already work model-agnostically, no change needed)
- Reviewer/coder/fact-checker prompt changes (they accept model as a dispatch parameter — unchanged)

## Files Modified

| File | Change |
|---|---|
| `ai-dev-tools/skills/review-doc/SKILL.md` | Insert PRE-REVIEW PROMOTION (lines ~103-119), replace explanatory paragraph (line ~138), add new outcome enum value (line ~385) |

No agent prompt files (`prompts/reviewer.md`, `prompts/coder.md`, `agents/codebase-fact-checker.md`) need to change.

## Concrete Changes

### Change 1 — Insert PRE-REVIEW PROMOTION at top of loop body

**Current (lines ~115-119):**

```
STOP CHECK:
  If critical_count == 0 AND NOT is_final_gate:
    Set is_final_gate = true, continue to next iteration
  If is_final_gate (regardless of critical_count):
    Fall through to FIX PHASE and FACT-CHECK PHASE below, then exit loop to Final Report.
```

**Proposed (insert PRE-REVIEW PROMOTION block at the top of the loop body, before REVIEW PHASE):**

```
PRE-REVIEW PROMOTION (new):
  If iteration == max_iterations AND NOT is_final_gate:
    Set is_final_gate = true (this iteration runs as the final gate from the start)

REVIEW PHASE:
  (unchanged — uses min-model if NOT is_final_gate, max-model if is_final_gate)

VALIDATION:
  (unchanged)

STOP CHECK:
  If critical_count == 0 AND NOT is_final_gate:
    Set is_final_gate = true, continue to next iteration   ← keep as fast path
  If is_final_gate (regardless of critical_count):
    Fall through to FIX PHASE and FACT-CHECK PHASE below, then exit loop to Final Report.
```

**Critical positioning detail:** PRE-REVIEW PROMOTION is intentionally **before** the review phase so that the **reviewer itself** runs at max-model on the final iteration — not just the fixer and fact-checker. The opus reviewer catches different (and finer) issues than sonnet, and you want those issues *found and fixed* in the same pass that has the fact-checker.

### Change 2 — Replace explanatory paragraph at line ~138

**Current:**

> "The final gate is exempt from the `--max-iterations` cap: if criticals reach zero at iteration N == max_iterations, the final gate still runs as iteration N+1. Terminal output reports this as e.g. "5/4" (5 iterations with cap of 4)."

**Proposed (replace entire paragraph):**

> "The final gate runs at the last allowed iteration. Two trigger paths:
>
> 1. **Fast path (early termination):** If `critical_count == 0` in an early round, `is_final_gate` flips to `true`, the next iteration runs as the final gate, and the loop ends early. Terminal output: e.g. `3/4`.
> 2. **Cap path (always-runs guarantee):** If criticals never reach zero before iteration `max_iterations`, that iteration is promoted to the final gate at the start of the loop body — meaning the reviewer, fixer, and fact-checker all run at max-model. Terminal output: `N/N`.
>
> Either way, the user is guaranteed at least one max-model pass with fact-check before the loop exits, as long as `--max-iterations >= 1`. (Single-pass mode `--max-iterations 1` is already handled by the existing edge case path and is unchanged by this rule.)"

### Change 3 — Add new outcome enum value at line ~385

**Current:**

> `**Outcome:** "Fixed N issues (D deferred, P pushed back), continuing" | "0 criticals, final gate triggered" | "0 criticals, loop complete" | "Fix phase failed: <error>"`

**Proposed (add one new enum value):**

> `**Outcome:** "Fixed N issues (D deferred, P pushed back), continuing" | "0 criticals, final gate triggered" | "0 criticals, loop complete" | "Last allowed iteration, final gate triggered" | "Fix phase failed: <error>"`

The new value `"Last allowed iteration, final gate triggered"` distinguishes the cap-path final gate from the fast-path final gate in audit logs.

### Change 4 — Cross-Iteration Tracking note (around line 320)

**No changes needed.** Counters track per-severity fixed/deferred/pushed-back across iterations regardless of which model produced the review. The aggregate display (`X Critical fixed | Y High fixed | Z Medium fixed`) remains meaningful.

## Edge Cases

1. **`--max-iterations 1`** — Already runs opus via the single-pass path (`SKILL.md` "Edge Case: --max-iterations 1"). This change does not affect that path. The guard at line 99 still skips the loop entirely for N=1. ✅
2. **`--max-iterations 0`** — Already exits without running anything. Unchanged. ✅
3. **Fast path triggers at iteration 2 of `--max-iterations 4`** — Iteration 3 runs as the (early) final gate, loop exits, total iterations = 3, terminal output = `3/4`. Same as current behavior. **No regression.**
4. **Fast path never triggers, `--max-iterations 4`** — Iterations 1, 2, 3 run as sonnet rounds; iteration 4 is promoted to final gate by PRE-REVIEW PROMOTION; opus reviewer + opus fixer + opus fact-checker all run; loop exits; terminal output = `4/4`. **This is the new behavior — currently this case would exit at iteration 5 with no opus pass.**
5. **`--max-iterations 2` (the recorded incident)** — Iteration 1 = sonnet; iteration 2 = pre-promoted to final gate, opus reviewer + opus fixer + opus fact-checker; loop exits; terminal output = `2/2`. **This is the case that motivated the change.**
6. **Fast path triggers exactly at `iteration == max_iterations`** — STOP CHECK still flips `is_final_gate=true` and continues; the next iteration is the final gate. The cap-path PRE-REVIEW PROMOTION guard `iteration == max_iterations AND NOT is_final_gate` is false at that next iteration (because `is_final_gate` is already true), so it doesn't double-trigger. Loop exits as `(N+1)/N`. ✅
7. **Reviewer fails to produce a critical count on the final-gate iteration** — Existing error handling path still applies (no change to validation). The fact that the iteration was pre-promoted does not change failure handling.

## Verification

Per project conventions: no test suite. Manual verification:
1. Run `/ai-dev-tools:review-doc <complex-spec>.md --max-iterations 2` — confirm iteration 2 dispatches the opus reviewer, opus fixer, AND fact-checker
2. Run `/ai-dev-tools:review-doc <simple-spec>.md --max-iterations 4` — confirm fast path still triggers early termination at e.g. iter 3, output `3/4`, no regression
3. Run `/ai-dev-tools:review-doc <doc>.md --max-iterations 1` — confirm single-pass path is unchanged
4. Read the modified `SKILL.md` to confirm PRE-REVIEW PROMOTION is positioned **before** REVIEW PHASE

---

**Summary of this spec:**
- Promote the last allowed iteration to `is_final_gate=true` **before** the reviewer dispatches, so opus reviewer + fixer + fact-checker all run on the cap iteration
- Keeps the existing fast-path (criticals==0 → next iter is final gate) as a parallel trigger
- Three pinpoint edits to one file: insert PRE-REVIEW PROMOTION block, replace explanatory paragraph, add one outcome enum value

**Decisions taken implicitly:**
- The new outcome enum value is `"Last allowed iteration, final gate triggered"` — distinguishable from the existing `"0 criticals, final gate triggered"` for audit purposes. Let me know if you'd prefer a shorter label like `"Cap reached, final gate"`
- No `--no-final-gate` escape hatch (deferred per source prompt's optional follow-up section)
