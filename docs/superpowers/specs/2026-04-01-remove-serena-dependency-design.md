# Remove Serena MCP Dependency

## Goal

Remove all Serena MCP tool references from the codebase. Serena's value (precise symbol resolution) is unnecessary at our target codebase size (<=20K LOC per module). The regex/grep fallback paths already exist and are complete. Removing Serena eliminates dual-mode prompt bloat and a hard-gate step that blocks users.

## Affected Skills

| Skill | Serena Role | Removal Effort |
|---|---|---|
| **api-contract-guard** | Hard gate + dual-mode throughout (Serena vs regex) | Heavy |
| **consolidate** | `.serena/*.yml` as one of 5 AI config formats | Medium |
| **review-doc** (fact-checker agent) | Preferred tools table recommending Serena for symbol lookup | Light |

## Changes

### api-contract-guard/SKILL.md

1. **Delete Step 1 (Serena Check)** — the entire hard gate section (lines 46-58). Renumber remaining steps: current Step 2 becomes Step 1, through Step 10 becoming Step 9 (and 9a becomes 8a).
2. **Remove all dual-mode branches** — every "With Serena: ... / Without Serena: ..." block throughout the file. Promote the regex/grep path as the sole analysis mode.
3. **Specific sections to edit:**
   - Step 6 (Barrel File Analysis): State 2 — remove "With Serena: `find_referencing_symbols`." Keep regex scan description.
   - Step 6: Wildcard re-exports — replace the block with: `Warn: "Wildcard re-export defeats explicit contract." One-level resolution; nested wildcards warn. Offer to replace with named exports.`
   - Step 7 (Cross-Module Import Analysis): Delete the "With Serena" paragraph. Keep the "Without Serena" paragraph but remove the "Without Serena:" label — it becomes the only description.
   - Error handling table: remove the "Serena unavailable" row. Remove "Serena: full; regex: one level" from wildcard row — just "one-level resolution, recommend named exports". Change path alias row from "Serena: resolved. Without: warn about false negatives." to "Warn about false negatives." Update the "Wildcard re-export in barrel" row: change "Warn, resolve (Serena: full; regex: one level), recommend named exports" to "Warn, resolve (one-level), recommend named exports".
4. **Update reference file description** on line 41: remove "(Serena + regex)" from barrel-patterns.md description.
5. **Update workflow overview** (lines 28-36): delete line 27 (`1. **Serena Check**...`) and renumber the remaining steps so the list begins at Step 1.

### api-contract-guard/references/barrel-patterns.md

1. **Delete file header** Serena mention (line 4): remove "Serena + regex dual-mode" from the description.
2. **Delete "Export Analysis — Serena Mode" section** (lines 48-70 entirely).
3. **Rename "Export Analysis — Regex Fallback"** to "Export Analysis" (line 73). Remove "When Serena is not available" from the description.
4. **Incomplete Barrel Detection**: delete "Serena Mode" subsection (lines 157-164). Rename "Regex Fallback" to just the algorithm description — remove the heading label.
5. **Cross-Module Import Scanning**: delete "Serena Mode" subsection (lines 191-196). Rename "Regex Fallback" — remove heading label, it's the only mode.
6. **Path aliases**: remove "Without Serena, aliases cannot be reliably resolved" and the "Consider installing Serena" recommendation (lines 256-259). Keep the warning about false negatives.
7. **Wildcard Re-Export Resolution**: delete "Serena Mode" subsection (lines 293-299). In the Regex Fallback (now only mode), remove "Cannot fully resolve without Serena. Recommend installing Serena or replacing with named exports." Replace with "Nested wildcard re-exports detected. Recommend replacing with named exports."
8. **Barrel Generation — Determine Export Kind**: delete the "Serena:" line (line 332-333). Keep the regex pattern matching as the only approach.

### review-doc/agents/codebase-fact-checker.md

1. **Delete the "Preferred Tools" section** (lines 46-58) — the table recommending Serena tools and the "Use Serena tools when available" sentence.
2. The agent already uses Read/Grep/Glob — those become the only tools with no preference note needed.

### consolidate skill (6 files)

All changes are removing `.serena/*.yml` from lists of scanned/supported AI config formats:

1. **SKILL.md** (line 77): remove `.serena/*.yml` from the config file list. Also verify and update any Phase 2-4 summary descriptions that reference Serena YAML as a supported config type (e.g., Phase 2 "Compare each config type" description and any Phase 4 step cross-referencing Serena YAML merge).
2. **prompts/ai-discover.md**: remove `.serena/*.yml` from the discovery rules list (line 13). On line 34 (output format example), remove the entire `.serena/` entry. On line 38 (config type summary), remove the `.serena (1)` token and its preceding comma-space; update the parenthetical total count from 5 to 4 config types.
3. **prompts/ai-diff.md** (lines 73-80): delete the entire `## Serena/YAML Configs -- Key-Level` section from the heading through the end of that section. Verify nothing after line 80 references this section.
4. **prompts/ai-report.md** (line 18): remove `.serena/` report section header.
5. **prompts/ai-apply.md**: (1) Delete the entire `### Serena/YAML Merge` section (lines 90-93), including the heading and its body. (2) In the `### New Files` section at line 96, strip `.serena/` from the parenthetical `(.codex/, .serena/)` — do not delete the section, as directory creation capability is still needed for other file types.
6. **prompts/learn-discover.md** (line 58): delete the entire bullet point 3 in Step 7 — the full `.serena/*.yml` matching block from `3. **For \`.serena/*.yml\`:**` through the end of that logical entry (the complete multi-line bullet, not just the pattern reference on the first line).

### consolidate references (2 files)

1. **references/learnings-schema.md** (lines 34, 96): remove `.serena/default.yml` path example and grouping header. This covers only the documentation references in this file. Actual learnings stored under `learnings/common-ai/configs/.serena/` are out of scope for this change.
2. **references/tech-buckets.md**: At each of the three locations, remove `.serena/*.yml` (including the preceding `, ` separator) from the AI config file list. The resulting list at each location should read: `CLAUDE.md, .claude/settings.json, .codex/config.toml, .mcp.json` — no trailing comma or space after `.mcp.json`.

### .gitignore

1. Remove the `.serena/` entry (line 23).

## Out of Scope

- No Serena opt-in path preserved for future use.
- No new tooling to replace Serena — existing grep/glob/read tools are sufficient.
- convention-enforcer is already clean (no Serena references). A full-codebase search for `serena` (case-insensitive) was performed across all skills; the 3 listed skills (api-contract-guard, consolidate, review-doc) plus `.gitignore` are the complete set of affected files. All other skills (refactor-to-layers, document-for-ai, orchestrate, refactor-to-monorepo, etc.) have no Serena references.

## Verification

1. After all changes, grep the codebase case-insensitively for `serena` across all affected files and confirm the only remaining hit is the `.gitignore` removal entry (i.e., no references remain in skill files, prompts, or references).
2. Manually trace the regex-only path through each affected skill (api-contract-guard, consolidate, review-doc) to confirm no logic gaps — every step that previously offered a Serena branch must still produce complete output using only grep/glob/read.

## Constraints

- Regex paths must remain complete and correct after Serena removal — no logic gaps.
- Step renumbering in api-contract-guard must be consistent (workflow overview, step headers, cross-references within the file).
- No functional behavior changes — the regex analysis mode already works identically to what users get when they choose "proceed without Serena" today.
