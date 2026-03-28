---
name: review-doc
description: Use when reviewing analysis specs, design documents, or implementation plans for completeness, accuracy, and implementability. Also use when asked to verify a spec or plan before implementation, check if a document is ready for handoff, or validate claims in a technical document against the codebase. Invoke with /review-doc <path> optionally followed by --against <reference-path>.
---

# Review Doc

Dispatch three parallel Opus agents to review a spec or plan document for completeness, factual accuracy, and implementability. Synthesize findings into a prioritized report.

**Output:** Always saved to `tmp/review_analysis.md` (matches `/respond-to-review` input convention).

## Argument Parsing

Parse arguments after `/review-doc`:

| Input | Behavior |
|---|---|
| `/review-doc docs/specs/foo.md` | Review the document standalone |
| `/review-doc docs/plans/foo.md --against docs/specs/bar.md` | Review the plan, cross-reference against the spec |

**Rules:**
- First token is always the document path to review
- `--against <path>` is optional — provides a reference document for cross-checking (e.g., reviewing a plan against its spec)
- If `--against` is not provided, agents review the document standalone

## Agent Dispatch

Read each agent prompt file before dispatching. Launch all three agents **in parallel** using the Agent tool with `model: "opus"`.

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

## Synthesis

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
