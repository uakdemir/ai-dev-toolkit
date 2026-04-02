---
name: review-doc
description: "Use when reviewing analysis specs, design documents, or implementation plans for completeness, accuracy, and implementability. Supports single-pass review (--max-iterations 1) and iterative review-fix cycles with model tiering. Invoke with /review-doc <path1> [path2 ...] or /review-doc <directory/>."
---

# Review Doc

Iterative document review with model tiering. Dispatches a single merged reviewer to check completeness, consistency, implementability, and more. Fixes issues automatically between rounds. In the final round, a sequential fact-checker verifies claims against the codebase. Produces a curated human-readable summary.

**Output:** `tmp/review-doc.json` (structured, machine-readable) + `tmp/review-doc-summary.md` (curated human summary, max 10 items + aggregates).

## Argument Parsing

Parse arguments after `/review-doc`:

```
/review-doc <path1> [path2 ...] [--against <ref-path>] [--max-model <model>] [--min-model <model>] [--max-iterations N] [--effort <level>] [--help]
/review-doc <directory/>       [--against <ref-path>] [...]
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
Usage: /review-doc <path1> [path2 ...] [flags]
       /review-doc <directory/> [flags]

Iterative document review with model tiering. Dispatches a single merged
reviewer for completeness, consistency, and implementability. Fixes issues
automatically between rounds. Fact-checker runs sequentially in the final round.
Accepts multiple files or a directory of .md files for cross-file review.

Flags:
  --against <ref-path>    Reference document for cross-checking (default: none)
  --max-model <model>     Final round: reviewer + fixer + fact-checker (default: opus)
  --min-model <model>     Early rounds: reviewer + fixer      (default: sonnet)
  --max-iterations N      Safety cap, 0=skip, 1=single-pass  (default: 1)
  --effort <level>        Thoroughness: low, medium, high    (default: high)
  --help                  Print this help and exit

Examples:
  /review-doc docs/spec.md                               Single-pass review (default)
  /review-doc docs/a.md docs/b.md docs/c.md              Review specific files as a set
  /review-doc docs/monorepo-strategy/                    Review all .md files in directory
  /review-doc docs/spec.md --max-iterations 3            Iterative review, up to 3 rounds
  /review-doc docs/spec.md --against docs/plan.md        Review against reference document
  /review-doc docs/spec.md --min-model haiku             Faster early rounds (lower quality)
```

## Setup

1. Ensure `./tmp/` directory exists (create if needed).
2. Delete stale files from prior runs: `./tmp/review-doc.json`, `./tmp/review-doc-summary.md`, `./tmp/review-doc-fix-report.json`, `./tmp/review-doc-iteration-*.md`.

## Pre-Flight Checks

1. Tokens before the first flag (`--*`) are input paths.
2. If no input paths are provided: print `"Error: no input paths provided."` and exit.
3. If a path is a directory: expand to all `*.md` files inside it (recursive, sorted alphabetically, max 20 files). If more than 20 `.md` files are found: print `"Error: directory contains more than 20 .md files. Use explicit paths to select a subset."` and exit. If zero `.md` files: print `"Error: directory contains no .md files."` and exit.
4. When a mix of directories and explicit files is provided, expand directories first, then merge with explicit paths. Deduplicate any paths that appear in both. The 20-file cap applies to the final merged list.
5. All explicit file paths are validated for existence. If any are missing: print `"Error: file not found: <path>"` for each and exit.
6. `--against` must be a file path, not a directory. If a directory is passed: print `"Error: --against value must be a file, not a directory."` and exit.
7. If `--against` provided, validate `<ref-path>` exists. If not: `"Error: reference document not found: <ref-path>"`

## Edge Case: `--max-iterations 0`

Skip the loop entirely. Do not create any files (no review.json, no iteration logs). Print and exit:

```
Review Doc Skipped
  Reviewed: <doc-paths comma-separated> (<N> files)
  No iterations run. Document was not reviewed.
```

For single file, keep `Reviewed: <doc-path>` (no count suffix).

## Edge Case: `--max-iterations 1`

Single-pass mode (default). Three agents dispatched sequentially at max-model:

1. **Reviewer** — reads each document, applies the combined checklist, writes `tmp/review-doc.json` directly.
2. **Fixer** — reads `tmp/review-doc.json`, applies fixes to the documents, writes `tmp/review-doc-fix-report.json` with dispositions. Hash verification before/after: if all hashes are unchanged after fixer, print `Warning: document was not modified. Proceeding to next step.` and continue.
3. **Fact-checker** — reads `tmp/review-doc.json`, appends fact-check issues, rewrites the file.

Then jump to Final Report. In single-pass mode, the Final Report step reads `tmp/review-doc-fix-report.json` to populate aggregate counts, same as in iterative mode.

## Iteration Flow

**Guard:** If `max_iterations == 1`, skip the loop below. Use the single-pass flow described above (Edge Case: --max-iterations 1).

**State:** The orchestrator maintains `is_final_gate = false` before the loop.

```
While iteration <= max_iterations OR is_final_gate:

  REVIEW PHASE:
    If NOT is_final_gate:
      Dispatch 1 reviewer at min-model -> writes tmp/review-doc.json
    If is_final_gate:
      Dispatch 1 reviewer at max-model -> writes tmp/review-doc.json

  VALIDATION:
    Recount severities from issues array (do not trust counts from JSON)

  STOP CHECK:
    If critical_count == 0 AND NOT is_final_gate:
      Set is_final_gate = true, continue to next iteration
    If is_final_gate (regardless of critical_count):
      Fall through to FIX PHASE and FACT-CHECK PHASE below, then exit loop to Final Report.

  FIX PHASE:
    If NOT is_final_gate:
      Dispatch fixer at min-model
    If is_final_gate:
      Dispatch fixer at max-model
    Hash verification (before/after)
    Fix-report.json with dispositions

  FACT-CHECK PHASE (final gate only):
    Backup tmp/review-doc.json before fact-checker runs.
    Dispatch fact-checker at max-model sequentially (after fixer completes).
    If fact-checker fails, fall back to backup with warning.

  ITERATION LOG -> tmp/review-doc-iteration-N.md
  iteration += 1
```

The final gate is exempt from the `--max-iterations` cap: if criticals reach zero at iteration N == max_iterations, the final gate still runs as iteration N+1. Terminal output reports this as e.g. "5/4" (5 iterations with cap of 4).

## Agent Dispatch (Early Rounds)

All `agents/` and `prompts/` paths in this section are relative to this skill's root directory (e.g., `ai-dev-tools/skills/review-doc/`).

The orchestrator dispatches a single reviewer agent at min-model.

Read `prompts/reviewer.md` and dispatch it as the reviewer agent prompt using the Agent tool: `Agent(prompt: <reviewer-prompt>, model: <min-model>)`.

The dispatch prompt must include:
- The effort level (`--effort` value)
- The document paths list:
  ```
  Documents to review:
  - path1.md
  - path2.md
  ```
  For single file, use the same list format with one entry.
- The `--against` reference path (if provided)

No fact-checker in early rounds. Early rounds focus on structural/completeness issues that Sonnet handles well. Fact-checking on a noisy early draft wastes time.

## Agent Dispatch (Final Gate)

Three agents dispatched **sequentially** at max-model:

1. **Merged Reviewer** — read `prompts/reviewer.md` and dispatch it as the reviewer agent prompt: `Agent(prompt: <reviewer-prompt>, model: <max-model>)`. The reviewer writes `tmp/review-doc.json`.

2. **Fixer** — read `prompts/coder.md` and dispatch: `Agent(prompt: <fixer-prompt>, model: <max-model>)`. The fixer reads `tmp/review-doc.json`, applies fixes, writes `tmp/review-doc-fix-report.json`.

3. **Codebase Fact-Checker** — backup `tmp/review-doc.json` first. Read `agents/codebase-fact-checker.md` and dispatch: `Agent(prompt: <fact-checker-prompt>, model: <max-model>)`. The fact-checker reads `tmp/review-doc.json`, appends fact-check issues, sets `fact_check_claims` and `fact_check_accuracy`, rewrites the file. If the fact-checker fails, restore the backup and add a warning.

All three run sequentially — each depends on the previous step's output.

## Fixer

Dispatched as a single Agent. Model depends on the round:
- Early rounds: `Agent(prompt: <prompt>, model: <min-model>)` (Sonnet by default)
- Final round: `Agent(prompt: <prompt>, model: <max-model>)` (Opus by default)

Read `prompts/coder.md` for complete dispatch instructions.

The orchestrator reads `tmp/review-doc.json`, extracts all issues grouped by severity (critical first, then high, then medium), and includes them in the Agent dispatch prompt as conversation context. The dispatch prompt must include:
- All issues grouped by severity
- The document paths list:
  ```
  Documents to review:
  - path1.md
  - path2.md
  ```
  For single file, use the same list format with one entry.
- Reference document path (if `--against` provided)

The fixer reads each document's content using the Read tool (not passed via dispatch context). Edits documents using the Edit tool for targeted fixes. Uses Write tool only for creating new files (like `tmp/review-doc-fix-report.json`).

Produces `tmp/review-doc-fix-report.json` with dispositions for every issue:
- `fixed` -- issue resolved
- `deferred` -- out of scope, with reason
- `pushed-back` -- reviewer finding is incorrect, with reason

## Fact-Checker Dispatch

The fact-checker runs **sequentially after the fixer** in the final round only. It is always terminal — no fix phase follows.

Before dispatch, the orchestrator backs up `tmp/review-doc.json` (the reviewer+fixer output). If the fact-checker fails, the orchestrator restores the backup and prints a warning.

Read `agents/codebase-fact-checker.md` and dispatch: `Agent(prompt: <fact-checker-prompt>, model: <max-model>)`.

The fact-checker:
1. Reads `tmp/review-doc.json`
2. Verifies claims against the codebase using Read/Grep/Glob tools
3. Appends fact-check issues to the `issues` array with `category: "fact-check"`
4. Populates `fact_check_claims` and computes `fact_check_accuracy`
5. Recomputes `critical_count` and `high_count` from the full issues array
6. Rewrites `tmp/review-doc.json`

## Hash Verification

Before fix phase: compute `sha256sum '<path>' | cut -d' ' -f1` via Bash for each document path.
After fix phase: same commands, compare values per file.

If all files unchanged: print `Warning: no documents were modified. Proceeding to next step.`

## Output Artifacts

| File | Purpose | Consumer |
|---|---|---|
| `tmp/review-doc.json` | Structured JSON from last iteration | `/respond-to-review`, machines |
| `tmp/review-doc-summary.md` | Curated human summary (max 10 items + aggregates) | Humans |
| `tmp/review-doc-fix-report.json` | Coder dispositions per issue | Orchestrator (iteration log) |
| `tmp/review-doc-iteration-N.md` | Per-iteration log | Debugging, audit |

## Review Summary Format

The orchestrator generates `tmp/review-doc-summary.md` directly during the Final Report step. Format:

```markdown
# Review Summary

**Date:** YYYY-MM-DD HH:MM
**Reviewed:** <file1.md, file2.md, ...> (N files)
**Against:** <ref-path or "standalone">
**Status:** Approved | Approved with suggestions | Issues Found
**Iterations:** N/M

## Aggregate
X Critical fixed | Y High fixed | Z Medium fixed
Remaining: A Critical | B High | C Medium
Last round: X Critical fixed | Y High fixed | Z Medium fixed
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

Single file: show just the path (no count suffix).

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
  Last round: 2 Critical fixed | 1 High fixed | 0 Medium fixed
  Fact-check: X/Y claims accurate (Z%)
  Summary: tmp/review-doc-summary.md
  Full review: tmp/review-doc.json
```

The `Reviewed:` line supports three formats:
- Single file: `Reviewed: <doc-path>` (unchanged)
- Directory: `Reviewed: <directory/> (N files)`
- Explicit multi-file: `Reviewed: <a.md, b.md, c.md> (N files)`

## Final Report

When the loop completes (final gate passes or max iterations exhausted):

1. The orchestrator generates `tmp/review-doc-summary.md` directly -- no agent dispatch needed. Read `tmp/review-doc.json`, extract the top 10 issues by severity (then descending confidence) from the capped 20.
2. Compute aggregate counts from accumulated fix-report data across all iterations (see Cross-Iteration Tracking).
3. Apply status logic (see Status Logic below).
4. Print terminal output (see Terminal Output above).
5. If status is "Approved with suggestions", run the Respond to Remaining Issues phase (below).

## Respond to Remaining Issues

**Trigger:** Status is "Approved with suggestions" (high/medium issues remain, zero criticals).

After printing the terminal output, auto-triage each remaining issue from `tmp/review-doc.json` (sorted by severity descending, then confidence descending). The agent decides autonomously — no user interaction.

**Auto-triage rules (per issue):**
- **Apply:** The suggested fix is actionable and the agent can make the edit. Apply directly to the document — surgical edits only.
- **Defer:** The fix requires information the agent doesn't have, depends on future work, or is explicitly a future concern.
- **Push back:** The finding is incorrect, irrelevant, or based on a misunderstanding of the document/spec. Record the agent's reasoning to `tmp/response_analysis.md` so the next review cycle can see why the finding was rejected.

**Escalation (rare):** Only ask the user if an issue is both **critical severity** AND the agent genuinely cannot determine the correct action. This should be exceptional — for high/medium issues, always decide autonomously.

After auto-triage, print a summary and commit applied fixes:

```
── Remaining Issues ────────────────────────────
N issues triaged (H high, M medium).

  [Applied]     #1 high: <title>
  [Applied]     #2 medium: <title>
  [Pushed back] #3 medium: <title> — <one-line reason>
  [Deferred]    #4 medium: <title> — <one-line reason>

Applied: N | Deferred: N | Pushed back: N
```

If any fixes were applied, commit with: `fix(review-doc): apply N review suggestions`.

After all issues are processed, update `tmp/review-doc-summary.md` with final dispositions and reprint the terminal output with updated counts.

**Response analysis format:** Write to `tmp/response_analysis.md` (overwrite — no need to read first):

```markdown
## Review-Doc Response — <date>

### [N] — [Issue title derived from problem]
**Status:** Applied | Deferred | Pushed back

**[If Applied]**
Change: what was changed and where — file:section

**[If Deferred]**
Reason: <agent's reasoning>

**[If Pushed back]**
Reason: <agent's reasoning for why the finding is incorrect or irrelevant>

---
```

**When status is "Approved" or "Issues Found":** Skip this phase entirely. "Approved" has nothing to address. "Issues Found" means criticals remain — the loop should have handled them, or max iterations were exhausted (user needs to fix manually).

## Backlog Writing

review-doc does **NOT** write to `tmp/past-issues-backlog.md`. Document reviews produce section-level locations (e.g., "Section 3.2"), not code-level locations (e.g., "src/auth.ts:42"). The backlog format is designed for code findings. Deferred and pushed-back document review items are recorded in iteration logs and the review summary only.

## Cross-Iteration Tracking

The orchestrator maintains the following state across the loop:

- `total_fixed = {critical: 0, high: 0, medium: 0}` -- per-severity breakdown (populates "X Critical fixed | Y High fixed | Z Medium fixed")
- `last_round_fixed = {critical: 0, high: 0, medium: 0}` -- per-severity breakdown for the most recent iteration only (populates "Last round:" line)
- `total_deferred = 0` -- flat count (populates "Deferred: D")
- `total_pushed_back = 0` -- flat count (populates "Pushed back: P")

After each fix phase, parse `tmp/review-doc-fix-report.json`: for each disposition with `action: "fixed"`, look up the issue's severity in `tmp/review-doc.json` and increment `total_fixed[severity]`. For `deferred` and `pushed-back`, increment the flat counter. Reset `last_round_fixed` to `{critical: 0, high: 0, medium: 0}` before each iteration and increment it alongside `total_fixed`. Update counters before the file is overwritten in the next iteration.

## Status Logic

First match wins:

1. **Issues Found**: `critical_count > 0` OR `fact_check_accuracy < 75`
2. **Approved with suggestions**: `fact_check_accuracy < 90` OR high/medium issues remain
3. **Approved**: all other cases

## Iteration Log Format

Write to `tmp/review-doc-iteration-N.md` after each iteration:

```markdown
# Iteration N

**Reviewer model:** min-model or max-model
**Agents:** 1 (merged reviewer) or 1 + fact-checker (final round)
**Fixer model:** min-model or max-model
**Issues found:** X critical, Y high, Z medium
**Outcome:** "Fixed N issues (D deferred, P pushed back), continuing" | "0 criticals, final gate triggered" | "0 criticals, loop complete" | "Fix phase failed: <error>"
**Issues fixed:** [category] [severity] at [location]
**Issues deferred:** [category] [severity] at [location] -- reason
**Issues pushed back:** [category] [severity] at [location] -- reason
**Issues found (no disposition):** [category] [severity] at [location], or "none"
```

## JSON Schema

The review-doc schema for `tmp/review-doc.json` validation reference:

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
