---
name: document-for-ai
description: "Use when the user wants to create, migrate, audit, or maintain AI-optimized documentation, restructure existing docs for AI consumption, generate CLAUDE.md files, create doc indexes, or improve AI agent efficiency through better documentation — even if they don't use the exact skill name."
---

<help-text>
document-for-ai — Generate AI-optimized documentation

USAGE
  /document-for-ai [command] [path]

PARAMETERS
  humanize [path]    Render AI docs for human readers
  adr <spec_path>    Extract architectural decisions from spec

EXAMPLES
  /document-for-ai                   Generate CLAUDE.md and AI_INDEX.md
  /document-for-ai humanize          Render docs for humans
  /document-for-ai adr docs/spec.md  Extract ADRs from spec
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

# document-for-ai

Generate, migrate, audit, and maintain AI-optimized documentation for any codebase. Produces structured docs with purpose-specific templates, standardized frontmatter, navigable indexes (AI_INDEX.md), and a CLAUDE.md hierarchy that gives AI agents instant project context.

## Workflow Overview

Execute these steps in order. Each step feeds into the next:

1. **Tech Stack Selection** — determine which file patterns to scan.
2. **Scope Detection** — detect monorepo boundaries and scope work appropriately.
3. **Volatility Assessment** — classify each subsystem as L1 or L2 based on git churn history.
4. **Mode Detection** — determine whether to generate, migrate, audit, or update.
5. **Execute Mode** — run the selected mode's workflow (GENERATE uses two-phase scan architecture).
6. **Output** — generate CLAUDE.md hierarchy, AI_INDEX.md, and summary report.

Reference files used throughout (do not inline their content — read them at the indicated step):
- `references/tech-stacks.md` — file patterns, monorepo detection, stack conventions
- `references/doc-templates.md` — template structures and mapping rules
- `references/frontmatter-schema.md` — required frontmatter fields and validation
- `references/volatility-assessment.md` — churn-rate algorithm, edge cases, git commands
- `references/phase2-triggers.md` — Phase 2 trigger detection logic and template mapping
- `references/signature-patterns.md` — grep-based signature extraction patterns (TS, Python, Go, Rust)
- `references/audit-checklist.md` — scoring dimensions and priority formula
- `references/adr-extraction.md` — ADR extraction algorithm (used by the `adr` command)

---

## L1 / L2 / L3 Documentation Framework

The depth framework governs how much detail each generated doc contains. Depth is assigned per subsystem based on volatility (see Step 1.7: Volatility Assessment).

| Level | What it captures | Cost | Churn resistance | Best for |
|---|---|---|---|---|
| **L1: Structural index** | Exported symbols, signatures, one-line purposes, cross-cutting patterns, file/dir map | Low (20–40% of L2) | High — survives refactors that don't rename files/symbols | Volatile subsystems, internal scaffolding |
| **L2: Architecture** | Data flow, key decisions, integration points, constraints, ADR cross-refs | Medium | Medium — survives refactors that don't change topology | Stable modules, public API contracts, schema |
| **L3: Implementation detail** | Method-by-method logic, edge cases, invariants | High | Low — breaks on most refactors | **NOT auto-generated.** Stays in source comments + git blame. |

**Key principle:** L1 is not "shallow L2." It is a fundamentally different artifact. L1 gives a bug-fixer a precise map of the subsystem without teaching them how the code works. That trade-off is correct for high-churn code because architectural narrative goes stale faster than symbol indexes do.

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

## Step 1.7: Volatility Assessment

For each detected subsystem, classify its documentation depth (L1 or L2) based on git churn history. Read `references/volatility-assessment.md` for the full algorithm and edge cases.

**Quick summary:**
1. **Existing-doc pre-check:** if an existing doc has a `depth` field → preserve existing depth (skip classification). Override with `--force-reclassify`.
2. **Zero-history guard:** 0 total commits → default to L2.
3. **Thin-history guard:** < 20 total commits → default to L2.
4. **Compute churn_rate:**
   ```
   churn_rate = commits_90d / total_commits_ever
   > 0.40        → L1
   0.15 – 0.40   → L2
   < 0.15        → L2 (with deeper data-flow sections)
   ```
5. **L1 → L2 promotion:** requires explicit user request. Automatic downgrade does not happen.

Set `depth`, `volatility`, `volatility_measured`, and `churn_rate` in the generated doc's frontmatter (see `references/frontmatter-schema.md`).

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
- `/document-for-ai adr {spec_path}` — extracts architectural decisions from the spec as ADR documents. Bypasses the standard workflow (Steps 1-4) and follows the extraction algorithm in `references/adr-extraction.md`. See the ADR Extraction section below.

---

## Mode: GENERATE

Generation uses a two-phase scan architecture. Phase 1 extracts structural data cheaply. Phase 2 performs targeted deep reads only when specific triggers fire. The depth assigned by Step 1.7 (L1 or L2) determines which template sections are generated.

### Structural extractor selection

The skill exposes a pluggable `structural_extractor` interface. At skill invocation, select the backend:

1. **SerenaExtractor** (preferred) — probe for Serena MCP: call `mcp.list_tools()`. Serena is available if ANY of these tool names appears: `get_symbols_overview`, `find_symbol`, `find_referencing_symbols` (OR check — any one match suffices). If the call fails, returns empty, or none match, Serena is unavailable.
2. **TscDeclarationExtractor** — for TS projects when `tsc` is available in PATH and `tsconfig.json` exists in scope.
3. **GrepExtractor** — fallback for any language. Uses patterns from `references/signature-patterns.md`.

Override with `--extractor <serena|tsc|grep>`.

**Failure modes:**
- Serena available but fails partway → fall through to next backend for remaining files, log the switch.
- Grep fallback has false negatives → the Open Questions section documents any file the extractor couldn't parse (`// parser-unknown: <reason>`).
- All backends fail or return zero symbols → abort doc generation for this subsystem, log to `AI_INDEX.md` with extraction-failed row format (see AI_INDEX.md Format section).

### Phase 1 — Cheap structural extraction (always runs)

- Extract exported symbols and their signatures per file.
- Extract one-line purpose from the nearest JSDoc/docstring or inferred from the signature + file name.
- Build import graph (what imports what, which symbols are used where).
- Count files, LoC (excluding test files: `**/*.test.*`, `**/__tests__/**`, `**/*.spec.*`), public-vs-internal ratio.
- Compute the L1 symbol index and the internal dependency graph.
- Record `last_verified_symbol_count` (total exported symbols found).

**Token cap:** Phase 1 budgets ≤ 50k combined I/O tokens per subsystem of ≤ 50 files. If exceeded, split the subsystem by directory depth: partition files into subdirectory groups (one group per immediate child directory of the subsystem root). Each group becomes a sub-subsystem named `<subsystem>/<child-dir>` with `partial: true` in frontmatter and a cross-reference note. **Flat-subsystem fallback:** if no subdirectories exist, split files alphabetically into 2 groups. If a group still exceeds the cap, recursively split in half until every group fits. Name groups `<subsystem>/part-1`, `<subsystem>/part-2`, etc.

### Phase 2 — Targeted deep reads (trigger-driven)

Phase 2 only runs when a trigger is detected by Phase 1. See `references/phase2-triggers.md` for trigger detection logic and template mapping.

**Token cap:** Phase 2 budgets ≤ 30k combined I/O tokens per subsystem. Enforcement is soft: if a trigger's evidence-gathering exceeds this, write the section with a `// budget exceeded — see source` footer (do not skip the section entirely).

### Generation pipeline

1. **Run Phase 1** with the selected extractor on each subsystem.
2. **Run Phase 2** on each subsystem where triggers fired.
3. **Load templates.** Read `references/doc-templates.md` for the appropriate depth template (L1 or L2) and `references/frontmatter-schema.md` for required frontmatter fields.
4. **Generate docs.** Create each doc using the depth-appropriate template. Output path: `<package-root>/docs/ai/<subsystem-name>.md`. Populate frontmatter with `scope`, `subsystem`, `purpose`, `depth`, `volatility`, `volatility_measured`, `churn_rate`, `code_paths`, `ai_keywords` (from Phase 1 symbol names), `last_verified` (today), `last_verified_symbol_count`, and `regenerate_if`.
5. **Generate per-module CLAUDE.md** files. Generated content is appended under `<!-- document-for-ai:generated-start -->` / `<!-- document-for-ai:generated-end -->` markers. On first generation, append the marker pair at end of file. On subsequent runs, replace everything between the markers. User-authored content above the start marker is preserved byte-for-byte.
6. **Generate root CLAUDE.md** at the project root (same marker-based append).
7. **Generate AI_INDEX.md** at the project root.
8. **Output summary report:** list all files created, subsystems covered, depth assigned to each, and any gaps where docs could not be generated.

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

### AUDIT: ADR Extension

ADR files are scored on the same 3 dimensions (Accuracy, Completeness, Format compliance) as other docs, plus one ADR-specific check:

**Status validity:** An ADR marked `Accepted` whose `code_paths` show contradicting patterns gets flagged as "potential drift or supersession." The follow-up prompt must distinguish:
- **Implementation drift** — code diverged from the decision (fix the code or update the ADR)
- **True supersession** — a newer decision replaced this one (archive the old ADR)

Do not change status or archive without this distinction.

**ADR field validation:** When `purpose: adr`, treat `status` and `spec_source` as required fields. Missing either = format compliance score of 1 for that doc.

---

## Mode: UPDATE

1. **Identify scope.** Ask the user which area changed. Match their answer against AI_INDEX.md entries by keywords and scope.
2. **Find affected docs** via `code_paths` and `scope` frontmatter fields. Include docs whose `code_paths` overlap with the changed area.
3. **Analyze changes.** Review git commits since the doc's `last_verified` date. If `last_verified` is missing, default to the last 30 days of commits.
4. **Regenerate sections.** Update only the sections affected by code changes. If the doc's accuracy score is <= 2, regenerate the entire doc using its template.
5. **Finalize.** Set `last_verified` to today on all updated docs. Update CLAUDE.md files if changes affect module structure, entry points, or dependencies.

### UPDATE: ADR Extension

When UPDATE mode encounters ADR files (`purpose: adr` in frontmatter), apply these additional checks:

**Decision-code drift detection:**
1. Read the ADR's `code_paths` files.
2. Analyze git commits since `last_verified`.
3. Flag as potential drift if:
   - A dependency or technology named in the Decision section was removed or replaced.
   - New code introduces patterns that contradict the Decision section. **Calibration:** Flag `SessionRepo.saveToPostgres()` when ADR says "Use Redis." Do NOT flag unrelated utility functions in the same directory.
   - Files in `code_paths` were deleted or moved.
4. Present specific commit hashes and diff hunks as evidence.

**Spec-ADR drift detection:**
If the spec at `spec_source` has been modified since `last_verified`, flag as potential spec-ADR drift. Present to user for review.

**Resolution:**
- If code matches decision: update `last_verified`, no changes needed.
- If code or spec contradicts decision: flag as conflict, do NOT auto-fix. Present: "ADR {NNNN} says '{decision}' but code at {path} shows '{reality}'. Update the ADR (decision changed) or flag as code drift?"

ADRs are decisions, not descriptions. Auto-fixing would silently change architectural intent.

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

## ADR Extraction

Triggered by `/document-for-ai adr {spec_path}`. This is an explicit command override — it bypasses mode detection and the standard workflow entirely.

**Algorithm:** Read and follow `references/adr-extraction.md`. That file contains the complete extraction algorithm: candidate scanning, scoring, filtering, deduplication, file writing, index updates, and error handling.

**File locations:**
- Individual ADRs: `docs/architecture/adrs/NNNN-{title}.md`
- Index: `docs/architecture/adrs.md`
- Archive: `docs/architecture/adrs/archive/NNNN-{title}.md`

**AI_INDEX.md integration:** ADR entries appear like any other doc:

| Doc | Purpose | Keywords | Path |
|-----|---------|----------|------|
| Redis session storage | adr | Redis, sessions, encryption, auth | docs/architecture/adrs/0001-redis-encrypted-session-storage.md |

---

## ADR Status Lifecycle

```
Proposed → Accepted → Superseded | Deprecated
```

- **Proposed:** Decision not yet confirmed. Reserved for manually created ADRs. Create file following the `adr` template and frontmatter schema, set `status: Proposed`, place in `docs/architecture/adrs/`. Transition to Accepted by changing the frontmatter `status` field after team review.
- **Accepted:** Active constraint. Enforced by review-code.
- **Superseded:** Replaced by a newer ADR. The superseding ADR's body references the old one. Moved to `archive/`.
- **Deprecated:** No longer relevant (module removed, technology abandoned). Moved to `archive/`.

### Archival

Status transitions to Superseded/Deprecated are user-confirmed actions. When UPDATE mode flags decision-code drift or AUDIT flags "potentially superseded," the user is presented with the option. Archival steps execute only after user confirmation.

When an ADR status changes to Superseded or Deprecated:
1. Move file from `docs/architecture/adrs/NNNN-{title}.md` to `docs/architecture/adrs/archive/NNNN-{title}.md`
2. Update `docs/architecture/adrs.md` index (remove from active table)
3. Update AI_INDEX.md (remove entry)
4. review-code never reads `archive/`

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
2. Preserve all existing content above the generated marker exactly as written.
3. On first generation: append `<!-- document-for-ai:generated-start -->`, generated content, and `<!-- document-for-ai:generated-end -->` at the end of the file.
4. On subsequent runs: find `<!-- document-for-ai:generated-start -->` and replace everything between the start and end markers with new generated content.
5. Do not overwrite, reorder, or modify user-authored content outside the markers.

**Legacy migration:** If the existing file has an `## AI-Generated Context` heading (pre-rewrite format), replace it with the HTML comment markers on the first regeneration run.

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
| Pre-existing CLAUDE.md | Preserve existing content. Append/replace between `<!-- document-for-ai:generated-start/end -->` markers. |
