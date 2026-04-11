# Review Performance Optimization Design

**Date:** 2026-03-29
**Status:** Draft
**Scope:** Rewrite `review-doc`, `review-doc-ralph`, `review-code`, `review-code-ralph` into 2 unified skills

## Problem

The current review skills take 25-45 minutes per review cycle. Four separate skills (review-doc, review-doc-ralph, review-code, review-code-ralph) create maintenance burden and confusion. Codex CLI dependency adds complexity without proportional value. Agent subprocesses misuse Bash for file operations (grep, ls, cat, find, wc), triggering repeated security permission prompts that block unattended operation.

## Solution

1. Merge 4 skills into 2: `review-doc` (absorbs review-doc-ralph) and `review-code` (absorbs review-code-ralph).
2. Remove all Codex CLI dependency.
3. Introduce three-tier model system for review-doc: `mid-model` (Sonnet) for early review rounds, `max-model` (Opus) for final review and fixing, `min-model` (Haiku) for synthesis.
4. Use `max-model` throughout for review-code (code needs Opus-level reasoning).
5. Add agent tool constraints to eliminate security permission prompts.
6. Produce curated human-readable summary (max 10 items + aggregates).

## Unified review-doc

### Argument Parsing

```
/review-doc <doc-path> [--against <ref-path>] [--max-model <model>] [--mid-model <model>] [--min-model <model>] [--max-iterations N] [--effort <level>] [--help]
```

| Flag | Default | Values | Purpose |
|---|---|---|---|
| `--against <ref-path>` | none | any file path | Reference document for cross-checking |
| `--max-model` | opus | opus, sonnet, haiku | Fixer, final review round (3 agents) |
| `--mid-model` | sonnet | opus, sonnet, haiku | Early review rounds (2 agents) |
| `--min-model` | haiku | opus, sonnet, haiku | Synthesis (dedup/filter/count) |
| `--max-iterations` | 4 | 0-10 | Safety cap (0 = skip, 1 = single-pass) |
| `--effort` | high | low, medium, high | Thoroughness level passed to all agents |
| `--help` | — | — | Print usage and exit |

### `--help` Output

When `--help` is passed, print the following and exit (no review runs):

```
Usage: /review-doc <doc-path> [flags]

Iterative document review with model tiering. Dispatches parallel agents to
check completeness, fact-check against codebase, and audit implementability.
Fixes issues automatically between rounds until zero criticals remain.

Flags:
  --against <ref-path>    Reference document for cross-checking (default: none)
  --max-model <model>     Fixer + final review round        (default: opus)
  --mid-model <model>     Early review rounds                (default: sonnet)
  --min-model <model>     Synthesis agent                    (default: haiku)
  --max-iterations N      Safety cap, 0=skip, 1=single-pass  (default: 4)
  --effort <level>        Thoroughness: low, medium, high    (default: high)
  --help                  Print this help and exit

Examples:
  /review-doc docs/spec.md                          Single-pass review (backward compat)
  /review-doc docs/spec.md --max-iterations 3       Iterative review, up to 3 rounds
  /review-doc docs/spec.md --against docs/plan.md   Review against reference document
  /review-doc docs/spec.md --mid-model haiku        Faster early rounds (lower quality)
```

### Setup

1. Ensure `./tmp/` directory exists (create if needed).
2. Delete stale files from prior runs: `./tmp/review.json`, `./tmp/review_summary.md`, `./tmp/fix-report.json`, `./tmp/iteration-*.md`.

### Pre-Flight Checks

1. Validate `<doc-path>` exists. If not: `"Error: document not found: <doc-path>"`
2. If `--against` provided, validate `<ref-path>` exists. If not: `"Error: reference document not found: <ref-path>"`

### Edge Case: `--max-iterations 0`

Skip the loop entirely. Do not create any files (no review.json, no iteration logs). Print and exit:
```
Review Doc Skipped
  Reviewed: <doc-path>
  No iterations run. Document was not reviewed.
```

### Edge Case: `--max-iterations 1`

Single-pass mode (backward compatible with old `/review-doc`). Use the final-gate configuration directly: dispatch 3 agents at max-model (completeness + fact-checker + implementability), synthesize with min-model. No fix phase. This preserves the quality of the old 3-agent Opus single-pass review.

### Iteration Flow

**Guard:** If `max_iterations == 1`, skip the loop below. Instead, treat the single pass as a final-gate round: dispatch 3 agents at max-model, synthesize with min-model, no fix phase. Jump directly to Final Report. The pseudocode below applies only when `max_iterations >= 2`.

**State:** The orchestrator maintains `is_final_gate = false` before the loop.

```
While iteration <= max_iterations OR is_final_gate:

  REVIEW PHASE:
    If NOT is_final_gate:
      Dispatch 2 agents at mid-model (completeness + implementability)
      Synthesize with min-model → tmp/review.json
    If is_final_gate:
      Dispatch 3 agents at max-model (completeness + fact-checker + implementability)
      Synthesize with min-model → tmp/review.json

  VALIDATION:
    Recount severities from issues array (do not trust counts from JSON)

  STOP CHECK:
    If critical_count == 0 AND NOT is_final_gate:
      Set is_final_gate = true, continue to next iteration
    If is_final_gate (regardless of critical_count):
      Jump to Final Report — the final gate is always terminal.
      If criticals remain, status will be "Issues Found".

  FIX PHASE (skipped when is_final_gate):
    Dispatch fixer at max-model
    Hash verification (before/after)
    Fix-report.json with dispositions

  ITERATION LOG → tmp/iteration-N.md
  iteration += 1
```

The final-gate round is review-only — no fix phase. It is the Opus quality pass on the cleanest version of the document. The final gate is exempt from the `--max-iterations` cap: if criticals reach zero at iteration N == max_iterations, the final gate still runs as iteration N+1. Terminal output reports this as e.g. "5/4" (5 iterations with cap of 4). This ensures the fact-checker always runs on the final document regardless of when criticals converge.

### Agent Dispatch (Early Rounds — mid-model)

All `agents/` and `prompts/` paths in this spec are relative to the skill's root directory (e.g., `ai-dev-tools/skills/review-doc/`). The orchestrator dispatches each agent using the Agent tool with the appropriate `model` parameter: `model: "sonnet"` for mid-model rounds, `model: "opus"` for max-model rounds, `model: "haiku"` for min-model synthesis.

Two agents dispatched in parallel at `mid-model` (`Agent(prompt: <prompt>, model: "sonnet")`):
- **Completeness & Consistency Reviewer** — read from `agents/completeness-reviewer.md`
- **Implementability Auditor** — read from `agents/implementability-auditor.md`

No fact-checker in early rounds. Early rounds focus on structural/completeness issues that Sonnet handles well. Fact-checking on a noisy early draft wastes time — stale references found in round 1 may get fixed by round 2.

### Agent Dispatch (Final Gate — max-model)

Three agents dispatched in parallel at `max-model`:
- **Completeness & Consistency Reviewer** — `agents/completeness-reviewer.md`
- **Codebase Fact-Checker** — `agents/codebase-fact-checker.md`
- **Implementability Auditor** — `agents/implementability-auditor.md`

All three agents run at Opus for maximum depth on the cleaned document.

### Synthesis

Read the synthesis agent prompt from `agents/synthesis.md` before dispatching. Dispatched as a single Agent at `min-model`. The synthesis agent receives the combined raw markdown findings from all review agents as conversation context (not a file), plus `is_final_gate: true/false` in the dispatch prompt. The agent writes `tmp/review.json` using the Write tool. Performs:
1. Deduplicate — same location AND same underlying deficiency
2. Filter — drop findings with confidence < 40
3. Categorize by severity — >= 80 critical, 60-79 high, 40-59 medium
4. If `is_final_gate` is true: convert fact-checker verdicts to issue objects with `category: "fact-check"`, `location` from the claim's document section, `problem` from the claim text + evidence, `suggested_fix` from the correction. Map verdict to confidence: INACCURATE → 85 (critical), STALE → 70 (high), PARTIALLY ACCURATE → 50 (medium). ACCURATE verdicts are not converted to issues — they appear in `fact_check_claims` only. If `is_final_gate` is false: skip this step, set `fact_check_claims: []` and `fact_check_accuracy: 100`.
5. Cap at 20 — critical + high first, then medium by descending confidence. If critical + high exceed 20, raise the cap to include all of them (criticals and highs are never dropped). The Final Report's summary takes the top 10 from this capped set.
6. If `is_final_gate` is true: compute fact_check_accuracy — `(accurate + 0.5 * partially_accurate) / total * 100`. Otherwise: already set to 100 in step 4.
7. Write `tmp/review.json`

### Fixer

Dispatched as a single Agent at `max-model`. The orchestrator reads `tmp/review.json`, extracts all issues grouped by severity, and includes them in the Agent dispatch prompt as conversation context (matching the existing claude-coder.md pattern). Receives:
- All issues grouped by severity (critical first, then high, then medium) — injected via conversation context
- The document path
- Reference document path (if `--against` provided)

The fixer reads the document content using the Read tool (not passed via dispatch context). This matches the existing claude-coder.md pattern where the fixer reads the file to understand context around each issue before editing.

Edits the document using the Edit tool for targeted fixes. Uses Write tool only for creating new files (like `tmp/fix-report.json`). Produces `tmp/fix-report.json` with dispositions for every issue:
- `fixed` — issue resolved
- `deferred` — out of scope, with reason
- `pushed-back` — reviewer finding is incorrect, with reason

### Hash Verification

Before fix phase: `sha256sum '<doc-path>' | cut -d' ' -f1`
After fix phase: same command, compare values.
If unchanged: `[ralph] Warning: document was not modified. Proceeding to next review.`

### Output Artifacts

| File | Purpose | Consumer |
|---|---|---|
| `tmp/review.json` | Structured JSON from last iteration | `/respond-to-review`, machines |
| `tmp/review_summary.md` | Curated human summary (max 10 items + aggregates) | Humans |
| `tmp/fix-report.json` | Coder dispositions per issue | Orchestrator (iteration log) |
| `tmp/iteration-N.md` | Per-iteration log | Debugging, audit |

### Review Summary Format (`tmp/review_summary.md`)

```markdown
# Review Summary

**Date:** YYYY-MM-DD HH:MM
**Reviewed:** <doc-path>
**Against:** <ref-path or "standalone">
**Status:** Approved | Approved with suggestions | Issues Found
**Iterations:** N/M

## Aggregate
X Critical fixed | Y High fixed | Z Medium fixed
Remaining: A Critical | B High | C Medium
Deferred: D | Pushed back: P

## Fact-Check Accuracy
X/Y verifiable claims accurate (Z%)

## Remaining Issues (top 10 by severity)

### 1. [Title]
**Severity:** high | **Category:** completeness | **Location:** Section 3.2
**Problem:** ...
**Status:** deferred — reason

[... up to 10 items]
```

### Terminal Output

```
Review Doc Complete
  Reviewed: <doc-path>
  Against: <ref-path or "standalone">
  Iterations: N/M
  Status: Approved with suggestions
  Aggregate: 8 Critical fixed | 5 High fixed | 3 Medium fixed
  Remaining: 0 Critical | 2 High | 1 Medium
  Fact-check: X/Y claims accurate (Z%)
  Summary: tmp/review_summary.md
  Full review: tmp/review.json
```

### Final Report

When the loop completes (final gate passes or max iterations exhausted):
1. The orchestrator (SKILL.md) generates `tmp/review_summary.md` directly — no agent dispatch needed. Read `tmp/review.json`, extract the top 10 issues by severity (then descending confidence) from the capped 20.
2. Compute aggregate counts from accumulated fix-report data across all iterations (see Cross-Iteration Tracking).
3. Apply status logic (below).
4. Print terminal output.

### Backlog Writing

review-doc does NOT write to `tmp/past-issues-backlog.md`. Document reviews produce section-level locations (e.g., "Section 3.2"), not code-level locations (e.g., "src/auth.ts:42"). The backlog format is designed for code findings. Deferred/pushed-back doc review items are recorded in iteration logs and the review summary only.

### Cross-Iteration Tracking

The orchestrator maintains the following state across the loop:
- `total_fixed = {critical: 0, high: 0, medium: 0}` — per-severity breakdown (populates "X Critical fixed | Y High fixed | Z Medium fixed")
- `total_deferred = 0` — flat count (populates "Deferred: D")
- `total_pushed_back = 0` — flat count (populates "Pushed back: P")

After each fix phase, parse `tmp/fix-report.json`: for each disposition with `action: "fixed"`, look up the issue's severity in `tmp/review.json` and increment `total_fixed[severity]`. For `deferred` and `pushed-back`, increment the flat counter. Update counters before the file is overwritten in the next iteration. These aggregates populate the review summary and terminal output.

### Status Logic

First match wins:
1. **Issues Found**: `critical_count > 0` OR `fact_check_accuracy < 75`
2. **Approved with suggestions**: `fact_check_accuracy < 90` OR high/medium issues remain
3. **Approved**: all other cases

### Iteration Log Format (`tmp/iteration-N.md`)

```markdown
# Iteration N

**Reviewer model:** mid-model or max-model
**Agents:** 2 (completeness + implementability) or 3 (+ fact-checker)
**Fixer model:** max-model (or "N/A — final gate, review only")
**Issues found:** X critical, Y high, Z medium
**Outcome:** "Fixed N issues (D deferred, P pushed back), continuing" | "0 criticals, final gate triggered" | "0 criticals, loop complete" | "Fix phase failed: <error>"
**Issues fixed:** [category] [severity] at [location]
**Issues deferred:** [category] [severity] at [location] — reason
**Issues pushed back:** [category] [severity] at [location] — reason
**Issues found (no disposition):** [category] [severity] at [location], or "none"
```

---

## Unified review-code

### Argument Parsing

```
/review-code <commit-count> [--against <spec-path>] [--max-model <model>] [--max-iterations N] [--effort <level>] [--verify "<cmd>"] [--help]
```

| Flag | Default | Values | Purpose |
|---|---|---|---|
| `--against <spec-path>` | none | any file path | Spec as implementation contract |
| `--max-model` | opus | opus, sonnet, haiku | All phases — reviewer, fixer |
| `--max-iterations` | 4 | 0-10 | Safety cap (0 = skip, 1 = single-pass) |
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
  --max-iterations N      Safety cap, 0=skip, 1=single-pass  (default: 4)
  --effort <level>        Thoroughness: low, medium, high    (default: high)
  --verify "<cmd>"        Verification command (repeatable)  (default: none)
  --help                  Print this help and exit

Examples:
  /review-code 3                                     Review last 3 commits
  /review-code 5 --against docs/spec.md              Review against spec
  /review-code 3 --verify "npm test" --verify "npm run lint"  With verification
  /review-code 3 --max-iterations 1                  Single-pass, no fixes
```

No `--mid-model` or `--min-model` — code review uses `max-model` throughout because:
- Single reviewer agent (no ensemble to compensate for a weaker model)
- Code review requires Opus-level reasoning for subtle bugs
- No synthesis step (single agent produces JSON directly)

### Setup

1. Ensure `./tmp/` directory exists (create if needed).
2. Delete stale files from prior runs: `./tmp/review.json`, `./tmp/review_summary.md`, `./tmp/fix-report.json`, `./tmp/iteration-*.md`.
3. Do NOT delete `./tmp/past-issues-backlog.md` — it is intentionally append-only across runs.

### Pre-Flight Checks

1. `git rev-parse HEAD` succeeds. If not: `"Error: no commits in repository."`
2. If on `main` or `master`: `"Warning: you are on branch 'main'. Fix commits will land here. Continue?"` Print the warning and pause for user confirmation. This is a blocking prompt — the user must explicitly approve. If the skill is invoked programmatically (e.g., from orchestrate), the invoking skill is responsible for branch validation before dispatch.
3. If `git status --porcelain` non-empty: `"Working tree is dirty. Please commit or stash your changes before running review-code."` This check runs once during pre-flight only. Verification command side-effects (coverage reports, cache files) are expected during the loop and do not re-trigger this check. The fixer uses `git add -u` (tracked files only) when committing to avoid including verification artifacts.

### Edge Case: `--max-iterations 0`

Skip the loop entirely. Do not create any files. Print and exit:
```
Review Code Skipped
  Scope: last N commits
  No iterations run. Code was not reviewed.
```

### Edge Case: `--max-iterations 1`

Single-pass mode (backward compatible with old `/review-code`). The loop runs one iteration: review → stop-check → conditionally fix. If the reviewer finds zero criticals, the stop-check runs verification. If verification finds regressions, synthetic criticals are injected and the fix phase runs within the same iteration (followed by one final verification to determine terminal status). If the reviewer finds criticals, the normal fix phase runs. In either case, the loop ends after iteration 1. This is review+fix behavior, which differs from old `/review-code` (review-only) — the backward compat table reflects this: old single-pass users get the same review, plus automatic fixing if issues are found.

### Iteration Flow

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

### Reviewer Agent

Single agent dispatched at `max-model`. Receives:
- Git diff (up to 3000 lines, strategically trimmed)
- Spec content (if `--against` provided)
- CLAUDE.md (if exists)
- ADRs (scope-based filtering, up to 200 lines)
- Previous iteration findings (if iteration > 1)

Writes `tmp/review.json` directly using the Write tool. The reviewer prompt must include the review-code JSON schema so the agent produces valid structured output. The orchestrator validates the output in the Validation step.

### Context Budgets

- **Git diff:** 3000 lines max. If over: include `git diff --stat` always (doesn't count against budget), use `git diff --numstat` for per-file line counts, sort by total changes descending, greedily include full diffs largest-first until budget exceeded, remainder as stat-only summaries.
- **Stat-only file coverage:** The reviewer prompt must include: "For files shown as stat-only summaries, use Read to inspect the changed files. Do not skip files just because their full diff was not included." This ensures the reviewer doesn't ignore files that fell outside the 3000-line budget.
- **ADRs:** 200 lines max. Truncate to most recent files by modification time (newest first).

### Fixer Agent

Single agent dispatched at `max-model`. Receives:
- All issues grouped by severity
- Verification regressions (if any)
- Spec content (if `--against` provided)

Edits code, commits with message `fix(review-code): resolve N issues from iteration M`, produces `tmp/fix-report.json`.

### Verification Commands

- Baseline captured before first iteration (run all `--verify` commands, record exit codes)
- Run after each fix phase
- Compare to baseline: new non-zero exit = regression
- Regressions injected as synthetic critical issues (`category: "bug"`, `severity: "critical"`, `confidence: 85`)
- Regression details persist between iterations, passed to both reviewer and fixer
- Verification command failures are NOT errors — they are data for regression comparison

### ADR Discovery

Scope-based filtering kept from current review-code-ralph (the simpler approach is intentional — the base review-code's richer algorithm with frontmatter parsing and status filtering is not carried forward; the iterative loop catches what the richer upfront filtering would have caught):
- Discover ADR index using fallback sequence: `docs/architecture/adrs.md` → `docs/adrs/` → `docs/adr/` → `adr/`. Use first match.
- Read all `.md` files in the matched directory
- Include matched ADRs in reviewer context (within 200-line budget)

### Backlog Writing

Kept from current review-code-ralph:
- Append all issues to `tmp/past-issues-backlog.md` after each iteration
- Cross-reference with `tmp/fix-report.json` for dispositions
- Read entry template from `ai-dev-tools/references/backlog-entry-format.md`
- Use `Source: review-code` for all entries
- No deduplication (intentional — repetition signals difficulty)
- On stop-check iterations (no fix phase): all issues recorded as `status: found`
- On abort: record all issues as `status: found` with warning

### Output Artifacts

| File | Purpose | Consumer |
|---|---|---|
| `tmp/review.json` | Structured JSON from last iteration | Machines |
| `tmp/review_summary.md` | Curated human summary (max 10 items + aggregates) | Humans |
| `tmp/fix-report.json` | Coder dispositions per issue | Orchestrator |
| `tmp/past-issues-backlog.md` | Full issue history across iterations | Pattern mining |
| `tmp/iteration-N.md` | Per-iteration log | Debugging, audit |

### Review Summary Format (`tmp/review_summary.md`)

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

### Terminal Output

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

### Diff Scope per Iteration

- **Iteration 1:** Diff the last `<commit-count>` commits (`git diff HEAD~N..HEAD`).
- **Iteration 2+:** Diff only the fix commits from the previous iteration (`git diff $before_sha..$after_sha`). If the fixer made no commits, re-review the original scope.

### Final Report

When the loop completes (criticals zero + verification pass, or max iterations exhausted):
1. Generate `tmp/review_summary.md` from the last iteration's `tmp/review.json` (top 10 issues by severity, then descending confidence).
2. Compute aggregate counts from accumulated fix-report data across all iterations (see Cross-Iteration Tracking).
3. Apply status logic (below).
4. Print terminal output.

### Cross-Iteration Tracking

Same mechanism as review-doc: orchestrator maintains running `total_fixed` (per-severity), `total_deferred` (flat), `total_pushed_back` (flat) counters. Parse `tmp/fix-report.json` after each fix phase before it's overwritten. Additionally maintains `fix_commit_shas = []` — after each fix phase where `after_sha != before_sha`, append the short SHA. This populates the "Commits added" line in terminal output.

### Verification with `--max-iterations 1`

With a single iteration: if the reviewer finds zero criticals, the stop-check runs verification. If regressions are detected, the orchestrator appends synthetic critical issues to `tmp/review.json` (update the issues array and `critical_count`), re-writes the file, then continues to the fix phase within the same iteration. After the fix phase, run verification one final time to determine terminal status. The loop then ends (cap reached). If regressions persist, status is "Issues Found." If resolved, apply normal status logic.

### When `--verify` Is Not Provided

If no `--verify` commands are configured, skip verification comparison and treat as no regressions. Terminal output: `Verification: none configured`.

### Status Logic

First match wins:
1. **Error**: loop aborted
2. **Issues Found**: `critical_count > 0` OR verification regressions present
3. **Approved with suggestions**: high/medium issues remain
4. **Approved**: all other cases

### Iteration Log Format (`tmp/iteration-N.md`)

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

---

## Agent Tool Constraints

### `--effort` Semantics

The `--effort` flag is included as `effort: <level>` in each agent's dispatch prompt. Agent prompts interpret it as:
- `low` — check only critical-severity issues, skip thorough cross-referencing
- `medium` — check critical + high-severity concerns
- `high` (default) — full review, all severity levels

### Tool Usage Rules

Added to every agent prompt file (reviewer agents, fixer agents, synthesis agent):

```
## Tool Usage Rules
- Use Grep (not grep/rg via Bash) for searching file contents
- Use Glob (not find/ls via Bash) for finding files by pattern
- Use Read (not cat/head/tail via Bash) for reading file contents
- Use Write (not echo/cat heredoc via Bash) for writing files
- Do not use Bash for file operations — only for git log, git diff, git status commands
- Do not use Bash with newline-separated commands, $() substitution, or shell expansion in paths
- NEVER run git push, git checkout, git switch, git branch -d/-D, or any command that modifies or switches branches
- NEVER run destructive git commands (reset --hard, clean -f)
```

This eliminates the following permission prompts:
- "Command contains newlines" — no multi-command bash
- "Quote characters inside # comment" — no echo with special chars
- "$() command substitution" — no $(cat file) or $(wc -l)
- "Locale quoting" — no $'...' ANSI-C quoting
- "Shell expansion in paths" — no *.ts glob in bash args
- ls, grep -rn, wc -l — replaced by Glob, Grep, Read

---

## JSON Schemas

### review-doc Schema

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["critical_count", "high_count", "issues", "fact_check_accuracy", "fact_check_claims"],
  "properties": {
    "critical_count": { "type": "integer", "minimum": 0 },
    "high_count": { "type": "integer", "minimum": 0 },
    "fact_check_accuracy": { "type": "integer", "minimum": 0, "maximum": 100 },
    "fact_check_claims": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["claim", "verdict"],
        "properties": {
          "claim": { "type": "string" },
          "verdict": { "type": "string", "enum": ["ACCURATE", "INACCURATE", "PARTIALLY ACCURATE", "STALE"] }
        }
      }
    },
    "issues": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["severity", "category", "location", "confidence", "problem", "suggested_fix"],
        "properties": {
          "severity": { "type": "string", "enum": ["critical", "high", "medium"] },
          "category": { "type": "string", "enum": [
            "completeness", "consistency", "scope", "structure",
            "fact-check", "vague-action", "vague-step",
            "dependency-gap", "ordering-issue", "agent-pitfall",
            "missing-criteria", "cross-reference"
          ]},
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

Note: `fact_check_claims` is only populated on the final-gate round (when fact-checker runs). On early rounds (no fact-checker), set `fact_check_claims: []` and `fact_check_accuracy: 100`.

### review-code Schema

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

Note: Neither schema includes `medium_count`. This is intentional — `medium_count` is always derived from the issues array during the validation step ("Recount severities from issues array"). The `critical_count` and `high_count` fields exist for backward compatibility with the existing schema but are never trusted.

---

## Files to Delete

| File | Reason |
|---|---|
| `ai-dev-tools/skills/review-doc-ralph/` (entire directory) | Merged into review-doc |
| `ai-dev-tools/skills/review-code-ralph/` (entire directory) | Merged into review-code |
| `ai-dev-tools/skills/review-doc/prompts/codex-reviewer.md` | Codex removed |
| `ai-dev-tools/skills/review-code/prompts/codex-reviewer.md` (if exists) | Codex removed |

Note: Content from ralph skills is merged into the base skills, not lost.

## Files to Create/Modify

| File | Change |
|---|---|
| `ai-dev-tools/skills/review-doc/SKILL.md` | Full rewrite — merge ralph, model tiering, remove Codex |
| `ai-dev-tools/skills/review-code/SKILL.md` | Full rewrite — merge ralph, remove Codex |
| `ai-dev-tools/skills/review-doc/prompts/reviewer.md` | New file — based on `review-doc-ralph/prompts/claude-reviewer.md`, rewritten for model tiering (2-agent vs 3-agent dispatch, separate synthesis agent) |
| `ai-dev-tools/skills/review-doc/prompts/coder.md` | New file — based on `review-doc-ralph/prompts/claude-coder.md`, add tool constraints |
| `ai-dev-tools/skills/review-code/prompts/reviewer.md` | New file — based on `review-code-ralph/prompts/claude-reviewer.md`, rewritten for unified review-code (single agent, add stat-only file coverage instruction). Must use the updated review-code schema (without `fact_check_accuracy`) — remove it from both `required` and `properties` when adapting. |
| `ai-dev-tools/skills/review-code/prompts/coder.md` | New file — based on `review-code-ralph/prompts/claude-coder.md`. Changes: update commit message from `fix(ralph):` to `fix(review-code):`, add `{{SPEC_CONTENT}}` placeholder for spec content, keep `{{ALL_ISSUES}}` and `{{VERIFICATION_REGRESSIONS}}` placeholders, add tool constraints. |
| `ai-dev-tools/skills/review-doc/agents/completeness-reviewer.md` | Add tool constraints, update inputs |
| `ai-dev-tools/skills/review-doc/agents/codebase-fact-checker.md` | Add tool constraints, update inputs |
| `ai-dev-tools/skills/review-doc/agents/implementability-auditor.md` | Add tool constraints, update inputs |
| `ai-dev-tools/skills/review-doc/agents/synthesis.md` | New file — min-model agent: dedup, filter, categorize, cap at 20, compute fact_check_accuracy, write tmp/review.json |
| `ai-dev-tools/references/backlog-entry-format.md` | Update `Source` enum: remove `review-code-ralph`, keep `review-code` |
| `ai-dev-tools/skills/orchestrate/SKILL.md` | Update all references: `tmp/review_analysis.md` → `tmp/review_summary.md`, `tmp/review_code.md` → `tmp/review_summary.md` + `tmp/review.json`. Update Steps 2, 3, 6-7, and State Detection table. |
| `ai-dev-tools/skills/help/SKILL.md` | Update review output file references (`review_analysis.md` → `review_summary.md`, `review_code.md` → `review_summary.md`) and severity labels |

## Error Handling

| Failure mode | Behavior |
|---|---|
| Agent returns invalid JSON or schema validation fails | Retry review once. Second failure: abort with error. |
| Fix introduces new criticals | Normal loop — next iteration catches them. |
| Git operations fail | Abort with error. |
| Verification command fails | Not an error — data for regression comparison (review-code only). |
| Max iterations exhausted | Stop with "Issues Found" status, report remaining issues. |

No explicit per-agent timeout. The `--max-iterations` cap prevents runaway loops.

## Backward Compatibility

| Old command | New equivalent |
|---|---|
| `/review-doc docs/spec.md` | `/review-doc docs/spec.md --max-iterations 1` |
| `/review-doc-ralph docs/spec.md --solo=claude` | `/review-doc docs/spec.md` |
| `/review-doc-ralph docs/spec.md --solo=claude --max-iterations 2` | `/review-doc docs/spec.md --max-iterations 2` |
| `/review-code 3 spec.md` | `/review-code 3 --against spec.md --max-iterations 1` (note: analysis doc changes from required positional to optional `--against` flag). Behavior change: old command was review-only, new command is review+fix (see Edge Case: `--max-iterations 1` under review-code). |
| `/review-code-ralph 3 --against spec.md --solo=claude` | `/review-code 3 --against spec.md` |
| `/review-code-ralph 3 --against spec.md --solo=claude --verify "npm test"` | `/review-code 3 --against spec.md --verify "npm test"` |

The old `/review-doc-ralph` and `/review-code-ralph` commands will no longer exist. The skill description for `/review-doc` and `/review-code` should be updated to cover both single-pass and iterative use cases.

### Breaking Changes for Downstream Skills

- **Output path:** `tmp/review_analysis.md` → `tmp/review_summary.md`. The `/orchestrate` skill references review output and is updated in this spec (see Files to Create/Modify). The `/respond-to-review` skill is a user-level skill at `~/.claude/skills/respond-to-review/` (outside this repo) — it must be updated separately to read `tmp/review_summary.md` or preferably `tmp/review.json` for structured data.
- **review-code output:** `tmp/review_code.md` no longer produced. review-code now outputs `tmp/review_summary.md` and `tmp/review.json` instead. The `/orchestrate` skill's Steps 6-7 and state detection are updated in this spec.
- **review-code schema:** `fact_check_accuracy` removed. Consumers that read `review.json` and expect this field must be updated.
- **Severity naming:** Markdown severity labels change from "Important/Minor" to "high/medium". Consumers parsing severity values in markdown output must be updated.
- **Verification auto-detection:** Removed. The old review-code-ralph auto-detected verification commands from package.json/Makefile/pyproject.toml/Cargo.toml. Users must now explicitly pass `--verify` flags.
- **Backlog Source field:** Changes from `review-code-ralph` to `review-code` for new entries. Historical backlog entries may still contain `review-code-ralph`.
- **review-doc schema:** `fact_check_claims` is a new required field (array of `{claim, verdict}` objects). Not present in the old review-doc-ralph schema. Consumers reading `tmp/review.json` from review-doc should handle this field. `/respond-to-review` should be updated to display claim verdicts.

## Estimated Performance

| Scenario | Before (all Opus, Codex) | After (tiered) | Savings |
|---|---|---|---|
| review-doc, 3 iterations | ~36-45 min | ~18-22 min | ~50% |
| review-doc, converges in 2 | ~25-30 min | ~12-15 min | ~50% |
| review-code, 3 iterations | ~36-45 min | ~36-45 min | ~0% (Opus throughout) |
| review-code, converges in 2 | ~25-30 min | ~25-30 min | ~0% |

The speed win is primarily for `review-doc`. `review-code` benefits from cleaner architecture, curated summary, and eliminated permission prompts — but not from model tiering.

## Success Criteria

1. Single-pass behavior works with `--max-iterations 1` for both skills.
2. review-doc early rounds use mid-model (2 agents), final gate uses max-model (3 agents).
3. review-code uses max-model throughout (single agent).
4. Synthesis uses min-model for review-doc.
5. Fixer always uses max-model for both skills.
6. Zero security permission prompts from agent tool misuse.
7. Curated summary produced with max 10 items + aggregates.
8. All existing features preserved: verification commands, backlog, ADR discovery, diff budgets, pre-flight checks.
9. Old ralph commands no longer exist.
10. `--effort` flag controls thoroughness for all agents.
