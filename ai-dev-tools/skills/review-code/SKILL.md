---
name: review-code
argument-hint: '<commit-count|git-ref> [--against <spec>] [--effort high|xhigh|max] --max-iterations N [--verify "<cmd>"] [--run-id <id>]'
description: "Use when reviewing recent commits for bugs, architecture violations, spec drift, security issues, and verification gaps. Supports single-pass review and iterative review-fix-verify cycles. Invoke with /review-code <commit-count|git-ref>."
---

# Review Code

Iterative code review with automatic fix cycles. Reviews the last N commits, finds issues, fixes them, and verifies. Repeats until zero criticals and no verification regressions, or max iterations reached. A single agent (inheriting the caller's session model, at the `--effort` reasoning level) handles both review and fix phases. Tracks verification command regressions and maintains an append-only backlog of all issues found.

## Argument Parsing

```
/review-code <commit-count|git-ref> [--against <spec-path>] [--effort <level>] [--max-iterations N] [--verify "<cmd>"] [--run-id <id>] [--help]
```

| Flag | Default | Values | Purpose |
|---|---|---|---|
| `--against <spec-path>` | none | any file path | Spec as implementation contract |
| `--effort` | max | high, xhigh, max | Reasoning-effort level for all agents (reviewer, fixer, self-reviewer) |
| `--max-iterations` | **required** | 0-10 | How many rounds to run (0 = skip, 1 = single-pass). No default: the caller states it |
| `--verify "<cmd>"` | none | any shell command | Repeatable — verification commands run after each fix |
| `--run-id` | none | string | Prefixes output files for run scoping; optional |
| `--help` | — | — | Print usage and exit |

**`--max-iterations` is required.** If it is absent, print `Error: --max-iterations is required (0-10).` and exit. If the value is not an integer in 0-10, print `Error: --max-iterations must be an integer between 0 and 10.` and exit.

It has no default because the number of rounds is the caller's budget decision, and a silent default hides it. It is also what makes the loop bounded by construction: with the cap always stated, a review cannot run away, which is why there is no loop-detection failure mode — see `../orchestrate/references/auto/failure-handling/unresolved-criticals.md`. A round that ends with criticals outstanding is a result to report, not a loop to diagnose.

**Removed flags:** If a removed flag is still passed, print `Warning: <flag> is no longer supported; all agents inherit the caller's session model. Ignoring.` — substituting the flag actually passed — and continue. Do not exit: the flag is inert, not invalid. Accepting it silently was the previous behaviour and gave the caller no signal that it had done nothing. Worded as in `review-doc`, which specified this while this skill did not.

**Removed flags:** `--max-model` (clean break, no backward-compat shim). The reviewer, fixer and self-reviewer inherit the caller's session model; `--effort` pins the reasoning-effort level (default `max`).

If `--effort` is present, validate its value against the set `{high, xhigh, max}`; on an out-of-set value print `Error: --effort must be one of: high, xhigh, max.` and exit. When `--effort` is not passed, default to `max`.

**Positional argument detection:**

```python
if git("rev-parse", "--verify", arg) succeeds:  # any resolvable ref wins — incl. an all-numeric branch/tag/SHA
    mode = "since"
elif arg.isdigit():                             # numeric that is NOT a ref = commit count
    mode = "count"
else:
    error("Invalid argument: expected a commit count (integer) or a valid git ref.")
```

- **`count` mode** (existing): `git diff HEAD~N..HEAD` — review the last N commits.
- **`since` mode** (new): `git diff <ref>..HEAD` — review all changes since the given ref.

Both modes are fully backward compatible. The `since` mode is used by orchestrate auto mode's agent iii dispatch.

### `--help` Output

When `--help` is passed, print the following and exit (no review runs):

```
Usage: /review-code <commit-count|git-ref> [flags]

Iterative code review with automatic fix cycles. Reviews commits (by count
or since a ref), finds issues, fixes them, and verifies. Repeats until
zero criticals or cap.

Flags:
  --against <spec-path>   Spec as implementation contract    (default: none)
  --effort <level>        Reasoning effort: high, xhigh, max  (default: max)
  --max-iterations N      Rounds to run, 0=skip, 1=single    (REQUIRED)
  --verify "<cmd>"        Verification command (repeatable)  (default: none)
  --run-id <id>           Prefix for output files            (default: none)
  --help                  Print this help and exit

Examples:
  /review-code 3                                     Review last 3 commits
  /review-code a1b2c3d                               Review since git ref
  /review-code 5 --against docs/spec.md              Review against spec
  /review-code a1b2c3d --against docs/spec.md --run-id k3m9_e5f6  Scoped
```

## Setup

1. Ensure `./tmp/_reviews_errors/` directory exists (create if needed).
2. Delete stale files from prior runs:
   - Without `--run-id`: `./tmp/_reviews_errors/review-code.json`, `./tmp/_reviews_errors/review-code.json.bak`, `./tmp/_reviews_errors/review-code-summary.md`, `./tmp/_reviews_errors/review-code-fix-report.json`, `./tmp/_reviews_errors/review-code-brainstorm.md`, `./tmp/_reviews_errors/review-code-iteration-*.md`
   - With `--run-id`: `./tmp/_reviews_errors/<run_id>-review-code*.json`, `./tmp/_reviews_errors/<run_id>-review-code*.json.bak`, `./tmp/_reviews_errors/<run_id>-review-code*.md`

   The `.bak` entries matter because the `*.json` globs do not match them — a backup left by a prior run's self-review phase would otherwise survive into the next run.
3. Do NOT delete `./tmp/past-issues-backlog.md` — it is intentionally append-only across runs.

## Pre-Flight Checks

1. `git rev-parse HEAD` succeeds. If not: `"Error: no commits in repository."`
2. **Branch guard — unconditional, never waived.** Resolve the current branch yourself:

   ```bash
   git rev-parse --abbrev-ref HEAD
   ```

   If it is `main` or `master`, the behaviour depends on whether there is a user to ask:
   - **Interactive:** print `Warning: you are on branch '<name>'. Fix commits will land here. Continue?` and pause for explicit approval. Blocking.
   - **Programmatic or auto dispatch (no user to prompt):** abort — `Error: refusing to run on branch '<name>'; dispatch from a feature branch.`

   This check previously delegated itself to "the invoking skill" whenever the caller was programmatic. **No caller discharged it.** `main` and `master` appear nowhere under `skills/orchestrate/`, and before this check was written `git rev-parse --abbrev-ref` / `git symbolic-ref` appeared nowhere in the plugin at all — no caller resolved the branch. So the one path where no human can be prompted, and where the fixer, the self-review pass and stage-iii all commit, was the path with no guard. A guard that delegates to a caller nobody wrote is not a guard.
3. If `git status --porcelain` non-empty: `"Working tree is dirty. Please commit or stash your changes before running review-code."` This check runs once during pre-flight only. Verification command side-effects (coverage reports, cache files) are expected during the loop and do not re-trigger this check. The fixer uses `git add -u` (tracked files only) when committing to avoid including verification artifacts.

## Edge Case: `--max-iterations 0`

**Handled during argument parsing, before Setup runs.** Skip the loop entirely. Neither Setup's directory creation nor its stale-file deletion happens, so no files are created and a no-op invocation cannot discard a completed prior run's artifacts. Print and exit:
```
Review Code Skipped
  Scope: last N commits
  No iterations run. Code was not reviewed.

Brainstorm (needs your decisions): none — no iterations run
```

The handoff line prints here too, and writes no file. `references/shared-rules/brainstorm-handoff.md` requires it unconditionally, and a skipped run is exactly the case where a missing line is indistinguishable from a skill that forgot.

## Edge Case: `--max-iterations 1`

Single-pass mode. The loop runs one iteration: review, stop-check, conditionally fix.

- If the reviewer finds zero criticals, the stop-check runs verification. A regression does not extend a single-iteration run — the cap is one — but it does reach the fixer via `{{VERIFICATION_REGRESSIONS}}`, and the post-fix verification records whether the repair landed. With or without regressions, the fix phase still runs on whatever the round found — zero criticals is not zero findings.
- If the reviewer finds criticals, the normal fix phase runs.
- In either case, the loop ends after iteration 1.

This is review+fix behavior. Old single-pass users get the same review, plus automatic fixing if issues are found. If verification regressions are introduced within the fix phase, they are tracked but the loop does not repeat.

## Iteration Flow

```
For iteration 1 to max_iterations:

  REVIEW PHASE:
    Dispatch single reviewer agent (inherits session model; runs at --effort level)
    Agent produces tmp/_reviews_errors/review-code.json directly (no synthesis)

  VALIDATION:
    Run: node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-review-json.cjs --schema code <output-path>
    Exit 0 → use the printed recount as the authoritative severity counts
    Exit 1 or 2 → retry review once, abort on second failure
    If node is unavailable: fall back to reading the file, and record
      "schema validation not run: node unavailable" under Checks SKIPPED

  STOP CHECK (only when critical_count == 0):
    Run verification commands, compare to baseline
    Set regressions_present = (verification regressed)
    If regressions_present OR coverage.not_inspected is non-empty:
      Continue the loop — do NOT treat this as the last iteration
    Else:
      This is the last iteration.
    Either way: fall through to the Fix Phase if the round found anything at all,
      then go to Final Report. Zero criticals is not zero findings.
    NOTHING is written to review-code.json here. The artifact is the reviewer's.

  FIX PHASE (whenever the round found ANY issue — critical, high, medium or low):
    Dispatch fixer agent (inherits session model; runs at --effort level)
    Fixer commits: "fix(review-code): resolve N issues from iteration M"

  SELF-REVIEW (always, whenever the fix phase ran):
    Scope = the fixer's own commits: git diff $before_sha..$fixer_sha
    Dispatch self-review agent (prompts/self-review.md)
    Reports defects in the fixer's own changes AND fixes them, exactly once (depth 1)
    Appends issues with origin: "self-review" — excluded from THIS iteration's
      critical_count and high_count, printed on their own line either way
    Commits: "fix(review-code): self-review of iteration M's fixes"

  VERIFICATION (post-fix):
    Run --verify commands, compare to baseline
    Track regressions for next iteration's reviewer and fixer context

  BACKLOG WRITING (with dispositions from fix-report.json) → tmp/past-issues-backlog.md
  ITERATION LOG → tmp/_reviews_errors/review-code-iteration-N.md
```

**The stop check is coverage-aware, and that is where the safeguard belongs.** It used to stop on `critical_count == 0` alone, while `orchestrate`'s stage iii separately refused to advance whenever `coverage.not_inspected` was non-empty — two contracts for one decision, and only the outer one protected anything. A standalone `/review-code` run would stop with iterations left unused and report **Incomplete** without trying to open the files it had skipped, and stage iii's re-dispatch started a *fresh* run that made the same call at the same point.

This skill is the party that knows its own coverage and owns its own loop, so the condition lives here. Every caller now benefits, `--max-iterations` still bounds it, and a run that cannot close coverage within its cap ends **Incomplete** and says so — a result, not a loop. Stage iii's rule is now a restatement of this one rather than a competing contract.

No final-gate pattern for review-code. Since all rounds use the same single agent, a redundant review-only round on unchanged code adds no value. Verification commands serve as the quality gate instead.

**Fixing and iterating are separate decisions.** The fix phase runs whenever the round found anything, at any severity. Only whether to run *another* iteration is gated on criticals. Gating the fixer on criticals meant a round that found only highs and mediums fixed nothing and handed the whole list to a human — contradicting `references/shared-rules/brainstorm-handoff.md`, which requires the fix phase to always run. It also disabled the self-review pass, which runs only after a fix phase. A minor finding the agent can fix is still worth fixing; whether it justifies another round is a different question, and that one is still severity-gated.

## Reviewer Agent

Single agent, inheriting the caller's session model and running at the `--effort` reasoning level (the skill substitutes every `{{PLACEHOLDER}}` in `prompts/reviewer.md` — `{{EFFORT}}`, `{{ITERATION_NUM}}`, `{{SPEC_CONTENT}}`, `{{CLAUDE_MD}}`, `{{ADRS}}`, `{{GIT_DIFF}}`, and `{{OUTPUT_PATH}}` → `tmp/_reviews_errors/[<run_id>-]review-code.json`). Receives:
- Git diff (up to 3000 lines, strategically trimmed)
- Spec content (if `--against` provided)
- CLAUDE.md (if exists)
- ADRs (scope-based filtering, up to 200 lines)

**Each iteration's reviewer starts fresh — it reads no prior artifact and is handed no prior iteration's findings.** Every iteration re-reads the full scope since the resolved base, where a defect an earlier iteration fixed is simply absent. There was a `{{PREVIOUS_FINDINGS}}` slot here; no phase computed it, so the placeholder reached the agent unsubstituted.

Read `prompts/reviewer.md` from this skill's directory for dispatch instructions. The reviewer writes to the resolved `{{OUTPUT_PATH}}` (`tmp/_reviews_errors/[<run_id>-]review-code.json`) directly using the Write tool. The reviewer prompt includes the review-code JSON schema so the agent produces valid structured output. The orchestrator validates the output in the Validation step.

## Context Budgets

- **Git diff:** 3000 lines max. If over budget:
  1. Include `git diff --stat` always (does NOT count against budget).
  2. Use `git diff --numstat` for per-file line counts.
  3. Sort files by total changes (insertions + deletions) descending.
  4. Greedily include full diffs largest-first until the next file would exceed remaining budget.
  5. Remaining files appear as stat-only summaries.
- **Stat-only file coverage:** The reviewer prompt must include: "For files shown as stat-only summaries, use Read to inspect the changed files. Do not skip files just because their full diff was not included."
- **ADRs:** 200 lines max. Truncate to most recent files by modification time (newest first).

## Fixer Agent

Single agent, inheriting the caller's session model and running at the `--effort` reasoning level (the skill substitutes every `{{PLACEHOLDER}}` in `prompts/coder.md` — `{{EFFORT}}`, `{{ALL_ISSUES}}`, `{{VERIFICATION_REGRESSIONS}}`, `{{SPEC_CONTENT}}`, and `{{FIX_REPORT_PATH}}` → `tmp/_reviews_errors/[<run_id>-]review-code-fix-report.json`). Receives:
- All issues grouped by severity
- Verification regressions (if any)
- Spec content (if `--against` provided)

Read `prompts/coder.md` from this skill's directory for dispatch instructions. Edits code, commits with message `fix(review-code): resolve N issues from iteration M`, produces `tmp/_reviews_errors/review-code-fix-report.json`.

## Self-Review Agent

Runs **after the fixer**, in every iteration where the fixer ran. Always on — there is no flag.

**Scope is a git diff.** The fixer commits its own work, so its changes are mechanically identifiable: `git diff $before_sha..$fixer_sha` — the fixer's commits and nothing else. No fix-report region matching is needed; this is the one thing that makes the pass simpler here than in `review-doc`. Note it is `$fixer_sha`, not `$after_sha`: this pass has not made its own commit yet, and reviewing its own future output is not what depth 1 means.

**Remit** is the fixer's own changes, on the same categories the reviewer uses: a fix that does not do what its disposition claims, two fixes that contradict each other, a fix that breaks a call site it did not touch, and a fix that is wrong on its own terms.

**It fixes what it finds, exactly once.** Depth 1 — it edits and commits, and the code *it* writes is not re-reviewed within the iteration. The next iteration's reviewer covers it: both scope modes review the full scope since the resolved base, so nothing the self-review pass writes escapes review as long as another iteration runs.

Before dispatch, the orchestrator backs up `tmp/_reviews_errors/[<run_id>-]review-code.json` to `<path>.bak`. **An agent that cannot do its job aborts by leaving the artifact untouched and returning a first line beginning with the literal prefix "ABORT: ".** On detection the orchestrator restores the backup, prints `Warning: self-review aborted — <reason>. Fix results unverified.`, and continues; any other failure mode (crash, exception, no response) is treated identically. Defined once, in `references/shared-rules/agent-abort-contract.md`, and shared with `review-doc`.

Read `prompts/self-review.md` and dispatch: `Agent(prompt: <self-review-prompt>)`. The skill substitutes every `{{PLACEHOLDER}}` in that prompt, exactly as it does for `prompts/reviewer.md` and `prompts/coder.md` — `{{DIFF_RANGE}}` → the fixer's diff range `$before_sha..$fixer_sha`, `{{FIX_REPORT_PATH}}` → `tmp/_reviews_errors/[<run_id>-]review-code-fix-report.json`, and `{{OUTPUT_PATH}}` → `tmp/_reviews_errors/[<run_id>-]review-code.json`. A path described in prose instead of substituted is a path the agent has to guess at, and the prompt stops rather than guessing: it reports the placeholder as unsubstituted. The effort level is not a placeholder — it goes in the dispatch prompt as a reasoning-depth directive.

It appends every defect to the `issues` array with `origin: "self-review"` and all six schema-required fields, and commits with `fix(review-code): self-review of iteration M's fixes`.

**Count invariant: Counts measure the artefact under review, never the review loop's own edits.** Self-review findings are NOT counted in `critical_count` or `high_count` for the iteration that produced them. That iteration both wrote and reviewed those lines, so counting them there reports the loop's own churn as evidence against the code under review — and the unresolved-criticals gate stops the run on a spec at `any critical remaining`. From the next iteration those lines are ordinary code: the reviewer re-reads the full scope and emits anything still wrong in them as `origin: "document"`, counted normally.

The exclusion is **round-local**, and needs no boundary flip to stay that way: iterations carry nothing forward, so the next iteration's reviewer re-reads the full scope and reports defects in those lines as ordinary `"document"` findings. It is defined once, in `references/shared-rules/counts-exclude-self-review.md`, and shared with `review-doc`.

**Not counted is not not-shown.** Self-review findings print on their own line in the terminal output and appear in the summary. Without that, the loop would have a sanctioned channel for silent degradation.

**Disclose the depth-1 tail.** The code the self-review pass itself writes is not reviewed within the iteration, and on the FINAL iteration no later one reads it either. Track `self_review_tail_lines` — lines written by the final iteration's self-review pass — and print `Unreviewed tail: N lines committed by the final self-review pass`, omitting the line when the count is 0. `prompts/self-review.md` returns that count. On a `--max-iterations 1` run the final iteration is the only iteration, so every line the pass writes is committed unreviewed. Required by `references/shared-rules/counts-exclude-self-review.md`.

**Non-obvious consequence, and it is intended.** Because this pass *fixes* what it finds, the `critical_count` iteration N+1's reviewer computes measures code whose previous iteration's churn has already been cleaned up, rather than code still carrying it. This skill's Status Logic and `orchestrate`'s stage-iii unresolved-criticals gate (`../orchestrate/references/auto/stages/stage-iii-code-review.md` — "Pre-fix criticals > 0 → Q2 unresolved-criticals failure") therefore gate on the right signal without either being rewritten. Do not "fix" them to compensate. (`found_this_round` and a Next-Round Recommendation are `review-doc`'s; this skill has neither, and naming them here was a copy from that skill.)

## Verification Commands

- Baseline captured before first iteration: run each `--verify` command **twice**. A command whose two runs disagree on exit code is non-deterministic (flaky) — print `Warning: --verify command '<cmd>' is non-deterministic; excluded from regression detection.` and exclude it from all regression comparison. Record exit codes for the deterministic commands.
- Run after each fix phase.
- Compare to baseline: new non-zero exit = regression.
- **Regressions are never written into the review JSON.** The stop check used to inject them as synthetic critical issues and bump `critical_count`. That bought nothing: the loop continues because the stop check decides to, not because a counter changed; the fixer already receives them through `{{VERIFICATION_REGRESSIONS}}` in `prompts/coder.md`; and Status Logic rule 2 already reads "verification regressions present" as an independent disjunct. What it cost was the meaning of the count — **counts measure the artefact under review, never the review loop's own edits**, and a regression the loop's own fixer introduced is exactly the loop's own edits. It also made the count unable to fall: nothing lowers `critical_count` after the injection, so a final iteration whose only criticals were regressions its own fix phase then repaired still ended at Issues Found and still stopped an `--auto` run.
- Regression details persist between iterations, passed to the **fixer** via `{{VERIFICATION_REGRESSIONS}}` in `prompts/coder.md`. The reviewer prompt has no regression slot: it re-reads the diff each iteration, where a regression is visible as code. Narrowed from "both reviewer and fixer", which named a channel that does not exist.
- Verification command failures are NOT errors — they are data for regression comparison.

## ADR Discovery

Scope-based filtering:
1. Discover ADR index using fallback sequence: `docs/architecture/adrs.md` → `docs/adrs/` → `docs/adr/` → `adr/`. Use first match.
2. Read all `.md` files in the matched directory.
3. Include matched ADRs in reviewer context (within 200-line budget).
4. If total ADR content exceeds 200 lines, truncate to the most recent files (by file modification time, newest first) that fit.
5. If no ADRs found, skip — the Architecture category still applies if CLAUDE.md exists.

## Brainstorm Document

**Everything the run could not decide goes in one brainstorm document, and its absolute path is the last line printed.** What goes in it, how entries are grouped, and what each one states are defined once, in `references/shared-rules/brainstorm-handoff.md`, and shared with `review-doc`. The fix phase runs whenever there is something to fix — there is no report-only mode and no scope small enough to exempt one; the fixer runs whenever the round found any issue at any severity, and the only fix phase the loop skips is one with nothing to act on. Only the decision to run *another* iteration is gated on criticals. Fix what has one defensible answer; hand back only what has more than one, or what depends on something the repository does not say. This skill writes the document to `tmp/_reviews_errors/[<run_id>-]review-code-brainstorm.md` after the triage phase, and ends the run with:

```
Brainstorm (needs your decisions): /abs/path/to/tmp/_reviews_errors/review-code-brainstorm.md
```

When there is nothing to hand back, print the line anyway and write no file:

```
Brainstorm (needs your decisions): none — every finding was applied or resolved
```

A missing line is indistinguishable from a skill that forgot.

## Backlog Writing

After each iteration, append all issues to `tmp/past-issues-backlog.md`:
1. Read `${CLAUDE_PLUGIN_ROOT}/references/backlog-entry-format.md` for the entry template.
2. If `./tmp/past-issues-backlog.md` does not exist, create it with the standard header.
3. Cross-reference with `tmp/_reviews_errors/review-code-fix-report.json` for dispositions (`fixed`, `pushed-back`).
4. On stop-check iterations (no fix phase): all issues recorded as `status: found`.
5. On abort: record all issues as `status: found` with warning.
6. `Source: review-code` for all entries.
7. No deduplication (intentional — repetition signals difficulty for downstream pattern mining).

## Git Diff Scope

**Count mode (integer argument):**
**Three SHAs, and where each is captured.** They are distinct commits and conflating them is what
makes the next iteration's scope wrong:

| variable | captured | what it points at |
|---|---|---|
| `original_base` | once, at iteration 1, before anything runs | the commit the whole review is measured from; **never recomputed** |
| `before_sha` | at the start of each iteration, before the fixer is dispatched | HEAD as that iteration found it |
| `fixer_sha` | after the fixer commits, before the self-review pass is dispatched | the end of the fixer's work — the self-review pass's scope is `before_sha..fixer_sha` |
| `after_sha` | after the self-review pass commits (or `= fixer_sha` if it made no commit) | the end of the whole iteration |

`after_sha` is captured **after** the self-review pass, which is what puts that pass's own commit
inside the next iteration's scope. Capture it before, and the code the self-review pass writes is
never reviewed by anything — and the round-local count exclusion in
`references/shared-rules/counts-exclude-self-review.md` is justified by the claim that the next
iteration reads it.

- **Iteration 1:** resolve the base **once** and keep it — `original_base=$(git rev-parse HEAD~N)` — then `git diff $original_base..HEAD`
  - If `HEAD~N` fails (fewer commits): `original_base=$(git hash-object -t tree /dev/null)`, then `git diff $original_base..HEAD`
- **Iteration 2+:** `git diff $original_base..$after_sha` — always reviews full scope since the resolved base, including prior iteration fixes.
  - `original_base` is the SHA captured at iteration 1 and is **never recomputed**. A literal `HEAD~N` re-evaluated at iteration 2 points somewhere else, because the fixer's commits have moved `HEAD`: the expression silently narrows the scope every iteration and the original implementation is never reviewed again after iteration 1.
  - If neither the fixer nor the self-review pass committed: `$after_sha` equals `$before_sha` and the same command re-reviews the same scope.

**Since mode (git ref argument):**
- **Iteration 1:** `git diff <ref>..HEAD`
- **Iteration 2+:** `git diff <ref>..$after_sha` — always reviews full scope since the ref, including prior iteration fixes.

Both modes review the **full** scope every iteration, so each iteration sees both original implementation quality AND any regressions introduced by earlier fixes. The round-local count exclusion depends on this: a finding excluded from the counts of the iteration that produced it is counted by the next iteration, which is only sound if the next iteration re-reads everything. See `references/shared-rules/counts-exclude-self-review.md`.

### Ancestry is not a merge test

Under **squash-merge**, merging a pull request creates a new commit with no ancestry link to the branch's commits. So `git log origin/master..<branch>` lists commits whose content **already landed**, and `rev-list --count` will report a fully merged branch as "156 commits ahead".

To test whether work landed, ask the forge, not the graph:

```bash
gh pr list --repo <owner>/<repo> --head "<branch>" --state all --json number,state,mergedAt
```

A tree comparison (`git diff --shortstat origin/master <branch>`) is a secondary check — and a large diff on an old branch usually means the branch is *behind* the base, not ahead.

Never report work as unlanded on ancestry evidence alone. When the forge cannot be reached, say so under "Checks SKIPPED, and why" rather than substituting a commit count. The ancestry answer is confident, wrong, and alarming.

## Output Artifacts

| File | Purpose | Consumer |
|---|---|---|
| `tmp/_reviews_errors/[<run_id>-]review-code.json` | Structured JSON from last iteration | Machines |
| `tmp/_reviews_errors/[<run_id>-]review-code-summary.md` | Curated human summary (max 10 items + aggregates) | Humans |
| `tmp/_reviews_errors/[<run_id>-]review-code-fix-report.json` | Coder dispositions per issue | Orchestrator |
| `tmp/past-issues-backlog.md` | Full issue history across iterations | Pattern mining |
| `tmp/_reviews_errors/[<run_id>-]review-code-iteration-N.md` | Per-iteration log | Debugging, audit |
| `tmp/_reviews_errors/[<run_id>-]review-code-iteration-N.json` | That round's findings, snapshotted before the next round overwrites them | Final Report aggregates, audit |
| `tmp/_reviews_errors/[<run_id>-]review-code-fix-report-iteration-N.json` | That round's dispositions, same reason | Final Report aggregates, audit |
| `tmp/_reviews_errors/[<run_id>-]review-code-brainstorm.md` | Items needing a human decision; its absolute path is the run's last line | Humans |

**Run-id prefixing (applies throughout):** every `tmp/_reviews_errors/review-code*` path referenced anywhere in this document (Iteration Flow, Backlog, Terminal, Final Report, Respond, Cross-Iteration, Iteration Log, Schema) is prefixed to `tmp/_reviews_errors/<run_id>-review-code*` when `--run-id` is active — matching the run-id-aware paths the reviewer/fixer prompts write to. The `[<run_id>-]` prefix is elided inline for brevity and shown explicitly only in the Output Artifacts table above.

## Review Summary Format

Generate `tmp/_reviews_errors/review-code-summary.md` using this template:

```markdown
# Review Summary

**Date:** YYYY-MM-DD HH:MM
**Scope:** last N commits
**Against:** <spec-path or "standalone">
**Status:** Approved | Approved with suggestions | Incomplete | Issues Found
**Iterations:** N/M

## Aggregate
X Critical fixed | Y High fixed | Z Medium fixed | W Low fixed
Remaining: A Critical | B High | C Medium | D Low
Last round: X Critical fixed | Y High fixed | Z Medium fixed | W Low fixed
Pushed back: P

## Self-Review
S findings against this run's own fixes (F fixed, R remaining) — excluded from the counts above.
  [category] [severity] at [location] — <problem> (fixed | remaining)
Unreviewed tail: N lines committed by the final self-review pass

## Validation
- Commands run (exact) and their results
  - `<cmd>` — PASS | REGRESSION (exit N, baseline exit M)
- Checks SKIPPED, and why
  - `<cmd>` — not run: <reason>
- Residual risk
  - <what could still be wrong after this run>

## Remaining Issues (top 10 by severity)

### 1. [Title]
**Severity:** high | **Category:** bug | **Location:** src/auth.ts:42
**Problem:** ...
**Status:** pushed-back — reason

[... up to 10 items]
```

The three `## Validation` bullets are required. **An empty bullet prints `none stated` rather than being omitted** — an explicit "none" is a claim someone can challenge; silence is indistinguishable from having forgotten.

What belongs under each:
- **Commands run** — every `--verify` command that executed, quoted exactly, with its result against baseline.
- **Checks SKIPPED** — every command that did not execute, and why. This includes commands excluded as non-deterministic during baseline capture (see Verification Commands), which are otherwise reported only once at baseline and never appear again. It also includes `none configured` when `--verify` was not passed: the checks were skipped, and the reason is that no checks were defined. It also includes every file in `coverage.not_inspected` — a changed file that was never opened is a skipped check, and it is what makes the run Incomplete rather than Approved.
- **Residual risk** — what this run could not establish. Max-iterations exhausted with criticals remaining, pushed-back findings, files reviewed as stat-only summaries, verification that passed but does not cover the changed paths.

## Terminal Output

Print the following when the loop completes:

```
Review Code Complete
  Scope: last N commits against <spec or "standalone">
  Iterations: N/M
  Status: Approved with suggestions
  Aggregate: 8 Critical fixed | 5 High fixed | 3 Medium fixed | 1 Low fixed
  Remaining: 0 Critical | 2 High | 1 Medium | 0 Low
  Last round: 2 Critical fixed | 1 High fixed | 0 Medium fixed | 0 Low fixed
  Self-review: 3 found, 3 fixed — not counted above (this run's own churn)
  Unreviewed tail: 12 lines committed by the final self-review pass
  Verification: all passing
  Commits added: abc1234, def5678
  Summary: tmp/_reviews_errors/review-code-summary.md
  Full review: tmp/_reviews_errors/review-code.json
  Backlog: tmp/past-issues-backlog.md

Brainstorm (needs your decisions): /abs/path/tmp/_reviews_errors/review-code-brainstorm.md
```

`Self-review:` reports what the self-review pass found against this run's own fixes. Those findings are excluded from `Aggregate`, `Last round`, `Found this round`, and from `critical_count`/`high_count` — because the iteration that wrote those lines both authored and reviewed them. **They are excluded from the counts, never from the output.** Print the line whenever the self-review pass ran, including when it found nothing (`0 found`).


## Final Report

When the loop completes (criticals zero + verification pass, or max iterations exhausted):
0. **Validate the finished artifact**, once, before anything reads it: `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-review-json.cjs --schema code <output-path>`. This is the only point at which the self-review pass's appends are checked. Nothing checks them in-iteration, and no later reviewer corrects them either: the next iteration writes a fresh artifact over this one rather than recounting it, so a bad append is discarded rather than repaired, and the final iteration has no next write at all. On a `--max-iterations 1` run that is the whole review. Exit 1 → status **Error** per `references/shared-rules/run-failure-disclosure.md`; exit 2 → status **Error** as well — the validator returns `2` for an artifact it could not read or a command it could not parse, not for a check it chose to skip, and a finished artifact nothing can open is not a run that completed. `node` being absent is a different condition: the command never runs and the shell returns `127`. Only in that case proceed and record `schema validation not run: node unavailable` under Checks SKIPPED.
1. Generate `tmp/_reviews_errors/review-code-summary.md` from the last iteration's `tmp/_reviews_errors/review-code.json` (top 10 issues by severity, then descending confidence).
2. Compute aggregate counts from accumulated fix-report data across all iterations (see Cross-Iteration Tracking).
3. Apply status logic (below).
4. Print terminal output.
5. If status is "Approved with suggestions" or "Incomplete", run the Respond to Remaining Issues phase (below).
6. Write the brainstorm document and print its absolute path as the run's last line (see Brainstorm Document below). This runs whatever the status is — a run with nothing to hand back still prints the line.

## Respond to Remaining Issues

**Trigger:** Status is "Approved with suggestions" OR "Incomplete", and issues remain (zero criticals).

Incomplete triggers it too. A finding is real whether or not some *other* file went unread — the coverage hole makes the verdict incomplete, it does not make the findings less true, and suppressing triage would punish the run twice. The status stays Incomplete; only the triage phase is unblocked.

After printing the terminal output, auto-triage each remaining issue from `tmp/_reviews_errors/review-code.json` (sorted by severity descending, then confidence descending). The agent decides autonomously — no user interaction.

**Read the final round's fix report first.** `tmp/_reviews_errors/review-code-fix-report.json` is the fixer's output; `review-code.json` is the reviewer's, written before the fix phase and never updated by it. Skip every issue whose `issue_index` that report dispositions as `fixed` — the fixer already resolved it and committed the change, and re-triaging it would land a second commit on a location that no longer says what the finding described. What reaches this phase is what the fixer `pushed-back`, plus any issue with no disposition at all. A self-review finding the pass reported as fixed is the one exception: it carries no `issue_index` disposition because the fixer ran before it, and the pass that raised it already repaired and committed it. If no fix report exists for this run, every issue is triaged.

**Auto-triage rules (per issue)** — every issue resolves to exactly one of these two outcomes. There is no "defer" option; the agent must either fix or justify rejecting the finding:
- **Apply:** The suggested fix is actionable and the agent can make the edit. Apply directly — same approach as the fixer agent (edit the file, run `--verify` commands if configured). Default to this option whenever the fix is within reach.
- **Push back:** The finding is incorrect, irrelevant, misunderstands the code/spec, OR the fix genuinely requires information/context the agent cannot obtain. Record the reasoning to `tmp/response_analysis.md` so the next review cycle can see why the finding was rejected. "I don't have enough context" is a valid push-back reason — but it must be written as explicit reasoning, not silently skipped.

The agent never asks the user. Every remaining issue resolves to apply or push back — including critical-severity items the agent cannot confidently fix (push back with explicit reasoning).

After auto-triage, print a summary and commit applied fixes:

```
── Remaining Issues ────────────────────────────
N issues triaged (H high, M medium, L low).

  [Applied]     #1 high: <title>
  [Applied]     #2 medium: <title>
  [Pushed back] #3 medium: <title> — <one-line reason>

Applied: N | Pushed back: N
```

If any fixes were applied, commit with: `fix(review-code): apply N review suggestions`.

After all issues are processed, update `tmp/_reviews_errors/review-code-summary.md` with final dispositions and reprint the terminal output with updated counts.

**Response analysis format:** Write to `tmp/response_analysis.md` (overwrite — no need to read first):

```markdown
## Review-Code Response — <date>

### [N] — [Issue title derived from problem]
**Status:** Applied | Pushed back

**[If Applied]**
Change: what was changed and where

**[If Pushed back]**
Reason: <agent's reasoning for why the finding is incorrect, irrelevant, or cannot be acted on with available context>

---
```

**When status is "Approved" or "Issues Found":** Skip this phase entirely. "Approved" has nothing to address. "Issues Found" is Status Logic rule 2, and it has two triggers: `critical_count > 0` — the loop should have handled them, or max iterations were exhausted — or verification regressions present. The phase is skipped on either, so a run whose only outstanding defect is a verification regression hands the user every remaining high, medium and low issue untriaged — the second trigger, not "criticals remain", is what suppressed the triage there.

**When status is "Incomplete":** run the phase, and add one line to its summary naming the files in `coverage.not_inspected`, so a reader knows the triage happened over a partial view. An applied fix could in principle conflict with something in an unopened file; naming them is what makes that risk visible rather than hidden.

## Cross-Iteration Tracking

Orchestrator maintains running counters across iterations:
- `total_fixed` (per-severity: critical, high, medium, low). The fix report cannot supply the severity — `prompts/coder.md` emits `{issue_index, action, detail}` and no more — so resolve each disposition's severity by `issue_index` into the CURRENT `tmp/_reviews_errors/review-code.json` *before* the next iteration's reviewer overwrites it, and increment `total_fixed[severity]` there and then. Nothing is cached across iterations: `issue_index` is a position in that iteration's own array, so a map that outlived the iteration would resolve the next one's indices against the previous one's findings.
- `last_round_fixed` (per-severity: critical, high, medium, low) -- reset before each iteration, tracks only the most recent round (populates "Last round:" line)
**`Remaining:` is the one exception, and deliberately so.** It adds back every self-review finding that pass reported and could **not** fix, because by then those are unrepaired defects in the artefact rather than churn. `Remaining:` is read by a human; the gate counts are read by a pipeline. A human should see a defect the loop introduced and failed to repair; a gate should never stop a run over the loop's own edits. Status Logic filters on `origin: "document"` and so does not read this counter — an unfixed self-review finding raises `Remaining:` without moving the status.

- `remaining` (per-severity: critical, high, medium, low) -- populates the `Remaining:` line. **Defined as the final round's findings minus that round's `fixed` dispositions, plus every self-review finding that pass reported and did NOT fix.** Computed once, after the final iteration's fix phase and its self-review pass.

  Taking the final review JSON's severity breakdown instead would report as *remaining* exactly what the last fixer just repaired. Subtracting `fixed` alone trusts the fixer's own claim that a fix landed — and the self-review pass exists because that claim is sometimes false. Adding back that pass's verified failures is what makes the number mean "still wrong in the code", which is what a reader assumes it means. **Status Logic does not read this counter.** Rule 4 tests the issues array directly and filters on `origin: "document"` — so a self-review finding the pass could not fix raises `Remaining:` without moving the status. A self-review finding the pass reported and fixed is not remaining; one it could not fix is. This changes no gate count — `critical_count` and `high_count` are untouched, per `references/shared-rules/counts-exclude-self-review.md`.
- `total_pushed_back` (flat count)

**Snapshot the round before the next one overwrites it.** After each iteration's self-review pass returns, copy the round's two artifacts to iteration-scoped names:

```bash
cp tmp/_reviews_errors/[<run_id>-]review-code.json            tmp/_reviews_errors/[<run_id>-]review-code-iteration-N.json
cp tmp/_reviews_errors/[<run_id>-]review-code-fix-report.json tmp/_reviews_errors/[<run_id>-]review-code-fix-report-iteration-N.json
```

Rounds start fresh, so round N+1's reviewer **overwrites** both files rather than appending to them. Every cross-round number the Final Report prints — `Aggregate`, `Deferred`, `Pushed back`, `collateral_count` — is summed across iterations, and without these snapshots the only copy of round N's data is orchestrator state in a context window. That is not a durable source, and a run that reports an aggregate it cannot reconstruct from disk is reporting a number nobody can check.

This is the cost of removing carry-forward, paid deliberately: the accumulating array used to be the record. Two `cp` calls per iteration replace it, and they make each round independently auditable — which the accumulating array never was.
- `self_review_found = {found: 0, fixed: 0}` — running total across every self-review pass in this run, sourced from the agent's returned summary (`prompts/self-review.md` requires it), **with each finding's category, severity, location, problem and whether the pass fixed it retained for rendering.** The two scalars alone serve only the `Self-review:` terminal line. Three consumers need the per-finding detail: the summary's `## Self-Review` section, which prints one line per finding; the `remaining` computation, which adds back every self-review finding the pass reported and did NOT fix; and the Respond-phase skip rule, which passes over the ones it did. None of it is recoverable from the issues array afterwards — the fixed/remaining disposition never reaches the issue record, because `additionalProperties: false` rejects it, so `prompts/self-review.md` keeps it in the returned summary and nowhere else. (No `id`: the review-code schema has none. `review-doc` retains an id here because its schema does.) **Never** added to `total_fixed`, `critical_count` or `high_count` for the iteration that produced it: `references/shared-rules/counts-exclude-self-review.md`.
- `self_review_tail_lines` — lines written by the FINAL iteration's self-review pass, for the `Unreviewed tail:` line. Earlier iterations need no tracking; the next iteration reviews them.

Parse `tmp/_reviews_errors/review-code-fix-report.json` after each fix phase before it is overwritten by the next iteration. Additionally maintains `fix_commit_shas = []` — after each fix phase where `fixer_sha != before_sha`, append the short SHA, and again after the self-review pass where `after_sha != fixer_sha`. This populates the "Commits added" line in terminal output.

## Verification with `--max-iterations 1`

With a single iteration: if the reviewer finds zero criticals, the stop-check runs verification and records whether it regressed. Nothing is written to `tmp/_reviews_errors/review-code.json` — the regressions reach the fixer through `{{VERIFICATION_REGRESSIONS}}`, and the run continues to the fix phase within the same iteration. After the fix phase, run verification one final time and report its result under the summary's `## Validation` bullets. The loop then ends (cap reached).

**A regression that the fix phase repaired no longer holds the run at "Issues Found".** It used to, unavoidably: the stop check injected synthetic criticals and nothing could lower `critical_count` afterwards — the fixer writes only the fix report, the self-review pass may not recompute, and validation *requires* the declared count to equal a recount that includes them. So rule 2 fired on `critical_count > 0` and its second trigger never had to be consulted.

Now the count stays the reviewer's, and rule 2's second trigger does the work it was written for: the status is decided by whether the regression is **still present** at the final verification, not by whether one was ever detected. A regression introduced and repaired inside one run reports Approved; one that survives the fix phase reports Issues Found. That is what a caller needs to know, and it is what `--auto`'s unresolved-criticals gate should act on.

## When `--verify` Is Not Provided

If no `--verify` commands are configured, skip verification comparison and treat as no regressions. Terminal output: `Verification: none configured`.

## Status Logic

First match wins:
1. **Error**: the loop aborted — reviewer output failed schema validation twice, the fix phase failed, or a required git operation failed. A dispatched pass that aborts under `references/shared-rules/agent-abort-contract.md` is NOT an Error: that contract restores the backup, warns, and continues by design.
2. **Issues Found**: `critical_count > 0` OR verification regressions present
3. **Incomplete**: `coverage.not_inspected` is non-empty
4. **Approved with suggestions**: any high, medium, or low issue with `origin: "document"` remains
5. **Approved**: all other cases

**Incomplete** names the files that were not inspected rather than announcing the run clean. It has exactly one trigger. Output that fails validation resolves to **Error** at rule 1 in both standard and auto mode, so it never reaches rule 3.

**A run that could not complete reports Error, names the phase that failed and why, and never prints a status or a count that implies a review happened.** Defined once, in `references/shared-rules/run-failure-disclosure.md`, and shared with `review-doc`.

On an Error the count block is replaced, not relabelled — `Aggregate`, `Remaining`, `Last round` come from an artifact the run did not finish writing:

```
Review Code FAILED
  Phase: <reviewer | fixer | self-review>
  Reason: <one line — the validator's stderr, the ABORT reason, or the exception>
  Artifact: <path> — <not written | restored from backup | partial, left as-is>
  Scope: last N commits | commits <ref>..HEAD
  Iterations completed: N of M
  Counts: not reported — this run did not complete a review
```

Interactive runs then ask `Retry the failed phase / continue with what completed / abort the run? [retry|continue|abort]` and wait. **Programmatic or auto dispatch does not ask** — there is nobody to answer and a prompt in auto mode hangs the pipeline. Exit non-zero, write the reason to the run's error log, and let the caller's failure path handle it. The brainstorm handoff line still prints last; on an Error that document is the failure report.



## Iteration Log Format

Write to `tmp/_reviews_errors/review-code-iteration-N.md`:

```markdown
# Iteration N

**Model:** inherited from caller session
**Effort:** <--effort value>
**Scope:** last N commits | commits original_base..after_sha | commits <ref>..after_sha (`after_sha` = HEAD after the self-review pass)
**Issues found:** X critical, Y high, Z medium, W low
**Outcome:** "Fixed N issues (P pushed back), continuing" | "Fixed N issues (P pushed back), 0 criticals + verification pass, loop complete" | "0 criticals + verification pass, loop complete" | "Fixed N issues (P pushed back), max iterations reached" | "Fix phase failed: <error>" — whenever the fixer ran, the outcome carries its counts as well as the reason the loop stopped; the bare form is for a round that found nothing to fix at any severity.
**Issues fixed:** [category] [severity] at [location]
**Issues pushed back:** [category] [severity] at [location] — reason
**Issues found (no disposition):** [category] [severity] at [location], or "none"
**Agents:** 1 (reviewer), plus self-reviewer (whenever the fixer ran)
**Self-review:** N found, M fixed (excluded from the counts above)
**Commits added:** fixer_sha, after_sha (or "none")
**Verification:** command1 PASS | command2 REGRESSION | ...
```

## JSON Schema

The review-code JSON schema for `tmp/_reviews_errors/review-code.json`:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["critical_count", "high_count", "coverage", "issues"],
  "properties": {
    "critical_count": { "type": "integer", "minimum": 0 },
    "high_count": { "type": "integer", "minimum": 0 },
    "coverage": {
      "type": "object",
      "additionalProperties": false,
      "required": ["files_in_diff", "files_inspected", "not_inspected"],
      "properties": {
        "files_in_diff": { "type": "integer", "minimum": 0 },
        "files_inspected": { "type": "integer", "minimum": 0 },
        "not_inspected": { "type": "array", "items": { "type": "string" } }
      }
    },
    "issues": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["severity", "category", "location", "confidence", "problem", "suggested_fix"],
        "properties": {
          "severity": { "type": "string", "enum": ["critical", "high", "medium", "low"] },
          "category": { "type": "string", "enum": ["bug", "architecture", "spec-drift", "security", "verification-gap"] },
          "location": { "type": "string" },
          "confidence": { "type": "integer", "minimum": 40, "maximum": 100 },
          "problem": { "type": "string" },
          "suggested_fix": { "type": "string" },
          "origin": { "type": "string", "enum": ["document", "self-review"], "default": "document" }
        }
      }
    }
  }
}
```

`origin` is the only optional per-issue key and the only one permitted beyond the six required; `additionalProperties: false` rejects everything else, including `phase`. It marks findings the round's own self-review pass raised against the fixer's edits, which are reported but not counted — `references/shared-rules/counts-exclude-self-review.md`.

There used to be a second key, `phase`, recording which pass found a finding. It existed only because iterations carried findings forward and reset `origin` at the boundary, destroying that record. Iterations now start fresh, so `origin` is set once and never changes.

Note: `medium_count` and a low count are not in the schema — both are derived from the issues array during validation. `critical_count` and `high_count` ARE trusted, because the validator rejects any file whose declared values disagree with its own array; a document that passes validation has counts equal to the recount by construction. A file that passes validation is internally consistent — its declared counts equal its own recount. That is not a freshness guarantee: `../orchestrate/references/common/error-logs-format.md` states that the gates read this value in flight, not off disk, because the file is rewritten mid-iteration and overwritten by the next one. Consistent is not current.

## Error Handling

| Failure mode | Behavior |
|---|---|
| Agent returns invalid JSON or schema validation fails | Retry review once. Second failure: abort with error. |
| Fix phase fails | Abort the run, status **Error**. Code is left as the fixer left it; say so in the Artifact line. |
| Fix introduces new criticals | Normal loop — next iteration catches them. |
| Git operations fail | Abort with error. |
| Verification command fails | Not an error — data for regression comparison. |
| Max iterations exhausted | Not an Error — status follows the normal rules (Status Logic has no iteration-exhaustion trigger) and the remaining issues are reported. |
| Self-review pass aborts (`ABORT: ` sentinel, crash, or no response) | Restore the `.bak`, print `Warning: self-review aborted — <reason>. Fix results unverified.`, continue. See `references/shared-rules/agent-abort-contract.md`. |

No explicit per-agent timeout. The `--max-iterations` cap prevents runaway loops.
