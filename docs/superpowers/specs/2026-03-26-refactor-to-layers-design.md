# Refactor-to-Layers — Design Specification

**Date:** 2026-03-26
**Status:** Draft
**Scope:** A reusable Claude Code skill that enforces architectural layer boundaries within modules/projects, generates structural tests, and scaffolds provider interfaces for dependency injection
**Inspiration:** [OpenAI Harness Engineering](https://openai.com/index/harness-engineering/) — architectural constraints as prerequisites for AI agent efficiency

---

## 1. Overview

The `refactor-to-layers` skill analyzes a codebase (or empty project) and enforces a layered dependency architecture inspired by OpenAI's harness engineering approach. Within each module, code can only depend "forward" through a fixed set of layers. Cross-cutting concerns enter through a single explicit interface: Providers. These rules are enforced mechanically through generated structural tests.

### 1.1 Problem Statement

AI agents waste context and make architectural mistakes when dependency directions are implicit:

- **Unbounded search space:** Without layer boundaries, modifying a data access file requires understanding the entire codebase — the agent doesn't know what's safe to ignore
- **Architectural drift:** AI agents generate working code that violates intended boundaries (e.g., a repository importing from a controller), creating coupling that compounds over time
- **Cross-cutting concern sprawl:** Auth checks, logging, and config access get scattered across every layer, making each file depend on everything
- **No mechanical enforcement:** Conventions documented in READMEs are invisible to AI agents and CI pipelines — violations accumulate silently

### 1.2 Success Criteria

- Discovery phase assigns a layer classification (not "unclassified") to >50% of source files (remaining files flagged for user review)
- Every dependency direction violation is detected and reported with source file, target file, and direction
- Generated import-scanning tests pass on a clean architecture and fail on any backward dependency
- Generated ESLint configs (Node.js), ArchUnitNET tests (.NET), and import-linter contracts (Python) are syntactically valid and structurally correct for their target format
- Provider interface templates are syntactically valid in the target language
- Machine-actionable spec contains enough detail for a future `implement-plan` skill to execute restructuring without re-analysis
- SCAFFOLD mode on an empty project produces a complete folder structure with syntactically valid structural tests

### 1.3 Scope Boundaries

**What this skill DOES:**
- Analyze existing code structure and dependency directions
- Propose a layer architecture with file-to-layer mappings
- Generate structural tests that enforce layer boundaries (import-scanning + framework-specific)
- Generate provider interface templates for cross-cutting concerns
- Produce a machine-actionable restructuring spec
- Scaffold a clean layer structure for empty projects

**What this skill DOES NOT do:**
- Execute file moves, import rewrites, or code restructuring — the output is a spec and scaffolding, not execution
- Modify CI/CD pipelines — it recommends CI integration but doesn't write pipeline configs
- Replace existing architectural test setups — it detects and works alongside them

**Post-skill human steps** (what remains manual after the skill runs):
1. Install required dependencies for structural test enforcement: Node.js — `eslint-plugin-import-x` (Tier 2); .NET — `ArchUnitNET` NuGet package (Tier 2); Python — `import-linter` pip package (Tier 2). Tier 1 import-scanning tests use only the project's existing test runner — no extra dependencies.
2. Write provider implementations behind the generated interface skeletons
3. Update existing code to receive providers via DI instead of direct imports
4. Move files to match the proposed layer folder structure (guided by the restructuring steps in the strategy spec)
5. Wire the composition root to register provider implementations (e.g., `Program.cs`, root Fastify plugin)
6. Run the generated structural tests and fix violations iteratively

The strategy spec's "Structural Test Inventory" section lists exact package names and versions recommended for each tier.

### 1.4 Relationship to Other Skills

Once implemented, the three skills in `ai-dev-toolkit` are independent but complementary. (Note: `plugin.json` description will need updating to reflect the third skill.) Typical workflow:

1. `/refactor-to-monorepo` → define module boundaries, produce migration plan
2. Execute the monorepo migration
3. `/refactor-to-layers` per module → enforce internal layer architecture
4. `/document-for-ai` → generate AI-optimized docs for each module

Any skill can be used standalone. `refactor-to-layers` works on monorepo packages, single repos, or empty projects.

---

## 2. Plugin Structure

```
ai-dev-toolkit/skills/refactor-to-layers/
├── SKILL.md                          # ~250-300 lines: workflow, pipeline
└── references/
    ├── tech-stacks.md                # per-stack: layer mapping, DI patterns, test tooling
    ├── layer-definitions.md          # default layer template, responsibilities, dependency rules
    ├── structural-test-templates.md  # import-scanning tests + ESLint/ArchUnitNET scaffolding
    └── provider-patterns.md          # provider interface templates per stack, injection examples
```

### SKILL.md Frontmatter

```yaml
---
name: refactor-to-layers
description: "Use when the user wants to enforce architectural layers within a module or project, add dependency direction rules, reduce AI agent context through structural boundaries, introduce provider/dependency injection patterns, or generate structural tests that enforce layer compliance — even if they don't use the term 'layers'."
---
```

### File Map

| File | Target Lines | Content |
|---|---|---|
| `SKILL.md` | ~250-300 | Workflow orchestration, pipeline phases, mode detection |
| `references/tech-stacks.md` | ~120-150 | Per-stack layer mappings, DI patterns, file heuristics, monorepo detection |
| `references/layer-definitions.md` | ~60-80 | Expanded layer descriptions, responsibility boundaries, dependency rules, examples |
| `references/structural-test-templates.md` | ~120-150 | Complete test file templates per stack and tier, allowlist format |
| `references/provider-patterns.md` | ~80-100 | Interface + DI registration templates per stack, injection examples |

### Progressive Disclosure

SKILL.md targets ~250-300 lines (guideline, not hard limit). References are loaded on-demand:

- After tech stack selection → read `references/tech-stacks.md` (only the relevant stack section)
- During discovery phase → read `references/layer-definitions.md`
- During scaffolding phase → read `references/structural-test-templates.md` and `references/provider-patterns.md`

The AI never loads all references at once. Reference files use clear `## Stack: Node.js + Fastify`, `## Stack: .NET MVC`, `## Stack: Python + FastAPI` level-2 headers so the AI can locate the relevant section after loading. Note: unlike the other skills whose headers are keyed by frontend framework (e.g., `## Stack: Node.js + React`), this skill's reference headers are keyed by backend framework because layer architecture is a backend concern. If the user selected "Other" tech stack, skip `tech-stacks.md` and use follow-up answers to determine patterns.

---

## 3. Default Layer Architecture

### 3.1 Layer Sequence

```
Types → Config → Data → Service → Providers (lateral) → API → UI
```

Dependencies generally flow left-to-right ("forward"). Each layer's specific allowed dependencies are defined in the table below — the general left-to-right flow is further restricted per layer to enforce cleaner separation (e.g., API goes through Service, not directly to Data).

**Providers** is a lateral injection point — any layer can *receive* a Provider through dependency injection, but no layer directly imports Provider implementations. Layers depend on Provider *interfaces*, which are injected at runtime.

### 3.2 Layer Definitions

| Layer | Responsibility | Contains | Allowed Dependencies |
|---|---|---|---|
| **Types** | Shared type definitions | Interfaces, enums, DTOs, domain models, value objects | None (leaf layer) |
| **Config** | Environment and feature configuration | Env parsing, feature flags, app settings | Types |
| **Data** | Data access and persistence | Repositories, ORM models, database clients, migrations | Types, Config |
| **Service** | Business logic and orchestration | Use cases, domain operations, business rules | Types, Config, Data |
| **Providers** | Cross-cutting concern interfaces | Auth, logging, telemetry, error handling interfaces | Types (interfaces only) |
| **API** | Request handling and routing | Route handlers, controllers, GraphQL resolvers, middleware | Types, Config, Service, Providers (receives Data indirectly through Service) |
| **UI** | Presentation layer | Components, pages, views, client-side logic | Types, Config, API, Providers |

### 3.3 Provider Injection Rules

- Provider *interfaces* live in the Providers layer and depend only on Types
- Provider *implementations* live in the layer that owns the concern (e.g., an auth provider implementation lives in the Service or Data layer where auth logic resides) but are registered at the composition root (e.g., `Program.cs` in .NET, root plugin in Fastify)
- Layers receive providers through constructor injection (or Fastify decoration), never through direct import of the implementation
- This means a Service doesn't know *how* auth works — it receives an `IAuthProvider` and calls methods on it

### 3.4 Tech-Stack Mapping

**Node.js + Fastify:**

| Layer | Fastify Equivalent | Folder Convention |
|---|---|---|
| Types | Shared types, JSON Schema definitions (Fastify uses JSON Schema natively) | `src/types/` |
| Config | `fastify-env` plugin, env parsing | `src/config/` |
| Data | Repositories, Prisma/Drizzle models | `src/data/` |
| Service | Business logic modules | `src/services/` |
| Providers | `fastify.decorate()` / awilix-injected cross-cutting concerns | `src/providers/` |
| API | Route handlers (`fastify.get`, `fastify.post`) | `src/api/` or `src/routes/` |
| UI | N/A for API-only; separate frontend package in monorepo | `src/ui/` or separate package |

**Fastify-specific note:** Fastify idiomatically bundles route definitions and handler logic inside the same plugin file. The layer model recommends separating route registration (API layer) from business logic (Service layer). This is flagged as a deliberate architectural trade-off, not a framework conflict. The skill notes this in its analysis and lets the user decide.

**DI mechanism:** `@fastify/awilix` for full DI container support, or `fastify.decorate()` for simpler projects. The skill detects which is already in use and follows suit.

**Frontend (React/Vue) UI layer:** If the frontend lives in a separate monorepo package (e.g., `packages/web/`), it gets its own independent layer analysis with its own ANALYZE run. If co-located in the same package, frontend components are classified under the UI layer at `src/ui/` or `src/components/`. The UI layer's structural tests enforce that UI files do not import from Data or Service directly — they go through API (for server-rendered apps) or consume API responses via hooks/stores.

**.NET MVC:**

| Layer | .NET Equivalent | Project/Folder Convention |
|---|---|---|
| Types | DTOs, domain models, interfaces | `*.Domain` or `*.Contracts` project, or `Models/` folder |
| Config | `appsettings.json`, `IOptions<T>`, `IConfiguration` | `Configuration/` or within startup |
| Data | Repositories, `DbContext`, Entity Framework entities | `*.Data` or `*.Infrastructure` project |
| Service | Service classes, business logic | `*.Services` or `*.Application` project |
| Providers | `IServiceCollection` DI registration, cross-cutting interfaces | `*.Providers` or `Providers/` folder |
| API | Controllers, minimal API endpoints | `Controllers/` or `Endpoints/` |
| UI | Razor views, Blazor components | `Views/`, `Pages/`, or separate Blazor project |

**.NET-specific note:** .NET's built-in `IServiceCollection` is the native Provider mechanism. The Repository-Service pattern is already standard practice. The skill's structural tests enforce what .NET developers already intend but often let slip (e.g., a Controller directly accessing `DbContext` instead of going through a Service).

**DI mechanism:** Built-in `IServiceCollection` / `IServiceProvider`. The skill generates extension methods for provider registration (e.g., `services.AddAuthProvider()`).

**Python + FastAPI:**

| Layer | Python Equivalent | Folder Convention |
|---|---|---|
| Types | Pydantic models, dataclasses, TypedDict, Protocol classes | `src/types/` or `app/types/` |
| Config | Pydantic `BaseSettings`, env parsing, feature flags | `src/config/` or `app/config/` |
| Data | SQLAlchemy models, repository classes, database sessions | `src/data/` or `app/data/` |
| Service | Business logic modules | `src/services/` or `app/services/` |
| Providers | Protocol/ABC interfaces for cross-cutting concerns | `src/providers/` or `app/providers/` |
| API | FastAPI route handlers, APIRouter definitions | `src/api/` or `app/api/` |
| UI | N/A for API-only; separate frontend package in monorepo | Separate package |

**Python-specific note:** Python uses `import`/`from...import` statements. Discovery heuristics: `*_model.py` or `models.py` → Data, `*_service.py` → Service, `*_router.py` or `routes.py` → API, `Depends()` usage → Provider candidates. `__init__.py` files serve as barrel files.

**DI mechanism:** FastAPI's `Depends()` for web projects. For non-FastAPI Python projects, `dependency-injector` library or manual constructor injection. The skill detects FastAPI by checking for `fastapi` in `pyproject.toml` dependencies.

**Structural test tooling:** Tier 1 import-scanning tests use pytest. Tier 2 enforcement uses `import-linter` (the Python equivalent of ESLint import restrictions) with contracts defined in `pyproject.toml` or `.importlinter` config.

---

## 4. Invocation Flow

### 4.1 Step 1 — Tech Stack Selection

Same preset list as the other skills; follow-up questions differ per skill:

> What's your tech stack?
> 1. Node.js + React (default)
> 2. Node.js + Vue
> 3. .NET + React
> 4. .NET + Vue
> 5. Python + React
> 6. Other (specify)

**Node.js backend framework follow-up:** After selecting option 1 or 2, ask: "What's your backend framework? (Fastify / Express / NestJS / Other)". This determines which DI mechanism and structural test patterns to use. Section 3.4 provides detailed mapping for Fastify; for Express/NestJS, the skill adapts the same layer model using the framework's native DI patterns (NestJS has built-in DI; Express uses manual injection or `awilix`).

**.NET backend pattern follow-up:** After selecting option 3 or 4, ask: "What's your backend pattern? (MVC Controllers / Minimal APIs / Other)". Section 3.4 provides detailed mapping for MVC Controllers. For Minimal APIs, the API layer detection adapts to scan for `app.MapGet`/`app.MapPost` patterns instead of Controller classes (same layer rules apply).

**Python backend framework follow-up:** After selecting option 5, ask: "What's your backend framework? (FastAPI / Django / Flask / Other)". Section 3.4 provides detailed mapping for FastAPI. For Django, the skill maps `views.py` → API, `models.py` → Data, and uses Django's middleware for Provider patterns. For Flask, similar to FastAPI but uses Flask blueprints for API layer detection.

**Validation:** After selection, scan for expected config files as defined in `references/tech-stacks.md` for the selected stack. If not found, warn: "Expected [file] not found for [stack]. Is this the right tech stack?"

**"Other" handling:** Ask 5 follow-up questions (vs 3 for document-for-ai) because layer enforcement requires knowledge of the DI mechanism, test runner, and build system:
1. "What's your backend language/framework?"
2. "What's your frontend framework?" (if any)
3. "What's your DI/IoC mechanism?" (if any)
4. "What test runner do you use?" (e.g., pytest, JUnit, go test)
5. "What's your build system?" (e.g., Bazel, Gradle, Make)

### 4.2 Step 2 — Scope Detection

| Project Shape | Behavior |
|---|---|
| Single repo | Apply to the whole project, no question needed |
| Monorepo, CWD inside a package | Default to that package. Ask: "Apply to `packages/[name]/` or the whole monorepo?" |
| Monorepo, CWD at root | Ask: "Apply to the whole monorepo or a specific package?" |

When applying to a whole monorepo, the skill processes each package independently. Each gets its own layer map, structural tests, and provider interfaces. Shared/common packages may use a subset of layers (e.g., Types + Config + Data only, no API/UI) — missing layers in shared packages are not flagged as gaps.

Monorepo detection heuristics are defined in this skill's own `references/tech-stacks.md` under "General Monorepo Detection" — the same detection table that the other two skills carry in their respective reference files (Node.js: `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, or `package.json` with `"workspaces"`; .NET: `.sln` with multiple `.csproj`; Python: `pyproject.toml` with `[tool.uv.workspace]`; General: `rush.json`, `.moon/workspace.yml`, `pants.toml`).

### 4.3 Step 3 — Existing Layering Detection

Quick scan for signals that layers already exist:
- Folder names matching layer names (`types/`, `services/`, `repos/`, `providers/`)
- Existing structural tests or architecture test files
- ESLint import restriction configs or ArchUnitNET references

| State | Behavior |
|---|---|
| No layering detected | Proceed with full discovery + scaffolding |
| Partial layering detected | Note what exists, focus analysis on gaps and violations |
| Strong layering already in place | Report findings, ask: "Audit existing layers or restructure?" |

If `docs/layer-architecture/strategy.md` and `tests/structural/.layer-allowlist.json` exist from a previous run, read them to import previously approved intentional violations into the allowlist. Present only new violations separately during Phase 2.

### 4.4 Step 4 — Mode Selection

| State | Mode |
|---|---|
| Source files exist, no/partial/full layering | **ANALYZE** — run the 4-phase pipeline (discovery → proposal → scaffolding → review) |
| No source files (empty project) | **SCAFFOLD** — generate clean layer structure from scratch |

---

## 5. ANALYZE Mode — Pipeline

### 5.1 Phase 1: Discovery (No Checkpoint)

Single-pass data gathering. No user interaction — this is collecting facts.

**Step 1.1 — Structure Scan:**
- Map all source files to candidate layer categories using naming patterns and file content
- Use tech-stack-specific heuristics from `references/tech-stacks.md`:
  - **Node.js+Fastify:** `*.entity.ts` → Data, `*.service.ts` → Service, `*.route.ts` → API, plugin `decorate()` calls → Provider candidates
  - **.NET MVC:** `*Repository.cs` → Data, `*Service.cs` → Service, `*Controller.cs` → API, `IServiceCollection` registrations → Provider candidates
  - **Python+FastAPI:** `*_model.py` or `models.py` → Data, `*_service.py` → Service, `*_router.py` or `routes.py` → API, `Depends()` usage → Provider candidates
- Files that don't match any pattern → flagged as "unclassified" for user review in Phase 2

**Step 1.2 — Dependency Direction Analysis:**
- Trace all import/require statements (Node.js), `using` directives + `<ProjectReference>` (.NET), or `import`/`from...import` statements (Python)
- For each file, record: assigned layer (from 1.1) and which layers it imports from
- Build a directional dependency matrix: Layer A → Layer B (count of imports)
- Flag **violations** — any import where the target layer is not in the source layer's allowed dependencies (Section 3.2). e.g., Data importing from Service (backward), or API importing from Data (not in API's allowed list)
- Flag **circular dependencies** between layers

**Step 1.3 — Cross-Cutting Concern Inventory:**
- Scan for patterns indicating cross-cutting concerns scattered across layers:
  - **Auth:** JWT verification, `[Authorize]` attributes, auth middleware, token checks
  - **Logging:** `console.log`/`logger.*`/`ILogger` usage outside a centralized logger
  - **Telemetry:** Metrics, tracing, span creation
  - **Config access:** Direct `process.env` / `IConfiguration` reads outside the Config layer
  - **Error handling:** Try/catch patterns, error middleware
- A cross-cutting concern becomes a **Provider candidate** only if it appears in **3+ files across 2+ different layers**. Single-layer usage is a local concern, not cross-cutting. Below-threshold occurrences are noted in the strategy spec's limitations section but not proposed as Providers.

**Output of Phase 1:** Raw data — file-to-layer mapping, dependency matrix, violation list, provider candidate list. All internal, feeds directly into Phase 2.

### 5.2 Phase 2: Layer Proposal (User Checkpoint)

Synthesizes discovery data into a concrete proposal.

**Presented to the user:**

**1. Proposed Layer Map:**
- For each layer in the template: which existing files/folders belong here, whether the layer exists / is partial / is missing
- For missing layers: whether the codebase needs it (e.g., no UI layer for a pure API service is fine, not a gap)

**2. Dependency Violations Found:**
- Each violation: source file, target file, direction (which layer rule is broken per Section 3.2)
- e.g., "Data → Service: `userRepo.ts` imports from `authService.ts`" (Data's allowed deps are Types, Config only)
- Count summary: "Found 20 violations across 47 source files"

**3. Provider Candidates:**
- Each cross-cutting concern: what it is, how many files use it directly, proposed provider interface name
- e.g., "Auth: JWT verification found in 14 files across Data, Service, and API layers → propose `IAuthProvider` interface"

**4. Layer Adjustments:**
- Layers from the default template that don't fit this codebase (recommend removing)
- Custom layers the codebase might need (recommend adding)
- e.g., "This project has a distinct `validation/` concern across Service and API — consider a Validation layer or fold into Providers"

**5. Unclassified Files:**
- List all files that could not be automatically classified in Phase 1
- For each, ask the user to assign a layer or mark as "excluded" (e.g., scripts, config files, test utilities that don't participate in the layer model)
- **All source files must be classified or explicitly excluded before proceeding to Phase 3.** The strategy spec, structural tests, and provider interfaces all depend on complete layer assignment. The >50% auto-classification target in Section 1.2 measures discovery quality; it does not mean unclassified files can be left unresolved.

**User checkpoint prompt:**
> "Here's the proposed layer architecture for [module/project]. Review the layer map, violations, and provider candidates above. Any layers to add/remove/rename? Any violations that are intentional and should be allowed? Any provider candidates that should stay as direct imports? Please also assign a layer to the unclassified files listed above (or mark them as excluded)."

Changes feed back into the layer map. Once approved, the **approved layer map becomes the source of truth** for all Phase 3 artifacts:

**Propagation rules for user-approved adjustments:**
- **Added layers:** Insert into the layer sequence at the user-specified position. Define allowed dependencies for the new layer (user confirms). Generate structural tests and folder paths for it. Add to strategy spec `layers` frontmatter.
- **Removed layers:** Drop from the layer sequence. Files previously mapped to the removed layer are reassigned (user confirms target layer). Structural tests for the removed layer are not generated. Allowed dependencies referencing the removed layer are updated.
- **Renamed layers:** Update all references: folder paths, structural test assertions, strategy spec, and provider interfaces. The dependency rules follow the layer, not the name.
- **Modified dependency rules:** If the user says "API should be allowed to import from Data directly," update the allowed dependencies for API. Structural tests reflect the approved rules, not the Section 3.2 defaults.

Section 3.2 defines the **default** layer template. After Phase 2 approval, the approved layer map supersedes it for all downstream generation.

**Full rejection path:** If the user rejects the default layer template entirely (e.g., prefers hexagonal architecture or a custom layering), ask them to define their custom layers: name, responsibility, and allowed dependencies for each. Use their custom definitions in place of the Section 3.2 defaults. Re-run Phase 1 classification using the custom layer names as heuristic targets.

Proceed to Phase 3.

### 5.3 Phase 3: Scaffolding

Generates concrete artifacts after user approval.

**5.3.1 — Machine-Actionable Spec:**

Written to `docs/layer-architecture/strategy.md` for single repos. In monorepo mode, output paths are scoped per package (e.g., `packages/auth/docs/layer-architecture/strategy.md`). Similarly, structural tests and provider interfaces are written within each package's directory.

```markdown
---
scope: [module name or "project"]
layers: [approved layer list from Phase 2 — may differ from default]
tech_stack: nodejs-fastify | dotnet-mvc | python-fastapi | ...
generated: 2026-03-26
composition_root: [path to composition root file(s)]
---

## Layer Definitions
[Each layer from the approved map: name, responsibility, allowed dependencies (as approved), folder path]

## File Mapping
[Every source file → assigned layer, with confidence: high/medium/low]

## Violations
[Each violation: source file, target file, direction, severity, recommended fix]

## Provider Interfaces
[Each provider: name, responsibility, methods, which layers consume it]

## Restructuring Steps
[Ordered by dependency depth: fix Types first, then Config, etc.
 Each step includes:
 - action: move-file | extract-interface | rewrite-import | create-folder
 - source: current file path
 - target: target path or layer
 - affected_imports: files that import the moved/changed file
 - verify: command to confirm the step succeeded]

## Structural Test Inventory
[Which tests were generated, what each enforces]
```

This is the spec a future `implement-plan` skill would consume.

**5.3.2 — Structural Tests (3 tiers):**

**Tier 1 — Import-scanning tests** (zero dependencies, works immediately):
- Written to `tests/structural/layer-boundaries.test.ts` (Node.js), `Tests/Structural/LayerBoundaryTests.cs` (.NET), or `tests/structural/test_layer_boundaries.py` (Python)
- One test per layer rule, derived from the allowed dependencies table (Section 3.2). For each layer, assert that its files only import from allowed layers.
- Runs with the project's existing test runner (Jest/Vitest for Node.js, xUnit/NUnit for .NET, pytest for Python)

**Import resolution strategy per stack:**
- **Node.js:** Regex scan for `import ... from '...'` and `require('...')` statements. Resolve relative paths against file location. For path aliases (e.g., `@/`), read `tsconfig.json` `paths` field; if no tsconfig, note path aliases as a limitation in the strategy spec.
- **.NET:** Regex scan for `using` directives. Match namespace prefixes against project folder structure (e.g., `using MyApp.Data` → Data layer). Also check `<ProjectReference>` elements in `.csproj` files for project-level dependencies.
- **Python:** Regex scan for `import` and `from ... import` statements. Resolve against project package structure using `__init__.py` presence. For non-standard layouts, note as limitation.

**Allowlist mechanism:** A JSON file at `tests/structural/.layer-allowlist.json` containing entries of `{"source": "path/to/file", "target": "path/to/dependency", "reason": "..."}`. User-approved intentional violations from Phase 2 are pre-populated. The import-scanning tests read this file and skip matching entries.

**Composition root exemption:** The composition root file(s) are excluded from import-scanning tests since they by definition import from every layer to wire DI. Detection per stack:
- **Node.js:** Scan for files that import the framework constructor (`fastify()`, `express()`, `new Hono()`) AND call `.listen()` or `.ready()` or export the app instance. Common locations: `src/app.ts`, `src/server.ts`, `src/index.ts`, `src/main.ts`.
- **.NET:** `Program.cs` or `Startup.cs` (conventional, reliable).
- **Python:** Scan for files that create the ASGI/WSGI application instance (`FastAPI()`, `Flask(__name__)`, `Django` `wsgi.py`/`asgi.py`). Common locations: `src/main.py`, `app/main.py`.

If multiple files match, list all as composition root candidates and ask the user to confirm. These files are recorded in the strategy spec under a `composition_root` field.

**Concrete test case example (Node.js):**
```typescript
// For each file in src/data/**, collect import targets, resolve to layers,
// assert each target layer is in Data's allowed set: [Types, Config]
const dataFiles = glob.sync('src/data/**/*.ts');
for (const file of dataFiles) {
  const imports = extractImports(file);
  for (const imp of imports) {
    const targetLayer = resolveToLayer(imp);
    expect(['types', 'config']).toContain(targetLayer);
  }
}
```

**Tier 2 — Framework-specific enforcement:**
- **Node.js:** Detect ESLint config format — if `eslint.config.js` (flat config) exists, generate flat config using `eslint-plugin-import-x` with `no-restricted-paths`; if `.eslintrc.*` exists, generate legacy format using `eslint-plugin-import`. Default to flat config for new projects. One rule per forbidden layer crossing.
- **.NET:** ArchUnitNET test class with fluent assertions like `Types().That().ResideIn("Data").Should().NotDependOnAny("Service")`
- **Python:** `import-linter` contracts in `pyproject.toml` or `.importlinter` config. One contract per layer rule.

**Tier 3 — CI integration recommendation:**
- A section in the strategy doc recommending how to add structural tests to CI
- Not generated as pipeline config — that's infrastructure the skill doesn't own

**"Other" stack test generation:** For stacks not covered by presets, Tier 1 tests are generated in the user's stated backend language using the test runner from the follow-up questions. Tier 2 framework-specific enforcement is skipped with a note in the strategy doc explaining that no matching linter/architecture test library was identified. Provider interfaces are generated in the stated language with a "skeleton — adapt to your DI framework" header.

**5.3.3 — Provider Interface Templates:**

For each identified provider candidate:
- **Node.js:** TypeScript interface file + Fastify plugin that registers it via `fastify.decorate()` or awilix container
- **.NET:** `I[Name]Provider` interface + DI registration extension method for `IServiceCollection`
- **Python:** Protocol class (or ABC) + FastAPI `Depends()` factory function, or `dependency-injector` container registration

Written to the project source (e.g., `src/providers/` or `Providers/`). These are skeleton files — interface definitions with method signatures, not implementations. The implementations stay where the cross-cutting concern currently lives, but now behind the interface.

**Interface synthesis rules:**
1. **Group by concern:** All call sites for the same cross-cutting concern (identified in Phase 1 Step 1.3) are grouped together.
2. **Extract minimal operations:** From the grouped call sites, identify the distinct operations performed (e.g., auth concern → `authenticate()`, `authorize()`, `getCurrentUser()`). Each distinct operation signature becomes a method on the interface.
3. **Reuse existing types:** If the codebase already defines types used at call sites (e.g., `User`, `AuthToken`), reference them in method signatures rather than inventing new types.
4. **Low-confidence fallback:** When call sites are too inconsistent to infer a stable contract (e.g., 5 different auth patterns with incompatible signatures), generate the interface with clearly marked placeholder methods: `// TODO: consolidate — found N distinct patterns for [concern]. See strategy spec for details.` List the distinct patterns in the strategy spec's Provider Interfaces section so the human can decide.
5. **Naming convention:** `I{ConcernName}Provider` (.NET), `{ConcernName}Provider` (TypeScript interface), `{ConcernName}Provider` (Python Protocol).

### 5.4 Phase 4: Review (User Checkpoint)

**4.1 — Human-Readable Summary:**

Generated from the machine spec. Written to `docs/tmp/layer-summary.md`. This is a throwaway document for human review only.

Contents:
- Plain-language explanation of the proposed layer architecture
- Mermaid diagram showing layers and allowed dependency directions
- Violation highlights with before/after examples
- Provider interfaces explained in context ("instead of importing JWT verification directly, your Service layer receives an `IAuthProvider`")
- List of all generated files and what each does

Header: "Generated from layer analysis on [date] — this is a one-time review document, not a source of truth"

**4.2 — User checkpoint prompt:**
> "I've generated the layer architecture spec, structural tests, and provider interfaces. Review the summary at `docs/tmp/layer-summary.md`. Want to adjust anything before finalizing?"

If changes requested: update the machine spec, regenerate affected tests/interfaces, regenerate summary. Loop until approved.

**4.3 — Recommended next steps** (printed to user, not written to a file):
- "Run the structural tests to see current violation count"
- "Consider running `/refactor-to-layers` on other modules"
- "After restructuring, run `/document-for-ai` to generate docs for the new layer structure"

---

## 6. SCAFFOLD Mode — Empty Projects

**Detection:** No source files found (or only config/infrastructure files). Source files are files matching the tech stack's scan patterns: `.ts`/`.js`/`.tsx`/`.jsx` for Node.js, `.cs` for .NET, `.py` for Python. All other files (`package.json`, `tsconfig.json`, `*.csproj`, `Dockerfile`, `*.md`, `*.json`, `*.yaml`) are config/infrastructure. SCAFFOLD triggers when zero source files are found.

**Behavior:**

1. Tech stack already selected (Step 1 of invocation flow)
2. Ask: "What are the main concerns of this project?" — e.g., "user auth, billing, notifications." This helps name the Provider candidates and tailor the folder structure.
3. Generate:
   - **Folder structure** matching the layer template (e.g., `src/types/`, `src/config/`, `src/data/`, `src/services/`, `src/providers/`, `src/api/`)
   - **Barrel files / index files** per layer with a comment explaining the layer's responsibility and dependency rules
   - **Composition root stub** — `src/app.ts` (Node.js), `Program.cs` (.NET), or `src/main.py` (Python) with a DI wiring comment and placeholder provider registrations. Pre-populated in the strategy spec's `composition_root` field. Structural tests exempt this file.
   - **Structural tests** — same 3-tier output as the ANALYZE path, enforcing the clean state from day one
   - **Provider interface skeletons** based on the user's stated concerns
   - **Strategy spec** in `docs/layer-architecture/strategy.md` — same format as ANALYZE, but file mapping and violations sections are empty, restructuring steps replaced with "initial architecture" notes. Frontmatter defaults: `scope` from project name in `package.json`/`.csproj`/`pyproject.toml`, `layers` is the full default set.
4. No human summary needed for empty projects — present the generated structure inline and confirm

This implements the OpenAI insight that layer enforcement is "an early prerequisite, not something you postpone."

---

## 7. Error Handling

| Scenario | Fallback Behavior |
|---|---|
| No clear file-to-layer mapping (>50% files unclassified) | Present unclassified files to user, ask for manual classification hints. If still unclear, suggest a custom layer template. |
| Dynamic imports / reflection-based DI | Flag as "not statically analyzable" in the violation list. Structural tests mark these as skipped with a comment. |
| Very large module (>50K LOC) | Process one top-level directory at a time during discovery. Build the dependency matrix incrementally. Report progress after each directory is classified. |
| Very small module (<5 source files) | Report that the module has insufficient code for meaningful layer separation. Suggest running after the module grows. |
| No cross-cutting concerns found | Skip provider generation. Note in strategy doc that no Provider candidates were identified. |
| Existing structural tests conflict with generated ones | Detect existing architecture tests, report them, ask: "Merge with existing tests or generate separately?" Never overwrite existing test files. **If "generate separately":** use alternate filenames — `layer-boundaries-generated.test.ts` (Node.js), `LayerBoundaryTests.Generated.cs` (.NET), `test_layer_boundaries_generated.py` (Python), `eslint-layers-generated.config.js` (ESLint). **If "merge":** for test files, append new test cases to the existing file after a `// --- Generated by refactor-to-layers ---` marker. For `pyproject.toml` sections, append under a new `[tool.importlinter.contracts.layers]` subsection. Record which path was chosen in the strategy spec under a `conflict_resolution` field. |
| Fastify plugin bundles routes + logic in one file | Flag as a soft violation with explanation. Note as an intentional Fastify trade-off if user approves. |
| .NET project uses minimal APIs instead of controllers | Adapt API layer detection to scan for `app.MapGet`/`app.MapPost` patterns instead of Controller classes. Same layer rules apply. |
| Monorepo shared package doesn't fit standard layers | Recognize that shared packages often only contain Types + Config + Data. Don't flag missing Service/API/UI as gaps. |
| User approves a violation as intentional | Record as an allowed exception in the strategy spec. Structural tests include an allowlist for that import path. |
| Empty project (no source files) | Switch to SCAFFOLD mode — generate folder structure, structural tests, and provider skeletons from scratch. |
| Partial failure (some layers analyzed, others fail) | Proceed with completed analysis. Include a "limitations" section listing what couldn't be analyzed and why. Never silently skip. |

---

## 8. Output Artifacts Summary

### ANALYZE Mode

| Artifact | Location | Purpose | Persistence |
|---|---|---|---|
| Strategy spec | `docs/layer-architecture/strategy.md` | Machine-actionable restructuring plan | Source of truth — kept |
| Human summary | `docs/tmp/layer-summary.md` | Human review of proposed changes | Throwaway — disposable after review |
| Import-scanning tests | `tests/structural/layer-boundaries.test.ts` (Node.js), `Tests/Structural/LayerBoundaryTests.cs` (.NET), `tests/structural/test_layer_boundaries.py` (Python) | Immediate layer enforcement | Kept — runs in CI |
| ESLint config (Node.js) | `eslint-layers.config.js` (flat) or `.eslintrc.layers.js` (legacy) | Layer-aware linting | Kept — runs on save + CI |
| import-linter config (Python) | `pyproject.toml` `[tool.importlinter]` section | Layer-aware import contracts | Kept — runs in CI |
| ArchUnitNET tests (.NET) | `Tests/Structural/ArchitectureTests.cs` | Framework-level layer enforcement | Kept — runs in CI |
| Provider interfaces | `src/providers/` or `Providers/` | DI interface skeletons | Kept — extended by implementation |

### SCAFFOLD Mode

Same artifacts as ANALYZE, minus violations and human summary. Folder structure and barrel files are additional outputs. (Barrel files are only generated in SCAFFOLD mode; ANALYZE mode operates on existing file structures.)

---

## 9. Design Decisions & Rationale

| Decision | Rationale |
|---|---|
| Standalone skill, not extension of refactor-to-monorepo | Different concerns (inter-module boundaries vs intra-module layers). Keeps both skills within ~250-300 line SKILL.md. Works independently on any project shape. |
| Hybrid layer discovery (prescriptive + validated) | Prescriptive starting point prevents AI hallucinating layers from messy code. Validation against reality prevents recommending layers that don't match the project. |
| Providers as lateral injection, not a sequential layer | Cross-cutting concerns are consumed by multiple layers. Forcing them into the sequence would create awkward dependency chains. |
| 2 user checkpoints (not 4) | Only pause when there's a real decision: layer map approval and final review. Data gathering doesn't benefit from intermediate approval. |
| 3-tier structural tests | Tier 1 (import-scanning) works everywhere with zero dependencies. Tier 2 (ESLint/ArchUnitNET) provides stronger enforcement. Tier 3 (CI recommendation) defers infrastructure decisions to the team. |
| Machine spec + throwaway human summary | AI-optimized spec is the source of truth for execution. Human summary is for one-time review — no sync burden. Mirrors document-for-ai's HUMANIZE pattern. |
| SCAFFOLD mode for empty projects | Layer enforcement is most valuable when set up before code exists (OpenAI's "early prerequisite" insight). Prevents violations from ever forming. |
| Generate code files (tests + interfaces), not just markdown | Structural tests and interfaces are scaffolding, not strategy. They need to be runnable, not copy-pasted from a doc. Analysis docs stay in `docs/`. |
| Intentional violation allowlist | Real codebases have legitimate exceptions. Hard-blocking all violations would make the tests unusable. Named exceptions with justifications keep enforcement honest. |
| Tech stack mapping for Fastify, .NET MVC, and Python+FastAPI | These are the user's primary stacks. The default layer template maps cleanly to all three — Fastify's plugin model, .NET's built-in DI, and FastAPI's `Depends()` are natural fits. Node.js backend framework follow-up question handles Express/NestJS variants. |
