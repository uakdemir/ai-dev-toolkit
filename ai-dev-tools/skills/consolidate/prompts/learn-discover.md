# Learn Phase: Discovery + Diff

Scan root-level configs, detect technology buckets, and diff against existing learnings.

## Stale Output Cleanup

Before any other action, clean up stale outputs from previous runs:
1. If `./tmp/consolidated/` exists and contains files, warn: `[consolidate] Found unapplied proposed changes from a previous learn phase run in tmp/consolidated/. These will be deleted. Apply them first if needed.`
2. Delete `./tmp/consolidate-learn-report.md` if it exists.
3. Delete the entire `./tmp/consolidated/` directory if it exists.
4. Do NOT delete other files in `./tmp/` such as `consolidate-ai-report.md` or `consolidate-lint-report.md`.

All paths are relative to the working directory (monorepo root).

## Step 1: Determine Scope

The SKILL.md text that invoked this phase explicitly states the scope value: `ai`, `lint`, or `both`. Use that value to control which config files and buckets to examine. See `references/tech-buckets.md` Section 3 (Scope Filtering) for the mapping.

## Step 2: Resolve Skill Path

Determine the plugin's skill directory from the location of the SKILL.md file that was read to invoke this skill. The skill directory is the directory containing that SKILL.md file. Read `./learnings/` relative to that directory to check for existing learnings.

## Step 3: Resolve Source Project Name

1. If root `package.json` exists with a `name` field, use that value.
2. Otherwise, use `basename` of the working directory.

This name is recorded in learnings entries. No normalization applied.

## Step 4: Read Root-Level Configs

Read root-level config files only — no subpackage scanning. Only read config files eligible for the current scope (see `references/tech-buckets.md` Section 3).

## Step 5: Detect Technology Buckets

Read `references/tech-buckets.md` and use its detection mapping table (Section 1) to detect which technology buckets match the root-level config files found in Step 4. Only detect buckets eligible for the current scope.

Remember: `common-ai` is always included when scope is `ai` or `both`. Detection indicator files (`package.json`, `next.config.*`, `vite.config.*`) are always read for detection regardless of scope.

## Step 6: Assign Configs to Buckets

Before diffing, assign each discovered config file to exactly one bucket using `references/tech-buckets.md` Section 4 (Config-to-Bucket Assignment). For shared JS/TS configs (`.eslintrc.*`, `eslint.config.*`, `.prettierrc.*`, `tsconfig.json`, `tsconfig.base.json`), apply the priority: `react` > `nodejs-fastify` > `typescript`. Each config file appears in exactly one bucket's diff — never in multiple.

## Step 7: Diff Against Learnings

For each matched bucket:

1. Check if `learnings/<bucket>/` exists in the skill folder.

2. **If the bucket exists** — perform a **2-way diff** (project root config vs learnings canonical config in `learnings/<bucket>/configs/`). This is NOT an N-way diff across projects.

   Apply format-appropriate granularity:
   - **Markdown (CLAUDE.md):** Section-level (`##`). Read ONLY the section-matching algorithm from `prompts/ai-diff.md` (the "Section matching" subsection under "CLAUDE.md -- Section-Level Diffing"): normalize headers (lowercase, strip punctuation, strip leading numbering, trim whitespace), exact match, suffix stripping (`guidelines`, `rules`, `conventions`, `policy`, `standards`, `notes`, `overview`, `setup`). Ignore all other instructions in `ai-diff.md` including classification labels (Divergent/Unique/Local) and `.consolidate.json` sidecar logic — those apply to the N-way consolidation phases, not the learn phase.
   - **JSON:** Key-path-level (dot-separated paths).
   - **TOML:** Key-level.
   - **YAML:** Key-level.

3. **For `.serena/*.yml`:** Match by filename against `learnings/common-ai/configs/.serena/`. Exclude `.local.yml` files. Unmatched filenames in the project are classified as New.

4. **If the bucket does not exist** — mark as "new bucket — all configs are initial entries."

## Step 8: Classify Items

Classify each config item as:
- **Identical** — same content in project and learnings.
- **New** — in project but not in learnings.
- **Updated** — different content between project and learnings.
- **Removed** — in learnings but not in project.

For new buckets: all items are classified as New. Identical, Updated, and Removed do not apply.

**Config format mismatch** (e.g., learnings have `.eslintrc.json` but project uses `eslint.config.js`): Skip comparison for that config file and flag the mismatch. Migration direction is always old-to-new: if the project uses a newer format than learnings, note "consider migrating learnings from [old format] to [new format]." If the project uses an older format, no migration suggestion.

### Bucket Status

- **New bucket:** the `learnings/` folder for this bucket does not exist.
- **Changed:** has any New or Updated items.
- **Up to date:** zero New and zero Updated items (regardless of Removed count).

## Config Parse Errors

If a config file fails to parse (malformed JSON, TOML, or YAML): emit `[consolidate] Warning: could not parse <file> — skipping.`, record it as skipped for the report phase, and continue processing the remaining config files. Do not abort discovery due to a single parse failure.

## Output Format

Present results using the `[consolidate]` prefix:

```
[consolidate] Learn phase discovery complete.
  Source project: <project-name>
  Scope: <ai|lint|both>

  Buckets detected:
    common-ai   — changed (2 new, 1 updated)
    react       — new bucket (4 configs)
    python      — up to date

  Total: N new, N updated, N identical, N removed
```

For each bucket with changes, list the items:

```
  common-ai:
    CLAUDE.md              — New
    .claude/settings.json  — Updated (3 keys differ)
    .mcp.json              — Identical

  react:
    .eslintrc.json         — New (new bucket)
    tsconfig.json          — New (new bucket)
```

## Exit Conditions

- **No root configs found:** `[consolidate] No root-level configs detected for scope "<scope>". Run consolidation first to unify subpackage configs to root.` Stop.
- **Tech bucket detection finds nothing (lint/both scope):** `[consolidate] Could not detect technology stack from root configs. Checked: <list of files checked>.` Continue with `common-ai` only if scope is `both`; stop if scope is `lint`.
- **All buckets up to date:** Continue to report phase (report will state "All learnings are up to date").

## Next

Proceed to learn report by reading `prompts/learn-report.md`.
