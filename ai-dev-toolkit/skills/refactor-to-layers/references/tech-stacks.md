# Tech Stacks Reference

Loaded after tech stack confirmation. Unlike other skills in this plugin (which key by frontend
framework, e.g., `## Stack: Node.js + React`), this skill keys by **backend** framework because
layer architecture is a backend concern. Frontend UI is treated as one layer among several.

---

## Stack: Node.js + Fastify

**Layer-to-folder mapping:**

| Layer     | Canonical folder(s)                          |
|-----------|----------------------------------------------|
| Types     | `src/types/`                                 |
| Config    | `src/config/`                                |
| Data      | `src/data/`, `src/repositories/`, `src/db/`  |
| Service   | `src/services/`                              |
| Providers | `src/providers/`, `src/plugins/`             |
| API       | `src/api/`, `src/routes/`, `src/handlers/`   |
| UI        | `src/ui/` or separate package                |

**DI mechanism:** `@fastify/awilix` (preferred) or `fastify.decorate()` for manual wiring.

**File classification heuristics:**
- `*.entity.ts` → Data layer
- `*.service.ts` → Service layer
- `*.route.ts` / `*.routes.ts` → API layer
- Files calling `decorate()` or registering via `fastify-plugin` → Provider candidates

**Validation file:** `package.json`

**Source file extensions:** `.ts`, `.js`, `.tsx`, `.jsx`, `.vue`

**Fastify note:** Route + handler bundling in the same file is a deliberate Fastify trade-off;
flag it but do not force separation unless coupling score exceeds threshold.

**Frontend UI layer:** A separate monorepo package (`packages/web/`) gets its own layer analysis
run independently. Co-located frontend code goes under `src/ui/` and is treated as the UI layer.

---

## Stack: .NET MVC

**Layer-to-folder mapping:**

| Layer     | Canonical project/folder                                |
|-----------|---------------------------------------------------------|
| Types     | `*.Domain` or `*.Contracts` project, `Models/`          |
| Config    | `Configuration/` or within startup                      |
| Data      | `*.Data` / `*.Infrastructure` project                   |
| Service   | `*.Services` project, `Services/`                       |
| Providers | `*.Providers` or `Providers/`, `IServiceCollection` ext |
| API       | `Controllers/`, `Endpoints/`, `*.Api` project           |
| UI        | `Views/`, `Pages/`, or separate Blazor project          |

**DI mechanism:** `IServiceCollection` (built-in `Microsoft.Extensions.DependencyInjection`).

**File classification heuristics:**
- `*Repository.cs` → Data layer
- `*Service.cs` → Service layer
- `*Controller.cs` → API layer
- Classes with `IServiceCollection` extension methods → Provider candidates

**Validation files:** `.csproj`, `.sln`

**Source file extensions:** `.cs`, `.razor`

**Minimal API adaptation:** When `app.MapGet()` / `app.MapPost()` patterns are detected instead of
controllers, treat endpoint files as the API layer and note the absence of `*Controller.cs` in the
audit output.

---

## Stack: Python + FastAPI

**Layer-to-folder mapping:**

| Layer     | Canonical folder(s)                             |
|-----------|-------------------------------------------------|
| Types     | `src/types/`, `app/types/`                      |
| Config    | `src/config/`, `app/config/`                    |
| Data      | `src/data/`, `repositories/`, `db/`, `models/`  |
| Service   | `src/services/`, `services/`                    |
| Providers | `src/providers/`, `dependencies/`, `core/`      |
| API       | `src/api/`, `routers/`, `api/`                  |
| UI        | `static/` or separate package                   |

**DI mechanism:** `Depends()` (FastAPI built-in) or `dependency-injector` container.

**File classification heuristics:**
- `*_model.py` / `models.py` → Data layer
- `*_service.py` → Service layer
- `*_router.py` / `routes.py` → API layer
- Files containing `Depends()` injections → Provider candidates

**Validation file:** `pyproject.toml`

**Source file extensions:** `.py`

**Django/Flask note:** No dedicated preset exists for Django or Flask. Use the generic "Other"
Protocol below and add a TODO comment in the audit output indicating that non-FastAPI Python
frameworks require manual DI mapping.

---

## "Other" Stack Handling

When the user selects "Other (specify)," ask these **5** follow-up questions before proceeding.
Five questions are required here (vs. 3 for `document-for-ai`) because layer enforcement requires
knowledge of the DI mechanism, test runner, and build system — not just the language and framework.

1. **Backend language/framework?** (e.g., Go/Gin, Java/Spring, Elixir/Phoenix, Rust/Axum)
2. **Frontend framework?** (e.g., React, Vue, Angular, HTMX, none)
3. **DI/IoC mechanism?** (e.g., Spring `@Autowired`, Go manual wiring, Elixir supervision trees)
4. **Test runner?** (e.g., Jest, pytest, xUnit, Go `testing`, RSpec)
5. **Build system?** (e.g., Gradle, Make, Bazel, Cargo, mix)

Do not load preset stack sections after "Other" is selected — derive layer mappings from the answers directly.

---

## General Monorepo Detection

Walk from CWD toward the filesystem root; stop at the first matching signal.

| Stack   | Detection Files |
|---------|-----------------|
| Node.js | `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, or `package.json` with `"workspaces"` field |
| .NET    | `.sln` with multiple `.csproj` references, or `Directory.Build.props` |
| Python  | `pyproject.toml` with `[tool.uv.workspace]` section, or `uv.toml` with `[workspace]` section |
| Go      | `go.work` file |
| Rust    | `Cargo.toml` with `[workspace]` section |
| General | `rush.json`, `.moon/workspace.yml`, `pants.toml` |

If a workspace config is found in a parent directory, CWD is inside a monorepo package — scope all
layer analysis to that package rather than the entire repo.

---

## Composition Root Detection

The composition root is where all DI registrations are assembled. Detect it per stack before
running layer analysis, because cross-layer import violations are evaluated relative to this file.

**Node.js (Fastify):**
Scan for files that both import `fastify()` AND call `.listen()` or `.ready()`.
Common locations: `src/app.ts`, `src/server.ts`, `src/index.ts`, `src/main.ts`.
If multiple files match, ask the user to confirm which is the true entry point.

**.NET:**
`Program.cs` (top-level statements, .NET 6+) or `Startup.cs` (pre-.NET 6 `ConfigureServices`).

**Python (FastAPI):**
Scan for files instantiating `FastAPI()`, `Flask(__name__)`, or Django's `wsgi.py` / `asgi.py`.
Common locations: `src/main.py`, `app/main.py`, `main.py`.
If multiple files match, ask the user to confirm the primary application entry point.
