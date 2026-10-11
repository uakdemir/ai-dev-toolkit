---
name: implement
argument-hint: "<path> [--mode single|per-task] [--model <model>] [--effort <level>] [--tier full|light|mechanical] [--plan|--no-plan]"
description: "Use when the user wants to execute a written implementation plan or implement directly from a spec — decides whether a spec needs a plan, generates a task graph, recommends an execution mode, and dispatches with quality overrides. Invoke with /implement <path>."
---

<help-text>
/implement — execute a plan or spec

Usage: /implement <path> [--mode single|per-task] [--model <model>] [--effort <level>] [--tier <level>]
                  [--plan | --no-plan]

Arguments:
  path             Plan or spec file to implement (required)
  --mode MODE      Skip the mode picker and dispatch directly:
                     single   = one agent carries the whole plan
                     per-task = one agent per task, and a task reviewer per task
  --model MODEL    Model of the coders (default: the tier's row)
  --effort LEVEL   Effort of the coders: high, xhigh, max (default: the tier's row)
  --tier LEVEL     Skip classification: full, light, mechanical (default: classified)
  --plan           Spec only: write a plan first, whatever the decision would be
  --no-plan        Spec only: implement from the spec, with no plan
  --help           Show this help

Examples:
  /implement docs/plans/2026-04-06-foo-plan.md  # explicit plan
  /implement docs/specs/2026-04-06-bar.md       # spec: decides whether it needs a plan
  /implement docs/specs/bar.md --no-plan        # implement directly from the spec
  /implement docs/plans/baz.md --mode per-task  # skip the picker
</help-text>

Parse arguments: if `--help` is present, output ONLY the text inside `<help-text>` tags above verbatim and exit. If `--mode` is present, validate its value against the set `{single, per-task}`; on any other value print `Error: --mode must be one of: single, per-task.` and exit. If `--effort` is present, validate its value against the set `{high, xhigh, max}`; on an out-of-set value print `Error: --effort must be one of: high, xhigh, max.` and exit. If `--tier` is present, validate its value against the set `{full, light, mechanical}`, matched exactly as `--effort`'s are; on any other value print `Error: --tier must be one of: full, light, mechanical.` and exit. If `--model` is present, check it for an old value first: `single`, `subagent`, `parallel` and `clear-context` named the execution mode before, and print `Error: --model now names the coders' model; for the execution mode use --mode single|per-task.` and exit. An old value never reaches the next check. Any other value is judged against the Agent tool in the Normal-feature path's step 4, "Checks before any dispatch", because that check needs the Agent tool. If `--plan` and `--no-plan` are both present, print `Error: --plan and --no-plan are exclusive.` and exit; either one alone settles Step C's decision (see Step C).

**Removed flags (7.0.0).** `--auto`: print `Error: --auto was removed in 7.0.0.` and exit, since continuing could prompt a caller that asked for no prompts. `--run-id <id>`: print `Warning: --run-id was removed in 7.0.0. Ignoring.`, drop the flag and its value, and continue. `--skip-plan-recommendation`: print `Warning: --skip-plan-recommendation was removed in 7.0.0; reading it as --no-plan.` and continue as though `--no-plan` had been passed.

# implement

Execute a written implementation plan or implement directly from a spec. `/implement` owns plan/spec detection, the decision whether a spec needs a plan, tier resolution, task-graph construction, execution-mode recommendation, the two-option mode picker, and the refactor-unit branch. Before Step A, record HEAD (`git rev-parse HEAD`): a run that implemented anything ends its output with the command for the next step, and that command names this SHA (see Handing Over).

---

## Step A — Path Resolution

1. If no positional `path` argument was provided, print this error and exit:
   ```
   Error: /implement needs a spec or plan path.
   ```
2. **Existence check:** verify the path points to a real file. If not, print `File not found: <path>` and exit (Edge Case 1).

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

Proceed directly to Step D with the plan path. `--plan` and `--no-plan` are for a spec: passed with a plan path, the flag is ignored. Print `warning: <flag> ignored: <path> is already a plan` and continue.

### If **spec** detected

This step never prompts, and never asks the user to review a plan. It stops only for a spec change that is both ambiguous and significant (item 3).

1. **Decide.** `--plan` → a plan is needed. `--no-plan` → no plan. Otherwise read the spec, and the code it touches, and judge whether a plan would change the outcome, as you would if asked "does this need a plan?". A plan pays for itself when the coder would otherwise have to settle sequencing, decomposition or interface questions the spec leaves open, or when the work is large enough that per-task execution and review are worth their cost. There is no file count, no signal table and no threshold. Print one line, and do not pause:

   ```
   Plan: needed — <reason>
   ```

   or `Plan: skipped — <reason>`. When a flag decided, the reason is that flag.
2. **Plan stage** (only when a plan is needed). Invoke `superpowers:writing-plans` in this session, on the spec, with this instruction placed before it:

   > Give every task a `Rollback:` field stating how to undo it — `Forward-fix only` is a valid value when stated deliberately. Save the plan under `docs/superpowers/plans/` and do not commit it. Do not ask the user to review the plan and do not present the Execution Handoff; return to /implement when the plan is saved.

   If writing-plans still presents a review request or an Execution Handoff, ignore it and continue. Then fill in any `Rollback:` the plan still lacks, so the plan gate in Step D never prompts on a plan this step wrote.
3. **Spec changes found while deciding or planning.** Sort each one on two questions: is it ambiguous (more than one defensible fix, so a decision is needed), and is it significant (your judgement; there is no threshold)?
   - **Not both** → make the change yourself: edit the spec and any plan, commit the spec edit alone (`docs(spec): <what changed>`), and continue. Every such edit is listed in the final report.
   - **Ambiguous and significant** → print the questions, delete any unfinished plan file, and stop before any dispatch. Nothing is implemented on a spec known to be undecided. When the user answers, write the answers into the spec, commit that edit alone (`docs(spec): <what changed>`), and resume this step with them. The questions are kept nowhere else: a later `/ai-dev-tools:implement <spec-path>` asks again about whatever is still open.
4. When a plan was written, print two lines, so an interrupted run can resume with `/ai-dev-tools:implement <plan-path>` and still be reviewed as a whole:

   ```
   Plan saved: <plan-path>
   After resuming, review with: /ai-dev-tools:review-code <sha> --against <spec-path>
   ```

   `<sha>` is the HEAD recorded before Step A. The resumed run is a run given a plan, so it cannot rebuild that command (see Handing Over). Then continue to Step D with the plan, or with the spec when no plan was needed.

---

## Step D — Dispatch with Execution Mode

### Refactor-Unit Branch Handling (pre-check)

Before building the task graph, perform this refactor-unit check:

1. Check if a refactor roadmap exists at `docs/monorepo-strategy/roadmap.md` OR `docs/layer-architecture/roadmap.md` with unchecked items.
2. If so, perform a **case-insensitive substring match** of the feature name against the bold roadmap item labels (text between `**` markers in the checkbox line, not the full rationale). The feature name is the plan/spec filename, stripped of its date prefix and its `-plan.md`/`.md` suffix.
3. **If the match succeeds → refactor-unit path:**
   - Skip the task graph generation and execution mode recommendation (steps 1-2 in the normal-feature path below).
   - Load `references/refactor-execution.md` and execute directly following its **Pre-flight → File Operations → Verification** sequence.
   - Perform the checklist pre-flight surfacing: read `tmp/checklists/index.md` if it exists, filter for rows where Phase is `coding` or `both` AND Recommended Skill contains `refactor-to-monorepo` or `refactor-to-layers`. Surface any matching entries to the user before beginning execution. Note: the `refactor-to-layers` filter branch currently returns empty (no checklist crystallization section) — do not warn on an empty result from that branch.
   - **Flag handling:** this path dispatches no agent and resolves no tier, so `--mode`, `--model`, `--effort` and `--tier` are all **ignored** on it. If any of them was passed, print one warning naming each one passed, e.g. `warning: --mode, --model ignored for refactor-unit execution`, and continue.
   - **Tick and commit when verification passes.** When the sequence's Verification passes, tick the matched roadmap item (`- [ ]` → `- [x]`) and commit the unit's changes together with the tick, as one commit whose subject names the unit, such as `refactor: extract <unit>`. A run whose verification fails ticks nothing and commits nothing, and says so in its `## Validation` block.
   - End the report with the `## Validation` hand-back block defined in `references/refactor-execution.md`. The hand-over command follows it (see Handing Over).
4. **If the match fails (normal-feature path) → proceed to Resolve the Tier, then the normal-feature dispatch below.**

### Resolve the Tier

Runs after the refactor-unit pre-check has failed to match and before the task graph is built. The refactor-unit path dispatches no agent, and a run that stops at Step C dispatches nothing, so neither resolves a tier.

**Every run resolves its tier before it dispatches an agent, prints the tier and its reason first, and takes its process and each agent's model and effort from that tier unless a flag sets them.** Defined once, in `references/shared-rules/risk-tier.md`, and shared with `review-code` and `review-doc`. **Every dispatched agent is the plugin agent that matches its phase's effort, and carries its phase's model on its Agent call; the run's tier sets both unless a flag does.** Defined once, in `references/shared-rules/agent-dispatch-pin.md`, and shared with `review-code` and `review-doc`. Read the tiers, the routing table, the floor format and the tier-line formats at run time, from `${CLAUDE_PLUGIN_ROOT}/references/shared-rules/risk-tier.md`: this skill restates none of them.

1. **Classify**, unless `--tier` was passed. Use the code tier, read from the plan or spec being implemented, and add the triggers in the `## Risk tiers` section of the root CLAUDE.md when it has one. When unsure between two tiers, take the higher. The reason names the trigger and the evidence, such as a task number.
2. **Floor.** The file is `tmp/risk-tier-$CLAUDE_CODE_SESSION_ID.md`. It counts only when its `session:` matches the variable and its `branch:` matches `git rev-parse --abbrev-ref HEAD`; otherwise it is ignored and then overwritten, never used. Another conversation's file is never read. Take the higher of the stored tier and the classified one, as the rule defines; `--tier` skips both. **When `CLAUDE_CODE_SESSION_ID` is unset, neither read nor write the file, and end the tier line with `(not carried: no session id)`.**
3. **Print** the two tier lines, after Steps A to C and ahead of the task graph, and do not pause after them. The coders' model and effort come from the tier's row; `--model` and `--effort` replace their own fields, labelled on the line. On a FULL run without `--mode` the second line reads `mode pending · …` (formats in the rule).
4. **Write** the floor after printing (create `./tmp/` if needed): `tier`, `reason` (`--tier <level>` for a `--tier` run), `session`, `branch`, `set_by: implement` and `set_at`. A run that carried the floor's tier writes the stored `reason`, `set_by` and `set_at` back unchanged, as the rule defines. Skipped when there is no session id.

**Process by tier:**
- **FULL:** the mode picker below. `--mode` skips it.
- **LIGHT:** `single`, with no picker and no per-task reviewers.
- **MECHANICAL:** `single`, or a scripted exact-once edit by this session. The edit is allowed when the plan's change is a rename, move or reformat that one command applies and an instrument (a grep that must return nothing, a build) proves. The session commits the edit as one commit before it verifies and reports, dispatches no agent, and its second tier line is `mode scripted edit · no agents`.
- An explicit `--mode` replaces the mode the tier's row gives, on any tier; the scripted edit is then not used.

### Normal-feature path

Load `references/implementation-step.md` (which transitively loads `references/task-graph.md`) and follow its logic:

1. Build the task graph from the plan (per `references/task-graph.md`).
1.5. **Plan gate — rollback stated per task.** Every task states how to undo it before implementation begins. **"Forward-fix only" is an acceptable answer when stated deliberately** — what is unacceptable is discovering at failure time that nobody considered it. Treat schema migrations and infrastructure applies as requiring an explicit rollback, never a default.

   The two branches below are the whole rule. A plan this skill wrote in Step C reaches neither: every task in it states its `Rollback:`.
   - **No task carries a `Rollback:` field** → the plan predates the field. Print `Plan predates the Rollback field; no per-task rollback stated` and continue without prompting — except for any task the plan itself describes as a schema migration or an infrastructure apply, which is prompted regardless. Judge that from the task's own text and `Files:` paths; do not infer it from anything outside the plan.
   - **Some tasks carry it and some do not** → list every task whose `Rollback:` field is missing or empty, and ask the user to supply one or confirm forward-fix-only. Do not dispatch until each is resolved.
2. Compute the execution mode recommendation (per `references/implementation-step.md` Execution Mode Recommendation section). Only FULL uses it, for the picker.
3. **Settle the mode.**
   - FULL with `--mode` → that mode, with no picker.
   - FULL otherwise → present the two-option picker exactly as defined in `references/implementation-step.md`:
     ```
     [1] single   — one <coders> agent carries the whole plan
     [2] per-task — one <coders> agent per task, and a spec reviewer per task
     ```
   - When the picker settles the mode, print `Mode: <mode> (picked)`.
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
7. **Verify before reporting.** After the coders return, this session runs the plan's verification commands itself and quotes their output, because a subagent's report is not evidence. The report gives the commits, the exact commands with their output, checks SKIPPED and why, residual risk, and every spec edit Step C made.
8. **Hand over.** End the output with the `review-code` command (see Handing Over).

### Default Mode

When `--mode` is not passed and the picker is not presented (LIGHT and MECHANICAL runs), the mode is **single**. Override explicitly with `--mode single|per-task`.

---

## Handing Over

A run that implemented anything ends its output with the command for the next step, alone, after the report. `<sha>` is HEAD when the run started, as recorded before Step A:

```
/ai-dev-tools:review-code <sha> --against <spec-path>
```

- A run given a plan prints no `--against`: `/ai-dev-tools:review-code <sha>`. A run given a spec names that spec, whether or not Step C wrote a plan for it.
- A resumed run is a run given a plan that an interrupted run of this skill wrote. Its own command would start at the resumed run's SHA and name no spec, and so leave out every commit the interrupted run made. The command that reviews the whole work is the one the interrupted run printed under `Plan saved:` (Step C, item 4): when that line is in the conversation, end the output with that command instead of this run's own.
- A run **implemented something** when a coder, the scripted edit or the refactor-unit path committed work. A run that stopped at Step C, exited on an error, or ended with nothing committed prints no command.

---

## Edge Cases

1. **`path` arg points to a nonexistent file** — Print `File not found: <path>` and exit.
2. **Plan file has zero actionable tasks** — Task graph is empty; print `Plan contains no actionable tasks. Nothing to implement.` and exit.
3. **Plan and spec both in `tmp/`** — Location detection ambiguous; content fallback decides. If still ambiguous, error per Step B.4.
4. **A plan path passed with `--plan` or `--no-plan`** — The flag is ignored and a one-line warning is printed (Step C).
5. **`--auto` passed** — `Error: --auto was removed in 7.0.0.` and exit, since continuing could prompt a caller that asked for no prompts.
6. **`--run-id` or `--skip-plan-recommendation` passed** — `--run-id` is ignored, and `--skip-plan-recommendation` is read as `--no-plan`, each with a one-line `removed in 7.0.0` warning.
