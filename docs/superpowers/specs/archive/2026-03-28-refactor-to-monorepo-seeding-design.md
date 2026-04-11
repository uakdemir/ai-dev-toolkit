# refactor-to-monorepo: User-Guided Module Seeding — Design Spec

**Date:** 2026-03-28
**Status:** Approved (R2 revisions applied)
**Plugin:** ai-dev-tools
**Skill:** refactor-to-monorepo (enhancement)
**Type:** Enhancement to existing skill

---

## Problem Statement

The refactor-to-monorepo skill currently discovers module boundaries through automated code analysis (domain analysis, data ownership, dependency graph). While it has user checkpoints for review and adjustment, the analysis always starts from zero — the developer's strategic knowledge about future code direction, team ownership plans, and which components will grow is not captured until after the analysis presents its (potentially misaligned) results.

Developers know which components should be separate modules because they know the roadmap — which areas will get investment, which will get dedicated teams, which need independent release cycles. Pure code analysis misses this. The result: the developer spends the Phase 1 checkpoint undoing automated groupings that don't match their intent.

## Enhancement Summary

Add an optional **Step 2: Module Seed Collection** that lets the user pre-define module boundaries before analysis runs. Seeds are `{ name, paths[] }` pairs treated as fixed constraints — the automated analysis fills in unassigned files around them and reports coupling honestly, but does not override user-specified boundaries.

Zero behavioral change for users who skip the seed step.

**Acceptance criteria:**
- **Skip path:** selecting "No" produces the exact same prompts, checkpoints, and artifacts as the current skill (no wording changes, no new fields)
- **Seeded path:** seeded files appear in the Phase 1 mapping with `Confidence: user-specified`; the Phase 1 checkpoint shows `[seeded]` labels on seeded modules; Phase 4 conflicts involving seeded modules resolve in favor of seeds with the conflict documented
- **Validation:** seed overlap and path-not-found errors block Phase 1 until resolved or discarded by the user

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Timing | Before analysis (Step 2) | Developer knowledge should constrain analysis, not react to it |
| Detail level | Module name + key files/dirs | Gives concrete anchors without requiring full file mapping |
| Constraint strength | Seeds are fixed constraints on automated analysis | Analysis cannot override seeds. User can still adjust at checkpoints after seeing full data. |
| Conflict resolution | Seed wins by default | Conflicts documented but resolved in favor of seed unless user overrides |
| Injection points | Start only | Existing Phase 1 and Phase 4 checkpoints cover mid-analysis adjustments |
| Approach | New Step 2 (optional) | Clean separation, existing steps minimally modified |

---

## New Step 2: Module Seed Collection (Optional)

Renumber existing steps: Step 2 (Analysis Pipeline) becomes Step 3, Step 3 (Output Artifacts) becomes Step 4. Update the Workflow Overview list accordingly. The new Step 2 is inserted between Tech Stack Selection and Analysis Pipeline.

No changes to the Progressive Disclosure Schedule — this step requires no reference file reads. Existing load-point descriptions remain valid (they reference phase names, not step numbers).

This step operates identically regardless of the tech stack selected in Step 1, including the "Other" path.

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

**Path input contract:** Paths must be repo-relative (e.g., `src/auth/`, not `/home/user/project/src/auth/`). Comma-separated list parsed into discrete entries. No glob patterns. Trailing slashes normalized (removed). Duplicate entries within a seed are deduplicated. Directories are expanded across the same source-file set that Phase 1 analyzes (stack-specific extensions from `references/tech-stacks.md`).

If **no**, proceed to Step 3 (Analysis Pipeline) with an empty seed list. Analysis runs identically to today.

### Validation

- If user opts in but adds zero seeds, confirm: "No seeds provided. Continue with automatic discovery?" Treat as equivalent to selecting "No."
- Directory paths are expanded recursively — all files under the directory at any depth are assigned to the seed's module.
- Verify each seeded path exists in the project. If a path doesn't exist, warn: "Path `{path}` not found. Remove from seed or continue anyway?"
- If the same file appears in two seeds, warn: "File `{path}` is in both `{seed_a}` and `{seed_b}`. Which module should own it?" Resolve before proceeding.

---

## Changes to Existing Analysis Phases

### Phase 1 (Domain Analysis) — Modified

**Add paragraph before Phase 1 sub-step 1 (SKILL.md line 62):** Pre-populate the file-to-domain mapping with seeded paths. Each seeded file gets `Confidence: user-specified`. Confidence tiers for the file-to-domain mapping: `user-specified` (from seeds) > `high` > `medium` > `low` (automated).

**During scanning (sub-steps 1-4):** Automated analysis assigns remaining unassigned files to domains. During automated domain assignment, skip any file already assigned via a seed — seeds are never overridden by automated assignment. The analysis may create new domains not in the seed list — this is expected.

If seeds cover all source files, Phase 1 reports that no additional domains were discovered and proceeds to the checkpoint with only seeded modules listed.

**Replace Phase 1 checkpoint text (sub-step 5, SKILL.md line 77) with seeded format when seeds are present; retain original prompt when no seeds:**

```
Domain boundaries found:

[seeded] auth (23 files) — src/auth/, src/middleware/auth.ts + 18 auto-assigned
[seeded] billing (15 files) — src/billing/ + 3 auto-assigned
dashboard (31 files) — discovered via route analysis
notifications (8 files) — discovered via directory analysis
shared (12 files) — used by 3+ domains

Does this match your mental model? Merge, split, rename, or adjust?
```

The user can adjust any domain at this checkpoint — including seeded ones — at the existing Phase 1 checkpoint. Seeds are not immutable after the user sees the data.

### Phase 2 (Data Ownership) — Unchanged

No modifications. Data ownership analysis maps tables to domains. The domains now include user-seeded ones, which is handled naturally by the existing logic.

### Phase 3 (Dependency Graph) — Unchanged

No modifications. Coupling scores are computed between all modules including seeded ones. High coupling between seeded modules and others is valuable feedback, not a reason to override.

### Phase 4 (Synthesis & Conflict Resolution) — Modified

Append to Phase 4 sub-step 4 (conflict resolution, SKILL.md lines 136-139) as an additional bullet:

**When a conflict involves a user-seeded module:** The seed boundary is preserved by default. Document the conflict and what the automated analysis would have suggested:

```
Conflict: Code analysis suggests merging auth and billing (coupling score: 78%).
Resolution: Preserved as separate modules per user seed.
Automated alternative: Merge into auth-billing (would reduce coupling by 34%).
```

The user can still override at the Phase 4 checkpoint if they change their mind after seeing the full data.

---

## Error Handling Addition

Add these rows to the existing error handling table:

| Scenario | Behavior |
|---|---|
| User seeds overlap (same file in two seeds) | Warn: "File `{path}` is in both `{seed_a}` and `{seed_b}`. Which module should own it?" Resolve before proceeding. |
| Seeded path does not exist | Warn: "Path `{path}` not found. Remove from seed or continue anyway?" If "continue," the path is dropped from the seed's path list but the seed module is kept (it will receive only auto-assigned files in Phase 1). If all paths in a seed are invalid, the seed is dropped entirely with a warning. |
| Seed name collides with auto-discovered domain | At Phase 1, auto-merge into the seeded module (seed takes priority). Present the merge in the checkpoint: "[seeded] auth (23 files, including 5 auto-merged from discovered 'auth' domain)." |

Other seed-related edge cases (empty directories after expansion) are handled at the Phase 1 checkpoint.

---

## Scope of Changes

**Modified:** `ai-dev-tools/skills/refactor-to-monorepo/SKILL.md` only (~35-40 lines added/modified, plus Workflow Overview renumbering)

**Not modified:**
- `references/tech-stacks.md` — seeds are a workflow concern, not stack-specific
- `references/analysis-framework.md` — analysis methodology unchanged. Note: SKILL.md seed rules (pre-population, `user-specified` confidence, auto-assignment guard) override the Phase 1 reference whenever the two conflict. The reference describes the fully automated flow; seeds add constraints on top of it.
- `references/module-spec-template.md` — module spec format unchanged
- `references/migration-patterns.md` — migration patterns unchanged

**Backward compatible:** Users who select "No, discover everything automatically" at Step 2 skip directly to Step 3 (Analysis Pipeline) — the exact same behavior as today.
