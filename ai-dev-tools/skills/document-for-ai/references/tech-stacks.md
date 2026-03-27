# Tech Stacks Reference

Loaded after tech stack selection. Tells the AI which file patterns to scan during GENERATE mode
and how to detect monorepo structure.

---

## Stack: Node.js + React

- **Entry points:** `src/index.ts`, `src/main.tsx`, `src/app.ts`
- **Route/page patterns:** `src/pages/**`, `src/routes/**`, `*Router.ts`, `*Router.tsx`
- **Data model patterns:** `*.entity.ts`, `*.model.ts`, `prisma/schema.prisma`
- **Config files:** `tsconfig.json`, `package.json`, `.env.example`
- **Dependency manifest:** `package.json`, `pnpm-lock.yaml`, `yarn.lock`
- **Conventions:** React functional components, hooks in `src/hooks/**`, shared types in `src/types/**`, API routes in `src/api/**` or `src/server/**`
- **Validation file:** `package.json`
- **Monorepo detection:** `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, or `package.json` with `"workspaces"` field

---

## Stack: Node.js + Vue

- **Entry points:** `src/index.ts`, `src/main.ts`, `src/app.ts`
- **Route/page patterns:** `src/views/**`, `src/pages/**`, `src/router/**`, `*router.ts`
- **Data model patterns:** `*.entity.ts`, `*.model.ts`, `prisma/schema.prisma`
- **Config files:** `tsconfig.json`, `package.json`, `.env.example`, `vite.config.ts`
- **Dependency manifest:** `package.json`, `pnpm-lock.yaml`, `yarn.lock`
- **Conventions:** Vue single-file components (`*.vue`), composables in `src/composables/**`, Pinia stores in `src/stores/**`, API routes in `src/api/**` or `src/server/**`
- **Validation file:** `package.json`
- **Monorepo detection:** `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, or `package.json` with `"workspaces"` field

---

## Stack: .NET + React

- **Entry points:** `Program.cs`, `Startup.cs`
- **Route/page patterns:** `*Controller.cs`, `*.razor`, `*Controller.cs` matching `[Route]` attributes
- **Data model patterns:** `*.cs` with `[Table]` or `[Entity]` attributes, EF migration files in `Migrations/`
- **Config files:** `*.csproj`, `appsettings.json`, `appsettings.Development.json`
- **Dependency manifest:** `*.csproj`, `packages.lock.json`
- **Conventions:** Controllers in `Controllers/`, services in `Services/`, DTOs in `DTOs/` or `Models/`; React frontend follows React conventions (see Node.js + React)
- **Validation file:** `*.csproj` or `*.sln`
- **Monorepo detection:** `.sln` file with multiple `.csproj` references, or `Directory.Build.props`

---

## Stack: .NET + Vue

- **Entry points:** `Program.cs`, `Startup.cs`
- **Route/page patterns:** `*Controller.cs`, `*.razor`, `*Controller.cs` matching `[Route]` attributes
- **Data model patterns:** `*.cs` with `[Table]` or `[Entity]` attributes, EF migration files in `Migrations/`
- **Config files:** `*.csproj`, `appsettings.json`, `appsettings.Development.json`
- **Dependency manifest:** `*.csproj`, `packages.lock.json`
- **Conventions:** Controllers in `Controllers/`, services in `Services/`, DTOs in `DTOs/` or `Models/`; Vue frontend follows Vue conventions (see Node.js + Vue)
- **Validation file:** `*.csproj` or `*.sln`
- **Monorepo detection:** `.sln` file with multiple `.csproj` references, or `Directory.Build.props`

---

## Stack: Python + React

- **Entry points:** `main.py`, `app.py`, `manage.py`, `wsgi.py`, `asgi.py`
- **Route/page patterns:** `*views.py`, `*routes.py`, `*endpoints.py`, `urls.py`
- **Data model patterns:** `*models.py`, `alembic/`, `migrations/`, `*schemas.py`
- **Config files:** `pyproject.toml`, `requirements.txt`, `settings.py`, `.env.example`
- **Dependency manifest:** `pyproject.toml`, `requirements.txt`, `uv.lock`
- **Conventions:** Django apps in subdirectories with `models.py`/`views.py`; FastAPI routers in `routers/`; React frontend follows React conventions (see Node.js + React)
- **Validation file:** `pyproject.toml` or `requirements.txt`
- **Monorepo detection:** `pyproject.toml` with `[tool.uv.workspace]`, `uv.toml` with `[workspace]` section

---

## General Monorepo Detection

Used by both skills to detect whether a project is already a monorepo. Check for these files at the
repository root or in parent directories when operating inside a subdirectory.

| Stack   | Detection Files |
|---------|-----------------|
| Node.js | `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, or `package.json` with `"workspaces"` field |
| .NET    | `.sln` file with multiple `.csproj` references, or `Directory.Build.props` |
| Python  | `pyproject.toml` with `[tool.uv.workspace]` or workspace members, `uv.toml` with `[workspace]` section |
| Go      | `go.work` file |
| Rust    | `Cargo.toml` with `[workspace]` section |
| General | `rush.json`, `.moon/workspace.yml`, `pants.toml` |

**Scope rule:** When a monorepo is detected and the AI is operating inside a package subdirectory,
scope all GENERATE/UPDATE/AUDIT work to that package only. Generate module-level CLAUDE.md rather
than a root-level one.
