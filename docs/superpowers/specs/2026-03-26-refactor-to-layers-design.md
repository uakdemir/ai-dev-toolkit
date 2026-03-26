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

- Discovery phase correctly maps >50% of source files to layers without manual classification (remaining files flagged for user review)
- Every dependency direction violation is detected and reported with source file, target file, and direction
- Generated import-scanning tests pass on a clean architecture and fail on any backward dependency
- Generated ESLint configs (Node.js) and ArchUnitNET tests (.NET) are valid and runnable without modification
- Provider interface templates compile/type-check without errors
- Machine-actionable spec contains enough detail for a future `implement-plan` skill to execute restructuring without re-analysis
- SCAFFOLD mode on an empty project produces a complete, buildable folder structure with passing structural tests

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

### 1.4 Relationship to Other Skills

The three skills in `ai-dev-toolkit` are independent but complementary. Typical workflow:

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

### Progressive Disclosure

SKILL.md targets ~250-300 lines. References are loaded on-demand:

- After tech stack selection → read `references/tech-stacks.md` (only the relevant stack section)
- During discovery phase → read `references/layer-definitions.md`
- During scaffolding phase → read `references/structural-test-templates.md` and `references/provider-patterns.md`

The AI never loads all references at once. If the user selected "Other" tech stack, skip `tech-stacks.md` and use follow-up answers to determine patterns.

---

## 3. Default Layer Architecture

### 3.1 Layer Sequence

```
Types → Config → Data → Service → Providers (lateral) → API → UI
```

Dependencies flow left-to-right ("forward"). A layer may import from any layer to its left, never to its right.

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

---

## 4. Invocation Flow

### 4.1 Step 1 — Tech Stack Selection

Same preset list as the other skills:

> What's your tech stack?
> 1. Node.js + React (default)
> 2. Node.js + Vue
> 3. .NET + React
> 4. .NET + Vue
> 5. Python + React
> 6. Other (specify)

**Validation:** After selection, scan for expected config files (`package.json` for Node.js, `.csproj`/`.sln` for .NET, `pyproject.toml` for Python). If not found, warn: "Expected [file] not found for [stack]. Is this the right tech stack?"

**"Other" handling:** Ask follow-up questions:
1. "What's your backend language/framework?"
2. "What's your frontend framework?" (if any)
3. "What's your DI/IoC mechanism?" (if any)

### 4.2 Step 2 — Scope Detection

| Project Shape | Behavior |
|---|---|
| Single repo | Apply to the whole project, no question needed |
| Monorepo, CWD inside a package | Default to that package. Ask: "Apply to `packages/[name]/` or the whole monorepo?" |
| Monorepo, CWD at root | Ask: "Apply to the whole monorepo or a specific package?" |

When applying to a whole monorepo, the skill processes each package independently. Each gets its own layer map, structural tests, and provider interfaces. Shared/common packages may use a subset of layers (e.g., Types + Config + Data only, no API/UI) — missing layers in shared packages are not flagged as gaps.

Monorepo detection uses the same heuristics as the other skills (see `refactor-to-monorepo` spec Section 4.5).

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
- Files that don't match any pattern → flagged as "unclassified" for user review in Phase 2

**Step 1.2 — Dependency Direction Analysis:**
- Trace all import/require statements (Node.js) or `using` directives + `<ProjectReference>` (.NET)
- For each file, record: assigned layer (from 1.1) and which layers it imports from
- Build a directional dependency matrix: Layer A → Layer B (count of imports)
- Flag **hard violations** — any import that goes "backward" against the prescribed flow (e.g., Data importing from Service)
- Flag **soft violations** — any import that skips a layer (e.g., API importing from Data, bypassing Service)
- Flag **circular dependencies** between layers

**Step 1.3 — Cross-Cutting Concern Inventory:**
- Scan for patterns indicating cross-cutting concerns scattered across layers:
  - **Auth:** JWT verification, `[Authorize]` attributes, auth middleware, token checks
  - **Logging:** `console.log`/`logger.*`/`ILogger` usage outside a centralized logger
  - **Telemetry:** Metrics, tracing, span creation
  - **Config access:** Direct `process.env` / `IConfiguration` reads outside the Config layer
  - **Error handling:** Try/catch patterns, error middleware
- Each occurrence is a **Provider candidate** — something that should be injected via an interface rather than directly imported

**Output of Phase 1:** Raw data — file-to-layer mapping, dependency matrix, violation list, provider candidate list. All internal, feeds directly into Phase 2.

### 5.2 Phase 2: Layer Proposal (User Checkpoint)

Synthesizes discovery data into a concrete proposal.

**Presented to the user:**

**1. Proposed Layer Map:**
- For each layer in the template: which existing files/folders belong here, whether the layer exists / is partial / is missing
- For missing layers: whether the codebase needs it (e.g., no UI layer for a pure API service is fine, not a gap)

**2. Dependency Violations Found:**
- Each violation: source file, target file, direction, severity (hard/soft)
- e.g., "Data → Service: `userRepo.ts` imports from `authService.ts`" (hard violation)
- Count summary: "Found 12 hard violations, 8 soft violations across 47 source files"

**3. Provider Candidates:**
- Each cross-cutting concern: what it is, how many files use it directly, proposed provider interface name
- e.g., "Auth: JWT verification found in 14 files across Data, Service, and API layers → propose `IAuthProvider` interface"

**4. Layer Adjustments:**
- Layers from the default template that don't fit this codebase (recommend removing)
- Custom layers the codebase might need (recommend adding)
- e.g., "This project has a distinct `validation/` concern across Service and API — consider a Validation layer or fold into Providers"

**User checkpoint prompt:**
> "Here's the proposed layer architecture for [module/project]. Review the layer map, violations, and provider candidates above. Any layers to add/remove/rename? Any violations that are intentional and should be allowed? Any provider candidates that should stay as direct imports?"

Changes feed back into the layer map. Once approved, proceed to Phase 3.

### 5.3 Phase 3: Scaffolding

Generates concrete artifacts after user approval.

**3.1 — Machine-Actionable Spec:**

Written to `docs/layer-architecture/strategy.md`:

```markdown
---
scope: [module name or "project"]
layers: [Types, Config, Data, Service, Providers, API, UI]
tech_stack: nodejs-fastify | dotnet-mvc | ...
generated: 2026-03-26
---

## Layer Definitions
[Each layer: name, responsibility, allowed dependencies, folder path]

## File Mapping
[Every source file → assigned layer, with confidence: high/medium/low]

## Violations
[Each violation: source file, target file, direction, severity, recommended fix]

## Provider Interfaces
[Each provider: name, responsibility, methods, which layers consume it]

## Restructuring Steps
[Ordered list of file moves, import rewrites, interface extractions —
 ordered by dependency depth: fix Types first, then Config, etc.]

## Structural Test Inventory
[Which tests were generated, what each enforces]
```

This is the spec a future `implement-plan` skill would consume.

**3.2 — Structural Tests (3 tiers):**

**Tier 1 — Import-scanning tests** (zero dependencies, works immediately):
- Written to `tests/structural/layer-boundaries.test.ts` (Node.js) or `Tests/Structural/LayerBoundaryTests.cs` (.NET)
- One test per layer rule: "files in Data/ do not import from Service/"
- Parses source files, resolves imports, asserts no violations
- Runs with the project's existing test runner (Jest/Vitest for Node.js, xUnit/NUnit for .NET)
- Includes an allowlist mechanism for user-approved intentional violations

**Tier 2 — Framework-specific enforcement:**
- **Node.js:** `.eslintrc` rules using `eslint-plugin-import` with `no-restricted-paths` — one rule per forbidden layer crossing
- **.NET:** ArchUnitNET test class with fluent assertions like `Types().That().ResideIn("Data").Should().NotDependOnAny("Service")`

**Tier 3 — CI integration recommendation:**
- A section in the strategy doc recommending how to add structural tests to CI
- Not generated as pipeline config — that's infrastructure the skill doesn't own

**3.3 — Provider Interface Templates:**

For each identified provider candidate:
- **Node.js:** TypeScript interface file + Fastify plugin that registers it via `fastify.decorate()` or awilix container
- **.NET:** `I[Name]Provider` interface + DI registration extension method for `IServiceCollection`

Written to the project source (e.g., `src/providers/` or `Providers/`). These are skeleton files — interface definitions with method signatures, not implementations. The implementations stay where the cross-cutting concern currently lives, but now behind the interface.

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

**Detection:** No source files found (or only config files like `package.json`, `*.csproj`).

**Behavior:**

1. Tech stack already selected (Step 1 of invocation flow)
2. Ask: "What are the main concerns of this project?" — e.g., "user auth, billing, notifications." This helps name the Provider candidates and tailor the folder structure.
3. Generate:
   - **Folder structure** matching the layer template (e.g., `src/types/`, `src/config/`, `src/data/`, `src/services/`, `src/providers/`, `src/api/`)
   - **Barrel files / index files** per layer with a comment explaining the layer's responsibility and dependency rules
   - **Structural tests** — same 3-tier output as the ANALYZE path, enforcing the clean state from day one
   - **Provider interface skeletons** based on the user's stated concerns
   - **Strategy spec** in `docs/layer-architecture/strategy.md` — same format as ANALYZE, but file mapping and violations sections are empty, restructuring steps replaced with "initial architecture" notes
4. No human summary needed for empty projects — present the generated structure inline and confirm

This implements the OpenAI insight that layer enforcement is "an early prerequisite, not something you postpone."

---

## 7. Error Handling

| Scenario | Fallback Behavior |
|---|---|
| No clear file-to-layer mapping (>50% files unclassified) | Present unclassified files to user, ask for manual classification hints. If still unclear, suggest a custom layer template. |
| Dynamic imports / reflection-based DI | Flag as "not statically analyzable" in the violation list. Structural tests mark these as skipped with a comment. |
| Very large module (>50K LOC) | Process one layer at a time during discovery. Report progress. |
| Very small module (<5 source files) | Report that the module has insufficient code for meaningful layer separation. Suggest running after the module grows. |
| No cross-cutting concerns found | Skip provider generation. Note in strategy doc that no Provider candidates were identified. |
| Existing structural tests conflict with generated ones | Detect existing architecture tests, report them, ask: "Merge with existing tests or generate separately?" Never overwrite existing test files. |
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
| Import-scanning tests | `tests/structural/layer-boundaries.test.ts` or `.cs` | Immediate layer enforcement | Kept — runs in CI |
| ESLint config (Node.js) | `.eslintrc` additions or separate config | Layer-aware linting | Kept — runs on save + CI |
| ArchUnitNET tests (.NET) | `Tests/Structural/ArchitectureTests.cs` | Framework-level layer enforcement | Kept — runs in CI |
| Provider interfaces | `src/providers/` or `Providers/` | DI interface skeletons | Kept — extended by implementation |

### SCAFFOLD Mode

Same artifacts as ANALYZE, minus violations and human summary. Folder structure and barrel files are additional outputs.

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
| Tech stack mapping for Fastify and .NET MVC specifically | These are the user's primary stacks. The default layer template maps cleanly to both with no conflicts — Fastify's plugin model and .NET's built-in DI are natural fits. |
