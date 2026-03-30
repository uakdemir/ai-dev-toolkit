# orchestrate --strict — Design Spec

**Date:** 2026-03-30
**Status:** Approved
**Plugin:** ai-dev-tools
**Skill:** orchestrate (enhancement)
**Type:** Feature flag adding quality discipline to the orchestrate development loop

---

## Problem Statement

Orchestrate currently bridges superpowers (brainstorming, writing-plans, subagent-driven-development) and ai-dev-toolkit (review-doc, review-code) into an 8-step development loop. However, it delegates execution (Step 5) to superpowers without quality discipline: no TDD enforcement, no verification gates between tasks, no intelligent execution model selection, and no structured completion flow. Superpowers' own execution skills apply their full process (including a redundant per-task code quality review), but don't leverage ai-dev-toolkit's superior review-code engine.

The result is a gap: orchestrate dispatches well but doesn't ensure disciplined execution, and superpowers executes but wastes tokens on review work that review-code does better at Step 6.

## Enhancement Summary

Add a `--strict` flag to orchestrate that enriches execution discipline without modifying any superpowers plugin files. When active, `--strict` adds:

1. **Intelligent execution model selection** — analyze plan size, task coupling, and context budget to recommend single-agent or subagent-per-task execution (Step 5 preamble)
2. **TDD enforcement** — implementer agents must use red-green-refactor (Step 5 override)
3. **Verification gates** — run project test/build commands after each task before proceeding (Step 5 override)
4. **Redundant review elimination** — skip superpowers' per-task code quality reviewer, keep per-task spec compliance reviewer (Step 5 override, subagent path only — the single-agent path doesn't dispatch sub-reviewers, so no skip is needed)
5. **Structured completion** — verification gate + finishing options at Step 8

**Design principle:** Composition over modification. `--strict` passes behavioral overrides to superpowers skills via the dispatch prompt. No superpowers files are modified. The failure mode for ignored overrides is benign (extra tokens from a redundant quality review), not destructive.

**Acceptance criteria:**
- `/orchestrate --strict` activates all five behaviors listed above
- `/orchestrate` (without flag) behaves identically to today
- Zero changes to any superpowers plugin file
- Step 5 presents execution model recommendation with reasoning before dispatching
- User can override the execution model recommendation by entering [1], [2], or [3]; invalid input re-prompts
- Step 8 presents verification gate + finishing options when `--strict` is active
- Blocked tasks from Step 5 failures are reported both when the dispatched skill completes (end of Step 5) and in Step 8's Status field

---

## Scope

### In scope
- `--strict` flag parsing and help text
- Step 5 preamble: execution model recommendation logic
- Step 5 dispatch: prompt-level overrides for superpowers skills
- Step 8 enrichment: verification gate + structured finishing options

### Out of scope
- Git worktree automation (user manages branches manually)
- Pushing to remote / creating PRs (per user preference — AI never pushes or creates branches)
- Systematic debugging on failure (available directly via superpowers, not orchestrate's concern)
- Per-task model selection (potential future enhancement)
- Changes to Steps 1-4, 6-7 (already use the right engines)
- Any modification to superpowers plugin files

---

## Detailed Design

### 1. Flag Definition

```
/orchestrate [--strict] [--help]
```

| Flag | Default | Purpose |
|---|---|---|
| `--strict` | off | Enable quality discipline: TDD, verification gates, spec compliance review, intelligent execution model selection, structured completion |

When `--strict` is active, print at invocation:

```
Mode: strict (TDD + verification + spec compliance + structured completion)
```

Updated `--help` addition:

```
  --strict    Enable quality discipline: TDD enforcement, verification
              gates, per-task spec compliance review, intelligent execution
              model selection, and structured completion options.
              Recommended for features where correctness matters more
              than speed.
```

### 2. Step 5 Preamble — Execution Model Recommendation

When `--strict` is active and orchestrate reaches Step 5, run analysis before dispatching. This logic fires only with `--strict`.

**Inputs:**
1. Plan file (task count, task descriptions, file paths referenced)
2. Context window usage estimate (see computation below)
3. Task coupling assessment (shared file references across tasks)

**Algorithm:**

```
1. Count tasks in plan.
2. Estimate remaining context budget:
     estimated_used = number_of_user_messages_in_conversation × 2_000
     estimated_used = max(estimated_used, 10_000)  # floor: accounts for SKILL.md + system prompt overhead
     remaining = 200_000 - estimated_used
     implementation_estimate = task_count × 12_000
3. Assess coupling:
     Scan each task's "Files" section for paths listed.
     If no tasks have a "Files" section, fall back to MEDIUM coupling
       (conservative default — avoids incorrectly assuming LOW).
     If fewer than half of tasks have a "Files" section, fall back to
       MEDIUM coupling (insufficient data for reliable assessment).
     Otherwise (majority of tasks have "Files" sections):
       Only tasks with a "Files" section participate in the calculation.
       Count how many participating tasks share at least one file path.
       If >40% of tasks share a file with another task → HIGH coupling
       If 20-40% → MEDIUM coupling
       If <20% → LOW coupling
4. Recommend:
     If implementation_estimate > remaining × 0.8:
       → subagent-per-task
       → also suggest: "Consider clearing context first for single-agent"
     Else if coupling == HIGH:
       → single-agent
     Else if task_count > 8 AND coupling == LOW:
       → subagent-per-task
     Else:
       → single-agent
```

**Output format:**

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

User always overrides. Recommendation is advisory.

**Option [3] behavior:** Print a message instructing the user to start a new conversation and re-invoke `/orchestrate --strict`. The plan artifact persists on disk, so re-invocation will detect it at Step 5. Example output: "Start a new conversation and run `/orchestrate --strict` to continue with a fresh context window. Your plan is saved and will be picked up automatically."

**Edge case:** Fresh `/orchestrate` invocation (Steps 1-4 completed in prior sessions) — context usage is near zero, single-agent is almost always recommended.

**Re-invocation note:** The `--strict` flag is not persisted across sessions. If a user re-invokes `/orchestrate` (e.g., after Option [3] context clear), they must pass `--strict` again. The Option [3] exit message includes a reminder with the full command.

### 3. Step 5 Dispatch — Prompt-Level Overrides

After user confirms execution model, orchestrate dispatches to the appropriate superpowers skill with a behavioral override block prepended to the dispatch prompt.

**When execution model = subagent-per-task**, dispatch to `superpowers:subagent-driven-development` with this preamble:

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

**When execution model = single-agent**, dispatch to `superpowers:executing-plans` with this preamble:

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

**Note:** No SKIP CODE QUALITY REVIEW override is included in the single-agent block because `executing-plans` does not dispatch separate reviewer subagents — there is nothing to skip.

**Single-agent spec compliance limitation:** The single-agent path uses self-assessment for spec compliance (override item 3), unlike the subagent path which dispatches a separate spec-reviewer. Self-assessment is inherently less reliable — the same agent that drifted would judge itself. This is accepted because single-agent architecture has no mechanism for dispatching a reviewer. Drift will be caught by review-code at Step 6.

**Override reliability:** These are prompt-level instructions passed to superpowers skills that have their own SKILL.md definitions. Under context pressure, the superpowers skill's native instructions may take priority over these overrides. The failure mode is benign: the agent may occasionally dispatch the code-quality-reviewer (wasting tokens on a redundant review), skip TDD enforcement, or skip verification (all caught by review-code at Step 6 and the Step 8 verification gate). No destructive failure path exists.

### 4. Step 8 — Structured Completion

When `--strict` is active and orchestrate reaches Step 8, the step is enriched with a verification gate and structured finishing options.

**Step 8 flow with `--strict`:**

```
1. VERIFICATION GATE
   Discover and run the project's test/build commands fresh
   (see Error Handling: test/build command discovery algorithm).
   If failing:
     "Verification failed. Fix before completing?"
     → Yes: fix failing tests inline, then re-run verification
     → No: proceed with warning in completion output

2. QUALITY GATE RECOMMENDATIONS (unchanged)
   Same trigger logic as today.
   Max 3 recommendations.

3. STRUCTURED FINISHING
   Present:

   ── Step 8: Complete ──────────────────────────
   Feature: <feature-name>
   Status: <Approved | Approved with suggestions | Issues Found>
   Verification: <PASS | FAIL with details>

   Options:
     [1] Print merge command for <base-branch>
     [2] Keep branch as-is (no action)
     [3] Generate session handoff for next session

   Base-branch resolution: Use the branch that was checked out when
   `/orchestrate` was first invoked (captured at Step 1 via
   `git rev-parse --abbrev-ref HEAD` before any feature branch is
   created). If not available, prompt the user to specify.

   Proceed with?

4. Execute chosen option.
```

**Options rationale:**
- No "Push and create PR" — per user preference, AI never pushes or creates branches
- No "Discard work" — too destructive; user handles manually if needed
- "Print merge command" outputs the `git merge` command for the user to run manually
- "Keep as-is" exits with no action
- "Session handoff" dispatches `/session-handoff` for the next conversation

**Without `--strict`:** Step 8 behaves exactly as it does today — quality gate recommendations only, no verification gate, no finishing options.

---

## What Changes Where

| Component | Change | Lines (est.) |
|---|---|---|
| orchestrate SKILL.md — argument parsing | Add `--strict` flag, update `--help` block | ~15 |
| orchestrate SKILL.md — Step 5 preamble | Execution model recommendation logic | ~60 |
| orchestrate SKILL.md — Step 5 dispatch | Override preamble for subagent and single-agent paths | ~30 |
| orchestrate SKILL.md — Step 8 | Verification gate + structured finishing | ~40 |
| orchestrate SKILL.md — design constraint | Reword "never modifies or extends" to distinguish SKILL.md file modification (never done) from prompt-level behavioral overrides (`--strict` only) | ~5 |
| superpowers plugin | **No changes** | 0 |

**Total:** ~150 lines added to orchestrate SKILL.md. Zero new files. Zero external changes.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `--strict` with `--max-iterations 0` on review-code (Step 6) | Allowed — `--strict` does not force review-code iterations |
| Verification gate fails at Step 8 | Offer to fix failing tests inline and re-run verification, or proceed with warning |
| All tasks BLOCKED at Step 5 | Report blocked list, skip to Step 6 (review-code reviews what was committed) |
| No test/build command discoverable | Discovery algorithm: (1) check CLAUDE.md for test/build commands, (2) check package.json scripts (test, build), (3) check for Makefile (test target), (4) probe for pytest/jest/cargo test. If none found, skip verification gate with: "No verification command found. Configure test commands in CLAUDE.md." |
| Context pressure during Step 5 | Execution model recommendation already accounts for this; if single-agent was chosen and pressure builds mid-execution, the agent continues (superpowers handles context naturally) |
| Base-branch unknown at Step 8 | Prompt user: "Which branch should this merge into?" |
| Override ignored by superpowers | Benign — redundant quality review wastes tokens, caught by review-code at Step 6 |

---

## Non-Goals

- This spec does not change orchestrate's state machine architecture (re-invocable, artifact-based detection)
- This spec does not add new steps to the 8-step loop — it enriches Steps 5 and 8
- This spec does not create a "bug fix" workflow — systematic-debugging is invoked directly via superpowers
- This spec does not automate git worktree creation — user manages branches manually
- This spec does not add per-task model selection — potential future enhancement
