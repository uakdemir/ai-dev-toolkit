# orchestrate --strict Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `--strict` flag to orchestrate that enriches Step 5 with intelligent execution model selection + prompt-level overrides and Step 8 with verification gates + structured completion options.

**Architecture:** Single-file modification to `ai-dev-tools/skills/orchestrate/SKILL.md`. The flag adds conditional behavior to Steps 5 and 8 via inline sections. Prompt-level overrides are dispatched to superpowers skills without modifying their files.

**Tech Stack:** Markdown skill definition (no code, no tests — this is a process skill)

**Spec:** `docs/superpowers/specs/2026-03-30-orchestrate-strict-mode-design.md`

---

### Task 1: Add --strict flag parsing and help text

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md:6-16` (help-text block)
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md:16` (argument parsing line)

- [ ] **Step 1: Update the help-text block**

Replace the current `<help-text>` block (lines 6-14) with:

```markdown
<help-text>
orchestrate — Manage your full development cycle

USAGE
  /orchestrate [--strict]

FLAGS
  --strict    Enable quality discipline: TDD enforcement, verification
              gates, per-task spec compliance review, intelligent execution
              model selection, and structured completion options.
              Recommended for features where correctness matters more
              than speed.

EXAMPLES
  /orchestrate                       Detect state and suggest next step
  /orchestrate --strict              Detect state with quality discipline
</help-text>
```

- [ ] **Step 2: Update the argument parsing instruction**

Replace line 16:
```
If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.
```
With:
```
Parse arguments: if `--help` is present, output ONLY the text inside <help-text> tags above verbatim and exit. If `--strict` is present, set strict mode active for this invocation. Both flags can coexist with `--help` taking priority.
```

- [ ] **Step 3: Add strict mode banner after the argument parsing line**

Insert after the argument parsing instruction:

```markdown
**Strict mode banner:** When `--strict` is active, print before any state detection:
```
Mode: strict (TDD + verification + spec compliance + structured completion)
```
```

- [ ] **Step 4: Verify the help text renders correctly**

Read `ai-dev-tools/skills/orchestrate/SKILL.md` lines 6-30 and confirm:
- `<help-text>` block has USAGE with `[--strict]`
- FLAGS section with `--strict` description
- EXAMPLES section with both invocations
- Argument parsing instruction handles both `--help` and `--strict`
- Strict mode banner is present

- [ ] **Step 5: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "feat(orchestrate): add --strict flag parsing and help text"
```

---

### Task 2: Add Step 5 preamble — execution model recommendation

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md:132-141` (Step 5 section)

- [ ] **Step 1: Add the strict preamble section to Step 5**

Insert after Step 5's existing "On confirm" line (line 138: `On confirm: invoke superpowers:subagent-driven-development`) and before the "Dependency" line, a new conditional block:

```markdown
**When `--strict` is active**, do NOT immediately dispatch. Run the execution model recommendation preamble first:

#### Execution Model Recommendation (--strict only)

**Inputs:**
1. Plan file (count tasks, scan for "Files" sections)
2. Context estimate: `estimated_used = number_of_user_messages_in_conversation × 2_000`. Apply floor: `estimated_used = max(estimated_used, 10_000)`.
3. Task coupling from "Files" sections (see algorithm below)

**Coupling assessment:**
```
Scan each task's "Files" section for paths listed.
If no tasks have a "Files" section → MEDIUM (conservative default).
If fewer than half of tasks have a "Files" section → MEDIUM (insufficient data).
Otherwise, only tasks with "Files" sections participate:
  Count how many participating tasks share at least one file path.
  >40% share → HIGH | 20-40% → MEDIUM | <20% → LOW
```

**Recommendation algorithm:**
```
remaining = 200_000 - estimated_used
implementation_estimate = task_count × 12_000

If implementation_estimate > remaining × 0.8 → subagent-per-task
Else if coupling == HIGH → single-agent
Else if task_count > 8 AND coupling == LOW → subagent-per-task
Else → single-agent
```

**Present to user:**
```
── Step 5: Implementation ──────────────────────
Plan: <N> tasks, <coupling assessment>
Context: ~<used>K / 200K used, ~<remaining>K remaining
Estimated cost: ~<estimate>K tokens

Recommendation: <Single-agent | Subagent-per-task>
  Reason: <one-line explanation>

Alternatives:
  [1] Single-agent <(recommended) if applicable>
  [2] Subagent-per-task <(recommended) if applicable>
  [3] Clear context + single-agent

Proceed with [N]?
```

Any input other than 1, 2, or 3 re-presents the options.

**Option [3] behavior:** Print: "Start a new conversation and run `/orchestrate --strict` to continue with a fresh context window. Your plan is saved and will be picked up automatically." Then exit. The `--strict` flag is not persisted across sessions — the exit message includes the full command as a reminder.
```

- [ ] **Step 2: Verify the preamble is correctly positioned**

Read `ai-dev-tools/skills/orchestrate/SKILL.md` from the Step 5 heading through Step 6. Confirm:
- The preamble appears inside Step 5, after the existing "On confirm" line
- It is wrapped in a `--strict` conditional
- The coupling algorithm, recommendation algorithm, output format, and Option [3] behavior are all present
- The existing non-strict behavior ("invoke superpowers:subagent-driven-development") is preserved

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "feat(orchestrate): add --strict execution model recommendation preamble"
```

---

### Task 3: Add Step 5 dispatch — prompt-level overrides

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (Step 5 section, after preamble from Task 2)

- [ ] **Step 1: Add the override dispatch logic after the preamble**

Insert after the Option [3] behavior paragraph (end of preamble from Task 2):

```markdown
#### Override Dispatch (--strict only)

After user selects [1] or [2], dispatch to the chosen superpowers skill with a behavioral override block prepended to the dispatch prompt.

**If user selected [1] Single-agent**, dispatch to `superpowers:executing-plans` with this preamble prepended:

```
IMPORTANT OVERRIDES FOR THIS EXECUTION (from orchestrate --strict):

1. TDD ENFORCEMENT: You MUST use red-green-refactor for every task.
   Write a failing test first, watch it fail, write minimal code to
   pass, watch it pass, then refactor. No production code without a
   failing test. This is non-negotiable.

2. VERIFICATION GATE: After completing each task, run the project's
   test/build commands and confirm they pass BEFORE proceeding to the
   next task. Do not skip this step.

3. SPEC COMPLIANCE CHECK: After each task, verify: "Did I build
   exactly what the plan specified? Nothing more, nothing less?"
   If you detect drift, fix before proceeding.

4. RETRY ON FAILURE: If tests fail for a task, you have 2 retry
   attempts to fix. If still failing after 2 retries, mark the task
   as BLOCKED and continue to the next task. Report all blocked
   tasks when execution completes.
```

Note: No SKIP CODE QUALITY REVIEW override is included because `executing-plans` does not dispatch separate reviewer subagents.

Single-agent spec compliance limitation: Self-assessment is less reliable than the subagent spec-reviewer, but is the only option without subagent architecture. Drift will be caught by review-code at Step 6.

**If user selected [2] Subagent-per-task**, dispatch to `superpowers:subagent-driven-development` with this preamble prepended:

```
IMPORTANT OVERRIDES FOR THIS EXECUTION (from orchestrate --strict):

1. TDD ENFORCEMENT: The implementer subagent MUST use red-green-refactor
   for every change. Write a failing test first, watch it fail, write
   minimal code to pass, watch it pass, then refactor. No production
   code without a failing test. This is non-negotiable.

2. VERIFICATION GATE: After each task completes, the coordinator
   (not the implementer subagent) must run the project's test/build
   commands and confirm they pass BEFORE marking the task as done.
   Do not rely on the subagent's self-report — run verification fresh.

3. SKIP CODE QUALITY REVIEW: Do NOT dispatch the code-quality-reviewer
   after each task. Quality review is handled by a superior engine
   (review-code with confidence scoring and noise filtering) at a
   later stage. Dispatching both is redundant and wastes tokens.

4. KEEP SPEC COMPLIANCE REVIEW: DO dispatch the spec-reviewer after
   each task. This lightweight "did you build what the plan said?"
   check is essential for catching scope drift.

5. RETRY ON FAILURE: If a subagent's tests fail, allow 2 retry
   attempts. If still failing after 2 retries, mark the task as
   BLOCKED and continue to the next task. Report all blocked tasks
   when execution completes.
```

**Override reliability:** Under context pressure, the superpowers skill's native instructions may take priority over these overrides. The failure mode is benign: the agent may occasionally dispatch the code-quality-reviewer (wasting tokens), skip TDD enforcement, or skip verification (all caught by review-code at Step 6 and the Step 8 verification gate). No destructive failure path exists.
```

- [ ] **Step 2: Verify the overrides are correctly positioned**

Read the full Step 5 section. Confirm:
- The override dispatch follows the preamble
- Both single-agent and subagent-per-task preambles are present with all override items
- The "Note" about missing SKIP CODE QUALITY REVIEW in single-agent is present
- The "Single-agent spec compliance limitation" paragraph is present
- The "Override reliability" paragraph is present
- The existing non-strict dispatch path is unchanged

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "feat(orchestrate): add --strict prompt-level overrides for Step 5 dispatch"
```

---

### Task 4: Add Step 8 structured completion

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md:163-173` (Step 8 section)

- [ ] **Step 1: Add the strict enrichment to Step 8**

Insert after Step 8's existing "Behavior:" bullet list (after line 172: "This completes the cycle..."), before the `---` separator, a new conditional block:

```markdown
**When `--strict` is active**, enrich Step 8 with verification and structured finishing:

#### Verification Gate (--strict only)

Discover and run the project's test/build commands fresh (see Error Handling: test/build command discovery algorithm). If failing:
- "Verification failed. Fix before completing?"
- → Yes: fix failing tests inline, then re-run verification
- → No: proceed with warning in completion output

#### Structured Finishing (--strict only)

After quality gate recommendations, present:

```
── Step 8: Complete ──────────────────────────
Feature: <feature-name>
Status: <Approved | Approved with suggestions | Issues Found>
Verification: <PASS | FAIL with details>

Options:
  [1] Print merge command for <base-branch>
  [2] Keep branch as-is (no action)
  [3] Generate session handoff for next session

Proceed with?
```

**Base-branch resolution:** Use the branch that was checked out when `/orchestrate` was first invoked (captured at Step 1 via `git rev-parse --abbrev-ref HEAD` before any feature branch is created). If not available, prompt the user: "Which branch should this merge into?"

**Option behaviors:**
- [1] Print the `git merge` command for the user to run manually. Do not execute it.
- [2] Exit with no action.
- [3] Dispatch `/session-handoff`.

**Blocked task reporting:** If any tasks were marked BLOCKED during Step 5, include them in the Status field: e.g., "Status: Approved with 2 blocked tasks".
```

- [ ] **Step 2: Verify Step 8 reads correctly**

Read the full Step 8 section. Confirm:
- Existing non-strict behavior is preserved
- Verification gate is present with discovery algorithm cross-reference
- Structured finishing output format is present with all 3 options
- Base-branch resolution is specified
- Option behaviors are specified
- Blocked task reporting is specified
- The `--strict` conditional wrapping is clear

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "feat(orchestrate): add --strict verification gate and structured completion at Step 8"
```

---

### Task 5: Update error handling table and design constraint

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md:291-307` (Error Handling table)
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md:343` (Design constraint)

- [ ] **Step 1: Add --strict error scenarios to the Error Handling table**

Append these rows to the existing Error Handling table (after the last `|...|` row, before the `---` separator):

```markdown
| Verification gate fails at Step 8 (--strict) | Offer to fix failing tests inline and re-run verification, or proceed with warning |
| All tasks BLOCKED at Step 5 (--strict) | Report blocked list, skip to Step 6 (review-code reviews what was committed) |
| No test/build command discoverable (--strict) | Discovery algorithm: (1) check CLAUDE.md for test/build commands, (2) check package.json scripts (test, build), (3) check for Makefile (test target), (4) probe for pytest/jest/cargo test. If none found, skip verification gate with: "No verification command found. Configure test commands in CLAUDE.md." |
| Base-branch unknown at Step 8 (--strict) | Prompt user: "Which branch should this merge into?" |
| Override ignored by superpowers (--strict) | Benign — redundant quality review wastes tokens, caught by review-code at Step 6 |
```

- [ ] **Step 2: Update the design constraint**

Replace line 343:
```
**Design constraint:** Orchestrate never modifies or extends the skills it dispatches. Each skill operates independently with its own SKILL.md. Orchestrate only detects state, presents context, and invokes — it does not alter skill behavior.
```
With:
```
**Design constraint:** Orchestrate never modifies the SKILL.md files of skills it dispatches. Each skill operates independently with its own definition. In standard mode, orchestrate only detects state, presents context, and invokes. With `--strict`, orchestrate may prepend behavioral override blocks to dispatch prompts — this is composition (prompt-level hints), not modification (file changes). Dispatched skills may ignore these overrides; the failure mode is benign.
```

- [ ] **Step 3: Verify changes**

Read the Error Handling table and design constraint. Confirm:
- 5 new rows are appended to the table
- Each row has the `(--strict)` tag for clarity
- Design constraint distinguishes file modification from prompt-level overrides
- The word "never" applies to SKILL.md files, not to dispatch prompts

- [ ] **Step 4: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "feat(orchestrate): add --strict error handling and update design constraint"
```

---

### Task 6: Final verification

**Files:**
- Read: `ai-dev-tools/skills/orchestrate/SKILL.md` (full file)

- [ ] **Step 1: Read the full SKILL.md and verify end-to-end**

Read the complete file. Check:
- `<help-text>` block includes `--strict` in USAGE, FLAGS, and EXAMPLES
- Argument parsing handles both `--help` and `--strict`
- Strict mode banner is present
- Step 5 has the preamble (execution model recommendation) wrapped in `--strict` conditional
- Step 5 has the override dispatch (both paths) wrapped in `--strict` conditional
- Step 8 has verification gate and structured finishing wrapped in `--strict` conditional
- Error Handling table has 5 new `--strict` rows
- Design constraint is updated
- All non-strict behavior is completely unchanged
- No broken markdown (unclosed code blocks, misaligned tables)

- [ ] **Step 2: Verify non-strict path is unchanged**

Confirm that removing all `--strict` conditional sections would leave the original SKILL.md intact. Specifically:
- Step 5 still says "On confirm: invoke `superpowers:subagent-driven-development`" for the default path
- Step 8 still does roadmap update + quality gates for the default path
- No existing behavior is altered

- [ ] **Step 3: Commit (if any fixes needed)**

Only commit if Step 1 or Step 2 found issues that required fixes:
```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "fix(orchestrate): fix --strict integration issues found in final verification"
```

If no fixes needed, skip this step.
