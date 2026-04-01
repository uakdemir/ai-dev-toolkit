---
name: consolidate
description: Unify AI configs and linting rules across a monorepo. Diffs AI configs across projects, wires lint config inheritance, and offers direct unification where inheritance isn't available. Use /consolidate ai for AI configs, /consolidate lint for linting, /consolidate all for both.
---

<help-text>
consolidate — Unify AI configs or linting rules across monorepo

USAGE
  /consolidate <subcommand>

PARAMETERS
  ai                 Consolidate AI configs only
  lint               Consolidate linting rules only
  all                Both AI configs and linting rules

EXAMPLES
  /consolidate ai                    Unify AI configs
  /consolidate lint                  Unify linting rules
  /consolidate all                   Unify everything
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

# /consolidate

Unifies configuration across a monorepo. Operates via subcommands that target different config domains.

## Subcommand Parsing

Parse the first token after `/consolidate`:

| Token | Action |
|-------|--------|
| `ai`  | AI config consolidation |
| `lint` | Lint config consolidation |
| `all` | Run both sequentially |

If the token is missing or unrecognized:

```
[consolidate] Unknown or missing subcommand.
Valid subcommands: ai, lint, all
Usage: /consolidate ai | /consolidate lint | /consolidate all
```

## Shared Discovery Logic

Both subcommands discover project directories the same way:

1. **Workspace config (preferred for JS/TS monorepos):**
   - Read `package.json` at root: use the `workspaces` field (array of globs) to resolve project directories.
   - If no `package.json` workspaces, read `pnpm-workspace.yaml`: use the `packages` field.
   - Do NOT use `turbo.json` -- it defines task pipelines, not package locations.

2. **Fallback (always used for non-JS monorepos, or when no workspace config exists):**
   - Scan: root directory + `*/` (depth-1) + `*/*/` (depth-2).
   - For non-JS monorepos (Python, .NET, etc.), this fallback is the primary discovery method since no `package.json` workspaces exist.

3. **Exclusions (always applied):**
   - Skip these directories at any depth: `node_modules`, `.git`, `vendor`, `dist`, `build`, `.next`, `__pycache__`.

A discovered directory is only a "project" if it contains config files relevant to the active subcommand. The prompt files define which files to look for.

## Folder Structure

- `prompts/` — prompt files for each phase. SKILL.md reads these sequentially.
- `references/` — static reference data consumed by prompt files at runtime (technology detection mapping, learnings format schema). Not read by SKILL.md directly.
- `learnings/` — accumulated best-practice configs and rationale, organized by technology bucket. Created when the user first copies proposed learnings from `tmp/consolidated/`. Never written by the skill directly.

## Subcommand: ai

Execute these prompt files in sequence, completing each phase before the next:

### Phase 1 -- Discovery
Read `prompts/ai-discover.md` and follow its instructions.
- Scan the monorepo for projects containing AI config files (CLAUDE.md, .claude/settings.json, .codex/config.toml, .mcp.json).
- Present a discovery summary to the user showing which projects have which configs.
- If no projects found or only one project found, report and exit.

### Phase 2 -- Diff
Read `prompts/ai-diff.md` and follow its instructions.
- Compare each config type across all discovered projects at the appropriate granularity (section-level for Markdown, key-level for JSON/TOML/YAML).
- Respect local override markers -- skip content marked as local.
- Classify each item as: Identical, Divergent, Unique, or Local.

### Phase 3 -- Report
Read `prompts/ai-report.md` and follow its instructions.
- Present a structured diff report grouped by config type.
- Save the report to `./tmp/consolidate-ai-report.md`.
- If nothing diverges, report that all configs are identical and exit.

### Phase 4 -- Decide, Apply, and Summary
Read `prompts/ai-apply.md` and follow its instructions.
- Walk through divergent/unique items and collect user decisions (batch mode for >5 items).
- Confirm the full decision summary before applying.
- Write merged configs respecting local markers. Do NOT commit -- user reviews via `git diff`.
- Show a summary of all changes: files updated, created, unchanged, and local sections preserved.

### Learn Phase
Read `prompts/learn-discover.md` and follow its instructions.
The scope for this learn phase is "ai". Only process AI config files and the common-ai bucket.
Then read `prompts/learn-report.md` and follow its instructions.

## Subcommand: lint

Execute these prompt files in sequence, completing each phase before the next:

### Phase 1 -- Discovery
Read `prompts/lint-discover.md` and follow its instructions.
- Scan the monorepo for projects containing lint config files (ESLint, Prettier, TypeScript, EditorConfig, Roslyn, Ruff, MyPy).
- Auto-detect which tools are present. Group configs by tool and format.
- Flag format mismatches (e.g., some projects use .eslintrc.json, others use .eslintrc.js).
- Present a discovery summary showing detected tools and their configs per project.
- If no lint configs found, report and exit.

### Phase 2 -- Analysis
Read `prompts/lint-analyze.md` and follow its instructions.
- For each detected tool with same-format configs: extract rules/settings, classify as common (intersection), divergent, or unique.
- Check inheritance status: does a root config exist? Do projects already extend it?
- Handle tools differently based on their capabilities:
  - Tools with native inheritance (ESLint, TypeScript, Ruff, Roslyn): full analysis for wiring extends.
  - Prettier: direct value comparison for unification (no inheritance available).
  - MyPy: report differences only (no writes -- unsafe for automatic unification).
  - EditorConfig: check root exists with `root = true`.

### Phase 3 -- Report
Read `prompts/lint-report.md` and follow its instructions.
- Present findings per tool: common rules, divergent rules, unique rules, inheritance status.
- Note format mismatches and JS config limitations.
- Save the report to `./tmp/consolidate-lint-report.md`.
- If all tools are already wired correctly, report and exit.

### Phase 4 -- Decide, Apply, and Summary
Read `prompts/lint-apply.md` and follow its instructions.
- Per tool, collect decisions: create root config, wire extends, clean up redundant rules, unify values.
- Confirm the full decision summary before applying.
- Apply changes: create/update root configs, wire `extends` with correct relative paths, remove redundant rules, unify Prettier values. Do NOT commit.
- Show a summary of all changes per tool.

### Learn Phase
Read `prompts/learn-discover.md` and follow its instructions.
The scope for this learn phase is "lint". Only process lint/tool config files and tech-specific buckets.
Then read `prompts/learn-report.md` and follow its instructions.

## Subcommand: all

Run both flows sequentially with a user checkpoint between them.

### Step 1 -- Run AI consolidation
Execute phases 1-4 of the `ai` subcommand above (do NOT run the Learn Phase — it runs once in Step 5).

### Step 2 -- Checkpoint
After the AI summary is displayed, ask the user:

```
[consolidate] AI config consolidation complete. Proceed with lint config? (y/n — declining will skip lint but still run the learn phase for AI configs)
```

- If the user confirms: proceed to Step 3.
- If the user declines: skip lint, proceed directly to Step 5 with scope "ai".

### Step 3 -- Run lint consolidation
Execute phases 1-4 of the `lint` subcommand above (do NOT run the Learn Phase — it runs once in Step 5).

### Step 4 -- Combined summary
After both flows complete, show a combined summary with counts for both domains and paths to both report files (`./tmp/consolidate-ai-report.md`, `./tmp/consolidate-lint-report.md`).

### Step 5 -- Learn Phase

Read `prompts/learn-discover.md` and follow its instructions.
The scope for this learn phase is determined by which flows completed with changes:
- Both AI and lint completed with changes → scope is "both"
- Only AI completed (user declined lint, or lint found no configs) → scope is "ai"
- Only lint completed (AI found no configs) → scope is "lint"
- Neither completed with changes → skip this step entirely
Then read `prompts/learn-report.md` and follow its instructions.

A flow "completed with changes" means it ran through Phase 4 and the user applied at least one change to disk. It does not count if: the flow exited early, the user skipped all items, or the user declined the final apply confirmation.

**Bootstrapping exception:** If the `learnings/` folder does not exist or contains no `learnings.md` files, the learn phase runs regardless of the "completed with changes" condition — any project's configs are valuable as initial learnings. During bootstrapping, scope is determined by the same rules above but with "was attempted" replacing "completed with changes" (a flow counts as attempted if it ran at least Phase 1, regardless of whether the user applied changes).

## Error Handling

- **Bad subcommand:** show usage message with valid options (see Subcommand Parsing above).
- **No projects found / only one project:** exit with a clear message. Nothing to diff.
- **Config parse errors** (malformed JSON/TOML/YAML): skip that file with a warning, continue with others.
- **File write failures:** report the error, continue with remaining files, note failures in summary.
- **User aborts during decisions:** exit cleanly, no further files modified.
- **Uncommitted changes in target files:** warn before applying, require user confirmation.
- **Phase-specific errors:** each prompt file contains additional handling. Follow as encountered.
