# Multi-File Review-Doc Design

**Date:** 2026-03-29
**Status:** Draft
**Scope:** `review-doc` and `review-doc-ralph` skills

## Problem

The `review-doc` and `review-doc-ralph` skills accept only a single document path. Skills like `refactor-to-monorepo` produce multiple interrelated output files (e.g., 6 files in `docs/monorepo-strategy/`) that are better reviewed as a coherent set. Reviewing them one at a time misses cross-file consistency issues such as contradictory counts, mismatched naming, and broken internal references.

## Solution

Accept multiple input files via explicit list or directory path. Review all files as a single coherent set, with findings that can reference any file or span multiple files.

## Argument Parsing

### New Syntax

```
/review-doc <path1> [path2 ...] [--against <ref>] [--codex] [...]
/review-doc <directory/>       [--against <ref>] [--codex] [...]
```

### Parsing Rules

- Tokens before the first flag (`--*`) are input paths.
- If a path is a directory: expand to all `*.md` files inside it (recursive, sorted alphabetically). This ensures subdirectories like `modules/` in monorepo output are included.
- If a directory contains zero `.md` files: print error and stop.
- All explicit file paths are validated for existence before proceeding. Exit with error listing missing paths.
- `--against` remains a single reference path (unchanged).
- Single file input is fully backward-compatible — the internal list has one entry.

### Examples

| Input | Behavior |
|---|---|
| `/review-doc docs/spec.md` | Single file review (unchanged from today) |
| `/review-doc docs/monorepo-strategy/` | Review all `.md` files in directory |
| `/review-doc docs/a.md docs/b.md docs/c.md` | Review specific files |
| `/review-doc docs/monorepo-strategy/ --against docs/specs/design.md` | Review directory against reference |
| `/review-doc docs/a.md docs/b.md --codex` | Multi-file review via Codex CLI |

## Placeholder Changes

| Old | New | Format |
|---|---|---|
| `{{DOC_PATH}}` | `{{DOC_PATHS}}` | Newline-separated list with `- ` prefix per path |
| `{{AGAINST_PATH}}` | `{{AGAINST_PATH}}` (unchanged) | Single path or `"none"` |

Example `{{DOC_PATHS}}` value:

```
- docs/monorepo-strategy/strategy.md
- docs/monorepo-strategy/module-map.md
- docs/monorepo-strategy/dependency-matrix.md
- docs/monorepo-strategy/monorepo-tooling.md
- docs/monorepo-strategy/migration-plan.md
```

## Location Field Format

Every finding's `location` field includes the filename when multiple files are being reviewed:

- Single-file finding: `strategy.md > Section 3.2`
- Cross-file finding: `strategy.md + module-map.md > Module counts`

When only one file is being reviewed, the location format remains unchanged (no filename prefix needed): `Section 3.2`.

## Review-Doc Skill Changes

### Claude Agents Path (default)

Each of the 3 parallel agents receives the full file list via `{{DOC_PATHS}}`. Agent prompt updates:

- "Read the document at..." becomes "Read each document listed below..."
- Add instruction: "Check cross-file consistency: naming, counts, data references between documents. Use the `cross-reference` category for cross-file issues."
- Each agent includes the filename in its finding's location field.

No structural change to agent dispatch or synthesis logic. Same 3 agents, same parallel dispatch, same dedup/filter/cap/categorize flow.

### Codex Path (`--codex`)

The codex-reviewer prompt gets `{{DOC_PATHS}}` instead of `{{DOC_PATH}}`. Codex reads all listed files from the workspace. The JSON output schema is unchanged — findings just include filenames in their location fields.

### Agent Synthesis

Same rules as today (deduplicate, filter confidence < 40, cap at 20, categorize by severity). No changes to synthesis logic.

### Report Format

```markdown
# Document Review

**Date:** [YYYY-MM-DD HH:MM]
**Reviewed:** [file1.md, file2.md, ...] (N files)
**Against:** [reference path, or "standalone"]
**Status:** Approved | Approved with suggestions | Issues Found

---
[rest of report unchanged]
```

When a single file is reviewed, the `**Reviewed:**` line shows just the path (no file count suffix), matching today's format exactly.

### Terminal Output

```
Document Review Complete
  Reviewed: docs/monorepo-strategy/ (6 files)
  Against: standalone
  Status: Issues Found
  Fact-check: X/Y claims accurate (Z%)
  Critical: N | Important: N | Minor: N
  Report: tmp/review_analysis.md
```

When a single file is reviewed, the `Reviewed:` line shows the file path directly (no directory or count).

## Review-Doc-Ralph Skill Changes

### Argument Parsing

Same multi-path parsing as review-doc. The `<doc-path>` description in the argument table becomes `<path1> [path2 ...]` or `<directory/>`.

### Hash Verification (Per-File)

Before the fix phase:
```bash
sha256sum 'file1.md' 'file2.md' ... > ./tmp/before-hashes.txt
```

After the fix phase:
```bash
sha256sum 'file1.md' 'file2.md' ... > ./tmp/after-hashes.txt
```

Compare line by line. If zero files changed:
```
[ralph] Warning: no files were modified. Proceeding to next review.
```

### Codex Reviewer Prompt

`{{DOC_PATH}}` becomes `{{DOC_PATHS}}`. Same instruction change: "Read each document listed below."

### Codex Coder Prompt

`{{DOC_PATH}}` becomes `{{DOC_PATHS}}`. The coder is told to fix issues across all listed files. The fix-report.json format is unchanged — `issue_index` still references position in the `issues` array from `review.json`.

### Claude Reviewer Prompt

`{{DOC_PATH}}` becomes `{{DOC_PATHS}}`. Dispatches the same 3 agents from the sibling `review-doc` skill (which are also updated for multi-file).

### Claude Coder Prompt

`{{DOC_PATH}}` becomes `{{DOC_PATHS}}`. Receives the file list in conversation context.

### Terminal Output

```
Ralph Wiggum Loop Complete
  Document: docs/monorepo-strategy/ (6 files)
  Against: standalone
  Iterations: 2/4
  Final status: Approved with suggestions
  Remaining: 0 critical, 3 high, 5 medium
  Fact-check accuracy: 92%
  Iteration logs: ./tmp/iteration-1.md, ./tmp/iteration-2.md
  Last review: ./tmp/review.json
```

Single file input shows just the path (same as today).

## JSON Schema

No changes to the review JSON schema. The `location` field is already a free-form string — adding filenames to it requires no schema modification.

## Files to Modify

| File | Change |
|---|---|
| `ai-dev-tools/skills/review-doc/SKILL.md` | Argument parsing, agent dispatch, report format, terminal output |
| `ai-dev-tools/skills/review-doc-ralph/SKILL.md` | Argument parsing, hash loop, report format, terminal output |
| `ai-dev-tools/skills/review-doc/prompts/codex-reviewer.md` | `{{DOC_PATH}}` → `{{DOC_PATHS}}`, plural instructions |
| `ai-dev-tools/skills/review-doc-ralph/prompts/codex-reviewer.md` | `{{DOC_PATH}}` → `{{DOC_PATHS}}`, plural instructions |
| `ai-dev-tools/skills/review-doc-ralph/prompts/codex-coder.md` | `{{DOC_PATH}}` → `{{DOC_PATHS}}`, plural instructions |
| `ai-dev-tools/skills/review-doc-ralph/prompts/claude-reviewer.md` | `{{DOC_PATH}}` → `{{DOC_PATHS}}`, plural instructions |
| `ai-dev-tools/skills/review-doc-ralph/prompts/claude-coder.md` | `{{DOC_PATH}}` → `{{DOC_PATHS}}`, plural instructions |
| `ai-dev-tools/skills/review-doc/agents/completeness-reviewer.md` | Plural input instructions, cross-file consistency check |
| `ai-dev-tools/skills/review-doc/agents/codebase-fact-checker.md` | Plural input instructions, verify paths across all files |
| `ai-dev-tools/skills/review-doc/agents/implementability-auditor.md` | Plural input instructions, cross-file dependency checks |

## What Does NOT Change

- Review JSON schema (no new fields)
- Agent count (still 3 parallel agents)
- Severity/confidence rules
- Status logic (Approved / Approved with suggestions / Issues Found)
- Fix-report.json format
- Iteration log format
- Error handling and retry logic
- `--against` semantics (single reference path)
- All existing flags (`--codex`, `--codex-model`, `--claude=reviewer`, `--solo=*`, `--max-iterations`)
