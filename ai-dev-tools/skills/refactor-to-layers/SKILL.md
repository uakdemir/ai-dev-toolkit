---
name: refactor-to-layers
description: "Use when the user wants to enforce architectural layers within a module or project, add dependency direction rules, reduce AI agent context through structural boundaries, introduce provider/dependency injection patterns, or generate structural tests that enforce layer compliance — even if they don't use the term 'layers'."
---

<help-text>
refactor-to-layers — Enforce layered architecture within modules

USAGE
  /refactor-to-layers

EXAMPLES
  /refactor-to-layers                Analyze or scaffold layer structure
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

# refactor-to-layers

Analyze a codebase and enforce a layered dependency architecture (Types > Config > Data > Service > Providers > API > UI). Generate structural tests that verify layer compliance and provider interfaces that decouple cross-cutting concerns. Inspired by OpenAI's harness engineering approach.

## Workflow Overview

Execute these steps in order. Each step feeds into the next:

1. **Tech Stack Selection** — determine stack-specific file patterns and layer conventions.
2. **Scope Detection** — detect monorepo boundaries and scope work appropriately.
3. **Existing Layering Detection** — scan for pre-existing layer structures.
4. **Mode Selection** — ANALYZE (existing code) or SCAFFOLD (empty project).
5. **Execute Mode** — run the selected mode's workflow.

Reference files used throughout (do not inline their content — read them at the indicated step):

- `references/tech-stacks.md` — stack-specific file patterns, layer mapping heuristics, monorepo detection
- `references/layer-definitions.md` — canonical layer hierarchy, dependency rules, violation classification
- `references/structural-test-templates.md` — per-stack test templates across 3 enforcement tiers
- `references/provider-patterns.md` — provider interface patterns, composition root conventions, cross-cutting concern detection

If "Other" is selected for tech stack, skip `references/tech-stacks.md` entirely.

---

## Step 1: Tech Stack Selection

Present these 6 options:

1. Node.js + React
2. Node.js + Vue
3. .NET + React
4. .NET + Vue
5. Python + React
6. Other

**Sub-framework prompt:** After selection, ask for the specific sub-framework. The sub-framework affects layer detection heuristics and composition root patterns:

- **Node.js** — "Fastify / Express / NestJS / Other?"
- **.NET** — "MVC Controllers / Minimal APIs / Other?"
- **Python** — "FastAPI / Django / Flask / Other?"

Record the sub-framework selection — it is used in Phase 1 (file classification) and Phase 3 (test template selection, composition root detection).

**Validation:** After selection (options 1-5), scan the project root for the stack's validation file as defined in `references/tech-stacks.md`. If the expected file is missing, warn: "Expected {file} for {stack} but did not find it. Continue anyway?"

**If "Other" is selected,** ask these 5 follow-up questions:

1. What is your backend language and framework?
2. What is your frontend framework (if any)?
3. What is your DI/IoC mechanism (if any)?
4. What test runner do you use? (e.g., pytest, JUnit, go test)
5. What build system do you use? (e.g., Bazel, Gradle, Make)

**Progressive disclosure:** After tech stack selection, read `references/tech-stacks.md` and locate the matching stack section. If "Other" was selected, skip loading tech-stacks.md and rely on the user's answers instead.

---

## Step 2: Scope Detection

Detect monorepo structure before proceeding to mode selection.

1. Walk up from CWD looking for workspace config files listed in the General Monorepo Detection section of `references/tech-stacks.md`.
2. Check each detection file type for the selected stack. Also check the General row (rush.json, .moon/workspace.yml, pants.toml).

| Condition | Behavior |
|-----------|----------|
| Single repo (no workspace config) | Process entire project as one unit. |
| Monorepo, CWD inside a package | Default to that package. Ask: "Apply to `packages/[name]/` or the whole monorepo?" Generate per-package artifacts. |
| Monorepo, CWD at repo root | Ask: "Scope to entire monorepo or a specific package?" If entire monorepo, process each package independently and generate per-package artifacts. |

If no monorepo is detected, skip this step and proceed with the full project.

---

## Step 3: Existing Layering Detection

Scan the project for pre-existing layer structures:

1. Folders matching canonical layer names (types, config, data, services, providers, api, ui).
2. Existing structural tests (files matching `*layer*`, `*arch*`, `*boundary*` in test directories).
3. ESLint/lint configs with import restriction rules.

| Finding | State | Action |
|---------|-------|--------|
| No layer folders, no structural tests | No layering | Proceed — full analysis needed. |
| Some layer folders or partial naming | Partial layering | Note existing structure, build on it. |
| Layer folders + structural tests + lint rules | Strong layering | Report findings, ask: "Audit existing layers or restructure?" |

If `docs/layer-architecture/strategy.md` and `tests/structural/.layer-allowlist.json` exist from a previous run, import the allowlist entries. Present: "Found previous layer strategy. Use as baseline?" If used as baseline, present only new violations separately in Phase 2.

---

## Step 4: Mode Selection

| Condition | Mode |
|-----------|------|
| Source files exist (matching stack's file patterns) | ANALYZE |
| Zero source files (empty project) | SCAFFOLD |

---

## ANALYZE Mode

Four phases. Phases 2 and 4 are user checkpoints — wait for approval before proceeding.

### Phase 1: Discovery

Read `references/layer-definitions.md` for the canonical layer hierarchy and dependency direction rules.

No user checkpoint in this phase — all findings are presented together in Phase 2.

Single-pass analysis with three sub-steps:

**Step 1.1: Structure Scan**

Classify every source file into a layer using heuristics from `references/tech-stacks.md`:

- Match files against the stack's folder patterns and naming conventions.
- Each file maps to exactly one layer or is marked "unclassified."
- Produce a draft file-to-layer table: columns `File Path`, `Assigned Layer`, `Confidence`.
- Files that cannot be classified are flagged for user resolution in Phase 2.

**Step 1.2: Dependency Direction Analysis**

Trace imports for every classified file:

- Build a layer-to-layer import matrix (rows import from columns).
- Flag violations where a lower layer imports from a higher layer per the rules in `references/layer-definitions.md`.
- For each violation, record: source file, target file, source layer, target layer, violated rule.
- Count total violations and group by violation type (upward import, circular, skip-layer).

**Step 1.3: Cross-Cutting Concern Inventory**

Scan for auth, logging, telemetry, config access, and error handling patterns:

- Threshold: a concern qualifies as cross-cutting when it appears in 3+ files across 2+ layers.
- Read the "Cross-Cutting Concern Detection" section of `references/provider-patterns.md` for detection heuristics.
- For each identified concern, record: concern name, affected files, affected layers, current implementation pattern.

### Phase 2: Layer Proposal (User Checkpoint)

Present findings to the user:

1. **Proposed layer map** — each layer with its assigned files and file counts.
2. **Dependency violations** — each violation with source file, target file, and violated rule.
3. **Provider candidates** — cross-cutting concerns that should become provider interfaces.
4. **Layer adjustments** — suggest additions, removals, or renames based on the codebase.
5. **Unclassified files** — ALL unclassified files must be classified or excluded before Phase 3.

Checkpoint prompt: "Review the proposed layer map above. You can: approve, modify layer assignments, add/remove layers, exclude files, or reject entirely."

**Propagation rules for approved changes:**
- Added layer — insert into hierarchy per `references/layer-definitions.md` adjacency rules.
- Removed layer — redistribute files to adjacent layers.
- Renamed layer — update all references in generated artifacts.
- Modified dependency direction — regenerate violation list.

**Full rejection:** If the user rejects the proposal entirely, ask what layering model they prefer and restart Phase 1 with their constraints.

### Phase 3: Scaffolding

Generate artifacts after Phase 2 approval. Create the `docs/layer-architecture/` directory if it does not exist.

1. **Strategy spec** — write to `docs/layer-architecture/strategy.md`. Contents:
   - Layer hierarchy with dependency direction rules.
   - File-to-layer mapping (the approved map from Phase 2).
   - Violation allowlist (any intentional violations approved by the user).
   - Provider interface inventory.
   - In monorepo mode, generate one strategy spec per package.

2. **Structural tests** — read `references/structural-test-templates.md`. Generate tests across 3 tiers:
   - Tier 1: import direction enforcement (no upward imports).
   - Tier 2: boundary enforcement (no skip-layer imports unless allowed).
   - Tier 3: provider compliance (cross-cutting concerns use provider interfaces).
   - Use the template matching the selected stack and sub-framework.

3. **Provider interfaces** — read `references/provider-patterns.md`. Generate provider interfaces for each identified cross-cutting concern. Apply the synthesis rules from the reference file.

4. **Composition root** — detect the project's composition root using heuristics from `references/tech-stacks.md`. Exempt it from layer restrictions. The composition root is the only file allowed to import from all layers.

### Phase 4: Review (User Checkpoint)

1. **Human summary** — write to `docs/tmp/layer-summary.md` with header: `Generated from layer analysis on [date] — this is a one-time review document, not a source of truth.`
   - Plain-language explanation of the proposed layer architecture.
   - Mermaid diagram showing layers and allowed dependency directions.
   - Violation highlights with before/after examples.
   - Provider interfaces explained in context ("instead of importing JWT verification directly, your Service layer receives an `IAuthProvider`").
   - List of all generated files and what each does.
2. Checkpoint prompt: "I've generated the layer architecture spec, structural tests, and provider interfaces. Review the summary at `docs/tmp/layer-summary.md`. Want to adjust anything before finalizing?"
3. **Recommended next steps** (printed to user, not written to a file):
   - Run the structural tests to see current violation count.
   - Consider running `/refactor-to-layers` on other modules.
   - After restructuring, run `/document-for-ai` to generate docs for the new layer structure.

---

## SCAFFOLD Mode

For empty projects with zero source files:

1. **Gather requirements.** Ask: "What are the main concerns of this project?" (e.g., "user auth, billing, notifications"). Use the canonical layer hierarchy by default.
2. **Read references.** Load `references/structural-test-templates.md` and `references/provider-patterns.md` for the selected stack.
3. **Generate artifacts:**
   - Folder structure matching the canonical layer hierarchy from `references/layer-definitions.md`.
   - Barrel/index files for each layer (e.g., `index.ts`, `__init__.py`).
   - Composition root stub (`src/app.ts`, `Program.cs`, or `src/main.py`) with DI wiring comment. Pre-populate the strategy spec's `composition_root` field. Structural tests exempt this file.
   - Structural tests (all 3 tiers, using templates from `references/structural-test-templates.md`).
   - Provider skeleton interfaces for each user-specified concern (from `references/provider-patterns.md`).
   - Strategy spec at `docs/layer-architecture/strategy.md`.
4. **No human summary needed** — the generated folder structure is self-documenting.
5. Present the generated file list and suggest next steps: implement business logic within the scaffolded layers.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| >50% files unclassified | Warn user. Ask for manual classification hints before proceeding. |
| Dynamic imports detected | Flag as "not statically analyzable." Mark affected violations as estimates. |
| >50K LOC | Process one top-level directory at a time during discovery. Build dependency matrix incrementally. Report progress. |
| <5 source files | Suggest SCAFFOLD mode instead. Proceed if user insists. |
| No cross-cutting concerns found | Skip provider generation. Note in strategy spec. |
| Existing structural test conflicts | Present conflicts. Ask user to keep existing, replace, or merge. |
| Fastify route + logic bundled | Flag files as mixed API/Service. Suggest extraction in violation report. |
| .NET minimal APIs | Map endpoint lambdas to API layer. Flag inline logic for Service extraction. |
| Shared packages in monorepo | Classify shared packages using the same layer rules. Flag cross-package violations separately. |
| Intentional violations | Allow user to add to allowlist in strategy spec. Exclude from test failures. |
| Empty project detected mid-analysis | Switch to SCAFFOLD mode automatically. |
| Partial failure | Complete all possible phases. Note failures in strategy spec under a Limitations section. |

---

## Progressive Disclosure Schedule

Load reference files only when needed to minimize context window usage:

| Phase | Load | Section |
|-------|------|---------|
| After tech stack selection | `references/tech-stacks.md` | Relevant stack section only |
| Phase 1 Discovery | `references/layer-definitions.md` | Full file |
| Phase 3 Scaffolding | `references/structural-test-templates.md` | Relevant stack + tier |
| Phase 3 Scaffolding | `references/provider-patterns.md` | Relevant stack section |

**Exception:** If "Other" was selected for tech stack, skip `references/tech-stacks.md` entirely. Derive patterns from the user's follow-up answers.
