# Tech Stacks Reference — api-contract-guard

Loaded at Step 2 (Tech Stack Detection). Contains stack detection heuristics,
sub-framework identification, barrel file conventions per stack, import syntax
for barrel vs internal detection, and module detection heuristics.

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

**Generic profile behavior:** Barrel detection, cross-module import analysis, and
structural test generation work normally for all detected platforms. Stack-specific
DI patterns use generic analysis with user warning:
"DI analysis is generic — no {framework}-specific DI profile available."

---

## Supported Stack Profiles

### Node.js + Fastify

- **Source extensions:** `.ts`, `.js`, `.tsx`, `.jsx`
- **Linter:** ESLint
  - Config files: `.eslintrc.*` (legacy) or `eslint.config.*` (flat)
  - Detect format: `eslint.config.js` exists → flat config. `.eslintrc.*` exists → legacy.
- **Structural tests:** Vitest or Jest (check which is installed)
- **DI patterns:** `@fastify/awilix` (preferred), `fastify.decorate()` for manual wiring

**Barrel locations (in priority order):**
1. `index.ts` or `index.js` at package root (primary)
2. `src/index.ts` or `src/index.js` (if source lives under `src/`)
3. `package.json` `exports` field: the `.` entry is the primary barrel; subpath exports
   (e.g., `"./utils"`, `"./types"`) are additional public entry points

**Import detection:**
- Barrel import: `import { AuthService } from '../auth'` or `import { X } from '@myorg/auth'`
- Internal import (violation): `import { AuthService } from '../auth/service'`
- Subpath export import (NOT a violation if listed in `exports`):
  `import { X } from '@myorg/auth/utils'` — check if `"./utils"` exists in `exports` field

**Re-export syntax:**
```ts
export { AuthService } from './service';
export { AuthError } from './errors';
export type { AuthOptions } from './types';
```

**DI detection:** Files importing from `@fastify/awilix`, files calling `fastify.decorate()`,
files in `src/plugins/`

**Endpoint detection:** Files in `src/routes/`, `src/handlers/`, `src/api/`, or files
exporting Fastify route handlers

### Python + FastAPI

- **Source extensions:** `.py`
- **Linter:** Ruff
  - Config files: `ruff.toml` or `pyproject.toml` under `[tool.ruff]`
- **Structural tests:** pytest
- **DI patterns:** `Depends()` (FastAPI built-in), `dependency-injector` container

**Barrel locations:**
- `__init__.py` at the module root directory

**Import detection:**
- Barrel import (OK): `from auth import AuthService` or `from auth import X`
- Internal import (violation): `from auth.service import AuthService`

**Re-export syntax:**
```python
from .service import AuthService
from .errors import AuthError
from .jwt import verifyToken

__all__ = ['AuthService', 'AuthError', 'verifyToken']
```

**Empty `__init__.py` = no barrel.** A file with no content or only comments is treated
as missing. An `__init__.py` with actual import/re-export statements is a barrel.

**DI detection:** Files using `Depends()`, files in `providers/` or `dependencies/`

**Endpoint detection:** Files with `@app.get`, `@app.post`, `@router.get`, `@router.post`
decorators

### .NET MVC

- **Source extensions:** `.cs`
- **Linter:** Roslyn analyzers + `.editorconfig`
- **Structural tests:** xUnit or NUnit (check which is referenced in test `.csproj`)
- **DI patterns:** `IServiceCollection` (built-in `Microsoft.Extensions.DependencyInjection`)

**No barrel files.** .NET uses the `internal` access modifier and namespace visibility
instead of barrel files. This is a fundamentally different mechanism.

**Module definition:** Each `.csproj` listed in the `.sln` file is a module (monorepo),
or each top-level namespace folder under the project root (single-project).

**Cross-module reference detection via `using` statements:**
- Cross-project reference (may be a boundary concern): `using App.Auth.Internal;`
- Public API reference (OK): `using App.Auth;`
- The skill reports which types should be `internal` but does not modify source files (v1)

**Endpoint detection:** Classes inheriting `ControllerBase` or `Controller`, files in
`Controllers/`

**DI detection:** `Startup.cs` or `Program.cs` with `builder.Services.Add*` calls

---

## Module Detection Heuristics

### Monorepo (workspace detected)

Each workspace package is a module. Read workspace config to determine package paths:

**Node.js:**
- Parse `workspaces` array from root `package.json` (npm/yarn glob patterns)
- `pnpm-workspace.yaml`: read `packages:` list
- `turbo.json` / `nx.json` / `lerna.json`: use `packages` or `workspaces` field
- Each resolved package directory = one module

**Python:**
- Each directory under the workspace root that contains `pyproject.toml` or `__init__.py`
  is a module

**.NET:**
- Each `.csproj` file listed in the `.sln` file is a module

### Single-Project (no workspace config found)

Each top-level directory under `src/` is a module:

**Node.js:**
- All top-level directories under `src/` (including `src/types/`, `src/config/`, `src/utils/`)
- Barrel expected at `src/{module-name}/index.ts` or `src/{module-name}/index.js`

**Python:**
- Each directory under `src/` that contains `__init__.py` is a module
- Directories without `__init__.py` are namespace packages — include but note they require
  explicit `__init__.py` creation for barrel support

**.NET:**
- Each top-level namespace/folder under the project root
- Or each project in the solution if multiple `.csproj` files exist

**Edge cases (all stacks):**
- Nested modules (e.g., `src/auth/oauth/` inside `src/auth/`) — treat as sub-module only
  if it has its own barrel file. Otherwise internal to parent.
- Single-file modules — skip, no meaningful boundary to enforce
- Module with only a barrel and no other files — skip, nothing to protect
- Module with no cross-module consumers — report: "No external consumers. Skip?"

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

If any found: "Monorepo detected. Scanning all packages from root: `{path}`."

Unlike convention-enforcer (which scopes to CWD only), api-contract-guard scans the
**entire monorepo** — cross-module import analysis is meaningless without visibility
into all modules.

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

Stack not recognized. Prompt:

1. Language/framework?
2. Barrel file convention — what is the barrel file named and where does it live?
3. Re-export syntax — how does the barrel expose symbols from sub-files?
4. Import syntax — how to distinguish a barrel import from an internal (bypassing) import?

**Behavior:** Structural tests only — generic import path matching against the user-supplied
barrel location. No barrel file generation for "Other" stacks.

Explain: "Barrel file generation is only available for supported stacks (Node.js, Python).
Structural tests will use the convention you described to detect internal bypasses."
