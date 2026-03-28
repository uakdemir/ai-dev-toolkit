---
name: review-code-ralph
description: Iterative code review loop between Claude and Codex. Reviews commits, fixes critical issues, runs verification commands, and loops until zero criticals and no verification regressions. Use when you want automated multi-pass code quality improvement.
---

# Review Code Ralph

Orchestrate iterative "review -> fix -> verify" cycles between Claude Code and Codex CLI until code has zero critical issues and no verification regressions.

## Argument Parsing

Parse arguments after `/review-code-ralph`:

- First token: `<commit-count>` (required) — number of recent commits to review
- `--against <spec-path>` — optional analysis/spec doc as implementation contract
- `--verify "<command>"` — verification command (repeatable, e.g., `--verify "npm test" --verify "npm run lint"`)
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
2. Validate `<commit-count>` is a positive integer. If `--against` is provided, validate the path exists. Exit with error if invalid.

## Pre-Flight Checks

1. Verify `git rev-parse HEAD` succeeds. If not, exit: `"Error: no commits in repository."`
2. If current branch is `main` or `master`, print: `"[ralph] Warning: you are on branch 'main'. Fix commits will land here. Continue?"` If user declines or response is ambiguous, abort without creating files.
3. If `git status --porcelain` is non-empty, print: `"[ralph] Working tree is dirty. Please commit or stash your changes before running review-code-ralph."` Do not proceed until working tree is clean.

## Max-Iterations Zero Check

If `--max-iterations` is 0: print the following and stop. Do not create any files.
```
Ralph Wiggum Loop Skipped
  Scope: last <commit-count> commits
  No iterations run. Code was not reviewed.
```

## Role Assignment

| Flags | Reviewer | Coder |
|-------|----------|-------|
| (none) | Codex | Claude |
| `--claude=reviewer` | Claude | Codex |
| `--solo=claude` | Claude | Claude |
| `--solo=codex` | Codex | Codex |

**Flag scope:** `--claude-*` flags always apply to Claude regardless of assigned role. `--codex-*` flags always apply to Codex regardless of role. The same `--codex-model` and `--codex-reasoning` values are used for every `codex exec` invocation. In `--solo=claude` mode, `--codex-*` flags are ignored. In `--solo=codex` mode, `--claude-*` flags are ignored.

**Orchestrator role:** In all modes including `--solo=codex`, Claude remains the orchestrator (loop control, SHA tracking, verification, logging). Only the review and fix phases are delegated.

## Verification Command Detection

### If `--verify` flags provided

Use those exactly. Confirm with user via chat:

```
[ralph] Verification commands configured:
  1. <command1>
  2. <command2>

Please confirm these are correct, or tell me what to change.
```

Wait for the user's chat reply. Interpret their natural-language response. If ambiguous, ask again (max 2 retries, then proceed with configured commands).

### If no `--verify` flags: auto-detect

Detect from project files (check all, combine results):

| File | Detection |
|------|-----------|
| `package.json` | Look for `scripts.test`, `scripts.lint`, `scripts.typecheck` (only scripts that exist) |
| `Makefile` | Look for `test`, `lint`, `check` targets |
| `pyproject.toml` | `[tool.pytest]` → `pytest`, `[tool.ruff]` → `ruff check .`, `[tool.mypy]` → `mypy .` |
| `Cargo.toml` | Infer `cargo test`, `cargo clippy` |

Detection checks the root-level project file only. Present detected commands and ask user to confirm via chat:

```
[ralph] Auto-detected verification commands:
  1. <detected1>
  2. <detected2>

Please confirm, or tell me what to add/remove.
```

### If nothing detected and no `--verify`

```
[ralph] No verification commands detected.
Linting and testing should not be skipped. What commands should I run for this project?
```

## ADR Discovery

When building the reviewer prompt, look for Architecture Decision Records:

1. Check these paths in order: `docs/architecture/adrs.md`, `docs/adrs/`, `docs/adr/`, `adr/`
2. First match wins. If a directory is found, read all `.md` files in it.
3. If total ADR content exceeds 200 lines, truncate to the most recent files (by file modification time, newest first) that fit.
4. If no ADRs found, skip — the Architecture category still applies if CLAUDE.md exists.

## Setup

1. Ensure `./tmp/` directory exists (create if needed). Delete stale `./tmp/iteration-*.md` files.
2. Write the review JSON schema to `./tmp/review.schema.json`:

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
            "bug", "architecture", "spec-drift", "security", "test-gap"
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

3. Capture verification baseline: run all confirmed verification commands and record results to `./tmp/verification-baseline.json`:

```json
{
  "commands": [
    {
      "command": "<command>",
      "exit_code": <integer>
    }
  ],
  "captured_at": "<ISO timestamp>"
}
```

Print baseline results:
```
[ralph] Capturing verification baseline...
[ralph] <command1>: PASS/FAIL
[ralph] <command2>: PASS/FAIL
[ralph] Baseline captured. Pre-existing failures will not block the loop.
```

## Diff Collection

### First iteration

Compute the diff for the last `<commit-count>` commits:

```bash
base_sha=$(git rev-parse HEAD~<commit-count> 2>/dev/null)
```

If `base_sha` succeeded: `git diff $base_sha..HEAD`
If `base_sha` failed (fewer commits than requested): diff against empty tree: `git diff $(git hash-object -t tree /dev/null)..HEAD` — this includes the root commit's changes.

### Subsequent iterations

Diff the fix commits: `git diff $before_sha..$after_sha`

### Diff Size Management

Max budget: 3000 lines of diff output.

If under budget: include the full diff.

If over budget:
1. Include `git diff --stat` (does NOT count against budget)
2. Use `git diff --numstat` for exact per-file line counts
3. Sort files by total lines changed (insertions + deletions) descending
4. Greedily include full diffs largest-first until the next file would exceed remaining budget
5. Remaining files appear as stat-only summaries

## Main Loop

For iteration = 1 to `--max-iterations` (default 4):

### Review Phase

Print: `[ralph] Iteration {iteration}/{max_iterations}`
Print: `[ralph] Reviewing <scope description>`

**If reviewer = codex:**
1. Read `prompts/codex-reviewer.md` from this skill's directory.
2. Replace placeholders: `{{GIT_DIFF}}`, `{{SPEC_CONTENT}}`, `{{CLAUDE_MD}}`, `{{ADRS}}`, `{{PREVIOUS_FINDINGS}}`, `{{ITERATION_NUM}}`.
3. Write the resolved prompt to `./tmp/codex-prompt.txt`.
4. Run via Bash (timeout: 300000ms):
```bash
codex exec -s read-only \
  --model <codex-model> -c model_reasoning_effort=<codex-reasoning> \
  --output-schema ./tmp/review.schema.json \
  -o ./tmp/review.json \
  "$(cat ./tmp/codex-prompt.txt)"
```
5. If the command fails: retry once. If second failure, write iteration log with error, print "Aborted with error" output, stop.

**If reviewer = claude:**
1. Gather the same context as the Codex reviewer path: collect the git diff, read the spec (if `--against`), read CLAUDE.md (if exists), read ADRs (per ADR Discovery), and collect previous iteration findings (if iteration > 1).
2. Read `prompts/claude-reviewer.md` from this skill's directory.
3. Replace placeholders: `{{GIT_DIFF}}`, `{{SPEC_CONTENT}}`, `{{CLAUDE_MD}}`, `{{ADRS}}`, `{{PREVIOUS_FINDINGS}}`, `{{ITERATION_NUM}}`, `{{CLAUDE_EFFORT}}`.
4. Follow the resolved instructions. Claude produces JSON directly to `./tmp/review.json`.

### Validation

1. Read `./tmp/review.json`.
2. Parse the JSON. If parsing fails, treat as review failure (retry once if Codex, abort if second failure).
3. **Schema validation:** Verify required top-level fields exist (`critical_count`, `high_count`, `issues`, `fact_check_accuracy`). Verify each issue has required fields (`severity`, `category`, `location`, `confidence`, `problem`, `suggested_fix`). Verify `severity` values are in `["critical", "high", "medium"]` and `category` values are in `["bug", "architecture", "spec-drift", "security", "test-gap"]`. If validation fails, treat as a schema-validation failure (retry once if Codex, abort if second failure).
4. **Recount from issues array:**
   - `critical_count` = count of issues where `severity == "critical"`
   - `high_count` = count of issues where `severity == "high"`
   - `medium_count` = count of issues where `severity == "medium"`
   - If no `--against` was provided, override `fact_check_accuracy` to 100.

Print: `[ralph] Reviewer (<reviewer>): {critical_count} critical, {high_count} high, {medium_count} medium`

### Stop Check

If `critical_count == 0`:
1. Run verification commands, compare to baseline.
2. If no regressions: write iteration log with outcome "0 criticals + verification pass, loop complete", jump to **Final Report**.
3. If regressions: inject synthetic critical issues into review.json — one per regression with `category: "bug"`, `severity: "critical"`, `confidence: 85`, describing the verification failure. Continue to Fix Phase.

### Fix Phase

Print: `[ralph] Coder (<coder>): Fixing {critical_count} critical issues...`

Record: `before_sha=$(git rev-parse HEAD)`

**If coder = claude:**
1. Read `./tmp/review.json` via the Read tool.
2. Extract all issues where `severity == "critical"`.
3. Collect any verification regressions from the previous Verify step (persisted between iterations).
4. Read `prompts/claude-coder.md` from this skill's directory. Replace `{{CRITICAL_ISSUES}}` with the extracted criticals and `{{VERIFICATION_REGRESSIONS}}` with any regression details.
5. Follow its instructions to fix all critical issues and regressions in one pass.
6. Commit: `fix(ralph): resolve N critical issues from iteration M`

**If coder = codex:**
1. Read `./tmp/review.json`.
2. Extract all issues where `severity == "critical"`.
3. Read `prompts/codex-coder.md` from this skill's directory.
4. Replace placeholders: `{{CRITICAL_ISSUES}}` (rendered as numbered markdown blocks with `location` field for file targeting), `{{VERIFICATION_REGRESSIONS}}`, `{{SPEC_CONTENT}}`, `{{ITERATION_NUM}}`.
5. Write resolved prompt to `./tmp/codex-prompt.txt`.
6. Run via Bash (timeout: 300000ms):
```bash
codex exec -s workspace-write \
  --model <codex-model> -c model_reasoning_effort=<codex-reasoning> \
  "$(cat ./tmp/codex-prompt.txt)"
```
7. If the command fails: retry once. If second failure, write iteration log with error, print "Aborted with error" output, stop.

### Post-Fix: SHA Tracking and Auto-Commit

Record: `after_sha=$(git rev-parse HEAD)`

**If coder was Codex:** The orchestrator always checks for uncommitted changes after Codex returns, regardless of whether Codex committed.

**If `before_sha == after_sha` (no commits made):**
1. Check `git status` for changes. If untracked files are present, ask user: `"[ralph] New files detected: <list>. Include in fix commit? (y/n)"`. If yes: `git add -A` and commit. If no: abort the loop: `"[ralph] Aborting — untracked files must be resolved before continuing. Please include, delete, or .gitignore them and re-run."`
2. If only tracked-file modifications: `git add -u` and commit: `fix(ralph): resolve N critical issues from iteration M`.
3. Re-check `after_sha`. If still no changes: log warning, next iteration re-reviews same scope.
4. A "no changes" iteration counts toward `--max-iterations`.

### Verify

Run all verification commands. Compare each exit code to the verification baseline:

| Baseline exit code | Current exit code | Result |
|-------------------|-------------------|--------|
| 0 (pass) | 0 (pass) | OK |
| 0 (pass) | non-zero (fail) | REGRESSION |
| non-zero (fail) | same non-zero | OK (pre-existing) |
| non-zero (fail) | different non-zero | POSSIBLE REGRESSION |
| non-zero (fail) | 0 (pass) | IMPROVEMENT |

Print: `[ralph] Verification: <command1> PASS | <command2> REGRESSION | ...`

**Persist regressions:** If any regressions were detected, store the details (command, expected exit code, actual exit code) for the next iteration. These are passed to both the reviewer (via `{{PREVIOUS_FINDINGS}}` context) and the coder (via `{{VERIFICATION_REGRESSIONS}}`). Regressions persist until the verification command passes again.

### Iteration Log

Write to `./tmp/iteration-{iteration}.md`:

```markdown
# Iteration {iteration}

**Reviewer:** {reviewer}
**Coder:** {coder}
**Scope:** last {commit-count} commits | commits {before_sha}..{after_sha}
**Critical issues found:** {critical_count}
**Outcome:** [one of: "Fixed N issues, continuing" | "0 criticals + verification pass, loop complete" | "Fix phase failed: <error>" | "No fixes attempted (loop aborted)"]
**Issues fixed:** [list as [category] at [file:line], or "N/A" if no fix phase ran]
**Commits added:** {after_sha short} (or "none")
**Verification:** {command1} PASS | {command2} REGRESSION | ...
```

Print: `[ralph] Fixed. Starting iteration {iteration + 1}.`

## Final Report

Determine status (first match wins):
1. **Error**: loop aborted. Outside review taxonomy.
2. **Issues Found**: `critical_count > 0` OR `fact_check_accuracy < 75` OR verification regressions present
3. **Approved with suggestions**: `fact_check_accuracy < 90` OR high/medium issues remain
4. **Approved**: all other cases

Print the appropriate terminal block:

**If loop completed (critical_count == 0, no regressions):**
```
Ralph Wiggum Loop Complete
  Scope: last {commit-count} commits against {spec or "standalone"}
  Iterations: {iteration}/{max_iterations}
  Final status: {status}
  Remaining: 0 critical, {high_count} high, {medium_count} medium
  Verification: all passing (no regressions from baseline)
  Commits added: {list of fix commit SHAs}
  Iteration logs: ./tmp/iteration-1.md, ..., ./tmp/iteration-{iteration}.md
  Last review: ./tmp/review.json
```

**If max iterations exhausted:**
```
Ralph Wiggum Loop Stopped (max iterations)
  Scope: last {commit-count} commits against {spec or "standalone"}
  Iterations: {max_iterations}/{max_iterations}
  Final status: Issues Found
  Remaining: {critical_count} critical, {high_count} high
  Verification: {summary}
  Could not resolve all critical issues in {max_iterations} iterations.
  Last review: ./tmp/review.json
  Iteration logs: ./tmp/iteration-1.md ... ./tmp/iteration-{max_iterations}.md
```

**If aborted with error:**
```
Ralph Wiggum Loop Error
  Scope: last {commit-count} commits
  Iterations: {iteration}/{max_iterations} (aborted)
  Error: {error_message}
  Final status: Error
  Verification: {last known status or "not run since last fix"}
  Last review: ./tmp/review.json (if exists)
  Iteration logs: ./tmp/iteration-1.md ... ./tmp/iteration-{iteration}.md
```

On abort: preserve last valid `review.json`. Write `iteration-{iteration}.md` recording the error.

## Error Handling

| Failure mode | Behavior |
|-------------|----------|
| Codex non-zero exit | Retry once. On second failure, abort with error. |
| JSON parse failure | Retry once (re-run review). On second failure, abort. |
| Timeout (> 300s) | Abort iteration with timeout error. Use `timeout: 300000` on Bash tool call. |
| Codex not found | Abort immediately: "Error: `codex` CLI not found. Install Codex or use `--solo=claude`." |

Verification command failures are NOT errors — they are data for regression comparison.
