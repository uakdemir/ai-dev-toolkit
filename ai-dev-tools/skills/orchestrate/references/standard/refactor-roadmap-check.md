# Refactor Roadmap Check (Standard Mode)

Loaded only when `/orchestrate --use-roadmap` is passed.

---

## Behavior

1. Check if a refactor roadmap exists at `docs/monorepo-strategy/roadmap.md` OR `docs/layer-architecture/roadmap.md` with unchecked items (`- [ ]`).
2. If no roadmap exists or no unchecked items → skip, proceed normally.
3. If found, perform a **case-insensitive substring match** of the current feature name against the bold roadmap item labels (text between `**` markers in the checkbox line).
4. **If match succeeds:** delegate to `/implement` which performs its own refactor-unit pre-check (see `implement/SKILL.md` Refactor-Unit Branch Handling).
5. **If match fails:** proceed with normal standard-mode flow.

## Interaction with Steps

At Step 1 (Brainstorm): if a roadmap has unchecked items and no active spec for the next unit, suggest: "Next unit: `<name>`. Start brainstorming?"

At Step 7 (Complete, post-finalize): check roadmaps in order: `docs/monorepo-strategy/roadmap.md` first, then `docs/layer-architecture/roadmap.md`. Attempt case-insensitive substring match of current feature against item labels. Mark completed unit `[x]`. Print: "Unit `<completed>` done. Next: `<next-unit>`."

**Derive skill from roadmap path:**
- `docs/monorepo-strategy/roadmap.md` → `refactor-to-monorepo`
- `docs/layer-architecture/roadmap.md` → `refactor-to-layers`
