---
name: review-code
argument-hint: '<commit-count|git-ref> [--against <spec>] [--effort high|xhigh|max] [--max-iterations N] [--verify "<cmd>"] [--run-id <id>]'
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
| `--effort` | max | high, xhigh, max | Reasoning-effort level for the reviewer and fixer |
| `--max-iterations` | 1 | 0-10 | Safety cap (0 = skip, 1 = single-pass) |
| `--verify "<cmd>"` | none | any shell command | Repeatable — verification commands run after each fix |
| `--run-id` | none | string | Prefixes output files for run scoping; optional |
| `--help` | — | — | Print usage and exit |

**Removed flags:** `--max-model` (clean break, no backward-compat shim). The reviewer and fixer inherit the caller's session model; `--effort` pins the reasoning-effort level (default `max`).

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
  --max-iterations N      Safety cap, 0=skip, 1=single-pass  (default: 1)
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
   - Without `--run-id`: `./tmp/_reviews_errors/review-code.json`, `./tmp/_reviews_errors/review-code-summary.md`, `./tmp/_reviews_errors/review-code-fix-report.json`, `./tmp/_reviews_errors/review-code-iteration-*.md`
   - With `--run-id`: `./tmp/_reviews_errors/<run_id>-review-code*.json`, `./tmp/_reviews_errors/<run_id>-review-code*.md`
3. Do NOT delete `./tmp/past-issues-backlog.md` — it is intentionally append-only across runs.

## Pre-Flight Checks

1. `git rev-parse HEAD` succeeds. If not: `"Error: no commits in repository."`
2. If on `main` or `master`: `"Warning: you are on branch 'main'. Fix commits will land here. Continue?"` Print the warning and pause for user confirmation. This is a blocking prompt — the user must explicitly approve. If the skill is invoked programmatically (e.g., from orchestrate), the invoking skill is responsible for branch validation before dispatch.
3. If `git status --porcelain` non-empty: `"Working tree is dirty. Please commit or stash your changes before running review-code."` This check runs once during pre-flight only. Verification command side-effects (coverage reports, cache files) are expected during the loop and do not re-trigger this check. The fixer uses `git add -u` (tracked files only) when committing to avoid including verification artifacts.

## Edge Case: `--max-iterations 0`

Skip the loop entirely. Do not create any files. Print and exit:
```
Review Code Skipped
  Scope: last N commits
  No iterations run. Code was not reviewed.
```

## Edge Case: `--max-iterations 1`

Single-pass mode. The loop runs one iteration: review, stop-check, conditionally fix.

- If the reviewer finds zero criticals, the stop-check runs verification. If verification finds regressions, synthetic criticals are injected and the fix phase runs within the same iteration (followed by one final verification to determine terminal status).
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
    Run: node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-review-json.cjs <output-path>
    Exit 0 → use the printed recount as the authoritative severity counts
    Exit 1 or 2 → retry review once, abort on second failure
    If node is unavailable: fall back to reading the file, and record
      "schema validation not run: node unavailable" under Checks SKIPPED

  STOP CHECK (only when critical_count == 0):
    Run verification commands, compare to baseline
    If no regressions:
      BACKLOG WRITING (all issues as status: found) → tmp/past-issues-backlog.md
      ITERATION LOG → tmp/_reviews_errors/review-code-iteration-N.md
      Jump to Final Report
    If regressions:
      Inject synthetic criticals into tmp/_reviews_errors/review-code.json (append to issues array,
        update critical_count), re-write the file
      Fall through to Fix Phase

  FIX PHASE (when critical_count > 0):
    Dispatch fixer agent (inherits session model; runs at --effort level)
    Fixer commits: "fix(review-code): resolve N issues from iteration M"

  SELF-REVIEW (always, whenever the fix phase ran):
    Scope = the fixer's own commits: git diff $before_sha..$after_sha
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

No final-gate pattern for review-code. Since all rounds use the same single agent, a redundant review-only round on unchanged code adds no value. Verification commands serve as the quality gate instead.

## Reviewer Agent

Single agent, inheriting the caller's session model and running at the `--effort` reasoning level (the skill substitutes `{{EFFORT}}` and the output path `{{OUTPUT_PATH}}` → `tmp/_reviews_errors/[<run_id>-]review-code.json` in `prompts/reviewer.md`). Receives:
- Git diff (up to 3000 lines, strategically trimmed)
- Spec content (if `--against` provided)
- CLAUDE.md (if exists)
- ADRs (scope-based filtering, up to 200 lines)
- Previous iteration findings (if iteration > 1)

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

Single agent, inheriting the caller's session model and running at the `--effort` reasoning level (the skill substitutes `{{EFFORT}}` and `{{FIX_REPORT_PATH}}` → `tmp/_reviews_errors/[<run_id>-]review-code-fix-report.json` in `prompts/coder.md`). Receives:
- All issues grouped by severity
- Verification regressions (if any)
- Spec content (if `--against` provided)

Read `prompts/coder.md` from this skill's directory for dispatch instructions. Edits code, commits with message `fix(review-code): resolve N issues from iteration M`, produces `tmp/_reviews_errors/review-code-fix-report.json`.

## Self-Review Agent

Runs **after the fixer**, in every iteration where the fixer ran. Always on — there is no flag.

**Scope is a git diff.** The fixer commits its own work, so its changes are mechanically identifiable: `git diff $before_sha..$after_sha`. No fix-report region matching is needed — this is the one thing that makes the pass simpler here than in `review-doc`.

**Remit** is the fixer's own changes, on the same categories the reviewer uses: a fix that does not do what its disposition claims, two fixes that contradict each other, a fix that breaks a call site it did not touch, and a fix that is wrong on its own terms.

**It fixes what it finds, exactly once.** Depth 1 — it edits and commits, and the code *it* writes is not re-reviewed within the iteration. The next iteration's reviewer covers it: both scope modes review the full scope since the resolved base, so nothing the self-review pass writes escapes review as long as another iteration runs.

Read `prompts/self-review.md` and dispatch: `Agent(prompt: <self-review-prompt>)`. The dispatch prompt must include the effort level, the fixer's diff range, the fix report path, and the review JSON path.

It appends every defect to the `issues` array with `origin: "self-review"`, following the same synthetic-issue shape the verification regressions use (all six schema-required fields), and commits with `fix(review-code): self-review of iteration M's fixes`.

**Count invariant:** self-review findings are NOT counted in `critical_count` or `high_count` for the iteration that produced them. That iteration both wrote and reviewed those lines, so counting them there reports the loop's own churn as evidence against the code under review — and the endless-loop gate fails a spec at `>1 criticals remaining`. From the next iteration those lines are ordinary code: the reviewer re-reads the full scope and emits anything still wrong in them as `origin: "document"`, counted normally.

The exclusion is **round-local** and flips at the iteration boundary. It is defined once, in `references/shared-rules/counts-exclude-self-review.md`, and shared with `review-doc`.

**Not counted is not not-shown.** Self-review findings print on their own line in the terminal output and appear in the summary. Without that, the loop would have a sanctioned channel for silent degradation.

**Non-obvious consequence, and it is intended.** Because this pass *fixes* what it finds, `found_this_round.critical` in iteration N+1 measures code whose previous iteration's churn has already been cleaned up, rather than code still carrying it. The Next-Round Recommendation and the endless-loop gate therefore gate on the right signal without either being rewritten. Do not "fix" those rules to compensate.

## Verification Commands

- Baseline captured before first iteration: run each `--verify` command **twice**. A command whose two runs disagree on exit code is non-deterministic (flaky) — print `Warning: --verify command '<cmd>' is non-deterministic; excluded from regression detection.` and exclude it from all regression comparison. Record exit codes for the deterministic commands.
- Run after each fix phase.
- Compare to baseline: new non-zero exit = regression.
- Regressions injected as synthetic critical issues with all six schema-required fields: `severity: "critical"`, `category: "bug"`, `location: "<verify-cmd>"`, `confidence: 85`, `problem: "verification regression: <cmd> exit <n>"`, `suggested_fix: "restore <cmd> to passing"`.
- Regression details persist between iterations, passed to both reviewer and fixer.
- Verification command failures are NOT errors — they are data for regression comparison.

## ADR Discovery

Scope-based filtering:
1. Discover ADR index using fallback sequence: `docs/architecture/adrs.md` → `docs/adrs/` → `docs/adr/` → `adr/`. Use first match.
2. Read all `.md` files in the matched directory.
3. Include matched ADRs in reviewer context (within 200-line budget).
4. If total ADR content exceeds 200 lines, truncate to the most recent files (by file modification time, newest first) that fit.
5. If no ADRs found, skip — the Architecture category still applies if CLAUDE.md exists.

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
- **Iteration 1:** resolve the base **once** and keep it — `original_base=$(git rev-parse HEAD~N)` — then `git diff $original_base..HEAD`
  - If `HEAD~N` fails (fewer commits): `original_base=$(git hash-object -t tree /dev/null)`, then `git diff $original_base..HEAD`
- **Iteration 2+:** `git diff $original_base..$after_sha` — always reviews full scope since the resolved base, including prior iteration fixes.
  - `original_base` is the SHA captured at iteration 1 and is **never recomputed**. A literal `HEAD~N` re-evaluated at iteration 2 points somewhere else, because the fixer's commits have moved `HEAD`: the expression silently narrows the scope every iteration and the original implementation is never reviewed again after iteration 1.
  - If the fixer made no commits: `$after_sha` is unchanged and the same command re-reviews the same scope.

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
  Verification: all passing
  Commits added: abc1234, def5678
  Summary: tmp/_reviews_errors/review-code-summary.md
  Full review: tmp/_reviews_errors/review-code.json
  Backlog: tmp/past-issues-backlog.md
```

`Self-review:` reports what the self-review pass found against this run's own fixes. Those findings are excluded from every other count on the screen — `Aggregate`, `Remaining`, `Last round` — because the iteration that wrote those lines both authored and reviewed them. **They are excluded from the counts, never from the output.** Print the line whenever the self-review pass ran, including when it found nothing (`0 found`).

`origin` is the only optional per-issue key and the only one permitted beyond the six required; `additionalProperties: false` still rejects everything else. It defaults to `"document"`. The reviewer emits `"document"`; the self-review pass emits `"self-review"`, and the validator excludes those from the recount. See `references/shared-rules/counts-exclude-self-review.md`.

## Final Report

When the loop completes (criticals zero + verification pass, or max iterations exhausted):
1. Generate `tmp/_reviews_errors/review-code-summary.md` from the last iteration's `tmp/_reviews_errors/review-code.json` (top 10 issues by severity, then descending confidence).
2. Compute aggregate counts from accumulated fix-report data across all iterations (see Cross-Iteration Tracking).
3. Apply status logic (below).
4. Print terminal output.
5. If status is "Approved with suggestions" or "Incomplete", run the Respond to Remaining Issues phase (below).

## Respond to Remaining Issues

**Trigger:** Status is "Approved with suggestions" OR "Incomplete", and issues remain (zero criticals).

Incomplete triggers it too. A finding is real whether or not some *other* file went unread — the coverage hole makes the verdict incomplete, it does not make the findings less true, and suppressing triage would punish the run twice. The status stays Incomplete; only the triage phase is unblocked.

After printing the terminal output, auto-triage each remaining issue from `tmp/_reviews_errors/review-code.json` (sorted by severity descending, then confidence descending). The agent decides autonomously — no user interaction.

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

**When status is "Approved" or "Issues Found":** Skip this phase entirely. "Approved" has nothing to address. "Issues Found" means criticals remain — the loop should have handled them, or max iterations were exhausted (user needs to fix manually).

**When status is "Incomplete":** run the phase, and add one line to its summary naming the files in `coverage.not_inspected`, so a reader knows the triage happened over a partial view. An applied fix could in principle conflict with something in an unopened file; naming them is what makes that risk visible rather than hidden.

## Cross-Iteration Tracking

Orchestrator maintains running counters across iterations:
- `total_fixed` (per-severity: critical, high, medium, low)
- `last_round_fixed` (per-severity: critical, high, medium, low) -- reset before each iteration, tracks only the most recent round (populates "Last round:" line)
- `total_pushed_back` (flat count)

Parse `tmp/_reviews_errors/review-code-fix-report.json` after each fix phase before it is overwritten by the next iteration. Additionally maintains `fix_commit_shas = []` — after each fix phase where `after_sha != before_sha`, append the short SHA. This populates the "Commits added" line in terminal output.

## Verification with `--max-iterations 1`

With a single iteration: if the reviewer finds zero criticals, the stop-check runs verification. If regressions are detected, the orchestrator appends synthetic critical issues to `tmp/_reviews_errors/review-code.json` (update the issues array and `critical_count`), re-writes the file, then continues to the fix phase within the same iteration. After the fix phase, run verification one final time to determine terminal status. The loop then ends (cap reached). If regressions persist, status is "Issues Found." If resolved, apply normal status logic.

## When `--verify` Is Not Provided

If no `--verify` commands are configured, skip verification comparison and treat as no regressions. Terminal output: `Verification: none configured`.

## Status Logic

First match wins:
1. **Error**: loop aborted — includes reviewer output that failed validation twice
2. **Issues Found**: `critical_count > 0` OR verification regressions present
3. **Incomplete**: `coverage.not_inspected` is non-empty
4. **Approved with suggestions**: any high, medium, or low issues remain
5. **Approved**: all other cases

**Incomplete** names the files that were not inspected rather than announcing the run clean. It has exactly one trigger. Output that fails validation resolves to **Error** at rule 1 in both standard and auto mode, so it never reaches rule 3.

## Iteration Log Format

Write to `tmp/_reviews_errors/review-code-iteration-N.md`:

```markdown
# Iteration N

**Model:** inherited from caller session
**Effort:** <--effort value>
**Scope:** last N commits | commits original_base..after_sha | commits <ref>..after_sha
**Issues found:** X critical, Y high, Z medium, W low
**Outcome:** "Fixed N issues (P pushed back), continuing" | "0 criticals + verification pass, loop complete" | "Fix phase failed: <error>"
**Issues fixed:** [category] [severity] at [location]
**Issues pushed back:** [category] [severity] at [location] — reason
**Issues found (no disposition):** [category] [severity] at [location], or "none"
**Commits added:** after_sha (or "none")
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

Note: `medium_count` and a low count are not in the schema — both are derived from the issues array during validation. `critical_count` and `high_count` ARE trusted, because the validator rejects any file whose declared values disagree with its own array; a document that passes validation has counts equal to the recount by construction. Consumers reading these fields off disk (see `orchestrate/references/common/error-logs-format.md`) are therefore safe.

## Error Handling

| Failure mode | Behavior |
|---|---|
| Agent returns invalid JSON or schema validation fails | Retry review once. Second failure: abort with error. |
| Fix introduces new criticals | Normal loop — next iteration catches them. |
| Git operations fail | Abort with error. |
| Verification command fails | Not an error — data for regression comparison. |
| Max iterations exhausted | Stop with "Issues Found" status, report remaining issues. |

No explicit per-agent timeout. The `--max-iterations` cap prevents runaway loops.
