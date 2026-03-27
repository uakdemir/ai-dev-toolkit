# Tech Stacks Reference — convention-enforcer

Loaded after Step 1 (Tech Stack Detection). Contains stack detection heuristics,
sub-framework identification, linter config paths, test runners, DI patterns, and
monorepo workspace config detection.

---

## Auto-Detection Algorithm

### Step 1: Platform Detection

Scan project root for these marker files:

| Marker file | Platform |
|---|---|
| `package.json` | Node.js |
| `pyproject.toml` | Python |
| `.csproj` / `.sln` | .NET |

- **One match** → proceed to sub-framework detection
- **Zero matches** → trigger "Other" stack flow
- **Multiple matches** → trigger mismatch gate

### Step 2: Linter & Test Framework Scan

| Config file pattern | Tool |
|---|---|
| `.eslintrc.*`, `eslint.config.*` | ESLint |
| `ruff.toml`, `pyproject.toml` with `[tool.ruff]` | Ruff |
| `.editorconfig` | Roslyn/.editorconfig |
| `vitest.config.*` | Vitest |
| `jest.config.*` | Jest |
| `pytest.ini`, `pyproject.toml` with `[tool.pytest]` | pytest |
| `xunit.runner.json` | xUnit |

Cross-check against detected platform. Trigger mismatch gate on inconsistencies
(e.g., `ruff.toml` in a Node.js project, both Jest and Vitest installed).

### Step 3: Sub-Framework Detection

After platform detection, identify the specific framework:

**Node.js** — scan `package.json` `dependencies` and `devDependencies` for:
- `fastify` → Node.js + Fastify (supported profile)
- `express` → Node.js + Express (generic profile)
- `@nestjs/core` → Node.js + NestJS (generic profile)
- `@hapi/hapi` → Node.js + Hapi (generic profile)
- `koa` → Node.js + Koa (generic profile)

**Python** — scan `pyproject.toml` `[project.dependencies]` or `requirements.txt` for:
- `fastapi` → Python + FastAPI (supported profile)
- `django` → Python + Django (generic profile)
- `flask` → Python + Flask (generic profile)
- `starlette` → Python + Starlette (generic profile)

**.NET** — scan `.csproj` PackageReferences and entry point patterns:
- `Microsoft.AspNetCore.Mvc` or controller classes → .NET MVC (supported profile)
- `app.MapGet/MapPost` patterns without controllers → .NET Minimal APIs (generic profile)

Confirm with user: "Detected {Platform} + {Framework}. Correct?"

**Generic profile behavior:** Framework-agnostic categories (Naming, Import Ordering,
File Organization, Logging, Error Handling) work normally. DI / Dependency Patterns
and API Response Shapes use generic analysis with user warning:
"DI analysis is generic — no {framework}-specific DI profile available."

---

## Supported Stack Profiles

### Node.js + Fastify

- **Linter:** ESLint
  - Config files: `.eslintrc.*` (legacy) or `eslint.config.*` (flat)
  - Detect format: `eslint.config.js` exists → flat config. `.eslintrc.*` exists → legacy.
- **Structural tests:** Vitest or Jest (check which is installed)
- **DI patterns:** `@fastify/awilix` (preferred), `fastify.decorate()` for manual wiring
- **Source extensions:** `.ts`, `.js`, `.tsx`, `.jsx`
- **Endpoint detection:** Files in `src/routes/`, `src/handlers/`, `src/api/`, or files exporting Fastify route handlers
- **DI detection:** Files importing from `@fastify/awilix`, files calling `fastify.decorate()`, files in `src/plugins/`

### Python + FastAPI

- **Linter:** Ruff
  - Config files: `ruff.toml` or `pyproject.toml` under `[tool.ruff]`
- **Structural tests:** pytest
- **DI patterns:** `Depends()` (FastAPI built-in), `dependency-injector` container
- **Source extensions:** `.py`
- **Endpoint detection:** Files with `@app.get`, `@app.post`, `@router.get`, `@router.post` decorators
- **DI detection:** Files using `Depends()`, files in `providers/` or `dependencies/`

### .NET MVC

- **Linter:** Roslyn analyzers + `.editorconfig`
- **Structural tests:** xUnit or NUnit (check which is referenced in test `.csproj`)
- **DI patterns:** `IServiceCollection` (built-in `Microsoft.Extensions.DependencyInjection`)
- **Source extensions:** `.cs`
- **Endpoint detection:** Classes inheriting `ControllerBase` or `Controller`, files in `Controllers/`
- **DI detection:** `Startup.cs` or `Program.cs` with `builder.Services.Add*` calls

---

## Monorepo Workspace Detection

Scan for these workspace config files (from project root upward):

| Config file | Tool |
|---|---|
| `pnpm-workspace.yaml` | pnpm |
| `lerna.json` | Lerna |
| `turbo.json` | Turborepo |
| `nx.json` | Nx |
| `rush.json` | Rush |
| `package.json` with `"workspaces"` field | npm/yarn workspaces |
| `.moon/workspace.yml` | moon |
| `pants.toml` | Pants |
| `Directory.Build.props` | .NET |

If any found: "Monorepo detected. Scanning from CWD: `{path}`. Convention analysis
scopes to this package only."

---

## Mismatch Gate Triggers

Stop and ask on any of these:
- Multiple platform markers in same root (e.g., `package.json` + `pyproject.toml`)
- Linter config doesn't match detected platform
- Multiple linters for same concern (e.g., ESLint + Biome)
- Multiple test frameworks (e.g., Jest + Vitest both installed)

Message: "Stack mismatch detected: Found {details}. Is this a monorepo/polyglot
project? Which stack should we target for this run?"

---

## "Other" Stack Flow

Prompt:
1. Language/framework?
2. Linter tool and config file path?
3. Test runner?
4. DI/dependency injection pattern used (if any)?

Behavior: structural tests only (language-generic patterns). No linter rule generation.
Explain: "Linter rules are only generated for supported stacks. Add linter rules
manually based on the violations report."
