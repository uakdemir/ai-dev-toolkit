# Orchestrate & Session-Handoff Fast Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce orchestrate state detection from 20-30 tool calls to 2-4 and session-handoff git analysis from 6-8 to 2, by persisting state hints, deferring quality gates, conditionally loading reference files, and leveraging gitStatus context.

**Architecture:** Extract existing orchestrate sections into reference files (full-scan.md, quality-gates.md, strict-mode.md), rewrite SKILL.md core with hint-based fast-path detection (~150 lines), and rewrite session-handoff Step 1 to use gitStatus-derived starting HEAD.

**Tech Stack:** Markdown skill files (no code — these are AI agent instruction documents)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `ai-dev-tools/skills/orchestrate/SKILL.md` | Rewrite (~150 lines) | Slim core: help, Step 0, hint protocol, fast-path detection, conditional loading, condensed steps, error handling, inline cross-check |
| `ai-dev-tools/skills/orchestrate/references/full-scan.md` | Create (~80 lines) | Verbatim relocation of Feature Detection Algorithm, Matching Logic, Implementation Detection, Cross-Checking tmp/ Files, Ambiguity Handling |
| `ai-dev-tools/skills/orchestrate/references/quality-gates.md` | Create (~80 lines) | Verbatim relocation of Quality Gate Triggers, Detection of "Last Run", Presentation Format |
| `ai-dev-tools/skills/orchestrate/references/strict-mode.md` | Create (~100 lines) | Verbatim relocation of Execution Model Recommendation, Override Dispatch, Verification Gate, Structured Finishing |
| `ai-dev-tools/skills/session-handoff/SKILL.md` | Modify (Step 1 only) | Rewrite Git Analysis subsection with gitStatus fast-path + fallback |

---

### Task 1: Extract full-scan.md reference file

**Files:**
- Read: `ai-dev-tools/skills/orchestrate/SKILL.md:422-489` (State Detection section)
- Create: `ai-dev-tools/skills/orchestrate/references/full-scan.md`

- [ ] **Step 1: Create references/ directory**

```bash
mkdir -p ai-dev-tools/skills/orchestrate/references
```

- [ ] **Step 2: Read the source sections**

Read `ai-dev-tools/skills/orchestrate/SKILL.md` lines 420-489 to capture the full State Detection section containing:
- State Detection Overview (lines 422-440)
- Feature Detection Algorithm (lines 442-453)
- Matching Logic (lines 455-462)
- Implementation Detection (lines 464-473)
- Cross-Checking tmp/ Files (lines 475-482)
- Ambiguity Handling (lines 484-489)

- [ ] **Step 3: Write full-scan.md**

Write `ai-dev-tools/skills/orchestrate/references/full-scan.md` containing a verbatim copy of the above sections. Add a minimal header:

```markdown
# Full Scan Fallback

This file is loaded by orchestrate when the hint file is missing, malformed, or validation fails.
It contains the complete state detection algorithm.

---
```

Then paste the State Detection content verbatim (lines 422-489 from SKILL.md). Preserve all formatting, tables, subsection headers, and content exactly as-is. The only change: promote `###` headers to `##` since they're no longer nested under a parent section.

- [ ] **Step 4: Verify line count**

The file should be approximately 75-85 lines. Count lines to confirm.

- [ ] **Step 5: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/references/full-scan.md
git commit -m "feat(orchestrate): extract full-scan reference file

Verbatim relocation of Feature Detection Algorithm, Matching Logic,
Implementation Detection, Cross-Checking tmp/ Files, and Ambiguity
Handling from SKILL.md to references/full-scan.md."
```

---

### Task 2: Extract quality-gates.md reference file

**Files:**
- Read: `ai-dev-tools/skills/orchestrate/SKILL.md:493-533` (Quality Gate Triggers section)
- Create: `ai-dev-tools/skills/orchestrate/references/quality-gates.md`

- [ ] **Step 1: Read the source sections**

Read `ai-dev-tools/skills/orchestrate/SKILL.md` lines 491-533 to capture:
- Quality Gate Triggers (lines 493-505) — the table with 7 gate entries
- Detection of "Last Run" (lines 507-511)
- Presentation Format (lines 513-532) — includes the example output block

- [ ] **Step 2: Write quality-gates.md**

Write `ai-dev-tools/skills/orchestrate/references/quality-gates.md` with header:

```markdown
# Quality Gate Triggers

This file is loaded by orchestrate at Step 8, after the user confirms finalize.
It contains the quality gate baseline computation logic.

---
```

Then paste the Quality Gate Triggers content verbatim (lines 493-533 from SKILL.md). Promote `##`/`###` headers as needed for top-level context.

- [ ] **Step 3: Verify line count**

Target: ~75-85 lines. Count to confirm.

- [ ] **Step 4: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/references/quality-gates.md
git commit -m "feat(orchestrate): extract quality-gates reference file

Verbatim relocation of Quality Gate Triggers table, Detection of Last Run,
and Presentation Format from SKILL.md to references/quality-gates.md."
```

---

### Task 3: Extract strict-mode.md reference file

**Files:**
- Read: `ai-dev-tools/skills/orchestrate/SKILL.md:236-349,386-418` (strict-only sections)
- Create: `ai-dev-tools/skills/orchestrate/references/strict-mode.md`

- [ ] **Step 1: Read the source sections**

Read these sections from `ai-dev-tools/skills/orchestrate/SKILL.md`:
- Execution Model Recommendation (--strict only): lines 236-285
- Override Dispatch (--strict only): lines 287-349
- Verification Gate (--strict only): lines 386-391
- Structured Finishing (--strict only): lines 393-418

- [ ] **Step 2: Write strict-mode.md**

Write `ai-dev-tools/skills/orchestrate/references/strict-mode.md` with header:

```markdown
# Strict Mode Overrides

This file is loaded by orchestrate when `--strict` is active.
- At Step 5 onset: for execution model recommendation and override dispatch.
- At Step 8: for verification gate and structured finishing.

---
```

Then paste the four sections verbatim, in order:
1. Execution Model Recommendation
2. Override Dispatch
3. Verification Gate
4. Structured Finishing

Promote headers as needed. Preserve all content, tables, code blocks, and formatting exactly.

- [ ] **Step 3: Verify line count**

Target: ~95-110 lines. Count to confirm.

- [ ] **Step 4: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/references/strict-mode.md
git commit -m "feat(orchestrate): extract strict-mode reference file

Verbatim relocation of Execution Model Recommendation, Override Dispatch,
Verification Gate, and Structured Finishing from SKILL.md to
references/strict-mode.md."
```

---

### Task 4: Rewrite orchestrate SKILL.md core

This is the largest task. The current 599-line SKILL.md is rewritten to a ~150-line core that uses the hint file for fast-path detection and conditionally loads reference files.

**Files:**
- Rewrite: `ai-dev-tools/skills/orchestrate/SKILL.md`
- Reference (read-only): the spec at `docs/superpowers/specs/2026-03-30-orchestrate-fast-detection-design.md`

- [ ] **Step 1: Back up the current SKILL.md**

```bash
cp ai-dev-tools/skills/orchestrate/SKILL.md ai-dev-tools/skills/orchestrate/SKILL.md.bak
```

- [ ] **Step 2: Read the current SKILL.md in full**

Read `ai-dev-tools/skills/orchestrate/SKILL.md` to have complete context for the rewrite. Take note of:
- The frontmatter (lines 1-4) — preserve the `name` and `description` fields exactly
- Help text (lines 6-22) — preserve verbatim
- Argument parsing (lines 24-29) — preserve verbatim
- Step 0: Context Health Check (lines 79-111) — preserve verbatim
- Steps 1-8 detailed behavior — condense to ~5 lines each
- Error Handling (lines 536-562) — retain core entries
- Relationship to Other Skills (lines 565-598) — drop (not needed in core)

- [ ] **Step 3: Write the new SKILL.md**

Rewrite `ai-dev-tools/skills/orchestrate/SKILL.md` following the section order defined in spec Section 4.2. The new file must contain these sections in this exact order:

1. **Frontmatter + Help text + Argument parsing** (~25 lines)
   - Preserve the existing frontmatter, help text, and argument parsing verbatim.

2. **Context health check / Step 0** (~15 lines)
   - Preserve the existing Step 0 content verbatim.

3. **State hint file protocol** (~30 lines)
   - Hint file format (spec Section 1.1): YAML fields with descriptions
   - Write rules (spec Section 1.2): when to write, step-specific behavior table, finalized-to-Step-1 transition
   - Validation: read hint → compare HEAD → step-specific check

4. **Fast-path detection algorithm** (~25 lines)
   - The detection flow from spec Section 2.1: read hint → compare HEAD → validate
   - Include the finalized branch with inline feature name extraction
   - Include the "0 commits → full scan fallback" rule
   - Reference Section 2.2 step-specific validation table

5. **Conditional Loading** (~10 lines)
   - The routing instructions from spec Section 4.4 verbatim

6. **Steps 1-8 condensed** (~40 lines, ~5 lines each)
   - Per step: trigger condition, skill-invocation syntax, one key edge case
   - Drop: output formatting examples, rationale paragraphs, illustrative samples
   - Step 8: split into Phase 1 (pre-confirmation) and Phase 2 (post-confirmation) per spec Section 3.1
   - Include the `--strict` Step 8 flow reference to Section 3.2

7. **Error handling** (~10 lines)
   - Core entries from spec Error Handling table (orchestrate section)

8. **Inline cross-check rules** (~5 lines)
   - Reviewed field match + feature-name commit grep
   - Note that full algorithm is in references/full-scan.md

Target: ~150 lines total. If over 170, trim verbose descriptions. If under 130, check for missing spec content.

- [ ] **Step 4: Count lines and verify structure**

Count the lines. Verify all 8 sections are present. Check that:
- Frontmatter `name: orchestrate` is preserved
- Help text and `--help` handling are preserved
- Step 0 context health check is preserved verbatim
- The conditional loading section appears before the steps section
- Step 8 has Phase 1/Phase 2 split
- The `finalized`-to-Step-1 transition rule is in the write rules

- [ ] **Step 5: Verify reference file loading triggers**

Read the new SKILL.md and confirm the conditional loading section matches spec Section 4.4:
- `full-scan.md` loaded when hint missing or validation fails
- `strict-mode.md` loaded at Step 5 onset when --strict active
- `strict-mode.md` loaded at Step 8 when --strict active (if not already loaded)
- `quality-gates.md` loaded at Step 8 post-confirmation

- [ ] **Step 6: Delete the backup**

```bash
rm ai-dev-tools/skills/orchestrate/SKILL.md.bak
```

- [ ] **Step 7: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "feat(orchestrate): rewrite SKILL.md as slim core with hint-based detection

Replace 600-line monolithic SKILL.md with ~150-line core. Adds state hint
file protocol, fast-path detection algorithm, conditional reference loading,
and condensed step definitions. Quality gates deferred to post-confirmation.
Reference files loaded on demand."
```

---

### Task 5: Verify orchestrate file coherence

After Tasks 1-4, the orchestrate skill should be fully functional. This task verifies end-to-end coherence.

**Files:**
- Read: `ai-dev-tools/skills/orchestrate/SKILL.md`
- Read: `ai-dev-tools/skills/orchestrate/references/full-scan.md`
- Read: `ai-dev-tools/skills/orchestrate/references/quality-gates.md`
- Read: `ai-dev-tools/skills/orchestrate/references/strict-mode.md`

- [ ] **Step 1: Verify no content was lost**

Read each reference file and the new SKILL.md core. Verify that every section from the original SKILL.md appears in exactly one of the 4 files:

| Original section | Target file |
|---|---|
| Frontmatter, help, args | SKILL.md core |
| Step 0 | SKILL.md core |
| Steps 1-8 (condensed) | SKILL.md core |
| Step 5 --strict (Exec Model, Override Dispatch) | references/strict-mode.md |
| Step 8 --strict (Verification Gate, Structured Finishing) | references/strict-mode.md |
| State Detection (Feature Detection, Matching, Implementation, Cross-Checking, Ambiguity) | references/full-scan.md |
| Quality Gate Triggers (table, Last Run, Presentation) | references/quality-gates.md |
| Error Handling (core) | SKILL.md core |

- [ ] **Step 2: Cross-reference conditional loading triggers**

Verify each reference file's header describes when it's loaded, and the SKILL.md core's Conditional Loading section has a matching trigger entry for each file.

- [ ] **Step 3: Verify spec acceptance criteria**

Check against the spec's orchestrate acceptance criteria:
- [ ] SKILL.md core is ~150 lines (check: 130-170 range)
- [ ] Quality gate baselines only appear in quality-gates.md (not in core)
- [ ] Full scan algorithm only appears in full-scan.md (not in core)
- [ ] --strict override content only appears in strict-mode.md (not in core)
- [ ] Hint file protocol (format, write rules, validation) is in core
- [ ] Step 0 context health check is preserved verbatim

- [ ] **Step 4: Commit (only if fixes were needed)**

If any coherence issues were found and fixed:

```bash
git add ai-dev-tools/skills/orchestrate/
git commit -m "fix(orchestrate): resolve coherence issues in file split"
```

---

### Task 6: Rewrite session-handoff Step 1 Git Analysis

**Files:**
- Modify: `ai-dev-tools/skills/session-handoff/SKILL.md:38-56` (Step 1 Git Analysis subsection)

- [ ] **Step 1: Read the current session-handoff SKILL.md**

Read `ai-dev-tools/skills/session-handoff/SKILL.md` in full. Identify the exact Git Analysis subsection (lines 38-56) that needs rewriting.

- [ ] **Step 2: Write the replacement Git Analysis subsection**

Replace lines 38-56 (the `### Git Analysis (Factual Backbone)` subsection) with the optimized version from spec Section 5.2. The new content:

```markdown
### Git Analysis (Factual Backbone)

**Preflight:** Check if `gitStatus` is present in the conversation context (injected by Claude Code at session start).

**If `gitStatus` is present (typical case):**

Extract from `gitStatus`:
- **Branch name:** from "Current branch:" line
- **Starting HEAD:** the first commit SHA listed in the "Recent commits:" field (gitStatus lists commits most-recent-first) — this is HEAD at session start since gitStatus is injected before any work begins
- **Git repo:** confirmed by `gitStatus` presence

Run exactly 2 commands:
1. `git status --short` — current uncommitted state (may differ from session start)
2. `git log --oneline <start_head>..HEAD` — exact session commits (commits made between session start and now)

`git diff --stat HEAD` is dropped. `git status --short` is sufficient for the Git State section body (file paths with status codes replace the line-count format from `git diff --stat HEAD`).

If `git log` returns nothing (no new commits this session), `session_commits: 0`.

If `git log` fails for any reason — including ambiguous SHA, rebase, or force-push — fall back to `git log --oneline --since="midnight" -20`.

**If `gitStatus` is absent (non-standard invocation):**

Fall back to the full git analysis below. This covers edge cases like: session started without `gitStatus` injection, skill invoked outside Claude Code, or context was compressed and `gitStatus` is no longer visible.

**Full git analysis fallback (when `gitStatus` is absent):**

1. `git rev-parse --is-inside-work-tree` — preflight. If fails, skip all git commands and proceed to Conversation Analysis. Warn: "No git repo — handoff will be conversation-based only." Use non-git frontmatter defaults (see Error Handling).
2. If inside a git repo, check for commits: `git rev-parse --verify HEAD`. If HEAD is invalid (empty repo), skip `git log` and `git diff --stat HEAD` — use `session_commits: 0`.
3. `git branch --show-current` — current branch name. If empty (detached HEAD), use `git rev-parse --short HEAD`.
4. `git status --short` — list of uncommitted changes (staged + unstaged)
5. `git log --oneline -20` — recent commits for session detection (skip if no HEAD)
6. `git diff --stat HEAD` — all uncommitted changes summary (skip if no HEAD)

**Session commit detection (fallback only):**
1. `git log --oneline --since="midnight" -20` on the current branch — today's commits (capped at 20)
2. If no commits found or on a shared branch (main/master), fall back to last 10 commits on the current branch
3. Note "session boundary estimated" if using the fallback

> **Non-normative implementation note:** The agent has witnessed every commit it made during the session via tool call results. The `git log <start_head>..HEAD` output serves as the authoritative commit list, but the agent may cross-reference with its own memory of commits for richer Done item descriptions.
```

- [ ] **Step 3: Verify no other sections changed**

Read the modified file. Confirm:
- Frontmatter is unchanged
- Help text is unchanged
- Step 1 Conversation Analysis subsection (lines after Git Analysis) is unchanged
- Step 2 (Compose) is unchanged
- Step 3 (Write) is unchanged
- Error Handling table is unchanged

- [ ] **Step 4: Verify the fallback path is complete**

Check that the fallback section includes all 6 original git commands plus the session commit detection chain. This ensures the acceptance criterion "fall back to the exact Step 1 algorithm in session-handoff/SKILL.md" is met.

- [ ] **Step 5: Commit**

```bash
git add ai-dev-tools/skills/session-handoff/SKILL.md
git commit -m "feat(session-handoff): context-aware git minimization in Step 1

Replace 6-8 git commands with 2 when gitStatus is in context:
git status --short + git log <start_head>..HEAD.
Full fallback preserved for non-standard invocations."
```

---

### Task 7: Update spec status to Approved

**Files:**
- Modify: `docs/superpowers/specs/2026-03-30-orchestrate-fast-detection-design.md:4`

- [ ] **Step 1: Update spec status**

Change `**Status:** Draft` to `**Status:** Approved` on line 4 of the spec.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-03-30-orchestrate-fast-detection-design.md
git commit -m "docs: mark orchestrate fast detection spec as Approved"
```
