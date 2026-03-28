# Learn Phase: Report + Proposed Files

Generate a learning report and write proposed files to `tmp/consolidated/`. Consume the discovery results (detected buckets, per-item classifications, diffs) from the preceding `learn-discover.md` step, which are available in conversation context.

## Schema Reference

Read `references/learnings-schema.md` for the expected format of `learnings.md` entries, `configs/` folder structure, grouping rules, and entry granularity.

## Step 1: Generate Report

Write `./tmp/consolidate-learn-report.md` with this format:

```
# Consolidation Learning Report

**Generated:** <YYYY-MM-DD>
**Source project:** <absolute path to monorepo>
**Scope:** <ai|lint|both>

## Summary

| Bucket | Status | New | Updated | Removed | Identical |
|--------|--------|-----|---------|---------|-----------|
| <bucket> | <new bucket|changed|up to date> | N | N | N | N |

## <bucket> (changed)

### New rules
- `<rule-name>: <value>` — not present in current learnings
  - Proposed file: [tmp/consolidated/<bucket>/configs/<file>](tmp/consolidated/<bucket>/configs/<file>)

### Updated rules
- `<old-rule>` → `<new-rule>`
  - Conflicts with existing learning from: <source-project> (<date>)
  - Proposed file: [tmp/consolidated/<bucket>/configs/<file>](tmp/consolidated/<bucket>/configs/<file>)

### Identical (skipped): N rules

Proposed learnings: [tmp/consolidated/<bucket>/learnings.md](tmp/consolidated/<bucket>/learnings.md)

## <bucket> (new bucket)

All configs are initial entries — no existing learnings to compare against.
- Proposed files:
  - [tmp/consolidated/<bucket>/configs/<file>](tmp/consolidated/<bucket>/configs/<file>)
  - [tmp/consolidated/<bucket>/learnings.md](tmp/consolidated/<bucket>/learnings.md)

## <bucket> (up to date)

All learnings match current project. No changes proposed.

### Not present in this project
- `<rule>` — in learnings (<source>, <date>) but not in this project's root config. No action taken.

---

## How to apply

Copy the files you approve from `tmp/consolidated/` into the plugin's learnings folder.
The skill directory is: <resolved absolute path to skills/consolidate/>
Target: <resolved path>/learnings/
```

Key formatting rules:
- Summary table at top for quick scan with Removed count.
- Per-bucket detail sections only for buckets with changes or new buckets.
- Every proposed file is linked with a relative path — both `configs/` files and `learnings.md`.
- Updated rules that conflict with existing learnings are flagged: "Conflicts with existing learning from [source project] ([date])."
- "Not present in this project" subsection for Removed items — informational only, no action.
- "How to apply" section at bottom with resolved absolute paths (not placeholders).
- "Up to date" buckets with zero Removed items get a one-liner; those with Removed items get the "Not present in this project" subsection.
- Entries with generic (tier-3) rationale are flagged: "⚠ Generic rationale — review and enrich."

## Step 2: Write Proposed Config Files

Write proposed files to `tmp/consolidated/<bucket>/configs/`, creating directories as needed.

**For new buckets:** Copy root-level config files verbatim. No curation — the human reviewer decides what to keep.

**For New items within an existing bucket:** If the config file does not already exist in `learnings/<bucket>/configs/`, copy the project file verbatim. If the config file already exists in learnings (i.e., a new rule/section within an existing file), use the same per-format union merge rules below — this preserves canonical-only content from other projects.

**For Updated items (and New items in existing files):** Merge per format:

- **Markdown (CLAUDE.md):** Section-level merge.
  - Keep existing canonical sections unchanged.
  - Append new sections (not in learnings) at the end.
  - Replace content of sections whose headers match (use the same section-matching algorithm from `ai-diff.md`: normalize, exact match, suffix stripping — read from `prompts/ai-diff.md` if not already in context from learn-discover.md).
  - Canonical-only sections are preserved.

- **JSON:** Key-path-level deep merge.
  - Add new keys from the project.
  - Update changed values with project values.
  - Keep canonical-only keys unchanged (they represent learnings from other projects).

- **TOML:** Key-level merge, same union logic as JSON. Comments are not guaranteed to survive the merge; if comment preservation matters, flag it in the report as a manual review item.

- **YAML:** Key-level merge, same union logic as JSON. Comments are not guaranteed to survive the merge; if comment preservation matters, flag it in the report as a manual review item.

In all formats, **project values win on conflicts**. The result is a union of canonical and project configs.

## Step 3: Write Proposed Learnings

Write proposed `tmp/consolidated/<bucket>/learnings.md` following the schema in `references/learnings-schema.md`:

- For new buckets: create initial entries for all config items.
- For existing buckets: append new entries. For updated items, add the new entry after the existing one with the `Superseded by` chain (see schema Section 2).
- Use the source project name resolved in learn-discover.md.
- Use today's date.
- Generate rationale per the tier system in the schema.

## Step 4: Handle Edge Cases

- **Nothing differs across all buckets:** Report says "All learnings are up to date" and no files are written to `tmp/consolidated/`.
- **Config parse errors:** Skip that file with a warning in the report, continue with others.
- **Config format mismatch:** Include the mismatch note from learn-discover.md in the report. If the project uses a newer format: "Config format mismatch — consider migrating learnings from [old format] to [new format]."

## Output Format

After writing the report and proposed files:

```
[consolidate] Learning report generated.
  Report: ./tmp/consolidate-learn-report.md
  Proposed files: ./tmp/consolidated/
    common-ai/configs/    — 3 files
    react/configs/        — 2 files
    common-ai/learnings.md
    react/learnings.md

  Review proposed files and copy approved changes to:
    <resolved skill path>/learnings/
```

If nothing differs:

```
[consolidate] All learnings are up to date. No changes proposed.
```

## Exit Conditions

- **All up to date:** Report "All learnings are up to date." No files written. This is a normal exit, not an error.
