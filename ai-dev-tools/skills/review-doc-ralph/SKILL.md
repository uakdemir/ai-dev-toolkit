---
name: review-doc-ralph
description: Iterative review-fix loop between Claude and Codex for document review. Alternates reviewer and coder roles until zero critical issues remain. Use when you want automated multi-pass document quality improvement.
---

# Review Doc Ralph

Orchestrate iterative "review -> fix" cycles between Claude Code and Codex CLI until a document has zero critical issues.

## Argument Parsing

Parse arguments after `/review-doc-ralph`:

- First token: `<doc-path>` (required) — the document to review
- `--against <ref-path>` — optional reference document for cross-checking
- `--claude=reviewer` — flip roles: Claude reviews, Codex codes
- `--solo=claude` — Claude does both roles
- `--solo=codex` — Codex does both roles
- `--max-iterations N` — safety cap (default: 4)
- `--claude-model <model>` — override Claude model (default: opus)
- `--claude-effort <level>` — override Claude effort (default: high)
- `--codex-model <model>` — override Codex model (default: gpt-5.4)
- `--codex-reasoning <level>` — override Codex reasoning effort (default: xhigh)

## Flag Validation

1. `--claude=reviewer`, `--solo=claude`, and `--solo=codex` are **mutually exclusive**. If more than one is provided, exit with error: `"Error: conflicting role flags. Use at most one of --claude=reviewer, --solo=claude, --solo=codex."`
2. Validate `<doc-path>` exists. If `--against` is provided, validate `<ref-path>` exists. Exit with error if missing.

## Role Assignment

| Flags | Reviewer | Coder |
|-------|----------|-------|
| (none) | Codex | Claude |
| `--claude=reviewer` | Claude | Codex |
| `--solo=claude` | Claude | Claude |
| `--solo=codex` | Codex | Codex |

**Flag scope:** `--claude-*` flags always apply to Claude regardless of assigned role. `--codex-*` flags always apply to Codex regardless of role. The same `--codex-model` and `--codex-reasoning` values are used for every `codex exec` invocation. In `--solo=claude` mode, `--codex-*` flags are ignored. In `--solo=codex` mode, `--claude-*` flags are ignored.

## Setup

1. Ensure `./tmp/` directory exists (create if needed). Delete stale `./tmp/fix-report.json` if it exists.
2. If `--max-iterations` is 0: skip loop entirely. Do not create any files (no review.schema.json, review.json, or iteration logs). Print and exit:
```
Ralph Wiggum Loop Skipped
  Document: <doc-path>
  No iterations run. Document was not reviewed.
```
3. Write the review JSON schema to `./tmp/review.schema.json`:

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

## Main Loop

For iteration = 1 to `--max-iterations` (default 4):

### Review Phase

Print: `[ralph] Iteration {iteration}/{max_iterations}`

**If reviewer = codex:**
1. Read `prompts/codex-reviewer.md` from this skill's directory.
2. Replace placeholders: `{{DOC_PATH}}` with `<doc-path>`, `{{AGAINST_PATH}}` with `<ref-path>` or `"none"` if --against was not provided, `{{ITERATION_NUM}}` with current iteration.
3. Write the resolved prompt to `./tmp/codex-prompt.txt`.
4. Run via Bash (timeout: 300000ms):
```bash
codex exec -s read-only \
  --model <codex-model> -c model_reasoning_effort=<codex-reasoning> \
  --output-schema ./tmp/review.schema.json \
  -o ./tmp/review.json \
  "$(cat ./tmp/codex-prompt.txt)"
```
5. If the command fails (non-zero exit): retry once. If it fails again, write an iteration log recording the error, print the "Aborted with error" terminal output (see below), and stop.

**If reviewer = claude:**
1. Read `prompts/claude-reviewer.md` from this skill's directory and follow its instructions. It will dispatch 3 parallel agents and synthesize their output into `./tmp/review.json`.

### Validation

1. Read `./tmp/review.json`.
2. Parse the JSON. If parsing fails, treat as a review failure (retry once if Codex, abort if second failure).
3. **Recount from issues array** — do not trust `critical_count` and `high_count` from the JSON. Instead:
   - `critical_count` = count of issues where `severity == "critical"`
   - `high_count` = count of issues where `severity == "high"`
   - `medium_count` = count of issues where `severity == "medium"`
   - `fact_check_accuracy` = use the value from the JSON (trusted for display)

Print: `[ralph] Reviewer (<reviewer>): {critical_count} critical, {high_count} high, {medium_count} medium`

### Stop Check

If `critical_count == 0`:
1. Write iteration log to `./tmp/iteration-{iteration}.md` with outcome "0 criticals, loop complete" and `Issues fixed: N/A`, `Issues deferred: N/A`, `Issues pushed back: N/A`, `Issues found (no disposition): N/A`.
2. Jump to **Final Report**.

### Fix Phase

Print: `[ralph] Coder (<coder>): Fixing {total_count} issues ({critical_count} critical, {high_count} high, {medium_count} medium)...`

Compute a document hash before fixing: `before_hash=$(sha256sum '<doc-path>' | cut -d' ' -f1)` via Bash.

**If coder = claude:**
1. Read `./tmp/review.json` via the Read tool.
2. Extract all issues from `./tmp/review.json`, ordered by severity (critical, high, medium).
3. Read `prompts/claude-coder.md` from this skill's directory. The orchestrator injects all issues (not just criticals) via conversation context, grouped by severity. Include instructions for producing `./tmp/fix-report.json` and for when to defer/push-back.
4. Follow its instructions to fix all issues in one pass.
5. The coder produces `./tmp/fix-report.json` alongside the edits.

**If coder = codex:**
1. Read `./tmp/review.json`.
2. Extract all issues from `./tmp/review.json`, ordered by severity (critical, high, medium).
3. Read `prompts/codex-coder.md` from this skill's directory.
4. Replace placeholders: `{{DOC_PATH}}`, `{{ALL_ISSUES}}` (rendered as numbered markdown blocks, grouped by severity), `{{AGAINST_PATH}}`.
5. Write resolved prompt to `./tmp/codex-prompt.txt`.
6. Run via Bash (timeout: 300000ms):
```bash
codex exec -s workspace-write \
  --model <codex-model> -c model_reasoning_effort=<codex-reasoning> \
  "$(cat ./tmp/codex-prompt.txt)"
```
7. If the command fails: retry once. If second failure, write iteration log with error, print "Aborted with error" output, stop.

### Fix Report (`./tmp/fix-report.json`)

The coder produces `./tmp/fix-report.json` reporting the disposition of every issue from `review.json`. Same format and completeness requirement as review-code-ralph: missing dispositions default to warning + `found`, missing/malformed file triggers error + all issues recorded as `found`.

### Verify Fix

Compute: `after_hash=$(sha256sum '<doc-path>' | cut -d' ' -f1)` via Bash.
If `before_hash == after_hash`: print `[ralph] Warning: document was not modified. Proceeding to next review.`

### Iteration Log

Written after every review phase (not just after fix). Write to `./tmp/iteration-{iteration}.md`:

```markdown
# Iteration {iteration}

**Reviewer:** {reviewer}
**Coder:** {coder}
**Issues found:** {critical_count} critical, {high_count} high, {medium_count} medium
**Outcome:** [one of: "Fixed N issues (D deferred, P pushed back), continuing" | "0 criticals, loop complete" | "Fix phase failed: <error>" | "No fixes attempted (loop aborted)"]
**Issues fixed:** {list each as [category] [severity] at [location]}
**Issues deferred:** {list each as [category] [severity] at [location] — reason}
**Issues pushed back:** {list each as [category] [severity] at [location] — reason}
**Issues found (no disposition):** {list each as [category] [severity] at [location], or "none"}
```

When no fix phase runs (stop-check iteration), set `Issues fixed`, `Issues deferred`, `Issues pushed back`, and `Issues found (no disposition)` to `N/A`.

The `Issues found (no disposition)` line captures issues where fix-report.json was incomplete or malformed — the fallback `status: found` cases. When fix-report.json is complete, this line shows "none".

Print: `[ralph] Fixed. Starting iteration {iteration + 1}.`

## Final Report

Determine status (first match wins):
1. **Issues Found**: `critical_count > 0` OR `fact_check_accuracy < 75`
2. **Approved with suggestions**: `fact_check_accuracy < 90` OR count of issues where severity is `high` or `medium` > 0
3. **Approved**: all other cases

Print the appropriate terminal block:

**If loop completed (critical_count == 0):**
```
Ralph Wiggum Loop Complete
  Document: <doc-path>
  Against: <ref-path or "standalone">
  Iterations: {iteration}/{max_iterations}
  Final status: {status}
  Remaining: 0 critical, {high_count} high, {medium_count} medium
  Fact-check accuracy: {fact_check_accuracy}%
  Iteration logs: ./tmp/iteration-1.md, ..., ./tmp/iteration-{iteration}.md
  Last review: ./tmp/review.json
```

**If max iterations exhausted:**
```
Ralph Wiggum Loop Stopped (max iterations)
  Document: <doc-path>
  Iterations: {max_iterations}/{max_iterations}
  Final status: Issues Found
  Remaining: {critical_count} critical, {high_count} high
  Could not resolve all critical issues in {max_iterations} iterations.
  Last review: ./tmp/review.json
  Iteration logs: ./tmp/iteration-1.md ... ./tmp/iteration-{max_iterations}.md
```

**If aborted with error:**
```
Ralph Wiggum Loop Error
  Document: <doc-path>
  Iterations: {iteration}/{max_iterations} (aborted)
  Error: {error_message}
  Final status: Error
  Last review: ./tmp/review.json (if exists)
  Iteration logs: ./tmp/iteration-1.md ... ./tmp/iteration-{iteration}.md
```

On abort: preserve the last valid `review.json`. Write an `iteration-{iteration}.md` recording the error.

## Error Handling

| Failure mode | Behavior |
|-------------|----------|
| Codex non-zero exit | Retry once. On second failure, abort with error. |
| JSON parse failure | Retry once (re-run review). On second failure, abort. |
| Timeout (> 300s) | Abort iteration with timeout error. |
| Codex not found | Abort immediately: "Error: `codex` CLI not found. Install Codex or use `--solo=claude`." |
