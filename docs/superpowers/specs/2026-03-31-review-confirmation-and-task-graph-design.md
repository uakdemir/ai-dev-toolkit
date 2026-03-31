# Review Confirmation & Task Graph Visualization

**Status:** Draft
**Created:** 2026-03-31

## Summary

Two minor improvements to the orchestrate skill:

1. **Review confirmation prompt** — Steps 2 and 6 pause before invoking review-doc/review-code, showing the full command with `--max-iterations 3` default. User can continue or override. Applies to both standard and strict modes, first invocation only (Step 7 fix loop re-runs skip the prompt).

2. **Task graph visualization + unified Step 5** — Before execution model selection, generate an ASCII task dependency graph from the plan. Standard mode Step 5 now behaves identically to strict mode Step 5 (graph → recommendation → selection → dispatch with overrides). Execution model logic moves from `strict-mode.md` to a new `implementation-step.md`.

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

User says continue → invoke as shown. User provides alternative → invoke that instead. Edge cases unchanged: clean review (zero criticals) → update spec Status to "Approved" immediately.

**Step 6 — Code Review** stops auto-invoking. Instead presents:
```
── Step 6: Code Review ──────────────────────────
Feature: <feature-name>
Commits since plan: <N>

Will run:
  /review-code <N> --against <spec_path> --max-iterations 3

Continue? or specify a different command.
```

Same behavior — continue runs as shown, user can override. Edge case unchanged: >50% non-feature commits interleaved → warn.

**Step 7 — Fix Findings** remains unchanged. Re-runs `/review-code` automatically within the fix loop (no prompt on re-runs).

## Part 3: Task Graph Visualization + Unified Step 5

### New file: `references/task-graph.md`

ASCII task dependency graph format:
- Top-to-bottom flow using box-drawing characters (`│`, `├`, `┬`, `┘`, `└`, `─`)
- Each task on its own line with: task name, color-coded difficulty emoji, estimated time
- Color coding: 🟢 fast/easy (~2-5 min), 🟠 medium (~8-10 min), 🔴 slow/complex (~15+ min)
- Parallel branches shown with `├──┬──┐` splitting and `└──┴──┘` merging
- Sequential dependencies shown with `│` vertical lines
- Total time estimate at bottom

Instructions for generating from a plan:
1. Map dependencies: for each task, identify which prior tasks must complete first (reads/modifies files the prior task creates or changes)
2. Identify parallel windows: tasks that touch disjoint file sets and share the same predecessor
3. Assign colors: estimate time based on file count, change complexity, risk of breakage
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
   - Option [3] → exit with resume instructions (message says `/orchestrate`, not `--strict`, since mode is persisted in hint file)
   - Option [4] → `superpowers:executing-plans` with option [1] overrides + parallel helper override

### Changes to `SKILL.md`

**Step 5** unified (no standard/strict split):
```
Step 5 — Implement: Plan exists, not all checkboxes [x].
  Read references/implementation-step.md: generate task graph,
  execution model recommendation, dispatch with overrides.
  Edge: all [x] → skip to Step 6.
```

**Conditional Loading section** updated:
- Remove: "If --strict is active at Step 5 onset → Read references/strict-mode.md for execution model recommendation and override dispatch"
- Add: "At Step 5 onset → Read references/implementation-step.md for task graph visualization, execution model recommendation, and override dispatch"

**Mode Selection prompt** updated — remove "[2] Strict" reference to "intelligent execution model selection" (now in both modes). The strict description becomes:
```
[2] Strict — TDD, verification gates, spec compliance, structured completion
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

Updated header:
```
This file is loaded by orchestrate when --strict is active at Step 8
for verification gate and structured finishing.
```

## Files Changed

| File | Action |
|---|---|
| `SKILL.md` | Edit: Step 0 heuristic, Steps 2/5/6, Conditional Loading, Mode Selection, help text |
| `references/strict-mode.md` | Edit: remove execution model + override dispatch sections |
| `references/implementation-step.md` | Create: task graph + execution model + dispatch (from strict-mode.md) |
| `references/task-graph.md` | Create: ASCII graph format and generation instructions |
