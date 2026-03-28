You are performing a code review on recent commits.

**Iteration:** {{ITERATION_NUM}}

## Code Changes to Review

{{GIT_DIFF}}

## Implementation Spec

{{SPEC_CONTENT}}

## Project Constraints (CLAUDE.md)

{{CLAUDE_MD}}

## Architecture Decision Records

{{ADRS}}

## Previous Iteration Findings (if any)

{{PREVIOUS_FINDINGS}}

## What to Check

Review the code changes above for:

### Bug (always check)
- Logic errors, unhandled edge cases, race conditions, data integrity issues
- Missing boundary error handling

### Architecture (only if CLAUDE.md or ADRs provided above)
- Conflicts with CLAUDE.md rules or ADR constraints
- Skip this category if no constraints are provided above.

### Spec Drift (only if Implementation Spec provided above)
- Divergences from the spec/analysis document
- Skip this category if no spec is provided above.

### Security (always check)
- OWASP Top 10, injection risks, auth bypass, exposed secrets

### Test Gap (always check)
- Risky logic paths without meaningful test coverage

## Severity Rules

Assign severity based on confidence:
- `critical` (confidence >= 80): blocks implementation, must fix
- `high` (confidence 60-79): should fix before merge
- `medium` (confidence 40-59): advisory

Only include findings with confidence >= 40.

## Output

Output ONLY valid JSON matching the provided schema. Include:
- `critical_count`: count of critical-severity issues
- `high_count`: count of high-severity issues
- `fact_check_accuracy`: integer percentage (0-100). If no spec was provided, set to 100. If a spec was provided, count verifiable spec claims in the code (e.g., "function X exists", "module A imports B"), verify them, and compute: `(accurate / total) * 100`, rounded to nearest integer.
- `issues`: array of findings, each with severity, category, location, confidence, problem, suggested_fix

Categories must be one of: `bug`, `architecture`, `spec-drift`, `security`, `test-gap`

Location format: `file/path.ext:line_number` when possible, or `file/path.ext` if line is unclear.
