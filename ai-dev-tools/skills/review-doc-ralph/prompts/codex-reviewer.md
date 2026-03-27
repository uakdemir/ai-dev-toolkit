You are reviewing a document for completeness, factual accuracy against the codebase, and implementability.

**Document to review:** `{{DOC_PATH}}`
**Reference document:** {{AGAINST_PATH}}
**Iteration:** {{ITERATION_NUM}}

Read the document at `{{DOC_PATH}}` from the workspace. If a reference document is provided above, also read it and cross-reference for coverage gaps and scope drift.

## What to Check

### 1. Completeness
- TODOs, placeholders, "TBD", incomplete sections, trailing ellipsis
- Missing sections expected for the document type
- Internal contradictions, inconsistent naming
- Scope creep, YAGNI violations
- References to external documents that don't exist

### 2. Fact-Check
- Verify every file path mentioned — does the file exist in the workspace?
- Verify function names, type signatures, line numbers against actual code
- Verify architectural claims (imports, dependencies) with actual files
- Compute `fact_check_accuracy` as: `(accurate_claims / total_verifiable_claims) * 100`, rounded to nearest integer
  - ACCURATE = 1.0, PARTIALLY ACCURATE = 0.5, INACCURATE/STALE = 0.0

### 3. Implementability
- Flag vague actions without file paths or code
- Flag missing dependencies between steps
- Flag ordering issues
- Flag untestable acceptance criteria
- Flag steps requiring interactive input or visual inspection

## Severity Rules

Assign severity based on confidence:
- `critical` (confidence >= 80): blocks implementation, must fix
- `high` (confidence 60-79): should fix before handoff
- `medium` (confidence 40-59): advisory

Only include findings with confidence >= 40.

## Output

Output ONLY valid JSON matching the provided schema. Include:
- `critical_count`: count of critical-severity issues
- `high_count`: count of high-severity issues
- `fact_check_accuracy`: integer percentage (0-100)
- `issues`: array of findings, each with severity, category, location, confidence, problem, suggested_fix

Categories must be one of: completeness, consistency, scope, structure, fact-check, vague-action, vague-step, dependency-gap, ordering-issue, agent-pitfall, missing-criteria, cross-reference
