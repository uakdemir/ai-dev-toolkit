# Phase 3: Report -- Lint Config Diff Report

Present a structured report of analysis findings and save to `./tmp/consolidate-lint-report.md`.

## Format

Begin with:
```
[consolidate] Lint Config Report
════════════════════════════════
```

## Per-Tool Report Sections

Each detected tool gets a `##` header with project count:
```
## ESLint (legacy, N projects)
## TypeScript (N projects)
## Prettier (N same-format projects + M mismatch)
## EditorConfig
## Ruff (N projects)
## Roslyn (N projects)
## MyPy (N projects)
```

### For tools with inheritance (ESLint, TypeScript, Ruff, Roslyn)

Report:
- **Root config status**: EXISTS / MISSING. If exists, whether any project extends it.
- **Common rules**: count of rules present in all projects with the same value.
- **Divergent rules**: count, with per-rule breakdown showing which projects use which value.
- **Unique rules**: count per project.

```
## ESLint (legacy, 3 projects)
  Root config: .eslintrc.json -- EXISTS but not extended by any project
  Common rules: 12 (can be moved to root)
  Divergent rules: 3
    - "no-unused-vars": project-a="error", project-c="warn"
    - "indent": project-a=2, project-b=4
    - "max-len": project-a=120, project-b=100, project-c=120
  Unique rules: project-a has 2, project-c has 1
```

### For Prettier (direct unification)

No inheritance available. Report differing keys and values across same-format configs:
```
## Prettier (2 same-format projects + 1 mismatch)
  No native inheritance. Configs differ in 2 keys (tabWidth, trailingComma).
  packages/api uses different format (.prettierrc vs .prettierrc.json) -- skipped.
  Suggestion: create a shared config or manually unify.
```

### For MyPy (report only)

Report differences but note that no writes will be performed:
```
## MyPy (2 projects)
  Report only (no writes). Configs differ in: strict, disallow_untyped_defs.
  Please unify manually if desired.
```

### For EditorConfig

Check root `.editorconfig` exists with `root = true`. If present, report as healthy:
```
## EditorConfig
  Root .editorconfig: EXISTS with root=true -- no action needed.
```
If missing, note that one should be created.

## Already-Wired Shortcut

If all projects for a tool already extend the root correctly with no redundant rules:
```
## TypeScript (3 projects)
  All 3 projects extend tsconfig.base.json. Nothing to do.
```

## Format Mismatch Warnings

Collect all format mismatches into a dedicated section at the end:
```
## Format Mismatches
  Prettier: packages/api/ uses .prettierrc, others use .prettierrc.json.
    Cannot wire cross-format inheritance. Migrate to same format first.
  ESLint: packages/web/ uses eslint.config.js (flat), others use .eslintrc.json (legacy).
    Cannot wire cross-format inheritance. Migrate to same format first.
```

## Save

Create `./tmp/` if needed. Write report to `./tmp/consolidate-lint-report.md` (overwrite if exists). Confirm: `Report saved to: ./tmp/consolidate-lint-report.md`

## Next

If no actionable items (everything already wired or report-only): `[consolidate] All lint configs are already consolidated or report-only. Nothing to apply.` Stop.

Otherwise proceed to Phase 4 via `prompts/lint-apply.md`.
