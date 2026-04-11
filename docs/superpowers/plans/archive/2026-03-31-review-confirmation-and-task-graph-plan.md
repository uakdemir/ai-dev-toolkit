# Review Confirmation & Task Graph Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add review confirmation prompts to Steps 2/6, create task graph visualization for Step 5, and unify standard/strict Step 5 behavior.

**Architecture:** Edit SKILL.md (context health, step triggers, conditional loading, mode selection, help text), trim strict-mode.md (remove execution model sections), create two new reference files (task-graph.md, implementation-step.md).

**Tech Stack:** Markdown skill files only — no runtime code, no tests, no build.

---

### Task 1: Update context health check in SKILL.md

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md:64-79`

- [x] **Step 1: Update the estimation formula multiplier**

In `SKILL.md`, replace the estimation block (lines 65-68):

```
estimated_used = number_of_user_messages_in_conversation × 2_000
estimated_used = max(estimated_used, 10_000)
usage_percent = estimated_used / 200_000 × 100
```

With:

```
estimated_used = number_of_user_messages_in_conversation × 5_000
estimated_used = max(estimated_used, 10_000)
usage_percent = estimated_used / 200_000 × 100
```

- [x] **Step 2: Add step-based floor rule**

After the estimation block (after line 68), before the "Compression signal boost" paragraph, add:

```
**Step-based floor:** If the hint file exists and `step >= 5`, the zone is at minimum YELLOW regardless of message count. This floor raises the minimum zone but cannot override RED (triggered by compression signal or >80% threshold).
```

- [x] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "feat(orchestrate): update context health heuristic to ×5000 and add step-based floor"
```

---

### Task 2: Add review confirmation prompts to Steps 2 and 6

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md:214-219`

- [x] **Step 1: Update Step 2 trigger line**

In `SKILL.md` line 214, replace:

```
**Step 2 — Spec Review:** Spec exists, Status not "Approved"/"Approved with suggestions", or review not run. Invoke `/review-doc {spec_path}`. Edge: clean review (zero criticals) -> update spec Status to "Approved" immediately.
```

With:

```
**Step 2 — Spec Review:** Spec exists, Status not "Approved"/"Approved with suggestions", or review not run. Present confirmation prompt with spec_path, then invoke `/review-doc {spec_path} --max-iterations 3` or user override. Edge: clean review (zero criticals) -> update spec Status to "Approved" immediately.
```

- [x] **Step 2: Update Step 6 trigger line**

In `SKILL.md` line 218, replace:

```
**Step 6 — Code Review:** Commits after plan hash (`git log {plan_hash}..HEAD`). Invoke `/review-code {N} {spec_path}`. Edge: >50% non-feature commits interleaved -> warn.
```

With:

```
**Step 6 — Code Review:** Commits after plan hash (`git log {plan_hash}..HEAD`). Present confirmation prompt with N and spec_path, then invoke `/review-code {N} --against {spec_path} --max-iterations 3` or user override. Edge: >50% non-feature commits interleaved -> warn.
```

- [x] **Step 3: Add confirmation prompt details after Steps 1-8 section**

After the Steps 1-8 section (after line 223, before the Error Handling section), add a new section:

```markdown
---

## Review Confirmation Prompts

Steps 2 and 6 present a confirmation prompt before invoking the review skill. The prompt shows the full command with `--max-iterations 3` as default.

**Step 2 prompt:**
```
── Step 2: Spec Review ──────────────────────────
Feature: <feature-name>
Spec: <spec_path>

Will run:
  /review-doc <spec_path> --max-iterations 3

Continue? or specify a different command.
```

**Step 6 prompt:**
```
── Step 6: Code Review ──────────────────────────
Feature: <feature-name>
Commits since plan: <N>

Will run:
  /review-code <N> --against <spec_path> --max-iterations 3

Continue? or specify a different command.
```

**Input handling:** Any affirmative response (yes, y, continue, go, or pressing Enter) invokes the shown command. Any other non-empty input is treated as an alternative command to invoke verbatim.

**N derivation (Step 6):** Computed via `git log {plan_hash}..HEAD --oneline | wc -l`. If plan_hash is empty, attempt to populate via `git log --format=%H -1 -- {plan_path}`; if still empty, fall back to full scan per existing Step 6 behavior and show `Commits since plan: unknown (plan hash not found)`.

**Step 7 re-runs:** Step 7's internal re-run of `/review-code` within the same invocation skips the prompt. The Step 6 confirmation prompt appears on every orchestrate invocation that detects Step 6, including after Step 7 fixes.
```

- [x] **Step 4: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "feat(orchestrate): add review confirmation prompts to Steps 2 and 6"
```

---

### Task 3: Update Step 5, Conditional Loading, Mode Selection, and help text in SKILL.md

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md:13-17,33-39,196-198,217`

- [x] **Step 1: Update Step 5 trigger line**

In `SKILL.md` line 217, replace:

```
**Step 5 — Implement:** Plan exists, not all checkboxes `[x]`. Default: invoke `superpowers:subagent-driven-development`. --strict: Read references/strict-mode.md, execution model recommendation, dispatch with overrides. Edge: all `[x]` -> skip to Step 6.
```

With:

```
**Step 5 — Implement:** Plan exists, not all checkboxes `[x]`. Read references/implementation-step.md: generate task graph, execution model recommendation, dispatch with overrides. Edge: all `[x]` -> skip to Step 6.
```

- [x] **Step 2: Update Conditional Loading section**

In `SKILL.md` lines 196-198, replace:

```
If --strict is active at Step 5 onset:
  -> Read references/strict-mode.md for execution model recommendation
    and override dispatch (single-agent, subagent, and parallel helper blocks).
```

With:

```
At Step 5 onset (all paths including First-Run User Prompt):
  -> Read references/implementation-step.md for task graph visualization,
    execution model recommendation, and override dispatch.
```

- [x] **Step 3: Update Mode Selection prompt**

In `SKILL.md` lines 35-37, replace:

```
  [1] Standard (relaxed)
  [2] Strict — full workflow orchestration, TDD, verification gates
      (recommended if you're experienced with orchestrate)
```

With:

```
  [1] Standard — TDD, execution model selection, dispatch with overrides
  [2] Strict — TDD, verification gates, spec compliance, structured completion
      (recommended if you're experienced with orchestrate)
```

- [x] **Step 4: Update help text FLAGS section**

In `SKILL.md` lines 13-17, replace:

```
  --strict    Enable quality discipline: TDD enforcement, verification
              gates, per-task spec compliance review, intelligent execution
              model selection, and structured completion options.
              Recommended for features where correctness matters more
              than speed.
```

With:

```
  --strict    Enable quality discipline: TDD enforcement, verification
              gates, per-task spec compliance review, and structured
              completion options. Recommended for features where
              correctness matters more than speed.
```

- [x] **Step 5: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "feat(orchestrate): unify Step 5, update mode selection and help text"
```

---

### Task 4: Create references/task-graph.md

**Files:**
- Create: `ai-dev-tools/skills/orchestrate/references/task-graph.md`

- [x] **Step 1: Write the task graph reference file**

Create `ai-dev-tools/skills/orchestrate/references/task-graph.md` with:

```markdown
# Task Graph Visualization

Generate an ASCII task dependency graph for an implementation plan.

## Format

1. **Layout**: Top-to-bottom flow using box-drawing characters (`│` U+2502, `├` U+251C, `┬` U+252C, `┘` U+2518, `└` U+2514, `─` U+2500)
2. **Each task on its own line** with: task name, color-coded difficulty emoji, and estimated time
3. **Color coding** by implementation intensity/time:
   - 🟢 Green = fast/easy (~2-5 min, 1-2 files, mechanical changes)
   - 🟠 Orange = medium (~8-10 min, 3-6 files or moderate complexity)
   - 🔴 Red = slow/complex (~15+ min, 7+ files, core changes, or high breakage risk)
4. **Parallel branches** shown with `├──┬──┐` splitting and `└──┴──┘` merging
5. **Sequential dependencies** shown with simple `│` vertical lines
6. **Total time estimate** at the bottom (both sequential and parallel-optimized)

## How to Generate from a Plan

1. **Map dependencies**: For each task, identify which prior tasks must complete before it can start. A task depends on another if it reads/modifies files that the prior task creates or changes. If fewer than half of tasks have a Files section, treat all tasks as sequential and note this in the graph footer.
2. **Identify parallel windows**: Tasks that touch disjoint file sets and share the same predecessor can run in parallel. Verify no shared type surfaces or build-breaking partial states.
3. **Assign colors**: Estimate time based on number of files touched, complexity of changes (copy vs. rewrite), and risk of breakage. Use the 3-tier color scale above.
4. **Add parenthetical context**: Brief reason for the rating (e.g., "templated", "7 files, db threading", "just deletions").
5. **Draw the graph**: Sequential tasks get `│` connectors. Parallel groups get the split/merge bracket pattern.

## Example

```
Task 1: Verify Green Baseline          🟢 ~2 min  (just run commands)
  │
Task 2: Scaffold + Schema              🟢 ~3 min  (templated from harvester)
  │
Task 3: Move + Convert Service Files   🟠 ~10 min (DI + builder API on 21K file)
  │
  ├──────────────┬──────────────┐
Task 4:        Task 5:       Task 6:
Dead Pipeline  Contracts+    Move Tests
🟠 ~8 min     Client Cleanup 🟢 ~5 min
               🟠 ~8 min
  └──────────────┴──────────────┘
  │
Task 7: Shim Cleanup + Verify          🟢 ~3 min  (rm + grep checks)

Total: ~34 min sequential, ~21 min with parallelism
```
```

- [x] **Step 2: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/references/task-graph.md
git commit -m "feat(orchestrate): add task graph visualization reference"
```

---

### Task 5: Create references/implementation-step.md

**Files:**
- Create: `ai-dev-tools/skills/orchestrate/references/implementation-step.md`
- Read (for content to move): `ai-dev-tools/skills/orchestrate/references/strict-mode.md`

- [x] **Step 1: Write the implementation step reference file**

Create `ai-dev-tools/skills/orchestrate/references/implementation-step.md`. This file combines the task graph instruction with the execution model logic moved from strict-mode.md. The content below is the complete file:

```markdown
# Implementation Step

This file is loaded by orchestrate at Step 5 onset for task graph visualization, execution model recommendation, and override dispatch.

---

## Task Graph

Read `references/task-graph.md`, analyze the plan, and generate an ASCII dependency graph.

Present the task graph and execution model recommendation together in the same response (no intermediate user acknowledgment required between them).

---

## Execution Model Recommendation

**Inputs:**
1. Plan file (count tasks, scan for "Files" sections)
2. Context estimate: `estimated_used = number_of_user_messages_in_conversation × 5_000`. Apply floor: `estimated_used = max(estimated_used, 10_000)`.
3. Task coupling from "Files" sections (see algorithm below)

**Coupling assessment:**
```
Scan each task's "Files" section for paths listed.
If no tasks have a "Files" section → MEDIUM (conservative default).
If fewer than half of tasks have a "Files" section → MEDIUM (insufficient data).
Otherwise, only tasks with "Files" sections participate:
  Count how many participating tasks share at least one file path.
  >40% share → HIGH | 20-40% → MEDIUM | <20% → LOW
```

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

**Recommendation algorithm:**
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

**Present to user:**
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

The "Parallelism yield" line is shown only when the yield check ran (task_count >= 4 and coupling != HIGH). When [4] is not eligible (ratio < 0.30), it still appears as an alternative but the recommendation does not point to it.

Any input other than 1, 2, 3, or 4 re-presents the options.

**Option [3] behavior:** Print: "Start a new conversation and run `/orchestrate` to continue with a fresh context window. Your plan is saved and will be picked up automatically." Then exit. Mode is persisted in the hint file; if mode was activated via `--strict` flag only and no hint file mode is set, the new session will prompt for mode selection again.

## Override Dispatch

After user selects [1], [2], or [4], dispatch to the chosen superpowers skill with a behavioral override block prepended to the dispatch prompt.

**If user selected [1] Single-agent**, dispatch to `superpowers:executing-plans` with this preamble prepended:

```
IMPORTANT OVERRIDES FOR THIS EXECUTION (from orchestrate):

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
```

Note: No SKIP CODE QUALITY REVIEW override is included because `executing-plans` does not dispatch separate reviewer subagents — there is nothing to skip.

Single-agent spec compliance limitation: Self-assessment is less reliable than the subagent spec-reviewer, but is the only option without subagent architecture. Drift will be caught by review-code at Step 6.

**If user selected [2] Subagent-per-task**, dispatch to `superpowers:subagent-driven-development` with this preamble prepended:

```
IMPORTANT OVERRIDES FOR THIS EXECUTION (from orchestrate):

1. TDD ENFORCEMENT: The implementer subagent MUST use red-green-refactor
   for every change. Write a failing test first, watch it fail, write
   minimal code to pass, watch it pass, then refactor. No production
   code without a failing test. This is non-negotiable.

2. VERIFICATION GATE: After each task completes, the coordinator
   (not the implementer subagent) must run the project's test/build
   commands and confirm they pass BEFORE marking the task as done.
   Do not rely on the subagent's self-report — run verification fresh.

3. SKIP CODE QUALITY REVIEW: Do NOT dispatch the code-quality-reviewer
   after each task. Quality review is handled by a superior engine
   (review-code with confidence scoring and noise filtering) at a
   later stage. Dispatching both is redundant and wastes tokens.

4. KEEP SPEC COMPLIANCE REVIEW: DO dispatch the spec-reviewer after
   each task. This lightweight "did you build what the plan said?"
   check is essential for catching scope drift.

5. RETRY ON FAILURE: If a subagent's tests fail, allow 2 retry
   attempts. If still failing after 2 retries, mark the task as
   BLOCKED and continue to the next task. Report all blocked tasks
   when execution completes.
```

**If user selected [4] Single-agent + parallel helper**, dispatch to `superpowers:executing-plans` with this preamble prepended:

```
IMPORTANT OVERRIDES FOR THIS EXECUTION (from orchestrate):

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

Note: No SKIP CODE QUALITY REVIEW override is included because `executing-plans` does not dispatch separate reviewer subagents — there is nothing to skip. The parallel helper override (5) is unique to option [4]; option [1] does not include it.

**Override reliability:** Under context pressure, the superpowers skill's native instructions may take priority over these overrides. The failure mode is benign: the agent may occasionally dispatch the code-quality-reviewer (wasting tokens), skip TDD enforcement, or skip verification (all caught by review-code at Step 6 and the Step 8 verification gate). No destructive failure path exists.
```

- [x] **Step 2: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/references/implementation-step.md
git commit -m "feat(orchestrate): add implementation step reference with task graph and execution model"
```

---

### Task 6: Trim strict-mode.md

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/references/strict-mode.md`

- [x] **Step 1: Update the header**

In `strict-mode.md`, replace lines 1-7:

```
# Strict Mode Overrides

This file is loaded by orchestrate when `--strict` is active.
- At Step 5 onset: for execution model recommendation and override dispatch.
- At Step 8: for verification gate and structured finishing.

---
```

With:

```
# Strict Mode Overrides

This file is loaded by orchestrate when --strict is active at Step 8 for verification gate and structured finishing.

---
```

- [x] **Step 2: Remove the Execution Model Recommendation section**

Delete the entire "## Execution Model Recommendation (--strict only)" section (lines 9-81 in current file, from the section heading through the Option [3] behavior paragraph, ending before "## Override Dispatch").

- [x] **Step 3: Remove the Override Dispatch section**

Delete the entire "## Override Dispatch (--strict only)" section (lines 82-181, from the section heading through the "Override reliability" paragraph, ending before "## Verification Gate").

- [x] **Step 4: Verify remaining content**

The file should now contain only:
1. Header (updated)
2. `---` separator
3. `## Verification Gate (--strict only)` section
4. `## Structured Finishing (--strict only)` section
5. `## Error Handling (--strict only)` section

- [x] **Step 5: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/references/strict-mode.md
git commit -m "refactor(orchestrate): move execution model and dispatch to implementation-step.md"
```
