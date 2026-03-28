# Execution Patterns

Each step in the strategy spec maps to one of four action types executed in order: create folders, move files, rewrite imports, extract interfaces. This reference defines how each action is executed, with Serena-aware and regex-fallback paths.

---

## Action: create-folder

- Command: `mkdir -p <target-path>`
- Dependency ordering: create parent folders before child folders.
- Idempotent — skip if the directory already exists.

---

## Action: move-file

### Serena Mode

1. Call `find_referencing_symbols` on the source file to capture all symbols and their reference locations.
2. Store the reference graph for use in the Phase 2 `rewrite-import` steps.
3. Execute `git mv <source> <target>`.

### Fallback Mode

1. Execute `git mv <source> <target>`.
2. No reference graph is captured — import rewrites rely on regex in Phase 2.

### Dependency Ordering

- If file B imports file A and both are being moved, move A before B.
- Build ordering from the `affected_imports` field in each step.
- Cycles within `move-file` steps: batch them together — moves do not break imports by themselves.

---

## Action: rewrite-import

### Serena Mode

1. Use the reference graph captured during `move-file` (via `find_referencing_symbols`) to locate all files referencing the moved file's symbols.
2. For each referencing file, use `replace_content` (or targeted file edits) to update the import path from the old location to the new location. Symbol names remain unchanged — only the module path is rewritten.
3. Note: `rename_symbol` is for renaming symbols, NOT for updating import paths — do not use it here. The correct approach is `find_referencing_symbols` to identify references + targeted content replacement to update paths.

### Fallback Mode

Update imports using per-stack regex:

| Stack | Patterns to match |
|---|---|
| Node.js | `import ... from '...'`, `require('...')` |
| .NET | `using` directives, namespace prefix matching, `<ProjectReference>` in `.csproj` |
| Python | `import ...`, `from ... import ...`, resolve barrel exports via `__init__.py` |

- For Node.js: read `tsconfig.json` paths section to resolve path aliases before applying regex.
- Flag any unresolved aliases as: `# regex-based — verify manually`.

### Dependency Ordering

- Process files with the most consumers first. Consumer count = length of `affected_imports` for that step.
- Ties: alphabetical by file path.

---

## Action: extract-interface

### Serena Mode

1. Call `get_symbols_overview` on the source file to read its public API surface.
2. Create the interface file at the path specified in the `target` field.
3. Call `find_referencing_symbols` to identify consumer files.
4. Update consumer imports to point to the new interface file.

### Fallback Mode

1. Read the source file and extract public method signatures:
   - TypeScript: `public` or `export`ed members.
   - C#: `public` access modifier.
   - Python: methods without a `_` prefix.
2. Create the interface file at `target`.
3. Regex-replace imports in consumer files.

### Field Semantics

| Field | Meaning |
|---|---|
| `source` | Concrete class file being extracted from |
| `target` | Path where the interface file will be created |
| `affected_imports` | Consumer files that need to be updated |
| `verify` | Build/type-check command to confirm extraction succeeded |

### Dependency Ordering

- Extract interfaces with fewer consumers first (ascending by `affected_imports` length).

---

## Circular Dependency Classification

Advisory only — these patterns inform the proposed resolution recorded in the execution report. They are NOT auto-executed.

| Pattern | Description | Detection Heuristic | Confidence |
|---|---|---|---|
| Callback | B receives A's function as a parameter, or calls a single void method on A | Function param typed as A, or call site has no return assignment | High if single void call; Medium otherwise |
| Shared operation | Both A and B call the same third function | Identify common call targets across both files | High if 2+ shared targets |
| Bidirectional data flow | A reads B's property, B reads A's property | Property access patterns in both directions | Medium |
| Misplaced responsibility | One side has only a single usage of the other | Count distinct usages per direction — flag if one direction has exactly 1 call | High if count = 1 |
| Unclassified | Pattern is ambiguous and does not fit the above | Fails all heuristics | — |

- All classifications include a confidence level (high / medium / low).
- Unclassified cycles get no proposed resolution — user must decide.

---

## [DONE] Marker Format

- When a step completes, prepend `[DONE] ` to the step's action line in the strategy spec.
- Example: `[DONE] action: move-file`
- Resume parsing rule: any line starting with `[DONE] action:` is skipped — do not re-execute it.

---

## Monorepo Migration Action Types

All generated manifests and config files include a header comment:
`{comment_char} Generated by implement-plan. TODO: Review and verify dependencies.`

---

### Action: create-package

Create package directory + manifest with placeholder dependencies.

- Not Serena-dependent (file creation only).
- Idempotent — skip if package directory and manifest already exist.

**Per-stack templates:**

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
`// TODO: Review — add dependencies used by this package's source files. Check root package.json for versions.`

**Python (`pyproject.toml`):**
```toml
[project]
name = "{module-name}"
version = "0.1.0"
# TODO: Review — add dependencies
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

---

### Action: create-workspace-config

Generate workspace config at monorepo root.

- Not Serena-dependent (file creation only).
- Idempotent — skip if config already exists.

**Per-stack config:**

| Stack | Config | Content |
|---|---|---|
| pnpm | `pnpm-workspace.yaml` | `packages: ['packages/*', 'shared/*']` |
| npm / yarn | root `package.json` | add `"workspaces": ["packages/*", "shared/*"]` |
| Python (hatch) | root `pyproject.toml` | add hatch workspace config |
| Python (pants) | `pants.toml` | add source roots for packages |
| Python (namespace packages) | — | skip with note: "No workspace config needed" |
| .NET | existing `.sln` file | add new `.csproj` entries |

---

### Action: rewrite-cross-package-import

Update imports to use workspace package names instead of relative paths. Used for both Phase 0 (shared library) and Phases 1-N (module extraction) — all monorepo import rewrites target workspace package names.

**Serena Mode:**

1. Call `find_referencing_symbols` on moved symbols to find all consumer files.
2. For each consumer, update the import path to use the new workspace package name (e.g., `@myorg/auth`).

**Regex Fallback:**

Scan all source files for import/require/from statements targeting old paths, substitute with new package path. Per-stack patterns:

| Stack | Old pattern | New pattern |
|---|---|---|
| Node.js | `import { X } from '../auth/service'` | `import { X } from '@myorg/auth'` |
| Python | `from auth.service import X` | `from auth import X` (through new `__init__.py`) |
| .NET | relative `using` directives and `<ProjectReference>` paths | updated project references and `using` directives |

- Flag any unresolved rewrites as: `# regex-based — verify manually`.

---

### Action: update-config

AI-judgment action — no deterministic algorithm. The AI interprets the migration plan's free-form "Configuration changes" text using per-stack examples as guidance.

Unlike other action types, there is no source/target pair or pattern template. The AI reads the instruction and applies changes contextually.

**Per-stack examples:**

| Stack | Typical config changes |
|---|---|
| Node.js | add `paths` entries to `tsconfig.json`, update `jest.config.js` module name mapper |
| Python | update `pyproject.toml` dependency paths, add package to workspace |
| .NET | add `<ProjectReference>` entries to consuming `.csproj` files |

- If the config instruction is ambiguous or the target file is not found, present the instruction to the user for manual execution and continue with remaining actions.

---

### `[DONE]` Markers for Monorepo Plans

**Phase-level:** Place the `[DONE]` marker after the `##` heading syntax:

```markdown
## [DONE] Phase 0: Preparation
## [DONE] Phase 1: Extract auth module
## Phase 2: Extract billing module    ← resume from here
```

**Within-phase:** Place the `[DONE]` marker on action group headers:

```markdown
## Phase 2: Extract billing module

[DONE] Files to move:
  - src/billing/service.ts → packages/billing/src/service.ts

Imports to update:                    ← resume from here
  - src/billing/ → @myorg/billing
```

**Resume parsing:**
- Any phase heading starting with `## [DONE]` is skipped.
- Any action group starting with `[DONE]` is skipped.
