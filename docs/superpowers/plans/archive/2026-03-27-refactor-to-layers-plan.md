# Refactor-to-Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `refactor-to-layers` skill for the `ai-dev-toolkit` Claude Code plugin — the third skill that enforces architectural layer boundaries within modules/projects.

**Architecture:** A Markdown-based Claude Code skill following the exact same conventions as the existing `document-for-ai` and `refactor-to-monorepo` skills: `SKILL.md` (~250-300 lines) for workflow orchestration + `references/` directory for progressive disclosure. No compiled code — the skill is entirely declarative Markdown that instructs the AI agent.

**Tech Stack:** Claude Code plugin system (Markdown SKILL.md files, YAML frontmatter)

**Spec:** `docs/superpowers/specs/2026-03-26-refactor-to-layers-design.md`

---

## File Map

| File | Responsibility | Target Lines | Action |
|------|---------------|-------------|--------|
| `ai-dev-toolkit/skills/refactor-to-layers/SKILL.md` | Workflow orchestration: invocation flow, pipeline phases, mode detection, progressive disclosure | ~250-300 | Create |
| `ai-dev-toolkit/skills/refactor-to-layers/references/tech-stacks.md` | Per-stack layer mappings, DI patterns, file heuristics, monorepo detection | ~120-150 | Create |
| `ai-dev-toolkit/skills/refactor-to-layers/references/layer-definitions.md` | Default layer template, responsibilities, dependency rules, examples | ~60-80 | Create |
| `ai-dev-toolkit/skills/refactor-to-layers/references/structural-test-templates.md` | Import-scanning test templates, ESLint/ArchUnitNET/import-linter scaffolding, allowlist format | ~120-150 | Create |
| `ai-dev-toolkit/skills/refactor-to-layers/references/provider-patterns.md` | Provider interface templates per stack, DI registration, injection examples | ~80-100 | Create |
| `ai-dev-toolkit/.claude-plugin/plugin.json` | Update description to reflect third skill | — | Modify |

**Total: 5 new files + 1 modification**

---

## Task 1: Create Directory Structure

**Files:**
- Create: `ai-dev-toolkit/skills/refactor-to-layers/references/` (directory)

- [ ] **Step 1: Create skill directory**

```bash
mkdir -p ai-dev-toolkit/skills/refactor-to-layers/references
```

- [ ] **Step 2: Verify directory structure**

```bash
ls -la ai-dev-toolkit/skills/
```

Expected: Three directories — `document-for-ai/`, `refactor-to-monorepo/`, `refactor-to-layers/`

- [ ] **Step 3: Commit**

```bash
git add ai-dev-toolkit/skills/refactor-to-layers
git commit -m "feat(refactor-to-layers): create skill directory structure"
```

---

## Task 2: Create `references/layer-definitions.md`

Start with the innermost reference file that other files depend on — the layer definitions.

**Files:**
- Create: `ai-dev-toolkit/skills/refactor-to-layers/references/layer-definitions.md`

- [ ] **Step 1: Write layer-definitions.md**

Extract from spec Sections 3.1, 3.2, 3.3. This file is the canonical reference for the default layer architecture.

Required content:
- H1: "Layer Definitions"
- Brief intro (1-2 lines) explaining this is the default layer template
- `## Default Layer Sequence` — the `Types → Config → Data → Service → Providers (lateral) → API → UI` sequence with the forward-dependency rule
- `## Layer Responsibility Table` — the full table from spec Section 3.2 with Layer, Responsibility, Contains, Allowed Dependencies columns
- `## Provider Injection Rules` — from spec Section 3.3: interfaces vs implementations, composition root registration, constructor injection
- `## Dependency Rules for Structural Tests` — explicit forbidden-crossing matrix derived from the allowed dependencies table. For each layer, list which other layers it is NOT allowed to import from. This is what structural tests enforce.
- `## Custom Layer Support` — from spec Section 5.2 propagation rules: how added/removed/renamed layers change the dependency matrix, and the full rejection path for custom architectures

Target: ~60-80 lines. Be concise — tables are dense.

- [ ] **Step 2: Verify line count and structure**

```bash
wc -l ai-dev-toolkit/skills/refactor-to-layers/references/layer-definitions.md
head -5 ai-dev-toolkit/skills/refactor-to-layers/references/layer-definitions.md
```

Expected: 60-80 lines, starts with `# Layer Definitions`

- [ ] **Step 3: Commit**

```bash
git add ai-dev-toolkit/skills/refactor-to-layers/references/layer-definitions.md
git commit -m "feat(refactor-to-layers): add layer definitions reference"
```

---

## Task 3: Create `references/tech-stacks.md`

**Files:**
- Create: `ai-dev-toolkit/skills/refactor-to-layers/references/tech-stacks.md`

- [ ] **Step 1: Write tech-stacks.md**

Extract from spec Sections 3.4, 4.1, 4.2, 5.1 Step 1.1. Organized with `## Stack:` level-2 headers keyed by **backend framework** (not frontend — unlike the other skills).

Required content:
- H1: "Tech Stacks Reference"
- Brief intro noting this skill uses backend-keyed headers (unlike other skills)
- `## Stack: Node.js + Fastify` — layer-to-folder mapping table, DI mechanism (`@fastify/awilix` vs `fastify.decorate()`), file classification heuristics (`*.entity.ts` → Data, `*.service.ts` → Service, `*.route.ts` → API, `decorate()` → Provider candidates), validation file (`package.json`), source file extensions (`.ts`, `.js`, `.tsx`, `.jsx`, `.vue`), Fastify-specific notes (route+handler bundling trade-off), frontend UI layer note
- `## Stack: .NET MVC` — layer-to-folder mapping table (project/folder conventions), DI mechanism (`IServiceCollection`), file heuristics (`*Repository.cs` → Data, `*Service.cs` → Service, `*Controller.cs` → API, `IServiceCollection` registrations → Provider candidates), validation files (`.csproj`, `.sln`), source file extensions (`.cs`, `.razor`), minimal API detection adaptation, composition root (`Program.cs`/`Startup.cs`)
- `## Stack: Python + FastAPI` — layer-to-folder mapping table, DI mechanism (`Depends()`/`dependency-injector`), file heuristics (`*_model.py`/`models.py` → Data, `*_service.py` → Service, `*_router.py`/`routes.py` → API, `Depends()` → Provider candidates), validation file (`pyproject.toml`), source file extensions (`.py`), Django/Flask notes (generic Protocol + TODO for non-FastAPI)
- `## "Other" Stack Handling` — 5 follow-up questions with explanation of why 5 vs 3
- `## General Monorepo Detection` — the detection table from spec Section 4.2 (same table the other two skills carry): Node.js, .NET, Python, Go, Rust, General rows
- `## Composition Root Detection` — per-stack detection rules from spec Section 5.3.2

Target: ~120-150 lines.

- [ ] **Step 2: Verify line count and key sections**

```bash
wc -l ai-dev-toolkit/skills/refactor-to-layers/references/tech-stacks.md
grep "^## " ai-dev-toolkit/skills/refactor-to-layers/references/tech-stacks.md
```

Expected: 120-150 lines. Headers include `## Stack: Node.js + Fastify`, `## Stack: .NET MVC`, `## Stack: Python + FastAPI`, `## "Other" Stack Handling`, `## General Monorepo Detection`, `## Composition Root Detection`.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-toolkit/skills/refactor-to-layers/references/tech-stacks.md
git commit -m "feat(refactor-to-layers): add tech stacks reference with layer mappings and detection"
```

---

## Task 4: Create `references/structural-test-templates.md`

**Files:**
- Create: `ai-dev-toolkit/skills/refactor-to-layers/references/structural-test-templates.md`

- [ ] **Step 1: Write structural-test-templates.md**

Extract from spec Sections 5.3.2, 7 (conflict handling), 8. This is the largest reference file — it contains actual code templates.

Required content:
- H1: "Structural Test Templates"
- Brief intro explaining 3-tier enforcement model
- `## Tier 1: Import-Scanning Tests` — with sub-sections:
  - `### Node.js (Jest/Vitest)` — complete test file template based on the spec's concrete example. Include `extractImports()` and `resolveToLayer()` helper functions. File path: `tests/structural/layer-boundaries.test.ts`. Show one test per layer rule pattern.
  - `### .NET (xUnit/NUnit)` — complete test class at `Tests/Structural/LayerBoundaryTests.cs`. Show how to scan `using` directives and match against namespace-to-layer mapping.
  - `### Python (pytest)` — complete test file at `tests/structural/test_layer_boundaries.py`. Show how to scan `import`/`from...import` and resolve to layers.
- `## Tier 2: Framework-Specific Enforcement` — with sub-sections:
  - `### Node.js: ESLint` — flat config template (`eslint-layers.config.js`) using `eslint-plugin-import-x` `no-restricted-paths`, AND legacy template (`.eslintrc.layers.js`). Show how to detect which format to use.
  - `### .NET: ArchUnitNET` — test class at `Tests/Structural/ArchitectureTests.cs` with fluent assertions.
  - `### Python: import-linter` — `pyproject.toml` `[tool.importlinter]` section with contracts.
- `## Allowlist Format` — JSON schema for `.layer-allowlist.json` with examples
- `## Conflict Resolution` — alternate filenames for "generate separately" mode (from spec Section 7 error handling), merge marker format for "merge" mode
- `## Import Resolution Strategy` — per-stack regex patterns and resolution rules from spec Section 5.3.2

Target: ~120-150 lines. Code blocks are dense — this file will be the longest reference.

- [ ] **Step 2: Verify line count and key sections**

```bash
wc -l ai-dev-toolkit/skills/refactor-to-layers/references/structural-test-templates.md
grep "^## \|^### " ai-dev-toolkit/skills/refactor-to-layers/references/structural-test-templates.md
```

Expected: 120-150 lines. Major headers include `## Tier 1`, `## Tier 2`, `## Allowlist Format`, `## Conflict Resolution`, `## Import Resolution Strategy`.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-toolkit/skills/refactor-to-layers/references/structural-test-templates.md
git commit -m "feat(refactor-to-layers): add structural test templates reference"
```

---

## Task 5: Create `references/provider-patterns.md`

**Files:**
- Create: `ai-dev-toolkit/skills/refactor-to-layers/references/provider-patterns.md`

- [ ] **Step 1: Write provider-patterns.md**

Extract from spec Sections 3.3, 5.1 Step 1.3, 5.3.3 (interface synthesis rules). Contains interface templates and DI registration patterns per stack.

Required content:
- H1: "Provider Patterns"
- Brief intro explaining Provider as lateral injection point
- `## Interface Synthesis Rules` — the 5-step process from spec Section 5.3.3: group by concern, extract minimal operations, reuse existing types, low-confidence fallback, naming convention
- `## Cross-Cutting Concern Detection` — the scan patterns from spec Section 5.1 Step 1.3 (auth, logging, telemetry, config access, error handling) with the 3+files/2+layers threshold
- `## Stack: Node.js + Fastify` — TypeScript interface template (`export interface AuthProvider { ... }`), Fastify plugin registration template (`fp(async (fastify) => { fastify.decorate('authProvider', ...) })`), awilix container registration alternative
- `## Stack: .NET MVC` — `I[Name]Provider` interface template, `IServiceCollection` extension method template (`public static IServiceCollection AddAuthProvider(this IServiceCollection services) { ... }`)
- `## Stack: Python + FastAPI` — Protocol class template (`class AuthProvider(Protocol): ...`), FastAPI `Depends()` factory template, Django/Flask note (generic Protocol + TODO comment)
- `## Naming Convention` — `I{ConcernName}Provider` (.NET), `{ConcernName}Provider` (TypeScript/Python Protocol)

Target: ~80-100 lines.

- [ ] **Step 2: Verify line count and key sections**

```bash
wc -l ai-dev-toolkit/skills/refactor-to-layers/references/provider-patterns.md
grep "^## " ai-dev-toolkit/skills/refactor-to-layers/references/provider-patterns.md
```

Expected: 80-100 lines. Headers include `## Interface Synthesis Rules`, `## Cross-Cutting Concern Detection`, `## Stack: Node.js + Fastify`, `## Stack: .NET MVC`, `## Stack: Python + FastAPI`, `## Naming Convention`.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-toolkit/skills/refactor-to-layers/references/provider-patterns.md
git commit -m "feat(refactor-to-layers): add provider patterns reference"
```

---

## Task 6: Create `SKILL.md`

This is the main orchestration file. It depends on all 4 reference files being defined (so it can reference them correctly).

**Files:**
- Create: `ai-dev-toolkit/skills/refactor-to-layers/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

Follow the exact same structure as the existing skills (`refactor-to-monorepo/SKILL.md` and `document-for-ai/SKILL.md`).

Required structure and content:

**Frontmatter** (from spec Section 2):
```yaml
---
name: refactor-to-layers
description: "Use when the user wants to enforce architectural layers within a module or project, add dependency direction rules, reduce AI agent context through structural boundaries, introduce provider/dependency injection patterns, or generate structural tests that enforce layer compliance — even if they don't use the term 'layers'."
---
```

**H1:** `# refactor-to-layers`

**Overview** (2-3 sentences): What this skill does — analyze codebase, enforce layered dependency architecture, generate structural tests and provider interfaces. Inspired by OpenAI's harness engineering.

**`## Workflow Overview`** — numbered list of the pipeline steps. Reference files listed with progressive disclosure schedule:
- Reference files: `references/tech-stacks.md`, `references/layer-definitions.md`, `references/structural-test-templates.md`, `references/provider-patterns.md`
- "Do not inline their content — read them at the indicated step"
- Loading schedule: tech-stacks after stack selection, layer-definitions during discovery, structural-test-templates and provider-patterns during scaffolding
- If "Other" selected → skip tech-stacks.md

**`## Step 1: Tech Stack Selection`** — from spec Section 4.1:
- 6-option preset list
- Node.js backend framework follow-up (Fastify/Express/NestJS/Other)
- .NET backend pattern follow-up (MVC Controllers/Minimal APIs/Other)
- Python backend framework follow-up (FastAPI/Django/Flask/Other)
- Validation: scan for expected config files per `references/tech-stacks.md`
- "Other" handling: 5 follow-up questions

**`## Step 2: Scope Detection`** — from spec Section 4.2:
- Single repo / monorepo CWD inside package / monorepo CWD at root table
- Monorepo detection heuristics: reference `references/tech-stacks.md` "General Monorepo Detection" section
- Per-package processing for whole-monorepo runs

**`## Step 3: Existing Layering Detection`** — from spec Section 4.3:
- What to scan for (folders, existing tests, ESLint configs)
- State table (no layering / partial / strong)
- Import previous allowlist if strategy.md exists

**`## Step 4: Mode Selection`** — from spec Section 4.4:
- ANALYZE vs SCAFFOLD table

**`## ANALYZE Mode`** — from spec Section 5:

`### Phase 1: Discovery` — single-pass data gathering (no checkpoint):
- Step 1.1: Structure Scan — file-to-layer classification using `references/tech-stacks.md` heuristics
- Step 1.2: Dependency Direction Analysis — import tracing, violation flagging per `references/layer-definitions.md` rules
- Step 1.3: Cross-Cutting Concern Inventory — scan patterns, 3+files/2+layers threshold

`### Phase 2: Layer Proposal (User Checkpoint)` — present to user:
- Proposed layer map, violations, provider candidates, layer adjustments, unclassified files
- All files must be classified or excluded before Phase 3
- User checkpoint prompt
- Propagation rules for approved adjustments
- Full rejection path

`### Phase 3: Scaffolding` — generate artifacts after approval:
- Machine-actionable spec to `docs/layer-architecture/strategy.md` — reference strategy spec template
- Structural tests: read `references/structural-test-templates.md`, generate 3 tiers
- Provider interfaces: read `references/provider-patterns.md`, apply synthesis rules
- Composition root exemption

`### Phase 4: Review (User Checkpoint)`:
- Human summary to `docs/tmp/layer-summary.md`
- User checkpoint prompt
- Recommended next steps

**`## SCAFFOLD Mode`** — from spec Section 6:
- Detection rule (zero source files per tech stack patterns)
- Ask for project concerns
- Generate: folder structure, barrel files, composition root stub, structural tests, provider skeletons, strategy spec
- No human summary needed

**`## Error Handling`** — from spec Section 7:
- Key error scenarios table (reference the full table, keep SKILL.md concise — just the most important rows)

**`## Progressive Disclosure Schedule`** — summary table of when to load each reference file (following refactor-to-monorepo's pattern at its lines 224-238)

Target: ~250-300 lines. Be concise — this orchestrates, it doesn't contain the details. Details live in `references/`.

- [ ] **Step 2: Verify line count and structure**

```bash
wc -l ai-dev-toolkit/skills/refactor-to-layers/SKILL.md
grep "^## \|^### " ai-dev-toolkit/skills/refactor-to-layers/SKILL.md
head -5 ai-dev-toolkit/skills/refactor-to-layers/SKILL.md
```

Expected: 250-300 lines. Starts with YAML frontmatter. Major sections match the list above.

- [ ] **Step 3: Verify all reference paths are correct**

```bash
grep "references/" ai-dev-toolkit/skills/refactor-to-layers/SKILL.md
ls ai-dev-toolkit/skills/refactor-to-layers/references/
```

Expected: Every `references/` path mentioned in SKILL.md corresponds to an actual file.

- [ ] **Step 4: Commit**

```bash
git add ai-dev-toolkit/skills/refactor-to-layers/SKILL.md
git commit -m "feat(refactor-to-layers): add main SKILL.md with workflow orchestration"
```

---

## Task 7: Update `plugin.json` and Final Verification

**Files:**
- Modify: `ai-dev-toolkit/.claude-plugin/plugin.json`

- [ ] **Step 1: Update plugin.json description**

Update the `description` field from:
```
"AI-optimized documentation generation and monorepo refactoring strategy"
```
to:
```
"AI-optimized documentation generation, monorepo refactoring strategy, and architectural layer enforcement"
```

- [ ] **Step 2: Verify the full skill directory**

```bash
find ai-dev-toolkit/skills/refactor-to-layers -type f | sort
```

Expected output:
```
ai-dev-toolkit/skills/refactor-to-layers/SKILL.md
ai-dev-toolkit/skills/refactor-to-layers/references/layer-definitions.md
ai-dev-toolkit/skills/refactor-to-layers/references/provider-patterns.md
ai-dev-toolkit/skills/refactor-to-layers/references/structural-test-templates.md
ai-dev-toolkit/skills/refactor-to-layers/references/tech-stacks.md
```

- [ ] **Step 3: Verify all files are within target line counts**

```bash
wc -l ai-dev-toolkit/skills/refactor-to-layers/SKILL.md ai-dev-toolkit/skills/refactor-to-layers/references/*.md
```

Expected ranges:
- `SKILL.md`: 250-300 lines
- `tech-stacks.md`: 120-150 lines
- `layer-definitions.md`: 60-80 lines
- `structural-test-templates.md`: 120-150 lines
- `provider-patterns.md`: 80-100 lines

- [ ] **Step 4: Verify SKILL.md frontmatter matches plugin conventions**

```bash
head -4 ai-dev-toolkit/skills/refactor-to-layers/SKILL.md
head -4 ai-dev-toolkit/skills/refactor-to-monorepo/SKILL.md
head -4 ai-dev-toolkit/skills/document-for-ai/SKILL.md
```

Expected: All three use identical frontmatter structure (`---`, `name:`, `description:`, `---`).

- [ ] **Step 5: Cross-reference check — verify no broken internal references**

```bash
grep -o 'references/[a-z-]*\.md' ai-dev-toolkit/skills/refactor-to-layers/SKILL.md | sort -u
ls ai-dev-toolkit/skills/refactor-to-layers/references/
```

Expected: Every referenced file exists.

- [ ] **Step 6: Commit**

```bash
git add ai-dev-toolkit/.claude-plugin/plugin.json
git commit -m "feat: update plugin.json for refactor-to-layers skill"
```

- [ ] **Step 7: Final release commit**

```bash
git add -A
git status
git commit -m "feat: add refactor-to-layers skill - architectural layer enforcement with structural tests and provider interfaces"
```

Note: This final commit only captures anything missed by the per-task commits. If `git status` shows nothing to commit, skip this step.
