# Implementation Step

This file is loaded by orchestrate at Step 5 onset for task graph visualization, execution mode recommendation, and override dispatch.

---

## Task Graph

Read `references/task-graph.md`, analyze the plan, and generate an ASCII dependency graph.

Present the task graph and execution mode recommendation together in the same response (no intermediate user acknowledgment required between them).

---

## Execution Mode Recommendation

Only a FULL run uses it: for the picker, and for `--auto`. LIGHT runs `single`, and MECHANICAL runs `single` or a scripted edit (see `../SKILL.md` Resolve the Tier).

**Inputs:**
1. Plan file (count tasks, scan for "Files" sections)
2. Task coupling from "Files" sections (see algorithm below)

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
If coupling == LOW → per-task
Else → single
```

`per-task` is only worth it when the tasks barely touch the same files.

**Present to user:**
```
── Step 5: Implementation ──────────────────────
Plan: <N> tasks, <coupling assessment>

Recommendation: <single | per-task>
  Reason: <one-line explanation>

Options:
  [1] single   — one <coders> agent carries the whole plan <(recommended) if applicable>
  [2] per-task — one <coders> agent per task, and a spec reviewer per task <(recommended) if applicable>

Proceed with [N]?
```

`<coders>` is the coders' model and effort as the second tier line printed them.

Any input other than 1 or 2 re-presents the options.

**Auto mode (`--auto` flag):** the picker is not presented. `--auto` takes the recommendation. See `../SKILL.md`.

---

## Override Dispatch

Once the mode, `single` or `per-task`, is settled — at the picker, by `--mode`, by `--auto`, or by the tier — dispatch with a behavioral override block prepended to the dispatch prompt. Every dispatch path prepends one; there is no path that dispatches without a preamble.

The `## Validation` block that every preamble requires is `/implement`'s hand-back format — it is what orchestrate and the user receive when the dispatched agent returns. Its bullets are spelled out inside each preamble rather than referenced from here, because the preamble is copied into another agent's prompt and that agent never reads this file. **Empty bullets print `none stated` rather than being omitted:** an explicit "none" is a claim someone can challenge; silence is indistinguishable from having forgotten.

**If the mode is `single`**, dispatch one coder to follow `superpowers:executing-plans`, with this preamble prepended:

```
IMPORTANT OVERRIDES FOR THIS EXECUTION (from orchestrate):

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

5. REPORT IS NOT EVIDENCE: your completion report is a claim.
   Evidence is command output. Never write "tests pass" or "the
   gate is green" unless you ran it in this session and can quote
   it. If you did not run it, say "not run" — never omit it.

6. VALIDATION IN YOUR REPORT: end your completion report with:

     ## Validation
     - Commands run (exact) and their results
     - Checks SKIPPED, and why
     - Residual risk

   All three bullets are required. A bullet with nothing to report
   prints `none stated`. Never omit a bullet.

7. WORK IN THIS TREE AND BRANCH: running /implement here is the consent.
   Create no worktree.

8. SKIP THE FINAL WHOLE-BRANCH REVIEW AND finishing-a-development-branch:
   review-code runs next at the tier's level. Return after the last task.

9. RUN-ID THREADING: You are executing under run-id `<run_id>`. Write output
   artifacts to `tmp/_reviews_errors/<run_id>-<artifact>` when a run-id
   is active. This is for traceability in multi-agent pipelines.
```

Override 9 (RUN-ID THREADING) is only included when `--run-id` was passed. When `--run-id` is absent, omit it entirely.

Note: `executing-plans` dispatches no reviewer per task, so there is no code-quality reviewer to skip. Where it runs a final whole-branch review, override 8 skips it.

Single-mode spec compliance limitation: self-assessment is less reliable than a task reviewer's. Drift will be caught by review-code at Step 6.

**If the mode is `per-task`**, this session coordinates `superpowers:subagent-driven-development` with this preamble prepended:

```
IMPORTANT OVERRIDES FOR THIS EXECUTION (from orchestrate):

1. TDD ENFORCEMENT: The implementer subagent MUST use red-green-refactor
   for every change. Write a failing test first, watch it fail, write
   minimal code to pass, watch it pass, then refactor. No production
   code without a failing test. This is non-negotiable.

2. VERIFICATION GATE: After each task completes, the coordinator
   (not the implementer subagent) must run the project's test/build
   commands and confirm they pass BEFORE marking the task as done.
   Do not rely on the subagent's self-report — run verification fresh.

3. TASK REVIEWER: the task reviewer runs after every task and gives
   both the spec verdict and the quality verdict. Dispatch it for
   every task. It is the "did you build what the plan said?" check
   that catches scope drift.

4. RETRY ON FAILURE: If a subagent's tests fail, allow 2 retry
   attempts. If still failing after 2 retries, mark the task as
   BLOCKED and continue to the next task. Report all blocked tasks
   when execution completes.

5. REPORT IS NOT EVIDENCE: a completion report — the implementer
   subagent's or your own — is a claim. Evidence is command output.
   Never write "tests pass" or "the gate is green" unless you ran it
   in this session and can quote it. If you did not run it, say
   "not run" — never omit it.

6. VALIDATION IN YOUR REPORT: end your completion report with:

     ## Validation
     - Commands run (exact) and their results
     - Checks SKIPPED, and why
     - Residual risk

   All three bullets are required. A bullet with nothing to report
   prints `none stated`. Never omit a bullet. Commands run by an
   implementer subagent count only if you can quote their output.

7. CONCURRENCY AND CALL FORM: at most 3 agents run at once, or fewer
   when CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS is lower. Dispatch every
   implementer and every task reviewer in this one form:
   Agent(subagent_type: "ai-dev-tools:<coder effort>-effort", prompt: <task prompt>, model: "<coder model>")

8. WORK IN THIS TREE AND BRANCH: running /implement here is the consent.
   Create no worktree.

9. SKIP THE FINAL WHOLE-BRANCH REVIEW AND finishing-a-development-branch:
   review-code runs next at the tier's level. Return after the last task.

10. RUN-ID THREADING: You are executing under run-id `<run_id>`. Write output
   artifacts to `tmp/_reviews_errors/<run_id>-<artifact>` when a run-id
   is active. This is for traceability in multi-agent pipelines.
```

Override 10 (RUN-ID THREADING) is only included when `--run-id` was passed. When `--run-id` is absent, omit it entirely.

**Override reliability:** Under context pressure, the superpowers skill's native instructions may take priority over these overrides. The failure modes are these: the agent may skip TDD enforcement or skip verification (caught by review-code at Step 6 and the Step 8 verification gate), or it may create a worktree, or run the final whole-branch review or the finishing step, despite the overrides that forbid each.
