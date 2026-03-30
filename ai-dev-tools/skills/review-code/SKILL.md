---
name: review-code
description: "Use when reviewing recent commits for bugs, architecture violations, spec drift, security issues, and test gaps. Supports single-pass review and iterative review-fix-verify cycles. Invoke with /review-code <commit-count>."
---

# Review Code

Iterative code review with automatic fix cycles. Reviews the last N commits, finds issues, fixes them, and verifies. Repeats until zero criticals and no verification regressions, or max iterations reached. Single agent (max-model throughout) handles both review and fix phases. Tracks verification command regressions and maintains an append-only backlog of all issues found.

## Argument Parsing

```
/review-code <commit-count> [--against <spec-path>] [--max-model <model>] [--max-iterations N] [--effort <level>] [--verify "<cmd>"] [--help]
```

| Flag | Default | Values | Purpose |
|---|---|---|---|
| `--against <spec-path>` | none | any file path | Spec as implementation contract |
| `--max-model` | opus | opus, sonnet, haiku | All phases — reviewer, fixer |
| `--max-iterations` | 1 | 0-10 | Safety cap (0 = skip, 1 = single-pass) |
| `--effort` | high | low, medium, high | Thoroughness level passed to reviewer/fixer |
| `--verify "<cmd>"` | none | any shell command | Repeatable — verification commands run after each fix |
| `--help` | — | — | Print usage and exit |

### `--help` Output

When `--help` is passed, print the following and exit (no review runs):

```
Usage: /review-code <commit-count> [flags]

Iterative code review with automatic fix cycles. Reviews the last N commits,
finds issues, fixes them, and verifies. Repeats until zero criticals or cap.

Flags:
  --against <spec-path>   Spec as implementation contract    (default: none)
  --max-model <model>     Reviewer + fixer model             (default: opus)
  --max-iterations N      Safety cap, 0=skip, 1=single-pass  (default: 1)
  --effort <level>        Thoroughness: low, medium, high    (default: high)
  --verify "<cmd>"        Verification command (repeatable)  (default: none)
  --help                  Print this help and exit

Examples:
  /review-code 3                                     Review last 3 commits
  /review-code 5 --against docs/spec.md              Review against spec
  /review-code 3 --verify "npm test" --verify "npm run lint"  With verification
  /review-code 3 --max-iterations 1                  Single-pass (review + fix)
```

## Setup

1. Ensure `./tmp/` directory exists (create if needed).
2. Delete stale files from prior runs: `./tmp/review.json`, `./tmp/review_summary.md`, `./tmp/fix-report.json`, `./tmp/iteration-*.md`.
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
    Dispatch single reviewer agent at max-model
    Agent produces tmp/review.json directly (no synthesis)

  VALIDATION:
    Recount severities from issues array
    Schema validation (required fields, enum values)
    If invalid JSON or schema fails: retry review once, abort on second failure

  STOP CHECK (only when critical_count == 0):
    Run verification commands, compare to baseline
    If no regressions:
      BACKLOG WRITING (all issues as status: found) → tmp/past-issues-backlog.md
      ITERATION LOG → tmp/iteration-N.md
      Jump to Final Report
    If regressions:
      Inject synthetic criticals into tmp/review.json (append to issues array,
        update critical_count), re-write the file
      Fall through to Fix Phase

  FIX PHASE (when critical_count > 0):
    Dispatch fixer agent at max-model
    Fixer commits: "fix(review-code): resolve N issues from iteration M"

  VERIFICATION (post-fix):
    Run --verify commands, compare to baseline
    Track regressions for next iteration's reviewer and fixer context

  BACKLOG WRITING (with dispositions from fix-report.json) → tmp/past-issues-backlog.md
  ITERATION LOG → tmp/iteration-N.md
```

No final-gate pattern for review-code. Since all rounds already use max-model with the same single agent, a redundant review-only round on unchanged code adds no value. Verification commands serve as the quality gate instead.

## Reviewer Agent

Single agent dispatched at `max-model`. Receives:
- Git diff (up to 3000 lines, strategically trimmed)
- Spec content (if `--against` provided)
- CLAUDE.md (if exists)
- ADRs (scope-based filtering, up to 200 lines)
- Previous iteration findings (if iteration > 1)

Read `prompts/reviewer.md` from this skill's directory for dispatch instructions. The reviewer writes `tmp/review.json` directly using the Write tool. The reviewer prompt includes the review-code JSON schema so the agent produces valid structured output. The orchestrator validates the output in the Validation step.

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

Single agent dispatched at `max-model`. Receives:
- All issues grouped by severity
- Verification regressions (if any)
- Spec content (if `--against` provided)

Read `prompts/coder.md` from this skill's directory for dispatch instructions. Edits code, commits with message `fix(review-code): resolve N issues from iteration M`, produces `tmp/fix-report.json`.

## Verification Commands

- Baseline captured before first iteration (run all `--verify` commands, record exit codes).
- Run after each fix phase.
- Compare to baseline: new non-zero exit = regression.
- Regressions injected as synthetic critical issues (`category: "bug"`, `severity: "critical"`, `confidence: 85`).
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
1. Read `ai-dev-tools/references/backlog-entry-format.md` for the entry template.
2. If `./tmp/past-issues-backlog.md` does not exist, create it with the standard header.
3. Cross-reference with `tmp/fix-report.json` for dispositions (`fixed`, `deferred`, `pushed-back`).
4. On stop-check iterations (no fix phase): all issues recorded as `status: found`.
5. On abort: record all issues as `status: found` with warning.
6. `Source: review-code` for all entries.
7. No deduplication (intentional — repetition signals difficulty for downstream pattern mining).

## Diff Scope per Iteration

- **Iteration 1:** `git diff HEAD~N..HEAD`. If `HEAD~N` fails (fewer commits than requested), fall back to empty tree: `git diff $(git hash-object -t tree /dev/null)..HEAD`.
- **Iteration 2+:** `git diff $before_sha..$after_sha`. If the fixer made no commits, re-review the original scope.

## Output Artifacts

| File | Purpose | Consumer |
|---|---|---|
| `tmp/review.json` | Structured JSON from last iteration | Machines |
| `tmp/review_summary.md` | Curated human summary (max 10 items + aggregates) | Humans |
| `tmp/fix-report.json` | Coder dispositions per issue | Orchestrator |
| `tmp/past-issues-backlog.md` | Full issue history across iterations | Pattern mining |
| `tmp/iteration-N.md` | Per-iteration log | Debugging, audit |

## Review Summary Format

Generate `tmp/review_summary.md` using this template:

```markdown
# Review Summary

**Date:** YYYY-MM-DD HH:MM
**Scope:** last N commits
**Against:** <spec-path or "standalone">
**Status:** Approved | Approved with suggestions | Issues Found
**Iterations:** N/M

## Aggregate
X Critical fixed | Y High fixed | Z Medium fixed
Remaining: A Critical | B High | C Medium
Deferred: D | Pushed back: P

## Verification
command1: PASS
command2: PASS

## Remaining Issues (top 10 by severity)

### 1. [Title]
**Severity:** high | **Category:** bug | **Location:** src/auth.ts:42
**Problem:** ...
**Status:** deferred — reason

[... up to 10 items]
```

## Terminal Output

Print the following when the loop completes:

```
Review Code Complete
  Scope: last N commits against <spec or "standalone">
  Iterations: N/M
  Status: Approved with suggestions
  Aggregate: 8 Critical fixed | 5 High fixed | 3 Medium fixed
  Remaining: 0 Critical | 2 High | 1 Medium
  Verification: all passing
  Commits added: abc1234, def5678
  Summary: tmp/review_summary.md
  Full review: tmp/review.json
  Backlog: tmp/past-issues-backlog.md
```

## Final Report

When the loop completes (criticals zero + verification pass, or max iterations exhausted):
1. Generate `tmp/review_summary.md` from the last iteration's `tmp/review.json` (top 10 issues by severity, then descending confidence).
2. Compute aggregate counts from accumulated fix-report data across all iterations (see Cross-Iteration Tracking).
3. Apply status logic (below).
4. Print terminal output.
5. If status is "Approved with suggestions", run the Respond to Remaining Issues phase (below).

## Respond to Remaining Issues

**Trigger:** Status is "Approved with suggestions" (high/medium issues remain, zero criticals).

After printing the terminal output, present each remaining issue from `tmp/review.json` (sorted by severity descending, then confidence descending) and ask the user to categorize:

```
── Remaining Issues ────────────────────────────
N issues to address (H high, M medium).

For each issue:
  [A] Apply — fix this issue now
  [D] Defer — skip, record reason
  [P] Push back — dispute finding, record reason
  [S] Skip all remaining — defer all without individual review

Issue 1/N: [severity] [category] at [location]
  Problem: <problem text>
  Suggested fix: <fix text>

  [A/D/P/S]?
```

**Behavior per choice:**
- **[A] Apply:** Apply the suggested fix directly. Use the same approach as the fixer agent — edit the file, verify the change doesn't break anything (run `--verify` commands if configured). After all applied fixes, commit with: `fix(review-code): apply N review suggestions`.
- **[D] Defer:** Record to `tmp/response_analysis.md` with reason (prompt: "Reason for deferring?"). Update `tmp/review_summary.md` status to "deferred — {reason}".
- **[P] Push back:** Record to `tmp/response_analysis.md` with reason (prompt: "Reason for pushing back?"). Update `tmp/review_summary.md` status to "pushed back — {reason}".
- **[S] Skip all:** Defer all remaining issues with reason "Batch deferred by user". Record each to `tmp/response_analysis.md`.

After all issues are processed, update `tmp/review_summary.md` with final dispositions and reprint the terminal output with updated counts.

**Response analysis format:** Write to `tmp/response_analysis.md` (overwrite — no need to read first):

```markdown
## Review-Code Response — <date>

### [N] — [Issue title derived from problem]
**Status:** Applied | Deferred | Pushed back

**[If Applied]**
Change: what was changed and where

**[If Deferred]**
Reason: user's reason

**[If Pushed back]**
Reason: user's reason

---
```

**When status is "Approved" or "Issues Found":** Skip this phase entirely. "Approved" has nothing to address. "Issues Found" means criticals remain — the loop should have handled them, or max iterations were exhausted (user needs to fix manually).

## Cross-Iteration Tracking

Orchestrator maintains running counters across iterations:
- `total_fixed` (per-severity: critical, high, medium)
- `total_deferred` (flat count)
- `total_pushed_back` (flat count)

Parse `tmp/fix-report.json` after each fix phase before it is overwritten by the next iteration. Additionally maintains `fix_commit_shas = []` — after each fix phase where `after_sha != before_sha`, append the short SHA. This populates the "Commits added" line in terminal output.

## Verification with `--max-iterations 1`

With a single iteration: if the reviewer finds zero criticals, the stop-check runs verification. If regressions are detected, the orchestrator appends synthetic critical issues to `tmp/review.json` (update the issues array and `critical_count`), re-writes the file, then continues to the fix phase within the same iteration. After the fix phase, run verification one final time to determine terminal status. The loop then ends (cap reached). If regressions persist, status is "Issues Found." If resolved, apply normal status logic.

## When `--verify` Is Not Provided

If no `--verify` commands are configured, skip verification comparison and treat as no regressions. Terminal output: `Verification: none configured`.

## Status Logic

First match wins:
1. **Error**: loop aborted
2. **Issues Found**: `critical_count > 0` OR verification regressions present
3. **Approved with suggestions**: high/medium issues remain
4. **Approved**: all other cases

## Iteration Log Format

Write to `tmp/iteration-N.md`:

```markdown
# Iteration N

**Reviewer model:** max-model
**Fixer model:** max-model
**Scope:** last N commits | commits before_sha..after_sha
**Issues found:** X critical, Y high, Z medium
**Outcome:** "Fixed N issues (D deferred, P pushed back), continuing" | "0 criticals + verification pass, loop complete" | "Fix phase failed: <error>"
**Issues fixed:** [category] [severity] at [location]
**Issues deferred:** [category] [severity] at [location] — reason
**Issues pushed back:** [category] [severity] at [location] — reason
**Issues found (no disposition):** [category] [severity] at [location], or "none"
**Commits added:** after_sha (or "none")
**Verification:** command1 PASS | command2 REGRESSION | ...
```

## JSON Schema

The review-code JSON schema for `tmp/review.json`:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["critical_count", "high_count", "issues"],
  "properties": {
    "critical_count": { "type": "integer", "minimum": 0 },
    "high_count": { "type": "integer", "minimum": 0 },
    "issues": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["severity", "category", "location", "confidence", "problem", "suggested_fix"],
        "properties": {
          "severity": { "type": "string", "enum": ["critical", "high", "medium"] },
          "category": { "type": "string", "enum": ["bug", "architecture", "spec-drift", "security", "test-gap"] },
          "location": { "type": "string" },
          "confidence": { "type": "integer", "minimum": 40, "maximum": 100 },
          "problem": { "type": "string" },
          "suggested_fix": { "type": "string" }
        }
      }
    }
  }
}
```

Note: `medium_count` is not in the schema. It is always derived from the issues array during the validation step. The `critical_count` and `high_count` fields exist for backward compatibility but are never trusted — they are recounted from the issues array.

## Error Handling

| Failure mode | Behavior |
|---|---|
| Agent returns invalid JSON or schema validation fails | Retry review once. Second failure: abort with error. |
| Fix introduces new criticals | Normal loop — next iteration catches them. |
| Git operations fail | Abort with error. |
| Verification command fails | Not an error — data for regression comparison. |
| Max iterations exhausted | Stop with "Issues Found" status, report remaining issues. |

No explicit per-agent timeout. The `--max-iterations` cap prevents runaway loops.
