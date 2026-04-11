# AI Dev Toolkit — Design Specification

**Date:** 2026-03-25
**Status:** Draft
**Scope:** Two reusable Claude Code skills for AI-optimized documentation and monorepo refactoring strategy

---

## 1. Overview

The `ai-dev-toolkit` plugin provides two independent, reusable skills:

1. **`document-for-ai`** — Generate, migrate, audit, and maintain AI-optimized documentation for any codebase
2. **`refactor-to-monorepo`** — Analyze a monolith and produce a comprehensive monorepo refactoring strategy

Both skills are tech-stack configurable (defaulting to Node.js + React), produce structured artifacts, and are designed to work on any project — not tied to a specific codebase.

### 1.1 Problem Statement

AI agents waste significant context and time navigating undocumented or poorly-structured codebases. Common problems:

- **Discovery:** The AI doesn't know documentation exists or when to read it, wasting tokens exploring
- **Format:** Docs written for humans (prose-heavy, inconsistent structure) are inefficient for AI parsing
- **Staleness:** Docs drift from code, causing the AI to act on wrong information
- **Navigation:** No index or entry point, so the AI reads everything or reads nothing
- **Codebase size:** As projects grow past ~15K LOC, AI agents lose effectiveness because they can't hold the full context — modular separation with clean boundaries restores efficiency

### 1.2 Success Criteria

**document-for-ai:**
- GENERATE mode produces docs that pass AUDIT mode with >= 80% quality score on a fresh codebase
- Every generated doc has valid frontmatter matching the schema
- AI_INDEX.md is auto-generated and complete (no docs missing from the index)
- Per-module CLAUDE.md files are generated for monorepo projects
- Mode detection correctly identifies project state (no docs / non-AI docs / AI-optimized docs) without false positives

**refactor-to-monorepo:**
- All four analysis phases (domain, data, dependency, synthesis) produce concrete findings, not generic advice
- Synthesis phase produces specific conflict flags and resolution recommendations for every contested table and circular dependency
- The migration plan is ordered by coupling score (lowest-coupling module extracted first)
- Every proposed module has a complete spec sheet (all fields in the module template filled)
- Output artifacts are self-contained — readable without re-running the skill

### 1.3 Scope Boundaries

**What these skills DO:**
- `document-for-ai`: Analyze code and existing docs, generate/restructure AI-optimized documentation, maintain doc freshness, generate CLAUDE.md hierarchy
- `refactor-to-monorepo`: Analyze a monolith and produce strategy documents, module specs, dependency analysis, tooling recommendations, and a migration action plan

**What these skills DO NOT do:**
- `document-for-ai` does NOT generate user-facing product documentation or API docs for external consumers. It generates docs for AI agent consumption.
- `refactor-to-monorepo` does NOT execute code changes. The migration plan describes what to do, but moving files, updating imports, and restructuring code is done separately (manually or via a plan/execution cycle). The output is documents only.
- Neither skill modifies CI/CD pipelines, deployment configurations, or infrastructure.

### 1.4 Implementation Phasing

The two skills are independent and can be built, tested, and shipped separately. Recommended order:

1. **Phase 1:** Build `document-for-ai` (more broadly useful, no dependency on the other skill)
2. **Phase 2:** Build `refactor-to-monorepo` (can reference document-for-ai patterns but doesn't depend on it)

---

## 2. Plugin Structure

```
ai-dev-toolkit/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   ├── document-for-ai/
│   │   ├── SKILL.md                    # ~250-300 lines: workflow, modes, orchestration
│   │   └── references/
│   │       ├── tech-stacks.md          # per-stack: file patterns to scan, conventions
│   │       ├── doc-templates.md        # the 5 purpose templates with section structures
│   │       ├── frontmatter-schema.md   # frontmatter spec + field descriptions
│   │       └── audit-checklist.md      # quality scoring: accuracy, completeness, format
│   │
│   └── refactor-to-monorepo/
│       ├── SKILL.md                    # ~250-300 lines: workflow, analysis pipeline
│       └── references/
│           ├── tech-stacks.md          # per-stack: monorepo tooling, config patterns
│           ├── analysis-framework.md   # domain→data→dependency methodology + scoring
│           ├── module-spec-template.md # per-module spec sheet template
│           └── migration-patterns.md   # conflict resolution patterns, pitfalls, rollback
```

### plugin.json

Located at `.claude-plugin/plugin.json` (following Claude Code plugin conventions):

```json
{
  "name": "ai-dev-toolkit",
  "version": "1.0.0",
  "description": "AI-optimized documentation generation and monorepo refactoring strategy",
  "author": {
    "name": "ai-dev-toolkit"
  }
}
```

Skills are auto-discovered from the `skills/` directory structure — no explicit `"skills"` array needed.

### SKILL.md Frontmatter

Both skills use the standard two-field frontmatter. Descriptions follow the "Use when..." pattern and do not summarize the workflow:

**document-for-ai:**
```yaml
---
name: document-for-ai
description: "Use when the user wants to create, migrate, audit, or maintain AI-optimized documentation, restructure existing docs for AI consumption, generate CLAUDE.md files, create doc indexes, or improve AI agent efficiency through better documentation — even if they don't use the exact skill name."
---
```

**refactor-to-monorepo:**
```yaml
---
name: refactor-to-monorepo
description: "Use when the user wants to split a monolith into modules, identify module boundaries, analyze code coupling, plan a monorepo migration, evaluate monorepo tooling, or reduce codebase size for better AI agent efficiency — even if they don't explicitly say monorepo."
---
```

### SKILL.md Content Boundaries

Each SKILL.md contains the workflow orchestration. Reference files contain the detailed specifications.

**document-for-ai SKILL.md contains:**
- Frontmatter
- Overview (what this skill does)
- Tech stack selection flow
- Mode detection logic (the decision table)
- Mode behavior steps (concise — what to do, not the detailed templates)
- Progressive disclosure instructions (when to read which reference)
- Error handling principles
- Interactive prompt definitions

**document-for-ai reference files contain:**
- `tech-stacks.md` — per-stack file patterns, entry points, conventions (extract from Section 6.1; target ~80-100 lines)
- `doc-templates.md` — the 5 purpose templates with full section structures, plus the category mapping table from Section 3.6 for MIGRATE mode (extract from Sections 3.5 + 3.6; target ~100-120 lines)
- `frontmatter-schema.md` — frontmatter field definitions, validation rules, examples (extract from Section 3.4; target ~40-60 lines)
- `audit-checklist.md` — scoring methodology, scales, thresholds, priority formula (extract from Section 3.11; target ~60-80 lines)

**refactor-to-monorepo SKILL.md contains:**
- Frontmatter
- Overview
- Tech stack selection flow
- Analysis pipeline phases (concise steps + user checkpoints)
- Output artifact list (what's generated, not the full templates)
- Progressive disclosure instructions
- Error handling principles

**refactor-to-monorepo reference files contain:**
- `tech-stacks.md` — per-stack monorepo tooling, config scaffolding, detection heuristics, monorepo detection files (extract from Sections 4.3, 4.5, 6.1; target ~100-120 lines)
- `analysis-framework.md` — domain/data/dependency methodology, coupling score formula + thresholds, conflict taxonomy (extract from Sections 4.2, 4.6, 4.7; target ~120-150 lines)
- `module-spec-template.md` — per-module spec sheet template with field descriptions (extract from Section 4.3 artifact 4; target ~40-60 lines)
- `migration-patterns.md` — contested table patterns, circular dependency patterns, common pitfalls, rollback strategies (extract from Section 4.7; target ~80-100 lines)

### Progressive Disclosure

SKILL.md files target ~250-300 lines (guideline, not hard limit; Anthropic recommends under 500 lines for optimal performance). References are loaded on-demand. Reference files use clear `## Stack: Node.js + React` level-2 headers so the AI can locate the relevant section after loading:

**document-for-ai:**
- After tech stack selection → read `references/tech-stacks.md` (only the relevant stack section)
- Before generating/migrating docs → read `references/doc-templates.md` and `references/frontmatter-schema.md`
- During audit mode → read `references/audit-checklist.md`

**refactor-to-monorepo:**
- After tech stack selection → read `references/tech-stacks.md` (only the relevant stack section)
- During Phases 1-3 (analysis) → read `references/analysis-framework.md`
- During Phase 4 and artifact generation → read `references/module-spec-template.md` and `references/migration-patterns.md`

The AI never loads all references at once. **If the user selected "Other" tech stack:** skip loading `tech-stacks.md` and use the follow-up answers to determine file patterns, conventions, and tooling instead.

---

## 3. Skill 1: `document-for-ai`

### 3.1 Invocation Flow

**Step 1 — Tech Stack Selection:**

The skill asks upfront:
> What's your tech stack?
> 1. Node.js + React (default)
> 2. Node.js + Vue
> 3. .NET + React
> 4. .NET + Vue
> 5. Python + React
> 6. Other (specify)

**Validation:** After selection, scan for expected config files (`package.json` for Node.js, `.csproj`/`.sln` for .NET, `pyproject.toml` for Python). If not found, warn: "Expected [file] not found for [stack]. Is this the right tech stack?" before proceeding.

**Step 1.5 — Scope Detection (monorepo only):**

Check if the current working directory is inside a monorepo package (using Section 4.5 heuristics). To determine if CWD is inside a package: walk up from CWD looking for a package manifest (`package.json` for Node.js, `.csproj` for .NET, `pyproject.toml` for Python) that is listed as a workspace member in the root workspace config. If found before reaching the workspace root, CWD is inside that package — scope all operations to it. If at monorepo root, ask: "Work on the entire monorepo or a specific package?" If a specific package, ask which one. If not a monorepo, skip this step.

**Step 2 — Automatic Mode Detection:**

A doc is considered "AI-optimized" if its frontmatter contains both `scope` and `purpose` fields matching the schema defined in `references/frontmatter-schema.md`. Generic YAML frontmatter (from Hugo, Docusaurus, Notion exports, etc.) does not qualify. **Sampling strategy:** Check up to 20 `.md` files. If any have both `scope` and `purpose` frontmatter, treat the project as having AI-optimized docs. If none do, proceed with MIGRATE.

| Project State | Detected Mode | Behavior |
|---|---|---|
| No docs directory exists, or docs/ exists but contains no `.md` files | **GENERATE** | Auto-proceed, no question asked |
| Docs exist, none have AI-optimized frontmatter | **MIGRATE** | Auto-proceed with explanation |
| AI-optimized docs exist (scope + purpose fields) | **Ask user** | "Audit (check quality/staleness) or Update (specific area changed)?" |

**Explicit commands (always available, bypass auto-detection):**
- `/document-for-ai humanize` — render all AI docs to `docs/tmp/` for human reading
- `/document-for-ai humanize docs/path/to/file.md` — humanize a single file only

### 3.2 Auto-Detected Mode Behaviors

#### GENERATE Mode
1. Analyze codebase structure (entry points, modules, routes, data models, key patterns)
2. Determine which doc types are needed using these heuristics:
   - **Always generate:** `architecture` (every module/project needs this)
   - **Generate `api`** if: public endpoints, exported interfaces, or route handlers found
   - **Generate `data-model`** if: database models, schemas, migrations, or ORM configs found
   - **Generate `guide`** if: setup scripts, testing configs, deployment configs, or build tooling found
   - **Generate `troubleshooting`** if: error-handling patterns, logging infrastructure, or existing error documentation found
   - Use the file patterns from `references/tech-stacks.md` (loaded in Step 1) to scan for these indicators. A single matching file is sufficient to trigger generation of that doc type.
3. Generate docs using the purpose-specific templates
4. Generate per-module CLAUDE.md files (see Section 3.9)
5. Generate root CLAUDE.md with master index (see Section 3.9)
6. Generate AI_INDEX.md (see Section 3.8)
7. Output a summary report: what was generated, what gaps remain

#### MIGRATE Mode
1. Inventory existing docs — catalog every file, its location, approximate topic
2. Map existing content to the template system — analyze each file's content to determine which purpose/template it best fits (see Section 3.6 for example mappings). If a single source doc maps to multiple templates (e.g., a security doc covering both architecture and procedures), split it into separate docs — one per purpose.
3. Restructure: rewrite each doc into the AI-optimized format, preserving valuable content. Original docs are overwritten in place — the user should commit before running MIGRATE so git history serves as the backup. The migration report includes an original→new file mapping for verification.
4. Identify gaps — what the existing docs don't cover but the code requires
5. Fill gaps by analyzing code
6. Generate CLAUDE.md hierarchy (see Section 3.9)
7. Generate AI_INDEX.md (see Section 3.8)
8. Output a migration report: what was preserved, what was restructured, what was generated new

#### AUDIT Mode
1. For each doc: compare `last_verified` date against git history for the files listed in `code_paths` frontmatter
2. Score each doc on three dimensions using the methodology in `references/audit-checklist.md` (see Section 3.11 for scoring system)
3. Identify orphaned docs (docs covering code that no longer exists)
4. Identify undocumented areas (code with no corresponding docs)
5. Output an audit report with prioritized fixes
6. Ask user: "Want me to fix the issues found? (all / specific items / skip)"
   - **Accuracy fixes:** re-analyze `code_paths` and rewrite sections that contradict current code
   - **Completeness fixes:** analyze code to fill empty/stub template sections
   - **Format fixes:** add missing frontmatter fields, restructure to match the correct template

#### UPDATE Mode
1. Ask: "Which area/module changed?"
2. If user's description doesn't match a known module scope, list the closest matches from AI_INDEX.md and ask for clarification
3. Find affected docs by matching the user's area against `code_paths` and `scope` frontmatter fields, using AI_INDEX.md as a lookup table
4. Analyze git commits since the doc's `last_verified` date for the files listed in `code_paths`. If `last_verified` is missing, analyze the last 30 days.
5. Compare changes against the existing doc content
6. Update affected docs: re-analyze code in `code_paths` and regenerate sections with changed content. Preserve sections that remain accurate. If the doc's accuracy score drops to 2 or below (significantly outdated per the audit checklist), regenerate the entire doc using the appropriate template.
7. Update `last_verified` timestamps
8. Update CLAUDE.md files if module structure changed

### 3.3 Explicit Command: HUMANIZE

HUMANIZE is not an auto-detected mode — it's an explicit command that bypasses mode detection. It is a best-effort rendering utility with no formal quality gate — output should contain no YAML frontmatter and no bare keyword lists.

**Behavior:**
1. If a specific file path is provided → humanize only that file
2. If no path → humanize all AI-optimized docs
3. Strip frontmatter
4. Apply transformation rules:
   - Replace bullet-point lists of terse facts with connected paragraphs
   - Expand abbreviations and technical shorthand
   - Replace frontmatter keyword lists with introductory context sentences
   - Convert table-format API docs into narrative descriptions with examples
   - Target reading level: technical professional who hasn't seen the code
5. Add header: "Generated from AI docs on [date] — this is a one-time snapshot, not a source of truth"
6. Write to `docs/tmp/` mirroring the original folder structure (overwrite existing files silently)

**HUMANIZE error handling:**
- Target file has no AI-optimized frontmatter → attempt best-effort humanization (strip any YAML frontmatter, improve readability), note in output that the file was not AI-optimized
- `docs/tmp/` already has content from a previous run → overwrite silently (these are disposable snapshots)
- Batch mode partial failure → report which files failed and continue with the rest

### 3.4 Frontmatter Schema

Every AI-optimized doc gets:

```yaml
---
scope: auth                    # module/area this covers
purpose: architecture          # which template was used
ai_keywords: [JWT, session, OAuth, middleware]  # quick-scan terms for AI discovery
dependencies: [shared, database]               # related modules/areas
last_verified: 2026-03-25     # last checked against code
code_paths: [src/auth/, src/middleware/auth.ts] # which code this doc describes
---
```

**Field definitions:**
- `scope` (required): Module or area name. Must match a module name used consistently across docs.
- `purpose` (required): One of: `architecture`, `api`, `data-model`, `guide`, `troubleshooting`. Determines which template was used.
- `ai_keywords` (required): 3-8 terms for fast AI discovery. Should include key technologies, concepts, and domain terms.
- `dependencies` (optional): Other modules/areas this doc's subject depends on.
- `last_verified` (required): ISO date when this doc was last verified against the code it describes.
- `code_paths` (required): File paths or directories this doc covers. Used by UPDATE mode to find affected docs.

The combination of `scope` + `purpose` fields is the detection signal for AI-optimized docs (see Section 3.1).

### 3.5 Purpose-Specific Templates (5 total)

These templates are the canonical content for `references/doc-templates.md`.

#### 1. `architecture` — How a module/system is structured
```
## Overview          — what this module does, in 2-3 sentences
## Components        — key files/classes and their roles
## Data Flow         — how data moves through the module
## Key Decisions     — why it's built this way (not just what)
## Constraints       — known limitations, performance bounds
## Integration Points — how this module connects to others
```

#### 2. `api` — Endpoints, interfaces, contracts
```
## Overview          — what this API surface covers
## Endpoints/Exports — each endpoint/function with signature, params, returns
## Authentication    — how auth works for this API (if applicable)
## Error Handling    — error codes/types and what they mean
## Examples          — request/response examples
```

#### 3. `data-model` — Database tables, schemas, relationships
```
## Overview          — what data this module owns
## Tables/Collections — each table with columns, types, constraints
## Relationships     — foreign keys, joins, references across modules
## Indexes           — performance-critical indexes and why they exist
## Migrations        — notable migration history, current state
```

#### 4. `guide` — How to do something
```
## Goal              — what you'll accomplish
## Prerequisites     — what must be true before starting
## Steps             — numbered, precise steps
## Verification      — how to confirm it worked
## Troubleshooting   — common failures and fixes
```

#### 5. `troubleshooting` — Known issues, debugging paths
```
## Symptoms          — what the problem looks like
## Diagnosis         — how to identify root cause
## Solutions         — fix for each root cause
## Prevention        — how to avoid recurrence
```

### 3.6 Existing Doc Category Mapping (Example)

This is an example mapping based on a common documentation taxonomy. For projects with different folder names, the skill analyzes each file's content to determine the best template fit rather than relying on folder names alone.

| Example folder | Maps to |
|---|---|
| `architecture` | `architecture` template |
| `engineering` | `architecture` or `guide` depending on content |
| `explanation` | absorbed into `Key Decisions` sections of `architecture` docs |
| `how-to` | `guide` template |
| `reference` | `api` template |
| `testing` | `guide` template (testing guides) |
| `troubleshooting` | `troubleshooting` template |
| `tutorials` | `guide` template |
| `guides` | `guide` template |
| `security` | `architecture` (security architecture) + `guide` (security procedures) |
| `operations` | `guide` (ops procedures) + `troubleshooting` (ops incidents) |
| `ux` | `architecture` (UX patterns/decisions) |
| `non_functional` | absorbed into `Constraints` sections |
| `project_management` | not AI-relevant, archived or left as-is |
| `prompts` | kept as-is (prompt files, not documentation) |
| `superpowers` | kept as-is (specs from brainstorming sessions) |

**Fallback for unrecognized folders:** Analyze a sample of files in each folder, classify content by topic (architecture decisions, API references, how-to guides, troubleshooting), and map to the closest template.

### 3.7 Output Folder Structure

The docs structure depends on project shape:

**Monorepo (each module self-contained):**

Root `docs/` contains only cross-module orchestration docs — never module-specific content.

```
monorepo/
├── CLAUDE.md                      # root — module map, navigation
├── docs/                          # cross-module ONLY
│   ├── AI_INDEX.md                # cross-module index
│   ├── architecture.md            # system-wide architecture
│   ├── data-flow.md               # cross-module data flows
│   └── troubleshooting.md         # system-wide issues
├── packages/
│   ├── auth/
│   │   ├── CLAUDE.md              # module AI entry point
│   │   ├── docs/
│   │   │   ├── architecture.md
│   │   │   ├── api.md
│   │   │   ├── data-model.md
│   │   │   └── troubleshooting.md
│   │   └── src/
│   └── shared/
│       ├── CLAUDE.md
│       ├── docs/
│       │   ├── architecture.md
│       │   └── api.md
│       └── src/
└── docs/tmp/                      # humanized versions (gitignored)
```

**Single repo (traditional structure):**
```
project/
├── CLAUDE.md                      # root AI entry point
├── docs/
│   ├── AI_INDEX.md                # master index
│   ├── architecture.md
│   ├── api.md
│   ├── data-model.md
│   ├── guides/
│   │   ├── setup.md
│   │   └── testing.md
│   ├── troubleshooting.md
│   └── tmp/                       # humanized versions (gitignored)
└── src/
```

The skill auto-detects project shape using the monorepo detection heuristics in Section 4.5.

**Key principle:** In a monorepo, an AI session inside `packages/auth/` should never need to leave that folder (except to read `packages/shared/` for contracts). Its CLAUDE.md and docs/ have everything it needs.

### 3.8 AI_INDEX.md Format

The `AI_INDEX.md` serves as a lookup table for AI navigation. Format:

```markdown
# AI Documentation Index

## Module: auth
| Doc | Purpose | Keywords | Path |
|-----|---------|----------|------|
| architecture | architecture | JWT, session, OAuth, middleware | packages/auth/docs/architecture.md |
| api | api | login, logout, refresh, register | packages/auth/docs/api.md |
| data-model | data-model | users, sessions, tokens | packages/auth/docs/data-model.md |

## Module: billing
| Doc | Purpose | Keywords | Path |
|-----|---------|----------|------|
| architecture | architecture | invoices, subscriptions, payments | packages/billing/docs/architecture.md |
```

**Single-repo format** (no module headers):

```markdown
# AI Documentation Index

| Doc | Purpose | Keywords | Path |
|-----|---------|----------|------|
| architecture | architecture | Express, middleware, routing | docs/architecture.md |
| api | api | REST, endpoints, auth | docs/api.md |
| data-model | data-model | PostgreSQL, users, orders | docs/data-model.md |
| setup guide | guide | install, configure, env | docs/guides/setup.md |
```

This is auto-generated from frontmatter across all docs. The AI reads this once to know which doc to open for any topic — no need to scan every file.

**Monorepo note:** AI_INDEX.md is a root-level artifact for cross-module navigation. Per-module CLAUDE.md files have direct links to their own docs, so an AI working within a single module does not need to consult the root index.

### 3.9 CLAUDE.md Templates

**Root CLAUDE.md (monorepo or single repo):**
```markdown
# [Project Name]

## Overview
[2-3 sentence project description]

## Tech Stack
[Framework, language, database, key libraries]

## Module Map
| Module | Purpose | Path |
|--------|---------|------|
| auth | User authentication and sessions | packages/auth/ |
| billing | Payments and subscriptions | packages/billing/ |
| shared | Common types, utils, contracts | packages/shared/ |

## Documentation
- Full doc index: [docs/AI_INDEX.md](docs/AI_INDEX.md)
- System architecture: [docs/architecture.md](docs/architecture.md)

## Key Commands
[build, test, lint commands]

## Conventions
[naming, file organization, patterns specific to this project]
```

**Per-module CLAUDE.md (monorepo only):**
```markdown
# [Module Name]

## Purpose
[Single sentence: what this module does]

## Key Entry Points
[Main files/classes an AI should start with]

## Documentation
[Links to this module's docs/ files]

## Dependencies
- Shared contracts: [path to shared package]
- [Other module dependencies]

## Key Commands
[Module-specific build/test/lint commands]

## Conventions
[Module-specific patterns, if any differ from root]
```

**Relationship to AI_INDEX.md:** CLAUDE.md is the AI's first-read entry point — it provides orientation and key commands. AI_INDEX.md is the lookup table for finding specific docs by topic. CLAUDE.md links to AI_INDEX.md. They are complementary, not redundant.

**Existing CLAUDE.md handling:** If the project already has a CLAUDE.md, the skill preserves its existing content and appends/merges the generated sections rather than overwriting.

### 3.10 "Other" Tech Stack Handling

When the user selects "Other (specify)," the skill asks follow-up questions:
1. "What's your backend framework?" (e.g., Go, Rust, Java/Spring)
2. "What's your frontend framework?" (e.g., Angular, Svelte, none)
3. "What's your package/dependency manager?" (e.g., cargo, gradle, mix)

The skill then adapts: file patterns to scan, conventions to follow, and doc sections are inferred from the answers. No reference file fallback — the skill uses its general knowledge of the specified stack.

### 3.11 Audit Scoring System

This scoring methodology is the canonical content for `references/audit-checklist.md`.

Each doc is scored on three dimensions (1-5 scale):

| Score | Accuracy | Completeness | Format Compliance |
|-------|----------|--------------|-------------------|
| 5 | Matches code exactly | All template sections filled with substantive content | Correct frontmatter + correct template |
| 4 | Minor drift, still correct | All key sections filled, some thin | Correct frontmatter, minor template deviation |
| 3 | Mostly correct, some outdated info | Key sections present, some missing | Has frontmatter, missing some fields |
| 2 | Significantly outdated | Stub sections, major gaps | Partial frontmatter, wrong template |
| 1 | Contradicts current code | Missing entirely or empty | No frontmatter |

**Priority score** = (5 - accuracy) x 3 + (5 - completeness) x 2 + (5 - format) x 1

Higher priority score = more urgent fix needed. Maximum possible: 24 (worst). Minimum: 0 (perfect).

**Thresholds:**
- Priority 0-6: Healthy (green) — aligns with docs scoring 4+ on each dimension (80%+ quality)
- Priority 7-12: Needs attention (yellow)
- Priority 13+: Urgent fix (red)

**Overall quality score** = average of all doc scores across all three dimensions, as a percentage of the maximum (15). A project passes the quality bar at >= 80% (average score >= 12/15 across all docs).

### 3.12 Error Handling

| Scenario | Fallback Behavior |
|---|---|
| No git history available | Skip staleness checking in AUDIT mode. Score accuracy by comparing doc content to current code only. Note "no git history" in the audit report. |
| Docs can't be classified to a template | During MIGRATE, place unclassifiable docs in a `docs/unclassified/` folder and list them in the migration report. Ask user to manually classify them. |
| Non-Markdown docs (.rst, .txt, .adoc, .html) | MIGRATE processes `.md` files only. Non-Markdown doc files are listed in the migration report as "unsupported format — manual conversion needed" and left as-is. |
| Very large codebase (>100K LOC) | In GENERATE mode, process one module at a time rather than the full codebase. Report progress per module. |
| Very small codebase (< 5 source files) | Report that the project has insufficient code for meaningful documentation generation. Suggest running after initial development progresses. |
| User's area description doesn't match a module | In UPDATE mode, list the closest matches from AI_INDEX.md and ask for clarification. |
| AUDIT finds conflicting information | Flag the conflict in the report with both the doc's claim and the code's reality. Don't auto-fix conflicts — present them to the user. |
| Partial failure (some modules succeed, others don't) | Proceed with what's possible. Include a "gaps" section in the output report listing what couldn't be analyzed and why. Never silently skip a module. |
| Pre-existing CLAUDE.md | Preserve existing content. Merge generated sections rather than overwrite. |

---

## 4. Skill 2: `refactor-to-monorepo`

### 4.1 Invocation Flow

**Step 1 — Tech Stack Selection** (same preset list as document-for-ai, see Section 3.1)

**Step 2 — Analysis Pipeline** (4 phases, with user checkpoints)

### 4.2 Analysis Pipeline

#### Phase 1: Domain Analysis
- Scan routes/pages/features to identify user-facing domains
- Analyze folder structure for existing logical groupings
- Examine naming patterns (files/folders/classes named `auth*`, `billing*`, etc.)
- **User checkpoint:** Confirm/correct identified domains before proceeding: *"I found these domain boundaries: [list]. Does this match your mental model? Any to merge/split/add?"*

#### Phase 2: Data Ownership Analysis
- For each identified domain, trace which database tables/models it uses
- Build a table ownership matrix: which domain reads/writes which tables
- Flag **contested tables** — tables accessed by multiple domains
- Flag **orphaned tables** — tables with no clear domain owner
- Present findings to user

#### Phase 3: Dependency Graph Analysis

Static analysis approach per tech stack (the AI reads code directly — no external tooling required):
- **Node.js/TypeScript:** Scan for `import`/`require` statements, resolve paths relative to tsconfig paths and package.json
- **.NET:** Primary signal: `<ProjectReference>` elements in `.csproj` files (reliable project-to-project mapping). Secondary: `using` directives matched to other projects in the solution by naming convention (e.g., `using MyApp.Auth` → Auth project). Ignore framework/NuGet namespaces.
- **Python:** Scan for `import`/`from...import` statements, resolve against project structure

For each proposed module boundary:
- Count internal imports (within module) vs. cross-module imports
- Calculate a **coupling score** per module pair (see Section 4.6)
- Identify **circular dependencies** that would block separation
- Identify code that should move to `shared/` (imported by 3+ modules)
- Present findings to user

#### Phase 4: Synthesis & Conflict Resolution
- Overlay all three analysis views
- Where they agree → clean module boundary, high confidence
- Where they disagree → flag as problem area with specific explanation
- Propose resolutions using the conflict resolution patterns in `references/migration-patterns.md` (see Section 4.7)
- **User checkpoint:** Review full analysis before generating strategy artifacts

### 4.3 Output Artifacts

All artifacts saved to `docs/monorepo-strategy/`:

#### 1. `strategy.md` — Master Document
```
## Executive Summary        — what we're splitting, why, expected outcome
## Current State Analysis    — codebase stats (LOC, files, modules, coupling scores)
## Proposed Module Map       — each module with responsibility, owned files, owned tables
## Shared Library Design     — what goes into shared/, why, contracts/interfaces
## Conflict Resolution       — contested tables, circular deps, how to resolve each
## Migration Order           — which module to extract first and why (lowest coupling first)
## Risk Assessment           — what's hardest, what might break, rollback strategies
```

#### 2. `module-map.md` — Visual Overview
- Mermaid diagram of modules and their relationships
- Per-module table: owned files, owned tables, exported interfaces, dependencies
- Color-coded by coupling score: green (0-20%, clean seam), yellow (21-50%, some entanglement), red (51%+, heavily coupled)

#### 3. `dependency-matrix.md` — Raw Data
- Full import/require graph as module-to-module matrix
- Per-module coupling scores with formula breakdown
- Circular dependency list with file paths
- Candidates for `shared/` with usage counts

#### 4. Per-module specs — `modules/<name>.md`
```
## Responsibility           — what this module does (single sentence)
## Owned Files              — current file paths that belong here
## Owned Database Tables    — tables this module is sole owner of
## Shared Table Access      — tables it reads but doesn't own (via contracts)
## Exported Interface       — what other modules can call/import from this one
## Dependencies             — what this module needs from others
## Extraction Steps         — specific steps to pull this module out
## Estimated Complexity     — simple / moderate / complex, with reasoning
```

#### 5. `monorepo-tooling.md` — Tooling Recommendation

Stack-specific recommendations:

| Stack | Recommended Tool | Why |
|---|---|---|
| Node.js + React/Vue | pnpm workspaces + turborepo | Fast, native, good DX |
| .NET + React/Vue | .NET solution + project references | Native multi-project support |
| Python + anything | uv workspaces (primary) or hatch workspaces | Most mature native Python workspace support |

Includes: config file scaffolding, shared tsconfig/eslint setup, CI/CD considerations.

#### 6. `migration-plan.md` — Action Plan
```
## Phase 0: Preparation
  - Set up monorepo tooling
  - Create shared/ package with contracts
  - Set up build pipeline

## Phase 1: Extract [lowest-coupling module]
  - Move files
  - Update imports
  - Verify tests pass
  - Deploy and validate

## Phase 2: Extract [next module]
  ...

## Phase N: Decommission monolith
  - Remove empty shell
  - Update CI/CD
  - Final validation
```

Each phase has a "the app keeps working" checkpoint — no big-bang migration.

Note: This plan describes *what to do*, not execution. Actual file moves and import updates are done separately via a plan/execution cycle.

### 4.4 "Other" Tech Stack Handling

When the user selects "Other (specify)" for the monorepo skill, the follow-up questions are tailored to monorepo-specific needs. The monorepo skill asks 5 questions (vs. 3 for document-for-ai) because it additionally needs to understand build tooling and workspace structure to make tooling recommendations:

1. "What's your backend language/framework?" (e.g., Go, Rust, Java/Spring, Elixir/Phoenix)
2. "What's your frontend framework?" (e.g., Angular, Svelte, none)
3. "What's your build system?" (e.g., Bazel, Make, Gradle, Cargo)
4. "How are dependencies managed?" (e.g., go.mod, Cargo.toml, build.gradle)
5. "Do you have an existing multi-project or workspace structure?" (e.g., Go workspaces, Cargo workspaces)

The skill uses these answers to determine: which monorepo tooling to recommend, how to analyze the dependency graph, and what workspace configuration to suggest.

### 4.5 Monorepo Detection Heuristics (per tech stack)

Used by both skills to detect whether a project is already a monorepo:

| Stack | Detection Files |
|---|---|
| Node.js | `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, or `package.json` with `"workspaces"` field |
| .NET | `.sln` file with multiple `.csproj` references, or `Directory.Build.props` |
| Python | `pyproject.toml` with `[tool.uv.workspace]` or workspace members, `uv.toml` with `[workspace]` section |
| Go | `go.work` file |
| Rust | `Cargo.toml` with `[workspace]` section |
| General | `rush.json`, `.moon/workspace.yml`, `pants.toml` |

**Note:** These heuristics are used by both skills. The `document-for-ai` skill's `references/tech-stacks.md` should include this table so it can detect monorepo structure during Skill 1 implementation (which is built first per Section 1.4).

### 4.6 Coupling Score

**Module-level coupling:** Measures how much of a module's import surface reaches outside its boundary.

**Formula:** `coupling_score = total_cross_module_imports / (internal_imports + total_cross_module_imports) * 100`

Where:
- `total_cross_module_imports` = total number of import statements in module A that reference files in ANY other module (excluding shared/)
- `internal_imports` = number of import statements in module A that reference files within module A

**Counting rule:** Count each `import`/`require` statement as one import, regardless of how many symbols it imports. Barrel file re-exports (`export * from`) count as a single import at the consuming side.

**Per-pair breakdown:** After calculating the module-level score, break down `total_cross_module_imports` by target module to show which pairs are most entangled. This is reported in the dependency matrix (artifact 3) as a module-to-module table.

**Thresholds (module-level):**
- 0-20%: Low coupling (green) — clean seam, safe to extract
- 21-50%: Moderate coupling (yellow) — some entanglement, needs interface design
- 51%+: High coupling (red) — heavily coupled, requires significant refactoring before extraction

**Edge case:** If a module has zero total imports (internal + cross-module), its coupling score is 0% (no coupling by definition).

**Note:** Imports to `shared/` are excluded from coupling calculations since shared is expected to be used by all modules.

### 4.7 Conflict Resolution Patterns

This content is the canonical source for `references/migration-patterns.md`.

**Contested Table Patterns:**

| Pattern | When to Use | Example |
|---|---|---|
| **Single owner + API contract** | One domain writes, others read. Clear primary owner. | `users` table owned by auth; billing reads via `auth.getUserSubscriptionStatus()` |
| **Split table with sync** | Both domains write different columns. No clear owner. | Split `orders` into `billing_orders` + `fulfillment_orders`, sync via events |
| **Shared table with column ownership** | Table is genuinely shared but columns map to domains. | `products` table: billing owns `price`/`tax_rate`, catalog owns `name`/`description` |
| **Promote to shared service** | 3+ domains need read/write access. Core entity. | `users` table becomes a shared service with well-defined API |

**Circular Dependency Patterns:**

| Pattern | Resolution |
|---|---|
| A imports B, B imports A | Extract shared interface to `shared/`, both depend on shared |
| A→B→C→A cycle | Identify the weakest link (fewest imports), break it with an event or callback |
| Tight mutual coupling | Modules may actually be one module — consider merging |

**Default recommendation:** When in doubt, prefer "single owner + API contract" — it's the simplest, most reversible option.

### 4.8 Error Handling

| Scenario | Fallback Behavior |
|---|---|
| Dynamic imports / dependency injection | Flag as "not statically analyzable" in the dependency matrix. Note which files use dynamic loading. Coupling scores are marked as "lower bound" (actual coupling may be higher). |
| ORM with dynamic queries (can't trace table ownership) | Ask user to identify table ownership manually for affected tables. Provide the list of tables and the domains that reference the ORM config. |
| No clear domain boundaries | If Phase 1 finds fewer than 2 identifiable domains, report the finding and suggest the codebase may not be ready for monorepo extraction. Ask user if they want to proceed with a file-clustering approach instead. |
| Very large codebase (>100K LOC) | Process the dependency graph in chunks. Report progress. Flag if analysis takes more than expected. |
| No database / no tables | Skip Phase 2 entirely. Proceed with domain + dependency analysis only. Note "no data layer detected" in the strategy document. |
| Partial failure | Proceed with completed analysis phases. Include a "limitations" section in strategy.md listing what couldn't be analyzed and why. |

---

## 5. Skill Relationship

### 5.1 Independence

The two skills are independent but complementary. Typical usage flow:

1. Run `/refactor-to-monorepo` → get the module map and migration plan
2. Execute the migration (manually or via a plan/execution cycle)
3. Run `/document-for-ai` inside each new module → generate per-module docs

Either skill can be used standalone. `document-for-ai` works on any project shape — monorepo or single repo.

### 5.2 Monorepo Detection

When `document-for-ai` detects it's inside a monorepo package (using the heuristics in Section 4.5 — checking for parent workspace config files), it scopes its work to that module and generates module-level CLAUDE.md accordingly.

---

## 6. Tech Stack Configurability

Both skills ask for tech stack at invocation via presets:

1. Node.js + React (default)
2. Node.js + Vue
3. .NET + React
4. .NET + Vue
5. Python + React
6. Other (specify)

The selection determines:
- **document-for-ai:** which file patterns to scan, which conventions to follow, framework-specific doc sections
- **refactor-to-monorepo:** which dependency analysis approach to use, which monorepo tooling to recommend, framework-specific migration patterns

### 6.1 Tech-Stacks Reference Schema

Each skill's `references/tech-stacks.md` is organized by stack with these fields:

**For document-for-ai tech-stacks.md:**

| Field | Description | Example (Node.js + React) |
|---|---|---|
| Entry point patterns | Files that serve as application entry points | `src/index.ts`, `src/main.tsx`, `src/app.ts` |
| Route/page patterns | Files defining routes or pages | `src/pages/**`, `src/routes/**`, `*Router.ts` |
| Data model patterns | Files defining database models | `*.entity.ts`, `*.model.ts`, `prisma/schema.prisma` |
| Config files | Key configuration files | `tsconfig.json`, `package.json`, `.env.example` |
| Dependency manifest | Package/dependency files | `package.json`, `pnpm-lock.yaml` |
| Conventions | Framework-specific patterns to document | React component patterns, API route conventions |

**For refactor-to-monorepo tech-stacks.md:**

| Field | Description | Example (Node.js + React) |
|---|---|---|
| Import analysis | How to trace dependencies | Scan `import`/`require`, resolve via tsconfig paths |
| Monorepo tool | Recommended workspace tool | pnpm workspaces + turborepo |
| Config scaffolding | Key config files to generate | `pnpm-workspace.yaml`, `turbo.json`, shared `tsconfig.base.json` |
| Workspace detection | Files indicating existing monorepo | `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json` |
| Migration patterns | Stack-specific extraction notes | Update `tsconfig.json` paths, configure `exports` in package.json |

---

## 7. Design Decisions & Rationale

| Decision | Rationale |
|---|---|
| Docs organized by module, not doc type | Each module is self-contained for AI efficiency; matches monorepo structure |
| 5 templates (not more) | Covers 90%+ of doc needs; more would add complexity without value |
| Frontmatter with `ai_keywords` | Enables fast AI discovery without reading full doc content |
| `scope` + `purpose` as AI-optimization signal | Distinguishes AI-optimized docs from generic YAML frontmatter (Hugo, Docusaurus, etc.) |
| Single source of truth (no human copies) | Eliminates sync burden; humanize is a one-time render |
| Hybrid analysis (domain→data→dependency) | Each lens alone misses issues; combined catches conflicts |
| Reference files per skill (some duplication) | Skills stay independent; tech-stack info diverges between doc-gen and monorepo-tooling |
| Auto-detect mode with ask fallback | Reduces friction for obvious cases; asks only when choice is ambiguous |
| Per-module CLAUDE.md | AI lands in the right context immediately when working inside a module |
| Plugin uses .claude-plugin/plugin.json | Matches Claude Code plugin convention; skills auto-discovered from skills/ directory |
| HUMANIZE as explicit command, not auto-detected mode | It's a utility action, not a project-state-dependent workflow |
| Coupling score excludes shared/ imports | shared/ is expected to be used by all modules; including it would inflate scores |
| Documents only (no code execution) for monorepo skill | Strategy and analysis are high-value; actual migration is a separate concern with its own risks |
