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
