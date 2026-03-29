---
name: refactor-to-monorepo
description: "Use when the user wants to split a monolith into modules, identify module boundaries, analyze code coupling, plan a monorepo migration, evaluate monorepo tooling, or reduce codebase size for better AI agent efficiency — even if they don't explicitly say monorepo."
---

<help-text>
refactor-to-monorepo — Analyze monolith for monorepo extraction strategy

USAGE
  /refactor-to-monorepo

EXAMPLES
  /refactor-to-monorepo              Analyze and produce extraction plan
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

# refactor-to-monorepo

Analyze a monolith and produce a comprehensive monorepo extraction strategy. Output is documents only — no code changes are made. The process is interactive with user checkpoints at key decision points.

## Workflow Overview

Execute these steps in order. Each step feeds into the next:

1. **Tech Stack Selection** — determine stack-specific analysis patterns and tooling.
2. **Module Seed Collection (Optional)** — let the user pre-define module boundaries before analysis.
3. **Analysis Pipeline** — four phases: domain analysis, data ownership, dependency graph, synthesis.
4. **Output Artifacts** — generate strategy documents to `docs/monorepo-strategy/`.

Reference files used throughout (do not inline their content — read them at the indicated step):

- `references/tech-stacks.md` — stack-specific tooling, detection heuristics, monorepo conventions
- `references/analysis-framework.md` — per-stack analysis approach and coupling score formula
- `references/module-spec-template.md` — per-module specification template
- `references/migration-patterns.md` — conflict resolution and extraction patterns

---

## Step 1: Tech Stack Selection

Present these 6 options:

1. Node.js + React
2. Node.js + Vue
3. .NET + React
4. .NET + Vue
5. Python + React
6. Other

**Validation:** After selection (options 1-5), scan the project root for the stack's validation file as defined in `references/tech-stacks.md`. Each stack section lists a **Validation file** entry. If the expected file is missing, warn: "Expected {file} for {stack} but did not find it. Continue anyway?"

**If "Other" is selected,** ask these 5 follow-up questions:

1. What is your backend language and framework?
2. What is your frontend framework (if any)?
3. What build system do you use?
4. What dependency/package manager do you use?
5. Do you have any existing workspace or multi-project structure?

> Note: 5 questions (vs 3 for document-for-ai) because monorepo analysis requires build tooling and workspace structure information in addition to language/framework details.

**Progressive disclosure:** After tech stack selection, read `references/tech-stacks.md`. Extract ONLY the section matching the selected stack (from its `##` heading through the next `##` heading or end of file). Discard all other stack sections from context. Do not retain unrelated stack information. Use the extracted section's entry points, import patterns, and tooling recommendations to guide all subsequent analysis. If "Other" was selected, skip loading tech-stacks.md and rely on the user's answers instead.

---

## Step 2: Module Seed Collection (Optional)

> Note: This step operates identically regardless of the tech stack selected in Step 1, including the "Other" path.

Present the following prompt:

```
Before I analyze the codebase, do you already have opinions about
which components should become separate modules?

  > Yes, I have specific modules in mind
  > No, discover everything automatically
```

**If yes**, collect seeds one at a time:

```
Module seed 1:
  Name: auth
  Key files/directories: src/auth/, src/middleware/auth.ts

Add another module seed? (yes/no)
```

Each seed is a `{ name: string, paths: string[] }` pair. Repeat until the user stops.

**Path input contract:** Paths must be repo-relative (e.g., `src/auth/`, not `/home/user/project/src/auth/`). Comma-separated list parsed into discrete entries. No glob patterns. Trailing slashes normalized (removed). Duplicate entries within a seed are deduplicated. Directories are expanded recursively — all source files under the directory at any depth are assigned to the seed's module (using stack-specific source-file extensions from `references/tech-stacks.md`).

**Validation:**

- **Zero seeds after opt-in:** If the user opts in but adds zero seeds, confirm: "No seeds provided. Continue with automatic discovery?" Treat as equivalent to selecting "No."
- **Path not found:** If a seeded path does not exist, warn: "Path `{path}` not found. Remove from seed or continue anyway?" If "continue," drop the path from the seed but keep the seed module. If all paths in a seed are invalid, drop the seed entirely with a warning.
- **Overlap:** If the same file appears in two seeds, warn: "File `{path}` is in both `{seed_a}` and `{seed_b}`. Which module should own it?" Resolve all overlaps before proceeding.

**If no**, proceed to Step 3 (Analysis Pipeline) with an empty seed list. Analysis runs identically to pre-enhancement behavior.

---

## Step 3: Analysis Pipeline

Four phases, each building on the previous. Present findings at each user checkpoint before proceeding to the next phase.

### Phase 1: Domain Analysis

Goal: identify the logical business domains within the monolith.

If seeds were provided in Step 2: Pre-populate the file-to-domain mapping with seeded paths. Each seeded file gets `Confidence: user-specified` (highest tier, above automated `high`/`medium`/`low`). During automated domain assignment (sub-steps 1-4), skip files already assigned via seeds. If seeds cover all source files, report no additional domains discovered. If a seed name collides with an auto-discovered domain, auto-merge into the seeded module.

1. Scan routes, pages, and feature directories for user-facing domains.
   - Look for route definitions, page components, controller groupings.
   - Each distinct route prefix or feature folder is a domain candidate.
2. Analyze the folder structure for logical groupings.
   - Feature-based: `src/auth/`, `src/billing/`, `src/dashboard/`.
   - Layer-based: `src/controllers/`, `src/services/`, `src/models/`.
   - Hybrid: feature folders with internal layer subfolders.
3. Examine naming patterns for implicit boundaries.
   - File prefixes: `auth-controller.ts`, `auth-service.ts`.
   - Namespace prefixes: `Auth.Controllers`, `Billing.Models`.
   - Directory conventions: `__tests__/auth/`, `tests/billing/`.
4. Produce a draft file-to-domain mapping.
   - Every source file assigned to exactly one domain, `shared/`, or `unassigned`.
   - Format: table with columns `File Path`, `Assigned Domain`, `Confidence`.
   - Target: zero `unassigned` files. If any remain, flag for user input.
5. **User checkpoint:** When seeds are present, use this format:

   ```
   Domain boundaries found:

   [seeded] auth (23 files) — src/auth/, src/middleware/auth.ts + 18 auto-assigned
   [seeded] billing (15 files) — src/billing/ + 3 auto-assigned
   dashboard (31 files) — discovered via route analysis
   notifications (8 files) — discovered via directory analysis
   shared (12 files) — used by 3+ domains

   Does this match your mental model? Merge, split, rename, or adjust?
   ```

   The user can adjust any domain at this checkpoint, including seeded ones. When no seeds are present, use the original prompt: "I found these domain boundaries: [list with file counts per domain]. Does this match your mental model? Should I merge, split, or rename any domains?"

Wait for user confirmation before proceeding.

### Phase 2: Data Ownership Analysis

Goal: determine which domain owns each database table.

1. Identify database schema sources.
   - Scan for migrations, ORM model definitions, SQL schema files, Prisma/Drizzle schemas.
   - Use stack-specific patterns from `references/tech-stacks.md` if available.
2. Trace database tables to the domains that read from or write to them.
   - Follow ORM model imports and query references.
   - Track raw SQL queries referencing table names.
3. Build a table ownership matrix.
   - Columns: `Table Name`, `Primary Owner`, `Secondary Consumers`, `Access Type (R/W/RW)`.
   - Primary owner: the domain with the most write operations to the table.
4. Flag contested tables and orphaned tables.
   - **Contested:** 2+ domains have roughly equal write access. These need conflict resolution in Phase 4.
   - **Orphaned:** tables with no clear domain owner (e.g., legacy tables, logging tables).
5. Present findings to the user as the ownership matrix with flagged items highlighted.
   - Contested tables highlighted with the competing domains listed.
   - Orphaned tables listed separately with suggested owner (if determinable) or marked for user decision.

### Phase 3: Dependency Graph Analysis

Goal: quantify coupling between domains and identify extraction blockers.

1. Read `references/analysis-framework.md` for the per-stack analysis approach and coupling score formula.
2. For each source file, count imports.
   - **Internal imports:** imports from files in the same domain.
   - **Cross-module imports:** imports from files in a different domain.
   - **External imports:** third-party packages (exclude from coupling calculation).
3. Calculate coupling scores per domain pair.
   - Use the formula from `references/analysis-framework.md`.
   - Higher score = more tightly coupled = harder to extract independently.
4. Identify circular dependencies between domains.
   - A depends on B, B depends on A (direct circular).
   - A depends on B, B depends on C, C depends on A (transitive circular).
   - List each cycle with the specific files involved.
5. Identify `shared/` candidates.
   - Any code imported by 3 or more domains is a shared library candidate.
   - List each candidate with its current location and importing domains.
6. Present findings to the user:
   - Coupling score matrix (module-by-module).
   - Circular dependency list with cycle paths.
   - Shared library candidates with importer counts.
   - Overall coupling health summary: percentage of low/medium/high coupling pairs.

### Phase 4: Synthesis & Conflict Resolution

Goal: reconcile all three analysis views and produce final module boundaries.

1. Overlay the three views: domain boundaries (Phase 1), data ownership (Phase 2), dependency graph (Phase 3).
2. For each proposed module boundary, check agreement across views.
   - **All agree** = high confidence boundary. Mark green.
   - **Two agree, one disagrees** = medium confidence. Mark yellow. Note the disagreement.
   - **Views disagree** = conflict requiring resolution. Mark red.
3. Read `references/migration-patterns.md` for conflict resolution patterns.
4. Apply the appropriate resolution pattern to each flagged conflict.
   - Document the conflict: which views disagree and what each view suggests.
   - Document the chosen resolution and the rationale.
   - Common resolutions: merge two domains, split a domain, create a shared service, introduce an API boundary, designate a primary owner with read-only access for consumers.
   - Seed-wins rule: When a conflict involves a user-seeded module, preserve the seed boundary by default. Document the conflict and the automated alternative (with coupling score as percentage, e.g. 78%). The user can override at the Phase 4 checkpoint.
5. Produce the final module list with boundaries, confidence levels, and resolved conflicts.
6. **User checkpoint:** "Here is the full analysis with proposed module boundaries and conflict resolutions. Please review before I generate the output artifacts."

Wait for user approval before generating artifacts.

---

## Step 4: Output Artifacts

Save all artifacts to `docs/monorepo-strategy/`. Create the directory if it does not exist.

### 1. `strategy.md` — Executive Strategy

The primary decision document. Sections:

- **Executive Summary** — one-paragraph overview of the recommendation and expected outcome.
- **Current State Assessment** — monolith size (files, LOC), domain count, overall coupling score, database table count.
- **Proposed Module Map** — summary table of all proposed modules with confidence ratings.
- **Shared Library Strategy** — what goes in `shared/`, ownership rules, versioning approach, consumption patterns.
- **Conflict Resolutions** — each conflict with the chosen resolution pattern and rationale.
- **Migration Order** — modules ordered by lowest coupling first (easiest to extract first), with estimated effort per phase.
- **Risk Assessment** — technical risks, data integrity risks, team coordination risks, rollback strategy.

### 2. `module-map.md` — Visual Module Map

- Mermaid diagram showing all modules and their dependency relationships.
  - Nodes: module names with file counts.
  - Edges: labeled with coupling score and import count.
  - Direction: arrows point from importer to importee.
- Per-module summary tables with: file count, line count, coupling score, primary responsibility.
- Color-coded by coupling percentage:
  - **Green:** 0-20% cross-module imports (extraction-ready).
  - **Yellow:** 21-50% cross-module imports (needs preparation).
  - **Red:** 51%+ cross-module imports (significant refactoring required before extraction).

### 3. `dependency-matrix.md` — Dependency Analysis

- Full import graph between all proposed modules (matrix format: rows import from columns).
- Coupling scores per module pair.
- Circular dependency listing with:
  - The specific files forming the cycle.
  - Suggested break points (which import to remove or redirect through shared).
  - Estimated effort to break the cycle.
- `shared/` candidates: each candidate listed with current file path, importing modules, and recommended shared library placement.

### 4. `modules/<name>.md` — Per-Module Specifications

Use the template from `references/module-spec-template.md`. Generate one file per proposed module.

Each spec covers: purpose, file inventory, public API surface, dependencies, data ownership, and extraction prerequisites.

### 5. `monorepo-tooling.md` — Tooling Recommendation

Stack-specific tooling recommendation sourced from the matching section in `references/tech-stacks.md`. Covers:

- **Workspace manager** — npm/yarn/pnpm workspaces, NX, Turborepo, .NET solution structure, Python namespace packages, etc.
- **Build orchestration** — task runner configuration, build order, caching strategy.
- **Dependency management** — inter-module dependency declarations, version pinning, hoisting rules.
- **CI/CD considerations** — affected-module detection, selective test runs, deployment pipeline changes.

### 6. `migration-plan.md` — Phased Migration Plan

Structure:

- **Phase 0: Preparation** — must complete before any module extraction begins.
  - Initialize workspace/monorepo configuration using the tool recommended in monorepo-tooling.md.
  - Set up CI for multi-module builds (build affected modules, run affected tests).
  - Extract shared library from identified `shared/` candidates into its own module.
  - Update all import paths referencing extracted shared code.
  - Verify: all tests pass, build succeeds, no behavior changes.

- **Phases 1-N: Module Extraction** — one phase per module, ordered by lowest coupling score first.
  - Each phase includes:
    1. Files to move (full path listing).
    2. Imports to update (cross-module references that change paths).
    3. Configuration changes (build config, test config, package manifest).
    4. Tests to verify (unit, integration, E2E).
    5. **"App keeps working" checkpoint:** build passes, all tests pass, no runtime errors.
  - Do not proceed to Phase N+1 until Phase N's checkpoint passes.

> Note: This plan describes what to do. Actual code changes are a separate effort and not executed by this skill.

---

## Progressive Disclosure Schedule

Load reference files only when needed to minimize context window usage:

| When | Read | Purpose |
|------|------|---------|
| After tech stack selection | `references/tech-stacks.md` | Extract ONLY the matching stack section. Discard other stacks. |
| Phase 1 start | `references/analysis-framework.md` | Domain analysis heuristics |
| Phase 3 start | `references/analysis-framework.md` | Coupling score formula, import analysis approach |
| Phase 4 conflict resolution | `references/migration-patterns.md` | Conflict resolution decision tree |
| Artifact generation: module specs | `references/module-spec-template.md` | Per-module document template |
| Artifact generation: migration plan | `references/migration-patterns.md` | Extraction ordering and phasing patterns |
| Artifact generation: tooling | `references/tech-stacks.md` | Extract ONLY the matching stack's monorepo tooling section |

**Exception:** If "Other" was selected for tech stack, skip `references/tech-stacks.md` entirely. Derive patterns from the user's follow-up answers.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Dynamic imports / dependency injection | Flag as "not statically analyzable." Mark affected coupling scores as "lower bound estimate." Include a note in dependency-matrix.md listing which imports could not be traced. |
| ORM dynamic queries | Ask the user for manual table ownership identification for affected tables. Document which tables required manual input in the data ownership matrix. |
| No clear domain boundaries (<2 domains found) | Suggest the codebase may not be ready for monorepo extraction. Offer a file-clustering fallback: group files by import proximity and present clusters as candidate modules. |
| Very large codebase (>100K LOC) | Process the dependency graph in chunks by top-level directory. Report progress after each chunk. Combine results in the final synthesis. |
| No database / no tables found | Skip Phase 2 entirely. Proceed with domain analysis (Phase 1) and dependency graph (Phase 3) only. Note the Phase 2 skip in strategy.md under Current State Assessment. |
| Partial failure in any phase | Proceed with completed phases. Include a "Limitations" section in strategy.md listing what could not be analyzed, which phase failed, and why. Affected artifacts note their limitations in a header warning. |
| User seeds overlap (same file in two seeds) | Warn: "File `{path}` is in both `{seed_a}` and `{seed_b}`. Which module should own it?" Resolve before Phase 1. |
| Seeded path does not exist | Warn: "Path `{path}` not found. Remove from seed or continue anyway?" If "continue," drop the path but keep the seed module. If all paths in a seed are invalid, drop the seed entirely with a warning. |
| Seed name collides with auto-discovered domain | Auto-merge into the seeded module at Phase 1. Present in checkpoint: "[seeded] {name} (N files, including M auto-merged from discovered '{name}' domain)." |
