# Item 04: orchestrate — multi-line recommendation breadcrumbs, auto-commit, quality-gate suggestions

**Date:** 2026-04-07
**Status:** Draft
**Depends on:** Item 03 (multi-line breadcrumbs build on the strict-propagation and breadcrumb-as-last-line guarantees from Item 03)

## Problem

Six pain points compound at orchestrate's step boundaries.

1. **No user choice at branch points.** Every step boundary recommends exactly one next command. The user can't pick between alternative paths (e.g., "skip the review and go straight to implement" or "run an extra review iteration first") without manually rewriting the breadcrumb command.

2. **No skip-ahead at Step 2.** After review-doc completes, there's no recommended path that lets the user say "the review is done, take me to /implement now." The single recommendation always points to the next state-machine step.

3. **Step 2 has only one path regardless of findings.** Even when the spec is small/clean, today there's a single recommendation. Users want both "more review" and "implement now" surfaced regardless of how the review came out.

4. **No quality-gate suggestions at success points.** After a successful step (e.g., code review with 0 criticals), there's no recommendation for orthogonal quality checks (`/api-contract-guard`, `/test-audit`, `/convention-enforcer`). Users either don't know these exist or forget to run them.

5. **No auto-commit verification across transitions.** Today, after `/implement` returns, orchestrate transitions to Step 6 without verifying that the implementation was committed. If the user (or skill) failed to commit, the next step runs against an uncommitted working tree. Same gap exists after `/review-code` with successful fixes — the fixed files may sit uncommitted while the next phase begins.

6. **Step 8 emits a bare `/orchestrate` hand-wave.** Today Step 8 emits a bare `/orchestrate` breadcrumb at completion, leaving the user to guess what to do next. Should explicitly suggest `/orchestrate (/brainstorming)` to start the next cycle.

## Scope

**In scope:**
- Multi-line breadcrumb format with labeled options (template + position rule)
- Auto-commit verification after `/implement`, `/review-code`, and Step 8 finalize (commit only if `git status --porcelain` is non-empty)
- Quality-gate suggestion pool (hardcoded set of 3, randomly pick 2 at success points)
- Per-step rewrites for Steps 2, 4, 5 post-implement, 6 (both fail and success paths), and 8
- Step 8 brainstorming form (explicit `(/brainstorming)` wrap)

**Out of scope:**
- Automatic quality-gate dispatch — quality gates appear as breadcrumb options only, never auto-run
- User-configurable quality-gate pool — hardcoded to 3 gates for v1
- Per-user breadcrumb format preference — single canonical format
- Single-line breadcrumb forms (bare `/orchestrate`, bare wrapped) — these stay single-line; multi-line is only for steps with ≥2 alternatives
- Changes to `/respond-to-review` — the review-doc loop already applies fixes, so the additional `/respond-to-review` line is dropped from the breadcrumb proposal entirely (decision: never show that line)

## Files Modified

| File | Change |
|---|---|
| `ai-dev-tools/skills/orchestrate/SKILL.md` | Add multi-line breadcrumb format spec, per-step rewrites for 6 steps, auto-commit verification block, quality-gate selection logic |

No new files created. No moves. Single-file edit.

## Multi-Line Breadcrumb Format

When a step has ≥2 alternative next-commands, the breadcrumb is rendered as a labeled-options block:

```
Next steps (pick one):

  [1] short description of option 1
      /command-1 args

  [2] short description of option 2
      /command-2 args

  [3] short description of option 3
      /command-3 args
```

**Rules:**
- Options are numbered top-to-bottom starting at `[1]`.
- The **recommended option goes first** (`[1]`). When there is no clear recommendation, order by likelihood of use.
- Each option is two lines: a short description, then the literal `/command args` indented four spaces.
- A blank line separates each option from the next.
- The block carries Item 03's position guarantee forward: the **entire labeled-options block** must be the absolute final block of the response, with nothing after it. The very last line of the response is the last `/command args` line of the last option. (Item 03's audit list flagged this — multi-line blocks count as the breadcrumb for position purposes.)
- The `--strict` propagation rule from Item 03 applies to **every** `/command args` line in the block, not just the recommended one.

**When NOT to use multi-line format:**
- Single-recommendation step boundaries (e.g., Step 1 → Step 2 transition: brainstorm complete → review-doc) — keep these single-line.
- Mid-conversation prompts (per Item 03's "When NOT to emit a breadcrumb" rule).
- Error exits with only one valid retry path.

## Auto-Commit Verification

After `/implement` returns, after `/review-code` returns, or after Step 8 finalize logic completes inside orchestrate, run the following sequence **before** emitting the next-step breadcrumb:

1. Run `git status --porcelain`.
2. If output is **empty** (clean tree) → no-op, proceed directly to breadcrumb.
3. If output contains **only untracked files** (lines starting with `??`) → skip auto-commit, print `"warning: untracked files present, not auto-committing"`, proceed to breadcrumb. Untracked files might be intentional cruft and shouldn't be silently swept into a checkpoint commit.
4. If output contains **modified or staged files** → run `git add -A && git commit -m "<message>"` using the message templates below, then proceed to breadcrumb.

**Commit message templates (decided — bake these literally into SKILL.md):**

| Trigger | Commit message template |
|---|---|
| After `/implement` returns with uncommitted modifications | `chore: post-implement checkpoint for <plan-filename>` |
| After `/review-code` returns with uncommitted modifications | `chore: post-review-code checkpoint for <spec-filename>` |
| After Step 8 finalize completes with uncommitted modifications | `chore: post-finalize checkpoint for <spec-filename>` |

`<plan-filename>` and `<spec-filename>` are the **basenames only** (no directory path, no `.md` extension). Example: a plan at `docs/superpowers/plans/2026-04-07-foo-plan.md` produces the commit message `chore: post-implement checkpoint for 2026-04-07-foo-plan`.

**On commit failure** (e.g., pre-commit hook rejection):
- Print the git error verbatim.
- **Still emit the next-step breadcrumb**, but prepend a prominent warning line at the top of the breadcrumb output:

```
**IMPORTANT** COMMIT FIRST, LAST COMMIT FAILED.

Next steps (pick one):

  [1] short description of option 1
      /command-1 args

  [2] short description of option 2
      /command-2 args
```

- The `**IMPORTANT** COMMIT FIRST, LAST COMMIT FAILED.` line is the first line of the breadcrumb output; a blank line separates it from the standard `Next steps (pick one):` header; the labeled-options block follows below.
- The position guarantee from Item 03 still holds: the **last line** of the response is still the last `/command args` line of the last option. The warning is prepended (top), not appended (bottom).
- Rationale: blocking the user with a hard exit denies them progress and forces them to remember the next step from memory. Surfacing a loud warning at the top while keeping the breadcrumb available lets the user choose: commit-and-continue, override, or manually resolve. Trust the user to read the warning.

## Quality-Gate Pool

A hardcoded pool of three quality-gate skills:

1. `/api-contract-guard`
2. `/test-audit`
3. `/convention-enforcer`

At designated success points (Step 6 with 0 criticals, Step 8 finalize/complete), randomly pick **2 of the 3** and surface them as additional labeled options in the breadcrumb block, **after** the recommended next-step option.

**Selection algorithm:**
- Use timestamp-based randomness (no seed persistence — different invocations get different picks; no need for reproducibility).
- Pick 2 distinct entries from the pool of 3.
- Render each as a single-line `/clear → /<gate-name>` option (phase-boundary form, since quality gates clear context and run independently).

**Why random instead of round-robin or fixed:**
- Randomness encourages users to try different gates over time rather than always defaulting to the same one.
- No state to persist across invocations — pure per-invocation decision.
- The user always retains full control: they can ignore the surfaced options and pick `[1]` (the recommended next step) every time.

The recommended next-step option is **always `[1]`**. Quality-gate options take slots `[2]` and `[3]`. This positions the state-machine progression as the default while keeping the gates discoverable.

## Per-Step Rewrites

Six steps in `orchestrate/SKILL.md` get rewritten under this item. The Step 5 / Step 6 / Step 8 rewrites also invoke the auto-commit verification block defined above. The Step 6 success path and Step 8 also invoke the quality-gate pool. All breadcrumbs honor Item 03's `--strict` propagation and position guarantee.

The rewrites below show **standard mode** examples for readability. In strict mode, every `/orchestrate` token in every option becomes `/orchestrate --strict`.

### Step 2 (review-doc complete) — ALWAYS 2 lines

Render two options regardless of the review's findings count. The user wants the skip-ahead path surfaced even when the spec is small/clean.

```
Next steps (pick one):

  [1] Run additional review iterations
      /orchestrate (/review-doc <spec> --max-iterations 2)

  [2] Skip ahead — implement directly from the spec
      /orchestrate (/implement <spec>)
```

**Notes:**
- `<spec>` is the spec path from the orchestrate hint file.
- `--max-iterations 2` is the recommended default; user can edit before invoking.
- Option `[1]` is recommended (state-machine-correct progression). Option `[2]` is the escape hatch.
- **Step 3 (/respond-to-review) is intentionally not surfaced as a breadcrumb option here.** The review-doc loop's built-in fix phase already applies critical fixes during its own iterations, making a separate respond-to-review step redundant at this boundary. The recommended path when criticals remain is to run additional review-doc iterations (option `[1]`) rather than routing through Step 3. Explicit implementation guidance: (1) Update the SKILL.md Step-to-command mapping table row "After Step 2" to remove the `criticals > 0` conditional path through `/respond-to-review` — the new Step 2 breadcrumb is always the 2-option block above, regardless of critical count. (2) Step 3's trigger logic (Respond to Review: `review-doc-summary.md Reviewed matches spec AND Critical>0`) remains unchanged — Step 3 is still reachable for cases where `/review-doc` was run outside the orchestrate loop; only its surfacing in the Step 2 breadcrumb is removed. (3) The `/respond-to-review` skill itself is unchanged — only orchestrate no longer advertises it at the Step 2 breadcrumb boundary.
- This rewrite applies to **Step 2 itself** (after the first review-doc completes). The Step 1 → Step 2 transition (brainstorm produces spec → review-doc breadcrumb) is unchanged and remains single-line, since brainstorm-complete has only one natural next step.

### Step 4 (write-plan complete) — 2 lines

```
Next steps (pick one):

  [1] Implement the plan
      /orchestrate (/implement <plan>)

  [2] Review the freshly-written plan first
      /orchestrate (/review-doc <plan>)
```

**Notes:**
- `<plan>` is the plan path from the hint file (just-written by `/writing-plans`).
- Option `[1]` is recommended because `/writing-plans` is the dedicated plan-authoring skill and produces high-quality output by default. Plan-review is offered as an extra layer for users who want it.

### Step 5 post-`/implement` — auto-commit, then transition

After `/implement` returns control to orchestrate:

1. Run the **Auto-Commit Verification** sequence (defined above).
2. If a commit happened, print the commit confirmation:
   ```
   [/implement returned successfully]
   [git status: 5 files modified, auto-committed as "chore: post-implement checkpoint for <plan-filename>"]
   ```
3. Emit the single-line phase-boundary breadcrumb to the next step:
   ```
   /clear → /orchestrate (/review-code N --against spec --max-iterations 3)
   ```

This is **single-line** because Step 5 → Step 6 is a single recommended path. The `--against spec` argument is pre-filled (review-code reads the spec for context). `--max-iterations 3` is the recommended default for code review.

If `--strict` mode: `/clear → /orchestrate --strict (/review-code N --against spec --max-iterations 3)`.

### Step 6 (review-code complete) — auto-commit FIRST, then 2 lines REGARDLESS of findings

After `/review-code` returns control to orchestrate:

1. Run the **Auto-Commit Verification** sequence.
2. If a commit happened, print the commit confirmation.
3. Render the next-steps breadcrumb. Two cases below.

**Case A — review-code returned with criticals or highs remaining:**

```
[/review-code returned with N criticals, M highs]
[git status: 3 files modified, auto-committed as "chore: post-review-code checkpoint for <spec-filename>"]

Next steps (pick one):

  [1] Run another /review-code iteration to fix remaining criticals
      /clear → /orchestrate (/review-code N --against spec --max-iterations 3)

  [2] Advance to Step 8 (Complete) anyway — escape hatch even with criticals
      /clear → /orchestrate
```

**Notes:**
- Option `[2]` is shown **even when criticals remain** (explicit design decision). The user is trusted to know when criticals are acceptable to defer. **Routing caveat:** Because option `[2]` uses a bare `/clear → /orchestrate` (no wrapped inner command), Fast-Path Detection will run on that invocation and may re-route to Step 7 (Fix Findings) if `tmp/review-code-summary.md` still contains criticals or highs. To bypass Fast-Path Detection and advance directly to Step 8, the user should first update `tmp/orchestrate-state.md` to set `step: 8` before pasting the option `[2]` command.
- The legacy `/respond-to-review` line is **never rendered** — it was dropped from the design entirely. The review-code loop already applies fixes during its own iterations.
- Both options use phase-boundary form (`/clear → ...`) because both transitions warrant a fresh context.

**Case B — review-code returned with 0 criticals, 0 highs (success):**

```
[/review-code returned with 0 criticals, 0 highs]
[git status: clean]

Next steps (pick one):

  [1] Advance to Step 8 (Complete) — recommended
      /clear → /orchestrate

  [2] /clear → /<random-quality-gate-1>

  [3] /clear → /<random-quality-gate-2>
```

**Notes:**
- 3 options total: `[1]` is the recommended next step, `[2]` and `[3]` are randomly picked from the **Quality-Gate Pool** (defined above).
- No paranoia re-run option (re-run review-code on a clean tree is not surfaced — out of scope for v1).
- Quality-gate options are single-line because `/clear → /<gate-name>` is already complete; there's no description line for these. (See "Edge cases" below for the tradeoff on this.)

### Step 8 (Complete/finalize) — auto-commit FIRST, then same 3-line pattern as Step 6 success

After the Step 8 finalize logic completes control inside orchestrate (Step 8 is inline logic, not a separate `/finalize` skill call):

1. Run the **Auto-Commit Verification** sequence (with `chore: post-finalize checkpoint for <spec-filename>` template).
2. If a commit happened, print the commit confirmation.
3. Render the next-steps breadcrumb:

```
[Step 8 finalize complete]
[git status: 2 files modified, auto-committed as "chore: post-finalize checkpoint for <spec-filename>"]

Next steps (pick one):

  [1] Cycle complete — start the next cycle
      /orchestrate (/brainstorming)

  [2] /clear → /<random-quality-gate-1>

  [3] /clear → /<random-quality-gate-2>
```

**Notes:**
- Option `[1]` is recommended; this is the natural cycle exit. It uses the **explicit `(/brainstorming)` wrap** rather than a bare `/orchestrate` (see Step 8 next-cycle exit below).
- Quality-gate options `[2]` and `[3]` are randomly picked at this success point too. Same pool, same algorithm.
- Re-randomized at every Step 8 invocation (no caching across steps).

### Step 8 (next-cycle exit) — explicit brainstorming form

Today: bare `/orchestrate` followed by trailing prose.
After: single-line breadcrumb with the explicit inner command.

```
Cycle complete. Start a new cycle:

/orchestrate (/brainstorming)
```

**Notes:**
- This is **single-line** (no `Next steps (pick one):` header) because Step 8 has only one natural next path. The user always wants to brainstorm the next cycle from this point.
- The change vs today is two-fold:
  1. The inner command `/brainstorming` is now **explicit** (was a bare `/orchestrate`).
  2. Trailing prose is removed — the breadcrumb is the literal last line (Item 03 position guarantee).
- In strict mode: `/orchestrate --strict (/brainstorming)`.

## Edge Cases

1. **Auto-commit fails (e.g., pre-commit hook rejects).** Print the git error verbatim, prepend `**IMPORTANT** COMMIT FIRST, LAST COMMIT FAILED.` as the first line of the breadcrumb output, then emit the standard next-step breadcrumb block. Do NOT exit. The user is trusted to read the warning and act on it.

2. **`git status --porcelain` shows untracked files only.** Skip auto-commit (untracked files might be intentional cruft). Print `"warning: untracked files present, not auto-committing"` and proceed to the breadcrumb. Untracked files do not block transitions.

3. **Quality-gate randomness.** Use timestamp-based randomness; no seed persistence. Different invocations of the same step can surface different gate pairs. This is intentional — encourages users to discover/use all 3 gates over time.

4. **Multi-line breadcrumb in single-recommendation steps.** Not applicable; multi-line is only for steps with ≥2 alternatives. Single-recommendation steps (Step 1 → 2, Step 5 → 6, Step 8) remain single-line.

5. **`--strict` mode in multi-line breadcrumbs.** Every option's `/orchestrate` token gets `--strict` inserted, not just the recommended one. Item 03's propagation rule is per-token, not per-block.

6. **User picks option `[2]` or `[3]` at Step 6 Case A (the escape hatch with criticals).** Orchestrate accepts and proceeds. No warning, no second confirmation. The escape hatch is a first-class option, not a hidden override.

7. **User is already on a clean tree post-`/implement`.** Auto-commit step is a no-op. Print `[git status: clean]` and proceed silently to the breadcrumb. No spurious empty commit.

8. **User picks a quality-gate option (`[2]` or `[3]`) at Step 6 success or Step 8.** The selected gate runs in a fresh context (`/clear → ...`). When the gate finishes, the user is back in plain shell — orchestrate's state machine has handed off. The user can manually re-invoke `/orchestrate` to resume the cycle from where they left off; the hint file's `step:` field still reflects the pre-gate state because quality gates are out-of-band.

9. **Quality-gate pool with fewer than 2 entries (hypothetical future shrink).** Render whatever options exist; never error out. For v1, the pool is always exactly 3, so this case is purely defensive.

9a. **Single-line quality-gate options in multi-line breadcrumb blocks.** The Multi-Line Breadcrumb Format section specifies that each option is two lines: a description line then the `/command args` line. This single-line exception applies **only to randomly-selected quality-gate pool options** (`[2]` and `[3]` in Step 6 success and Step 8 where the specific gate pair is not known in advance). These are rendered as a **single line** (`/clear → /<gate-name>`) because the gate name is self-describing (`/api-contract-guard`, `/test-audit`, `/convention-enforcer`) and a separate description line would be redundant. Deterministically-selected gates (e.g., a gate explicitly required by project context, not drawn from the random pool) must use the standard two-line format with a description line (e.g., `"Run convention enforcement"` followed by `    /clear → /convention-enforcer`). All other options in any labeled-options block — whether inside or outside quality-gate slots — must use the two-line format.

10. **Step 8 finalize commit-failure case.** Same prepend warning behavior as auto-commit failure in Step 5/6. The warning message is identical regardless of which step triggered it; only the commit message template differs.

11. **Hint file missing the `mode:` field at breadcrumb time.** Default to non-strict (`mode: standard`). This matches Item 03's behavior — Item 04 inherits, not redefines.

12. **`/respond-to-review` invoked manually by the user mid-cycle.** Out of scope. Item 04 only specifies that orchestrate **never surfaces** that breadcrumb itself. Manual invocation is unaffected.

## Verification

Per project conventions: no test suite. Manual verification:

1. Run `/orchestrate (/review-doc <small-spec>)` and let it complete with 0 criticals — confirm Step 2 emits the 2-line breadcrumb (review more / skip ahead to /implement).
2. Run `/orchestrate --strict (/review-doc <large-spec>)` and let it complete with criticals remaining — confirm Step 2 still emits the 2-line breadcrumb, every option includes `--strict`.
3. Run a full cycle through `/implement` — confirm Step 5 auto-commits with `chore: post-implement checkpoint for <plan-filename>` and emits the single-line phase-boundary breadcrumb to `/review-code`.
4. Force a pre-commit hook failure (e.g., temporary fail in `.git/hooks/pre-commit`) and run through `/implement` — confirm the `**IMPORTANT** COMMIT FIRST, LAST COMMIT FAILED.` warning prepends the breadcrumb and the next-step breadcrumb still appears below it.
5. Run `/review-code` to a clean state (0 criticals) and confirm Step 6 emits the success-path 3-line breadcrumb with 2 random quality gates.
6. Run `/review-code` to a state with criticals and confirm Step 6 emits the Case A 2-line breadcrumb with the escape-hatch option `[2]`.
7. Complete Step 8 (finalize) and confirm Step 8 emits the 3-line breadcrumb with `(/brainstorming)` wrap on option `[1]` and 2 random quality gates on `[2]`/`[3]`.
8. Trigger Step 8 (next-cycle exit) and confirm the breadcrumb is the single line `/orchestrate (/brainstorming)` (or `--strict` form), with no trailing prose.
9. Read the modified `orchestrate/SKILL.md` and confirm the auto-commit verification block, multi-line breadcrumb format spec, and quality-gate selection logic are all present and internally consistent.

---

**Summary of this spec:**
- **Multi-line labeled-options breadcrumbs** at Steps 2, 4, 6 (both fail and success paths), 8 — `[1]` is always the recommended next step, `[2]`/`[3]` are alternatives or random quality gates from a pool of 3 (`/api-contract-guard`, `/test-audit`, `/convention-enforcer`).
- **Auto-commit verification** runs after `/implement` returns, after `/review-code` returns, and after Step 8 finalize logic completes, using literal templates `chore: post-<phase> checkpoint for <plan-or-spec-filename>`. Skips for clean trees and untracked-only states. On commit failure, prepends `**IMPORTANT** COMMIT FIRST, LAST COMMIT FAILED.` and still emits the breadcrumb (trust the user, don't block).
- **Six per-step rewrites** (Steps 2, 4, 5, 6, 8, and the next-cycle Step 8 exit) change orchestrate's exit-point breadcrumbs from single-recommendation to multi-option (where ≥2 paths exist), with auto-commit bookended on the implement/review-code/Step 8 finalize transitions. The next-cycle Step 8 exit finally uses an explicit `(/brainstorming)` wrap instead of a bare `/orchestrate` hand-wave.

**Decisions taken:**
- **Commit-failure handling:** prepend a loud warning at the top of the breadcrumb output, **still emit the next-step breadcrumb** below it (corrected mid-spec from my original "fail-loud-and-exit" proposal — the user is trusted to read the warning and choose how to proceed).
- **Quality-gate pool is hardcoded to exactly 3 entries** (`/api-contract-guard`, `/test-audit`, `/convention-enforcer`) with random pick of 2 at success points. No user configuration in v1.
- **`/respond-to-review` line is dropped entirely from breadcrumbs** — never rendered, even when criticals remain. The review-code loop applies fixes during its own iterations, so the line was redundant.
- **Step 6 Case A escape hatch** (`[2] Advance to Step 8 (Complete) anyway`) is shown **even when criticals remain** — first-class option, not a hidden override. The user is trusted to know when to defer.
- **Untracked-only state skips auto-commit** — they may be intentional cruft and shouldn't be silently swept into a checkpoint commit.
