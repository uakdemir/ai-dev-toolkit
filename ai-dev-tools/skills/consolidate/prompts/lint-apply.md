# Phase 4+5+6: Decision, Apply, Summary

## Phase 4: Decision

Per tool, present options using the same batch interaction pattern as consolidate-ai. For >5 decision items, present as a numbered list with majority-wins defaults.

### For Tools with Inheritance (ESLint, TypeScript, Ruff, Roslyn)

```
[consolidate] Decisions for ESLint:

1. Create root config?
   a) Auto-generate from 12 common rules (intersection of 3 projects)
   b) Use project-a's config as base (most complete, 15 rules)
   c) Skip -- don't create root

2. Wire extends in all 3 projects?
   a) Yes -- add extends, remove redundant rules (clean up)
   b) Yes -- add extends, keep all rules (no cleanup)
   c) No

Your choices?
```

Wait for user response. Interpret, confirm understanding. Max **2 retries** if ambiguous, then skip: `[consolidate] Skipping -- could not determine decision.`

### For Prettier (Direct Unification)

```
[consolidate] Prettier -- no native inheritance available.
  Configs differ in: tabWidth (2 vs 4), trailingComma ("all" vs "es5").
  Options:
  a) Unify -- I'll show you the diff and you pick values (writes to JSON/YAML configs only)
  b) Skip -- leave as-is

Your choice?
```

If user chooses (a), show value differences and write chosen values to all same-format JSON/YAML project configs. JS-format Prettier configs (`.prettierrc.js`, `prettier.config.js`) are report-only -- suggest manual edits.

### For MyPy (Report Only)

```
[consolidate] MyPy -- no native inheritance, report only.
  Configs differ in: strict (True vs False), disallow_untyped_defs (True vs missing).
  Please unify manually if desired.
```

No write option offered. MyPy configs contain project-specific paths unsafe for automatic unification.

### For EditorConfig

Only if root `.editorconfig` is missing:
```
[consolidate] EditorConfig -- no root .editorconfig with root=true found.
  Create one from the most common settings? (y/n)
```

### Decision Confirmation

After all decisions, present summary and require `y/n`:
```
[consolidate] Decision summary:
  ESLint: auto-generate root from common rules, wire extends + cleanup
  TypeScript: use project-a as base, wire extends + cleanup
  Prettier: unify tabWidth=2, trailingComma="all" across same-format projects
  EditorConfig: no changes needed

Apply these changes? (y/n)
```

If declined, allow revision by number. Re-confirm after revisions.

---

## Phase 5: Apply

### Pre-Apply Safety

Run `git status` for files about to be modified. If any have uncommitted changes:
```
[consolidate] These files have uncommitted changes:
  packages/api/.eslintrc.json
Applying will overwrite them. Continue? (y/n)
```
User must confirm. If declined, stop without modifying files.

**No commits.** Write files but do NOT commit. User reviews via `git diff`.

### Create / Update Root Config

**Auto-generate (intersection):**
- Create root config with only common rules (present in all projects with same value).
- Use the tool's standard config file format.

**Pick-a-source:**
- Copy the chosen project's config to the root location.
- **Strip path-sensitive fields** from the root config -- these belong in per-project overrides, not a shared base:
  - **TypeScript**: `baseUrl`, `paths`, `outDir`, `rootDir`, `include`, `exclude`, `files`, `references`
  - **ESLint**: `parser`, `parserOptions.project`
  - **Ruff**: `src`
- Note in report: `"Path-sensitive fields removed from root -- keep in per-project overrides."`

### Wire extends

Add the `extends` field to each project's config, pointing to the root via relative path:

| Tool | How extends is added | Notes |
|------|---------------------|-------|
| ESLint (legacy) | If `extends` is a string, convert to array first: `[rootPath, existingString]`. If already an array, prepend: `[rootPath, ...existing]`. | Root goes first so project overrides take precedence |
| ESLint (flat, defineConfig) | Add root to `extends` in `defineConfig()` | Report-only -- suggest manual edit |
| TypeScript | `"extends": "../../tsconfig.base.json"` | If `references` field present, warn: project uses project references -- `extends` is complementary, adding alongside |
| Ruff | `extend = "../../ruff.toml"` | In `ruff.toml` or `[tool.ruff]` in `pyproject.toml` |
| Roslyn (.editorconfig) | Automatic cascade -- no wiring needed | Check root `root = true` exists |
| Roslyn (Directory.Build.props) | Add `<Import>` only when inner file exists and must chain to outer | `<Import Project="$([MSBuild]::GetPathOfFileAbove('Directory.Build.props', '$(MSBuildThisFileDirectory)..'))" />` |

### Existing Extends

If a project config already has an `extends` pointing elsewhere:
- Warn: `"[consolidate] packages/api/.eslintrc.json already extends a different config. Overwrite? (y/n)"`
- For ESLint legacy arrays: prepend root path to the existing array (root first, then existing extends).
- For TypeScript: if `extends` is a string, replace it (after user confirmation). If different root, warn.

### Relative Paths

Compute relative paths from each project's directory to the monorepo root. Resolve symlinks via `realpath` for both project and root directories before computing, since ESLint/TypeScript resolve `extends` relative to the physical file location. Validate the computed path exists before writing.

### Clean Up Redundant Rules

If user chose cleanup: remove rules from project configs that are identical to the root config. **Only rules with the exact same value (deep equality) are removed** -- divergent rules stay as per-project overrides.

### Prettier Direct Unification

If user chose to unify Prettier: directly update values in each project's JSON/YAML config. JS-format Prettier configs are report-only -- suggest manual edits. This is value replacement, not inheritance wiring.

### MyPy -- No Writes

MyPy is report-only. No files are modified.

---

## Phase 6: Summary

```
[consolidate] Applied lint config changes:

  ESLint:
    .eslintrc.json (root)         -- created with 12 common rules
    packages/api/.eslintrc.json   -- skipped (format mismatch)
    packages/web/.eslintrc.json   -- added extends, removed 12 redundant rules
    packages/lib/.eslintrc.json   -- added extends, removed 12 redundant rules

  TypeScript:
    tsconfig.base.json (root)     -- created from packages/api/tsconfig.json
    packages/api/tsconfig.json    -- added extends, removed 8 redundant options
    packages/web/tsconfig.json    -- added extends, removed 6 redundant options (2 divergent kept)

  Prettier:
    root/.prettierrc.json         -- updated tabWidth=2, trailingComma="all"
    packages/web/.prettierrc.json -- updated tabWidth=2, trailingComma="all"
    packages/api/.prettierrc      -- skipped (format mismatch)

  EditorConfig: no changes (already configured correctly)

  Unchanged: N files
  Updated: N files
  Created: N files

Review changes with `git diff` and commit when ready.
Report saved to: ./tmp/consolidate-lint-report.md
```

List every project file per config type with what happened (updated, created, skipped, no changes). Include aggregate counts.

### Edge Cases

- **Identical but no extends**: all configs are identical across projects but not using inheritance. Prompt: `"All configs are identical across projects but not using inheritance. Wire extends to deduplicate? (y/n)"`
- **Identical and already extends root**: `"All lint configs wired with inheritance. Nothing to do."` Skip.
- **Only one project for a tool**: nothing to consolidate, skip that tool.
- **All tools have format mismatches**: report mismatches, no wiring.
- **Root config already exists and is extended**: report as healthy, skip.
