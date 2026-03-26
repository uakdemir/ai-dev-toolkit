# Tech Stacks Reference

Extracted from spec Sections 4.3 (tooling table), 4.5 (detection heuristics), 6.1 (refactor-to-monorepo schema).
Load only the relevant stack section after the user confirms their tech stack.

---

## Stack: Node.js + React/Vue

Applies to presets: Node.js + React, Node.js + Vue (same backend; frontend framework is docs-only difference).

**Import analysis:**
- Scan `import` and `require()` in `.ts`, `.tsx`, `.js`, `.jsx`, `.vue` files.
- Resolve paths via `tsconfig.json` path aliases and `package.json` `exports`.
- Barrel file (`index.ts`) re-exports count as a single import at the barrel boundary.

**Monorepo tool:** pnpm workspaces + turborepo — fast, native, good DX.

**Config scaffolding:**
- `pnpm-workspace.yaml` — lists workspace packages
- `turbo.json` — pipeline definitions (build, test, lint)
- `tsconfig.base.json` (shared) — base compiler options extended by each package
- Per-package `package.json` with `"name"` and `"exports"` fields

**Workspace detection:** existing monorepo if any of:
- `pnpm-workspace.yaml` at root
- `turbo.json` at root
- `nx.json` at root
- `lerna.json` at root
- `package.json` with `"workspaces"` field

**Migration notes:**
- Update `tsconfig.json` `paths` in each package to resolve workspace packages by name.
- Configure `exports` in each package's `package.json` for clean module boundaries.
- Move shared utilities imported by 3+ packages into a dedicated `packages/shared/` package.

---

## Stack: .NET + React/Vue

Applies to presets: .NET + React, .NET + Vue (same backend; frontend handled via static assets or separate project).

**Import analysis:**
- Primary signal: `<ProjectReference>` in `.csproj` files — authoritative project-to-project mapping.
- Secondary signal: `using` directives matched to other projects by namespace convention
  (e.g., `using MyApp.Auth` → Auth project). Use only when `.csproj` references are absent.
- Ignore `System.*`, `Microsoft.*`, and NuGet package namespaces.

**Monorepo tool:** .NET solution + project references — native multi-project support built into the SDK.

**Config scaffolding:**
- `.sln` file — solution listing all projects
- `Directory.Build.props` (root) — shared MSBuild properties applied to every project
- `Directory.Packages.props` (root) — centralized NuGet package versions

**Workspace detection:** existing monorepo if any of:
- `.sln` file with multiple `.csproj` references
- `Directory.Build.props` at root

**Migration notes:**
- Update `<ProjectReference>` paths when projects are moved to new folder structure.
- Adjust namespace organization to match new project boundaries (e.g., `MyApp.Auth` → `Auth`).
- Use `Directory.Build.props` to consolidate shared build properties and avoid duplication.

---

## Stack: Python + React

**Import analysis:**
- Scan `import` and `from...import` in `.py` files.
- Resolve against project package structure (directory with `__init__.py`).
- Exclude virtual environment packages (`.venv/`, `venv/`, `site-packages/`).

**Monorepo tool:** uv workspaces (primary) or hatch workspace environments.

**Config scaffolding:**
- Root `pyproject.toml` with `[tool.uv.workspace]` and `members` list
- Per-package `pyproject.toml` with its own `[project]` metadata
- Shared dependency declarations in root `pyproject.toml`

**Workspace detection:** existing monorepo if any of:
- `pyproject.toml` with `[tool.uv.workspace]` section
- `uv.toml` with `[workspace]` section

**Migration notes:**
- Configure `members` in root `pyproject.toml` to include each extracted package path.
- Set up shared dependencies at the workspace root to avoid version conflicts.
- Ensure each package has its own `pyproject.toml` before moving it to a subdirectory.

---

## General Monorepo Detection

Used by both skills to determine whether a project is already structured as a monorepo.
Walk from CWD toward the filesystem root; stop at the first matching signal.

| Stack   | Detection Files |
|---------|-----------------|
| Node.js | `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, or `package.json` with `"workspaces"` field |
| .NET    | `.sln` with multiple `.csproj` references, or `Directory.Build.props` |
| Python  | `pyproject.toml` with `[tool.uv.workspace]` or workspace members, `uv.toml` with `[workspace]` section |
| Go      | `go.work` file |
| Rust    | `Cargo.toml` with `[workspace]` section |
| General | `rush.json`, `.moon/workspace.yml`, `pants.toml` |

If a workspace config is found at a parent directory, CWD is inside a monorepo package — scope all
operations to that package rather than the entire repo.

---

## "Other" Stack Handling

When the user selects "Other (specify)," ask these 5 follow-up questions before proceeding.
The answers determine: which dependency analysis approach to use, which monorepo tooling to
recommend, and what workspace configuration to suggest.

1. **Backend language/framework?** (e.g., Go, Rust, Java/Spring, Elixir/Phoenix)
2. **Frontend framework?** (e.g., Angular, Svelte, none)
3. **Build system?** (e.g., Bazel, Make, Gradle, Cargo)
4. **How are dependencies managed?** (e.g., go.mod, Cargo.toml, build.gradle)
5. **Existing multi-project or workspace structure?** (e.g., Go workspaces, Cargo workspaces)

Do not load this file's preset stack sections after "Other" is selected — use the answers directly.
