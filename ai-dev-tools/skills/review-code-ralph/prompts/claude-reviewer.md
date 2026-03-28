# Claude Reviewer — Single-Pass Code Review

Perform a single-pass code review and output the results as JSON.

Apply {{CLAUDE_EFFORT}} thoroughness in your review.

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

## Review Categories

Check for these categories based on available context:

- **bug** (always): Logic errors, unhandled edge cases, race conditions, data integrity, missing boundary error handling
- **architecture** (only if CLAUDE.md or ADRs provided): Conflicts with architecture constraints. Skip if no constraints above.
- **spec-drift** (only if spec provided): Divergences from the spec. Skip if no spec above.
- **security** (always): OWASP Top 10, injection risks, auth bypass, exposed secrets
- **test-gap** (always): Risky logic paths without meaningful test coverage

## Severity Rules

Assign severity based on confidence:
- `critical` (confidence >= 80): blocks implementation, must fix
- `high` (confidence 60-79): should fix before merge
- `medium` (confidence 40-59): advisory

Only include findings with confidence >= 40.

## Output Format

Output ONLY valid JSON matching this exact schema. Do NOT output markdown, explanations, or anything else — just the JSON object.

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

Your output must be a valid instance of this schema — not the schema itself. Example structure:
```json
{
  "critical_count": 2,
  "high_count": 1,
  "fact_check_accuracy": 100,
  "issues": [
    {
      "severity": "critical",
      "category": "bug",
      "location": "src/auth.ts:42",
      "confidence": 90,
      "problem": "Missing null check on user object",
      "suggested_fix": "Add null guard before accessing user.email"
    }
  ]
}
```

**fact_check_accuracy:** If no spec was provided above, set to 100. Otherwise, count verifiable spec claims in the code, verify them, and compute: `(accurate / total) * 100`, rounded to nearest integer.

Write the JSON to `./tmp/review.json`.
