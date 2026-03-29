# Review Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge 4 review skills (review-doc, review-doc-ralph, review-code, review-code-ralph) into 2 unified skills with model tiering, Codex removal, and permission-prompt elimination.

**Architecture:** Two SKILL.md orchestrators drive iterative review-fix loops. review-doc uses three-tier models (Sonnet early, Opus final gate + fixer, Haiku synthesis) with 2-3 agent dispatch. review-code uses Opus throughout with a single agent. Both produce `tmp/review.json` (structured) + `tmp/review_summary.md` (human-readable). Agent prompts are standalone markdown files dispatched via the Agent tool.

**Tech Stack:** Claude Code markdown skills, Agent tool dispatching, Glob/Grep/Read/Write/Edit tools, git

**Spec:** `docs/superpowers/specs/2026-03-29-review-performance-design.md`

---

## File Structure

```
ai-dev-tools/
├── references/
│   └── backlog-entry-format.md              # Modify: update Source enum
├── skills/
│   ├── review-doc/
│   │   ├── SKILL.md                         # Full rewrite: iterative loop + model tiering
│   │   ├── agents/
│   │   │   ├── completeness-reviewer.md     # Modify: add tool constraints
│   │   │   ├── codebase-fact-checker.md     # Modify: add tool constraints
│   │   │   ├── implementability-auditor.md  # Modify: add tool constraints
│   │   │   └── synthesis.md                 # Create: dedup/filter/cap/write JSON
│   │   └── prompts/
│   │       ├── reviewer.md                  # Create: review-doc dispatch orchestration
│   │       └── coder.md                     # Create: review-doc fixer prompt
│   ├── review-code/
│   │   ├── SKILL.md                         # Full rewrite: iterative loop, single agent
│   │   └── prompts/
│   │       ├── reviewer.md                  # Create: single-agent code reviewer
│   │       └── coder.md                     # Create: code fixer prompt
│   ├── orchestrate/
│   │   └── SKILL.md                         # Modify: update output file references
│   └── help/
│       └── SKILL.md                         # Modify: update references + severity labels
│
│   # DELETE these directories/files:
│   ├── review-doc-ralph/                    # Delete entire directory
│   ├── review-code-ralph/                   # Delete entire directory
│   ├── review-doc/prompts/codex-reviewer.md # Delete
│   └── review-code/agents/openai.yaml       # Delete
```

---

### Task 1: Add Tool Constraints to Existing Agent Prompts

**Files:**
- Modify: `ai-dev-tools/skills/review-doc/agents/completeness-reviewer.md`
- Modify: `ai-dev-tools/skills/review-doc/agents/codebase-fact-checker.md`
- Modify: `ai-dev-tools/skills/review-doc/agents/implementability-auditor.md`

- [ ] **Step 1: Read current agent prompts**

Read all three files to understand their current structure. Each has frontmatter + Mission + Inputs + What to Check + Output Format + Confidence Scoring Guide sections.

- [ ] **Step 2: Append tool constraints to completeness-reviewer.md**

Append this block at the end of `ai-dev-tools/skills/review-doc/agents/completeness-reviewer.md` (after the "Confidence Scoring Guide" section):

```markdown
## Tool Usage Rules
- Use Grep (not grep/rg via Bash) for searching file contents
- Use Glob (not find/ls via Bash) for finding files by pattern
- Use Read (not cat/head/tail via Bash) for reading file contents
- Use Write (not echo/cat heredoc via Bash) for writing files
- Do not use Bash for file operations — only for git log, git diff, git status commands
- Do not use Bash with newline-separated commands, $() substitution, or shell expansion in paths
- NEVER run git push, git checkout, git switch, git branch -d/-D, or any command that modifies or switches branches
- NEVER run destructive git commands (reset --hard, clean -f)
```

- [ ] **Step 3: Append same block to codebase-fact-checker.md**

Same Tool Usage Rules block, appended at end.

- [ ] **Step 4: Append same block to implementability-auditor.md**

Same Tool Usage Rules block, appended at end.

- [ ] **Step 5: Remove `model: opus` from frontmatter of all three files**

The orchestrator now controls the model tier via the Agent tool's `model` parameter. Remove `model: opus` from the YAML frontmatter of each file. The frontmatter should keep `name` and `description` only.

- [ ] **Step 6: Add effort instruction to Inputs section of all three files**

In each file's `## Inputs` section, add after the existing bullet points:

```markdown
- The `effort` level (low/medium/high) — passed in the dispatch prompt. Interpret as: low = check only critical-severity issues, medium = check critical + high, high = full review.
```

- [ ] **Step 7: Verify changes**

Run: `grep -l "Tool Usage Rules" ai-dev-tools/skills/review-doc/agents/*.md`
Expected: all three files listed.

Run: `grep "model:" ai-dev-tools/skills/review-doc/agents/*.md`
Expected: no matches (model removed from frontmatter).

- [ ] **Step 8: Commit**

```bash
git add ai-dev-tools/skills/review-doc/agents/completeness-reviewer.md \
       ai-dev-tools/skills/review-doc/agents/codebase-fact-checker.md \
       ai-dev-tools/skills/review-doc/agents/implementability-auditor.md
git commit -m "feat(review-doc): add tool constraints + effort to agent prompts"
```

---

### Task 2: Create Synthesis Agent Prompt

**Files:**
- Create: `ai-dev-tools/skills/review-doc/agents/synthesis.md`

- [ ] **Step 1: Write synthesis.md**

Create `ai-dev-tools/skills/review-doc/agents/synthesis.md` with this content:

```markdown
---
name: synthesis-agent
description: Deduplicates, filters, categorizes, and caps review findings into a structured JSON output
---

You are a synthesis agent that processes raw review findings into a structured JSON report.

## Mission

Receive raw markdown findings from review agents, deduplicate, filter, categorize, cap, and produce `tmp/review.json`.

## Inputs

- Combined raw markdown findings from all review agents (provided as conversation context)
- `is_final_gate: true/false` — whether this is the final-gate round
- The `effort` level (low/medium/high) — interpret as: low = keep only critical issues, medium = keep critical + high, high = keep all severities >= 40 confidence

## Procedure

1. **Deduplicate** — merge findings that flag the same location AND same underlying deficiency. Keep the higher-confidence version. Merge suggested fixes if both are useful.

2. **Filter** — drop findings with confidence < 40.

3. **Categorize by severity:**
   - confidence >= 80 → `"critical"`
   - confidence 60-79 → `"high"`
   - confidence 40-59 → `"medium"`

4. **Fact-checker verdict mapping** (only when `is_final_gate` is true):
   Convert non-ACCURATE fact-checker verdicts to issue objects:
   - `"category": "fact-check"`
   - `"location"`: the document section where the claim appears
   - `"problem"`: the claim text + evidence from the fact-checker
   - `"suggested_fix"`: the correction from the fact-checker
   - Confidence mapping: INACCURATE → 85 (critical), STALE → 70 (high), PARTIALLY ACCURATE → 50 (medium)
   - ACCURATE verdicts are NOT converted to issues — they go in `fact_check_claims` only.

   Build the `fact_check_claims` array from ALL verdicts (including ACCURATE).

   When `is_final_gate` is false: set `fact_check_claims: []` and `fact_check_accuracy: 100`.

5. **Cap at 20** — include all critical + high first, then fill with medium by descending confidence. If critical + high exceed 20, raise the cap to include all of them (never drop criticals or highs).

6. **Compute counts and accuracy:**
   - `critical_count`: count issues with `severity: "critical"`
   - `high_count`: count issues with `severity: "high"`
   - When `is_final_gate` is true: `fact_check_accuracy = (accurate_count + 0.5 * partially_accurate_count) / total_claims * 100`, rounded to nearest integer.
   - When `is_final_gate` is false: `fact_check_accuracy = 100`.

7. **Write output** — use the Write tool to create `tmp/review.json` with this exact structure:

```json
{
  "critical_count": <integer>,
  "high_count": <integer>,
  "fact_check_accuracy": <integer 0-100>,
  "fact_check_claims": [
    {"claim": "<text>", "verdict": "ACCURATE|INACCURATE|PARTIALLY ACCURATE|STALE"}
  ],
  "issues": [
    {
      "severity": "critical|high|medium",
      "category": "<category>",
      "location": "<section in document>",
      "confidence": <integer 40-100>,
      "problem": "<description>",
      "suggested_fix": "<concrete suggestion>"
    }
  ]
}
```

Valid categories: completeness, consistency, scope, structure, fact-check, vague-action, vague-step, dependency-gap, ordering-issue, agent-pitfall, missing-criteria, cross-reference.

## Tool Usage Rules
- Use Grep (not grep/rg via Bash) for searching file contents
- Use Glob (not find/ls via Bash) for finding files by pattern
- Use Read (not cat/head/tail via Bash) for reading file contents
- Use Write (not echo/cat heredoc via Bash) for writing files
- Do not use Bash for file operations — only for git log, git diff, git status commands
- Do not use Bash with newline-separated commands, $() substitution, or shell expansion in paths
- NEVER run git push, git checkout, git switch, git branch -d/-D, or any command that modifies or switches branches
- NEVER run destructive git commands (reset --hard, clean -f)
```

- [ ] **Step 2: Verify file exists and has correct structure**

Run: `grep "name: synthesis-agent" ai-dev-tools/skills/review-doc/agents/synthesis.md`
Expected: match found.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/review-doc/agents/synthesis.md
git commit -m "feat(review-doc): create synthesis agent prompt"
```

---

### Task 3: Create review-doc Prompt Files

**Files:**
- Create: `ai-dev-tools/skills/review-doc/prompts/reviewer.md`
- Create: `ai-dev-tools/skills/review-doc/prompts/coder.md`

These are based on `review-doc-ralph/prompts/claude-reviewer.md` and `review-doc-ralph/prompts/claude-coder.md` respectively.

- [ ] **Step 1: Read the existing ralph prompts**

Read both:
- `ai-dev-tools/skills/review-doc-ralph/prompts/claude-reviewer.md`
- `ai-dev-tools/skills/review-doc-ralph/prompts/claude-coder.md`

Understand the placeholder system and dispatch pattern.

- [ ] **Step 2: Create reviewer.md**

Create `ai-dev-tools/skills/review-doc/prompts/reviewer.md`. This prompt is read by the SKILL.md orchestrator and describes how to dispatch review agents. The key changes from the ralph version:

1. **Remove Codex path** — Claude-only dispatch.
2. **Model tiering** — the SKILL.md controls which model via Agent tool `model` parameter. The prompt itself doesn't reference a specific model.
3. **2-agent vs 3-agent** — early rounds dispatch completeness + implementability only. Final gate adds fact-checker. The `is_final_gate` flag in the dispatch controls this.
4. **Separate synthesis** — findings go to synthesis agent (separate dispatch), not inline dedup.

The reviewer.md should contain:

```markdown
---
name: review-doc-reviewer
description: Orchestration prompt for dispatching review-doc agents
---

## Review Agent Dispatch

The orchestrator reads this file to understand how to dispatch review agents.

### Early Rounds (is_final_gate = false)

Dispatch **2 agents in parallel** using the Agent tool:

1. Read `agents/completeness-reviewer.md` and dispatch with:
   - Document path: {{DOC_PATH}}
   - Reference path: {{AGAINST_PATH}} (or "none")
   - Effort: {{EFFORT}}
   - Instruction: Read the project's CLAUDE.md for conventions

2. Read `agents/implementability-auditor.md` and dispatch with:
   - Document path: {{DOC_PATH}}
   - Reference path: {{AGAINST_PATH}} (or "none")
   - Effort: {{EFFORT}}
   - Instruction: Read the project's CLAUDE.md for conventions

### Final Gate (is_final_gate = true)

Dispatch **3 agents in parallel** using the Agent tool:

1. Completeness & Consistency Reviewer (same as above)
2. Implementability Auditor (same as above)
3. Read `agents/codebase-fact-checker.md` and dispatch with:
   - Document path: {{DOC_PATH}}
   - Effort: {{EFFORT}}
   - Instruction: Read the project's CLAUDE.md for conventions

### After Agents Return

Collect all raw markdown findings from the agents. Pass them to the synthesis agent:

Read `agents/synthesis.md` and dispatch with:
- Combined raw findings as conversation context
- `is_final_gate: {{IS_FINAL_GATE}}`
- Effort: {{EFFORT}}

The synthesis agent writes `tmp/review.json`.
```

- [ ] **Step 3: Create coder.md**

Create `ai-dev-tools/skills/review-doc/prompts/coder.md`. Based on `review-doc-ralph/prompts/claude-coder.md` with these changes:

1. **No Codex references** — Claude-only.
2. **Tool constraints added** — the Tool Usage Rules block.
3. **Input via conversation context** — issues are injected in the Agent dispatch prompt, not read from a file path.
4. **Reads document via Read tool** — the fixer reads the document itself.

```markdown
---
name: review-doc-coder
description: Fixer agent prompt for review-doc — applies fixes to documents based on review findings
---

You are a document fixer. You receive review findings and apply fixes to the document.

## Mission

Fix all issues from the review. Be surgical — change only what the findings require. Do not reorganize, restyle, or "improve" content beyond the findings.

## Inputs

- All issues grouped by severity (critical first, then high, then medium) — provided in conversation context
- Document path: {{DOC_PATH}}
- Reference document path: {{AGAINST_PATH}} (or "none")

## Procedure

1. Read the document at {{DOC_PATH}} using the Read tool.
2. If {{AGAINST_PATH}} is not "none", read the reference document.
3. For each issue (process critical first, then high, then medium):
   - If you can fix it with a targeted Edit: apply the fix.
   - If the fix is out of scope for this document: mark as `deferred` with reason.
   - If the reviewer finding is incorrect: mark as `pushed-back` with reason.
4. Write `tmp/fix-report.json` with dispositions for every issue:

```json
{
  "dispositions": [
    {
      "issue_index": 0,
      "action": "fixed",
      "detail": null
    },
    {
      "issue_index": 1,
      "action": "deferred",
      "detail": "Out of scope — belongs in implementation plan"
    },
    {
      "issue_index": 2,
      "action": "pushed-back",
      "detail": "Finding is incorrect — the section already covers this case"
    }
  ]
}
```

## Rules

- Every issue in the review MUST have a disposition entry (fixed, deferred, or pushed-back).
- Use the Edit tool for targeted fixes. Use Write only for creating `tmp/fix-report.json`.
- Do not change content that is not flagged by a finding.
- Do not add comments, TODOs, or placeholder text.
- Keep changes minimal — fix the finding, nothing more.

## Tool Usage Rules
- Use Grep (not grep/rg via Bash) for searching file contents
- Use Glob (not find/ls via Bash) for finding files by pattern
- Use Read (not cat/head/tail via Bash) for reading file contents
- Use Write (not echo/cat heredoc via Bash) for writing files
- Do not use Bash for file operations — only for git log, git diff, git status commands
- Do not use Bash with newline-separated commands, $() substitution, or shell expansion in paths
- NEVER run git push, git checkout, git switch, git branch -d/-D, or any command that modifies or switches branches
- NEVER run destructive git commands (reset --hard, clean -f)
```

- [ ] **Step 4: Verify both files exist**

Run: `ls ai-dev-tools/skills/review-doc/prompts/`
Expected: `coder.md  reviewer.md` (codex-reviewer.md still exists, deleted later)

- [ ] **Step 5: Commit**

```bash
git add ai-dev-tools/skills/review-doc/prompts/reviewer.md \
       ai-dev-tools/skills/review-doc/prompts/coder.md
git commit -m "feat(review-doc): create reviewer and coder prompt files"
```

---

### Task 4: Create review-code Prompt Files

**Files:**
- Create: `ai-dev-tools/skills/review-code/prompts/reviewer.md`
- Create: `ai-dev-tools/skills/review-code/prompts/coder.md`

Based on `review-code-ralph/prompts/claude-reviewer.md` and `review-code-ralph/prompts/claude-coder.md`.

- [ ] **Step 1: Read the existing ralph prompts**

Read both:
- `ai-dev-tools/skills/review-code-ralph/prompts/claude-reviewer.md`
- `ai-dev-tools/skills/review-code-ralph/prompts/claude-coder.md`

- [ ] **Step 2: Create reviewer.md**

Create `ai-dev-tools/skills/review-code/prompts/reviewer.md`. Key differences from ralph version:

1. **No Codex references** — Claude-only.
2. **Schema updated** — no `fact_check_accuracy` field. Required fields: `critical_count`, `high_count`, `issues`.
3. **Stat-only coverage instruction** added.
4. **Tool constraints** added.
5. **Effort parameter** replaces `{{CLAUDE_EFFORT}}`.

The file should contain the full prompt with these placeholders (matching the ralph convention):
- `{{GIT_DIFF}}` — the strategically trimmed diff
- `{{SPEC_CONTENT}}` — spec content or "No spec provided"
- `{{CLAUDE_MD}}` — CLAUDE.md content or "No CLAUDE.md found"
- `{{ADRS}}` — ADR content or "No ADRs found"
- `{{PREVIOUS_FINDINGS}}` — prior iteration findings or "First iteration"
- `{{ITERATION_NUM}}` — current iteration number
- `{{EFFORT}}` — effort level (low/medium/high)

The prompt structure:

```markdown
---
name: review-code-reviewer
description: Single-agent code reviewer for review-code — produces structured JSON findings
---

You are a code reviewer. Analyze the git diff below against the spec, CLAUDE.md, and ADRs to find bugs, architecture violations, spec drift, security issues, and test gaps.

## Effort Level: {{EFFORT}}

Interpret as: low = report only critical-severity issues, medium = report critical + high, high = full review of all severities.

## Context

**Iteration:** {{ITERATION_NUM}}
**Spec:** {{SPEC_CONTENT}}
**CLAUDE.md:** {{CLAUDE_MD}}
**ADRs:** {{ADRS}}
**Previous findings:** {{PREVIOUS_FINDINGS}}

## Git Diff

{{GIT_DIFF}}

## Important: Stat-Only File Coverage

For files shown as stat-only summaries (no full diff included), use the Read tool to inspect the changed files. Do not skip files just because their full diff was not included. These files exceeded the 3000-line diff budget but still need review.

## Review Categories

- **bug**: logic errors, unhandled edge cases, race conditions, data integrity, boundary errors
- **architecture**: conflicts with CLAUDE.md constraints or ADR decisions
- **spec-drift**: divergences from the spec (if provided)
- **security**: OWASP Top 10, injection risks, auth bypass, exposed secrets
- **test-gap**: risky logic without meaningful test coverage

## Do NOT Flag

- Style preferences without a linter rule
- Refactoring opportunities unrelated to correctness
- Missing comments or documentation
- Hypothetical requirements not in the spec

## Output

Write `tmp/review.json` using the Write tool. Use this exact schema:

```json
{
  "critical_count": <integer>,
  "high_count": <integer>,
  "issues": [
    {
      "severity": "critical|high|medium",
      "category": "bug|architecture|spec-drift|security|test-gap",
      "location": "path/to/file.ext:line_number",
      "confidence": <integer 40-100>,
      "problem": "<clear explanation>",
      "suggested_fix": "<concrete suggestion>"
    }
  ]
}
```

Severity mapping by confidence: >= 80 = critical, 60-79 = high, 40-59 = medium.
Only include findings with confidence >= 40.

## Tool Usage Rules
- Use Grep (not grep/rg via Bash) for searching file contents
- Use Glob (not find/ls via Bash) for finding files by pattern
- Use Read (not cat/head/tail via Bash) for reading file contents
- Use Write (not echo/cat heredoc via Bash) for writing files
- Do not use Bash for file operations — only for git log, git diff, git status commands
- Do not use Bash with newline-separated commands, $() substitution, or shell expansion in paths
- NEVER run git push, git checkout, git switch, git branch -d/-D, or any command that modifies or switches branches
- NEVER run destructive git commands (reset --hard, clean -f)
```

- [ ] **Step 3: Create coder.md**

Create `ai-dev-tools/skills/review-code/prompts/coder.md`. Key changes from ralph version:

1. **Commit message**: `fix(review-code): resolve N issues from iteration M` (not `fix(ralph):`)
2. **Add `{{SPEC_CONTENT}}` placeholder** for spec context.
3. **Keep `{{ALL_ISSUES}}` and `{{VERIFICATION_REGRESSIONS}}` placeholders.**
4. **Tool constraints** added.

```markdown
---
name: review-code-coder
description: Fixer agent for review-code — applies code fixes based on review findings
---

You are a code fixer. You receive review findings and verification regressions, and apply fixes to the codebase.

## Inputs

- Issues (grouped by severity, critical first): {{ALL_ISSUES}}
- Verification regressions: {{VERIFICATION_REGRESSIONS}}
- Spec content: {{SPEC_CONTENT}}

## Procedure

1. Read the source files referenced by each issue using the Read tool.
2. For each issue (process critical first, then high, then medium):
   - If you can fix it: apply the fix using the Edit tool.
   - If out of scope: mark as `deferred` with reason.
   - If the finding is incorrect: mark as `pushed-back` with reason.
3. For verification regressions: investigate the regression, read relevant files, and fix if possible.
4. Stage tracked file changes and commit:

```bash
git add -u
git commit -m "fix(review-code): resolve N issues from iteration M"
```

(Replace N with count of fixed issues, M with iteration number.)

5. Write `tmp/fix-report.json` with dispositions for every issue in review.json (NOT verification regressions):

```json
{
  "dispositions": [
    {"issue_index": 0, "action": "fixed", "detail": null},
    {"issue_index": 1, "action": "deferred", "detail": "Reason"},
    {"issue_index": 2, "action": "pushed-back", "detail": "Reason"}
  ]
}
```

## Rules

- Every issue must have a disposition entry.
- Use Edit for targeted code fixes. Use Write only for `tmp/fix-report.json`.
- Make minimal changes. Do not refactor surrounding code.
- Do not add error handling, comments, or types beyond what's needed for the fix.
- Read files before editing — understand the context.
- Use `git add -u` (tracked files only) to avoid committing verification artifacts.

## Tool Usage Rules
- Use Grep (not grep/rg via Bash) for searching file contents
- Use Glob (not find/ls via Bash) for finding files by pattern
- Use Read (not cat/head/tail via Bash) for reading file contents
- Use Write (not echo/cat heredoc via Bash) for writing files
- Do not use Bash for file operations — only for git log, git diff, git status commands
- Do not use Bash with newline-separated commands, $() substitution, or shell expansion in paths
- NEVER run git push, git checkout, git switch, git branch -d/-D, or any command that modifies or switches branches
- NEVER run destructive git commands (reset --hard, clean -f)
```

- [ ] **Step 4: Create prompts directory and verify**

```bash
mkdir -p ai-dev-tools/skills/review-code/prompts
ls ai-dev-tools/skills/review-code/prompts/
```

Expected: `coder.md  reviewer.md`

- [ ] **Step 5: Commit**

```bash
git add ai-dev-tools/skills/review-code/prompts/reviewer.md \
       ai-dev-tools/skills/review-code/prompts/coder.md
git commit -m "feat(review-code): create reviewer and coder prompt files"
```

---

### Task 5: Rewrite review-doc SKILL.md

**Files:**
- Modify: `ai-dev-tools/skills/review-doc/SKILL.md` (full rewrite)

This is the largest task — the review-doc orchestrator. Read the full spec before writing.

- [ ] **Step 1: Read the spec and existing files**

Read:
- `docs/superpowers/specs/2026-03-29-review-performance-design.md` (full spec)
- `ai-dev-tools/skills/review-doc/SKILL.md` (current version to replace)
- `ai-dev-tools/skills/review-doc-ralph/SKILL.md` (ralph features being merged)

- [ ] **Step 2: Write the new SKILL.md**

Replace `ai-dev-tools/skills/review-doc/SKILL.md` entirely. The file should have these sections, all derived from the spec:

**1. Frontmatter** (~5 lines)
```yaml
---
name: review-doc
description: "Use when reviewing analysis specs, design documents, or implementation plans for completeness, accuracy, and implementability. Supports single-pass review (--max-iterations 1) and iterative review-fix cycles with model tiering. Invoke with /review-doc <doc-path>."
---
```

**2. Overview** (~5 lines)
- Iterative document review with model tiering
- Dispatches parallel agents, synthesizes findings, fixes issues automatically
- Produces `tmp/review.json` (structured) + `tmp/review_summary.md` (human-readable)

**3. Argument Parsing** (~20 lines)
- Full argument table from spec (lines 24-36): `<doc-path>`, `--against`, `--max-model`, `--mid-model`, `--min-model`, `--max-iterations`, `--effort`, `--help`
- Include the `--help` output block verbatim from spec (lines 42-63)

**4. Setup** (~5 lines)
- Ensure `./tmp/` exists
- Delete stale files: `review.json`, `review_summary.md`, `fix-report.json`, `iteration-*.md`

**5. Pre-Flight Checks** (~5 lines)
- Validate `<doc-path>` exists
- If `--against`, validate `<ref-path>` exists

**6. Edge Case: `--max-iterations 0`** (~5 lines)
- Skip entirely, print "Review Doc Skipped" message

**7. Edge Case: `--max-iterations 1`** (~5 lines)
- Single-pass mode: final-gate config (3 agents at max-model), synthesize at min-model, no fix phase, jump to Final Report

**8. Iteration Flow** (~30 lines)
- Guard for max_iterations == 1
- State: `is_final_gate = false`
- While loop with pseudocode from spec (lines 94-122)
- Include the explanation about final-gate exemption from cap

**9. Agent Dispatch (Early Rounds)** (~15 lines)
- Path convention note: all `agents/` paths relative to skill root
- Model dispatch: `Agent(prompt: <prompt>, model: "sonnet")`
- Dispatch 2 agents: completeness-reviewer.md + implementability-auditor.md
- Read `prompts/reviewer.md` for dispatch instructions
- Include effort level and document path in each dispatch

**10. Agent Dispatch (Final Gate)** (~10 lines)
- Dispatch 3 agents at max-model (opus): adds codebase-fact-checker.md
- Read `prompts/reviewer.md` for dispatch instructions

**11. Synthesis** (~15 lines)
- Read `agents/synthesis.md` before dispatching
- Dispatch at min-model (haiku)
- Pass raw findings as conversation context + `is_final_gate` flag
- Agent writes `tmp/review.json`
- 7-step procedure summary (dedup, filter, categorize, verdict mapping, cap 20, accuracy, write)

**12. Fixer** (~15 lines)
- Dispatch at max-model (opus)
- Read `prompts/coder.md` for dispatch instructions
- Pass issues grouped by severity in dispatch prompt
- Fixer reads document via Read tool
- Produces `tmp/fix-report.json` with dispositions

**13. Hash Verification** (~5 lines)
- `sha256sum` before and after fix phase
- Warning if unchanged

**14. Output Artifacts** (~10 lines)
- Table of files: review.json, review_summary.md, fix-report.json, iteration-N.md

**15. Review Summary Format** (~20 lines)
- Full template from spec (lines 187-212)

**16. Terminal Output** (~15 lines)
- Full format from spec (lines 216-227)

**17. Final Report** (~10 lines)
- Orchestrator generates review_summary.md directly (no agent dispatch)
- Read review.json, extract top 10 from capped 20
- Compute aggregates from Cross-Iteration Tracking
- Apply status logic, print terminal output

**18. Backlog Writing** (~5 lines)
- review-doc does NOT write to past-issues-backlog.md
- Explain why (section-level locations, not code-level)

**19. Cross-Iteration Tracking** (~10 lines)
- Maintain `total_fixed` (per-severity), `total_deferred`, `total_pushed_back` counters
- Parse fix-report.json after each fix phase before overwrite

**20. Status Logic** (~5 lines)
- First match: Issues Found (criticals > 0 OR accuracy < 75), Approved with suggestions (accuracy < 90 OR remaining issues), Approved

**21. Iteration Log Format** (~15 lines)
- Full template from spec (lines 259-271)

**22. JSON Schema** (~30 lines)
- review-doc schema from spec (lines 587-631) — include inline for validation reference
- Note about fact_check_claims only on final gate

- [ ] **Step 3: Verify key sections exist**

Run: `grep "name: review-doc" ai-dev-tools/skills/review-doc/SKILL.md`
Expected: match in frontmatter.

Run: `grep "is_final_gate" ai-dev-tools/skills/review-doc/SKILL.md`
Expected: multiple matches (iteration flow, synthesis, agent dispatch).

Run: `grep "review_summary.md" ai-dev-tools/skills/review-doc/SKILL.md`
Expected: matches (output artifacts, final report, terminal output).

Run: `grep "codex" ai-dev-tools/skills/review-doc/SKILL.md`
Expected: no matches (Codex fully removed).

- [ ] **Step 4: Commit**

```bash
git add ai-dev-tools/skills/review-doc/SKILL.md
git commit -m "feat(review-doc): rewrite SKILL.md with model tiering and iterative loop"
```

---

### Task 6: Rewrite review-code SKILL.md

**Files:**
- Modify: `ai-dev-tools/skills/review-code/SKILL.md` (full rewrite)

- [ ] **Step 1: Read the spec and existing files**

Read:
- `docs/superpowers/specs/2026-03-29-review-performance-design.md` (review-code sections)
- `ai-dev-tools/skills/review-code/SKILL.md` (current version)
- `ai-dev-tools/skills/review-code-ralph/SKILL.md` (ralph features being merged)

- [ ] **Step 2: Write the new SKILL.md**

Replace `ai-dev-tools/skills/review-code/SKILL.md` entirely. Sections:

**1. Frontmatter** (~5 lines)
```yaml
---
name: review-code
description: "Use when reviewing recent commits for bugs, architecture violations, spec drift, security issues, and test gaps. Supports single-pass review and iterative review-fix-verify cycles. Invoke with /review-code <commit-count>."
---
```

**2. Overview** (~5 lines)
- Iterative code review with automatic fix cycles
- Single agent (max-model throughout), verification commands, backlog tracking

**3. Argument Parsing** (~20 lines)
- Full argument table from spec (lines 280-290)
- Include `--help` output block from spec (lines 296-315)

**4. Setup** (~5 lines)
- Ensure `./tmp/` exists
- Delete stale files (NOT past-issues-backlog.md)

**5. Pre-Flight Checks** (~15 lines)
- git rev-parse HEAD check
- main/master branch warning (blocking prompt, programmatic callers handle branch validation)
- Dirty working tree check (runs once, verification artifacts expected during loop)

**6. Edge Case: `--max-iterations 0`** (~5 lines)

**7. Edge Case: `--max-iterations 1`** (~10 lines)
- Single-pass review+fix from spec (lines 343-345)
- Verification regression handling within same iteration

**8. Iteration Flow** (~35 lines)
- For loop pseudocode from spec (lines 349-382)
- Note about review-code having no final-gate pattern

**9. Reviewer Agent** (~10 lines)
- Single agent at max-model
- Receives: diff (3000 lines), spec, CLAUDE.md, ADRs, previous findings
- Read `prompts/reviewer.md` for dispatch instructions
- Writes `tmp/review.json` directly

**10. Context Budgets** (~15 lines)
- Git diff: 3000 lines, stat + numstat, greedy inclusion, stat-only remainder
- Stat-only coverage instruction
- ADRs: 200 lines, newest first

**11. Fixer Agent** (~10 lines)
- Single agent at max-model
- Read `prompts/coder.md` for dispatch instructions
- Receives issues + regressions + spec
- Commits with `fix(review-code): resolve N issues from iteration M`

**12. Verification Commands** (~15 lines)
- Baseline before first iteration
- Run after each fix phase
- New non-zero exit = regression
- Synthetic criticals (category: "bug", severity: "critical", confidence: 85)
- Regression details persist between iterations

**13. ADR Discovery** (~10 lines)
- Fallback sequence: docs/architecture/adrs.md → docs/adrs/ → docs/adr/ → adr/
- Read all .md files in matched directory
- 200-line budget

**14. Backlog Writing** (~10 lines)
- Append to past-issues-backlog.md
- Cross-reference with fix-report.json
- Source: review-code
- No deduplication

**15. Diff Scope per Iteration** (~5 lines)
- Iteration 1: `git diff HEAD~N..HEAD`. If `HEAD~N` fails (repo has fewer than N commits), fall back to empty tree: `git diff $(git hash-object -t tree /dev/null)..HEAD`
- Iteration 2+: `git diff $before_sha..$after_sha`. If fixer made no commits, re-review original scope.

**16. Output Artifacts** (~10 lines)
- Table: review.json, review_summary.md, fix-report.json, past-issues-backlog.md, iteration-N.md

**17. Review Summary Format** (~20 lines)
- Full template from spec (lines 451-477) — includes Verification section

**18. Terminal Output** (~15 lines)
- Full format from spec (lines 481-493)

**19. Final Report** (~10 lines)
- Generate review_summary.md, compute aggregates, apply status logic, print terminal

**20. Cross-Iteration Tracking** (~10 lines)
- Same as review-doc + `fix_commit_shas` array

**21. Verification with `--max-iterations 1`** (~10 lines)
- From spec (lines 512-514)

**22. When `--verify` Is Not Provided** (~3 lines)

**23. Status Logic** (~5 lines)
- Error → Issues Found → Approved with suggestions → Approved

**24. Iteration Log Format** (~15 lines)
- Full template from spec (lines 530-543)

**25. JSON Schema** (~25 lines)
- review-code schema from spec (lines 637-663) — no fact_check_accuracy

**26. Error Handling** (~10 lines)
- From spec error handling table (lines 700-706)

- [ ] **Step 3: Verify key sections exist**

Run: `grep "name: review-code" ai-dev-tools/skills/review-code/SKILL.md`
Expected: match in frontmatter.

Run: `grep "fix(review-code)" ai-dev-tools/skills/review-code/SKILL.md`
Expected: match in fixer section.

Run: `grep "past-issues-backlog" ai-dev-tools/skills/review-code/SKILL.md`
Expected: matches in backlog writing.

Run: `grep "codex\|ralph" ai-dev-tools/skills/review-code/SKILL.md`
Expected: no matches.

Run: `grep "fact_check_accuracy" ai-dev-tools/skills/review-code/SKILL.md`
Expected: no matches (removed from review-code schema).

- [ ] **Step 4: Commit**

```bash
git add ai-dev-tools/skills/review-code/SKILL.md
git commit -m "feat(review-code): rewrite SKILL.md with iterative loop and verification"
```

---

### Task 7: Update Downstream Skills

**Files:**
- Modify: `ai-dev-tools/references/backlog-entry-format.md`
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md`
- Modify: `ai-dev-tools/skills/help/SKILL.md`

- [ ] **Step 1: Update backlog-entry-format.md**

Read `ai-dev-tools/references/backlog-entry-format.md`. Find the Source enum line:
```
- **Source:** review-code | review-code-ralph
```

Replace with:
```
- **Source:** review-code
```

- [ ] **Step 2: Update orchestrate/SKILL.md — output file references**

Read `ai-dev-tools/skills/orchestrate/SKILL.md`. Make these replacements throughout:

1. Replace all `tmp/review_analysis.md` with `tmp/review_summary.md`
2. Replace all `tmp/review_code.md` with `tmp/review_summary.md`

For the State Detection table, update:
- "Spec review findings" row: change `review_analysis.md` reference + `- Document:` field check to `review_summary.md` + `**Reviewed:**` field check
- "Code reviewed" row: change `review_code.md` reference to `review_summary.md` + `**Scope:**` field check

For Steps 2, 3 (spec review), update file references to `review_summary.md`.
For Steps 6-7 (code review), update file references to `review_summary.md` and note that structured data is in `review.json`.

For stale-review detection: update field parsing patterns:
- `- Document:` → `**Reviewed:**` (review-doc)
- Commit hash cross-referencing: read from `tmp/review.json` issues array `location` fields

- [ ] **Step 3: Update help/SKILL.md**

Read `ai-dev-tools/skills/help/SKILL.md`. Update:

1. Replace `review_analysis.md` with `review_summary.md`
2. Replace `review_code.md` with `review_summary.md`
3. Update skill family list: remove `review-doc-ralph` and `review-code-ralph` from the "Review & Quality" family
4. Update severity labels if any are hardcoded: "Important/Minor" → "high/medium"

- [ ] **Step 4: Verify changes**

Run: `grep "review_analysis.md\|review_code.md" ai-dev-tools/skills/orchestrate/SKILL.md ai-dev-tools/skills/help/SKILL.md`
Expected: no matches (all replaced).

Run: `grep "review-code-ralph\|review-doc-ralph" ai-dev-tools/skills/help/SKILL.md`
Expected: no matches.

Run: `grep "review-code-ralph" ai-dev-tools/references/backlog-entry-format.md`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add ai-dev-tools/references/backlog-entry-format.md \
       ai-dev-tools/skills/orchestrate/SKILL.md \
       ai-dev-tools/skills/help/SKILL.md
git commit -m "feat: update downstream skills for unified review output"
```

---

### Task 8: Delete Old Files

**Files:**
- Delete: `ai-dev-tools/skills/review-doc-ralph/` (entire directory)
- Delete: `ai-dev-tools/skills/review-code-ralph/` (entire directory)
- Delete: `ai-dev-tools/skills/review-doc/prompts/codex-reviewer.md`
- Delete: `ai-dev-tools/skills/review-code/agents/openai.yaml`

- [ ] **Step 1: Verify files exist before deletion**

```bash
ls -la ai-dev-tools/skills/review-doc-ralph/
ls -la ai-dev-tools/skills/review-code-ralph/
ls ai-dev-tools/skills/review-doc/prompts/codex-reviewer.md
ls ai-dev-tools/skills/review-code/agents/openai.yaml
```

- [ ] **Step 2: Delete ralph directories**

```bash
git rm -r ai-dev-tools/skills/review-doc-ralph/
git rm -r ai-dev-tools/skills/review-code-ralph/
```

- [ ] **Step 3: Delete Codex/OpenAI files**

```bash
git rm ai-dev-tools/skills/review-doc/prompts/codex-reviewer.md
git rm ai-dev-tools/skills/review-code/agents/openai.yaml
```

- [ ] **Step 4: Verify deletion**

Run: `ls ai-dev-tools/skills/review-doc-ralph/ 2>&1`
Expected: "No such file or directory"

Run: `ls ai-dev-tools/skills/review-code-ralph/ 2>&1`
Expected: "No such file or directory"

Run: `ls ai-dev-tools/skills/review-doc/prompts/codex-reviewer.md 2>&1`
Expected: "No such file or directory"

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: remove ralph skills and Codex/OpenAI files"
```

---

### Task 9: End-to-End Verification

- [ ] **Step 1: Verify file structure**

Run: `find ai-dev-tools/skills/review-doc ai-dev-tools/skills/review-code -type f | sort`

Expected output:
```
ai-dev-tools/skills/review-code/SKILL.md
ai-dev-tools/skills/review-code/prompts/coder.md
ai-dev-tools/skills/review-code/prompts/reviewer.md
ai-dev-tools/skills/review-doc/SKILL.md
ai-dev-tools/skills/review-doc/agents/codebase-fact-checker.md
ai-dev-tools/skills/review-doc/agents/completeness-reviewer.md
ai-dev-tools/skills/review-doc/agents/implementability-auditor.md
ai-dev-tools/skills/review-doc/agents/synthesis.md
ai-dev-tools/skills/review-doc/prompts/coder.md
ai-dev-tools/skills/review-doc/prompts/reviewer.md
```

- [ ] **Step 2: Verify no Codex/ralph references remain**

Run: `grep -r "codex\|ralph\|openai" ai-dev-tools/skills/review-doc/ ai-dev-tools/skills/review-code/`
Expected: no matches.

- [ ] **Step 3: Verify tool constraints in all agent/prompt files**

Run: `grep -l "Tool Usage Rules" ai-dev-tools/skills/review-doc/agents/*.md ai-dev-tools/skills/review-doc/prompts/*.md ai-dev-tools/skills/review-code/prompts/*.md`
Expected: all 7 files listed (3 agents + synthesis + 2 review-doc prompts + 2 review-code prompts).

- [ ] **Step 4: Verify JSON schemas present in SKILL.md files**

Run: `grep "critical_count" ai-dev-tools/skills/review-doc/SKILL.md ai-dev-tools/skills/review-code/SKILL.md`
Expected: matches in both (schema sections).

Run: `grep "fact_check_accuracy" ai-dev-tools/skills/review-code/SKILL.md`
Expected: no matches (removed from review-code).

Run: `grep "fact_check_claims" ai-dev-tools/skills/review-doc/SKILL.md`
Expected: matches (present in review-doc schema).

- [ ] **Step 5: Verify downstream updates**

Run: `grep "review_summary.md" ai-dev-tools/skills/orchestrate/SKILL.md`
Expected: matches replacing old review_analysis.md / review_code.md references.

Run: `grep "review-doc-ralph\|review-code-ralph" ai-dev-tools/skills/help/SKILL.md ai-dev-tools/references/backlog-entry-format.md`
Expected: no matches.

- [ ] **Step 6: Check spec success criteria**

Verify each criterion from the spec (lines 746-755):

1. `--max-iterations 1` section exists in both SKILL.md files
2. review-doc mentions mid-model (sonnet) for early rounds, max-model (opus) for final gate
3. review-code uses max-model throughout (single agent)
4. review-doc synthesis dispatches at min-model (haiku)
5. Fixer dispatches at max-model in both skills
6. All agent/prompt files have Tool Usage Rules block
7. review_summary.md format has "top 10" and aggregates
8. Verification commands, backlog, ADR discovery, diff budgets, pre-flight checks all present in review-code
9. No ralph skills exist
10. `--effort` flag documented in both skills

- [ ] **Step 7: Run smoke test (manual)**

Test single-pass review-doc:
```
/review-doc docs/superpowers/specs/2026-03-29-review-performance-design.md --max-iterations 1
```

Verify:
- Three agents dispatched at opus
- Synthesis at haiku
- `tmp/review.json` produced with `fact_check_claims` field
- `tmp/review_summary.md` produced with top 10 items + aggregates
- Terminal output matches expected format
- No permission prompts from agent tool misuse
