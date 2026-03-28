# Consolidate Learn Phase — Design Specification

**Date:** 2026-03-28
**Status:** Approved
**Scope:** Add a learning extraction phase to the consolidate skill that accumulates best practices from projects into technology-specific canonical configs and rationale files

---

## 1. Overview

The consolidate skill currently unifies AI configs and linting rules **within** a monorepo. This update adds a **Learn phase** that runs automatically after consolidation, comparing the unified root-level configs against accumulated learnings stored in the plugin's skill folder, organized by technology.

> **Naming note:** The existing SKILL.md numbers phases 1-4 per subcommand. Internally, `ai-apply.md` and `lint-apply.md` label their sub-steps as "Phase 4+5+6" — these are sub-phases of SKILL.md's Phase 4, not separate SKILL.md-level phases. The learn phase uses an unnumbered label in SKILL.md: **"Learn Phase"** (not "Phase 5") to avoid any collision with the prompt-internal numbering. The mapping is: SKILL.md Phase 1-4 → prompt-internal phases; prompt-internal "Phase 5+6" are sub-steps of SKILL.md Phase 4; SKILL.md "Learn Phase" is a separate top-level phase that follows Phase 4.

### 1.1 Problem Statement

Configuration knowledge is project-local. When you configure ESLint well in Project A or write a thorough CLAUDE.md in Project B, those learnings stay trapped in those projects. New projects start from scratch, and there's no mechanism to accumulate and reuse best practices across projects.

### 1.2 Goals

- Extract configuration learnings from projects automatically after consolidation
- Organize learnings by technology (react, typescript, python, dotnet, nodejs-fastify, common-ai)
- Preserve rationale for why each rule/setting exists
- Produce a human-readable report + proposed files without modifying the plugin folder directly
- Enable a future scaffold skill to consume these learnings for new project setup

### 1.3 Scope Boundaries

**In scope:**
- Automatic learn phase after every consolidation run
- Technology detection from root-level config files
- Diff against existing learnings, report generation, proposed file output
- Learnings folder structure within the consolidate skill directory

**Out of scope:**
- Scaffold skill (future — will consume learnings but is a separate design)
- Auto-committing or auto-applying learnings to the plugin folder
- Modifying existing consolidation phases 1-4

---

## 2. Learnings Folder Structure

Located at `ai-dev-tools/skills/consolidate/learnings/`:

```
learnings/
├── react/
│   ├── configs/          # canonical config files (.eslintrc.json, tsconfig.json, etc.)
│   └── learnings.md      # rule-level insights with rationale and source project
├── typescript/
│   ├── configs/
│   └── learnings.md
├── nodejs-fastify/
│   ├── configs/
│   └── learnings.md
├── dotnet/
│   ├── configs/
│   └── learnings.md
├── python/
│   ├── configs/
│   └── learnings.md
└── common-ai/
    ├── configs/          # CLAUDE.md, .claude/settings.json, .codex/config.toml, .mcp.json, .serena/*.yml
    └── learnings.md
```

- Buckets are created on first encounter, not pre-populated
- `configs/` holds assembled "best known" canonical config files, preserving their relative path from the project root (e.g., `configs/CLAUDE.md`, `configs/.claude/settings.json`, `configs/.serena/default.yml`, `configs/.eslintrc.json`)
- `learnings.md` holds per-rule rationale entries with source project name and date
- `common-ai/` is always checked regardless of tech stack (every project has AI configs)

---

## 3. Technology Detection Mapping

A new reference file `references/tech-buckets.md` holds the mapping. This is a **runtime-read reference** — `learn-discover.md` instructs the AI to read this file using the Read tool. Its contents must include: (1) the detection mapping table below, (2) the key rules bullet list (multi-bucket matching, common-ai always included, root-only detection, React detection specifics), (3) the scope filtering table from Section 3.1, and (4) the complete config-to-bucket assignment rules from Section 3.2 (including JS/TS priority ordering and the `.prettierrc.*`/`tsconfig.json` following rules). It is the single authoritative source for technology detection logic.

| Config file(s) at root | Technology bucket |
|---|---|
| `.eslintrc.*` / `eslint.config.*` / `.prettierrc.*` + `tsconfig.json` + React indicators (`next.config.*`, `vite.config.*`, `package.json` with `react` in `dependencies` or `devDependencies`) | `react` |
| `.eslintrc.*` / `eslint.config.*` / `.prettierrc.*` + `tsconfig.json` / `tsconfig.base.json` (no React indicators) | `typescript` |
| `tsconfig.json` + Fastify indicators (`package.json` with `fastify` dep) | `nodejs-fastify` |
| `.editorconfig`, `*.sln`, `*.csproj`, `.globalconfig`, `Directory.Build.props` | `dotnet` |
| `ruff.toml` / `pyproject.toml` (with ruff/mypy config), `mypy.ini` | `python` |
Key rules:
- A project can match **multiple buckets** (e.g., React + Fastify monorepo → `react`, `nodejs-fastify`, `common-ai`)
- **`common-ai` is always included** — it is not part of the detection table. Every project gets a `common-ai` comparison for AI config files (`CLAUDE.md`, `.claude/settings.json`, `.codex/config.toml`, `.mcp.json`, `.serena/*.yml`). These AI config files are not used for technology bucket detection — they are always assigned to `common-ai` regardless of content
- Detection reads root-level files only (not subpackages)
- The mapping table is the single place to extend when adding new stacks
- **React detection specifics:** check root `package.json` for `react` in `dependencies` or `devDependencies`. For Vite, check file existence only (do not parse config contents). Root-only detection is by design since this runs on post-consolidation root configs.

### 3.1 Scope Filtering

The learn phase receives a scope value that controls which config files and buckets it examines:

| Scope | Config files scanned | Eligible buckets |
|---|---|---|
| `ai` | `CLAUDE.md`, `.claude/settings.json`, `.codex/config.toml`, `.mcp.json`, `.serena/*.yml` | `common-ai` only |
| `lint` | `.eslintrc.*`, `eslint.config.*`, `tsconfig.json`, `tsconfig.base.json`, `.prettierrc.*`, `.editorconfig`, `ruff.toml`, `pyproject.toml`, `mypy.ini`, `.globalconfig`, `Directory.Build.props` (plus `*.sln`, `*.csproj` for dotnet bucket detection only — not compared against learnings) | Tech-specific buckets only (`react`, `typescript`, `nodejs-fastify`, `dotnet`, `python`) |
| `both` | All of the above | All buckets (`common-ai` + tech-specific) |

Detection indicator files (`package.json`, `next.config.*`, `vite.config.*`) are always read for bucket detection regardless of scope. The scope table controls which config files are *compared against learnings*, not which files are read for detection.

### 3.2 Config-to-Bucket Assignment

Each config file is assigned to **exactly one bucket**:

- **AI config files** (`CLAUDE.md`, `.claude/settings.json`, `.codex/config.toml`, `.mcp.json`, `.serena/*.yml`) → always `common-ai`
- **Lint/tool config files** → assigned to their natural bucket. Tool-specific configs always go to their natural bucket regardless of other detected buckets (e.g., `ruff.toml` → `python`, `.editorconfig` → `dotnet`). For configs shared across JS/TS stacks (`.eslintrc.*`, `eslint.config.*`, `.prettierrc.*`, `tsconfig.json`), the priority when multiple JS/TS buckets match is: `react` > `nodejs-fastify` > `typescript` (most specific wins)
- `.prettierrc.*` follows the same bucket as `.eslintrc.*`. If `.prettierrc.*` exists without any `.eslintrc.*`/`eslint.config.*`, assign it to the highest-priority detected JS/TS bucket, or `common-ai` if no JS/TS bucket is detected
- `tsconfig.json` and `tsconfig.base.json` follow the same bucket as `.eslintrc.*` (or `nodejs-fastify` if Fastify detected without React)

---

## 4. Learn Phase Flow

The learn phase runs automatically after consolidation completes. Two new prompt files execute sequentially:

### 4.1 `prompts/learn-discover.md` — Discovery + Diff

1. **Determine scope** — the SKILL.md integration text for each subcommand explicitly states the scope value (`ai`, `lint`, or `both`) when invoking this phase. See Section 3.1 for which config files and buckets each scope enables.
2. **Resolve skill path** — determine the plugin's skill directory from the location of SKILL.md (the directory containing the SKILL.md file that was read to invoke this skill). Read `./learnings/` relative to that directory.
3. **Resolve source project name** — use the `name` field from root `package.json` if it exists, otherwise use `basename` of the working directory. This name is used in learnings entries.
4. **Read root-level configs only** — no subpackage scanning. Only read config files eligible for the current scope (Section 3.1).
5. **Read `references/tech-buckets.md`** and use its mapping table to detect which technology buckets match the root-level config files found in step 4. Only detect buckets eligible for the current scope.
6. **Assign each discovered config file to exactly one bucket** using the rules in Section 3.2. For shared JS/TS configs, apply the priority: `react` > `nodejs-fastify` > `typescript`. Each config file appears in exactly one bucket's diff.
7. **For each matched bucket:**
   - Check if `learnings/<bucket>/` exists in the skill folder
   - If exists: perform a **2-way diff** (project root config vs learnings canonical config — not an N-way diff across projects). Apply the same granularity as existing consolidation phases — section-level (`##`) for Markdown files (using the same section-matching algorithm from `ai-diff.md`: normalize headers, exact match, suffix stripping), key-path-level for JSON, key-level for TOML/YAML. The comparison topology differs from `ai-diff.md`/`lint-analyze.md` (which compare the same config across multiple projects), but the parsing and granularity techniques are reused. The prompt file must instruct the agent to read `prompts/ai-diff.md` for the section-matching algorithm details before performing Markdown diffs.
   - For `.serena/*.yml`, match by filename against `learnings/common-ai/configs/.serena/`. Exclude `.local.yml` files (consistent with `ai-diff.md`). Unmatched filenames in the project are classified as New.
   - If not exists: mark as "new bucket — all configs are initial entries"
8. **Classify each item** as: Identical, New (not in learnings), Updated (different from learnings), Removed (in learnings but not in project). For new buckets, all items are classified as New — no prior learnings exist to compare against, so Identical, Updated, and Removed do not apply.

**Config parse errors:** If a config file fails to parse (malformed JSON, TOML, or YAML), skip it with a warning, record it as skipped for the report, and continue processing remaining files. Do not abort discovery due to a single parse failure.

**Bucket status logic:** A bucket's status is "new bucket" if the learnings folder for it does not exist yet. "Changed" if it has any New or Updated items. "Up to date" if it has zero New and zero Updated items, regardless of Removed count (since Removed items are informational only).

**Output:** The discovery results (detected buckets, per-item classifications, diffs) are presented using the `[consolidate]` prefix and held in conversation context for `learn-report.md` to consume. No intermediate files are written. No user checkpoint between discover and report — the proposed files in `tmp/consolidated/` serve as the review point.

**Prompt file structure:** `learn-discover.md` and `learn-report.md` should follow the same structural pattern as existing prompt files (use `ai-discover.md` as a template): `#` title, instruction sections, output format, exit conditions with `[consolidate]` prefix, and a "Next" section linking to the subsequent prompt.

### 4.2 `prompts/learn-report.md` — Report + Proposed Files

Read `references/learnings-schema.md` for the expected format of `learnings.md` entries and `configs/` folder structure.

1. **Generate `./tmp/consolidate-learn-report.md`** with:
   - Technology buckets detected
   - Per-bucket summary: what's new, what changed, what's identical
   - For each changed/new item: the specific diff (old value → new value)
   - Links to proposed files in `tmp/consolidated/`
2. **Write proposed files to `tmp/consolidated/<bucket>/configs/`** — for new buckets, copy root-level config files verbatim (no curation — the human reviewer decides what to keep). For New items within an existing bucket: if the config file does not already exist in `learnings/<bucket>/configs/`, copy verbatim; if the file already exists (new rules/sections within an existing file), use the union merge rules below to preserve canonical-only content. For updated buckets, merge per format:
   - **Markdown (CLAUDE.md):** section-level merge — keep existing canonical sections unchanged, append new sections (not present in learnings) at the end, replace content of sections whose headers match using the same section-matching algorithm from `ai-diff.md`. Canonical-only sections are preserved.
   - **JSON:** key-path-level deep merge — add new keys, update changed values with project values, keep canonical-only keys unchanged (they represent learnings from other projects).
   - **TOML:** key-level merge — same union logic as JSON. Comments are not guaranteed to survive the merge; if comment preservation matters, flag it in the report as a manual review item.
   - **YAML:** key-level merge — same union logic as JSON. Comments are not guaranteed to survive the merge; if comment preservation matters, flag it in the report as a manual review item.

   In all formats, project values win on conflicts. The result is a union of canonical and project configs.
3. **Write proposed `tmp/consolidated/<bucket>/learnings.md`** — appends new entries to existing learnings (or creates initial entries for new buckets)
4. If nothing differs across all buckets: report says "All learnings are up to date" and no files are written to `tmp/consolidated/`
5. When proposing an **Updated** item that conflicts with an existing learning, flag it in the report: "Conflicts with existing learning from [source project] ([date])." The human reviewer decides whether to accept the update.

### 4.3 Integration into SKILL.md subcommands

In the `ai` and `lint` subcommand sections, add after the existing Phase 4:

**For `ai` subcommand:**
```
### Learn Phase

Read `prompts/learn-discover.md` and follow its instructions.
The scope for this learn phase is "ai". Only process AI config files and the common-ai bucket.
Then read `prompts/learn-report.md` and follow its instructions.
```

**For `lint` subcommand:**
```
### Learn Phase

Read `prompts/learn-discover.md` and follow its instructions.
The scope for this learn phase is "lint". Only process lint/tool config files and tech-specific buckets.
Then read `prompts/learn-report.md` and follow its instructions.
```

**For `all` subcommand** (as a new Step 5 after the existing Step 4 — Combined summary):

Update the existing checkpoint prompt (Step 2) to:
```
[consolidate] AI config consolidation complete. Proceed with lint config? (y/n — declining will skip lint but still run the learn phase for AI configs)
```
If the user declines: skip lint, proceed directly to Step 5 with scope `ai`.

```
### Step 5 -- Learn Phase

Read `prompts/learn-discover.md` and follow its instructions.
The scope for this learn phase is determined by which flows completed with changes:
- Both AI and lint completed → scope is "both" (all config files and all buckets)
- Only AI completed (user declined lint, or lint found no configs) → scope is "ai"
- Only lint completed (AI found no configs) → scope is "lint"
- Neither completed → skip this step entirely
Then read `prompts/learn-report.md` and follow its instructions.
```

Concrete integration:

- `/consolidate ai` → phases 1-4, then Learn Phase with scope `ai`
- `/consolidate lint` → phases 1-4, then Learn Phase with scope `lint`
- `/consolidate all` → AI phases 1-4, checkpoint, lint phases 1-4, then Learn Phase **once** with scope determined by which flows completed

The `all` subcommand runs the learn phase once after both flows complete, not after each flow individually. This avoids duplicate runs and produces a single combined report.

**Scope determination in `all`:** A flow "completed with changes" if it ran through Phase 4 (Decide, Apply) and the user applied at least one change to disk. A flow does not count if it: exited early (no projects found, only one project, all identical), the user skipped all items in Phase 4, or the user declined the final apply confirmation (no changes written to disk). Note: early-exit projects (all configs identical) do not trigger learning by design — the learn phase captures learnings from projects that just went through active consolidation changes. Both completed with changes → `both`. AI only (user declined lint, or lint found no configs) → `ai`. Lint only (AI found no configs) → `lint`. Neither completed with changes → skip the learn phase entirely. This subsumes the checkpoint-decline case.

**Bootstrapping exception:** If the `learnings/` folder does not exist or contains no `learnings.md` files, the learn phase runs regardless of the "completed with changes" condition — any project's configs are valuable as initial learnings. During bootstrapping, scope is determined by the same rules above but with "was attempted" replacing "completed with changes" (a flow counts as attempted if it ran at least Phase 1, regardless of whether the user applied changes). Once at least one `learnings.md` exists, the normal "completed with changes" gate and scope rules apply.

---

## 5. Learnings.md Format

Each technology bucket has a `learnings.md` that accumulates rule-level insights:

```markdown
# React — Learnings

## ESLint

### no-floating-promises: error
- **Source:** project-alpha (2026-03-28)
- **Rationale:** Silent promise rejections caused unhandled errors in API route handlers. Caught 3 bugs during consolidation.

### react-hooks/exhaustive-deps: warn
- **Source:** project-beta (2026-04-02)
- **Rationale:** Strict error-level caused too many false positives with stable refs. Warn is the pragmatic middle ground.

## TypeScript (tsconfig)

### strict: true
- **Source:** project-alpha (2026-03-28)
- **Rationale:** Baseline for all new projects. No reason to ship without strict mode.
```

**Superseded entry example:**

```markdown
### indent: ["error", 4]
- **Source:** project-alpha (2026-03-15)
- **Rationale:** Standardized on 4-space indent for readability.
- **Superseded by:** indent: ["error", 2] — project-beta (2026-04-02)

### indent: ["error", 2]
- **Source:** project-beta (2026-04-02)
- **Rationale:** Aligned with community standard. 2-space is predominant in React/TS ecosystem.
```

**Common-AI example** (grouping by config type instead of tool):

```markdown
# Common AI — Learnings

## CLAUDE.md

### ## Code Conventions — includes "prefer composition over inheritance"
- **Source:** project-alpha (2026-03-28)
- **Rationale:** Established team standard for reducing class hierarchy complexity.

## .claude/settings.json

### allowedTools: ["Bash", "Read", "Edit", "Write", "Glob", "Grep"]
- **Source:** project-alpha (2026-03-28)
- **Rationale:** Minimal default tool set. Projects extend as needed.

## .mcp.json

### context7 server configured
- **Source:** project-beta (2026-04-02)
- **Rationale:** Provides up-to-date library documentation lookup for AI agents.
```

Key rules:
- **Source project name:** derived from the monorepo root directory name (`basename` of the working directory). If a root `package.json` exists with a `name` field, use that instead. The name is recorded exactly as resolved — no normalization.
- **Rationale generation:** the agent generates rationale by: (1) using inline comments from the config file if present, (2) inferring from the rule name and value using general tool knowledge (e.g., `strict: true` in tsconfig is universally recommended), (3) for entries where no meaningful rationale can be inferred, using "Configured in [source project]. Review and add specific rationale." The report flags entries with generic rationale so the human reviewer can enrich them. For buckets with more than 5 entries of the same type, the agent may use a single summary rationale for groups of related entries (e.g., "Standard TypeScript strict-mode rules") rather than per-entry rationales. Group rationales use the tier-3 format.
- **Entry granularity:** key-level for JSON/TOML/YAML configs (one entry per rule/setting); section-level for Markdown configs (each `##` section is one learning entry — the entry title is the section header, the full section content lives in the canonical config file, the learnings.md entry captures the header and a brief description)
- Grouped by tool (ESLint, TypeScript, Prettier, Ruff, etc.) or config type (CLAUDE.md sections, MCP settings)
- Each entry has: rule/setting name, source project, date, and rationale
- When a rule is **updated**, the old entry stays in place with a `Superseded by` bullet pointing to the new entry. The new entry is added immediately after. This preserves history.
- The learn phase **proposes** additions in `tmp/consolidated/<bucket>/learnings.md` — never writes directly to the plugin folder
- The learn phase always diffs against the current state of `learnings/<bucket>/`. If there are pending (unapplied) proposed changes in `tmp/consolidated/` from a previous run, apply or discard them before running the learn phase on a different project

---

## 6. Report Format

`./tmp/consolidate-learn-report.md` (follows the existing `consolidate-{domain}-report.md` naming pattern):

```markdown
# Consolidation Learning Report

**Generated:** 2026-03-28
**Source project:** /path/to/monorepo
**Scope:** ai | lint | both  ← one of these values, set by the subcommand that invoked this phase

## Summary

| Bucket | Status | New | Updated | Removed | Identical |
|--------|--------|-----|---------|---------|-----------|
| react | changed | 2 | 1 | 0 | 5 |
| common-ai | new bucket | 4 | 0 | 0 | 0 |
| python | up to date | 0 | 0 | 1 | 3 |

## react (changed)

### New rules
- `no-restricted-imports: error` — not present in current learnings
  - Proposed file: [tmp/consolidated/react/configs/.eslintrc.json](tmp/consolidated/react/configs/.eslintrc.json)

### Updated rules
- `indent: ["error", 4]` → `indent: ["error", 2]`
  - Conflicts with existing learning from: project-alpha (2026-03-15)
  - Proposed file: [tmp/consolidated/react/configs/.eslintrc.json](tmp/consolidated/react/configs/.eslintrc.json)

### Identical (skipped): 5 rules

## common-ai (new bucket)

All configs are initial entries — no existing learnings to compare against.
- Proposed files:
  - [tmp/consolidated/common-ai/configs/CLAUDE.md](tmp/consolidated/common-ai/configs/CLAUDE.md)
  - [tmp/consolidated/common-ai/configs/.claude/settings.json](tmp/consolidated/common-ai/configs/.claude/settings.json)

## python (up to date)

All learnings match current project. No changes proposed.

### Not present in this project
- `select: ["E", "F", "I"]` — in learnings (project-alpha, 2026-03-15) but not in this project's root Ruff config. No action taken.

---

## How to apply

Copy the files you approve from `tmp/consolidated/` into the plugin's learnings folder.
The skill directory is: `[resolved absolute path to skills/consolidate/]`
Target: `[resolved path]/learnings/`
```

Key points:
- Summary table at top for quick scan, includes Removed count
- Per-bucket detail sections only for buckets with changes
- Every proposed file is linked
- Updated rules that conflict with existing learnings are flagged
- "Not present in this project" subsection for Removed items (informational, no action)
- "How to apply" section at the bottom with resolved absolute paths (not placeholders)
- "Up to date" buckets with zero Removed items get a one-liner; those with Removed items get the "Not present in this project" subsection

---

## 7. Error Handling & Edge Cases

- **No root configs found:** Report says "No root-level configs detected. Run consolidation first to unify subpackage configs to root." No files written.
- **Tech bucket detection finds nothing:** Report says "Could not detect technology stack from root configs." Lists what files were checked. No files written.
- **Learnings folder doesn't exist yet** (first ever run): Created implicitly when user copies from `tmp/consolidated/`. The learn phase itself never writes to the plugin folder.
- **Config parse errors:** Skip that file with a warning in the report, continue with others. Same pattern as existing consolidate error handling.
- **Stale output cleanup:** Before generating any output, check if `./tmp/consolidated/` exists and contains files — if so, warn: "[consolidate] Found unapplied proposed changes from a previous learn phase run in tmp/consolidated/. These will be deleted. Apply them first if needed." Then delete `./tmp/consolidate-learn-report.md` and the entire `./tmp/consolidated/` directory if they exist. Do NOT delete other files in `./tmp/` such as `consolidate-ai-report.md` or `consolidate-lint-report.md`. This applies even if the learn phase exits early — stale outputs from previous runs should not persist. All paths are relative to the monorepo root (working directory). Note: `tmp/consolidated/` is a subdirectory (unlike the flat `tmp/consolidate-*-report.md` files) because it mirrors the `learnings/<bucket>/configs/` folder hierarchy for easy copying.
- **Removed rules** (in learnings but not in current project): Reported but NOT proposed for removal. A rule missing from one project doesn't mean the learning is wrong. The report notes it as "Not present in this project" for awareness only.
- **Config format mismatch** (e.g., learnings have `.eslintrc.json` but project uses `eslint.config.js`): Skip comparison for that config file and note the format difference in the report. Migration direction is always old-to-new: if the project uses a newer config format than the learnings, the report suggests "Config format mismatch — consider migrating learnings from [old format] to [new format]." If the project uses an older format than the learnings, no migration is suggested (the learnings already reflect the newer standard). Do not attempt cross-format rule extraction.

---

## 8. Acceptance Tests

The learn phase is complete when all of the following scenarios produce the expected result. The learn phase must be non-breaking to existing consolidation flows (phases 1-4 produce the same output with or without the learn phase).

1. **New bucket:** Run `/consolidate ai` on a project with `CLAUDE.md` + `.claude/settings.json` when no `learnings/common-ai/` exists → report shows `common-ai` as "new bucket", proposed files in `tmp/consolidated/common-ai/configs/`
2. **Update detected:** Run `/consolidate lint` on a React project where learnings exist but one ESLint rule differs → report shows the diff with "Conflicts with existing learning" flag, proposed updated config in `tmp/consolidated/react/configs/`
3. **Up to date:** Run against a project where all root configs match existing learnings → report says "All learnings are up to date", no files written to `tmp/consolidated/`
4. **Error case:** Root has a malformed `.eslintrc.json` → that file is skipped with a warning in the report, other configs processed normally
5. **`all` subcommand:** Run `/consolidate all` on a project with both AI configs and React lint configs. User confirms lint at checkpoint. Report shows both `common-ai` and `react` buckets with scope `both`.
6. **`all` checkpoint decline:** Run `/consolidate all` on a project with AI configs. User declines lint at checkpoint. Learn phase runs with scope `ai`, report covers only `common-ai` bucket.

---

## 9. Files to Create/Modify

All file paths in this section are relative to `ai-dev-tools/` (the plugin root).

### New files

| File | Purpose |
|---|---|
| `skills/consolidate/references/tech-buckets.md` | Config-file-to-technology mapping table |
| `skills/consolidate/references/learnings-schema.md` | Format spec for `learnings.md` and `configs/` folder structure. Must be self-contained with these sections: **1. Folder Structure** (restate Section 2 tree + path-preservation rule in imperative prompt-friendly language), **2. learnings.md Format** (restate Section 5 format, superseded pattern, source project name resolution, rationale generation tiers as actionable instructions), **3. Grouping Rules** (lint/tool buckets group under `## <tool-name>` headers e.g. `## ESLint`; `common-ai` groups under `## <config-type>` headers e.g. `## CLAUDE.md`), **4. Entry Granularity** (key-level for JSON/TOML/YAML; section-level for Markdown). Rules that are already actionable should be included verbatim; descriptive text should be rephrased into imperative instructions (e.g., "Group entries under `## <tool-name>` headers" not "The grouping rule is..."). This is a runtime-read reference — `learn-report.md` reads it for format guidance. |
| `skills/consolidate/prompts/learn-discover.md` | Learn phase step 1: root config reading, tech detection, diffing against learnings |
| `skills/consolidate/prompts/learn-report.md` | Learn phase step 2: report generation + proposed files to `tmp/consolidated/` |

### Modified files

| File | Change |
|---|---|
| `skills/consolidate/SKILL.md` | Add "Learn Phase" to `ai` and `lint` subcommands (after Phase 4). Add "Step 5 -- Learn Phase" to `all` subcommand (after Step 4) with scope determined by which flows completed. Update `all` checkpoint behavior: on decline, proceed to learn phase with scope `ai` instead of exiting. Add `learnings/` folder description. Add `references/` folder description. |

No changes to existing prompt files — phases 1-4 remain untouched.

**`references/` folder convention:** Reference files are static data consumed by prompt files at runtime, not by SKILL.md directly. `learn-discover.md` step 5 reads `references/tech-buckets.md`; `learn-report.md` reads `references/learnings-schema.md`. SKILL.md's modification adds a brief description of the `references/` folder's purpose alongside the existing `prompts/` folder description.
