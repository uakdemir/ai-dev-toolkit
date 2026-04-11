# Orchestrate UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a parallel helper execution model, first-run user prompt, and one-time mode selection to orchestrate.

**Architecture:** Three surgical edits to two existing markdown skill files. Change C (mode prompt) goes into SKILL.md before Step 0. Change B (first-run prompt) modifies SKILL.md's detection path. Change A (parallel helper) extends strict-mode.md's execution model section.

**Tech Stack:** Markdown skill files (no code — all changes are to AI instruction documents)

---

### Task 1: Add `mode` field to hint file schema and write rules (Change C foundation)

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md:60-77`

- [ ] **Step 1: Update the Fields description in State Hint File Protocol**

In the `**Fields:**` line (line 64), add `mode` as the first field:

```markdown
**Fields:** `mode` (`standard` or `strict`, persisted user preference; preserved across resets), `feature` (from spec filename), `step` (number or `finalized`), `spec` (path, `""` if none), `plan` (path, `""` if none), `plan_hash` (40-char SHA of plan commit, `""` if none; populate via `git log --format=%H -1 -- {plan_path}` when first writing hint at step 5+), `head` (40-char SHA of HEAD when written), `updated` (ISO timestamp).
```

- [ ] **Step 2: Update the write rules for reset behavior**

Replace line 75:
```markdown
Write `step: finalized` immediately after user confirms finalize — before running quality gates. When routing to Step 1 from `finalized`, write hint with `feature: ""`, `spec: ""`, `plan: ""`, `plan_hash: ""`, `step: 1`. The hint file is never deleted. `finalized` is a valid state.
```

With:
```markdown
Write `step: finalized` immediately after user confirms finalize — before running quality gates. When routing to Step 1 from `finalized`, write hint with `feature: ""`, `spec: ""`, `plan: ""`, `plan_hash: ""`, `step: 1` — preserve the existing `mode` field unchanged. The hint file is never deleted. `finalized` is a valid state.
```

- [ ] **Step 3: Verify changes**

Read `ai-dev-tools/skills/orchestrate/SKILL.md` lines 60-77. Confirm:
- `mode` appears first in the Fields description with its valid values and "preserved across resets" note
- The reset rule explicitly says "preserve the existing `mode` field unchanged"

- [ ] **Step 4: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "feat(orchestrate): add mode field to hint file schema and write rules"
```

---

### Task 2: Add one-time mode selection prompt before Step 0 (Change C)

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md:24-35`

- [ ] **Step 1: Add mode selection section**

Insert a new section between the argument-parsing paragraph (line 24) and the strict-mode banner paragraph (line 26). The new section goes after line 24 (`Both flags can coexist with --help taking priority.`) and before line 26 (`**Strict mode banner:**`):

```markdown

## Mode Selection (before Step 0)

**Trigger:** `/orchestrate` invoked without `--strict` flag AND no persisted `mode` field in `tmp/orchestrate-state.md` (file missing, or file exists but has no `mode` key).

When triggered, present before anything else (before Step 0):

```
Orchestrate mode:
  [1] Standard (relaxed)
  [2] Strict — full workflow orchestration, TDD, verification gates
      (recommended if you're experienced with orchestrate)

Proceed with?
```

**Behavior:**
- User picks `[1]` → create or update hint file with only `mode: standard` in YAML frontmatter (do not include `feature`, `step`, `spec`, `plan`, `plan_hash`, `head`, or `updated` — their absence signals no valid cycle state) → continue as standard. Never ask again.
- User picks `[2]` → create or update hint file with only `mode: strict` in YAML frontmatter → print the strict-mode banner immediately → continue with strict active. Future no-flag invocations auto-activate strict. Never ask again.
- `--strict` flag present → skip this prompt entirely, always strict.
- Any other input → re-present the prompt once. If the second response is also invalid, default to `[1]` (standard) and print: "Unrecognised input — defaulting to Standard mode."

**Mode resolution order:** (1) `--strict` flag → strict. (2) Hint file `mode` field → use persisted value. (3) Neither → show prompt.

**After mode resolved:** If strict is active (by any path), print the strict-mode banner, then proceed to Step 0. If standard, proceed to Step 0 directly.
```

- [ ] **Step 2: Update the strict-mode banner paragraph**

The existing strict-mode banner paragraph (currently line 26-29) should be updated to reference the new mode resolution:

Replace:
```markdown
**Strict mode banner:** When `--strict` is active, print before any state detection:
```

With:
```markdown
**Strict mode banner:** When strict mode is active (via `--strict` flag, persisted `mode: strict`, or user selecting `[2]` at the mode prompt), print before Step 0:
```

- [ ] **Step 3: Verify changes**

Read `ai-dev-tools/skills/orchestrate/SKILL.md` lines 24-60. Confirm:
- Mode Selection section appears between argument parsing and the strict-mode banner
- All four behaviors are documented ([1], [2], --strict, invalid input)
- Hint file creation rule says "only `mode` field" — no other fields
- Banner paragraph references all three paths to strict mode

- [ ] **Step 4: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "feat(orchestrate): add one-time mode selection prompt before Step 0"
```

---

### Task 3: Add first-run user prompt to detection path (Change B)

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md:86-87` (Fast-Path Detection Algorithm)
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (Error Handling table)

- [ ] **Step 1: Update the hint-file-missing path in Fast-Path Detection**

In the Fast-Path Detection Algorithm code block, replace the `Not found` branch:

```
   ├── Not found → Read references/full-scan.md → execute Full Scan Fallback
```

With:

```
   ├── Not found or no valid cycle state (missing/empty `feature` field) →
   │    ├── Strict mode active → First-Run User Prompt (below)
   │    └── Standard mode → Read references/full-scan.md → execute Full Scan Fallback
```

- [ ] **Step 2: Add the First-Run User Prompt section**

Insert a new section after the Fast-Path Detection Algorithm section (after the `**YELLOW gate:**` paragraph) and before the `## Conditional Loading` section:

```markdown

## First-Run User Prompt (--strict only)

**Trigger:** No valid cycle state in hint file (missing file, malformed YAML, or empty/missing `feature` field) AND strict mode is active.

```
1. Print: "No previous state found."
   Ask:  "What are you working on and where did you leave off?"

2. Parse response for:
   - Feature name: case-insensitive substring match against
     docs/superpowers/specs/ filenames (strip YYYY-MM-DD- prefix
     and -design suffix). Exactly one match → resolved.
     Zero or multiple matches → ambiguous (go to step 4).
   - Step: map natural language to step number:
       "just started" / "haven't done anything yet" → step 1
       "brainstormed" / "wrote spec"                → step 2
       "spec in review" / "waiting on spec review"  → step 3
       "spec reviewed" / "spec approved"            → step 4
       "wrote plan" / "finished planning"           → step 5
       "implementing" / "in the middle of code"     → step 5
       "done implementing"                          → step 6
       "code review in progress" / "reviewing code" → step 7
       "code review done" / "review clean"          → step 8
     For phrases not listed above, treat the step as ambiguous
     and proceed to step 4. Prefer the most-specific match when
     phrases overlap (e.g., "code review done" → step 8, not 7).

3. If BOTH resolved (exactly one spec match, exactly one step match):
   → Run one targeted step-specific validation check
     (same as fast-path validation table above).
   → If validation contradicts the stated step: print
     "The project state doesn't match step <N> — let me scan
     to determine the correct step." Fall back to full scan.
   → Otherwise, write hint file (with mode, feature, step, spec,
     plan if exists, head, updated), proceed to detected step.

4. If EITHER is ambiguous:
   → Ask a follow-up question. Max 2-3 rounds total.
     "Did you mean `convention-enforcer` or `consolidate-learn`?"
     "You said review — spec review (step 2-3) or code review (step 6-7)?"

5. If still unclear after 2-3 rounds:
   → Print: "Let me scan the project to figure it out."
   → Fall back to full scan (read references/full-scan.md).
```
```

- [ ] **Step 3: Update the Error Handling table**

Add a new row to the Error Handling table:

```markdown
| No valid cycle state + strict mode | First-Run User Prompt → targeted validation → hint write. Fallback to full scan after 2-3 rounds. |
```

- [ ] **Step 4: Verify changes**

Read `ai-dev-tools/skills/orchestrate/SKILL.md` from the Fast-Path Detection Algorithm through the Error Handling table. Confirm:
- The `Not found` branch now splits on strict vs standard
- The First-Run User Prompt section appears between Fast-Path Detection and Conditional Loading
- The step-mapping table has entries for all 8 steps
- The error handling table has the new row

- [ ] **Step 5: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "feat(orchestrate): add first-run user prompt before full scan (strict only)"
```

---

### Task 4: Add parallelism yield check and update recommendation algorithm (Change A)

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/references/strict-mode.md:26-36`

- [ ] **Step 1: Add parallelism yield check section**

Insert after the `**Recommendation algorithm:**` heading (line 27) and before the algorithm code block (line 28), a new section:

```markdown

**Parallelism yield check** (runs when task_count >= 4 AND coupling != HIGH):
```
Scan tasks in plan order. For each unassigned task, find the next
unassigned task with no dependency on it or vice versa. If found,
pair them into a parallel phase. Continue until all tasks are
assigned or no more pairs can be formed.

P = number of parallel pairs
parallelism_ratio = P / task_count

If parallelism_ratio >= 0.30 → option [4] is eligible
If parallelism_ratio < 0.30  → not eligible, fall through to single-agent
```

Note: `parallelism_ratio` is a proxy for time savings (fraction of parallelisable tasks), not a wall-clock measurement.

```

- [ ] **Step 2: Update the recommendation algorithm**

Replace the existing recommendation algorithm code block (lines 28-35):

```
remaining = 200_000 - estimated_used
implementation_estimate = task_count × 12_000

If implementation_estimate > remaining × 0.8 → subagent-per-task
  (also include in Reason line: "Consider clearing context first for single-agent (Option [3])")
Else if coupling == HIGH → single-agent
Else if task_count > 8 AND coupling == LOW → subagent-per-task
Else → single-agent
```

With:

```
remaining = 200_000 - estimated_used
implementation_estimate = task_count × 12_000
parallelism_ratio = 0  # default; overwritten if yield check runs

If implementation_estimate > remaining × 0.8 → subagent-per-task
  (also include in Reason line: "Consider clearing context first for single-agent (Option [3])")
Else if coupling == HIGH → single-agent
Else if task_count > 8 AND coupling == LOW → subagent-per-task
Else if task_count >= 4 AND coupling != HIGH AND parallelism_ratio >= 0.30 → single-agent + parallel helper
Else → single-agent
```

- [ ] **Step 3: Verify changes**

Read `ai-dev-tools/skills/orchestrate/references/strict-mode.md` lines 26-55. Confirm:
- Parallelism yield check section appears before the algorithm
- The algorithm has `parallelism_ratio = 0` initialization
- The `[4]` branch appears between `subagent-per-task` (>8 tasks) and the final `single-agent` fallback
- The yield check defines the greedy scan-in-plan-order pairing strategy

- [ ] **Step 4: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/references/strict-mode.md
git commit -m "feat(orchestrate): add parallelism yield check and [4] to recommendation algorithm"
```

---

### Task 5: Update presentation, input guard, and add override dispatch (Change A)

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/references/strict-mode.md:39-58` (presentation block)
- Modify: `ai-dev-tools/skills/orchestrate/references/strict-mode.md:56` (input guard)
- Modify: `ai-dev-tools/skills/orchestrate/references/strict-mode.md:62-88` (override dispatch)

- [ ] **Step 1: Update the presentation block**

Replace the existing presentation code block:

```
── Step 5: Implementation ──────────────────────
Plan: <N> tasks, <coupling assessment>
Context: ~<used>K / 200K used, ~<remaining>K remaining
Estimated cost: ~<estimate>K tokens

Recommendation: <Single-agent | Subagent-per-task>
  Reason: <one-line explanation>

Alternatives:
  [1] Single-agent <(recommended) if applicable>
  [2] Subagent-per-task <(recommended) if applicable>
  [3] Clear context + single-agent

Proceed with [N]?
```

With:

```
── Step 5: Implementation ──────────────────────
Plan: <N> tasks, <coupling assessment>
Context: ~<used>K / 200K used, ~<remaining>K remaining
Estimated cost: ~<estimate>K tokens
Parallelism yield: <P> pairs, ratio <parallelism_ratio>%

Recommendation: <Single-agent | Subagent-per-task | Single-agent + parallel helper>
  Reason: <one-line explanation>

Alternatives:
  [1] Single-agent <(recommended) if applicable>
  [2] Subagent-per-task <(recommended) if applicable>
  [3] Clear context + single-agent
  [4] Single-agent + one parallel helper <(recommended) if applicable>

Proceed with [N]?
```

Add a note after the code block:

```markdown
The "Parallelism yield" line is shown only when the yield check ran (task_count >= 4 and coupling != HIGH). When [4] is not eligible (ratio < 0.30), it still appears as an alternative but the recommendation does not point to it.
```

- [ ] **Step 2: Update the input guard**

Replace:
```markdown
Any input other than 1, 2, or 3 re-presents the options.
```

With:
```markdown
Any input other than 1, 2, 3, or 4 re-presents the options.
```

- [ ] **Step 3: Add override dispatch for [4]**

After the existing `**If user selected [2] Subagent-per-task**` override block (and before the `**Override reliability:**` paragraph), add:

```markdown

**If user selected [4] Single-agent + parallel helper**, dispatch to `superpowers:executing-plans` with this preamble prepended:

```
IMPORTANT OVERRIDES FOR THIS EXECUTION (from orchestrate --strict):

1. TDD ENFORCEMENT: You MUST use red-green-refactor for every task.
   Write a failing test first, watch it fail, write minimal code to
   pass, watch it pass, then refactor. No production code without a
   failing test. This is non-negotiable.

2. VERIFICATION GATE: After completing each task, run the project's
   test/build commands and confirm they pass BEFORE proceeding to the
   next task. Do not skip this step.

3. SPEC COMPLIANCE CHECK: After each task, verify: "Did I build
   exactly what the plan specified? Nothing more, nothing less?"
   If you detect drift, fix before proceeding.

4. RETRY ON FAILURE: If tests fail for a task, you have 2 retry
   attempts to fix. If still failing after 2 retries, mark the task
   as BLOCKED and continue to the next task. Report all blocked
   tasks when execution completes.

5. PARALLEL HELPER: Spawn one background helper agent on the first
   parallelizable task. Reuse it via SendMessage for all subsequent
   parallel tasks. Never spawn more than one helper. For serial or
   coupled tasks, work directly — helper idles. Before each task,
   check the remaining tasks for one with no dependency on the
   current task. If found, send it to the helper. Wait for the
   helper to complete before starting the next phase. If the helper
   has not returned output after the main agent completes its own
   task, proceed without the helper's result and take ownership of
   the helper's task.
```

Note: No SKIP CODE QUALITY REVIEW override is included because `executing-plans` does not dispatch separate reviewer subagents — there is nothing to skip. The parallel helper override (5) is unique to option [4]; options [1] does not include it.
```

- [ ] **Step 4: Verify changes**

Read `ai-dev-tools/skills/orchestrate/references/strict-mode.md` from the presentation block through the override dispatch section. Confirm:
- Presentation has `[4]` and the "Parallelism yield" line
- Input guard accepts 1, 2, 3, or 4
- Override dispatch for [4] has all 5 override items (TDD, verification, spec compliance, retry, parallel helper)
- The dispatch target is `superpowers:executing-plans` (same as [1])
- The "Note" clarifies why no code-quality-review skip is needed

- [ ] **Step 5: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/references/strict-mode.md
git commit -m "feat(orchestrate): add parallel helper presentation, input guard, and override dispatch"
```

---

### Task 6: Final verification — read both files end-to-end and cross-check against spec

**Files:**
- Read: `ai-dev-tools/skills/orchestrate/SKILL.md`
- Read: `ai-dev-tools/skills/orchestrate/references/strict-mode.md`
- Read: `docs/superpowers/specs/2026-03-30-orchestrate-ux-fixes-design.md`

- [ ] **Step 1: Verify SKILL.md against spec**

Read the full SKILL.md. Cross-check:
- Mode Selection section matches Change C spec (prompt, behaviors, persistence, invalid input)
- First-Run User Prompt section matches Change B spec (trigger, flow, step mapping, fallback)
- Hint file Fields includes `mode` with preservation note
- Write rules mention `mode` preservation on reset
- Error handling table has the new row

- [ ] **Step 2: Verify strict-mode.md against spec**

Read the full strict-mode.md. Cross-check:
- Parallelism yield check matches spec (greedy algorithm, threshold 0.30)
- Recommendation algorithm has `parallelism_ratio = 0` init and `[4]` branch in correct position
- Presentation has `[4]`, yield line, and note about when yield line is shown
- Input guard accepts 4
- Override dispatch for [4] matches spec (5 overrides, executing-plans target, timeout/fallback)

- [ ] **Step 3: Verify acceptance criteria from spec**

Walk through each acceptance criterion from the spec's Acceptance Criteria section:
- Change A: 6 criteria about [4] visibility, recommendation, dispatch, helper spawning
- Change B: 5 criteria about prompt trigger, scan skip, validation contradiction, fallback, non-strict exclusion
- Change C: 6 criteria about one-time prompt, persistence, banner, invalid input, flag bypass, mode preservation

Flag any criterion not covered by the edits.

- [ ] **Step 4: Fix any gaps found in Steps 1-3**

If any acceptance criteria are not covered or any cross-check fails, make the targeted edit to fix it. If no gaps found, skip this step.

- [ ] **Step 5: Commit (if fixes were needed)**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md ai-dev-tools/skills/orchestrate/references/strict-mode.md
git commit -m "fix(orchestrate): address verification gaps in UX fixes"
```
