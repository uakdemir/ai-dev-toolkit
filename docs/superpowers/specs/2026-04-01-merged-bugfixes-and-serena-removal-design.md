# Merged Spec: Handoff Pipeline Bugfixes + Remove Serena Dependency

**Status:** Finalized
**Date:** 2026-04-01
**Scope:** orchestrate, session-handoff, api-contract-guard, consolidate, review-doc, .gitignore
**Conflict analysis:** Zero file overlap between the two workstreams. No ordering dependencies. Can be implemented in any order or in parallel.

---

## Workstream A: Handoff Pipeline Bugfixes

**Approach:** Cohesive redesign (one coherent update per skill)

### Problem

Five bugs across orchestrate and session-handoff break the handoff pipeline:

| # | Bug | Skill |
|---|-----|-------|
| 1 | writing-plans' "Execution Handoff" preempts orchestrate's 4-option execution model menu at Step 5 | orchestrate |
| 2 | session-handoff writes to CWD-relative path without explicit anchoring | session-handoff |
| 3 | orchestrate never reads session-handoff.md on startup (generates handoffs but never consumes them) | orchestrate |
| 4 | session-handoff skips in-progress skill checklist steps, lists downstream actions as "next" | session-handoff |
| 5 | session-handoff scans full conversation context (verbose LLM responses waste tokens and obscure signal) | session-handoff |

Additionally, three improvements are bundled:

| # | Improvement | Skill |
|---|-------------|-------|
| 6 | Orchestrate should output a wrapped next-command for breadcrumb trail in user message history | orchestrate |
| 7 | session-handoff SKILL.md is too large (~10.5KB) for a skill invoked at RED context zone | session-handoff |
| 8 | Plan checkboxes create a conflicting progress source alongside the hint file — remove them | orchestrate |

### Decisions

- **Bug #1 fix location:** Orchestrate-side only (Step 4 dispatch instruction). No changes to `superpowers:writing-plans`.
- **Bug #2 fix:** Explicit `./tmp/session-handoff.md` (CWD-relative). No git-root resolution — CWD is always the correct project root.
- **Bug #3 approach:** Option C from bug report — read handoff early, convert to hint file, let Fast-Path Detection proceed normally.
- **Bugs #4-5 fix:** All three layers — task list cross-reference, skill state awareness, next-action validation. Scan user messages only, not full conversation context.
- **Improvement #6 format:** Wrapped syntax `/orchestrate (/inner-command args)` for scannable breadcrumb trail in user message history.
- **Improvement #7 approach:** Move edge cases and error handling to `references/edge-cases.md`, keep happy path in SKILL.md.
- **Improvement #8:** Remove plan checkboxes. Hint file is the sole authority for progress tracking.

---

### Change A1: Orchestrate Skill Updates

Modifications to `ai-dev-tools/skills/orchestrate/SKILL.md`.

#### A1a. Session Bootstrap Phase (Bug #3)

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

#### A1b. Step 4 Guard Against Writing-Plans Handoff (Bug #1)

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

#### A1c. Wrapped Next-Command Output (Improvement #6)

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
- Receiving a wrapped command targeting a step beyond the current hint step is treated as implicit confirmation of all prior steps. This includes Step 5: receiving `/orchestrate (/review-code ...)` while at Step 5 satisfies the explicit-confirmation requirement from A1d. Update step appropriately after inner command completes.

#### A1d. Remove Plan Checkboxes (Improvement #8)

**Location:** `ai-dev-tools/skills/orchestrate/SKILL.md`, Step 5 description and Fast-Path Detection Algorithm table.

**Change:** Remove all references to plan checkbox tracking (`[x]`, `[ ]`). The hint file `step` field is the sole authority for progress. Step 5's completion condition changes from "all checkboxes `[x]`" to: Step 5 is considered complete (advance to Step 6) when the user explicitly states implementation is done. Commits since plan_hash serve as a signal that implementation has started (stay at Step 5 until user confirms completion). If 0 commits exist since plan_hash, orchestrate stays at Step 5 and presents the implementation dispatch.

**Step 5 trigger replacement:** Replace "Plan exists, not all checkboxes [x]" with "Plan exists, implementation not confirmed complete". Replace "Edge: all [x] -> skip to Step 6" with "Edge: user explicitly states implementation is done -> advance to Step 6; 0 commits since plan_hash -> stay at Step 5 and present implementation dispatch."

**0-commits override:** User explicit confirmation always overrides the commit signal. If the user states implementation is done with 0 commits, advance to Step 6 with warning: "No commits since plan_hash — proceeding to code review at your confirmation."

**Step-specific validation update:** Step 5 validation changes from "plan checkboxes" to "commits since plan_hash (git log <plan_hash>..HEAD; any commits present means implementation has started)". Step 5 and Step 6 share the same git signal but differ in interpretation: Step 5 treats commits as evidence to stay (in progress); Step 6 treats commits as prerequisite to proceed (enough to review). The hint file step field determines which interpretation applies. Also update the Fast-Path Detection Algorithm step-specific validation entry for step 5: replace "5: plan checkboxes" with "5: commits since plan_hash (implementation started; hint step field determines stay-at-5 vs advance-to-6 interpretation)".

---

### Change A2: Session-Handoff Skill Updates

Modifications to `ai-dev-tools/skills/session-handoff/SKILL.md` plus a new `references/edge-cases.md`.

#### A2a. Explicit CWD-Relative Path (Bug #2)

**Location:** All occurrences of `tmp/session-handoff.md` in `ai-dev-tools/skills/session-handoff/SKILL.md` (skill description, Step 3 write, self-check, confirmation).

**Change:** Replace all references to `tmp/session-handoff.md` with `./tmp/session-handoff.md`. This explicitly anchors to CWD, ensuring consistent write/read location.

**Path convention note:** Session Bootstrap uses `./tmp/session-handoff.md` (with `./` prefix per this change). All other orchestrate path references remain as `tmp/orchestrate-state.md` — CWD anchoring applies only to the session-handoff path.

#### A2b. User Message Scanning (Bug #5)

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

#### A2c. Skill State Awareness (Bug #4)

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

#### A2d. Next Action Validation (Bug #4)

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

#### A2e. Slim Down SKILL.md (Improvement #7)

**Implementation order:** Apply A2e first (uses original section headers as anchors), then apply A2a–A2d.

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

**Keep in SKILL.md:** Happy path only — gitStatus present, git repo confirmed, normal gather/compose/write flow. Estimated gross size reduction: ~25%. New A2b-A2d sections will partially offset this.

**Dangling header cleanup:** After moving the gitStatus-absent block, remove the conditional header "If gitStatus is present (typical case):" — the happy path is now the only path in SKILL.md and no conditional header is needed.

---

## Workstream B: Remove Serena MCP Dependency

### Goal

Remove all Serena MCP tool references from the codebase. Serena's value (precise symbol resolution) is unnecessary at our target codebase size (<=20K LOC per module). The regex/grep fallback paths already exist and are complete. Removing Serena eliminates dual-mode prompt bloat and a hard-gate step that blocks users.

### Affected Skills

| Skill | Serena Role | Removal Effort |
|---|---|---|
| **api-contract-guard** | Hard gate + dual-mode throughout (Serena vs regex) | Heavy |
| **consolidate** | `.serena/*.yml` as one of 5 AI config formats | Medium |
| **review-doc** (fact-checker agent) | Preferred tools table recommending Serena for symbol lookup | Light |

---

### Change B1: api-contract-guard/SKILL.md

1. **Delete Step 1 (Serena Check)** — the entire hard gate section (lines 46-58). Renumber remaining steps: current Step 2 becomes Step 1, through Step 10 becoming Step 9 (and 9a becomes 8a).
2. **Remove all dual-mode branches** — every "With Serena: ... / Without Serena: ..." block throughout the file. Promote the regex/grep path as the sole analysis mode.
3. **Specific sections to edit:**
   - Step 6 (Barrel File Analysis): State 2 — remove "With Serena: `find_referencing_symbols`." and also remove the orphaned "Without:" label prefix. The sentence should read: `...de facto public API. Regex scan for imports targeting module internals.`
   - Step 6: Wildcard re-exports — replace the block with: `Warn: "Wildcard re-export defeats explicit contract." One-level resolution; nested wildcards warn. Offer to replace with named exports.`
   - Step 7 (Cross-Module Import Analysis): Delete the "With Serena" paragraph. Keep the "Without Serena" paragraph but remove the "Without Serena:" label — it becomes the only description.
   - Error handling table: remove the "Serena unavailable" row. Remove "Serena: full; regex: one level" from wildcard row — just "one-level resolution, recommend named exports". Change path alias row from "Serena: resolved. Without: warn about false negatives." to "Warn about false negatives." Update the "Wildcard re-export in barrel" row: change "Warn, resolve (Serena: full; regex: one level), recommend named exports" to "Warn, resolve (one-level), recommend named exports".
4. **Update reference file description** on line 41: remove "(Serena + regex)" from barrel-patterns.md description.
5. **Update workflow overview** (lines 26-36): delete line 26 (`1. **Serena Check**...`) and renumber remaining steps so the list begins at Step 1.
6. **Renumber all step references throughout SKILL.md**: search for all step-number occurrences and update them to match the new numbering using this map: Step 2->1, Step 3->2, Step 4->3, Step 5->4, Step 6->5, Step 7->6, Step 8->7, Step 9->8, Step 9a->8a, Step 10->9. This includes: all `## Step N:` section headers, all entries in the Progressive Disclosure Schedule table, and all prose cross-references such as 'Steps 6-7 produce findings, flowing into Steps 8 and 9'. Also update any step-number references in the Error Handling table and other in-body prose.

### Change B2: api-contract-guard/references/barrel-patterns.md

1. **Delete file header** Serena mention (line 4): remove "Serena + regex dual-mode" from the description.
2. **Delete "Export Analysis — Serena Mode" section** (lines 48-70 entirely).
3. **Rename "Export Analysis — Regex Fallback"** to "Export Analysis" (line 73). Remove "When Serena is not available" from the description.
4. **Incomplete Barrel Detection**: delete "Serena Mode" subsection (lines 157-164). Delete the `### Regex Fallback` heading line entirely — leave the algorithm steps directly under the parent `##` section with no subheading.
5. **Cross-Module Import Scanning**: delete "Serena Mode" subsection (lines 191-196). Delete the `### Regex Fallback` heading line entirely — leave the algorithm steps directly under the parent `##` section with no subheading.
6. **Path aliases**: two targeted edits — (1) Delete only line 257 (`Without Serena, aliases cannot be reliably resolved`). (2) Update the warn string on lines 258-259 to remove `Consider installing Serena for precise alias resolution.` — result: `Warn: "Path alias detected (\`{alias}\`). Some internal imports via aliases may not be caught."` Line 256 (`These create alternative names for internal paths`) is a non-Serena descriptive line and must be preserved.
7. **Wildcard Re-Export Resolution**: delete "Serena Mode" subsection (lines 293-299). In the Regex Fallback (now only mode), remove "Cannot fully resolve without Serena. Recommend installing Serena or replacing with named exports." Replace with "Nested wildcard re-exports detected. Recommend replacing with named exports."
8. **Barrel Generation — Determine Export Kind**: delete the "Serena:" line (line 332-333). Keep the regex pattern matching as the only approach.

### Change B3: review-doc (2 files)

**review-doc/agents/codebase-fact-checker.md:**
1. **Delete the "Preferred Tools" section** (lines 46-58) — the table recommending Serena tools and the "Use Serena tools when available" sentence.
2. The agent already uses Read/Grep/Glob — those become the only tools with no preference note needed.

**review-doc/SKILL.md:**
1. **Update line 209**: replace `using preferred Serena tools (see agent prompt)` with `using Read/Grep/Glob tools`.

### Change B4: consolidate skill (6 files)

All changes are removing `.serena/*.yml` from lists of scanned/supported AI config formats:

1. **SKILL.md** (line 77): remove `.serena/*.yml` from the config file list.
2. **prompts/ai-discover.md**: remove `.serena/*.yml` from the discovery rules list (line 13). On line 34, remove the entire `.serena/` entry. On line 38, remove the `.serena (1)` token and its preceding comma-space.
3. **prompts/ai-diff.md** (lines 73-80): delete the entire `## Serena/YAML Configs -- Key-Level` section.
4. **prompts/ai-report.md** (line 18): remove `.serena/` report section header.
5. **prompts/ai-apply.md**: (1) Delete the entire `### Serena/YAML Merge` section (lines 90-93). (2) In `### New Files` at line 96, strip `.serena/` from `(.codex/, .serena/)`.
6. **prompts/learn-discover.md** (line 58): delete the `.serena/*.yml` bullet. Renumber subsequent items.

### Change B5: consolidate references (2 files)

1. **references/learnings-schema.md**: (1) Section 1, line 34: remove `.serena/default.yml` path example. (2) Section 3, line 96: remove `.serena/` grouping header example.
2. **references/tech-buckets.md**: At each of the three locations, remove `.serena/*.yml` (including the preceding `, ` separator).

### Change B6: .gitignore

1. Remove the `.serena/` entry (line 23).

---

## Files Modified (Combined)

| File | Workstream | Changes |
|---|---|---|
| `ai-dev-tools/skills/orchestrate/SKILL.md` | A | Session Bootstrap, Step 4 guard, wrapped next-command output, remove checkboxes, update Fast-Path Detection table |
| `ai-dev-tools/skills/session-handoff/SKILL.md` | A | Explicit `./tmp/` path, user-message scanning, skill state awareness, next-action validation, slim down |
| `ai-dev-tools/skills/session-handoff/references/edge-cases.md` | A | New file — edge cases moved from SKILL.md |
| `ai-dev-tools/skills/api-contract-guard/SKILL.md` | B | Delete Serena gate, remove dual-mode branches, renumber steps |
| `ai-dev-tools/skills/api-contract-guard/references/barrel-patterns.md` | B | Remove Serena mode sections, promote regex as sole mode |
| `ai-dev-tools/skills/review-doc/agents/codebase-fact-checker.md` | B | Delete Preferred Tools section |
| `ai-dev-tools/skills/review-doc/SKILL.md` | B | Update fact-checker description (Serena → Read/Grep/Glob) |
| `ai-dev-tools/skills/consolidate/SKILL.md` | B | Remove `.serena/*.yml` from config list |
| `ai-dev-tools/skills/consolidate/prompts/ai-discover.md` | B | Remove `.serena/*.yml` references |
| `ai-dev-tools/skills/consolidate/prompts/ai-diff.md` | B | Delete Serena/YAML section |
| `ai-dev-tools/skills/consolidate/prompts/ai-report.md` | B | Remove `.serena/` header |
| `ai-dev-tools/skills/consolidate/prompts/ai-apply.md` | B | Delete Serena merge section, strip from New Files |
| `ai-dev-tools/skills/consolidate/prompts/learn-discover.md` | B | Delete `.serena/*.yml` bullet |
| `ai-dev-tools/skills/consolidate/references/learnings-schema.md` | B | Remove `.serena/` examples |
| `ai-dev-tools/skills/consolidate/references/tech-buckets.md` | B | Remove `.serena/*.yml` from 3 locations |
| `.gitignore` | B | Remove `.serena/` entry |

## Out of Scope

- Changes to `superpowers:writing-plans` skill (bug #1 fixed orchestrate-side only)
- Changes to plan file format beyond removing checkboxes
- Session-handoff scanning of tool results or LLM responses
- Git-root path resolution (CWD is correct)
- Parsing plan file unchecked checkboxes for Pending items (removed — TaskList and user messages are the authoritative sources)
- No Serena opt-in path preserved for future use
- No new tooling to replace Serena — existing grep/glob/read tools are sufficient
- convention-enforcer is already clean (no Serena references)

## Verification

### Workstream A
- After changes, orchestrate Session Bootstrap correctly reads `./tmp/session-handoff.md` and produces a valid hint file.
- Wrapped next-command output appears at every step exit with correct command mapping.
- Session-handoff scans user messages only and correctly identifies in-progress skill checklists via TaskList.

### Workstream B
1. After all changes, grep the codebase case-insensitively for `serena` across all skill files (`ai-dev-tools/skills/**`) and `.gitignore`, and confirm zero remaining hits. Files under `docs/superpowers/` (historical specs and plans) are excluded.
2. Manually trace the regex-only path through each affected skill (api-contract-guard, consolidate, review-doc) to confirm no logic gaps.

## Constraints

- Workstreams A and B are independent — no ordering dependency.
- Regex paths must remain complete and correct after Serena removal — no logic gaps.
- Step renumbering in api-contract-guard must be consistent throughout the file.
- No functional behavior changes from Serena removal — regex mode already works identically.
