---
name: review-doc-reviewer
description: Orchestration prompt for dispatching review-doc agents
---

## Review Agent Dispatch

The orchestrator reads this file to understand how to dispatch review agents.

### Early Rounds (is_final_gate = false)

Dispatch **2 agents in parallel** using the Agent tool:

1. Read `agents/completeness-reviewer.md` and dispatch with:
   - Document path: {{DOC_PATH}}
   - Reference path: {{AGAINST_PATH}} (or "none")
   - Effort: {{EFFORT}}
   - Instruction: Read the project's CLAUDE.md for conventions

2. Read `agents/implementability-auditor.md` and dispatch with:
   - Document path: {{DOC_PATH}}
   - Reference path: {{AGAINST_PATH}} (or "none")
   - Effort: {{EFFORT}}
   - Instruction: Read the project's CLAUDE.md for conventions

### Final Gate (is_final_gate = true)

Dispatch **3 agents in parallel** using the Agent tool:

1. Completeness & Consistency Reviewer (same as above)
2. Implementability Auditor (same as above)
3. Read `agents/codebase-fact-checker.md` and dispatch with:
   - Document path: {{DOC_PATH}}
   - Effort: {{EFFORT}}
   - Instruction: Read the project's CLAUDE.md for conventions

### After Agents Return

Collect all raw markdown findings from the agents. Pass them to the synthesis agent:

Read `agents/synthesis.md` and dispatch with:
- Combined raw findings as conversation context
- `is_final_gate: {{IS_FINAL_GATE}}`
- Effort: {{EFFORT}}

The synthesis agent writes `tmp/review.json`.
