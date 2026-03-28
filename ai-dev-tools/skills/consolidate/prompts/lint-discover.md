# Phase 1: Discovery -- Lint Config Files + Tool Detection

Scan the monorepo for projects containing lint and quality tool configuration files.

## Project Detection

Follow shared discovery logic in SKILL.md:
1. **Workspace config (preferred):** read `package.json` workspaces or `pnpm-workspace.yaml` packages. Do NOT use `turbo.json`.
2. **Fallback:** scan root + `*/` + `*/*/` (depth-2). This is the primary method for non-JS monorepos (.NET solutions, Python).
3. **Exclusions:** skip `node_modules/`, `.git/`, `vendor/`, `dist/`, `build/`, `.next/`, `__pycache__/`.

The monorepo root itself is always checked.

## Supported Tools Detection

For each discovered project directory, scan for these config files:

| Tool | Config files | Inheritance | Root convention |
|------|-------------|-------------|-----------------|
| ESLint (legacy, JSON/YAML) | `.eslintrc.json`, `.eslintrc.yml`, `.eslintrc.yaml` | `extends` field | `.eslintrc.json` at root |
| ESLint (legacy, JS) | `.eslintrc.js`, `.eslintrc.cjs` | `extends` field | Regex extraction only |
| ESLint (flat, v9.22+/v10+) | `eslint.config.js`, `eslint.config.mjs`, `eslint.config.cjs` | `extends` via `defineConfig()` | `eslint.config.js` at root |
| Prettier | `.prettierrc`, `.prettierrc.json`, `.prettierrc.js`, `.prettierrc.yml`, `.prettierrc.yaml`, `.prettierrc.toml`, `prettier.config.js`, `prettier.config.cjs`, `prettier.config.mjs` | No native extends | Direct unification |
| TypeScript | `tsconfig.json` | `extends` field | `tsconfig.base.json` at root |
| EditorConfig | `.editorconfig` | Built-in cascading (automatic) | `.editorconfig` with `root = true` |
| Roslyn/.NET | `.editorconfig` (diagnostic rules), `Directory.Build.props` | MSBuild import hierarchy | `Directory.Build.props` at root |
| Ruff | `ruff.toml`, `[tool.ruff]` in `pyproject.toml` | `extend` field | `ruff.toml` at root |
| MyPy | `mypy.ini`, `.mypy.ini`, `[tool.mypy]` in `pyproject.toml`, `setup.cfg` `[mypy]` | No native extends | Report only |

Only detected tools are processed. Tools found in a single project only have nothing to consolidate -- note and skip.

**Additional detection:** also check `package.json` for `eslintConfig` key (inline ESLint config). If found, warn: `"[consolidate] packages/api/package.json contains inline eslintConfig. Extract to a standalone .eslintrc.json for consolidation support."`

## Tool Capability Tiers

Not all tools and formats support the same operations:

| Tier | Tools / formats | What the skill does |
|------|----------------|---------------------|
| **Full write support** | ESLint JSON/YAML, TypeScript (`tsconfig.json`), Ruff (`ruff.toml` / `pyproject.toml`) | Analyze, wire extends, clean up redundant rules |
| **Report-only** (JS configs) | `.eslintrc.js`, `.eslintrc.cjs`, `eslint.config.js/mjs/cjs` | Analyze (regex where possible), suggest manual edits |
| **Direct unification** | Prettier JSON/YAML (`.prettierrc`, `.prettierrc.json`, `.prettierrc.yml`, `.prettierrc.yaml`) | Report diffs, write chosen values (no inheritance) |
| **Report only** (no writes) | MyPy, Prettier JS (`.prettierrc.js`, `prettier.config.js`) | Report diffs, suggest manual unification |

## ESLint Write Support Matrix

| Format | Read/analyze | Write extends | Write cleanup |
|--------|-------------|---------------|---------------|
| `.eslintrc.json` | Full | Full | Full |
| `.eslintrc.yml` / `.yaml` | Full | Full | Full |
| `.eslintrc.js` / `.cjs` | Regex (simple) or skip | Report-only | Report-only |
| `eslint.config.js` (defineConfig) | Detect extends + rules | Report-only | Report-only |
| `eslint.config.js` (raw) | Skip | Skip | Skip |

If ALL ESLint configs in the monorepo are JS format: `"[consolidate] All ESLint configs are JS format. Cannot auto-consolidate. Consider converting to JSON or using defineConfig() with extends."`

## JS Config Parsing

JS-format configs cannot be reliably parsed or written as text. Use a tiered approach:

1. **JSON/YAML configs**: full support -- parse, extract rules.
2. **Simple JS object literal** (`module.exports = { rules: { ... } }`): attempt regex extraction of the `rules` block. Succeeds only if the file contains a simple exported object with no `require()`, function calls, or computed values.
3. **Complex JS configs** (dynamic imports, function calls, `compat.extends()`, spread syntax, conditionals): skip with warning. Do NOT execute JS files or use AST parsers.
4. **ESLint flat config with `defineConfig()`** (v9.22+/v10+): detect the `extends` property and rule objects within the `defineConfig()` call.

**Write limitation:** the skill does NOT write to JS config files. When JS configs need changes, report what should change and suggest manual edits: `"[consolidate] packages/api/.eslintrc.js needs extends added. Suggested edit: add '../../.eslintrc.json' to the extends array. Apply manually."`

Exception: if a `.eslintrc.js` is a trivial wrapper (`module.exports = { extends: [...], rules: {...} }` with no imports or logic), offer to convert it to `.eslintrc.json`. User must confirm.

## Format Mismatch Detection

If projects use different config formats for the same tool (e.g., ESLint legacy `.eslintrc.json` in some projects and flat `eslint.config.js` in others):
- Report the mismatch
- Suggest the user migrate to a single format
- Only wire inheritance for projects already using the same format
- Do NOT auto-migrate between formats

## Output Format

Present using the `[consolidate]` prefix, grouped by tool:
```
[consolidate] Lint config scan:
  Tools detected: ESLint (legacy), TypeScript, Prettier, EditorConfig

  ESLint (legacy):
    root/.eslintrc.json         -- exists (not extended by anyone)
    packages/api/.eslintrc.json -- standalone
    packages/web/.eslintrc.json -- standalone
    packages/lib/.eslintrc.json -- standalone

  TypeScript:
    (no root tsconfig.base.json)
    packages/api/tsconfig.json  -- standalone
    packages/web/tsconfig.json  -- standalone

  Prettier:
    root/.prettierrc.json       -- exists
    packages/api/.prettierrc    -- different format (.prettierrc vs .prettierrc.json)
    packages/web/.prettierrc.json -- exists

  EditorConfig:
    root/.editorconfig          -- exists, root=true

  Format mismatches:
    Prettier: packages/api uses .prettierrc, others use .prettierrc.json
```

## Exit Conditions

- **No lint configs found:** `[consolidate] No lint configs detected across projects.` Stop.
- **Single project per tool for all tools:** nothing to consolidate, report and stop.

## Next

Proceed to Phase 2 (Analysis) by reading `prompts/lint-analyze.md`.
