# implement-plan: Monorepo Migration Execution — Design Spec

**Date:** 2026-03-28
**Status:** Approved (R2 revisions applied)
**Plugin:** ai-dev-tools
**Skill:** implement-plan (enhancement)
**Type:** Enhancement to existing skill

---

## Problem Statement

The implement-plan skill currently only executes restructuring strategy specs from refactor-to-layers (file moves, import rewrites, provider extraction within a single project). It cannot execute the phased migration plans produced by refactor-to-monorepo. Users who run refactor-to-monorepo get a detailed migration plan (`docs/monorepo-strategy/migration-plan.md`) but must execute every step manually — package creation, file moves, cross-package import rewrites, workspace config, and verification checkpoints.

## Enhancement Summary

Extend implement-plan to auto-detect and execute monorepo migration plans in addition to layer strategy specs. The skill becomes a unified execution engine: "I have a plan, execute it."

**Acceptance criteria:**
- **Layer plans:** identical behavior to today (no regression)
- **Monorepo plans:** executes Phase 0 (preparation) + Phase 1-N (module extraction) from `migration-plan.md`
- **Format detection:** auto-detect layer vs monorepo by content, no user input needed
- **Serena warning:** when Serena is not available for a monorepo plan, warn and require explicit user override before proceeding
- **Automated actions:** file moves, import rewrites, package manifest creation (with placeholder dependencies), workspace config creation
- **Manual actions:** CI setup (output instructions only), dependency resolution in generated manifests
- **Phasing:** respect migration plan's phase order (modules by coupling score), group by action type within each phase

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Input source | `migration-plan.md` only | Already structured as execution steps with file lists and checkpoints |
| Format detection | Content-based (frontmatter vs phase headings/bold markers) | More robust than path conventions; the two formats are structurally distinct |
| Automation scope | File ops + config automated, CI manual | CI is too environment-specific; package manifests and workspace config are template-able |
| Serena handling | Same detection, warn + explicit override for monorepo | Cross-package import rewrites are higher risk; user must acknowledge |
| Phase ordering | Migration plan order, action-type grouping within | Preserves coupling-score ordering; action sequence within phases matters |
| Skill structure | Single skill, two execution paths (fork at Step 7) | Actions overlap (file moves, import rewrites); shared infrastructure |
| Dependency extraction | Placeholder manifests for v1 | Full dependency extraction is non-trivial; user fills in after generation |
| Import rewrite action | All monorepo rewrites use `rewrite-cross-package-import` | Both Phase 0 and Phase 1-N rewrites target workspace package names |

---

## Format Detection (Step 2 — Modified)

**Auto-detect search paths:** Check both `docs/layer-architecture/strategy.md` (existing) and `docs/monorepo-strategy/migration-plan.md` (new). If user provides an explicit path, use that.

**Error message update:** "No plan found. Run `/ai-dev-tools:refactor-to-layers` or `/ai-dev-tools:refactor-to-monorepo` first to generate one."

After locating the plan file, detect format by content:

**Layer strategy spec** — identified by YAML frontmatter containing any of: `tech_stack`, `layers`, `composition_root`, or structured step entries with `action: move-file` / `action: rewrite-import` / `action: extract-interface`.

**Monorepo migration plan** — identified by phase markers: `## Phase 0:` headings OR `**Phase 0: Preparation**` bold markers (match both heading and bold-text formats since refactor-to-monorepo's output format may use either).

**Detection order:** Check for layer spec first (YAML frontmatter is unambiguous). If not a layer spec, check for monorepo plan. If neither → error.

**Neither** — error: "Unrecognized plan format. Expected a refactor-to-layers strategy spec or a refactor-to-monorepo migration plan."

---

## Serena Warning (evaluated after Step 2)

After Serena detection (Step 1) AND format detection (Step 2), evaluate the Serena warning based on plan type. The enhanced monorepo warning runs between Step 2 and Step 3, not during Step 1 — because plan type is only known after format detection.

**Layer plans:** unchanged — existing warning and confirmation prompt when Serena unavailable (current behavior already warns: "Serena is not available. Import rewrites will use regex matching." and asks "Are you sure you want to continue without Serena?").

**Monorepo plans:** if Serena is not available, stronger warning with explicit user choice:

```
⚠ Serena is strongly recommended for monorepo migration.

Cross-package import rewrites are higher risk without semantic tools.
Regex fallback may miss aliased imports, re-exports, and dynamic
imports across package boundaries.

  > Install Serena and continue
  > Proceed without Serena (I accept the risk)
```

The user must explicitly choose before execution begins.

---

## Monorepo Plan Parsing (Step 3 — Extended)

When format detection identifies a monorepo migration plan, Step 3 parses it into a structured internal model.

### Parsing Algorithm

1. **Identify phases** — scan for `## Phase N:` headings, `**Phase N:**` bold markers, or `[DONE] ## Phase N:` / `[DONE] **Phase N:**` (resume markers). The `## Phase N:` heading format is anticipated from AI formatting behavior; the `**Phase N:**` bold-marker format is the contractual format from refactor-to-monorepo. Match both for robustness.
2. **For Phase 0 (Preparation):** extract using keyword matching (case-insensitive, matching in any heading, bold marker, or numbered list item):
   - Workspace config details (keyword: `workspace`, `monorepo configuration`)
   - Shared library file list (keyword: `shared library`, `shared/ candidates`, `files to move`)
   - Import paths to update (keyword: `import paths`, `update all import`)
3. **For Phases 1-N (Module Extraction):** extract per phase using keyword matching:
   - Module name (from the phase text, e.g., "Phase 1: Extract auth module" → "auth")
   - Files to move (keyword: `files to move` — lines matching `- path/to/file` or `  path/to/file` under the matched keyword)
   - Imports to update (keyword: `imports to update`)
   - Config changes (keyword: `configuration changes`)
   - Verification commands (keyword: `tests to verify`, `verify`, `checkpoint`)

**Note:** The upstream refactor-to-monorepo uses numbered list items (`1. Files to move`, `2. Imports to update`) not sub-section headings. The parser matches on content keywords rather than requiring exact heading format.

### Internal Data Model (per phase)

```
{
  phase_number: number,           // 0 for preparation, 1-N for modules
  phase_name: string,             // e.g., "Preparation", "Extract auth module"
  module_name: string | null,     // null for Phase 0, module name for 1-N
  target_package_path: string | null, // extracted from migration plan file-move targets, or derived per-stack: Node.js = packages/{name}, Python = packages/{name}, .NET = {name}/. Phase 0 shared = shared/ or packages/shared.
  files_to_move: [
    { source: string, target: string }  // source in monolith, target in new package
  ],
  imports_to_update: [
    { old_path: string, new_path: string }  // old relative path, new package path
  ],
  config_changes: [string],       // free-form instructions from migration plan
  verification: [string],         // test commands or descriptions
  status: "pending" | "done"      // for resume support
}
```

### Validation

- At least Phase 0 must exist
- Each Phase 1-N must have at least one file to move. Phase 0 is valid with or without files to move (it may consist solely of workspace configuration).
- File paths must be valid relative paths
- Warn on any phase that cannot be parsed: "Phase N could not be fully parsed. Review manually."

---

## Verification Granularity for Monorepo Plans (Step 6)

Map existing Step 6 options to monorepo execution:

| Option | Layer plan meaning | Monorepo plan meaning |
|---|---|---|
| Per-step | After each individual file move/rewrite | After each individual file move within a module extraction |
| Per-phase | After each action-type phase (all moves, all rewrites) | After each monorepo phase (Phase 0, Phase 1, Phase 2...) |
| End-only | After all phases complete | After all monorepo phases complete |

**Default recommendation for monorepo: per-phase** (checkpoint after each module extraction). This is the natural boundary — each phase is a self-contained module extraction with its own verification checkpoint.

---

## Commit Strategy for Monorepo Plans

**Granularity:** One commit per monorepo phase.

**Commit message templates:**

| Phase | Template |
|---|---|
| Phase 0 | `refactor: prepare monorepo workspace — extract shared library (Phase 0)` |
| Phase 1-N | `refactor: extract {module_name} to packages/{module_name} (Phase {N})` |
| Partial (interrupted) | `refactor: extract {module_name} (Phase {N}, partial — {action_type} complete)` |

**Partial commit behavior:** If execution is interrupted mid-phase, commit completed actions within the phase with `(partial)` suffix. Resume reconciles remaining actions.

---

## Resume Strategy for Monorepo Plans

### Phase-Level Resume

Mark completed phases in the migration plan using a `[DONE]` prefix on the phase heading:

```markdown
## [DONE] Phase 0: Preparation
...
## [DONE] Phase 1: Extract auth module
...
## Phase 2: Extract billing module    ← resume from here
...
```

### Within-Phase Resume

If interrupted mid-phase (partial commit), mark completed action groups with inline `[DONE]`:

```markdown
## Phase 2: Extract billing module

[DONE] Files to move:
  - src/billing/service.ts → packages/billing/src/service.ts
  ...

Imports to update:                    ← resume from here
  - src/billing/ → @myorg/billing
  ...
```

### Filesystem Reconciliation

On resume, check actual filesystem state before each action:
- `create-package`: if package directory + manifest already exist, skip
- `move-file`: if source doesn't exist but target does, skip (already moved)
- `rewrite-cross-package-import`: re-scan — some imports may already be rewritten
- `create-workspace-config`: if config exists, skip. If workspace config was intentionally skipped (e.g., Python namespace packages), mark as "not applicable" rather than pending — resume logic treats these differently.

---

## Monorepo Execution Phases (Step 7 — Extended)

For monorepo plans, Step 7 forks into a parallel execution path (not an extension of the layer path — the two share individual action implementations but have different phase orchestration).

### Phase 0: Preparation

Action sequence:
1. **create-workspace-config** — generate workspace config files:
   - Node.js: `pnpm-workspace.yaml` or add `workspaces` to root `package.json`
   - Python: `pyproject.toml` with workspace config (if using hatch/pdm) or `pants.toml` (if using pants). If using plain namespace packages with no workspace tool, skip and note: "No workspace config needed for namespace packages."
   - .NET: `.sln` file updates
   - Use templates from `references/execution-patterns.md`
2. **create-package** — create the shared library package (directory + manifest with placeholder dependencies)
3. **move-files** — move identified shared code to the shared package
4. **rewrite-cross-package-import** — update all import paths referencing moved shared code to use workspace package names (Serena or regex)
5. **verify** — run build + tests, checkpoint: "All tests pass after shared extraction?"

**CI setup:** Output instructions to the user, do not generate CI config files:
```
Manual step: Set up CI for multi-module builds.
  - Build affected modules on PR
  - Run affected tests
  - See docs/monorepo-strategy/monorepo-tooling.md for recommendations.
```

**Commit:** `refactor: prepare monorepo workspace — extract shared library (Phase 0)`

### Phases 1-N: Module Extraction

One phase per module, ordered by lowest coupling score first (as specified in migration-plan.md). Within each phase:

1. **create-package** — create package directory + manifest with placeholder dependencies:
   - Node.js: `packages/{name}/package.json` — includes `name`, `version`, `main` fields. Dependencies section has a comment: `// TODO: Review and verify dependencies extracted from root package.json`
   - Python: `packages/{name}/pyproject.toml` — includes project name, version. Dependencies list has a comment: `# TODO: Review and verify dependencies`
   - .NET: `{name}/{name}.csproj` — includes target framework, project references to shared/other packages
   - Templates in `references/execution-patterns.md`
2. **move-files** — move source files from monolith to new package (paths from migration plan)
3. **rewrite-cross-package-import** — update cross-package import paths:
   - **With Serena:** `find_referencing_symbols` to find all consumers, then update import paths to use the new package name/path
   - **Without Serena:** regex scan for import statements targeting moved files, rewrite to new package path
   - Cross-package imports now use workspace package names (e.g., `@myorg/auth`) instead of relative paths
4. **update-config** — build/test config changes listed in migration plan. Examples per stack:
   - Node.js: add `paths` entries to `tsconfig.json`, update `jest.config.js` module name mapper
   - Python: update `pyproject.toml` dependency paths, add package to workspace config
   - .NET: add `<ProjectReference>` entries to consuming `.csproj` files
5. **verify** — checkpoint per migration plan: "Build passes, all tests pass, no runtime errors?"

**Commit:** `refactor: extract {module_name} to packages/{module_name} (Phase {N})`

Do not proceed to Phase N+1 until Phase N's checkpoint passes.

---

## Pre-Flight Validation for Monorepo Plans (Step 5 — Extended)

In addition to existing source-file existence checks:

- Target package directories should NOT already exist (unless resuming). If they do: "Package `{name}` already exists at `{path}`. This looks like a partial previous run. Resume or abort?"
- Workspace root is writable
- For each phase: all source files listed in "Files to move" exist at their current paths
- No target path collisions across phases (two phases trying to create the same package)

On validation failure: "abort or adjust plan" (matching existing behavior — no "skip" option, since later phases may depend on earlier ones).

---

## New Action Types

The existing implement-plan supports: `move-file`, `rewrite-import`, `extract-interface`, `create-folder`.

Add for monorepo:

| Action | Description | Serena mode | Regex fallback |
|---|---|---|---|
| `create-package` | Create package directory + manifest with placeholder deps | N/A (file creation) | N/A (file creation) |
| `create-workspace-config` | Generate workspace config at monorepo root | N/A (file creation) | N/A (file creation) |
| `rewrite-cross-package-import` | Update imports to use workspace package names instead of relative paths | `find_referencing_symbols` + path rewrite | Regex scan + path substitution |
| `update-config` | Modify build/test config per migration plan instructions | Direct file edit | Direct file edit |

**`update-config` note:** This is an AI-judgment action — no deterministic algorithm. The AI interprets the migration plan's free-form "Configuration changes" text using per-stack examples as guidance. Unlike other action types, there is no source/target pair or pattern template.

The `move-file` action type is reused from the existing layer plan support.

**Note:** All import rewrites in monorepo plans use `rewrite-cross-package-import` (not the existing `rewrite-import`). This applies to both Phase 0 (shared library paths) and Phases 1-N (module paths) — in both cases, the target is a workspace package name.

---

## Package Manifest Templates

Templates per stack for `create-package` action (stored in `references/execution-patterns.md`):

**Node.js (`package.json`):**
```json
{
  "name": "@{scope}/{module-name}",
  "version": "1.0.0",
  "main": "src/index.ts",
  "dependencies": {},
  "devDependencies": {}
}
```
Comment at top of dependencies: `// TODO: Review — add dependencies used by this package's source files. Check root package.json for versions.`

**Python (`pyproject.toml`):**
```toml
[project]
name = "{module-name}"
version = "0.1.0"
# TODO: Review — add dependencies used by this package's source files
dependencies = []
```

**.NET (`.csproj`):**
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>{from root}</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <!-- TODO: Review — add PackageReference entries for NuGet dependencies -->
    {project references to shared/other packages}
  </ItemGroup>
</Project>
```

**v1 approach:** Generate manifests with placeholder dependency sections. The user fills in actual dependencies after generation as a manual step. Full automated dependency extraction (scanning imports, resolving versions from root manifest) is deferred to v2.

---

## Workspace Config Templates

Templates for `create-workspace-config` action (stored in `references/execution-patterns.md`):

**pnpm-workspace.yaml:**
```yaml
packages:
  - 'packages/*'
  - 'shared/*'
```

**npm/yarn workspaces (package.json):**
```json
{ "workspaces": ["packages/*", "shared/*"] }
```

**Python:** Conditional on tooling:
- If using hatch: add `[tool.hatch.envs]` workspace config to root `pyproject.toml`
- If using pants: generate `pants.toml` with source roots
- If using plain namespace packages: skip workspace config, note "No workspace config needed"

**.NET (.sln):** Add new `.csproj` entries to the existing solution file.

---

## Output Artifacts (Extended)

The existing execution report at `tmp/execution-report.md` needs a monorepo-specific variant:

**Phase Summary table for monorepo:**

| Phase | Module | Actions | Status |
|---|---|---|---|
| 0 | (preparation) | workspace config, shared extraction | Done/Failed |
| 1 | auth | create-package, move 15 files, rewrite 8 imports | Done |
| 2 | billing | create-package, move 22 files, rewrite 12 imports | Pending |

**Post-execution next steps for monorepo:**
1. Review and fill in dependency sections in generated package manifests
2. Set up CI for multi-module builds (see monorepo-tooling.md)
3. Run `/ai-dev-tools:api-contract-guard` to enforce module boundaries with barrel files
4. Run `/ai-dev-tools:document-for-ai` to update documentation for new structure

---

## Scope of Changes

**Modified files:**

- `ai-dev-tools/skills/implement-plan/SKILL.md` (~120-150 lines)
  - Frontmatter description: add monorepo migration language
  - Step 1: add stronger Serena warning for monorepo plans
  - Step 2: add auto-detect search path + format detection logic
  - Step 3: add monorepo plan parsing with internal data model
  - Step 5: add monorepo-specific pre-flight checks
  - Step 6: add monorepo verification granularity mapping
  - Step 7: add monorepo execution path (parallel to layer path)
  - Commit strategy section
  - Resume strategy section
  - Error handling: add monorepo-specific rows

- `ai-dev-tools/skills/implement-plan/references/execution-patterns.md` (~80-100 lines)
  - New section: monorepo action types (create-package, create-workspace-config, rewrite-cross-package-import, update-config with per-stack examples)
  - Package manifest templates per stack (with placeholder deps)
  - Workspace config templates per stack (conditional for Python)
  - Cross-package import rewrite patterns (Serena + regex)

- `ai-dev-tools/skills/implement-plan/references/verification-patterns.md` (~20-30 lines)
  - New section: multi-package verification commands per stack
  - Monorepo execution report template (phase summary table) — coexists alongside existing layer report template under separate headings. Template selected based on detected plan type.
  - Post-execution next steps for monorepo

**Total: ~220-280 lines across 3 files**

**Not modified:**
- `ai-dev-tools/skills/refactor-to-monorepo/` — no changes to upstream skill or its output format
- Plugin.json — implement-plan already listed; description update is within SKILL.md frontmatter

**Backward compatible:** Layer strategy specs are detected and executed identically to today. The monorepo path is only triggered by monorepo migration plan content.

---

## Error Handling Addition

Add these rows to the existing error handling table:

| Scenario | Behavior |
|---|---|
| Unrecognized plan format | Error: "Unrecognized plan format. Expected layer strategy spec or monorepo migration plan." |
| Monorepo plan references files that don't exist | Same as existing: pre-flight validation flags missing sources. User can abort or adjust plan. |
| Package directory already exists at target | Warn: "Package `{name}` already exists at `{path}`. Resume previous run or abort?" |
| Workspace config already exists | Warn: "Workspace config `{file}` already exists. Update or skip?" Present diff of proposed changes. |
| Cross-package import rewrite fails (regex ambiguity) | Flag the specific import, show what regex would do, let user confirm or manually fix. |
| Phase N verification fails | Same as existing: stop, report failures, do not proceed to Phase N+1. User can fix and resume. |
| CI setup needed | Output instructions only: "Manual step: Set up CI. See monorepo-tooling.md." |
| Migration plan cannot be parsed | Warn: "Phase N could not be fully parsed." Stop execution at the unparseable phase. User can fix the migration plan and resume. No skip — later phases may depend on earlier ones. |
| Config instruction ambiguous or target file not found | Present the instruction to user for manual execution. Continue with remaining actions in the phase. |

---

## Relationship to Other Skills

### refactor-to-monorepo
- Produces the input (`migration-plan.md`) that this enhancement consumes
- No changes needed to refactor-to-monorepo — its output format is parsed as-is
- implement-plan reads the migration plan using heading/bold-marker detection + bullet-list parsing

### refactor-to-layers
- Existing relationship unchanged — layer strategy specs still supported
- Format detection distinguishes the two automatically (check layer first, then monorepo)

### api-contract-guard
- After monorepo extraction, api-contract-guard can be run on the new monorepo to enforce module boundaries with barrel files
- No direct integration — sequential workflow (extract first, guard after)
