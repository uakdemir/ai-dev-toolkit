---
name: review-doc
description: "Use when reviewing analysis specs, design documents, or implementation plans for completeness, accuracy, and implementability. Supports single-pass review (--max-iterations 1) and iterative review-fix cycles. Invoke with /review-doc <path1> [path2 ...] or /review-doc <directory/>."
---

# Review Doc

Iterative document review. Dispatches a single merged reviewer to check completeness, consistency, implementability, and more. Fixes issues automatically between rounds. When `--fact-check true` is passed, a sequential fact-checker verifies claims against the codebase within each iteration (before the fixer, so fact-check findings get fixed in the same pass). Produces a curated human-readable summary.

**Output:** `tmp/_reviews_errors/review-doc.json` (structured, machine-readable) + `tmp/_reviews_errors/review-doc-summary.md` (curated human summary, max 10 items + aggregates). When `--run-id` is provided, files are prefixed: `tmp/_reviews_errors/<run_id>-review-doc.json`.

## Argument Parsing

Parse arguments after `/review-doc`:

```
/review-doc <path1> [path2 ...] [--against <ref-path>] [--effort <level>]
            [--model <sonnet|opus>] --fact-check <true|false>
            [--max-iterations N] [--run-id <id>] [--help]
/review-doc <directory/>       [--against <ref-path>] [...]
```

| Flag | Default | Values | Purpose |
|---|---|---|---|
| `--against <ref-path>` | none | any file path | Reference document for cross-checking |
| `--model` | sonnet | sonnet, opus | Controls all dispatches: reviewer, fixer, and fact-checker |
| `--fact-check` | false | true, false | When true, runs fact-checker within each iteration before fixer |
| `--max-iterations` | 3 | 0-10 | Safety cap (0 = skip). Honors option Y early-exit when pre-fix criticals == 0 |
| `--effort` | high | low, medium, high | Thoroughness level passed to all agents |
| `--run-id` | none | string | Prefixes output files for run scoping; optional (backward compatible) |
| `--help` | --- | --- | Print usage and exit |

**Removed flags:** `--min-model`, `--max-model` (clean break, no backward compat shim).

### `--help` Output

When `--help` is passed, print the following and exit (no review runs):

```
Usage: /review-doc <path1> [path2 ...] [flags]
       /review-doc <directory/> [flags]

Iterative document review. Dispatches a single merged reviewer for
completeness, consistency, and implementability. Fixes issues automatically
between rounds. Fact-checker runs when --fact-check true is passed.

Flags:
  --against <ref-path>    Reference document for cross-checking (default: none)
  --model <model>         All dispatches: reviewer + fixer + fact-checker
                                                             (default: sonnet)
  --fact-check <bool>     Run fact-checker each iteration    (default: false)
  --max-iterations N      Safety cap, 0=skip                 (default: 3)
  --effort <level>        Thoroughness: low, medium, high    (default: high)
  --run-id <id>           Prefix for output files            (default: none)
  --help                  Print this help and exit

Examples:
  /review-doc docs/spec.md                                  Default review
  /review-doc docs/spec.md --fact-check true --model opus   Rigorous review
  /review-doc docs/spec.md --max-iterations 3               Up to 3 rounds
  /review-doc docs/spec.md --run-id k3m9p2q7_a1b2c3d4      Scoped output
```

## Setup

1. Ensure `./tmp/_reviews_errors/` directory exists (create if needed).
2. Delete stale files from prior runs:
   - Without `--run-id`: `./tmp/_reviews_errors/review-doc.json`, `./tmp/_reviews_errors/review-doc-summary.md`, `./tmp/_reviews_errors/review-doc-fix-report.json`, `./tmp/_reviews_errors/review-doc-iteration-*.md`
   - With `--run-id`: `./tmp/_reviews_errors/<run_id>-review-doc*.json`, `./tmp/_reviews_errors/<run_id>-review-doc*.md`

## Pre-Flight Checks

1. Tokens before the first flag (`--*`) are input paths.
2. If no input paths are provided: print `"Error: no input paths provided."` and exit.
3. If a path is a directory: expand to all `*.md` files inside it (recursive, sorted alphabetically, max 20 files). If more than 20 `.md` files are found: print `"Error: directory contains more than 20 .md files. Use explicit paths to select a subset."` and exit. If zero `.md` files: print `"Error: directory contains no .md files."` and exit.
4. When a mix of directories and explicit files is provided, expand directories first, then merge with explicit paths. Deduplicate any paths that appear in both. The 20-file cap applies to the final merged list.
5. All explicit file paths are validated for existence. If any are missing: print `"Error: file not found: <path>"` for each and exit.
6. `--against` must be a file path, not a directory. If a directory is passed: print `"Error: --against value must be a file, not a directory."` and exit.
7. If `--against` provided, validate `<ref-path>` exists. If not: `"Error: reference document not found: <ref-path>"`

## Review Loop

**`--max-iterations 0`:** Skip loop entirely. Output: `Review Doc Skipped / Reviewed: <docs> / No iterations run.`

**`--max-iterations >= 1`:** Run the simplified loop below. There is no separate single-pass mode — `--max-iterations 1` is just one iteration of the same loop.

```python
# One invocation = one loop, one model, one fact-check setting
for iter in 1..max_iterations:
    review_with(model)                  # reviewer agent at configured model
    pre_fix_criticals = count(json)     # option Y: measured at review output, before fact-check
    if fact_check:
        fact_check_with(model)          # appends fact-check issues to json; same model
    total_criticals = count(json)       # re-count after fact-check (includes fact-check-added criticals)
    is_final_iter = (iter == max_iterations)
    if pre_fix_criticals == 0 and not is_final_iter:
        break                           # early-exit: no criticals, skip fix phase, skip remaining iters
    if total_criticals == 0:            # final iter, 0 criticals: skip fixer, clean exit
        break
    fix_with(model)                     # fixer runs when total_criticals > 0
```

**Key behavioral properties:**
1. No phase logic, no tier promotion, no hidden final gate.
2. Fact-checker runs BEFORE fixer in each iter (so fact-check criticals get resolved in the same iter).
3. Early exit only on `pre_fix_criticals == 0` (option Y — always measure at review output, before fact-check).
4. The caller (orchestrate `--auto`) decides phase structure by invoking the skill multiple times with different `--model` and `--fact-check` settings.
5. `--model` controls ALL dispatches in that invocation, including the fact-checker. Using `--model sonnet --fact-check true` runs the fact-checker at sonnet quality.

## Agent Dispatch

All `agents/` and `prompts/` paths in this section are relative to this skill's root directory (e.g., `ai-dev-tools/skills/review-doc/`).

### Reviewer

The orchestrator dispatches a single reviewer agent at configured model.

Read `prompts/reviewer.md` and dispatch it as the reviewer agent prompt using the Agent tool: `Agent(prompt: <reviewer-prompt>, model: <model>)`.

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

The reviewer writes `tmp/_reviews_errors/review-doc.json` (or `tmp/_reviews_errors/<run_id>-review-doc.json` when `--run-id` is active).

### Fact-Checker (when `--fact-check true`)

Runs **after the reviewer, before the fixer** in each iteration. It is not terminal — the fixer follows to resolve any fact-check-added criticals.

Before dispatch, the orchestrator backs up `tmp/_reviews_errors/review-doc.json` (or the run-id-prefixed variant). If the fact-checker fails, the orchestrator restores the backup and prints a warning.

Read `agents/codebase-fact-checker.md` and dispatch: `Agent(prompt: <fact-checker-prompt>, model: <model>)`.

The fact-checker:
1. Reads `tmp/_reviews_errors/review-doc.json` (or `<run_id>-review-doc.json`)
2. Verifies claims against the codebase using Read/Grep/Glob tools
3. Appends fact-check issues to the `issues` array with `category: "fact-check"`
4. Populates `fact_check_claims` and computes `fact_check_accuracy`
5. Recomputes `critical_count` and `high_count` from the full issues array
6. Rewrites the JSON file

### Fixer

Dispatched when `total_criticals > 0` after review (and optional fact-check).

Read `prompts/coder.md` and dispatch: `Agent(prompt: <fixer-prompt>, model: <model>)`.

The dispatch prompt must include:
- All issues grouped by severity
- The document paths list
- Reference document path (if `--against` provided)

The fixer reads each document's content using the Read tool (not passed via dispatch context). Edits documents using the Edit tool for targeted fixes. Uses Write tool only for creating new files.

Produces `tmp/_reviews_errors/review-doc-fix-report.json` (or `<run_id>-review-doc-fix-report.json`) with dispositions for every issue:
- `fixed` -- issue resolved
- `deferred` -- out of scope, with reason
- `pushed-back` -- reviewer finding is incorrect, with reason


## Hash Verification

Before fix phase: compute `sha256sum '<path>' | cut -d' ' -f1` via Bash for each document path.
After fix phase: same commands, compare values per file.

If all files unchanged: print `Warning: no documents were modified. Proceeding to next step.`

## Output Artifacts

| File | Purpose | Consumer |
|---|---|---|
| `tmp/_reviews_errors/[<run_id>-]review-doc.json` | Structured JSON from last iteration | `/respond-to-review`, machines |
| `tmp/_reviews_errors/[<run_id>-]review-doc-summary.md` | Curated human summary (max 10 items + aggregates) | Humans |
| `tmp/_reviews_errors/[<run_id>-]review-doc-fix-report.json` | Coder dispositions per issue | Orchestrator (iteration log) |
| `tmp/_reviews_errors/[<run_id>-]review-doc-iteration-N.md` | Per-iteration log | Debugging, audit |

## Review Summary Format

The orchestrator generates `tmp/_reviews_errors/review-doc-summary.md` directly during the Final Report step. Format:

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
  Summary: tmp/_reviews_errors/[<run_id>-]review-doc-summary.md
  Full review: tmp/_reviews_errors/[<run_id>-]review-doc.json
```

The `Reviewed:` line supports three formats:
- Single file: `Reviewed: <doc-path>` (unchanged)
- Directory: `Reviewed: <directory/> (N files)`
- Explicit multi-file: `Reviewed: <a.md, b.md, c.md> (N files)`

## Final Report

When the loop completes (final gate passes or max iterations exhausted):

1. The orchestrator generates `tmp/_reviews_errors/review-doc-summary.md` directly -- no agent dispatch needed. Read `tmp/_reviews_errors/review-doc.json`, extract the top 10 issues by severity (then descending confidence) from the capped 20.
2. Compute aggregate counts from accumulated fix-report data across all iterations (see Cross-Iteration Tracking).
3. Apply status logic (see Status Logic below).
4. Print terminal output (see Terminal Output above).
5. If status is "Approved with suggestions", run the Respond to Remaining Issues phase (below).

## Respond to Remaining Issues

**Trigger:** Status is "Approved with suggestions" (high/medium issues remain, zero criticals).

After printing the terminal output, auto-triage each remaining issue from `tmp/_reviews_errors/review-doc.json` (sorted by severity descending, then confidence descending). The agent decides autonomously — no user interaction.

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

After all issues are processed, update `tmp/_reviews_errors/review-doc-summary.md` with final dispositions and reprint the terminal output with updated counts.

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

After each fix phase, parse `tmp/_reviews_errors/review-doc-fix-report.json`: for each disposition with `action: "fixed"`, look up the issue's severity in `tmp/_reviews_errors/review-doc.json` and increment `total_fixed[severity]`. For `deferred` and `pushed-back`, increment the flat counter. Reset `last_round_fixed` to `{critical: 0, high: 0, medium: 0}` before each iteration and increment it alongside `total_fixed`. Update counters before the file is overwritten in the next iteration.

## Status Logic

First match wins:

1. **Issues Found**: `critical_count > 0` OR `fact_check_accuracy < 75`
2. **Approved with suggestions**: `fact_check_accuracy < 90` OR high/medium issues remain
3. **Approved**: all other cases

## Iteration Log Format

Write to `tmp/_reviews_errors/review-doc-iteration-N.md` after each iteration:

```markdown
# Iteration N

**Reviewer model:** <configured model>
**Agents:** 1 (merged reviewer) or 1 + fact-checker (when --fact-check true)
**Fixer model:** <configured model>
**Issues found:** X critical, Y high, Z medium
**Outcome:** "Fixed N issues (D deferred, P pushed back), continuing" | "0 criticals, early exit" | "0 criticals, loop complete" | "Max iterations reached" | "Fix phase failed: <error>"
**Issues fixed:** [category] [severity] at [location]
**Issues deferred:** [category] [severity] at [location] -- reason
**Issues pushed back:** [category] [severity] at [location] -- reason
**Issues found (no disposition):** [category] [severity] at [location], or "none"
```

## JSON Schema

The review-doc schema for `tmp/_reviews_errors/review-doc.json` validation reference:

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

Note: `fact_check_claims` is only populated when `--fact-check true` is passed. When `--fact-check false` (default), set `fact_check_claims: []` and `fact_check_accuracy: 100`.
