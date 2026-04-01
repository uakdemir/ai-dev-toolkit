# Technology Bucket Detection

Runtime reference for `learn-discover.md`. Contains all rules for detecting technology buckets from root-level config files.

---

## 1. Detection Mapping

| Config file(s) at project root | Technology bucket |
|---|---|
| `.eslintrc.*` / `eslint.config.*` / `.prettierrc.*` + `tsconfig.json` + React indicators (`next.config.*`, `vite.config.*`, `package.json` with `react` in `dependencies` or `devDependencies`) | `react` |
| `.eslintrc.*` / `eslint.config.*` / `.prettierrc.*` + `tsconfig.json` / `tsconfig.base.json` (no React indicators) | `typescript` |
| `tsconfig.json` + Fastify indicators (`package.json` with `fastify` dep) | `nodejs-fastify` |
| `.editorconfig`, `*.sln`, `*.csproj`, `.globalconfig`, `Directory.Build.props` | `dotnet` |
| `ruff.toml` / `pyproject.toml` (with ruff/mypy config), `mypy.ini` | `python` |

The detection mapping table introduces `*.sln`, `*.csproj`, and `.globalconfig` as new detection signals not present in the existing lint consolidation phases. These are used for learn-phase bucket detection only and do not affect existing lint phases 1-4.

---

## 2. Key Rules

- A project can match **multiple buckets** (e.g., React + Fastify monorepo → `react`, `nodejs-fastify`, `common-ai`).
- **`common-ai` is always included** — it is not part of the detection table. Every project gets a `common-ai` comparison for AI config files (`CLAUDE.md`, `.claude/settings.json`, `.codex/config.toml`, `.mcp.json`). AI config files are not used for technology bucket detection — they are always assigned to `common-ai` regardless of content.
- Detection reads **root-level files only** (not subpackages). This runs on post-consolidation root configs.
- This mapping table is the single place to extend when adding new stacks.
- **React detection:** Check root `package.json` for `react` in `dependencies` or `devDependencies`. For Vite, check file existence only (do not parse config contents).

---

## 3. Scope Filtering

The learn phase receives a scope value controlling which config files and buckets it examines:

| Scope | Config files scanned | Eligible buckets |
|---|---|---|
| `ai` | `CLAUDE.md`, `.claude/settings.json`, `.codex/config.toml`, `.mcp.json` | `common-ai` only |
| `lint` | `.eslintrc.*`, `eslint.config.*`, `tsconfig.json`, `tsconfig.base.json`, `.prettierrc.*`, `.editorconfig`, `ruff.toml`, `pyproject.toml`, `mypy.ini`, `.globalconfig`, `Directory.Build.props` (plus `*.sln`, `*.csproj` for dotnet bucket detection only — not compared against learnings) | Tech-specific buckets only (`react`, `typescript`, `nodejs-fastify`, `dotnet`, `python`) |
| `both` | All of the above | All buckets (`common-ai` + tech-specific) |

**Detection indicator files** (`package.json`, `next.config.*`, `vite.config.*`) are always read for bucket detection regardless of scope. The scope table controls which config files are *compared against learnings*, not which files are read for detection.

The "always read for detection" rule applies only to `package.json`, `next.config.*`, and `vite.config.*`. Other files that serve dual purposes (detection + comparison) like `*.sln`, `*.csproj`, and `.globalconfig` are only read when their scope (`lint` or `both`) permits. Mark detection-only files clearly so the agent does not attempt to diff or merge them.

---

## 4. Config-to-Bucket Assignment

Each config file is assigned to **exactly one bucket**:

- **AI config files** (`CLAUDE.md`, `.claude/settings.json`, `.codex/config.toml`, `.mcp.json`) → always `common-ai`.
- **Lint/tool config files** → assigned to their natural bucket. Tool-specific configs always go to their natural bucket regardless of other detected buckets (e.g., `ruff.toml` → `python`, `.editorconfig` → `dotnet`).
- For configs shared across JS/TS stacks (`.eslintrc.*`, `eslint.config.*`, `.prettierrc.*`, `tsconfig.json`), the priority when multiple JS/TS buckets match is: **`react` > `nodejs-fastify` > `typescript`** (most specific wins).
- `.prettierrc.*` follows the same bucket as `.eslintrc.*`. If `.prettierrc.*` exists without any `.eslintrc.*`/`eslint.config.*`, assign it to the highest-priority detected JS/TS bucket, or `common-ai` if no JS/TS bucket is detected.
- `tsconfig.json` and `tsconfig.base.json` follow the same bucket as `.eslintrc.*` (or `nodejs-fastify` if Fastify detected without React).
