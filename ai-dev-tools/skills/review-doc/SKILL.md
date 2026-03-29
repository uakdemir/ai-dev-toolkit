---
name: review-doc
description: "Use when reviewing analysis specs, design documents, or implementation plans for completeness, accuracy, and implementability. Supports single-pass review (--max-iterations 1) and iterative review-fix cycles with model tiering. Invoke with /review-doc <doc-path>."
---

# Review Doc

Iterative document review with model tiering. Dispatches a single merged reviewer to check completeness, consistency, implementability, and more. Fixes issues automatically between rounds. In the final round, a sequential fact-checker verifies claims against the codebase. Produces a curated human-readable summary.

**Output:** `tmp/review.json` (structured, machine-readable) + `tmp/review_summary.md` (curated human summary, max 10 items + aggregates).

## Argument Parsing

Parse arguments after `/review-doc`:

```
/review-doc <doc-path> [--against <ref-path>] [--max-model <model>] [--min-model <model>] [--max-iterations N] [--effort <level>] [--help]
```

| Flag | Default | Values | Purpose |
|---|---|---|---|
| `--against <ref-path>` | none | any file path | Reference document for cross-checking |
| `--max-model` | opus | opus, sonnet, haiku | Final round: reviewer + fixer + fact-checker |
| `--min-model` | sonnet | opus, sonnet, haiku | Early rounds: reviewer + fixer |
| `--max-iterations` | 1 | 0-10 | Safety cap (0 = skip, 1 = single-pass) |
| `--effort` | high | low, medium, high | Thoroughness level passed to all agents |
| `--help` | --- | --- | Print usage and exit |

### `--help` Output

When `--help` is passed, print the following and exit (no review runs):

```
Usage: /review-doc <doc-path> [flags]

Iterative document review with model tiering. Dispatches a single merged
reviewer for completeness, consistency, and implementability. Fixes issues
automatically between rounds. Fact-checker runs sequentially in the final round.

Flags:
  --against <ref-path>    Reference document for cross-checking (default: none)
  --max-model <model>     Final round: reviewer + fixer + fact-checker (default: opus)
  --min-model <model>     Early rounds: reviewer + fixer      (default: sonnet)
  --max-iterations N      Safety cap, 0=skip, 1=single-pass  (default: 1)
  --effort <level>        Thoroughness: low, medium, high    (default: high)
  --help                  Print this help and exit

Examples:
  /review-doc docs/spec.md                          Single-pass review (default)
  /review-doc docs/spec.md --max-iterations 3       Iterative review, up to 3 rounds
  /review-doc docs/spec.md --against docs/plan.md   Review against reference document
  /review-doc docs/spec.md --min-model haiku        Faster early rounds (lower quality)
```

## Setup

1. Ensure `./tmp/` directory exists (create if needed).
2. Delete stale files from prior runs: `./tmp/review.json`, `./tmp/review_summary.md`, `./tmp/fix-report.json`, `./tmp/iteration-*.md`.

## Pre-Flight Checks

1. Validate `<doc-path>` exists. If not: `"Error: document not found: <doc-path>"`
2. If `--against` provided, validate `<ref-path>` exists. If not: `"Error: reference document not found: <ref-path>"`

## Edge Case: `--max-iterations 0`

Skip the loop entirely. Do not create any files (no review.json, no iteration logs). Print and exit:

```
Review Doc Skipped
  Reviewed: <doc-path>
  No iterations run. Document was not reviewed.
```

## Edge Case: `--max-iterations 1`

Single-pass mode (backward compatible with old `/review-doc`). Use the final-gate configuration directly: dispatch 3 agents at max-model (completeness + fact-checker + implementability), synthesize with min-model. No fix phase. Jump directly to Final Report. This preserves the quality of the old 3-agent Opus single-pass review.

## Iteration Flow

**Guard:** If `max_iterations == 1`, skip the loop below. Instead, treat the single pass as a final-gate round: dispatch 3 agents at max-model, synthesize with min-model, no fix phase. Jump directly to Final Report. The pseudocode below applies only when `max_iterations >= 2`.

**State:** The orchestrator maintains `is_final_gate = false` before the loop.

```
While iteration <= max_iterations OR is_final_gate:

  REVIEW PHASE:
    If NOT is_final_gate:
      Dispatch 2 agents at mid-model (completeness + implementability)
      Synthesize with min-model -> tmp/review.json
    If is_final_gate:
      Dispatch 3 agents at max-model (completeness + fact-checker + implementability)
      Synthesize with min-model -> tmp/review.json

  VALIDATION:
    Recount severities from issues array (do not trust counts from JSON)

  STOP CHECK:
    If critical_count == 0 AND NOT is_final_gate:
      Set is_final_gate = true, continue to next iteration
    If is_final_gate (regardless of critical_count):
      Jump to Final Report -- the final gate is always terminal.
      If criticals remain, status will be "Issues Found".

  FIX PHASE (skipped when is_final_gate):
    Dispatch fixer at max-model
    Hash verification (before/after)
    Fix-report.json with dispositions

  ITERATION LOG -> tmp/iteration-N.md
  iteration += 1
```

The final-gate round is review-only -- no fix phase. It is the Opus quality pass on the cleanest version of the document. The final gate is exempt from the `--max-iterations` cap: if criticals reach zero at iteration N == max_iterations, the final gate still runs as iteration N+1. Terminal output reports this as e.g. "5/4" (5 iterations with cap of 4). This ensures the fact-checker always runs on the final document regardless of when criticals converge.

## Agent Dispatch (Early Rounds)

All `agents/` and `prompts/` paths in this section are relative to this skill's root directory (e.g., `ai-dev-tools/skills/review-doc/`).

The orchestrator dispatches each agent using the Agent tool with the appropriate `model` parameter. For early rounds: `Agent(prompt: <prompt>, model: "sonnet")`.

Two agents dispatched **in parallel** at mid-model:

1. **Completeness & Consistency Reviewer** -- read `agents/completeness-reviewer.md` before dispatch
2. **Implementability Auditor** -- read `agents/implementability-auditor.md` before dispatch

Read `prompts/reviewer.md` for complete dispatch instructions (how to construct each agent's prompt, what context to include).

Each agent dispatch must include:
- The effort level (`--effort` value)
- The document path to review
- The `--against` reference path (if provided)

No fact-checker in early rounds. Early rounds focus on structural/completeness issues that Sonnet handles well. Fact-checking on a noisy early draft wastes time.

## Agent Dispatch (Final Gate)

Three agents dispatched **in parallel** at max-model (`Agent(prompt: <prompt>, model: "opus")`):

1. **Completeness & Consistency Reviewer** -- `agents/completeness-reviewer.md`
2. **Codebase Fact-Checker** -- `agents/codebase-fact-checker.md`
3. **Implementability Auditor** -- `agents/implementability-auditor.md`

Read `prompts/reviewer.md` for complete dispatch instructions.

All three agents run at Opus for maximum depth on the cleaned document.

## Synthesis

Read the synthesis agent prompt from `agents/synthesis.md` before dispatching.

Dispatched as a single Agent at min-model (`Agent(prompt: <prompt>, model: "haiku")`). The synthesis agent receives the combined raw markdown findings from all review agents as conversation context (not a file), plus `is_final_gate: true/false` in the dispatch prompt. The agent writes `tmp/review.json` using the Write tool.

The synthesis agent performs:
1. **Deduplicate** -- same location AND same underlying deficiency
2. **Filter** -- drop findings with confidence < 40
3. **Categorize by severity** -- >= 80 critical, 60-79 high, 40-59 medium
4. **Fact-check conversion** (final gate only) -- convert fact-checker verdicts to issue objects with `category: "fact-check"`. Map verdict to confidence: INACCURATE -> 85 (critical), STALE -> 70 (high), PARTIALLY ACCURATE -> 50 (medium). ACCURATE verdicts are not converted to issues. If not final gate: set `fact_check_claims: []` and `fact_check_accuracy: 100`.
5. **Cap at 20** -- critical + high first, then medium by descending confidence. If critical + high exceed 20, raise the cap to include all of them (criticals and highs are never dropped).
6. **Compute fact_check_accuracy** (final gate only) -- `(accurate + 0.5 * partially_accurate) / total * 100`. Otherwise: already set to 100 in step 4.
7. **Write** `tmp/review.json`

## Fixer

Dispatched as a single Agent at max-model (`Agent(prompt: <prompt>, model: "opus")`).

Read `prompts/coder.md` for complete dispatch instructions.

The orchestrator reads `tmp/review.json`, extracts all issues grouped by severity (critical first, then high, then medium), and includes them in the Agent dispatch prompt as conversation context. The dispatch prompt must include:
- All issues grouped by severity
- The document path
- Reference document path (if `--against` provided)

The fixer reads the document content using the Read tool (not passed via dispatch context). Edits the document using the Edit tool for targeted fixes. Uses Write tool only for creating new files (like `tmp/fix-report.json`).

Produces `tmp/fix-report.json` with dispositions for every issue:
- `fixed` -- issue resolved
- `deferred` -- out of scope, with reason
- `pushed-back` -- reviewer finding is incorrect, with reason

## Hash Verification

Before fix phase: compute `sha256sum '<doc-path>' | cut -d' ' -f1` via Bash.
After fix phase: same command, compare values.

If unchanged: print `Warning: document was not modified. Proceeding to next review.`

## Output Artifacts

| File | Purpose | Consumer |
|---|---|---|
| `tmp/review.json` | Structured JSON from last iteration | `/respond-to-review`, machines |
| `tmp/review_summary.md` | Curated human summary (max 10 items + aggregates) | Humans |
| `tmp/fix-report.json` | Coder dispositions per issue | Orchestrator (iteration log) |
| `tmp/iteration-N.md` | Per-iteration log | Debugging, audit |

## Review Summary Format

The orchestrator generates `tmp/review_summary.md` directly during the Final Report step. Format:

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
**Status:** deferred -- reason

[... up to 10 items]
```

## Terminal Output

After saving the summary, print:

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

## Final Report

When the loop completes (final gate passes or max iterations exhausted):

1. The orchestrator generates `tmp/review_summary.md` directly -- no agent dispatch needed. Read `tmp/review.json`, extract the top 10 issues by severity (then descending confidence) from the capped 20.
2. Compute aggregate counts from accumulated fix-report data across all iterations (see Cross-Iteration Tracking).
3. Apply status logic (see Status Logic below).
4. Print terminal output (see Terminal Output above).

## Backlog Writing

review-doc does **NOT** write to `tmp/past-issues-backlog.md`. Document reviews produce section-level locations (e.g., "Section 3.2"), not code-level locations (e.g., "src/auth.ts:42"). The backlog format is designed for code findings. Deferred and pushed-back document review items are recorded in iteration logs and the review summary only.

## Cross-Iteration Tracking

The orchestrator maintains the following state across the loop:

- `total_fixed = {critical: 0, high: 0, medium: 0}` -- per-severity breakdown (populates "X Critical fixed | Y High fixed | Z Medium fixed")
- `total_deferred = 0` -- flat count (populates "Deferred: D")
- `total_pushed_back = 0` -- flat count (populates "Pushed back: P")

After each fix phase, parse `tmp/fix-report.json`: for each disposition with `action: "fixed"`, look up the issue's severity in `tmp/review.json` and increment `total_fixed[severity]`. For `deferred` and `pushed-back`, increment the flat counter. Update counters before the file is overwritten in the next iteration.

## Status Logic

First match wins:

1. **Issues Found**: `critical_count > 0` OR `fact_check_accuracy < 75`
2. **Approved with suggestions**: `fact_check_accuracy < 90` OR high/medium issues remain
3. **Approved**: all other cases

## Iteration Log Format

Write to `tmp/iteration-N.md` after each iteration:

```markdown
# Iteration N

**Reviewer model:** mid-model or max-model
**Agents:** 2 (completeness + implementability) or 3 (+ fact-checker)
**Fixer model:** max-model (or "N/A -- final gate, review only")
**Issues found:** X critical, Y high, Z medium
**Outcome:** "Fixed N issues (D deferred, P pushed back), continuing" | "0 criticals, final gate triggered" | "0 criticals, loop complete" | "Fix phase failed: <error>"
**Issues fixed:** [category] [severity] at [location]
**Issues deferred:** [category] [severity] at [location] -- reason
**Issues pushed back:** [category] [severity] at [location] -- reason
**Issues found (no disposition):** [category] [severity] at [location], or "none"
```

## JSON Schema

The review-doc schema for `tmp/review.json` validation reference:

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

Note: `fact_check_claims` is only populated on the final-gate round (when the codebase fact-checker runs). On early rounds (no fact-checker), set `fact_check_claims: []` and `fact_check_accuracy: 100`.
