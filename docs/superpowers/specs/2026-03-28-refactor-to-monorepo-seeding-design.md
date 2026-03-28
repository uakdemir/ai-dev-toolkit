# refactor-to-monorepo: User-Guided Module Seeding — Design Spec

**Date:** 2026-03-28
**Status:** Approved
**Plugin:** ai-dev-tools
**Skill:** refactor-to-monorepo (enhancement)
**Type:** Enhancement to existing skill

---

## Problem Statement

The refactor-to-monorepo skill currently discovers module boundaries through automated code analysis (domain analysis, data ownership, dependency graph). While it has user checkpoints for review and adjustment, the analysis always starts from zero — the developer's strategic knowledge about future code direction, team ownership plans, and which components will grow is not captured until after the analysis presents its (potentially misaligned) results.

Developers know which components should be separate modules because they know the roadmap — which areas will get investment, which will get dedicated teams, which need independent release cycles. Pure code analysis misses this. The result: the developer spends the Phase 1 checkpoint undoing automated groupings that don't match their intent.

## Enhancement Summary

Add an optional **Step 1.5: Module Seed Collection** that lets the user pre-define module boundaries before analysis runs. Seeds are `{ name, paths[] }` pairs treated as fixed constraints — the automated analysis fills in unassigned files around them and reports coupling honestly, but does not override user-specified boundaries.

Zero behavioral change for users who skip the seed step.

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Timing | Before analysis (Step 1.5) | Developer knowledge should constrain analysis, not react to it |
| Detail level | Module name + key files/dirs | Gives concrete anchors without requiring full file mapping |
| Constraint strength | Seeds are fixed | The whole point is that developer knows things analysis can't see |
| Conflict resolution | Seed wins by default | Conflicts documented but resolved in favor of seed unless user overrides |
| Injection points | Start only | Existing Phase 1 and Phase 4 checkpoints cover mid-analysis adjustments |
| Approach | New Step 1.5 (optional) | Clean separation, existing steps minimally modified |

---

## Step 1.5: Module Seed Collection (Optional)

Insert between Step 1 (Tech Stack Selection) and Step 2 (Analysis Pipeline).

### Interaction

```
Before I analyze the codebase, do you already have opinions about
which components should become separate modules?

  > Yes, I have specific modules in mind
  > No, discover everything automatically
```

If **yes**, collect seeds one at a time:

```
Module seed 1:
  Name: auth
  Key files/directories: src/auth/, src/middleware/auth.ts

Add another module seed? (yes/no)
```

Each seed is a `{ name: string, paths: string[] }` pair. Repeat until the user stops.

If **no**, proceed to Step 2 with an empty seed list. Analysis runs identically to today.

### Validation

- Verify each seeded path exists in the project. If a path doesn't exist, warn: "Path `{path}` not found. Remove from seed or continue anyway?"
- If the same file appears in two seeds, warn: "File `{path}` is in both `{seed_a}` and `{seed_b}`. Which module should own it?" Resolve before proceeding.

---

## Changes to Existing Analysis Phases

### Phase 1 (Domain Analysis) — Modified

**Before scanning:** Pre-populate the file-to-domain mapping with seeded paths. Each seeded file gets `Confidence: user-specified` (highest tier, above automated high/medium/low).

**During scanning:** Automated analysis assigns remaining unassigned files to domains. It may create new domains not in the seed list — this is expected (the user seeded some modules, the analysis discovers others).

**At the Phase 1 checkpoint:** Present seeded modules first with a `[seeded]` tag:

```
Domain boundaries found:

[seeded] auth (23 files) — src/auth/, src/middleware/auth.ts + 18 auto-assigned
[seeded] billing (15 files) — src/billing/ + 3 auto-assigned
dashboard (31 files) — discovered via route analysis
notifications (8 files) — discovered via directory analysis
shared (12 files) — used by 3+ domains

Does this match your mental model? Merge, split, rename, or adjust?
```

The user can adjust any domain at this checkpoint — including seeded ones — using the existing merge/split/rename interaction. Seeds are not immutable after the user sees the data.

### Phase 2 (Data Ownership) — Unchanged

No modifications. Data ownership analysis maps tables to domains. The domains now include user-seeded ones, which is handled naturally by the existing logic.

### Phase 3 (Dependency Graph) — Unchanged

No modifications. Coupling scores are computed between all modules including seeded ones. High coupling between seeded modules and others is valuable feedback, not a reason to override.

### Phase 4 (Synthesis & Conflict Resolution) — Modified

Add one conflict resolution rule:

**When a conflict involves a user-seeded module:** The seed boundary is preserved by default. Document the conflict and what the automated analysis would have suggested:

```
Conflict: Code analysis suggests merging auth and billing (coupling score: 0.78).
Resolution: Preserved as separate modules per user seed.
Automated alternative: Merge into auth-billing (would reduce coupling by 34%).
```

The user can still override at the Phase 4 checkpoint if they change their mind after seeing the full data.

---

## Error Handling Addition

Add one row to the existing error handling table:

| Scenario | Behavior |
|---|---|
| User seeds overlap (same file in two seeds) | Warn: "File `{path}` is in both `{seed_a}` and `{seed_b}`. Which module should own it?" Resolve before proceeding. |

---

## Scope of Changes

**Modified:** `ai-dev-tools/skills/refactor-to-monorepo/SKILL.md` only (~25 lines added/modified)

**Not modified:**
- `references/tech-stacks.md` — seeds are a workflow concern, not stack-specific
- `references/analysis-framework.md` — analysis methodology unchanged
- `references/module-spec-template.md` — module spec format unchanged
- `references/migration-patterns.md` — migration patterns unchanged

**Backward compatible:** Users who select "No, discover everything automatically" at Step 1.5 get the exact same behavior as today.
