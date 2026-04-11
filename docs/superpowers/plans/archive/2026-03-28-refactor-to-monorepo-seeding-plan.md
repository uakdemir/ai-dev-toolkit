# refactor-to-monorepo Seeding Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional user-guided module seeding to the refactor-to-monorepo skill — ~35-40 lines of surgical edits to one existing SKILL.md file.

**Architecture:** Insert a new Step 2 (Module Seed Collection) into the existing SKILL.md workflow. Renumber existing steps 2→3, 3→4. Modify Phase 1 and Phase 4 within the new Step 3 to respect seed constraints. Add error handling rows.

**Tech Stack:** Markdown skill file edit. No runtime code.

**Spec:** `docs/superpowers/specs/2026-03-28-refactor-to-monorepo-seeding-design.md`

---

## File Structure

```
ai-dev-tools/skills/refactor-to-monorepo/
└── SKILL.md    # Modify: ~35-40 lines added/modified + step renumbering
```

Single file, surgical edits at 5 specific locations within the file.

---

### Task 1: Renumber existing steps and insert Step 2

**Files:**
- Modify: `ai-dev-tools/skills/refactor-to-monorepo/SKILL.md`

This task makes all changes in one commit since the edits are interdependent (renumbering + new step + phase modifications must be consistent).

- [ ] **Step 1: Read the current SKILL.md to confirm line numbers**

```bash
head -16 ai-dev-tools/skills/refactor-to-monorepo/SKILL.md
```

Verify: lines 14-16 show the 3-step Workflow Overview list.

- [ ] **Step 2: Update Workflow Overview (lines 14-16)**

Replace:
```markdown
1. **Tech Stack Selection** — determine stack-specific analysis patterns and tooling.
2. **Analysis Pipeline** — four phases: domain analysis, data ownership, dependency graph, synthesis.
3. **Output Artifacts** — generate strategy documents to `docs/monorepo-strategy/`.
```

With:
```markdown
1. **Tech Stack Selection** — determine stack-specific analysis patterns and tooling.
2. **Module Seed Collection (Optional)** — let the user pre-define module boundaries before analysis.
3. **Analysis Pipeline** — four phases: domain analysis, data ownership, dependency graph, synthesis.
4. **Output Artifacts** — generate strategy documents to `docs/monorepo-strategy/`.
```

- [ ] **Step 3: Insert new Step 2 section after the Step 1 closing `---` (after line 51)**

Insert this complete section between the `---` that ends Step 1 and the current `## Step 2: Analysis Pipeline`:

```markdown
## Step 2: Module Seed Collection (Optional)

Before analysis, offer the user an opportunity to pre-define module boundaries:

```
Before I analyze the codebase, do you already have opinions about
which components should become separate modules?

  > Yes, I have specific modules in mind
  > No, discover everything automatically
```

**If yes**, collect seeds one at a time:

```
Module seed 1:
  Name: [user provides]
  Key files/directories: [user provides comma-separated repo-relative paths]

Add another module seed? (yes/no)
```

Each seed is a `{ name, paths[] }` pair. Paths must be repo-relative, comma-separated, no globs. Trailing slashes are normalized. Duplicates within a seed are deduplicated. Directory paths are expanded recursively across the same source-file set that Phase 1 analyzes (stack-specific extensions).

**Validation before proceeding:**
- If user opted in but added zero seeds: "No seeds provided. Continue with automatic discovery?" Treat as "No."
- Verify each path exists. If not found: "Path `{path}` not found. Remove from seed or continue anyway?" If "continue," path is dropped but seed module is kept. If all paths in a seed are invalid, seed is dropped entirely with a warning.
- If same file appears in two seeds: "File `{path}` is in both `{seed_a}` and `{seed_b}`. Which module should own it?" Resolve before proceeding.

**If no**, proceed to Step 3 with an empty seed list. Analysis runs identically to the pre-enhancement behavior.

This step operates identically regardless of the tech stack selected in Step 1, including the "Other" path.

---
```

- [ ] **Step 4: Renumber `## Step 2: Analysis Pipeline` to `## Step 3: Analysis Pipeline` (line 54)**

Change:
```markdown
## Step 2: Analysis Pipeline
```
To:
```markdown
## Step 3: Analysis Pipeline
```

- [ ] **Step 5: Insert seed pre-population paragraph before Phase 1 sub-step 1 (before line 62)**

Insert before `1. Scan routes, pages, and feature directories`:

```markdown
**If seeds were provided in Step 2:** Pre-populate the file-to-domain mapping with seeded paths. Each seeded file gets `Confidence: user-specified` (highest tier, above automated `high`/`medium`/`low`). During automated domain assignment (sub-steps 1-4 below), skip any file already assigned via a seed — seeds are never overridden. If seeds cover all source files, report no additional domains discovered and proceed to the checkpoint. If a seed name collides with an auto-discovered domain name, auto-merge into the seeded module.
```

- [ ] **Step 6: Replace Phase 1 checkpoint text (line 77)**

Replace:
```markdown
5. **User checkpoint:** "I found these domain boundaries: [list with file counts per domain]. Does this match your mental model? Should I merge, split, or rename any domains?"
```

With:
```markdown
5. **User checkpoint:** Present domain boundaries. If seeds were provided, show seeded modules first with a `[seeded]` tag (e.g., `[seeded] auth (23 files) — src/auth/ + 18 auto-assigned`). Then show auto-discovered domains. Ask: "Does this match your mental model? Merge, split, rename, or adjust?" The user can adjust any domain at this checkpoint, including seeded ones — seeds are not immutable after the user sees the data. When no seeds, use the original prompt: "I found these domain boundaries: [list with file counts per domain]. Does this match your mental model? Should I merge, split, or rename any domains?"
```

- [ ] **Step 7: Add seed conflict resolution rule to Phase 4 sub-step 4 (after line 139)**

After the existing line:
```markdown
   - Common resolutions: merge two domains, split a domain, create a shared service, introduce an API boundary, designate a primary owner with read-only access for consumers.
```

Insert:
```markdown
   - **Seed-wins rule:** When a conflict involves a user-seeded module, preserve the seed boundary by default. Document the conflict and the automated alternative (e.g., "Code analysis suggests merging auth and billing (coupling score: 78%). Preserved as separate modules per user seed. Alternative: merge into auth-billing (would reduce coupling by 34%)."). The user can override at the Phase 4 checkpoint.
```

- [ ] **Step 8: Renumber `## Step 3: Output Artifacts` to `## Step 4: Output Artifacts` (line 147)**

Change:
```markdown
## Step 3: Output Artifacts
```
To:
```markdown
## Step 4: Output Artifacts
```

- [ ] **Step 9: Add error handling rows (after line 251)**

Append to the error handling table (before the closing of the section):

```markdown
| User seeds overlap (same file in two seeds) | Warn: "File `{path}` is in both `{seed_a}` and `{seed_b}`. Which module should own it?" Resolve before proceeding to Phase 1. |
| Seeded path does not exist | Warn: "Path `{path}` not found. Remove from seed or continue anyway?" If "continue," path is dropped but seed module is kept. If all paths in a seed are invalid, seed is dropped with a warning. |
| Seed name collides with auto-discovered domain | Auto-merge into the seeded module at Phase 1. Present in checkpoint: "[seeded] auth (23 files, including 5 auto-merged from discovered 'auth' domain)." |
```

- [ ] **Step 10: Verify the changes**

```bash
# Check step numbering is consistent
grep "^## Step" ai-dev-tools/skills/refactor-to-monorepo/SKILL.md
```

Expected output:
```
## Step 1: Tech Stack Selection
## Step 2: Module Seed Collection (Optional)
## Step 3: Analysis Pipeline
## Step 4: Output Artifacts
```

```bash
# Check Workflow Overview has 4 items
sed -n '14,17p' ai-dev-tools/skills/refactor-to-monorepo/SKILL.md
```

Expected: 4 numbered items (Tech Stack, Seed Collection, Analysis, Output).

```bash
# Check error handling table has new rows
grep -c "seed" ai-dev-tools/skills/refactor-to-monorepo/SKILL.md
```

Expected: 10+ occurrences of "seed" (new step + Phase 1 mods + Phase 4 + error handling).

- [ ] **Step 11: Commit**

```bash
git add ai-dev-tools/skills/refactor-to-monorepo/SKILL.md
git commit -m "feat(refactor-to-monorepo): add optional module seed collection (Step 2)

New Step 2 lets users pre-define module boundaries before analysis.
Seeds are {name, paths[]} pairs treated as fixed constraints on
automated analysis. Existing steps renumbered (2→3, 3→4).
Phase 1 pre-populates mapping with seeds, Phase 4 resolves
conflicts in favor of seeds. Backward compatible — skip path
produces identical behavior to pre-enhancement."
```
