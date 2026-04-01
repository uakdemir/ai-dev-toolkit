# Handoff Pipeline Bugfixes

**Status:** Draft
**Date:** 2026-04-01
**Scope:** orchestrate + session-handoff skills
**Approach:** Cohesive redesign (Approach B) — one coherent update per skill

## Problem

Five bugs across orchestrate and session-handoff break the handoff pipeline:

| # | Bug | Skill |
|---|-----|-------|
| 1 | writing-plans' "Execution Handoff" preempts orchestrate's 4-option execution model menu at Step 5 | orchestrate |
| 2 | session-handoff writes to CWD-relative path without explicit anchoring | session-handoff |
| 3 | orchestrate never reads session-handoff.md on startup (generates handoffs but never consumes them) | orchestrate |
| 4 | session-handoff skips in-progress skill checklist steps, lists downstream actions as "next" | session-handoff |
| 5 | session-handoff scans full conversation context (verbose LLM responses waste tokens and obscure signal) | session-handoff |

Additionally, two improvements are bundled:

| # | Improvement | Skill |
|---|-------------|-------|
| 6 | Orchestrate should output a wrapped next-command for breadcrumb trail in user message history | orchestrate |
| 7 | session-handoff SKILL.md is too large (~10.5KB) for a skill invoked at RED context zone | session-handoff |
| 8 | Plan checkboxes create a conflicting progress source alongside the hint file — remove them | orchestrate |

## Decisions

- **Bug #1 fix location:** Orchestrate-side only (Step 4 dispatch instruction). No changes to `superpowers:writing-plans`.
- **Bug #2 fix:** Explicit `./tmp/session-handoff.md` (CWD-relative). No git-root resolution — CWD is always the correct project root.
- **Bug #3 approach:** Option C from bug report — read handoff early, convert to hint file, let Fast-Path Detection proceed normally.
- **Bugs #4-5 fix:** All three layers — task list cross-reference, skill state awareness, next-action validation. Scan user messages only, not full conversation context.
- **Improvement #6 format:** Wrapped syntax `/orchestrate (/inner-command args)` for scannable breadcrumb trail in user message history.
- **Improvement #7 approach:** Move edge cases and error handling to `references/edge-cases.md`, keep happy path in SKILL.md.
- **Improvement #8:** Remove plan checkboxes. Hint file is the sole authority for progress tracking.

---

## Change 1: Orchestrate Skill Updates

Three modifications to `ai-dev-tools/skills/orchestrate/SKILL.md` plus one to `ai-dev-tools/skills/orchestrate/references/implementation-step.md`.

### 1A. Session Bootstrap Phase (Bug #3)

**Location:** New phase between "Mode Selection" and "Step 0: Context Health Check".

**Spec:**

```markdown
## Session Bootstrap (before Step 0)

Runs on every invocation, before Step 0.

1. Check if `./tmp/session-handoff.md` exists.
2. If not found → skip, proceed to Step 0.
3. If found → read YAML frontmatter `generated` timestamp.
   - If older than 24 hours → print "Stale session handoff (>24h), ignoring." → proceed to Step 0.
   - If recent (< 24h) → parse content:
     a. Extract feature name from Done/Pending sections.
     b. Determine step number by scanning Pending items for skill references and file paths:
        - Pending mentions spec review or /review-doc → step 2
        - Pending mentions respond to review → step 3
        - Pending mentions write plan or /writing-plans → step 4
        - Pending mentions implement or execution → step 5
        - Pending mentions code review or /review-code → step 6
        - Pending mentions fix findings → step 7
        - Pending mentions finalize or complete → step 8
        - No match → step 1 (start fresh)
     c. Extract spec and plan paths from file path references in the content.
     d. Write `./tmp/orchestrate-state.md` with extracted data. Preserve existing `mode` field
        if hint file already exists. Set `head` to current `git rev-parse HEAD`.
     e. Print: "Resumed from session handoff: <feature>, step <N>"
4. Proceed to Step 0 (Fast-Path Detection finds the newly written or updated hint file).
```

**Integration:** This phase runs after mode resolution (so `mode` is known) but before Step 0 context estimation. If the hint file already has valid cycle state (non-empty `feature`), Session Bootstrap is a no-op — Fast-Path Detection handles it. Session Bootstrap only fires when the hint file is missing or has no valid cycle state AND a recent session-handoff.md exists.

### 1B. Step 4 Guard Against Writing-Plans Handoff (Bug #1)

**Location:** `ai-dev-tools/skills/orchestrate/SKILL.md`, Step 4 description.

**Current text:**
> Spec Approved, no matching plan. ADR extraction inline per `ai-dev-tools/skills/document-for-ai/references/adr-extraction.md`, then invoke `superpowers:writing-plans`.

**Change:** Append dispatch instruction:

```
When invoking superpowers:writing-plans, prepend to the dispatch prompt:

"After saving the plan, do NOT present the Execution Handoff section.
Return control to the caller. Orchestrate manages execution model
selection at Step 5."
```

### 1C. Wrapped Next-Command Output (Improvement #6)

**Location:** Every step's exit point in `ai-dev-tools/skills/orchestrate/SKILL.md`.

**Format:**

```
── Next ────────────────────────────────────────
/orchestrate (/next-skill-command args)
────────────────────────────────────────────────
```

**Step-to-command mapping:**

| After Step | Next Command |
|---|---|
| 1 (Brainstorm) | `/orchestrate (/review-doc <spec_path> --max-iterations 3)` |
| 2 (Spec Review) | `/orchestrate (/respond-to-review <round> <spec_path>)` if criticals >0, else `/orchestrate` (advance to Step 4) |
| 3 (Respond to Review) | `/orchestrate (/review-doc <spec_path> --max-iterations 3)` for re-review, or `/orchestrate` if advancing to Step 4 |
| 4 (Write Plan) | `/orchestrate` (Step 5 requires its own analysis before recommending a specific command) |
| 5 (Implement) | `/orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)` |
| 6 (Code Review) | `/orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)` if findings, else `/orchestrate` (advance to Step 8) |
| 7 (Fix Findings) | `/orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)` |
| 8 (Complete) | `/orchestrate` for next feature or new cycle |

**Parsing behavior:** When orchestrate receives `/orchestrate (/some-command args)`:

1. Extract the inner command from parentheses.
2. Update the hint file (record the step transition).
3. Dispatch the inner command via the Skill tool.
4. After the inner command completes, orchestrate resumes control for state update + next-command output.

**Edge cases:**

- Plain `/orchestrate` (no parens) — normal flow, detect state from hint file.
- User modifies the inner command before pasting — orchestrate dispatches whatever is in the parens verbatim.
- Inner command fails — existing error handling (Retry/Skip/Exit).

### 1D. Remove Plan Checkboxes (Improvement #8)

**Location:** `ai-dev-tools/skills/orchestrate/SKILL.md`, Step 5 description and `references/implementation-step.md`.

**Change:** Remove all references to plan checkbox tracking (`[x]`, `[ ]`). The hint file `step` field is the sole authority for progress. Step 5's completion condition changes from "all checkboxes `[x]`" to orchestrate's hint file indicating step advancement (e.g., user confirms implementation is done, or orchestrate detects commits since plan).

**Step-specific validation update:** Step 5 validation changes from "plan checkboxes" to "commits since plan_hash" — same mechanism already used by Step 6. If commits exist since plan_hash, implementation has started or completed.

---

## Change 2: Session-Handoff Skill Updates

Modifications to `ai-dev-tools/skills/session-handoff/SKILL.md` plus a new `references/edge-cases.md`.

### 2A. Explicit CWD-Relative Path (Bug #2)

**Location:** `ai-dev-tools/skills/session-handoff/SKILL.md`, Step 3.

**Change:** Replace all references to `tmp/session-handoff.md` with `./tmp/session-handoff.md`. This explicitly anchors to CWD, ensuring consistent write/read location.

### 2B. User Message Scanning (Bug #5)

**Location:** `ai-dev-tools/skills/session-handoff/SKILL.md`, Step 1 "Conversation Analysis" section.

**Replace** the current "Conversation Analysis (Context Layer)" section with:

```markdown
### Conversation Analysis (User Messages Only)

Scan ONLY the user's messages in the conversation. Do not scan LLM responses
or tool results — they are verbose and waste context tokens.

From user messages, extract:

**Done:** Commands the user ran — skill invocations, /orchestrate calls,
  /orchestrate (/...) wrapped commands. Each invocation = one completed action.

**Pending:** Explicit deferrals in user messages ("later", "next session",
  "TODO", "skip for now"). Also: uncompleted /orchestrate (/...) breadcrumbs
  where a wrapped command was dispatched but no follow-up invocation exists
  for the expected next step.

**Decisions:** User choices ("go with A", "option 2", "yes to X", "no,
  because Y"). Capture the choice and the stated reason.

**Gotchas:** User-stated warnings ("be careful with", "don't forget",
  "this breaks if"). Do not extract gotchas from tool results.
```

### 2C. Skill State Awareness (Bug #4)

**Location:** `ai-dev-tools/skills/session-handoff/SKILL.md`, new subsection in Step 1 after Conversation Analysis.

```markdown
### In-Progress Skill Detection

After scanning user messages, check TaskList for active tasks.

If tasks exist:
1. Use task subjects, descriptions, and completion status as the primary
   source for Done and Pending items. Tasks created by skill workflows
   have reliable status tracking and ordering.
2. The first incomplete task is the next action. Do not skip to a
   downstream task.
3. If tasks map to a known skill checklist (e.g., brainstorming steps 1-9,
   orchestrate steps 1-8), list remaining incomplete steps in the skill's
   own order and terminology.

Task list items take priority over conversation-derived items when they
conflict. Conversation scanning fills gaps (decisions, gotchas) that
tasks do not capture.
```

### 2D. Next Action Validation (Bug #4)

**Location:** `ai-dev-tools/skills/session-handoff/SKILL.md`, new subsection in Step 2 (Compose).

```markdown
### Next Action Validation

Before writing the Pending section, validate ordering:

1. If a review or approval step is incomplete in the task list, do not
   list any post-review step (implementation, plan writing) as the
   first pending item.
2. If a spec file referenced in pending items has Status: Draft, do not
   list implementation or plan writing as the next action.
3. The first Pending bullet must be the immediate next action. Downstream
   steps may follow but must be listed after it.
```

### 2E. Slim Down SKILL.md (Improvement #7)

**Location:** `ai-dev-tools/skills/session-handoff/SKILL.md` and new `ai-dev-tools/skills/session-handoff/references/edge-cases.md`.

**Move to `references/edge-cases.md`:**
- gitStatus-absent fallback flow (current lines 62-76)
- Error handling table (current lines 188-200)
- Auto-Discovery Setup section (current lines 178-183)

**Conditional loading:** Add to SKILL.md:
```
If gitStatus is absent from conversation context, read
references/edge-cases.md for the fallback flow.
```

**Keep in SKILL.md:** Happy path only — gitStatus present, git repo confirmed, normal gather/compose/write flow. Estimated size reduction: ~40%.

---

## Files Modified

| File | Changes |
|---|---|
| `ai-dev-tools/skills/orchestrate/SKILL.md` | Session Bootstrap phase, Step 4 dispatch guard, wrapped next-command output at every step exit, remove checkbox references |
| `ai-dev-tools/skills/orchestrate/references/implementation-step.md` | Remove checkbox references from Step 5 validation |
| `ai-dev-tools/skills/session-handoff/SKILL.md` | Explicit `./tmp/` path, user-message scanning, skill state awareness, next-action validation, slim down |
| `ai-dev-tools/skills/session-handoff/references/edge-cases.md` | New file — edge cases moved from SKILL.md |

## Out of Scope

- Changes to `superpowers:writing-plans` skill (bug #1 fixed orchestrate-side only)
- Changes to plan file format beyond removing checkboxes
- Session-handoff scanning of tool results or LLM responses
- Git-root path resolution (CWD is correct)
