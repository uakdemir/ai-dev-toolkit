# Token Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce review-doc token usage by ~50% through agent consolidation, model tiering, and reference-file hygiene across 4 skills.

**Architecture:** Merge parallel reviewer agents into a single combined reviewer that writes JSON directly. Eliminate synthesis agent. Make fact-checker a sequential terminal step. Apply section-only loading and template splitting to refactor skills.

**Tech Stack:** Markdown skill files (no code — all changes are to agent prompts, orchestration logic, and reference documents)

**Spec:** `docs/superpowers/specs/2026-03-29-token-optimization-design.md`

---

## File Structure

All paths relative to `ai-dev-tools/` (the plugin root).

| File | Action | Task |
|------|--------|------|
| `skills/review-doc/SKILL.md` | Edit (13 sections) | 1-3 |
| `skills/review-doc/prompts/reviewer.md` | Full rewrite | 4 |
| `skills/review-doc/agents/codebase-fact-checker.md` | Rewrite output section + add Serena | 5 |
| `skills/review-doc/agents/synthesis.md` | Delete | 6 |
| `skills/review-doc/agents/completeness-reviewer.md` | Delete | 6 |
| `skills/review-doc/agents/implementability-auditor.md` | Delete | 6 |
| `skills/review-code/SKILL.md` | Edit (2 lines) | 7 |
| `skills/refactor-to-monorepo/SKILL.md` | Edit (3 locations) | 8 |
| `skills/refactor-to-layers/SKILL.md` | Edit (3 locations) | 9 |
| `skills/refactor-to-layers/references/structural-test-templates.md` | Delete | 10 |
| `skills/refactor-to-layers/references/structural-test-templates/node.md` | Create | 10 |
| `skills/refactor-to-layers/references/structural-test-templates/dotnet.md` | Create | 10 |
| `skills/refactor-to-layers/references/structural-test-templates/python.md` | Create | 10 |
| `skills/refactor-to-layers/references/structural-test-templates/shared.md` | Create | 10 |

---

### Task 1: SKILL.md — Flags, Help Text, and Argument Parsing

**Files:**
- Modify: `skills/review-doc/SKILL.md` (lines 1-55)

- [ ] **Step 1: Update frontmatter description**

Read `skills/review-doc/SKILL.md`. The frontmatter `description` field (line 3) currently says:

```
description: "Use when reviewing analysis specs, design documents, or implementation plans for completeness, accuracy, and implementability. Supports single-pass review (--max-iterations 1) and iterative review-fix cycles with model tiering. Invoke with /review-doc <doc-path>."
```

Check if it contains "parallel" or "synthesizes". If so, remove those terms. If not, leave unchanged.

- [ ] **Step 2: Rewrite intro paragraph**

Line 8 currently reads:

```
Iterative document review with model tiering. Dispatches parallel agents to check completeness, fact-check against the codebase, and audit implementability. Synthesizes findings into structured JSON, fixes issues automatically between rounds, and produces a curated human-readable summary.
```

Replace with:

```
Iterative document review with model tiering. Dispatches a single merged reviewer to check completeness, consistency, implementability, and more. Fixes issues automatically between rounds. In the final round, a sequential fact-checker verifies claims against the codebase. Produces a curated human-readable summary.
```

- [ ] **Step 3: Update argument parsing usage line**

Line 17 currently:
```
/review-doc <doc-path> [--against <ref-path>] [--max-model <model>] [--mid-model <model>] [--min-model <model>] [--max-iterations N] [--effort <level>] [--help]
```

Replace with:
```
/review-doc <doc-path> [--against <ref-path>] [--max-model <model>] [--min-model <model>] [--max-iterations N] [--effort <level>] [--help]
```

- [ ] **Step 4: Update flag table**

Replace lines 20-28 (the flag table) with:

```markdown
| Flag | Default | Values | Purpose |
|---|---|---|---|
| `--against <ref-path>` | none | any file path | Reference document for cross-checking |
| `--max-model` | opus | opus, sonnet, haiku | Final round: reviewer + fixer + fact-checker |
| `--min-model` | sonnet | opus, sonnet, haiku | Early rounds: reviewer + fixer |
| `--max-iterations` | 1 | 0-10 | Safety cap (0 = skip, 1 = single-pass) |
| `--effort` | high | low, medium, high | Thoroughness level passed to all agents |
| `--help` | --- | --- | Print usage and exit |
```

- [ ] **Step 5: Rewrite --help output block**

Replace lines 34-55 (the entire help text block inside the code fence) with:

```
Usage: /review-doc <doc-path> [flags]

Iterative document review with model tiering. Dispatches a single merged
reviewer for completeness, consistency, and implementability. Fixes issues
automatically between rounds. Fact-checker runs sequentially in the final round.

Flags:
  --against <ref-path>    Reference document for cross-checking (default: none)
  --max-model <model>     Final round: reviewer + fixer + fact-checker (default: opus)
  --min-model <model>     Early rounds: reviewer + fixer      (default: sonnet)
  --max-iterations N      Safety cap, 0=skip, 1=single-pass  (default: 1)
  --effort <level>        Thoroughness: low, medium, high    (default: high)
  --help                  Print this help and exit

Examples:
  /review-doc docs/spec.md                          Single-pass review (default)
  /review-doc docs/spec.md --max-iterations 3       Iterative review, up to 3 rounds
  /review-doc docs/spec.md --against docs/plan.md   Review against reference document
  /review-doc docs/spec.md --min-model haiku        Faster early rounds (lower quality)
```

- [ ] **Step 6: Commit**

```bash
git add skills/review-doc/SKILL.md
git commit -m "refactor(review-doc): update flags, help text, and intro for single-reviewer architecture"
```

---

### Task 2: SKILL.md — Edge Cases and Iteration Flow

**Files:**
- Modify: `skills/review-doc/SKILL.md` (lines 77-117)

- [ ] **Step 1: Rewrite --max-iterations 1 edge case**

Replace lines 77-79 (the `## Edge Case: --max-iterations 1` section) with:

```markdown
## Edge Case: `--max-iterations 1`

Single-pass mode (default). Dispatch 1 reviewer at max-model — the reviewer reads the document, applies the combined checklist, and writes `tmp/review.json` directly. Then dispatch 1 fact-checker at max-model sequentially — it reads `tmp/review.json`, appends fact-check issues, and rewrites the file. No fixer. Jump directly to Final Report.
```

- [ ] **Step 2: Rewrite Iteration Flow section**

Replace lines 81-117 (the `## Iteration Flow` section including the guard, state, pseudocode, and the paragraph after the code block) with:

```markdown
## Iteration Flow

**Guard:** If `max_iterations == 1`, skip the loop below. Use the single-pass flow described above (Edge Case: --max-iterations 1).

**State:** The orchestrator maintains `is_final_gate = false` before the loop.

```
While iteration <= max_iterations OR is_final_gate:

  REVIEW PHASE:
    If NOT is_final_gate:
      Dispatch 1 reviewer at min-model -> writes tmp/review.json
    If is_final_gate:
      Dispatch 1 reviewer at max-model -> writes tmp/review.json

  VALIDATION:
    Recount severities from issues array (do not trust counts from JSON)

  STOP CHECK:
    If critical_count == 0 AND NOT is_final_gate:
      Set is_final_gate = true, continue to next iteration
    If is_final_gate (regardless of critical_count):
      Proceed to final-round fix + fact-check, then jump to Final Report.

  FIX PHASE:
    If NOT is_final_gate:
      Dispatch fixer at min-model
    If is_final_gate:
      Dispatch fixer at max-model
    Hash verification (before/after)
    Fix-report.json with dispositions

  FACT-CHECK PHASE (final gate only):
    Backup tmp/review.json before fact-checker runs.
    Dispatch fact-checker at max-model sequentially (after fixer completes).
    If fact-checker fails, fall back to backup with warning.

  ITERATION LOG -> tmp/iteration-N.md
  iteration += 1
```

The final gate is exempt from the `--max-iterations` cap: if criticals reach zero at iteration N == max_iterations, the final gate still runs as iteration N+1. Terminal output reports this as e.g. "5/4" (5 iterations with cap of 4).
```

- [ ] **Step 3: Commit**

```bash
git add skills/review-doc/SKILL.md
git commit -m "refactor(review-doc): rewrite edge cases and iteration flow for single-reviewer architecture"
```

---

### Task 3: SKILL.md — Agent Dispatch, Synthesis, Fixer, and Remaining Sections

**Files:**
- Modify: `skills/review-doc/SKILL.md` (lines 119-295)

- [ ] **Step 1: Rewrite Agent Dispatch (Early Rounds)**

Replace lines 119-137 (the `## Agent Dispatch (Early Rounds)` section) with:

```markdown
## Agent Dispatch (Early Rounds)

All `agents/` and `prompts/` paths in this section are relative to this skill's root directory (e.g., `ai-dev-tools/skills/review-doc/`).

The orchestrator dispatches a single reviewer agent at min-model.

Read `prompts/reviewer.md` and dispatch it as the reviewer agent prompt using the Agent tool: `Agent(prompt: <reviewer-prompt>, model: <min-model>)`.

The dispatch prompt must include:
- The effort level (`--effort` value)
- The document path to review
- The `--against` reference path (if provided)

No fact-checker in early rounds. Early rounds focus on structural/completeness issues that Sonnet handles well. Fact-checking on a noisy early draft wastes time.
```

- [ ] **Step 2: Rewrite Agent Dispatch (Final Gate)**

Replace lines 139-149 (the `## Agent Dispatch (Final Gate)` section) with:

```markdown
## Agent Dispatch (Final Gate)

Three agents dispatched **sequentially** at max-model:

1. **Merged Reviewer** — read `prompts/reviewer.md` and dispatch it as the reviewer agent prompt: `Agent(prompt: <reviewer-prompt>, model: <max-model>)`. The reviewer writes `tmp/review.json`.

2. **Fixer** — read `prompts/coder.md` and dispatch: `Agent(prompt: <fixer-prompt>, model: <max-model>)`. The fixer reads `tmp/review.json`, applies fixes, writes `tmp/fix-report.json`.

3. **Codebase Fact-Checker** — backup `tmp/review.json` first. Read `agents/codebase-fact-checker.md` and dispatch: `Agent(prompt: <fact-checker-prompt>, model: <max-model>)`. The fact-checker reads `tmp/review.json`, appends fact-check issues, sets `fact_check_claims` and `fact_check_accuracy`, rewrites the file. If the fact-checker fails, restore the backup and add a warning.

All three run sequentially — each depends on the previous step's output.
```

- [ ] **Step 3: Delete Synthesis section**

Delete lines 151-164 entirely (the `## Synthesis` section — from `## Synthesis` through `7. **Write** \`tmp/review.json\``).

- [ ] **Step 4: Update Fixer section**

Replace lines 166-182 (the `## Fixer` section) with:

```markdown
## Fixer

Dispatched as a single Agent. Model depends on the round:
- Early rounds: `Agent(prompt: <prompt>, model: <min-model>)` (Sonnet by default)
- Final round: `Agent(prompt: <prompt>, model: <max-model>)` (Opus by default)

Read `prompts/coder.md` for complete dispatch instructions.

The orchestrator reads `tmp/review.json`, extracts all issues grouped by severity (critical first, then high, then medium), and includes them in the Agent dispatch prompt as conversation context. The dispatch prompt must include:
- All issues grouped by severity
- The document path
- Reference document path (if `--against` provided)

The fixer reads the document content using the Read tool (not passed via dispatch context). Edits the document using the Edit tool for targeted fixes. Uses Write tool only for creating new files (like `tmp/fix-report.json`).

Produces `tmp/fix-report.json` with dispositions for every issue:
- `fixed` -- issue resolved
- `deferred` -- out of scope, with reason
- `pushed-back` -- reviewer finding is incorrect, with reason
```

- [ ] **Step 5: Add Fact-Checker Dispatch section**

After the Fixer section (and before `## Hash Verification`), add a new section:

```markdown
## Fact-Checker Dispatch

The fact-checker runs **sequentially after the fixer** in the final round only. It is always terminal — no fix phase follows.

Before dispatch, the orchestrator backs up `tmp/review.json` (the reviewer+fixer output). If the fact-checker fails, the orchestrator restores the backup and prints a warning.

Read `agents/codebase-fact-checker.md` and dispatch: `Agent(prompt: <fact-checker-prompt>, model: <max-model>)`.

The fact-checker:
1. Reads `tmp/review.json`
2. Verifies claims against the codebase using preferred Serena tools (see agent prompt)
3. Appends fact-check issues to the `issues` array with `category: "fact-check"`
4. Populates `fact_check_claims` and computes `fact_check_accuracy`
5. Recomputes `critical_count` and `high_count` from the full issues array
6. Rewrites `tmp/review.json`
```

- [ ] **Step 6: Update Iteration Log Format**

In the `## Iteration Log Format` section (line ~279-295), update the template:

Change line 286 from:
```
**Reviewer model:** mid-model or max-model
```
to:
```
**Reviewer model:** min-model or max-model
```

Change line 287 from:
```
**Agents:** 2 (completeness + implementability) or 3 (+ fact-checker)
```
to:
```
**Agents:** 1 (merged reviewer) or 1 + fact-checker (final round)
```

Change line 288 from:
```
**Fixer model:** max-model (or "N/A -- final gate, review only")
```
to:
```
**Fixer model:** min-model or max-model
```

- [ ] **Step 7: Commit**

```bash
git add skills/review-doc/SKILL.md
git commit -m "refactor(review-doc): rewrite dispatch, delete synthesis, add fact-checker section"
```

---

### Task 4: Rewrite prompts/reviewer.md as Merged Reviewer Agent

**Files:**
- Rewrite: `skills/review-doc/prompts/reviewer.md`

- [ ] **Step 1: Read source agent prompts**

Read all three files to collect the checklist content:
- `agents/completeness-reviewer.md` (lines 20-48: What to Check)
- `agents/implementability-auditor.md` (lines 20-55: What to Check)
- `agents/synthesis.md` (lines 19-71: Procedure + schema)

- [ ] **Step 2: Write the new prompts/reviewer.md**

Replace the entire file with the merged agent prompt:

```markdown
---
name: review-doc-reviewer
description: Single merged reviewer — checks completeness, consistency, implementability, writes structured JSON directly
---

You are an expert technical document reviewer. You combine completeness analysis, consistency checking, and implementability auditing in a single pass.

## Mission

Review the document for completeness gaps, internal contradictions, implementability problems, and structural weaknesses. Write findings directly to `tmp/review.json` as structured JSON.

## Inputs

- Document path: provided in dispatch prompt
- Reference document path: provided in dispatch prompt (or "none")
- Effort level: provided in dispatch prompt (low/medium/high)
- Read the project's CLAUDE.md for conventions and constraints

## What to Check

### Completeness
- TODOs, placeholders, "TBD", incomplete sections, trailing ellipsis
- Missing sections expected for the document type:
  - Specs: problem statement, success criteria, scope boundaries, error handling, what stays manual
  - Plans: verification steps, file paths for every task, commit boundaries, test commands
- References to external documents or decisions that don't exist or aren't linked

### Internal Consistency
- Does section A contradict section B?
- Are the same concepts named differently in different places?
- Do numbers/counts match (e.g., "3 agents" in overview but 4 described in detail)
- Are data flows consistent across sections?

### Scope
- Is this focused enough for a single implementation cycle?
- Does it cover multiple independent subsystems that should be separate specs/plans?
- YAGNI violations — features or complexity not justified by stated requirements

### Structure
- Is the document organized so an implementer can follow it sequentially?
- Are dependencies between sections clear?
- Is the level of detail consistent?

### Implementability — Vague Actions (specs)
- Requirements that can't be tested: "handle errors gracefully", "be performant"
- Success criteria that aren't measurable
- Ambiguous behavior: what happens when X fails? What's the default?
- Missing edge cases in user-facing flows

### Implementability — Vague Steps (plans)
- Steps without exact file paths: "update the handler" (which handler?)
- Steps without code: "add validation" (what validation?)
- Steps without expected output: "run the tests" (what should pass?)
- Missing intermediate verification checkpoints

### Dependency Gaps
- Step B assumes Step A produced something, but Step A doesn't specify that output
- A task creates a type/function that another task uses, but the interface isn't defined until later
- External dependencies mentioned but not specified (version? configuration?)

### Ordering Issues
- Steps that depend on each other but aren't ordered correctly
- Missing "do this before that" constraints

### AI Agent Pitfalls
- Instructions that rely on visual inspection
- Steps requiring interactive input
- Implicit knowledge assumed ("as usual", "the standard way")

### Acceptance Criteria
- For specs: can each requirement be verified with a concrete test?
- For plans: does each task have a clear "done" state?

### Cross-Reference Review (when reference document provided)
- Does the plan cover every requirement from the spec?
- Does the plan introduce scope not in the spec?
- Are spec decisions reflected in the plan's implementation steps?

## What to Ignore

- Grammar, punctuation, or formatting preferences
- Stylistic choices that don't affect implementation
- Minor wording improvements
- Architectural alternatives — the document has already chosen an approach

## Output Processing

After collecting all findings:

1. **Deduplicate** — merge findings that flag the same location AND same underlying deficiency. Keep the higher-confidence version.
2. **Filter** — drop findings with confidence < 40.
3. **Categorize by severity** using confidence score:
   - confidence >= 80 → `"critical"`
   - confidence 60-79 → `"high"`
   - confidence 40-59 → `"medium"`
4. **Cap at 20** — include all critical + high first, then fill with medium by descending confidence. If critical + high exceed 20, raise the cap to include all of them.
5. **Compute counts** — `critical_count` and `high_count` from the capped issues array.
6. **Set fact-check fields** — `fact_check_claims: []` and `fact_check_accuracy: 100` (the fact-checker handles these separately).

## JSON Output Format

Write `tmp/review.json` using the Write tool with this exact structure:

```json
{
  "critical_count": 0,
  "high_count": 0,
  "fact_check_accuracy": 100,
  "fact_check_claims": [],
  "issues": [
    {
      "severity": "critical",
      "category": "completeness",
      "location": "Section 3.2",
      "confidence": 85,
      "problem": "Description of what's wrong",
      "suggested_fix": "Concrete suggestion"
    }
  ]
}
```

Valid categories: completeness, consistency, scope, structure, vague-action, vague-step, dependency-gap, ordering-issue, agent-pitfall, missing-criteria, cross-reference.

**Do NOT include** any fields beyond the 6 required per issue (severity, category, location, confidence, problem, suggested_fix). No `id`, `title`, `description`, `metadata`, or `summary` fields.

## Confidence Scoring Guide

- **40-59:** Moderate gap — implementer might need to guess or ask questions
- **60-79:** Real issue — could lead to building the wrong thing or getting stuck
- **80-100:** Critical gap — guaranteed to cause implementation failure

## Tool Usage Rules
- Use Grep (not grep/rg via Bash) for searching file contents
- Use Glob (not find/ls via Bash) for finding files by pattern
- Use Read (not cat/head/tail via Bash) for reading file contents
- Use Write (not echo/cat heredoc via Bash) for writing files
- Do not use Bash for file operations — only for git log, git diff, git status commands
- NEVER run git push, git checkout, git switch, git branch -d/-D, or any command that modifies or switches branches
- NEVER run destructive git commands (reset --hard, clean -f)
```

- [ ] **Step 3: Commit**

```bash
git add skills/review-doc/prompts/reviewer.md
git commit -m "refactor(review-doc): rewrite reviewer.md as merged single-agent prompt with synthesis logic"
```

---

### Task 5: Rewrite Fact-Checker Output Contract + Add Serena

**Files:**
- Modify: `skills/review-doc/agents/codebase-fact-checker.md`

- [ ] **Step 1: Add Serena tool preferences**

After the `## What to Verify` section (before `## What to Ignore`), add:

```markdown
## Preferred Tools

For function/class/type verification, prefer Serena's semantic tools over file-level reads:

| Task | Preferred Tool | Fallback |
|------|---------------|----------|
| Check function signature | `find_symbol` | Read full file |
| Verify class has method X | `get_symbols_overview` | Read full file |
| Verify import relationship | `find_referencing_symbols` | Grep across files |
| Check file existence | Glob | Glob (unchanged) |
| Verify non-code content | Read | Read (unchanged) |

Use Serena tools when available. Fall back to Read/Grep when verifying non-code claims (config files, markdown content, line numbers).
```

- [ ] **Step 2: Replace output format section**

Replace the entire `## Output Format` section (lines 54-67) and the summary table instruction (lines 68-76) with:

```markdown
## Output Format

**Do NOT write markdown findings.** Instead, write structured JSON directly to `tmp/review.json`.

### Procedure

1. Read `tmp/review.json` (already written by the reviewer in this round).
2. For each claim you verify, record the verdict.
3. For each non-ACCURATE verdict, append an issue object to the `issues` array:
   - `"category": "fact-check"`
   - `"location"`: the document section where the claim appears
   - `"problem"`: the claim text + your evidence
   - `"suggested_fix"`: the correction
   - Set both `confidence` and `severity`:
     - INACCURATE → confidence 85, severity "critical"
     - STALE → confidence 70, severity "high"
     - PARTIALLY ACCURATE → confidence 50, severity "medium"
4. Populate the `fact_check_claims` array with ALL claims checked (including ACCURATE):
   ```json
   {"claim": "description of claim", "verdict": "ACCURATE"}
   ```
5. Compute `fact_check_accuracy`: `(accurate_count + 0.5 * partially_accurate_count) / total_claims * 100`, rounded to nearest integer.
6. Recompute `critical_count` and `high_count` from the full `issues` array (including your appended fact-check issues).
7. Rewrite `tmp/review.json` with the updated content using the Write tool.

ACCURATE verdicts are NOT converted to issues — they appear only in `fact_check_claims`.
```

- [ ] **Step 3: Update verification rules**

In the `## Verification Rules` section (line ~78), remove the last line:
```
- Report the overall accuracy rate at the end: "X of Y verifiable claims are accurate (Z%)"
```

This is now computed as `fact_check_accuracy` in the JSON, not as a text summary.

- [ ] **Step 4: Commit**

```bash
git add skills/review-doc/agents/codebase-fact-checker.md
git commit -m "refactor(review-doc): rewrite fact-checker output to JSON-append, add Serena tool preferences"
```

---

### Task 6: Delete Obsolete Agent Files

**Files:**
- Delete: `skills/review-doc/agents/synthesis.md`
- Delete: `skills/review-doc/agents/completeness-reviewer.md`
- Delete: `skills/review-doc/agents/implementability-auditor.md`

- [ ] **Step 1: Delete the three files**

```bash
git rm skills/review-doc/agents/synthesis.md
git rm skills/review-doc/agents/completeness-reviewer.md
git rm skills/review-doc/agents/implementability-auditor.md
```

- [ ] **Step 2: Verify fact-checker still exists**

```bash
ls skills/review-doc/agents/
```

Expected output: `codebase-fact-checker.md` (only file remaining)

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor(review-doc): delete synthesis, completeness-reviewer, implementability-auditor (merged into reviewer.md)"
```

---

### Task 7: review-code — Change Default --max-iterations to 1

**Files:**
- Modify: `skills/review-code/SKILL.md` (lines 20, 38)

- [ ] **Step 1: Update flag table default**

Line 20 currently:
```
| `--max-iterations` | 4 | 0-10 | Safety cap (0 = skip, 1 = single-pass) |
```

Change `4` to `1`:
```
| `--max-iterations` | 1 | 0-10 | Safety cap (0 = skip, 1 = single-pass) |
```

- [ ] **Step 2: Update --help output default**

Line 38 currently:
```
  --max-iterations N      Safety cap, 0=skip, 1=single-pass  (default: 4)
```

Change `4` to `1`:
```
  --max-iterations N      Safety cap, 0=skip, 1=single-pass  (default: 1)
```

- [ ] **Step 3: Commit**

```bash
git add skills/review-code/SKILL.md
git commit -m "refactor(review-code): change default --max-iterations from 4 to 1"
```

---

### Task 8: refactor-to-monorepo — Section-Only Reference Loading

**Files:**
- Modify: `skills/refactor-to-monorepo/SKILL.md` (lines 63, 298, 304)

- [ ] **Step 1: Update progressive disclosure instruction**

Line 63 currently:
```
**Progressive disclosure:** After tech stack selection, read `references/tech-stacks.md` and locate the section matching the selected stack. Use its entry points, import patterns, and tooling recommendations to guide all subsequent analysis. If "Other" was selected, skip loading tech-stacks.md and rely on the user's answers instead.
```

Replace with:
```
**Progressive disclosure:** After tech stack selection, read `references/tech-stacks.md`. Extract ONLY the section matching the selected stack (from its `##` heading through the next `##` heading or end of file). Discard all other stack sections from context. Do not retain unrelated stack information. Use the extracted section's entry points, import patterns, and tooling recommendations to guide all subsequent analysis. If "Other" was selected, skip loading tech-stacks.md and rely on the user's answers instead.
```

- [ ] **Step 2: Update Progressive Disclosure Schedule table rows**

Line 298 (first table row referencing tech-stacks.md):
```
| After tech stack selection | `references/tech-stacks.md` | Stack-specific patterns, validation files, tooling |
```

Replace the third column with:
```
| After tech stack selection | `references/tech-stacks.md` | Extract ONLY the matching stack section. Discard other stacks. |
```

Line 304 (second table row):
```
| Artifact generation: tooling | `references/tech-stacks.md` | Stack-specific monorepo tooling section |
```

Replace the third column with:
```
| Artifact generation: tooling | `references/tech-stacks.md` | Extract ONLY the matching stack's monorepo tooling section |
```

- [ ] **Step 3: Commit**

```bash
git add skills/refactor-to-monorepo/SKILL.md
git commit -m "refactor(refactor-to-monorepo): enforce section-only extraction for tech-stacks.md"
```

---

### Task 9: refactor-to-layers — Section-Only Reference Loading + Template References

**Files:**
- Modify: `skills/refactor-to-layers/SKILL.md` (lines 36, 72, 189, 220, 225, 258, 260)

- [ ] **Step 1: Update progressive disclosure instruction**

Line 72 currently:
```
**Progressive disclosure:** After tech stack selection, read `references/tech-stacks.md` and locate the matching stack section. If "Other" was selected, skip loading tech-stacks.md and rely on the user's answers instead.
```

Replace with:
```
**Progressive disclosure:** After tech stack selection, read `references/tech-stacks.md`. Extract ONLY the section matching the selected stack (from its `##` heading through the next `##` heading or end of file). Discard all other stack sections from context. Do not retain unrelated stack information. If "Other" was selected, skip loading tech-stacks.md and rely on the user's answers instead.
```

- [ ] **Step 2: Update Progressive Disclosure Schedule table row for tech-stacks.md**

Line 258:
```
| After tech stack selection | `references/tech-stacks.md` | Relevant stack section only |
```

Replace the third column with:
```
| After tech stack selection | `references/tech-stacks.md` | Extract ONLY the matching stack section. Discard other stacks. |
```

- [ ] **Step 3: Update reference list entry for structural-test-templates**

Line 36 currently:
```
`references/structural-test-templates.md` — per-stack test templates across 3 enforcement tiers
```

Replace with:
```
`references/structural-test-templates/` — per-stack test templates across 3 enforcement tiers (split by backend: `node.md`, `dotnet.md`, `python.md`, `shared.md`)
```

- [ ] **Step 4: Update structural-test-templates references in Phase 3**

Line 189 currently:
```
**Structural tests** — read `references/structural-test-templates.md`. Generate tests across 3 tiers:
```

Replace with:
```
**Structural tests** — read `references/structural-test-templates/<backend>.md` and `references/structural-test-templates/shared.md` (where `<backend>` is `node`, `dotnet`, or `python` based on the selected stack). Generate tests across 3 tiers:
```

- [ ] **Step 5: Update SCAFFOLD Mode references**

Line 220 currently:
```
**Read references.** Load `references/structural-test-templates.md` and `references/provider-patterns.md` for the selected stack.
```

Replace with:
```
**Read references.** Load `references/structural-test-templates/<backend>.md`, `references/structural-test-templates/shared.md`, and `references/provider-patterns.md` for the selected stack.
```

Line 225 currently:
```
Structural tests (all 3 tiers, using templates from `references/structural-test-templates.md`).
```

Replace with:
```
Structural tests (all 3 tiers, using templates from `references/structural-test-templates/<backend>.md` + `shared.md`).
```

- [ ] **Step 6: Update Progressive Disclosure Schedule row for structural-test-templates**

Line 260:
```
| Phase 3 Scaffolding | `references/structural-test-templates.md` | Relevant stack + tier |
```

Replace with:
```
| Phase 3 Scaffolding | `references/structural-test-templates/<backend>.md` + `shared.md` | Backend-specific templates + shared sections |
```

- [ ] **Step 7: Commit**

```bash
git add skills/refactor-to-layers/SKILL.md
git commit -m "refactor(refactor-to-layers): section-only tech-stacks loading, update structural-test-template paths"
```

---

### Task 10: Split structural-test-templates.md into Per-Backend Files

**Files:**
- Delete: `skills/refactor-to-layers/references/structural-test-templates.md`
- Create: `skills/refactor-to-layers/references/structural-test-templates/node.md`
- Create: `skills/refactor-to-layers/references/structural-test-templates/dotnet.md`
- Create: `skills/refactor-to-layers/references/structural-test-templates/python.md`
- Create: `skills/refactor-to-layers/references/structural-test-templates/shared.md`

- [ ] **Step 1: Read the source file**

Read `skills/refactor-to-layers/references/structural-test-templates.md` in full. Note the section boundaries:

| Section | Lines | Destination |
|---------|-------|-------------|
| Tier 1: `### Node.js (Jest/Vitest)` | 14-90 | node.md |
| Tier 1: `### .NET (xUnit/NUnit)` | 91-148 | dotnet.md |
| Tier 1: `### Python (pytest)` | 149-208 | python.md |
| Tier 2: `### Node.js: ESLint` | 211-404 | node.md |
| Tier 2: `### .NET: ArchUnitNET` | 405-501 | dotnet.md |
| Tier 2: `### Python: import-linter` | 502-567 | python.md |
| `## Allowlist Format` | 568-581 | shared.md |
| `## Conflict Resolution` | 582-604 | shared.md |
| `## Import Resolution Strategy` | 605-621 | shared.md |

- [ ] **Step 2: Create the directory**

```bash
mkdir -p skills/refactor-to-layers/references/structural-test-templates
```

- [ ] **Step 3: Create node.md**

Write `skills/refactor-to-layers/references/structural-test-templates/node.md` with:
- The file header: `# Structural Test Templates — Node.js`
- `## Tier 1: Import-Scanning Tests` — content from lines 14-90 (the Node.js Jest/Vitest subsection)
- `## Tier 2: Framework-Specific Enforcement` — content from lines 211-404 (the Node.js ESLint subsection)
- A single line: `## Tier 3` followed by: `Structural tests must run in CI before merge.`

- [ ] **Step 4: Create dotnet.md**

Write `skills/refactor-to-layers/references/structural-test-templates/dotnet.md` with:
- The file header: `# Structural Test Templates — .NET`
- `## Tier 1: Import-Scanning Tests` — content from lines 91-148 (the .NET xUnit/NUnit subsection)
- `## Tier 2: Framework-Specific Enforcement` — content from lines 405-501 (the .NET ArchUnitNET subsection)
- A single line: `## Tier 3` followed by: `Structural tests must run in CI before merge.`

- [ ] **Step 5: Create python.md**

Write `skills/refactor-to-layers/references/structural-test-templates/python.md` with:
- The file header: `# Structural Test Templates — Python`
- `## Tier 1: Import-Scanning Tests` — content from lines 149-208 (the Python pytest subsection)
- `## Tier 2: Framework-Specific Enforcement` — content from lines 502-567 (the Python import-linter subsection)
- A single line: `## Tier 3` followed by: `Structural tests must run in CI before merge.`

- [ ] **Step 6: Create shared.md**

Write `skills/refactor-to-layers/references/structural-test-templates/shared.md` with:
- The file header: `# Structural Test Templates — Shared`
- `## Allowlist Format` — content from lines 568-581
- `## Conflict Resolution` — content from lines 582-604
- `## Import Resolution Strategy` — content from lines 605-621

- [ ] **Step 7: Delete the original monolith**

```bash
git rm skills/refactor-to-layers/references/structural-test-templates.md
```

- [ ] **Step 8: Verify split completeness**

```bash
wc -l skills/refactor-to-layers/references/structural-test-templates/*.md
```

The total line count of the 4 new files should be approximately 621 (the original file's line count) plus 4 header lines.

- [ ] **Step 9: Commit**

```bash
git add skills/refactor-to-layers/references/structural-test-templates/
git commit -m "refactor(refactor-to-layers): split structural-test-templates.md into per-backend files"
```

---

### Task 11: Verification

- [ ] **Step 1: Verify deleted files are gone**

```bash
ls skills/review-doc/agents/
```

Expected: only `codebase-fact-checker.md` remains.

- [ ] **Step 2: Verify flag defaults**

```bash
grep -n "max-iterations.*1" skills/review-doc/SKILL.md skills/review-code/SKILL.md
```

Expected: both files show `--max-iterations` default of `1`.

```bash
grep -n "mid-model" skills/review-doc/SKILL.md
```

Expected: no matches (--mid-model fully removed).

```bash
grep -n "min-model.*sonnet" skills/review-doc/SKILL.md
```

Expected: matches showing --min-model defaults to sonnet.

- [ ] **Step 3: Verify structural-test-templates split**

```bash
ls skills/refactor-to-layers/references/structural-test-templates/
```

Expected: `dotnet.md  node.md  python.md  shared.md`

```bash
test -f skills/refactor-to-layers/references/structural-test-templates.md && echo "ERROR: monolith still exists" || echo "OK: monolith deleted"
```

Expected: `OK: monolith deleted`

- [ ] **Step 4: Verify no broken references**

```bash
grep -rn "completeness-reviewer.md\|implementability-auditor.md\|synthesis.md" skills/review-doc/
```

Expected: no matches (all references to deleted files removed from SKILL.md).

```bash
grep -rn "structural-test-templates.md" skills/refactor-to-layers/
```

Expected: no matches (all references updated to use directory path).

- [ ] **Step 5: Commit verification results**

No commit needed — this is a verification-only task.
