# Small Improvements Design

**Date:** 2026-03-31
**Status:** Approved with suggestions
**Scope:** `review-doc`, `orchestrate`, `help` skills

Four independent improvements bundled for implementation together. Each part affects mostly different files, with the exception that Parts 1 and 4 both modify `review-doc/SKILL.md`.

---

## Part 1: Multi-File Review-Doc

### Problem

The `review-doc` skill accepts only a single document path. Skills like `refactor-to-monorepo` produce multiple interrelated output files (e.g., 6 files in `docs/monorepo-strategy/`) that are better reviewed as a coherent set. Reviewing them one at a time misses cross-file consistency issues such as contradictory counts, mismatched naming, and broken internal references.

### Solution

Accept multiple input files via explicit list or directory path. Review all files as a single coherent set, with findings that can reference any file or span multiple files.

### Argument Parsing

New syntax:

```
/review-doc <path1> [path2 ...] [--against <ref>] [--max-model <model>] [--min-model <model>] [--max-iterations N] [--effort <level>] [--help]
/review-doc <directory/>       [--against <ref>] [...]
```

Updated `--help` output block:

```
Usage: /review-doc <path1> [path2 ...] [flags]
       /review-doc <directory/> [flags]

Iterative document review with model tiering. Dispatches a single merged
reviewer for completeness, consistency, and implementability. Fixes issues
automatically between rounds. Fact-checker runs sequentially in the final round.
Accepts multiple files or a directory of .md files for cross-file review.

Flags:
  --against <ref-path>    Reference document for cross-checking (default: none)
  --max-model <model>     Final round: reviewer + fixer + fact-checker (default: opus)
  --min-model <model>     Early rounds: reviewer + fixer      (default: sonnet)
  --max-iterations N      Safety cap, 0=skip, 1=single-pass  (default: 1)
  --effort <level>        Thoroughness: low, medium, high    (default: high)
  --help                  Print this help and exit

Examples:
  /review-doc docs/spec.md                               Single-pass review (default)
  /review-doc docs/a.md docs/b.md docs/c.md              Review specific files as a set
  /review-doc docs/monorepo-strategy/                    Review all .md files in directory
  /review-doc docs/spec.md --max-iterations 3            Iterative review, up to 3 rounds
  /review-doc docs/spec.md --against docs/plan.md        Review against reference document
  /review-doc docs/spec.md --min-model haiku             Faster early rounds (lower quality)
```

Parsing rules:

- Tokens before the first flag (`--*`) are input paths.
- If no input paths are provided: print `"Error: no input paths provided."` and exit.
- If a path is a directory: expand to all `*.md` files inside it (recursive, sorted alphabetically, max 20 files). This ensures subdirectories like `modules/` in monorepo output are included. If more than 20 `.md` files are found: print `"Error: directory contains more than 20 .md files. Use explicit paths to select a subset."` and exit.
- If a directory contains zero `.md` files: print error and stop.
- All explicit file paths are validated for existence before proceeding. Exit with error listing missing paths.
- `--against` must be a file path, not a directory. If a directory is passed: print `"Error: --against value must be a file, not a directory."` and exit.
- `--against` remains a single reference path (unchanged).
- Single file input is fully backward-compatible — the internal list has one entry.

Examples:

| Input | Behavior |
|---|---|
| `/review-doc docs/spec.md` | Single file review (unchanged from today) |
| `/review-doc docs/monorepo-strategy/` | Review all `.md` files in directory (recursive) |
| `/review-doc docs/a.md docs/b.md docs/c.md` | Review specific files |
| `/review-doc docs/monorepo-strategy/ --against docs/specs/design.md` | Review directory against reference |

### Dispatch Prompt Format

When the orchestrator dispatches reviewer, fixer, or fact-checker agents, it must include the document list in the dispatch prompt context. The new format replaces the single path with a newline-separated list:

```
Documents to review:
- docs/monorepo-strategy/strategy.md
- docs/monorepo-strategy/module-map.md
- docs/monorepo-strategy/dependency-matrix.md
```

For a single file, the format is a list with one entry (maintaining consistency):

```
Documents to review:
- docs/spec.md
```

### Placeholder Changes

| Old | New | Format |
|---|---|---|
| `{{DOC_PATH}}` | `{{DOC_PATHS}}` | Newline-separated list with `- ` prefix per path |
| `{{AGAINST_PATH}}` | `{{AGAINST_PATH}}` (unchanged) | Single path or `"none"` |

Example `{{DOC_PATHS}}` value:

```
- docs/monorepo-strategy/strategy.md
- docs/monorepo-strategy/module-map.md
- docs/monorepo-strategy/dependency-matrix.md
```

### Location Field Format

Every finding's `location` field includes the filename when multiple files are being reviewed:

- Single-file finding: `strategy.md > Section 3.2`
- Cross-file finding: `strategy.md + module-map.md > Module counts`

When only one file is being reviewed, the location format remains unchanged (no filename prefix needed): `Section 3.2`.

### Prompt Updates

**reviewer.md:** Update the Mission section to describe reviewing multiple documents. Update the Inputs section to describe input as a newline-separated list of document paths. Add instruction to the What to Check section: "Check cross-file consistency: naming, counts, data references between documents. Use the `cross-reference` category for cross-file issues." Include filename in each finding's location field.

**codebase-fact-checker.md:** The document path is passed via the dispatch prompt context (no template placeholder exists in this file). Update the Mission section to instruct verification across all listed documents, and update the What to Verify section to describe the input as a newline-separated list of document paths rather than a single path. The dispatch prompt context changes from a single path to a newline-separated list.

**coder.md:** `{{DOC_PATH}}` becomes `{{DOC_PATHS}}`. Receives file list in conversation context. Fixes issues across all listed files.

### Report Format

This section specifies the header changes for `tmp/review_summary.md` (the curated human summary).

```markdown
# Review Summary

**Date:** [YYYY-MM-DD HH:MM]
**Reviewed:** [file1.md, file2.md, ...] (N files)
**Against:** [reference path, or "standalone"]
**Iterations:** N/M
**Status:** Approved | Approved with suggestions | Issues Found

---
[rest of report unchanged]
```

When a single file is reviewed, the `**Reviewed:**` line shows just the path (no file count suffix), matching today's format exactly.

### Terminal Output

```
Review Doc Complete
  Reviewed: docs/monorepo-strategy/ (6 files)
  Against: standalone
  Iterations: N/M
  Status: Issues Found
  Aggregate: X Critical fixed | Y High fixed | Z Medium fixed
  Remaining: A Critical | B High | C Medium
  Fact-check: X/Y claims accurate (Z%)
  Summary: tmp/review_summary.md
  Full review: tmp/review.json
```

When a single file is reviewed, the `Reviewed:` line shows the file path directly (no directory or count).

When multiple explicit files are passed (not a directory), the `Reviewed:` line shows all file paths comma-separated with the count suffix:

```
Review Doc Complete
  Reviewed: docs/a.md, docs/b.md, docs/c.md (3 files)
  Against: standalone
  Iterations: N/M
  Status: Approved with suggestions
  Aggregate: X Critical fixed | Y High fixed | Z Medium fixed
  Remaining: 0 Critical | 2 High | 1 Medium
  Fact-check: X/Y claims accurate (Z%)
  Summary: tmp/review_summary.md
  Full review: tmp/review.json
```

### Files to Modify

| File | Change |
|---|---|
| `ai-dev-tools/skills/review-doc/SKILL.md` | Argument parsing (new multi-path syntax); `--help` output block (usage line and examples); Review Summary Format section (`**Reviewed:**` line shows multi-file list); `--max-iterations 0` edge case output (`Reviewed:` line); Agent Dispatch sections (change 'the document path' to 'the document paths list') |
| `ai-dev-tools/skills/review-doc/prompts/reviewer.md` | Update Mission section ('Review the document' → 'Review each document'), Inputs section ('Document path' → 'Document paths: newline-separated list'), add cross-file consistency instruction to What to Check section |
| `ai-dev-tools/skills/review-doc/prompts/coder.md` | `{{DOC_PATH}}` → `{{DOC_PATHS}}`, plural instructions |
| `ai-dev-tools/skills/review-doc/agents/codebase-fact-checker.md` | Update Mission and What to Verify sections to describe input as a newline-separated list of document paths; update dispatch prompt context description |
| `ai-dev-tools/skills/help/SKILL.md` | Update review-doc usage line from `/review-doc <path>` to `/review-doc <path1> [path2 ...]` |

### Success Criteria

- `/review-doc docs/a.md docs/b.md` runs without error and produces a single `tmp/review_summary.md` listing both files under `**Reviewed:**`.
- `/review-doc docs/monorepo-strategy/` expands to all `.md` files in the directory and the terminal output shows the directory path with file count (e.g., `docs/monorepo-strategy/ (6 files)`).
- `/review-doc docs/spec.md` (single file) produces identical output to today with no behavioral change.
- A cross-file consistency finding (category `cross-reference`) is present when two files contain contradictory counts.

### What Does NOT Change

- Review JSON schema (no new fields)
- Severity/confidence rules
- Status logic (Approved / Approved with suggestions / Issues Found)
- Agent architecture (single merged reviewer + fact-checker)
- All existing flags (`--against`, `--max-model`, `--min-model`, `--max-iterations`, `--effort`)
- Orchestrate integration (stays single-file at Step 2; `review-doc` is not invoked by orchestrate for multi-file use — it is user-invoked directly)
- Error handling and retry logic

---

## Part 2: Quality Gates Simplification

### Problem

Quality gates at Step 8 run 12+ git commands: each gate independently scans `git log --grep` for its baseline commit, then runs `git diff --name-only` or `git log --oneline` to measure changes. This is slow and disproportionate for advisory recommendations that serve as reminders.

### Solution

Replace all per-gate baseline detection and measurement with a single unified heuristic: count commits from the plan hash (already in the hint file) to HEAD, and compare against per-gate thresholds expressed in commit count.

### Algorithm

```
plan_hash = read from tmp/orchestrate-state.md
if plan_hash is empty → skip quality gates entirely

Run `git log --oneline {plan_hash}..HEAD` and count the number of returned lines as `commit_count` (count in the orchestrator, not via shell pipe).

Recommendations (check all, collect matches):
  convention-enforcer:  commit_count > 7   [Warning]  "{N} commits since plan → run /convention-enforcer (recommended)"
  test-audit:           commit_count > 10  [Warning]  "{N} commits since plan → run /test-audit"
  document-for-ai:      commit_count > 5   [Warning]  "{N} commits since plan → run /document-for-ai"
  consolidate:          commit_count > 40  [Info]     "{N} commits since plan → run /consolidate"
  session-handoff:      conversation length check (unchanged, not git-based) [Info]  "Long conversation. Consider /session-handoff before next feature"
                        Detection: trigger when conversation exceeds ~50 exchanges or user mentions context pressure. This is a subjective heuristic the orchestrating LLM evaluates based on conversation length. This check is not git-based and is unaffected by the commit count heuristic.
```

Threshold rationale: original thresholds were file-based (e.g., convention-enforcer triggered at >20 files). Using an internal estimate of ~3 files per commit, the commit thresholds are the file thresholds divided by 3, rounded. Only commit counts are shown to the user.

If the `git log` command fails: skip the quality gates section entirely and warn: "Could not compute commit count from plan hash. Quality gates skipped."

### Dropped Gates

| Gate | Reason |
|---|---|
| api-contract-guard | Structural trigger (new module directories) — cannot approximate with commit count. User runs `/api-contract-guard` manually when creating new modules. |
| refactor-to-layers | Needs `wc -l` on source directories — fundamentally different measurement. User runs `/refactor-to-layers` manually when modules grow large. |

### Baseline

- `plan_hash` from `tmp/orchestrate-state.md` — already available, zero git commands for baseline
- No per-gate baseline tracking, no `git log --grep` scans
- If plan_hash is empty → skip quality gates entirely (nothing was implemented)
- Recommendations may repeat across finalize cycles — acceptable for advisory reminders

### Presentation Format

```
Feature "{name}" complete.

Recommendations:
  [Warning] 7 commits since plan → run /convention-enforcer (recommended)
  [Warning] 12 commits since plan → run /test-audit

What's next?
  > Next feature (continue with /orchestrate)
  > Run a recommendation above
  > Something else (tell me what you need)
```

- Warnings first, info second
- Max 3 recommendations
- Priority order: convention-enforcer > test-audit > document-for-ai > consolidate > session-handoff
- Show commit count only — no estimated file count in display

### Success Criteria

- Quality gates at Step 8 issue exactly one `git log` command (not 12+) regardless of how many gates are configured.
- When `plan_hash` is empty in `tmp/orchestrate-state.md`, quality gates section is skipped entirely with no git commands run.
- A gate with `commit_count` above its threshold appears in the recommendations; one below its threshold does not.
- The session-handoff recommendation triggers based on conversation length regardless of commit count.

### Files to Modify

| File | Change |
|---|---|
| `ai-dev-tools/skills/orchestrate/references/quality-gates.md` | Replace entire detection/measurement logic with unified heuristic |

### What Does NOT Change

- Presentation format structure (recommendations + "What's next?")
- Priority ordering (minus dropped gates)
- "What's next?" options
- Error handling simplified: single `git log` failure skips ALL gates (previously per-gate skip)
- SKILL.md references to quality gates (conditional loading at Step 8 unchanged)

---

## Part 3: Remove Version from Help

### Problem

The `help` skill reads `ai-dev-tools/.claude-plugin/plugin.json` via a Read tool call solely to extract the version number for the header line `ai-dev-tools v{VERSION}`. The plugin already displays its version via the `/plugin` command. The extra Read call adds latency to every `/help` invocation for information available elsewhere.

### Solution

Remove the version read and display from the help skill. The header line changes from `ai-dev-tools v{VERSION} — AI-native development automation` to `ai-dev-tools — AI-native development automation`.

### Files to Modify

| File | Change |
|---|---|
| `ai-dev-tools/skills/help/SKILL.md` | Remove plugin.json Read instruction, remove `v{VERSION}` from header |

The `/help` skill's usage line for `review-doc` will become stale after Part 1 changes the command syntax. Update the `review-doc` usage line in `help/SKILL.md` as part of Part 1 implementation (not Part 3).

### Success Criteria

- `/help` no longer reads `plugin.json` during execution.
- The header line printed by `/help` is `ai-dev-tools — AI-native development automation` (no version number).

---

## Part 4: Add Fixer to Single-Pass Review-Doc

### Problem

When `--max-iterations 1` (the default), review-doc skips the fixer entirely: "Dispatch 1 reviewer at max-model... Then dispatch 1 fact-checker... No fixer. Jump directly to Final Report." This means single-pass users get a review with findings but no automatic fixes applied, unlike review-code which runs review+fix in single-pass mode.

### Solution

Change the `--max-iterations 1` edge case to include the fixer between reviewer and fact-checker. The flow becomes: reviewer → fixer → fact-checker → Final Report. This aligns review-doc with review-code's single-pass behavior.

### Updated Flow

```
--max-iterations 1:
  1. Dispatch reviewer at max-model → writes tmp/review.json
  2. Dispatch fixer at max-model → reads tmp/review.json, applies fixes, writes tmp/fix-report.json
  3. Hash verification (before/after fixer). If hash is unchanged after fixer, print the same warning as in iterative mode and continue to fact-checker.
  4. Dispatch fact-checker at max-model → reads tmp/review.json, appends fact-check issues
  5. Jump to Final Report (reads tmp/fix-report.json to populate aggregate counts, same as in iterative mode)
```

### Files to Modify

| File | Change |
|---|---|
| `ai-dev-tools/skills/review-doc/SKILL.md` | Update `Edge Case: --max-iterations 1` section: remove "No fixer", add fixer dispatch between reviewer and fact-checker |

### What Does NOT Change

- Iterative flow (`--max-iterations > 1`) — already includes fixer
- review-code — already includes fixer in single-pass mode
- Fixer prompt, fact-checker prompt — unchanged
- All other edge cases (`--max-iterations 0`)

### Success Criteria

- `/review-doc docs/spec.md` (default single-pass) dispatches reviewer, then fixer, then fact-checker.
- `tmp/fix-report.json` is produced in single-pass mode.
- Findings with fixable issues are automatically applied to the document.
