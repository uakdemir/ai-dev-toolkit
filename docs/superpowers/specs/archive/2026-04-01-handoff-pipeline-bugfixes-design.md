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

Modifications to `ai-dev-tools/skills/orchestrate/SKILL.md`.

### 1A. Session Bootstrap Phase (Bug #3)

**Location:** New phase between "Mode Selection" and "Step 0: Context Health Check".

**Spec:**

```markdown
## Session Bootstrap (before Step 0)

Runs on every invocation, before Step 0.

1. Check if `./tmp/session-handoff.md` exists.
2. If not found → skip, proceed to Step 0.
3. If found → read YAML frontmatter `generated` timestamp.
   - Compare the `generated` field to the currentDate provided in the system-reminder context. If currentDate is unavailable, run `date +%Y-%m-%d` via Bash. Note: currentDate is date-only (YYYY-MM-DD) while generated is datetime (YYYY-MM-DDTHH:MM). Use only the date portion of generated for comparison. If the date portion of generated differs from currentDate by more than 1 calendar day, treat as stale. Same day or previous day = recent.
   - If stale → print "Stale session handoff (>24h), ignoring." → proceed to Step 0.
   - If recent → parse content:
     a. Extract feature name from Done/Pending sections. Strategy: look for file paths matching spec filename patterns (arguments after /review-doc or /writing-plans), and also scan for spec file path patterns (`docs/superpowers/specs/*.md` or `docs/*/specs/*.md`) anywhere in the content — session-handoff may summarize commands rather than preserving them verbatim. If multiple candidates, prefer the one appearing in both Done and Pending. If no clear name, set feature to empty and let User Prompt fallback clarify.
     b. Determine step number by scanning Pending items for skill references and file paths:
        - Pending mentions spec review or /review-doc → step 2
        - Pending mentions respond to review → step 3
        - Pending mentions write plan or /writing-plans → step 4
        - Pending mentions implement or execution → step 5
        - Pending mentions code review or /review-code → step 6
        - Pending mentions fix findings → step 7
        - Pending mentions finalize or complete → step 8
        - No match: if Pending is empty, scan Done for highest step keyword. Done mentions finalize/complete → step finalized. Done mentions fix findings → step 8. Done mentions code review → step 7 or 8. Done mentions implementation/execution → step 6. Done mentions write plan → step 5. Done mentions respond to review → step 3 or 4. Done mentions spec review → step 3. Done also empty → step 1. Otherwise → step 1 (start fresh). Note: this fallback is intentionally conservative — the User Prompt acts as a safety net if the mapping is ambiguous.
        If Pending matches multiple step keywords, use the lowest-numbered
        unfinished step (the earliest pending work). Cross-reference with
        Done items: steps mentioned in Done are considered complete.
     c. Extract spec and plan paths from file path references in the content.
     d. Write `tmp/orchestrate-state.md` with extracted data. Preserve existing `mode` field
        if hint file already exists. Set `head` to current `git rev-parse HEAD`. Note: `head`
        reflects HEAD at orchestrate invocation time. Fast-Path Detection comparing this to
        current HEAD will correctly detect any commits made during this session.
     e. Print: "Resumed from session handoff: <feature>, step <N>"
4. Proceed to Step 0 (Fast-Path Detection finds the newly written or updated hint file).
```

**Integration:** Session Bootstrap runs after Mode Selection completes. Mode is already resolved when step 3d writes the hint file. If creating a new hint file, include the resolved mode value. If the hint file already has valid cycle state (non-empty `feature`), Session Bootstrap is a no-op — Fast-Path Detection handles it. This is intentional — Fast-Path Detection's git-based validation is more reliable than handoff file parsing for mid-cycle state. Session Bootstrap only fires when the hint file is missing or has no valid cycle state AND a recent session-handoff.md exists.

When session-handoff is auto-triggered by orchestrate RED, the hint file already contains valid cycle state. Session Bootstrap's no-op condition handles this — the hint file has a non-empty feature field, so Bootstrap exits immediately without reading session-handoff.md.

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

The guard text is prepended to the Skill tool dispatch prompt before the plan request. If writing-plans still presents an Execution Handoff section, orchestrate ignores it and proceeds to Step 5.

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
| 1 (Brainstorm) | `/orchestrate (/review-doc <spec_path> --max-iterations 3)` — `<spec_path>` is the path of the newly created spec. If brainstorming did not produce a file, output plain `/orchestrate` instead. |
| 2 (Spec Review) | `/orchestrate (/respond-to-review <round> <spec_path>)` if criticals >0, else `/orchestrate` (plain, no inner command — advances to Step 4 via hint file) |
| 3 (Respond to Review) | if criticals > 0 after respond-to-review: `/orchestrate (/review-doc <spec_path> --max-iterations 3)`; if criticals = 0: `/orchestrate` (plain, advances to Step 4) |
| 4 (Write Plan) | `/orchestrate` (Step 5 requires its own analysis before recommending a specific command) |
| 5 (Implement) | `/orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)` |
| 6 (Code Review) | if findings (criticals or highs > 0): `/orchestrate` (plain — Fast-Path Detection routes to Step 7); if no findings: `/orchestrate` (plain — Fast-Path Detection routes to Step 8) |
| 7 (Fix Findings) | `/orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)` |
| 8 (Complete) | `/orchestrate` for next feature or new cycle |

**Parsing behavior:** When orchestrate receives `/orchestrate (/some-command args)`:

Note: The full initialization sequence still runs on receipt of a wrapped command (Mode Selection → Session Bootstrap → Step 0). If Step 0 detects RED, auto-handoff takes priority and the inner command is not dispatched. Mode Selection skips the prompt if mode is already persisted.

1. Extract the inner command from parentheses.
2. Do not update the step field on receipt of a wrapped command. Update only after the inner command completes and orchestrate resumes control, using normal step-detection logic.
3. Dispatch the inner command via the Skill tool.
4. After the inner command completes, orchestrate resumes control for state update + next-command output.

**Acceptance example:** After Step 1 (Brainstorm) completes and spec is saved to `tmp/my-feature-design.md`, orchestrate outputs:

```
── Next ────────────────────────────────────────
/orchestrate (/review-doc tmp/my-feature-design.md --max-iterations 3)
────────────────────────────────────────────────
```

**Edge cases:**

- Plain `/orchestrate` (no parens) — normal flow, detect state from hint file.
- User modifies the inner command before pasting — orchestrate dispatches whatever is in the parens verbatim.
- Inner command fails — existing error handling (Retry/Skip/Exit).
- Receiving a wrapped command targeting a step beyond the current hint step is treated as implicit confirmation of all prior steps. This includes Step 5: receiving `/orchestrate (/review-code ...)` while at Step 5 satisfies the explicit-confirmation requirement from 1D. Update step appropriately after inner command completes.

### 1D. Remove Plan Checkboxes (Improvement #8)

**Location:** `ai-dev-tools/skills/orchestrate/SKILL.md`, Step 5 description and Fast-Path Detection Algorithm table.

**Change:** Remove all references to plan checkbox tracking (`[x]`, `[ ]`). The hint file `step` field is the sole authority for progress. Step 5's completion condition changes from "all checkboxes `[x]`" to: Step 5 is considered complete (advance to Step 6) when the user explicitly states implementation is done. Commits since plan_hash serve as a signal that implementation has started (stay at Step 5 until user confirms completion). If 0 commits exist since plan_hash, orchestrate stays at Step 5 and presents the implementation dispatch.

**Step 5 trigger replacement:** Replace "Plan exists, not all checkboxes [x]" with "Plan exists, implementation not confirmed complete". Replace "Edge: all [x] -> skip to Step 6" with "Edge: user explicitly states implementation is done -> advance to Step 6; 0 commits since plan_hash -> stay at Step 5 and present implementation dispatch."

**0-commits override:** User explicit confirmation always overrides the commit signal. If the user states implementation is done with 0 commits, advance to Step 6 with warning: "No commits since plan_hash — proceeding to code review at your confirmation."

**Step-specific validation update:** Step 5 validation changes from "plan checkboxes" to "commits since plan_hash (git log <plan_hash>..HEAD; any commits present means implementation has started)". Step 5 and Step 6 share the same git signal but differ in interpretation: Step 5 treats commits as evidence to stay (in progress); Step 6 treats commits as prerequisite to proceed (enough to review). The hint file step field determines which interpretation applies. Also update the Fast-Path Detection Algorithm step-specific validation entry for step 5: replace "5: plan checkboxes" with "5: commits since plan_hash (implementation started; hint step field determines stay-at-5 vs advance-to-6 interpretation)". Add `ai-dev-tools/skills/orchestrate/SKILL.md` to the Files Modified table for this validation update (it is already listed, but the Fast-Path Detection Algorithm table within it is now also modified).

---

## Change 2: Session-Handoff Skill Updates

Modifications to `ai-dev-tools/skills/session-handoff/SKILL.md` plus a new `references/edge-cases.md`.

### 2A. Explicit CWD-Relative Path (Bug #2)

**Location:** All occurrences of `tmp/session-handoff.md` in `ai-dev-tools/skills/session-handoff/SKILL.md` (skill description, Step 3 write, self-check, confirmation).

**Change:** Replace all references to `tmp/session-handoff.md` with `./tmp/session-handoff.md`. This explicitly anchors to CWD, ensuring consistent write/read location.

**Path convention note:** Session Bootstrap uses `./tmp/session-handoff.md` (with `./` prefix per this change). All other orchestrate path references remain as `tmp/orchestrate-state.md` — CWD anchoring applies only to the session-handoff path.

### 2B. User Message Scanning (Bug #5)

**Location:** `ai-dev-tools/skills/session-handoff/SKILL.md`, Step 1 "Conversation Analysis" section.

**Replace** the current "Conversation Analysis (Context Layer)" section with:

```markdown
### Conversation Analysis (User Messages Only)

Scan ONLY the user's messages in the conversation. Do not scan LLM responses
or tool results — they are verbose and waste context tokens. One exception:
the TaskList tool may be invoked directly as a structured artifact — it is
not part of conversation scanning (see In-Progress Skill Detection below).

From user messages, extract:

**Done:** Commands the user ran — skill invocations, /orchestrate calls,
  /orchestrate (/...) wrapped commands. Each invocation = one completed action.

**Pending:** Explicit deferrals in user messages ("later", "next session",
  "TODO", "skip for now"). Also: uncompleted /orchestrate (/...) breadcrumbs
  where the user ran /orchestrate (/X) but there is no subsequent /orchestrate
  call in the conversation.

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
3. If tasks are numbered sequentially, preserve ordering and terminology.
   Skill identification is not required — task order and subject are sufficient.

If TaskList tool is unavailable or returns an error, skip In-Progress Skill Detection and rely on user-message scanning only. If TaskList returns no tasks or all tasks are completed: fall back to user-message scanning as sole source. Completed tasks may supplement the Done section.

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

**Implementation order:** Apply 2E first (uses original section headers as anchors), then apply 2A–2D.

**Location:** `ai-dev-tools/skills/session-handoff/SKILL.md` and new `ai-dev-tools/skills/session-handoff/references/edge-cases.md`.

**Move to `references/edge-cases.md`:**
- The section starting with "If gitStatus is absent (non-standard invocation):"
- The Error Handling table (under the `## Error Handling` header)
- The `## Auto-Discovery Setup` section

**Conditional loading:** Add to SKILL.md:
```
If gitStatus is absent from conversation context, read
references/edge-cases.md for the fallback flow.
```

**Error handling consolidation:** Replace the full Error Handling table in SKILL.md with a minimal redirect:
```markdown
## Error Handling
See references/edge-cases.md for non-standard scenarios (no git repo, no commits, detached HEAD, nothing to hand off).
```
All rows in the Error Handling table move to edge-cases.md except (1) tmp/ doesn't exist and (2) Previous handoff exists. Only those two most common scenarios remain inline in SKILL.md.

**Keep in SKILL.md:** Happy path only — gitStatus present, git repo confirmed, normal gather/compose/write flow. Estimated gross size reduction: ~25%. New 2B-2D sections will partially offset this.

**Dangling header cleanup:** After moving the gitStatus-absent block, remove the conditional header "If gitStatus is present (typical case):" — the happy path is now the only path in SKILL.md and no conditional header is needed.

---

## Files Modified

| File | Changes |
|---|---|
| `ai-dev-tools/skills/orchestrate/SKILL.md` | Session Bootstrap phase, Step 4 dispatch guard, wrapped next-command output at every step exit, remove checkbox references, update Fast-Path Detection validation table |
| `ai-dev-tools/skills/session-handoff/SKILL.md` | Explicit `./tmp/` path, user-message scanning, skill state awareness, next-action validation, slim down |
| `ai-dev-tools/skills/session-handoff/references/edge-cases.md` | New file — edge cases moved from SKILL.md |

## Out of Scope

- Changes to `superpowers:writing-plans` skill (bug #1 fixed orchestrate-side only)
- Changes to plan file format beyond removing checkboxes
- Session-handoff scanning of tool results or LLM responses
- Git-root path resolution (CWD is correct)
- Parsing plan file unchecked checkboxes for Pending items (removed — TaskList and user messages are now the authoritative sources)
