# Strict Mode Overrides

This file is loaded by orchestrate when `--strict` is active.
- At Step 5 onset: for execution model recommendation and override dispatch.
- At Step 8: for verification gate and structured finishing.

---

## Execution Model Recommendation (--strict only)

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

**Parallelism yield check** (runs when task_count >= 4 AND coupling != HIGH):
```
Scan tasks in plan order. For each unassigned task, find the next
unassigned task with no dependency on it or vice versa. If found,
pair them into a parallel phase. Continue until all tasks are
assigned or no more pairs can be formed.

P = number of parallel pairs
parallelism_ratio = P / task_count

If parallelism_ratio >= 0.30 → option [4] is eligible
If parallelism_ratio < 0.30  → not eligible, fall through to single-agent
```

Note: `parallelism_ratio` is a proxy for time savings (fraction of parallelisable tasks), not a wall-clock measurement.

**Recommendation algorithm:**
```
remaining = 200_000 - estimated_used
implementation_estimate = task_count × 12_000
parallelism_ratio = 0  # default; overwritten if yield check runs

If implementation_estimate > remaining × 0.8 → subagent-per-task
  (also include in Reason line: "Consider clearing context first for single-agent (Option [3])")
Else if coupling == HIGH → single-agent
Else if task_count > 8 AND coupling == LOW → subagent-per-task
Else if task_count >= 4 AND coupling != HIGH AND parallelism_ratio >= 0.30 → single-agent + parallel helper
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

## Override Dispatch (--strict only)

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

Note: No SKIP CODE QUALITY REVIEW override is included because `executing-plans` does not dispatch separate reviewer subagents — there is nothing to skip.

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

## Verification Gate (--strict only)

Discover and run the project's test/build commands fresh (discovery: check CLAUDE.md → package.json scripts → Makefile test target → probe pytest/jest/cargo test; none found → skip gate with "No verification command found. Configure in CLAUDE.md."). If failing:
- "Verification failed. Fix before completing?"
- → Yes: fix failing tests inline, then re-run verification
- → No: proceed with warning in completion output

## Structured Finishing (--strict only)

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

---

## Error Handling (--strict only)

| Scenario | Behavior |
|---|---|
| Verification gate fails at Step 8 | Offer to fix failing tests inline and re-run verification, or proceed with warning. |
| All tasks BLOCKED at Step 5 | Report blocked list, skip to Step 6 (review-code reviews what was committed). |
| Base-branch unknown at Step 8 | Prompt user: "Which branch should this merge into?" |
| Override ignored by superpowers | Benign — redundant quality review wastes tokens, caught by review-code at Step 6. |
