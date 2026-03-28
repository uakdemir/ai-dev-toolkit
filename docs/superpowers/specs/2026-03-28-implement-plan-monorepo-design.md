# implement-plan: Monorepo Migration Execution — Design Spec

**Date:** 2026-03-28
**Status:** Approved
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
- **Automated actions:** file moves, import rewrites, package manifest creation, workspace config creation
- **Manual actions:** CI setup (output instructions only)
- **Phasing:** respect migration plan's phase order (modules by coupling score), group by action type within each phase

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Input source | `migration-plan.md` only | Already structured as execution steps with file lists and checkpoints |
| Format detection | Content-based (frontmatter vs phase headings) | More robust than path conventions; the two formats are structurally distinct |
| Automation scope | File ops + config automated, CI manual | CI is too environment-specific; package manifests and workspace config are template-able |
| Serena handling | Same detection, warn + explicit override for monorepo | Cross-package import rewrites are higher risk; user must acknowledge |
| Phase ordering | Migration plan order, action-type grouping within | Preserves coupling-score ordering; action sequence within phases matters |
| Skill structure | Single skill, two execution paths | Actions overlap (file moves, import rewrites); shared infrastructure |

---

## Format Detection (Step 2 — Modified)

After locating the plan file, detect format by content:

**Layer strategy spec** — identified by YAML frontmatter containing any of: `tech_stack`, `layers`, `composition_root`, or structured step entries with `action: move-file` / `action: rewrite-import` / `action: extract-interface`.

**Monorepo migration plan** — identified by `## Phase 0: Preparation` heading or `## Phase N:` headings with module extraction content (files to move, imports to update, configuration changes).

**Neither** — error: "Unrecognized plan format. Expected a refactor-to-layers strategy spec or a refactor-to-monorepo migration plan."

The two formats are naturally distinct — a monorepo root won't have a layer strategy spec, and individual packages won't have a migration plan. Content detection is a safety net for manual path overrides.

---

## Serena Warning (Step 1 — Modified)

After Serena detection, behavior depends on plan type:

**Layer plans:** unchanged — silent fallback to regex if Serena unavailable (existing behavior).

**Monorepo plans:** if Serena is not available, warn and wait for explicit user choice:

```
⚠ Serena is recommended for monorepo migration.

Cross-package import rewrites are higher risk without semantic tools.
Regex fallback may miss aliased imports, re-exports, and dynamic
imports across package boundaries.

  > Install Serena and continue
  > Proceed without Serena (I accept the risk)
```

The user must explicitly choose before execution begins. This is a soft gate — not a hard block — but requires acknowledgment.

---

## Monorepo Execution Phases (Step 7 — Extended)

For monorepo plans, execute in migration plan order. Each phase groups actions by type.

### Phase 0: Preparation

Action sequence:
1. **create-workspace-config** — generate workspace config files:
   - Node.js: `pnpm-workspace.yaml` or add `workspaces` to root `package.json`
   - Python: workspace-level `pyproject.toml` or `pants.toml`
   - .NET: `.sln` file updates
   - Use templates from `references/execution-patterns.md`
2. **create-shared-package** — create the shared library package (directory + manifest)
3. **move-files** — move identified shared code to the shared package
4. **rewrite-imports** — update all import paths referencing moved shared code (Serena or regex)
5. **verify** — run build + tests, checkpoint: "All tests pass after shared extraction?"

**CI setup:** Output instructions to the user, do not generate CI config files:
```
Manual step: Set up CI for multi-module builds.
  - Build affected modules on PR
  - Run affected tests
  - See docs/monorepo-strategy/monorepo-tooling.md for recommendations.
```

### Phases 1-N: Module Extraction

One phase per module, ordered by lowest coupling score first (as specified in migration-plan.md). Within each phase:

1. **create-package** — create package directory + manifest:
   - Node.js: `packages/{name}/package.json` with dependencies extracted from root
   - Python: `packages/{name}/pyproject.toml` with dependencies
   - .NET: `{name}/{name}.csproj` with project references
   - Templates in `references/execution-patterns.md`
2. **move-files** — move source files from monolith to new package (paths from migration plan)
3. **rewrite-imports** — update cross-module import paths:
   - **With Serena:** `find_referencing_symbols` to find all consumers, then update import paths to use the new package name/path
   - **Without Serena:** regex scan for import statements targeting moved files, rewrite to new package path
   - Cross-package imports now use workspace package names (e.g., `@myorg/auth`) instead of relative paths
4. **update-config** — build/test config changes listed in migration plan
5. **verify** — checkpoint per migration plan: "Build passes, all tests pass, no runtime errors?"

Do not proceed to Phase N+1 until Phase N's checkpoint passes.

---

## New Action Types

The existing implement-plan supports: `move-file`, `rewrite-import`, `extract-interface`, `create-folder`.

Add for monorepo:

| Action | Description | Serena mode | Regex fallback |
|---|---|---|---|
| `create-package` | Create package directory + manifest file | N/A (file creation) | N/A (file creation) |
| `create-workspace-config` | Generate workspace config at monorepo root | N/A (file creation) | N/A (file creation) |
| `rewrite-cross-package-import` | Update imports to use workspace package names instead of relative paths | `find_referencing_symbols` + path rewrite | Regex scan + path substitution |
| `update-config` | Modify build/test config files per migration plan instructions | Direct file edit | Direct file edit |

The `move-file` action type is reused from the existing layer plan support.

---

## Package Manifest Templates

Templates per stack for `create-package` action (stored in `references/execution-patterns.md`):

**Node.js (`package.json`):**
```json
{
  "name": "@{scope}/{module-name}",
  "version": "1.0.0",
  "main": "src/index.ts",
  "dependencies": {extracted from root based on moved files' imports},
  "devDependencies": {extracted from root}
}
```

**Python (`pyproject.toml`):**
```toml
[project]
name = "{module-name}"
version = "0.1.0"
dependencies = [{extracted from root}]
```

**.NET (`.csproj`):**
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>{from root}</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    {project references to shared/other packages}
  </ItemGroup>
</Project>
```

Dependency extraction: scan moved files' imports, find which third-party packages they use, include only those in the new manifest.

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

**Python (namespace packages):** No config file — Python namespace packages work by convention.

**.NET (.sln):** Add new `.csproj` entries to the existing solution file.

---

## Scope of Changes

**Modified files:**

- `ai-dev-tools/skills/implement-plan/SKILL.md` (~40-50 lines)
  - Step 1: add Serena warning for monorepo plans
  - Step 2: add format detection logic
  - Step 3: add monorepo plan parsing
  - Step 7: add monorepo phase execution with action types
  - Error handling: add monorepo-specific rows

- `ai-dev-tools/skills/implement-plan/references/execution-patterns.md` (~60-80 lines)
  - New section: monorepo action types (create-package, create-workspace-config, rewrite-cross-package-import, update-config)
  - Package manifest templates per stack
  - Workspace config templates per stack
  - Cross-package import rewrite patterns (Serena + regex)

- `ai-dev-tools/skills/implement-plan/references/verification-patterns.md` (~15-20 lines)
  - New section: multi-package verification commands
  - Per-stack: how to build all packages, run all tests, verify cross-package imports resolve

**Not modified:**
- `ai-dev-tools/skills/refactor-to-monorepo/` — no changes to upstream skill or its output format
- Plugin.json — implement-plan already listed, description already covers "plan execution"

**Backward compatible:** Layer strategy specs are detected and executed identically to today. The monorepo path is only triggered by monorepo migration plan content.

---

## Error Handling Addition

Add these rows to the existing error handling table:

| Scenario | Behavior |
|---|---|
| Unrecognized plan format | Error: "Unrecognized plan format. Expected layer strategy spec or monorepo migration plan." |
| Monorepo plan references files that don't exist | Same as existing: pre-flight validation flags missing sources. User can skip or abort. |
| Package directory already exists at target | Warn: "Package `{name}` already exists at `{path}`. Merge into existing or skip?" |
| Workspace config already exists | Warn: "Workspace config `{file}` already exists. Update or skip?" Present diff of proposed changes. |
| Cross-package import rewrite fails (regex ambiguity) | Flag the specific import, show what regex would do, let user confirm or manually fix. |
| Phase N verification fails | Same as existing: stop, report failures, do not proceed to Phase N+1. User can fix and resume. |
| CI setup needed | Output instructions only: "Manual step: Set up CI. See monorepo-tooling.md." |

---

## Relationship to Other Skills

### refactor-to-monorepo
- Produces the input (`migration-plan.md`) that this enhancement consumes
- No changes needed to refactor-to-monorepo — its output format is already structured enough
- implement-plan reads the migration plan as-is

### refactor-to-layers
- Existing relationship unchanged — layer strategy specs still supported
- Format detection distinguishes the two automatically

### api-contract-guard
- After monorepo extraction, api-contract-guard can be run on the new monorepo to enforce module boundaries with barrel files
- No direct integration — sequential workflow (extract first, guard after)
