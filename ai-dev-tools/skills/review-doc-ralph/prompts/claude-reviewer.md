# Claude Reviewer — Agent Dispatch and Synthesis

Follow these instructions to review `{{DOC_PATH}}` using three parallel agents from the sibling `review-doc` skill.

## Step 1: Dispatch Three Agents in Parallel

Read the following agent prompt files and dispatch each as a parallel Agent with `model: "<claude-model>"` (default: opus). Include "Apply <claude-effort> thoroughness in your review" in each agent's prompt.

Each agent receives:
- The document path: `{{DOC_PATH}}`
- The reference path (if provided): `{{AGAINST_PATH}}`
- Instruction to read the project's CLAUDE.md for conventions (if it exists)

**Agent 1 — Completeness & Consistency Reviewer:**
Read the agent prompt from the sibling skill: `{skill-base-dir}/../review-doc/agents/completeness-reviewer.md`

**Agent 2 — Codebase Fact-Checker:**
Read the agent prompt from: `{skill-base-dir}/../review-doc/agents/codebase-fact-checker.md`

**Agent 3 — Implementability Auditor:**
Read the agent prompt from: `{skill-base-dir}/../review-doc/agents/implementability-auditor.md`

Where `{skill-base-dir}` is the directory containing this file (i.e., the `prompts/` directory's parent, `review-doc-ralph/`).

## Step 2: Synthesize into JSON

After all three agents return their markdown findings:

1. **Deduplicate** — two findings are duplicates if they share the same `location` AND address the same underlying deficiency. When merging, prefer higher confidence. If categories differ, keep both.
2. **Filter** — drop findings with confidence < 40.
3. **Categorize by severity** — map confidence to severity: >= 80 = critical, 60-79 = high, 40-59 = medium.
4. **Map fact-checker verdicts** — for the fact-checker agent's findings, assign fixed confidence by verdict type: INACCURATE -> confidence 85 (critical), STALE -> confidence 70 (high), PARTIALLY ACCURATE -> confidence 50 (medium).
5. **Cap at 20** — keep all critical and high severity findings first, then fill remaining slots with medium by descending confidence. If critical + high exceed 20, raise the cap to include all of them.
6. **Compute fact_check_accuracy** — from the fact-checker agent's summary line ("X of Y verifiable claims are accurate (Z%)"), apply the formula: `(accurate + 0.5 * partially_accurate) / total * 100`, rounded to nearest integer.
7. **Count** — `critical_count` = count of issues with severity "critical". `high_count` = count with severity "high".
8. **Write JSON** — construct a JSON object matching the review schema and write it to `./tmp/review.json`.

The JSON must match this structure exactly:
```json
{
  "critical_count": <integer>,
  "high_count": <integer>,
  "fact_check_accuracy": <integer 0-100>,
  "issues": [
    {
      "severity": "critical" | "high" | "medium",
      "category": "<one of 12 categories>",
      "location": "<section or heading>",
      "confidence": <integer 40-100>,
      "problem": "<description>",
      "suggested_fix": "<concrete suggestion>"
    }
  ]
}
```
