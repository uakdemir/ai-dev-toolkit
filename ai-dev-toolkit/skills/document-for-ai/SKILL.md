---
name: document-for-ai
description: "Use when the user wants to create, migrate, audit, or maintain AI-optimized documentation, restructure existing docs for AI consumption, generate CLAUDE.md files, create doc indexes, or improve AI agent efficiency through better documentation — even if they don't use the exact skill name."
---

# document-for-ai

Generate, migrate, audit, and maintain AI-optimized documentation for any codebase. Produces structured docs with purpose-specific templates, standardized frontmatter, navigable indexes (AI_INDEX.md), and a CLAUDE.md hierarchy that gives AI agents instant project context.

## Workflow Overview

Execute these steps in order. Each step feeds into the next:

1. **Tech Stack Selection** — determine which file patterns to scan.
2. **Scope Detection** — detect monorepo boundaries and scope work appropriately.
3. **Mode Detection** — determine whether to generate, migrate, audit, or update.
4. **Execute Mode** — run the selected mode's workflow.
5. **Output** — generate CLAUDE.md hierarchy, AI_INDEX.md, and summary report.

Reference files used throughout (do not inline their content — read them at the indicated step):
- `references/tech-stacks.md` — file patterns, monorepo detection, stack conventions
- `references/doc-templates.md` — template structures and mapping rules
- `references/frontmatter-schema.md` — required frontmatter fields and validation
- `references/audit-checklist.md` — scoring dimensions and priority formula

---

## Step 1: Tech Stack Selection

Present these 6 options:

1. Node.js + React
2. Node.js + Vue
3. .NET + React
4. .NET + Vue
5. Python + React
6. Other

**Validation:** After selection (options 1-5), scan the project root for the stack's validation file as defined in `references/tech-stacks.md`. Each stack section lists a **Validation file** entry. If the expected file is missing, warn the user: "Expected {file} for {stack} but did not find it. Continue anyway?"

**If "Other" is selected,** ask these 3 follow-up questions:

1. What is your backend framework?
2. What is your frontend framework (if any)?
3. What package manager do you use?

**Progressive disclosure:** After tech stack selection, read `references/tech-stacks.md` and locate the section matching the selected stack. Use its entry points, route patterns, data model patterns, and config files to guide all subsequent analysis. If "Other" was selected, skip loading tech-stacks.md and rely on the user's answers instead.

---

## Step 1.5: Scope Detection

Detect monorepo structure before proceeding to mode detection.

1. Walk up from CWD looking for workspace config files listed in the General Monorepo Detection section of `references/tech-stacks.md`.
2. Check each detection file type for the selected stack. Also check the General row (rush.json, .moon/workspace.yml, pants.toml).
3. If a monorepo is detected and CWD is inside a package subdirectory, scope all subsequent work to that package only. Generate module-level CLAUDE.md, not root-level.
4. If a monorepo is detected and CWD is at the repo root, ask the user: "Scope to entire monorepo or a specific package?"
5. If no monorepo is detected, skip this step and proceed with the full project.

---

## Step 2: Mode Detection

Scan the docs directory for `.md` files. If no docs directory exists, scan the project root.

**Sampling procedure:**

1. Collect all `.md` files in the scan directory (recursive).
2. If more than 20 files are found, sample 20 evenly distributed across subdirectories.
3. For each sampled file, parse YAML frontmatter and check for both `scope` and `purpose` fields.
4. A doc with both fields present is **AI-optimized**. Generic YAML frontmatter (from Hugo, Docusaurus, Notion exports, etc.) does not qualify — see `references/frontmatter-schema.md` for the detection signal definition.
5. If any sampled doc is AI-optimized, classify the project as having AI-optimized docs.

**Decision table:**

| Condition | Mode | Action |
|-----------|------|--------|
| No docs directory or no `.md` files found | GENERATE | Auto-proceed |
| `.md` files exist but none are AI-optimized | MIGRATE | Auto-proceed |
| At least one AI-optimized doc exists | — | Ask: "Audit existing docs or Update specific areas?" |

**Explicit command overrides:**

- `/document-for-ai humanize [optional-path]` — triggers HUMANIZE mode directly, skipping mode detection.

---

## Mode: GENERATE

1. **Analyze codebase.** Identify entry points, modules, routes, and data models using the patterns from `references/tech-stacks.md` for the selected stack.
2. **Determine needed doc types** using these heuristics:
   - **architecture** — always generate for each discovered module.
   - **api** — generate if endpoint or route files are found matching the stack's route/page patterns.
   - **data-model** — generate if schema, model, or migration files are found matching the stack's data model patterns.
   - **guide** — generate if setup scripts (`Makefile`, `docker-compose.yml`), test configs (`jest.config.*`, `pytest.ini`), or CI configs (`.github/workflows/`, `.gitlab-ci.yml`) are found.
   - **troubleshooting** — generate if error-handling middleware, logging configurations, or known-issues/FAQ files are found.
   > Note: A single matching file is sufficient to trigger generation of that doc type.
3. **Load templates.** Read `references/doc-templates.md` for section structures and `references/frontmatter-schema.md` for required frontmatter fields.
4. **Generate docs.** Create each doc using the matched template. Place files under `docs/{scope}/{purpose}.md`. Populate frontmatter with correct `scope`, `purpose`, `ai_keywords` (3-8 terms), `code_paths`, and `last_verified` set to today.
5. **Generate per-module CLAUDE.md** files in each module directory.
6. **Generate root CLAUDE.md** at the project root.
7. **Generate AI_INDEX.md** at the project root.
8. **Output summary report:** list all files created, modules covered, and any gaps where docs could not be generated.

---

## Mode: MIGRATE

1. **Inventory existing docs.** List all `.md` files. Record each file's path, size, and any existing frontmatter fields.
2. **Map to templates.** Read `references/doc-templates.md` for the Example Mapping table (folder-to-template mapping) and Template Selection Rules (content-based fallback). Apply mapping in this order:
   - Match folder name against the Example Mapping table.
   - If no folder match, analyze file content against Template Selection Rules.
   - If a single doc spans multiple templates, split it into separate files — one per template.
   - If still unclassifiable, place in `docs/unclassified/` and list in migration report. Ask user to manually classify.
3. **Restructure in place.** Rewrite each doc to match its assigned template's section structure. Git history serves as backup — do not create separate backup copies. Non-Markdown files found in docs directories are listed as "unsupported format" in the migration report and not processed.
4. **Fill gaps.** Analyze code to fill missing sections. Generate frontmatter for each doc per `references/frontmatter-schema.md`. Set `last_verified` to today.
5. **Generate CLAUDE.md hierarchy** (root + per-module) and **AI_INDEX.md**.
6. **Output migration report:** files migrated, files split, gaps filled, unsupported files skipped, and any files that could not be classified.

---

## Mode: AUDIT

1. **Check staleness.** For each AI-optimized doc, compare `last_verified` date against git history for the files listed in its `code_paths` field. Flag docs where code has changed since `last_verified`.
2. **Score each doc.** Apply the 3-dimension scoring system from `references/audit-checklist.md`:
   - **Accuracy** (1-5): does the doc match current code?
   - **Completeness** (1-5): are all template sections filled with substantive content?
   - **Format compliance** (1-5): correct frontmatter and correct template structure?
3. **Calculate priority.** Use the priority formula from `references/audit-checklist.md` to rank docs by urgency.
4. **Find orphans and gaps.** Orphaned docs: `code_paths` reference files that no longer exist. Undocumented areas: code modules with no matching doc.
5. **Output audit report** with these sections:
   - Per-doc score table (accuracy, completeness, format, priority score).
   - Overall quality percentage (see formula in `references/audit-checklist.md`).
   - List of orphaned docs with their stale `code_paths`.
   - List of undocumented modules with suggested doc types.
   - Priority-ranked fix list (urgent red > yellow > green).
6. **Offer to fix** issues by category. Prompt: "Want me to fix the issues found? (all / specific items / skip)"
   - **Accuracy** — rewrite sections that contradict current code.
   - **Completeness** — fill empty or stub sections from code analysis.
   - **Format** — correct frontmatter fields and align sections to template structure.

---

## Mode: UPDATE

1. **Identify scope.** Ask the user which area changed. Match their answer against AI_INDEX.md entries by keywords and scope.
2. **Find affected docs** via `code_paths` and `scope` frontmatter fields. Include docs whose `code_paths` overlap with the changed area.
3. **Analyze changes.** Review git commits since the doc's `last_verified` date. If `last_verified` is missing, default to the last 30 days of commits.
4. **Regenerate sections.** Update only the sections affected by code changes. If the doc's accuracy score is <= 2, regenerate the entire doc using its template.
5. **Finalize.** Set `last_verified` to today on all updated docs. Update CLAUDE.md files if changes affect module structure, entry points, or dependencies.

---

## Mode: HUMANIZE

Best-effort rendering for human readers. No quality gate applied.

1. **Determine scope.** If a path argument is provided, humanize that single file. Otherwise, humanize all AI-optimized docs in the project.
2. **Transform content.** Strip YAML frontmatter. Apply these transformation rules:
   - Expand terse, keyword-dense bullet points into readable prose paragraphs.
   - Expand abbreviations and technical shorthand into full terms.
   - Replace frontmatter keyword lists with introductory context sentences.
   - Convert table-format API docs into narrative descriptions with examples.
   - Target reading level: technical professional who hasn't seen the code.
   - Preserve code blocks and examples unchanged.
3. **Insert snapshot header** at the top of each humanized file: `Generated from AI docs on [date] — this is a one-time snapshot, not a source of truth.`
4. **Write output** to `docs/tmp/{original-filename}`. Do not modify the original AI-optimized files.

**Error handling:**

- Non-AI-optimized files — apply best-effort transformation anyway.
- Existing files in `docs/tmp/` — overwrite without prompting.
- Partial failure — report which files failed, continue processing remaining files.

---

## CLAUDE.md Templates

### Root CLAUDE.md

```markdown
# {Project Name}

## Overview
{One-paragraph project description.}

## Tech Stack
{Stack name and key dependencies.}

## Module Map
| Module | Purpose | Path |
|--------|---------|------|
| {module} | {one-line description} | {path} |

## Documentation
{Links to AI_INDEX.md and key docs.}

## Key Commands
{Build, test, lint, deploy commands.}

## Conventions
{Coding standards, naming patterns, branching strategy.}
```

### Per-Module CLAUDE.md

```markdown
# {Module Name}

## Purpose
{What this module does. One paragraph.}

## Key Entry Points
{Main files and their roles.}

## Documentation
{Links to this module's docs by purpose.}

## Dependencies
{Other modules this one depends on.}

## Key Commands
{Module-specific build, test, or run commands.}

## Conventions
{Module-specific patterns, if any differ from root.}
```

### Existing CLAUDE.md Handling

If a CLAUDE.md already exists at the target location:

1. Read the existing file in full.
2. Preserve all existing content exactly as written.
3. Append generated sections under a `## AI-Generated Context` heading at the end of the file.
4. Do not overwrite, reorder, or modify user-authored content.
5. If the existing file already has an `## AI-Generated Context` section, replace only that section.

---

## AI_INDEX.md Format

Generate a lookup table with four columns:

| Doc | Purpose | Keywords | Path |
|-----|---------|----------|------|
| Auth Architecture | architecture | JWT, session, OAuth | docs/auth/architecture.md |
| Auth API | api | login, logout, refresh | docs/auth/api.md |
| Payments Data Model | data-model | Stripe, charges, refunds | docs/payments/data-model.md |

**Monorepo layout:** Group rows under module headers (`## Module: auth`, `## Module: payments`, etc.).

**Single repo layout:** Flat table with no section headers.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No git history available | Skip accuracy checks requiring commit comparison. Warn in report. |
| Unclassifiable doc during migrate | Place in `docs/unclassified/`, ask user to classify. |
| Non-Markdown file in docs directory | List as "unsupported format." Do not process. |
| Large codebase (>100K LOC) | Process one module at a time, report progress per module. |
| Small codebase (<5 files) | Report insufficient code, suggest running later. |
| Unmatched module | List closest matches from AI_INDEX.md, ask for clarification. |
| Conflicting info between code and doc | Flag conflict with both doc's claim and code's reality. Don't auto-fix — present to user. |
| Partial failure during generation | Write all completed docs to disk. Report failures with file paths. Continue with remaining work. |
| Pre-existing CLAUDE.md | Preserve existing content. Append generated sections under `## AI-Generated Context`. |
