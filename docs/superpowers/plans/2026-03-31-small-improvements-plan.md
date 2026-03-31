# Small Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four independent prompt-engineering improvements: multi-file review-doc, quality gates simplification, help version removal, and single-pass fixer.

**Architecture:** Pure markdown/prompt changes to Claude Code plugin skills. No runtime code, no tests. Each task modifies 1-2 files with surgical edits.

**Tech Stack:** Markdown, Claude Code skill prompts

**Spec:** `docs/superpowers/specs/2026-03-31-small-improvements-design.md`

---

### Task 1: Remove version from help skill (Part 3)

**Files:**
- Modify: `ai-dev-tools/skills/help/SKILL.md`

- [ ] **Step 1: Remove the plugin.json read instruction**

Replace the entire instruction block at the top of the file (lines 6-9):

```
You MUST read `ai-dev-tools/.claude-plugin/plugin.json` using the Read tool to get the current version number from the `"version"` field — do NOT guess or assume the version. Output the following text (replacing `{VERSION}` with the exact version from that file), then stop:
```

With:

```
Output the following text, then stop:
```

- [ ] **Step 2: Remove version from header line**

In the `<help-output>` block, change:

```
ai-dev-tools v{VERSION} — AI-native development automation
```

To:

```
ai-dev-tools — AI-native development automation
```

- [ ] **Step 3: Update review-doc usage line for Part 1**

In the COMMANDS (ORCHESTRATE FLOW) section, change:

```
  /review-doc <path>        Review specs and design documents
```

To:

```
  /review-doc <path> [...]  Review specs and design documents
```

- [ ] **Step 4: Commit**

```
git add ai-dev-tools/skills/help/SKILL.md
git commit -m "fix(help): remove version read, update review-doc usage line"
```

---

### Task 2: Simplify quality gates (Part 2)

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/references/quality-gates.md`

- [ ] **Step 1: Replace the entire file content**

Rewrite `ai-dev-tools/skills/orchestrate/references/quality-gates.md` with:

```markdown
# Quality Gate Triggers

This file is loaded by orchestrate at Step 8, after the user confirms finalize.
It contains the quality gate baseline computation logic.

---

## Unified Commit-Count Heuristic

All commit-based gates use a single git command with the plan hash as baseline.

### Algorithm

```
plan_hash = read from tmp/orchestrate-state.md
if plan_hash is empty → skip quality gates entirely (nothing was implemented)

Run `git log --oneline {plan_hash}..HEAD` and count the number of returned
lines as `commit_count` (count in the orchestrator, not via shell pipe).

If the git log command fails → skip quality gates entirely and warn:
"Could not compute commit count from plan hash. Quality gates skipped."

Recommendations (check all, collect matches):
  convention-enforcer:  commit_count > 7   [Warning]
  test-audit:           commit_count > 10  [Warning]
  document-for-ai:      commit_count > 5   [Warning]
  consolidate:          commit_count > 40  [Info]
  session-handoff:      [Info] (not git-based, see below)
```

Threshold rationale: original thresholds were file-based (e.g., convention-enforcer at >20 files). Using ~3 files per commit, commit thresholds = file thresholds / 3, rounded.

### Session-Handoff Detection

The session-handoff gate is not git-based and is unaffected by the commit count heuristic. It triggers when the conversation exceeds ~50 exchanges or the user mentions context pressure. This is a subjective heuristic the orchestrating LLM evaluates based on conversation length.

### Recommendation Messages

Each gate uses commit count in its message:

| Gate | Message |
|---|---|
| convention-enforcer | "{N} commits since plan → run /convention-enforcer (recommended)" |
| test-audit | "{N} commits since plan → run /test-audit" |
| document-for-ai | "{N} commits since plan → run /document-for-ai" |
| consolidate | "{N} commits since plan → run /consolidate" |
| session-handoff | "Long conversation. Consider /session-handoff before next feature" |

## Presentation Format

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

- Warnings first, info second.
- Max 3 recommendations at a time. If more than 3 gates trigger, show the top 3 by priority.
- Priority order: convention-enforcer > test-audit > document-for-ai > consolidate > session-handoff.
- User can always choose "something else" — never locked into recommendations.
- "What's next?" always offers 3 options: next feature, run a recommendation, or something else.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `git log` command fails | Skip all quality gates, warn: "Could not compute commit count from plan hash. Quality gates skipped." |
| plan_hash empty | Skip all quality gates (nothing was implemented). |
```

- [ ] **Step 2: Commit**

```
git add ai-dev-tools/skills/orchestrate/references/quality-gates.md
git commit -m "feat(orchestrate): simplify quality gates to single commit-count heuristic"
```

---

### Task 3: Add fixer to single-pass review-doc (Part 4)

**Files:**
- Modify: `ai-dev-tools/skills/review-doc/SKILL.md`

- [ ] **Step 1: Update the --max-iterations 1 edge case**

Replace the `## Edge Case: --max-iterations 1` section content (line 77):

```
Single-pass mode (default). Dispatch 1 reviewer at max-model — the reviewer reads the document, applies the combined checklist, and writes `tmp/review.json` directly. Then dispatch 1 fact-checker at max-model sequentially — it reads `tmp/review.json`, appends fact-check issues, and rewrites the file. No fixer. Jump directly to Final Report.
```

With:

```
Single-pass mode (default). Three agents dispatched sequentially at max-model:

1. **Reviewer** — reads the document, applies the combined checklist, writes `tmp/review.json` directly.
2. **Fixer** — reads `tmp/review.json`, applies fixes to the document, writes `tmp/fix-report.json` with dispositions. Hash verification before/after: if hash is unchanged after fixer, print `Warning: document was not modified. Proceeding to next review.` and continue.
3. **Fact-checker** — reads `tmp/review.json`, appends fact-check issues, rewrites the file.

Then jump to Final Report. In single-pass mode, the Final Report step reads `tmp/fix-report.json` to populate aggregate counts, same as in iterative mode.
```

- [ ] **Step 2: Commit**

```
git add ai-dev-tools/skills/review-doc/SKILL.md
git commit -m "feat(review-doc): add fixer to single-pass mode"
```

---

### Task 4: Multi-file argument parsing in review-doc SKILL.md (Part 1)

**Files:**
- Modify: `ai-dev-tools/skills/review-doc/SKILL.md`

- [ ] **Step 1: Update the argument parsing table**

Change the description frontmatter (line 2):

```
description: "Use when reviewing analysis specs, design documents, or implementation plans for completeness, accuracy, and implementability. Supports single-pass review (--max-iterations 1) and iterative review-fix cycles with model tiering. Invoke with /review-doc <doc-path>."
```

To:

```
description: "Use when reviewing analysis specs, design documents, or implementation plans for completeness, accuracy, and implementability. Supports single-pass review (--max-iterations 1) and iterative review-fix cycles with model tiering. Invoke with /review-doc <path1> [path2 ...] or /review-doc <directory/>."
```

- [ ] **Step 2: Update argument parsing syntax**

Change the argument parsing code block (line 17):

```
/review-doc <doc-path> [--against <ref-path>] [--max-model <model>] [--min-model <model>] [--max-iterations N] [--effort <level>] [--help]
```

To:

```
/review-doc <path1> [path2 ...] [--against <ref-path>] [--max-model <model>] [--min-model <model>] [--max-iterations N] [--effort <level>] [--help]
/review-doc <directory/>       [--against <ref-path>] [...]
```

- [ ] **Step 3: Update --help output block**

Replace the entire `--help` output block with the spec's updated version:

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

- [ ] **Step 4: Update Pre-Flight Checks for multi-file**

Replace the Pre-Flight Checks section with:

```markdown
## Pre-Flight Checks

1. Tokens before the first flag (`--*`) are input paths.
2. If no input paths are provided: print `"Error: no input paths provided."` and exit.
3. If a path is a directory: expand to all `*.md` files inside it (recursive, sorted alphabetically, max 20 files). If more than 20 `.md` files are found: print `"Error: directory contains more than 20 .md files. Use explicit paths to select a subset."` and exit. If zero `.md` files: print `"Error: directory contains no .md files."` and exit.
4. All explicit file paths are validated for existence. If any are missing: print `"Error: file not found: <path>"` for each and exit.
5. `--against` must be a file path, not a directory. If a directory is passed: print `"Error: --against value must be a file, not a directory."` and exit.
6. If `--against` provided, validate `<ref-path>` exists. If not: `"Error: reference document not found: <ref-path>"`
```

- [ ] **Step 5: Update --max-iterations 0 edge case output**

Change `Reviewed: <doc-path>` in the `--max-iterations 0` output to:

```
  Reviewed: <doc-paths comma-separated> (<N> files)
```

For single file, keep `Reviewed: <doc-path>` (no count suffix).

- [ ] **Step 6: Update Agent Dispatch sections**

In all Agent Dispatch sections, change references from 'the document path' to 'the document paths list'. Update dispatch prompt format to use:

```
Documents to review:
- path1.md
- path2.md
```

For single file, use the same list format with one entry.

- [ ] **Step 7: Update Review Summary Format**

Change the `**Reviewed:**` line in the Review Summary Format from:

```
**Reviewed:** <doc-path>
```

To:

```
**Reviewed:** <file1.md, file2.md, ...> (N files)
```

Single file: show just the path (no count suffix).

- [ ] **Step 8: Update Terminal Output**

Change the `Reviewed:` line in Terminal Output from:

```
  Reviewed: <doc-path>
```

To support three formats:
- Single file: `Reviewed: <doc-path>` (unchanged)
- Directory: `Reviewed: <directory/> (N files)`
- Explicit multi-file: `Reviewed: <a.md, b.md, c.md> (N files)`

- [ ] **Step 9: Commit**

```
git add ai-dev-tools/skills/review-doc/SKILL.md
git commit -m "feat(review-doc): add multi-file argument parsing and output formats"
```

---

### Task 5: Update review-doc prompt files for multi-file (Part 1)

**Files:**
- Modify: `ai-dev-tools/skills/review-doc/prompts/reviewer.md`
- Modify: `ai-dev-tools/skills/review-doc/prompts/coder.md`
- Modify: `ai-dev-tools/skills/review-doc/agents/codebase-fact-checker.md`

- [ ] **Step 1: Update reviewer.md Mission section**

Change:

```
Review the document for completeness gaps, internal contradictions, implementability problems, and structural weaknesses. Write findings directly to `tmp/review.json` as structured JSON.
```

To:

```
Review each document for completeness gaps, internal contradictions, implementability problems, and structural weaknesses. When multiple documents are provided, also check cross-file consistency. Write findings directly to `tmp/review.json` as structured JSON.
```

- [ ] **Step 2: Update reviewer.md Inputs section**

Change:

```
- Document path: provided in dispatch prompt
```

To:

```
- Document paths: newline-separated list provided in dispatch prompt (may be a single path)
```

- [ ] **Step 3: Add cross-file consistency check to reviewer.md**

Add a new subsection under `## What to Check`, after the existing subsections:

```markdown
### Cross-File Consistency (when multiple documents provided)
- Do documents reference the same concepts with different names?
- Do counts or numbers match across documents (e.g., "6 modules" in one file but 5 listed in another)?
- Are internal cross-references valid (e.g., "see module-map.md" — does that file exist in the set)?
- Use the `cross-reference` category for cross-file issues.
- Include both filenames in the location field: `strategy.md + module-map.md > Module counts`
```

- [ ] **Step 4: Add location field note to reviewer.md**

Add after the Inputs section:

```markdown
**Location format:** When multiple documents are provided, prefix each finding's location with the filename: `strategy.md > Section 3.2`. For cross-file findings, use: `strategy.md + module-map.md > Module counts`. When only one document is provided, omit the filename prefix.
```

- [ ] **Step 5: Update coder.md placeholders**

In `ai-dev-tools/skills/review-doc/prompts/coder.md`, replace all occurrences of `{{DOC_PATH}}` with `{{DOC_PATHS}}` (3 occurrences: lines 15, 20, and the Inputs description). Update the Procedure step 1 from "Read the document at {{DOC_PATHS}}" to "Read each document listed in {{DOC_PATHS}}".

- [ ] **Step 6: Update codebase-fact-checker.md Mission**

Change:

```
Fact-check every verifiable claim in the document against the actual source code. Find stale references, wrong line numbers, incorrect function signatures, and architectural claims that don't match reality.
```

To:

```
Fact-check every verifiable claim in each document against the actual source code. When multiple documents are provided, verify cross-document references as well. Find stale references, wrong line numbers, incorrect function signatures, and architectural claims that don't match reality.
```

- [ ] **Step 7: Update codebase-fact-checker.md Inputs**

Change:

```
- A document to review (path provided in dispatch prompt)
```

To:

```
- Documents to review (newline-separated list of paths provided in dispatch prompt; may be a single path)
```

- [ ] **Step 8: Commit**

```
git add ai-dev-tools/skills/review-doc/prompts/reviewer.md ai-dev-tools/skills/review-doc/prompts/coder.md ai-dev-tools/skills/review-doc/agents/codebase-fact-checker.md
git commit -m "feat(review-doc): update prompts for multi-file support"
```
