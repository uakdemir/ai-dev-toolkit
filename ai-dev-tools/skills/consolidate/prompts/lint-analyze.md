# Phase 2: Analysis -- Lint Config Rule Extraction + Classification

For each tool detected in Phase 1 with same-format configs across projects, extract rules/settings and classify as common, divergent, or unique.

## Rule Extraction Per Tool

### ESLint

Extract the `rules` object from each config (e.g., `{ "no-console": "warn", "semi": "error" }`). Compare rule keys and values across projects.

### TypeScript

Extract the `compilerOptions` object from each `tsconfig.json`. Compare option keys and values across projects.

### Ruff

Extract from **two section levels** independently -- both participate in intersection/divergence analysis:

- **Top-level shared keys** (`[tool.ruff]` in `pyproject.toml` or root of `ruff.toml`):
  - `line-length`, `target-version`, `src`, `extend`
- **Lint-section keys** (`[tool.ruff.lint]` in `pyproject.toml` or `[lint]` in `ruff.toml`):
  - `select`, `ignore`, `per-file-ignores`, plugin-specific subsections

### Roslyn / .NET

Extract `.editorconfig` **diagnostic severity rules only** -- keys matching `dotnet_diagnostic.*`, `dotnet_style_*`, and similar analyzer rules. Do NOT extract general editor settings (indent_size, charset, end_of_line, etc.) -- those belong to the EditorConfig pass.

Extract `Directory.Build.props` analyzer settings separately.

### MyPy

Extract settings from whichever config source is detected (`mypy.ini`, `.mypy.ini`, `[tool.mypy]` in `pyproject.toml`, `setup.cfg` `[mypy]`). Report only -- no writes will be performed.

---

## pyproject.toml Shared-File Handling

Both Ruff and MyPy can live in `pyproject.toml`. When processing:

1. For Ruff: parse BOTH `[tool.ruff]` (top-level shared keys: `line-length`, `target-version`, `src`, `extend`) AND `[tool.ruff.lint]` (lint keys: `select`, `ignore`, `per-file-ignores`). The `extend` key is written to `[tool.ruff]`, but lint-rule extraction must also read `[tool.ruff.lint]`. For MyPy: parse `[tool.mypy]` only.
2. For wiring `extend` in Ruff: add the `extend` key to the existing `[tool.ruff]` section via targeted TOML string insertion. If the section does not exist, create it.
3. If the root also uses `pyproject.toml` for Ruff config: create a standalone `ruff.toml` at root instead (avoids cross-file extends complexity). Note this in the report.
4. When both Ruff and MyPy are in the same `pyproject.toml`, process them sequentially (Ruff first, then MyPy) to avoid write conflicts.

---

## EditorConfig / Roslyn Collision

`.editorconfig` serves dual purposes. The skill separates them:

- **EditorConfig pass**: read-only. Only checks that a root `.editorconfig` exists with `root = true`. Never modifies `.editorconfig` files.
- **Roslyn pass**: may modify diagnostic severity rules (`dotnet_diagnostic.*`, `dotnet_style_*`, etc.) but never touches general editor settings (indent_size, charset, end_of_line, tab_width, insert_final_newline, etc.).

---

## Value Comparison (Deep Equality)

Rule values can be complex. Use structural equality:

- **Scalar values** (strings, numbers, booleans): direct equality.
- **Objects**: JSON-serialize with sorted keys, compare the resulting strings.
- **Arrays where order matters** (ESLint rule tuples like `["error", { "allowTernary": true }]`): compare element-by-element in order.
- **Arrays where order does not matter** (TypeScript `lib`, Ruff `select`/`ignore`): sort elements before comparing.

---

## Common / Divergent / Unique Classification

For each tool, classify every extracted rule or setting:

1. **Common rules (intersection)**: present in ALL projects with the SAME value (per deep equality above). These can be moved to the root config.
2. **Divergent rules**: present in multiple projects with DIFFERENT values. Record which projects use which value.
3. **Unique rules**: present in only one project. These stay as per-project overrides.

---

## Inheritance Status Check

Tool-specific checks (not all tools use `extends`):

- **ESLint, TypeScript, Ruff**: does a root config exist? Do projects have `extends`/`extend` pointing to it? If already wired with no redundant rules, report as `"All N projects extend root"` and skip.
- **Roslyn (.editorconfig)**: check whether a root `.editorconfig` with `root = true` exists in the ancestor path. If yes, cascade is active — report as wired. Do NOT check for an `extends` field (EditorConfig has none).
- **Roslyn (Directory.Build.props)**: only check for explicit `<Import>` chaining when an inner `Directory.Build.props` file exists in a project. If no inner file exists, MSBuild auto-imports the root — already wired.
- **EditorConfig (general)**: check root `.editorconfig` exists with `root = true`. If yes, cascade is active.
- **Prettier, MyPy**: no inheritance mechanism. Skip this check.

---

## After Analysis

Collect all classification results across all tools. Pass to Phase 3 (Report) via `prompts/lint-report.md`.

Exit early if:
- All tools are already wired with inheritance: `[consolidate] All lint configs already wired with inheritance. Nothing to do.` Stop.
