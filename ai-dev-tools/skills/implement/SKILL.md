---
name: implement
argument-hint: "[path] [--mode single|per-task] [--model <model>] [--effort <level>] [--tier full|light|mechanical] [--auto] [--skip-plan-recommendation]"
description: "Use when the user wants to execute a written implementation plan or implement directly from a spec — generates a task graph, recommends an execution mode, and dispatches with quality overrides. Invoked standalone (/implement <path>) or via orchestrate (/orchestrate (/implement <plan>))."
---

<help-text>
/implement — execute a plan or spec

Usage: /implement [path] [--mode single|per-task] [--model <model>] [--effort <level>] [--tier <level>]
                  [--auto] [--skip-plan-recommendation] [--run-id <id>]

Arguments:
  path             Plan or spec file to implement. If omitted, uses the
                   active orchestrate plan or spec from tmp/orchestrate-state.md
  --mode MODE      Skip the mode picker and dispatch directly:
                     single   = one agent carries the whole plan
                     per-task = one agent per task, and a task reviewer per task
  --model MODEL    Model of the coders (default: the tier's row)
  --effort LEVEL   Effort of the coders: high, xhigh, max (default: the tier's row)
  --tier LEVEL     Skip classification: full, light, mechanical (default: classified)
  --auto           Non-interactive dispatch: takes the recommendation.
                   Skips the Step C plan prompt and the refactor-unit pre-check.
  --skip-plan-recommendation
                   Suppress the Step C spec recommendation prompt (this
                   invocation only).
  --run-id <id>    Run-id threaded to dispatched sub-agents via override preamble.
  --help           Show this help

Examples:
  /implement                                    # use orchestrate hint file
  /implement docs/plans/2026-04-06-foo-plan.md  # explicit plan
  /implement docs/specs/2026-04-06-bar.md       # implement directly from spec
  /implement docs/plans/baz.md --mode per-task  # skip the picker
</help-text>

Parse arguments: if `--help` is present, output ONLY the text inside `<help-text>` tags above verbatim and exit. If `--mode` is present, validate its value against the set `{single, per-task}`; on any other value print `Error: --mode must be one of: single, per-task.` and exit. If `--effort` is present, validate its value against the set `{high, xhigh, max}`; on an out-of-set value print `Error: --effort must be one of: high, xhigh, max.` and exit. If `--tier` is present, validate its value against the set `{full, light, mechanical}`, matched exactly as `--effort`'s are; on any other value print `Error: --tier must be one of: full, light, mechanical.` and exit. If `--model` is present, check it for an old value first: `single`, `subagent`, `parallel` and `clear-context` named the execution mode before, and print `Error: --model now names the coders' model; for the execution mode use --mode single|per-task.` and exit. An old value never reaches the next check. Any other value is judged against the Agent tool in the Normal-feature path's step 4, "Checks before any dispatch", because that check needs the Agent tool. If `--skip-plan-recommendation` is present, suppress the Step C spec recommendation prompt for this invocation only (see Step C). If `--auto` is present, set auto mode active for this invocation; it also suppresses the Step C spec recommendation prompt (see Step C). `--auto` + `--mode` is valid — `--mode` overrides the recommendation `--auto` would take. If `--run-id <id>` is present, store the run-id for threading to dispatched sub-agents.

# implement

Execute a written implementation plan or implement directly from a spec. `/implement` owns plan/spec detection, tier resolution, task-graph construction, execution-mode recommendation, the two-option mode picker, and the refactor-unit branch. It is **stateless** with respect to `tmp/orchestrate-state.md` — it READS the hint file in Step A but NEVER writes it. Orchestrate is the sole writer of the hint file.

---

## Step A — Path Resolution

1. If positional `path` argument was provided → use it. Go to Step A.5.
2. Else read `tmp/orchestrate-state.md`. If the `plan:` field is non-empty → use it. Go to Step A.5.
3. Else read `tmp/orchestrate-state.md`. If the `spec:` field is non-empty → use it. Go to Step A.5.
4. Else print this error and exit:
   ```
   No path argument and no active plan/spec in orchestrate hint file. Specify a path or run /orchestrate first.
   ```
5. **Existence check:** verify the resolved path points to a real file. If not, print `File not found: <path>` and exit (Edge Case 2). Exception: if path came from the hint file `plan:` field and the file does not exist, fall through to step 3 (hint file `spec:` field) before erroring (Edge Case 3).

The order **positional → plan → spec** matters. When both `plan:` and `spec:` are populated (the normal case after `/writing-plans` ran on a spec), prefer the more-recently-written plan.

---

## Step B — Plan vs Spec Detection (location-first)

1. **Location check:** If the resolved path matches `docs/superpowers/plans/**` OR `docs/plans/**` → classify as **plan**, go to Step C.
2. **Location check:** If the resolved path matches `docs/superpowers/specs/**` OR `docs/specs/**` → classify as **spec**, go to Step C.
3. **Content fallback** (for ad-hoc files such as `tmp/foo.md` where location is ambiguous): grep the file for content markers.
   - Plan markers: `## Phase`, `## Task`, `### Step`
   - Spec markers: `## Architecture`, `## Components`, `## Data Flow`
   - **Tiebreaker:** If both plan and spec markers are found, classify as **plan** (plan markers are more distinctive and less likely to appear incidentally in spec files). Require a minimum of **2** plan markers total to classify as plan; a single `### Step` hit alone is insufficient.
4. If neither location nor content resolves the classification → print `Cannot classify <path> as plan or spec. Location is ambiguous and no marker match.` and exit.

Location-first detection covers >95% of cases. The content fallback only fires for ad-hoc files in `tmp/`.

---

## Step C — Branch on Plan vs Spec

### If **plan** detected

Proceed directly to Step D with the plan path.

### If **spec** detected

Run the **Spec Recommendation Algorithm**. This is **skip-by-default**: most specs do not need a separate plan. Only recommend `/writing-plans` if at least one of three **hard signals** fires:

| Hard signal | Detection |
|---|---|
| Multi-component spec | Spec mentions ≥3 distinct files/modules to create or modify (scan `## Files Modified / Created` tables or "Create:" bullets) |
| Cross-cutting concern | Spec mentions database migration AND code change AND test change in the same document |
| Explicit phase markers | Spec already contains `## Phase 1`, `## Phase 2` (treat as proto-plan) |

**If none of the signals fire** → silently proceed to Step D treating the spec as the implementation source.

**If at least one signal fires** → print this prompt and await user input:

```
This spec has [signal description]. A plan would help you sequence the work.

[1] Recommended: write a plan first
    /writing-plans <spec-path>

[2] Skip the plan, implement directly from the spec
    /implement <spec-path> --skip-plan-recommendation

Pick one to proceed.
```

Then exit. Do not auto-dispatch either option.

**`--skip-plan-recommendation` suppression:** If the flag was passed on the current invocation, skip the hard-signal check entirely and proceed directly to Step D. The flag is a one-shot suppression; it is not persisted. `--auto` suppresses the check the same way: auto mode takes no input, so the prompt would end the run with nothing implemented.

---

## Step D — Dispatch with Execution Mode

### `--auto` Mode Pre-check

If `--auto` is active:
1. **Skip the Refactor-Unit Branch Handling pre-check entirely.** Proceed directly to Resolve the Tier. Rationale: auto mode prioritizes a narrow, deterministic dispatch surface. Users who need refactor-unit handling must omit `--auto`.
2. After building the task graph, take the recommendation instead of presenting the picker (see below).

### Refactor-Unit Branch Handling (pre-check)

Before building the task graph, perform this refactor-unit check (moved verbatim from the previous `../orchestrate/SKILL.md` Step 5):

1. Check if a refactor roadmap exists at `docs/monorepo-strategy/roadmap.md` OR `docs/layer-architecture/roadmap.md` with unchecked items.
2. If so, perform a **case-insensitive substring match** of the feature name against the bold roadmap item labels (text between `**` markers in the checkbox line, not the full rationale). The feature name is derived from:
   - The resolved plan/spec filename (stripped of date prefix and `-plan.md`/`.md` suffix), OR
   - The hint file's `feature:` field when `/implement` was invoked with no positional arg (i.e., via orchestrate)
3. **If the match succeeds → refactor-unit path:**
   - Skip the task graph generation and execution mode recommendation (steps 1-2 in the normal-feature path below).
   - Load `references/refactor-execution.md` and execute directly following its **Pre-flight → File Operations → Verification** sequence.
   - Perform the checklist pre-flight surfacing: read `tmp/checklists/index.md` if it exists, filter for rows where Phase is `coding` or `both` AND Recommended Skill contains `refactor-to-monorepo` or `refactor-to-layers`. Surface any matching entries to the user before beginning execution. Note: the `refactor-to-layers` filter branch currently returns empty (no checklist crystallization section) — do not warn on an empty result from that branch.
   - **Flag handling:** this path dispatches no agent and resolves no tier, so `--mode`, `--model`, `--effort` and `--tier` are all **ignored** on it. If any of them was passed, print one warning naming each one passed, e.g. `warning: --mode, --model ignored for refactor-unit execution`, and continue.
   - After the refactor-execution sequence completes, return control to the caller (orchestrate or standalone shell), ending the report with the `## Validation` hand-back block defined in `references/refactor-execution.md`.
4. **If the match fails (normal-feature path) → proceed to Resolve the Tier, then the normal-feature dispatch below.**

### Resolve the Tier

Runs after the refactor-unit pre-check has failed to match (`--auto` skips that pre-check) and before the task graph is built. The refactor-unit path dispatches no agent, and a run that exits at Step C dispatches nothing, so neither resolves a tier.

**Every run resolves its tier before it dispatches an agent, prints the tier and its reason first, and takes its process and each agent's model and effort from that tier unless a flag sets them.** Defined once, in `references/shared-rules/risk-tier.md`, and shared with `review-code` and `review-doc`. **Every dispatched agent is the plugin agent that matches its phase's effort, and carries its phase's model on its Agent call; the run's tier sets both unless a flag does.** Defined once, in `references/shared-rules/agent-dispatch-pin.md`, and shared with `review-code` and `review-doc`. Read the tiers, the routing table, the floor format and the tier-line formats at run time, from `${CLAUDE_PLUGIN_ROOT}/references/shared-rules/risk-tier.md`: this skill restates none of them.

1. **Classify**, unless `--tier` was passed. Use the code tier, read from the plan or spec being implemented, and add the triggers in the `## Risk tiers` section of the root CLAUDE.md when it has one. When unsure between two tiers, take the higher. The reason names the trigger and the evidence, such as a task number.
2. **Floor.** The file is `tmp/risk-tier-$CLAUDE_CODE_SESSION_ID.md`. It counts only when its `session:` matches the variable and its `branch:` matches `git rev-parse --abbrev-ref HEAD`; otherwise it is ignored and then overwritten, never used. Another conversation's file is never read. Take the higher of the stored tier and the classified one, as the rule defines; `--tier` skips both. **When `CLAUDE_CODE_SESSION_ID` is unset, neither read nor write the file, and end the tier line with `(not carried: no session id)`.**
3. **Print** the two tier lines, after Steps A to C and ahead of the task graph, and do not pause after them. The coders' model and effort come from the tier's row; `--model` and `--effort` replace their own fields, labelled on the line. On a FULL run without `--mode` the second line reads `mode pending · …` (formats in the rule).
4. **Write** the floor after printing (create `./tmp/` if needed): `tier`, `reason` (`--tier <level>` for a `--tier` run), `session`, `branch`, `set_by: implement` and `set_at`. A run that carried the floor's tier writes the stored `reason`, `set_by` and `set_at` back unchanged, as the rule defines. Skipped when there is no session id.

**Process by tier:**
- **FULL:** the mode picker below. `--mode` skips it, and `--auto` takes the recommendation.
- **LIGHT:** `single`, with no picker and no per-task reviewers.
- **MECHANICAL:** `single`, or a scripted exact-once edit by this session. The edit is allowed when the plan's change is a rename, move or reformat that one command applies and an instrument (a grep that must return nothing, a build) proves. The session commits the edit as one commit before it verifies and reports, dispatches no agent, and its second tier line is `mode scripted edit · no agents`.
- An explicit `--mode` replaces the mode the tier's row gives, on any tier; the scripted edit is then not used.

### Normal-feature path

Load `references/implementation-step.md` (which transitively loads `references/task-graph.md`) and follow its logic:

1. Build the task graph from the plan (per `references/task-graph.md`).
1.5. **Plan gate — rollback stated per task.** Every task states how to undo it before implementation begins. **"Forward-fix only" is an acceptable answer when stated deliberately** — what is unacceptable is discovering at failure time that nobody considered it. Treat schema migrations and infrastructure applies as requiring an explicit rollback, never a default.

   **Under `--auto` the gate never prompts** — auto mode takes no user input, and this branch overrides both interactive branches below, including the schema-migration exception. If one or more tasks lack the field, print `Rollback not stated: <task names>` before dispatch and append that same list to the dispatch prompt after the override preamble, instructing the agent to record it under "Checks SKIPPED, and why". If every task carries the field, print nothing and append nothing — an empty list is not a skipped check. Either way, continue without prompting.

   Interactive runs (no `--auto`):
   - **No task carries a `Rollback:` field** → the plan predates the field. Print `Plan predates the Rollback field; no per-task rollback stated` and continue without prompting — except for any task the plan itself describes as a schema migration or an infrastructure apply, which is prompted regardless. Judge that from the task's own text and `Files:` paths; do not infer it from anything outside the plan.
   - **Some tasks carry it and some do not** → list every task whose `Rollback:` field is missing or empty, and ask the user to supply one or confirm forward-fix-only. Do not dispatch until each is resolved.
2. Compute the execution mode recommendation (per `references/implementation-step.md` Execution Mode Recommendation section). Only FULL uses it: for the picker, and for `--auto`.
3. **Settle the mode.**
   - FULL with `--mode` → that mode, with no picker.
   - FULL with `--auto` (and no `--mode`) → the recommendation, with no picker.
   - FULL otherwise → present the two-option picker exactly as defined in `references/implementation-step.md`:
     ```
     [1] single   — one <coders> agent carries the whole plan
     [2] per-task — one <coders> agent per task, and a spec reviewer per task
     ```
   - When the picker or `--auto` settles the mode, print `Mode: <mode> (picked)` when the picker answered, and `Mode: <mode> (recommended)` when `--auto` took the recommendation.
   - LIGHT and MECHANICAL → as in Resolve the Tier. With `--mode`, that mode.
4. **Checks before any dispatch.** They run after the tier and the mode are settled, and only for agents the run will dispatch: the MECHANICAL scripted edit dispatches none, so it raises none of these errors.
   - **A session with no Agent tool cannot run this skill.** Claude Code gives no Agent tool to an agent at its spawn-depth cap. If this session has none, print `Error: this session has no Agent tool, so the coding agents cannot be dispatched. Run the skill from the top-level session, or raise CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH (at least 2 for a first-level sub-agent).` and exit. This is checked before the agent type and before the `--model` value. Never run the coding in this session instead.
   - **A missing agent type is an error, never a fallback.** If the agent type for the chosen level is not among the ones the Agent tool offers in this session, print `Error: agent type 'ai-dev-tools:<level>-effort' is not available in this session. Run /reload-plugins, or restart the session, and re-run.` and exit.
   - **`--model` is handed to the Agent tool unchanged.** On a value it does not accept, print `Error: --model must be a model the Agent tool accepts; got '<value>'.` and exit.
5. **Dispatch** the chosen mode with the matching override preamble from `references/implementation-step.md` Override Dispatch section. Every agent is dispatched in this one call form, with the coders' effort and model resolved in Resolve the Tier:
   ```
   Agent(subagent_type: "ai-dev-tools:<coder effort>-effort", prompt: <plan or task prompt>, model: "<coder model>")        # implement: coder, spec reviewer, escalation
   ```
   - **`single`:** one coder in that form, given the `single` preamble and the plan. It follows `superpowers:executing-plans`.
   - **`per-task`:** this session coordinates `superpowers:subagent-driven-development` with the `per-task` preamble. Every implementer and every task reviewer is dispatched in that form.
   - **Concurrency:** one agent runs at a time. Implementers, fix-round implementers and step 6's escalations write in this working tree and its index, and a task reviewer or a verification run beside one of them would read half-written edits. So none of the three runs beside a task reviewer or a verification run, and an implementer starts only after the task before it is closed: its task reviewer has returned, its fix rounds have ended and the coordinator's verification for that task has passed (the `per-task` preamble's override 2), or the task is marked BLOCKED.
6. **Escalation.** For each task the coders report BLOCKED, dispatch one fresh agent for that task in that form, given the `single` preamble and that task, at the coders' effort and with `model: "opus"`. Do this even when the coders already ran on Opus. `--effort` moves it with the coders, and `--model` never changes it. Escalations run one at a time and never beside another agent or a verification run, because they write in the same tree (step 5, Concurrency). If it fails, the task stays BLOCKED in the report.
7. **Verify before reporting.** After the coders return, this session runs the plan's verification commands itself and quotes their output, because a subagent's report is not evidence. The report gives the commits, the exact commands with their output, checks SKIPPED and why, and residual risk.

### Default Mode

When `--mode` is not passed and the picker is not presented (LIGHT and MECHANICAL runs), the mode is **single**. Override explicitly with `--mode single|per-task`.

---

## Return Contract with Orchestrate

When `/implement` is invoked via orchestrate (breadcrumb `/orchestrate (/implement <plan>)`), orchestrate resumes control after `/implement` returns. Orchestrate's post-`/implement` logic (defined in spec 04) runs auto-commit verification, writes `step: 6` to the hint file, and emits the Step 5 → Step 6 breadcrumb. On this path, a plan passed by orchestrate, `/implement` has no early exit: every return that is not an error exit is a normal completion, and it writes no marker file.

---

## State Synchronization Rules

**Only orchestrate writes the hint file.** `/implement` is stateless with respect to `tmp/orchestrate-state.md`:
- Reads the hint file (Step A path resolution) but never writes it.
- The orchestrate wrapper that invoked `/implement` is responsible for advancing the `step:` field after `/implement` returns.
- Standalone invocations (not via orchestrate) leave the hint file untouched.

---

## Edge Cases

1. **Both `path` arg and hint file populated** — `path` arg wins (Step A.1).
2. **`path` arg points to a nonexistent file** — Print `File not found: <path>` and exit.
3. **Hint file `plan:` field points to nonexistent file but `spec:` field is valid** — Fall through to `spec:` (Step A.3). Do not error on plan-not-found if spec is available.
4. **Spec has `## Phase 1` but only one phase** — Hard signal triggers, recommendation prompt shows. (Refine the threshold later if this is too aggressive.)
5. **Plan file has zero actionable tasks** — Task graph is empty; print `Plan contains no actionable tasks. Nothing to implement.` and exit.
6. **Spec recommendation prompt declined repeatedly** — User passes `--skip-plan-recommendation` once per invocation; not persisted.
7. **Plan and spec both in `tmp/`** — Location detection ambiguous; content fallback decides. If still ambiguous, error per Step B.4.
8. **Plan written by `/writing-plans` mid-orchestrate, then `/implement` invoked standalone with no path** — Hint file's `plan:` field has the freshly-written plan. Step A picks it up. Works.
9. **Concurrent orchestrate sessions writing different plans to the hint file** — Out of scope. Single-session assumption.
10. **Spec with no hard signals AND user wants a plan anyway** — User manually runs `/writing-plans <spec>` first; `/implement` is not a hard gate.
