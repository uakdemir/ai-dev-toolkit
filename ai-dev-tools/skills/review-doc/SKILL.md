---
name: review-doc
argument-hint: "<path...> [--against <ref>] [--effort high|xhigh|max] --fact-check <true|false> [--verify-fixes <true|false>] [--max-iterations N] [--run-id <id>]"
description: "Use when reviewing analysis specs, design documents, or implementation plans for completeness, accuracy, and implementability. Supports single-pass review (--max-iterations 1) and iterative review-fix cycles. Invoke with /review-doc <path1> [path2 ...] or /review-doc <directory/>."
---

# Review Doc

Iterative document review. Dispatches a single merged reviewer to check completeness, consistency, implementability, and more. Fixes issues automatically between rounds. When `--fact-check true` is passed, a sequential fact-checker verifies claims against the codebase within each iteration (before the fixer, so fact-check findings get fixed in the same pass). When `--verify-fixes true` is passed, a verifier checks the fixer's own output after each fix phase and reports what it finds. Produces a curated human-readable summary.

**Output:** `tmp/_reviews_errors/review-doc.json` (structured, machine-readable) + `tmp/_reviews_errors/review-doc-summary.md` (curated human summary, max 10 items + aggregates). When `--run-id` is provided, files are prefixed: `tmp/_reviews_errors/<run_id>-review-doc.json`.

## Argument Parsing

Parse arguments after `/review-doc`:

```
/review-doc <path1> [path2 ...] [--against <ref-path>] [--effort <level>]
            --fact-check <true|false> [--verify-fixes <true|false>]
            [--max-iterations N] [--run-id <id>] [--help]
/review-doc <directory/>       [--against <ref-path>] [...]
```

| Flag | Default | Values | Purpose |
|---|---|---|---|
| `--against <ref-path>` | none | any file path | Reference document for cross-checking |
| `--effort` | max | high, xhigh, max | Reasoning-effort level for all agents (reviewer, fixer, fact-checker) |
| `--fact-check` | false | true, false | When true, runs fact-checker within each iteration before fixer |
| `--verify-fixes` | false | true, false | When true, runs a verifier after each fix phase to check the fixer's output (report-only — appends issues, never re-fixes) |
| `--max-iterations` | 3 | 0-10 | Safety cap (0 = skip). Honors option Y early-exit when pre-fix criticals == 0 |
| `--run-id` | none | string | Prefixes output files for run scoping; optional (backward compatible) |
| `--help` | --- | --- | Print usage and exit |

**Removed flags:** `--min-model`, `--max-model`, `--model` (clean break, no backward compat shim). The reviewer, fixer, fact-checker, and verifier inherit the caller's session model; `--effort` pins the reasoning-effort level (default `max`).

If any of the three is present, print `Warning: <flag> is no longer supported; all agents inherit the caller's session model. Ignoring.` — substituting the flag actually passed — and continue. Do not exit: the flag is inert, not invalid. Accepting it silently was the previous behaviour and gave the caller no signal that it had done nothing.

If `--effort` is present, validate its value against the set `{high, xhigh, max}`; on an out-of-set value print `Error: --effort must be one of: high, xhigh, max.` and exit. When `--effort` is not passed, default to `max`.

### `--help` Output

When `--help` is passed, print the following and exit (no review runs):

```
Usage: /review-doc <path1> [path2 ...] [flags]
       /review-doc <directory/> [flags]

Iterative document review. Dispatches a single merged reviewer for
completeness, consistency, and implementability. Fixes issues automatically
between rounds. Fact-checker runs when --fact-check true is passed.
Verifier checks the fixer's output when --verify-fixes true is passed.

Flags:
  --against <ref-path>    Reference document for cross-checking (default: none)
  --effort <level>        Reasoning effort: high, xhigh, max  (default: max)
  --fact-check <bool>     Run fact-checker each iteration    (default: false)
  --verify-fixes <bool>   Verify fixer output after each fix (default: false)
  --max-iterations N      Safety cap, 0=skip                 (default: 3)
  --run-id <id>           Prefix for output files            (default: none)
  --help                  Print this help and exit

Removed:
  --model, --min-model, --max-model   Ignored with a warning; all agents
                                      inherit the caller's session model

Examples:
  /review-doc docs/spec.md                                  Default review
  /review-doc docs/spec.md --fact-check true                Rigorous review
  /review-doc docs/spec.md --max-iterations 3               Up to 3 rounds
  /review-doc docs/spec.md --run-id k3m9p2q7_a1b2c3d4      Scoped output
```

## Setup

1. Ensure `./tmp/_reviews_errors/` directory exists (create if needed).
2. Delete stale files from prior runs:
   - Without `--run-id`: `./tmp/_reviews_errors/review-doc.json`, `./tmp/_reviews_errors/review-doc.json.bak`, `./tmp/_reviews_errors/review-doc-summary.md`, `./tmp/_reviews_errors/review-doc-fix-report.json`, `./tmp/_reviews_errors/review-doc-iteration-*.md`
   - With `--run-id`: `./tmp/_reviews_errors/<run_id>-review-doc*.json`, `./tmp/_reviews_errors/<run_id>-review-doc*.json.bak`, `./tmp/_reviews_errors/<run_id>-review-doc*.md`

   The `.bak` entries matter because the `*.json` globs do not match them — a backup left by a prior run's fact-check or verify phase would otherwise survive into the next run.

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
# One invocation = one loop, one fact-check setting (model inherited from caller session; effort pinned by --effort)
for iter in 1..max_iterations:
    review()                            # reviewer agent (inherits session model; runs at --effort level)
    validate(json)                      # schema-check reviewer output; retry review once on failure, abort iteration on 2nd
    pre_fix_criticals = count(json)     # option Y: measured at review output, before fact-check
    if fact_check:
        fact_check()                    # appends fact-check issues to json
    total_criticals = count(json)       # re-count after fact-check (includes fact-check-added criticals)
    is_final_iter = (iter == max_iterations)
    if pre_fix_criticals == 0 and not is_final_iter:
        break                           # early-exit: no criticals, skip fix phase, skip remaining iters
    if total_criticals == 0:            # final iter, 0 criticals: skip fixer, clean exit
        break
    fix()                               # fixer runs when total_criticals > 0
    if verify_fixes:
        verify()                        # report-only: appends issues, never re-fixes
```

**Key behavioral properties:**
1. No phase logic, no tier promotion, no hidden final gate.
2. Fact-checker runs BEFORE fixer in each iter (so fact-check criticals get resolved in the same iter).
3. Early exit only on `pre_fix_criticals == 0` (option Y — always measure at review output, before fact-check).
4. The caller (orchestrate `--auto`) decides phase structure by invoking the skill multiple times with different `--fact-check` settings.
5. All dispatches in that invocation — reviewer, fixer, and fact-checker — inherit the caller's session model and run at the `--effort` reasoning level (default `max`).
6. `validate(json)` runs right after `review()`: schema-check the reviewer's JSON; on invalid JSON or a schema failure, retry the reviewer once, and abort the iteration on a second failure (mirrors review-code's Validation step + Error Handling).
7. `verify()` runs after `fix()` when `--verify-fixes true`, in every iteration where the fixer ran. It is report-only — it appends issues and never triggers another fix pass. On iterations 1..N-1 its findings are carried forward by the next reviewer and fixed normally; on the final iteration they surface as remaining issues in the summary. It never rewrites `critical_count` or `high_count` (see the Verifier dispatch section).

## Agent Dispatch

All `agents/` and `prompts/` paths in this section are relative to this skill's root directory (e.g., `${CLAUDE_SKILL_DIR}/`).

### Reviewer

The orchestrator dispatches a single reviewer agent, inheriting the caller's session model and running at the `--effort` reasoning level.

Read `prompts/reviewer.md` and dispatch it as the reviewer agent prompt using the Agent tool: `Agent(prompt: <reviewer-prompt>)`.

The dispatch prompt must include:
- The effort level (`--effort` value) as a reasoning-depth directive: `max` = exhaustive analysis; `xhigh`/`high` proportionally less. All severities stay in scope regardless.
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

Before dispatch, the orchestrator backs up `tmp/_reviews_errors/review-doc.json` to `tmp/_reviews_errors/review-doc.json.bak` (or the run-id-prefixed variants). If the fact-checker fails, the orchestrator restores the backup and prints a warning.

**Abort detection contract:** the fact-checker signals a controlled abort (e.g., on malformed reviewer JSON) by leaving the JSON file unchanged AND returning a text response whose first line begins with the literal prefix `ABORT: ` followed by a one-line reason. On detection, the orchestrator restores the backup, prints `Warning: fact-check aborted — <reason>. Falling back to reviewer output.`, and proceeds to the fixer using the original reviewer output. Any other failure mode (agent crash, exception, no response) is treated identically: restore backup, print a generic warning, continue.

Read `agents/codebase-fact-checker.md` and dispatch: `Agent(prompt: <fact-checker-prompt>)`. Include the effort level (`--effort` value) in the dispatch prompt.

The fact-checker:
1. Reads `tmp/_reviews_errors/review-doc.json` (or `<run_id>-review-doc.json`)
2. Verifies claims against the codebase using Read/Grep/Glob tools
3. Appends fact-check issues to the `issues` array with `category: "fact-check"`
4. Populates `fact_check_claims` and computes `fact_check_accuracy`
5. Recomputes `critical_count` and `high_count` from the full issues array
6. Rewrites the JSON file

### Fixer

Dispatched when `total_criticals > 0` after review (and optional fact-check).

Read `prompts/coder.md` and dispatch: `Agent(prompt: <fixer-prompt>)`.

The dispatch prompt must include:
- The effort level (`--effort` value) as a reasoning-depth directive
- All issues grouped by severity
- The document paths list
- Reference document path (if `--against` provided)

The fixer reads each document's content using the Read tool (not passed via dispatch context). Edits documents using the Edit tool for targeted fixes. Uses Write tool only for creating new files.

Produces `tmp/_reviews_errors/review-doc-fix-report.json` (or `<run_id>-review-doc-fix-report.json`) with dispositions for every issue:
- `fixed` -- issue resolved
- `deferred` -- out of scope, with reason
- `pushed-back` -- reviewer finding is incorrect, with reason

A `fixed` disposition may also carry `collateral: [{location, why}]` — edits the fixer made outside the findings because its own fix to a flagged location invalidated that location (a count, a rule, a cross-reference, a table cell). Unrelated improvements, restyling, and reorganisation remain prohibited; collateral is only the consequence of a sanctioned fix.


### Verifier (when `--verify-fixes true`)

Runs **after the fixer**, in every iteration where the fixer ran. Report-only: it never edits a document and never triggers another fix pass.

Before dispatch, the orchestrator backs up `tmp/_reviews_errors/review-doc.json` to `tmp/_reviews_errors/review-doc.json.bak` (or the run-id-prefixed variants), exactly as it does for the fact-checker. If the verifier fails, the orchestrator restores the backup and prints a warning.

**Abort detection contract:** identical to the fact-checker's — the verifier signals a controlled abort (e.g. a missing or unparseable fix report) by leaving the JSON unchanged AND returning a text response whose first line begins with the literal prefix `ABORT: ` followed by a one-line reason. On detection, the orchestrator restores the backup, prints `Warning: verify aborted — <reason>. Fix results unverified.`, and continues. Any other failure mode (agent crash, exception, no response) is treated identically.

Read `prompts/verifier.md` and dispatch: `Agent(prompt: <verifier-prompt>)`.

The dispatch prompt must include:
- The effort level (`--effort` value) as a reasoning-depth directive
- The document paths list
- The fix report path for this run

The verifier reads the fix report, re-reads only the document regions it names (issue `location` values and `collateral` entries), and appends any defects to the `issues` array with `category: "verify"`, minting ids from `max + 1` exactly as the fact-checker does.

**Count invariant:** the verifier does NOT recompute `critical_count` or `high_count`. Those fields carry the pre-fix counts, which is what `/orchestrate`'s stage-i endless-loop gate reads (`references/auto/stages/stage-i-spec-review.md` — "Phase 2 final iter pre-fix criticals > 1 → Q2 failure"). A verifier that recounted them would make post-fix findings indistinguishable from reviewer findings and trip spurious pipeline failures. Verifier issues are folded into the counts by the NEXT iteration's reviewer, which recomputes both fields from the full issues array.

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

### ISSUE-NNN — [Title]
**Severity:** high | **Category:** completeness | **Location:** Section 3.2
**Problem:** ...
**Status:** deferred -- reason

[... up to 10 items, each headed by its stable ISSUE-NNN id]
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

Recommended next: focused review — collateral recorded in § 3 rule 3, § 7
/review-doc docs/spec.md --fact-check true --max-iterations 2 --verify-fixes true

Found this round: 3 Critical | 4 High | 2 Medium
```

`Found this round:` is always the **last line printed**. It reports what this invocation's final review surfaced, not an aggregate across rounds, and it is deliberately last because it is the number the next decision keys off. It differs from `Last round:`, which counts issues *fixed*; the gap between the two is what the fixer could not resolve.

The `Recommended next:` block and its command line are described in Next-Round Recommendation below. Under rule 3 the command line is omitted and only the `Recommended next:` line prints.

When `--fact-check false` (default), replace the `Fact-check:` line — in both this terminal output and the summary's `## Fact-Check Accuracy` section — with `Fact-check: not run`.

The `Reviewed:` line supports three formats:
- Single file: `Reviewed: <doc-path>` (unchanged)
- Directory: `Reviewed: <directory/> (N files)`
- Explicit multi-file: `Reviewed: <a.md, b.md, c.md> (N files)`

## Final Report

When the loop completes (final gate passes or max iterations exhausted):

1. The orchestrator generates `tmp/_reviews_errors/review-doc-summary.md` directly -- no agent dispatch needed. Read `tmp/_reviews_errors/review-doc.json`, extract the top 10 issues by severity (then descending confidence) from the capped 20.
2. Compute aggregate counts from accumulated fix-report data across all iterations (see Cross-Iteration Tracking).
3. Apply status logic (see Status Logic below).
4. Derive the next-round recommendation (see Next-Round Recommendation below).
5. Print terminal output (see Terminal Output above), ending with the `Found this round:` line.
6. If status is "Approved with suggestions", run the Respond to Remaining Issues phase (below).

## Respond to Remaining Issues

**Trigger:** Status is "Approved with suggestions" (high/medium issues remain, zero criticals).

After printing the terminal output, auto-triage each remaining issue from `tmp/_reviews_errors/review-doc.json` (sorted by severity descending, then confidence descending). The agent decides autonomously — no user interaction.

**Auto-triage rules (per issue):**
- **Apply:** The suggested fix is actionable and the agent can make the edit. Apply directly to the document — surgical edits only.
- **Defer:** The fix requires information the agent doesn't have, depends on future work, or is explicitly a future concern.
- **Push back:** The finding is incorrect, irrelevant, or based on a misunderstanding of the document/spec. Record the agent's reasoning to `tmp/response_analysis.md` so the next review cycle can see why the finding was rejected.

The agent never asks the user. Every remaining issue resolves to apply, defer, or push back — including critical-severity items the agent cannot confidently fix (push back with explicit reasoning).

After auto-triage, print a summary and commit applied fixes:

```
── Remaining Issues ────────────────────────────
N issues triaged (H high, M medium).

  [Applied]     ISSUE-001 high: <title>
  [Applied]     ISSUE-002 medium: <title>
  [Pushed back] ISSUE-003 medium: <title> — <one-line reason>
  [Deferred]    ISSUE-004 medium: <title> — <one-line reason>

Applied: N | Deferred: N | Pushed back: N
```

If any fixes were applied, commit with: `fix(review-doc): apply N review suggestions`.

After all issues are processed, update `tmp/_reviews_errors/review-doc-summary.md` with final dispositions and reprint the terminal output with updated counts.

**Response analysis format:** Write to `tmp/response_analysis.md` (overwrite — no need to read first). Use the issue's stable `id` from `review-doc.json` as the section header so future review iterations and human readers can cross-reference findings unambiguously:

```markdown
## Review-Doc Response — <date>

### ISSUE-NNN — [Issue title derived from problem]
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
- `found_this_round = {critical: 0, high: 0, medium: 0}` -- severity breakdown of the `issues` array in the CURRENT iteration, measured after review and fact-check but before the fix phase. Overwritten each iteration; the final iteration's value populates the "Found this round:" line and rule 1 of the recommendation.
- `collateral_count = 0` -- number of `collateral` entries in the CURRENT iteration's fix report, with their `location` values retained for rendering. Reset each iteration; the final iteration's value drives rule 2 of the recommendation.

After each fix phase, **before dispatching the next iteration's reviewer** (which will overwrite `review-doc.json`), parse `tmp/_reviews_errors/review-doc-fix-report.json` and resolve each disposition's severity by `id` lookup against the CURRENT `tmp/_reviews_errors/review-doc.json`. Cache the resulting `(id → severity)` map in orchestrator state. The cache is initialized empty at the start of the review session; for each disposition's id, INSERT INTO the cache only if the id is not already present (**first-write-wins** — never overwrite). The cache lives for the duration of one review-doc invocation and is discarded when the loop exits. For each disposition with `action: "fixed"`, increment `total_fixed[severity]`. For `deferred` and `pushed-back`, increment the flat counter. Reset `last_round_fixed` to `{critical: 0, high: 0, medium: 0}` before each iteration and increment it alongside `total_fixed`.

If a carried-forward `id` has been displaced from a later iteration's JSON (e.g., it dropped out of the active issues set), use the cached severity from the iteration where the id was first introduced — never silently skip a disposition just because its id is no longer in the latest JSON.

**ID stability:** Issue IDs (`ISSUE-NNN`, zero-padded to at least 3 digits) are append-only across iterations within a single review session. The reviewer carries forward existing IDs for issues that match a prior iteration's finding (matched on the `(location, category)` tuple) and mints new IDs starting from `max(existing_id) + 1` for genuinely new findings. The reviewer also preserves prior issues that were not re-discovered this iteration (including fact-check entries appended by the fact-checker), so their IDs stay valid. Existing IDs are never renumbered, even if the underlying issue was fixed, deferred, or pushed back in a prior iteration — the ID stays attached to that specific finding for the lifetime of the review session, so external references (`tmp/response_analysis.md`, fix-report dispositions, user conversation) remain valid across rounds. Carried-forward issues are exempt from the reviewer's 20-issue cap.

## Status Logic

First match wins:

1. **Issues Found**: `critical_count > 0` OR `fact_check_accuracy < 75`
2. **Approved with suggestions**: `fact_check_accuracy < 90` OR high/medium issues remain
3. **Approved**: all other cases

## Next-Round Recommendation

After the status is computed, the orchestrator derives a recommendation for what to do next. It is computed directly from orchestrator state — no agent dispatch, no judgment call, identical output for identical inputs.

Inputs:

| Input | Source |
|---|---|
| `found_this_round` | Severity breakdown of the `issues` array in the FINAL iteration, measured after review and fact-check but before the fix phase — the same point as `total_criticals`. Medium is `len(issues) - critical_count - high_count`. |
| `fact_check_accuracy` | The final `review-doc.json` |
| `collateral_count` | Total number of `collateral` entries across all dispositions in the final iteration's fix report (0 when the fix phase did not run) |

Rules, first match wins:

| # | Condition | Recommendation |
|---|---|---|
| 1 | `found_this_round.critical > 0` OR `fact_check_accuracy < 75` | another review round |
| 2 | `collateral_count > 0` | focused review |
| 3 | otherwise | continue to implementation |

Rule 1 dominates rule 2 — a full round covers the collateral regions as well, so there is no point recommending the narrower action when the broader one is already warranted.

**Rule 1** — reprint the invocation exactly as it was given, so it can be pasted directly:

```
Recommended next: another review round — 3 criticals found this round
/review-doc docs/spec.md --fact-check true --max-iterations 2
```

**Rule 2** — name every distinct `location` appearing in a `collateral` entry, then offer the same invocation with verification on:

```
Recommended next: focused review — collateral recorded in § 3 rule 3, § 7, § 12.2
/review-doc docs/spec.md --fact-check true --max-iterations 2 --verify-fixes true
```

**Rule 3** — no command; review-doc does not know the implementation plan path:

```
Recommended next: continue to implementation — 0 criticals, no collateral recorded
```

The recommendation names a next action, not a scoped review mode. There is no flag that restricts a review to recently-changed regions: document fixes are left uncommitted in the working tree (the fixer never commits, and orchestrate commits once per phase, spanning both iterations), so no git ref can isolate the last fix pass. Rule 2 therefore names the sections and lets the reader decide.

## Iteration Log Format

Write to `tmp/_reviews_errors/review-doc-iteration-N.md` after each iteration:

```markdown
# Iteration N

**Model:** inherited from caller session
**Effort:** <--effort value>
**Agents:** 1 (merged reviewer), plus fact-checker (when --fact-check true), plus verifier (when --verify-fixes true and the fixer ran)
**Issues found:** X critical, Y high, Z medium
**Outcome:** "Fixed N issues (D deferred, P pushed back), continuing" | "0 criticals, early exit" | "0 criticals, loop complete" | "Max iterations reached" | "Fix phase failed: <error>"
**Issues fixed:** [ISSUE-NNN] [category] [severity] at [location]
**Issues deferred:** [ISSUE-NNN] [category] [severity] at [location] -- reason
**Issues pushed back:** [ISSUE-NNN] [category] [severity] at [location] -- reason
**Issues found (no disposition):** [ISSUE-NNN] [category] [severity] at [location], or "none"
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
        "required": ["id", "severity", "category", "location", "confidence", "problem", "suggested_fix"],
        "properties": {
          "id": { "type": "string", "pattern": "^ISSUE-\\d{3,}$" },
          "severity": { "type": "string", "enum": ["critical", "high", "medium"] },
          "category": { "type": "string", "enum": [
            "completeness", "consistency", "scope", "structure",
            "fact-check", "verify", "vague-action", "vague-step",
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
