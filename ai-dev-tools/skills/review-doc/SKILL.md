---
name: review-doc
description: Use when reviewing analysis specs, design documents, or implementation plans for completeness, accuracy, and implementability. Also use when asked to verify a spec or plan before implementation, check if a document is ready for handoff, or validate claims in a technical document against the codebase. Invoke with /review-doc <path> optionally followed by --against <reference-path>. Add --codex to use Codex CLI instead of Claude agents.
---

# Review Doc

Review a spec or plan document for completeness, factual accuracy, and implementability. Synthesize findings into a prioritized report.

**Output:** Always saved to `tmp/review_analysis.md` (matches `/respond-to-review` input convention).

## Argument Parsing

Parse arguments after `/review-doc`:

| Input | Behavior |
|---|---|
| `/review-doc docs/specs/foo.md` | Review standalone (Claude agents) |
| `/review-doc docs/specs/foo.md --against docs/specs/bar.md` | Review with cross-reference (Claude agents) |
| `/review-doc docs/specs/foo.md --codex` | Review standalone (Codex CLI) |
| `/review-doc docs/specs/foo.md --against docs/specs/bar.md --codex` | Review with cross-reference (Codex CLI) |

**Rules:**
- First token is always the document path to review
- `--against <path>` is optional — provides a reference document for cross-checking (e.g., reviewing a plan against its spec)
- If `--against` is not provided, agents review the document standalone
- `--codex` — use Codex CLI instead of Claude parallel agents
- `--codex-model <model>` — override Codex model (default: `o3`)
- `--codex-reasoning <level>` — override Codex reasoning effort (default: `high`)

## Reviewer: Claude Agents (default)

Dispatch three parallel Opus agents. Read each agent prompt file before dispatching. Launch all three **in parallel** using the Agent tool with `model: "opus"`.

Each agent receives:
- The document path to review
- The `--against` reference path (if provided)
- Instruction to read the project's CLAUDE.md for conventions

**Agent 1 — Completeness & Consistency Reviewer:**
Read `~/.claude/skills/review-doc/agents/completeness-reviewer.md` and dispatch.

**Agent 2 — Codebase Fact-Checker:**
Read `~/.claude/skills/review-doc/agents/codebase-fact-checker.md` and dispatch.

**Agent 3 — Implementability Auditor:**
Read `~/.claude/skills/review-doc/agents/implementability-auditor.md` and dispatch.

### Agent Synthesis

After all three agents return:

1. **Deduplicate** — merge findings that flag the same section/issue from different angles
2. **Filter** — drop findings with confidence below 40
3. **Cap** — maximum 20 findings
4. **Categorize** by severity:
   - **Critical** (confidence >= 80): blocks implementation, must fix
   - **Important** (confidence 60-79): should fix before handoff
   - **Minor** (confidence 40-59): advisory, nice to fix
5. **Fact-check summary** — include the accuracy table from the Codebase Fact-Checker
6. **Write report** to `tmp/review_analysis.md` (create `tmp/` if needed)
7. **Print verdict** to terminal

## Reviewer: Codex CLI (`--codex`)

Single-pass review via Codex CLI. Combines all three review concerns (completeness, fact-check, implementability) in one prompt.

### Setup

1. Ensure `./tmp/` directory exists.
2. Write the review JSON schema to `./tmp/review-doc.schema.json`:

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

### Dispatch

1. Read `prompts/codex-reviewer.md` from this skill's directory.
2. Replace placeholders: `{{DOC_PATH}}` with `<doc-path>`, `{{AGAINST_PATH}}` with `<ref-path>` or `"none"`, `{{ITERATION_NUM}}` with `1`.
3. Write the resolved prompt to `./tmp/codex-prompt.txt`.
4. Run via Bash (timeout: 300000ms):
```bash
codex exec -s read-only \
  --model <codex-model> -c model_reasoning_effort=<codex-reasoning> \
  --output-schema ./tmp/review-doc.schema.json \
  -o ./tmp/review.json \
  "$(cat ./tmp/codex-prompt.txt)"
```
5. If the command fails (non-zero exit): retry once. If it fails again, print error and stop.
6. If `codex` is not found: print `"Error: codex CLI not found. Run without --codex to use Claude agents."` and stop.

### Codex JSON → Report Conversion

1. Read `./tmp/review.json`.
2. Parse the JSON. Recount severities from the issues array (do not trust `critical_count`/`high_count`).
3. Cap at 20 findings: keep all critical and high first, then fill with medium by descending confidence.
4. Convert to the markdown report format (see Report Format below):
   - Map `fact_check_claims` → Fact-Check Summary table
   - Map `critical` severity → Critical section
   - Map `high` severity → Important section
   - Map `medium` severity → Minor section
   - Use `fact_check_accuracy` from the JSON
5. Write to `tmp/review_analysis.md`.
6. Print verdict to terminal.

## Report Format

Write this to `tmp/review_analysis.md`:

```markdown
# Document Review

**Date:** [YYYY-MM-DD HH:MM]
**Reviewed:** [document path]
**Against:** [reference path, or "standalone"]
**Status:** Approved | Approved with suggestions | Issues Found

---

## Fact-Check Summary

| Claim | Verdict |
|---|---|
| [claim] | ACCURATE / INACCURATE / STALE |

**Accuracy rate:** X of Y verifiable claims accurate (Z%)

---

## Critical (must fix)

### 1. [Finding title]
**Confidence:** N/100 | **Category:** [completeness|consistency|scope|fact-check|implementability]
**Location:** [section/heading in document]

**Problem:** [description]
**Suggested fix:** [concrete suggestion]

---

## Important (should fix)

[same format]

---

## Minor (advisory)

[same format]

---

## Verdict

[2-3 sentences: overall assessment, readiness for implementation, biggest risk]
```

## Terminal Output

After saving the report, print only:

```
Document Review Complete
  Reviewed: [document path]
  Against: [reference path or "standalone"]
  Status: [Approved | Approved with suggestions | Issues Found]
  Fact-check: X/Y claims accurate (Z%)
  Critical: N | Important: N | Minor: N
  Report: tmp/review_analysis.md
```

## Status Logic

- **Approved:** Zero critical findings AND fact-check accuracy >= 90%
- **Approved with suggestions:** Zero critical findings but has important/minor findings, or accuracy 75-89%
- **Issues Found:** Any critical findings OR fact-check accuracy < 75%
