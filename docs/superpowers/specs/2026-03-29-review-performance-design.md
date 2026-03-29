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
/review-doc <doc-path> [--against <ref-path>] [--max-model <model>] [--mid-model <model>] [--min-model <model>] [--max-iterations N] [--effort <level>]
```

| Flag | Default | Purpose |
|---|---|---|
| `--against <ref-path>` | none (optional) | Reference document for cross-checking |
| `--max-model` | opus | Fixer, final review round (3 agents) |
| `--mid-model` | sonnet | Early review rounds (2 agents) |
| `--min-model` | haiku | Synthesis (dedup/filter/count) |
| `--max-iterations` | 4 | Safety cap |
| `--effort` | high | Thoroughness level passed to all agents |

### Iteration Flow

```
For iteration 1 to max_iterations:

  REVIEW PHASE:
    If this is NOT the final-gate round:
      Dispatch 2 agents at mid-model (completeness + implementability)
      Synthesize with min-model → tmp/review.json
    If this IS the final-gate round:
      Dispatch 3 agents at max-model (completeness + fact-checker + implementability)
      Synthesize with min-model → tmp/review.json

  VALIDATION:
    Recount severities from issues array (do not trust counts from JSON)

  STOP CHECK:
    If critical_count == 0 AND this is NOT the final-gate round:
      Trigger one more review-only round (the "final gate") at max-model
    If critical_count == 0 AND this IS the final-gate round:
      Jump to Final Report

  FIX PHASE (skipped on final-gate round):
    Dispatch fixer at max-model
    Hash verification (before/after)
    Fix-report.json with dispositions

  ITERATION LOG → tmp/iteration-N.md
```

The final-gate round is review-only — no fix phase. It is the Opus quality pass on the cleanest version of the document. This round always runs when criticals reach zero, even if it means using one extra iteration slot.

### Agent Dispatch (Early Rounds — mid-model)

Two agents dispatched in parallel at `mid-model`:
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

Dispatched as a single Agent at `min-model`. Receives raw findings from all review agents. Performs:
1. Deduplicate — same location AND same underlying deficiency
2. Filter — drop findings with confidence < 40
3. Categorize by severity — >= 80 critical, 60-79 high, 40-59 medium
4. Map fact-checker verdicts to confidence — INACCURATE → 85 (critical), STALE → 70 (high), PARTIALLY ACCURATE → 50 (medium)
5. Cap at 20 — critical + high first, then medium by descending confidence
6. Compute fact_check_accuracy — `(accurate + 0.5 * partially_accurate) / total * 100`
7. Write `tmp/review.json`

### Fixer

Dispatched as a single Agent at `max-model`. Receives:
- All issues grouped by severity (critical first, then high, then medium)
- The document path
- Reference document path (if `--against` provided)

Edits the document using the Edit tool. Produces `tmp/fix-report.json` with dispositions for every issue:
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
/review-code <commit-count> [--against <spec-path>] [--max-model <model>] [--max-iterations N] [--effort <level>] [--verify "<cmd>"]
```

| Flag | Default | Purpose |
|---|---|---|
| `--against <spec-path>` | none (optional) | Spec as implementation contract |
| `--max-model` | opus | All phases — reviewer, fixer |
| `--max-iterations` | 4 | Safety cap |
| `--effort` | high | Thoroughness level passed to reviewer/fixer |
| `--verify "<cmd>"` | none | Repeatable — verification commands run after each fix |

No `--mid-model` or `--min-model` — code review uses `max-model` throughout because:
- Single reviewer agent (no ensemble to compensate for a weaker model)
- Code review requires Opus-level reasoning for subtle bugs
- No synthesis step (single agent produces JSON directly)

### Pre-Flight Checks

1. `git rev-parse HEAD` succeeds. If not: `"Error: no commits in repository."`
2. If on `main` or `master`: `"[ralph] Warning: you are on branch 'main'. Fix commits will land here. Continue?"`
3. If `git status --porcelain` non-empty: `"[ralph] Working tree is dirty. Please commit or stash your changes before running review-code."`

### Iteration Flow

```
For iteration 1 to max_iterations:

  REVIEW PHASE:
    Dispatch single reviewer agent at max-model
    Agent produces tmp/review.json directly (no synthesis)

  VALIDATION:
    Recount severities from issues array
    Schema validation (required fields, enum values)

  STOP CHECK:
    If critical_count == 0:
      Run verification commands, compare to baseline
      If no regressions:
        Write backlog, jump to Final Report
      If regressions:
        Inject synthetic critical issues, continue to Fix Phase

  FIX PHASE:
    Dispatch fixer agent at max-model
    Fixer commits: "fix(ralph): resolve N issues from iteration M"

  BACKLOG WRITING → tmp/past-issues-backlog.md
  VERIFICATION → run --verify commands, track regressions
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

Produces `tmp/review.json` directly — structured JSON matching the review schema.

### Context Budgets

- **Git diff:** 3000 lines max. If over: include `git diff --stat` always (doesn't count against budget), use `git diff --numstat` for per-file line counts, sort by total changes descending, greedily include full diffs largest-first until budget exceeded, remainder as stat-only summaries.
- **Stat-only file coverage:** The reviewer prompt must include: "For files shown as stat-only summaries, use Read to inspect the changed files. Do not skip files just because their full diff was not included." This ensures the reviewer doesn't ignore files that fell outside the 3000-line budget.
- **ADRs:** 200 lines max. Truncate to most recent files by modification time (newest first).

### Fixer Agent

Single agent dispatched at `max-model`. Receives:
- All issues grouped by severity
- Verification regressions (if any)
- Spec content (if `--against` provided)

Edits code, commits with message `fix(ralph): resolve N issues from iteration M`, produces `tmp/fix-report.json`.

### Verification Commands

- Baseline captured before first iteration (run all `--verify` commands, record exit codes)
- Run after each fix phase
- Compare to baseline: new non-zero exit = regression
- Regressions injected as synthetic critical issues (`category: "bug"`, `severity: "critical"`, `confidence: 85`)
- Regression details persist between iterations, passed to both reviewer and fixer
- Verification command failures are NOT errors — they are data for regression comparison

### ADR Discovery

Scope-based filtering kept from current review-code-ralph:
- Discover ADR index using fallback sequence: `docs/architecture/adrs.md` → `docs/adrs/` → `docs/adr/` → `adr/`. Use first match.
- Filter ADRs whose `code_paths` match files in the diff
- Include matched ADRs in reviewer context (within 200-line budget)

### Backlog Writing

Kept from current review-code-ralph:
- Append all issues to `tmp/past-issues-backlog.md` after each iteration
- Cross-reference with `tmp/fix-report.json` for dispositions
- Read entry template from `ai-dev-tools/references/backlog-entry-format.md`
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
  "required": ["critical_count", "high_count", "issues", "fact_check_accuracy"],
  "properties": {
    "critical_count": { "type": "integer", "minimum": 0 },
    "high_count": { "type": "integer", "minimum": 0 },
    "fact_check_accuracy": { "type": "integer", "minimum": 0, "maximum": 100 },
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
| `ai-dev-tools/skills/review-doc/prompts/reviewer.md` | Rename from claude-reviewer.md, update for model tiering |
| `ai-dev-tools/skills/review-doc/prompts/coder.md` | Rename from claude-coder.md |
| `ai-dev-tools/skills/review-code/prompts/reviewer.md` | Rename from claude-reviewer.md |
| `ai-dev-tools/skills/review-code/prompts/coder.md` | Rename from claude-coder.md |
| `ai-dev-tools/skills/review-doc/agents/completeness-reviewer.md` | Add tool constraints, update inputs |
| `ai-dev-tools/skills/review-doc/agents/codebase-fact-checker.md` | Add tool constraints, update inputs |
| `ai-dev-tools/skills/review-doc/agents/implementability-auditor.md` | Add tool constraints, update inputs |

## Error Handling

| Failure mode | Behavior |
|---|---|
| Agent returns invalid JSON | Retry review once. Second failure: abort with error. |
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
| `/review-code 3 --against spec.md` | `/review-code 3 --against spec.md --max-iterations 1` |
| `/review-code-ralph 3 --against spec.md --solo=claude` | `/review-code 3 --against spec.md` |
| `/review-code-ralph 3 --against spec.md --solo=claude --verify "npm test"` | `/review-code 3 --against spec.md --verify "npm test"` |

The old `/review-doc-ralph` and `/review-code-ralph` commands will no longer exist. The skill description for `/review-doc` and `/review-code` should be updated to cover both single-pass and iterative use cases.

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
