# Review Confirmation & Task Graph Visualization

**Status:** Draft
**Created:** 2026-03-31

## Summary

Three improvements to the orchestrate skill:

1. **Context health check updates** — Step 0 heuristic updated to `messages × 5_000` (floor 10K). Step-based floor added: at Step 5+, zone is minimum YELLOW (cannot override RED).

2. **Review confirmation prompt** — Steps 2 and 6 pause before invoking review-doc/review-code, showing the full command with `--max-iterations 3` default. User can continue or override. Applies to both standard and strict modes. Step 7 fix loop re-runs skip the prompt.

3. **Task graph visualization + unified Step 5** — Before execution model selection, generate an ASCII task dependency graph from the plan. Standard mode Step 5 now behaves identically to strict mode Step 5 (graph → recommendation → selection → dispatch with overrides). Execution model logic moves from `strict-mode.md` to a new `implementation-step.md`.

## Approach

**Approach B: Extract Step 5 into its own reference file.** Patch SKILL.md, move execution model logic out of `strict-mode.md` into `references/implementation-step.md`, create `references/task-graph.md` for the visualization format.

## Part 1: Context Health Check Updates

**File:** `SKILL.md` (Step 0 section)

Update heuristic:
```
estimated_used = number_of_user_messages × 5_000
estimated_used = max(estimated_used, 10_000)
usage_percent = estimated_used / 200_000 × 100
```

Add step-based floor rule:
```
Step-based floor: if hint file exists and step >= 5, zone is at minimum YELLOW.
The step-based floor raises the minimum zone to YELLOW but cannot override RED.
```

**File:** `references/strict-mode.md` (Execution Model Recommendation inputs)

Update the duplicated context estimate formula from `× 2_000` to `× 5_000`.

Note: this line in strict-mode.md will be moved to `implementation-step.md` as part of Part 3, but the value change applies regardless.

## Part 2: Review Confirmation Prompt

**File:** `SKILL.md` (Steps 2 and 6)

**Step 2 — Spec Review** stops auto-invoking. Instead presents:
```
── Step 2: Spec Review ──────────────────────────
Feature: <feature-name>
Spec: <spec_path>

Will run:
  /review-doc <spec_path> --max-iterations 3

Continue? or specify a different command.
```

User says continue → invoke as shown. User provides alternative → invoke that instead verbatim as typed. Edge cases unchanged: clean review (zero criticals) → update spec Status to "Approved" immediately.

**Step 6 — Code Review** stops auto-invoking. Instead presents:
```
── Step 6: Code Review ──────────────────────────
Feature: <feature-name>
Commits since plan: <N>

Will run:
  /review-code <N> --against <spec_path> --max-iterations 3

Continue? or specify a different command.
```

N is computed via `git log {plan_hash}..HEAD --oneline | wc -l` (same as current Step 6 logic). If plan_hash is empty or not found in git history, use `HEAD~10` as fallback and note this in the prompt. Continue runs as shown, user can override by providing any alternative verbatim as typed. Edge case unchanged: >50% non-feature commits interleaved → warn.

**Step 7 — Fix Findings** remains unchanged. Re-runs `/review-code` automatically within the fix loop (no prompt on re-runs).

## Part 3: Task Graph Visualization + Unified Step 5

### New file: `references/task-graph.md`

ASCII task dependency graph format:
- Top-to-bottom flow using box-drawing characters (`│` U+2502, `├` U+251C, `┬` U+252C, `┘` U+2518, `└` U+2514, `─` U+2500)
- Each task on its own line with: task name, color-coded difficulty emoji, estimated time
- Color coding: 🟢 fast/easy (~2-5 min), 🟠 medium (~8-10 min), 🔴 slow/complex (~15+ min)
- Parallel branches shown with `├──┬──┐` splitting and `└──┴──┘` merging
- Sequential dependencies shown with `│` vertical lines
- Total time estimate at bottom

Instructions for generating from a plan:
1. Map dependencies: for each task, identify which prior tasks must complete first (reads/modifies files the prior task creates or changes). If fewer than half of tasks have a Files section, treat all tasks as sequential and note this in the graph footer.
2. Identify parallel windows: tasks that touch disjoint file sets and share the same predecessor
3. Assign colors: estimate time based on file count, change complexity, risk of breakage. Thresholds: 🟢 = 1-2 files, mechanical changes (~2-5 min); 🟠 = 3-6 files or moderate complexity (~8-10 min); 🔴 = 7+ files, core changes, or high breakage risk (~15+ min)
4. Draw the graph with split/merge brackets for parallel groups

Example:
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
```

### New file: `references/implementation-step.md`

Loaded at Step 5 onset (both modes). Contains:

1. **Task graph instruction:** Read `references/task-graph.md`, analyze the plan, generate ASCII dependency graph, present to user.

2. **Execution model recommendation** (moved from `strict-mode.md`):
   - Inputs: task count, "Files" sections, context estimate (`messages × 5_000`, floor 10K)
   - Coupling assessment algorithm (HIGH >40%, MEDIUM 20-40%, LOW <20%)
   - Parallelism yield check (task_count >= 4, coupling != HIGH)
   - Recommendation algorithm (subagent-per-task / single-agent / single-agent + parallel helper)
   - Present to user block with [1]-[4] selection

3. **Override dispatch preambles** (moved from `strict-mode.md`):
   - Option [1] → `superpowers:executing-plans` with TDD, verification gate, spec compliance, retry overrides
   - Option [2] → `superpowers:subagent-driven-development` with TDD, coordinator verification, skip code-quality-reviewer, keep spec-reviewer, retry overrides
   - Option [3] → exit with message: 'Start a new conversation and run /orchestrate to continue with a fresh context window. Your plan is saved and will be picked up automatically.' (says `/orchestrate`, not `--strict`, since mode is persisted in hint file; if mode was activated via `--strict` flag only and no hint file exists, the new session will prompt for mode selection again — this is acceptable)
   - Option [4] → `superpowers:executing-plans` with option [1] overrides + parallel helper override

### Changes to `SKILL.md`

**Step 5** unified (no standard/strict split):
```
Step 5 — Implement: Plan exists, not all checkboxes [x].
  Read references/implementation-step.md: generate task graph,
  execution model recommendation, dispatch with overrides.
  Edge: all [x] → skip to Step 6.
```

Note: standard mode previously dispatched automatically to `superpowers:subagent-driven-development` at Step 5. That default is removed. Both modes now perform the full execution model selection prompt via `implementation-step.md`.

**Step 6** trigger line updated:

Before:
```
Step 6 — Code Review: Commits after plan hash (git log {plan_hash}..HEAD). Invoke /review-code {N} {spec_path}. Edge: >50% non-feature commits interleaved -> warn.
```

After:
```
Step 6 — Code Review: Commits after plan hash (git log {plan_hash}..HEAD). Present confirmation prompt with N and spec_path, then invoke /review-code {N} {spec_path} or user override. Edge: >50% non-feature commits interleaved -> warn.
```

**Conditional Loading section** updated (full before/after):

Before:
```
If --strict is active at Step 5 onset → Read references/strict-mode.md for execution model recommendation and override dispatch
If --strict is active at Step 8 onset → Read references/strict-mode.md for verification gate and structured finishing
```

After:
```
At Step 5 onset → Read references/implementation-step.md for task graph visualization, execution model recommendation, and override dispatch
If --strict is active at Step 8 onset → Read references/strict-mode.md for verification gate and structured finishing
```

The Step 8 entry is retained unchanged.

**Mode Selection prompt** updated (full before/after):

Before:
```
[1] Standard (relaxed)
[2] Strict — full workflow orchestration, TDD, verification gates
    (recommended if you're experienced with orchestrate)
```

After:
```
[1] Standard — TDD, execution model selection, dispatch with overrides
[2] Strict — TDD, verification gates, spec compliance, structured completion
    (recommended if you're experienced with orchestrate)
```

**Help text** updated — FLAGS section for `--strict` removes "intelligent execution model selection" from the list.

### Changes to `references/strict-mode.md`

Remove:
- "Execution Model Recommendation" section (entire block)
- "Override Dispatch" section (entire block)
- Header line referencing Step 5

Retain:
- Verification Gate (Step 8)
- Structured Finishing (Step 8)
- Error Handling (strict-only)

Updated header (full before/after):

Before (lines 3-5 of strict-mode.md):
```
This file is loaded by orchestrate when --strict is active:
  - At Step 5 onset: for execution model recommendation and override dispatch
  - At Step 8 onset: for verification gate and structured finishing
```

After (lines 3 only; lines 4-5 removed entirely):
```
This file is loaded by orchestrate when --strict is active at Step 8 for verification gate and structured finishing.
```

## Success Criteria

- Steps 2 and 6 always show the confirmation prompt before invoking review; Step 7 re-runs do not prompt.
- Standard mode and strict mode both execute the full execution model selection flow at Step 5; neither auto-dispatches to subagent-driven-development.
- `references/implementation-step.md` contains task graph generation, execution model recommendation, and all four dispatch options with the corrected Option [3] message.
- `references/task-graph.md` contains the ASCII graph format, generation instructions, color thresholds, and fallback rule for missing Files sections.
- `references/strict-mode.md` header is updated to reference Step 8 only; Execution Model Recommendation and Override Dispatch sections are removed.
- Conditional Loading in SKILL.md has exactly one Step 5 entry (implementation-step.md) and one Step 8 entry (strict-mode.md) unchanged.
- Context health check uses `messages × 5_000` with floor 10K; step-based floor applies YELLOW at Step 5+ without overriding RED.

## Files Changed

| File | Action |
|---|---|
| `SKILL.md` | Edit: Step 0 heuristic (formula → `× 5_000`, floor 10K, step-based floor), Steps 2/5/6, Conditional Loading, Mode Selection, help text |
| `references/strict-mode.md` | Edit: formula `× 2_000` → `× 5_000` (superseded by move to implementation-step.md in Part 3), remove execution model + override dispatch sections, update header |
| `references/implementation-step.md` | Create: task graph + execution model + dispatch (moved from strict-mode.md) |
| `references/task-graph.md` | Create: ASCII graph format and generation instructions |
