---
name: review-doc
argument-hint: "<path...> [--against <ref>] [--effort high|xhigh|max] [--fix-effort high|xhigh|max] [--model <model>] [--fact-check <true|false>] --max-iterations N [--run-id <id>]"
description: "Use when reviewing analysis specs, design documents, or implementation plans for completeness, accuracy, and implementability. Supports single-pass review (--max-iterations 1) and iterative review-fix cycles. Invoke with /review-doc <path1> [path2 ...] or /review-doc <directory/>."
---

# Review Doc

Iterative document review. Dispatches a single merged reviewer to check completeness, consistency, implementability, and more. Fixes issues automatically between rounds. Unless `--fact-check false` is passed, a fact-checker runs alongside the reviewer and verifies the document's claims against the codebase; `scripts/merge-fact-check.cjs` merges its findings into the round's review JSON before the fixer, so fact-check findings get fixed in the same pass. A self-review pass always follows the fixer: it checks the fixer's own edits, corrects what it finds once, and reports those findings outside the round's gate counts. Produces a curated human-readable summary.

**Output:** `tmp/_reviews_errors/review-doc.json` (structured, machine-readable) + `tmp/_reviews_errors/review-doc-summary.md` (curated human summary, max 10 items + aggregates). When `--run-id` is provided, files are prefixed: `tmp/_reviews_errors/<run_id>-review-doc.json`.

## Argument Parsing

Parse arguments after `/review-doc`:

```
/review-doc <path1> [path2 ...] [--against <ref-path>] [--effort <level>]
            [--fix-effort <level>] [--model <model>] [--fact-check <true|false>]
            --max-iterations N [--run-id <id>] [--help]
/review-doc <directory/>       [--against <ref-path>] [...]
```

| Flag | Default | Values | Purpose |
|---|---|---|---|
| `--against <ref-path>` | none | any file path | Reference document for cross-checking |
| `--effort` | high | high, xhigh, max | Reasoning-effort level of the reviewer and the fact-checker: it selects the agent each one is dispatched as |
| `--fix-effort` | high | high, xhigh, max | Reasoning-effort level of the fixer and the self-reviewer: it selects the agent each one is dispatched as |
| `--model <model>` | none | any model the Agent tool accepts | Model for all agents, passed as `model` on every Agent call. Absent: the calls name no model |
| `--fact-check` | true | true, false | When true, runs the fact-checker alongside the reviewer in each iteration; its findings are merged before the fixer |
| `--max-iterations` | **required** | 0-10 | How many rounds to run (0 = skip). No default: the caller states it. Early exit when the round's criticals reach 0 — `total_criticals` with `--fact-check true`, `pre_fix_criticals` otherwise (see Review Loop property 3) |
| `--run-id` | none | string | Prefixes output files for run scoping; optional (backward compatible) |
| `--help` | --- | --- | Print usage and exit |

**`--max-iterations` is required.** If it is absent, print `Error: --max-iterations is required (0-10).` and exit. If the value is not an integer in 0-10, print `Error: --max-iterations must be an integer between 0 and 10.` and exit.

It has no default because the number of rounds is the caller's budget decision, and a silent default hides it. It is also what makes the loop bounded by construction: with the cap always stated, a review cannot run away, which is why there is no loop-detection failure mode — see `../orchestrate/references/auto/failure-handling/unresolved-criticals.md`. A round that ends with criticals outstanding is a result to report, not a loop to diagnose.

**Removed flags:** `--min-model`, `--max-model` (clean break, no backward compat shim). `--model` is not one of them: 3.0.0 ignored it with a warning, and it acts again.

If either is present, print `Warning: <flag> is no longer supported; use --model to set the model of every agent. Ignoring.` — substituting the flag actually passed — and continue. Do not exit: the flag is inert, not invalid. Accepting it silently was the previous behaviour and gave the caller no signal that it had done nothing.

`--verify-fixes` is also removed. The self-review pass it used to gate is now unconditional — it runs after every fix phase, in every iteration where the fixer ran. If it is present, print `Warning: --verify-fixes is no longer supported; the self-review pass always runs. Ignoring.` and continue.

If `--effort` is present, validate its value against the set `{high, xhigh, max}`; on an out-of-set value print `Error: --effort must be one of: high, xhigh, max.` and exit. When `--effort` is not passed, default to `high`.

If `--fix-effort` is present, validate its value against the same set; on an out-of-set value print `Error: --fix-effort must be one of: high, xhigh, max.` and exit. When `--fix-effort` is not passed, default to `high`. No combination of the two flags is rejected: `--effort high --fix-effort max` is legal.

**`--effort`, `--fix-effort` and `--model` decide what each agent is dispatched as. Every dispatched agent is the plugin agent that matches its phase's effort flag, `--effort` for the reviewer and the fact-checker and `--fix-effort` for the fixer and the self-reviewer, and carries `--model` on its Agent call whenever the flag was passed.** Defined once, in `references/shared-rules/agent-dispatch-pin.md`, and shared with `review-code`. The reviewer and the fact-checker are dispatched in one of the first two of these forms, the fixer and the self-reviewer in one of the last two, and none in any other:

```
Agent(subagent_type: "ai-dev-tools:<--effort value>-effort", prompt: <substituted prompt>)                                  # reviewer, fact-checker; no --model
Agent(subagent_type: "ai-dev-tools:<--effort value>-effort", prompt: <substituted prompt>, model: "<--model value>")       # reviewer, fact-checker; --model
Agent(subagent_type: "ai-dev-tools:<--fix-effort value>-effort", prompt: <substituted prompt>)                              # fixer, self-reviewer; no --model
Agent(subagent_type: "ai-dev-tools:<--fix-effort value>-effort", prompt: <substituted prompt>, model: "<--model value>")   # fixer, self-reviewer; --model
```

| `--effort` or `--fix-effort` | Agent type |
|---|---|
| `high` | `ai-dev-tools:high-effort` |
| `xhigh` | `ai-dev-tools:xhigh-effort` |
| `max` | `ai-dev-tools:max-effort` |

- **The agent type sets the reasoning effort.** The Agent tool has no effort parameter, and an agent dispatched without `subagent_type` runs at the effort of the session that dispatched it, whatever this flag says. The effort level written into each dispatch prompt is a depth directive: wording about how far to take the analysis. It sets nothing.
- **`--model` is handed to the Agent tool unchanged.** Its accepted values are the ones that tool's `model` parameter accepts in the running session. On a value it does not accept, print `Error: --model must be a model the Agent tool accepts; got '<value>'.` and exit, during argument parsing and before Setup.
- **With no `--model` the calls name no model**, and this skill makes no claim about which one runs. Claude Code resolves it: `CLAUDE_CODE_SUBAGENT_MODEL` when that variable is exported, the session's model otherwise.
- **A session with no Agent tool cannot run this skill.** Claude Code gives no Agent tool to an agent at its spawn-depth cap, so a skill invoked inside a sub-agent may find none. If this session has none, print `Error: this session has no Agent tool, so the review agents cannot be dispatched. Run the skill from the top-level session, or raise CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH (at least 2 for a first-level sub-agent).` and exit, during argument parsing and before Setup. This is checked before the agent type and before the `--model` value: a session with no Agent tool offers no agent types and no `model` parameter to judge a value against, and reloading plugins does not help it. Never run the phases in this session instead: the reviewer, the fact-checker, the fixer and the self-reviewer would share one context, at this session's effort and on its model.
- **A missing agent type is an error, never a fallback.** If the agent type for the chosen level is not among the ones the Agent tool offers in this session, print `Error: agent type 'ai-dev-tools:<level>-effort' is not available in this session. Run /reload-plugins, or restart the session, and re-run.` and exit, during argument parsing and before Setup. A call without `subagent_type` would run, and would report as though the flag had been honoured.

### `--help` Output

When `--help` is passed, print the following and exit (no review runs):

```
Usage: /review-doc <path1> [path2 ...] [flags]
       /review-doc <directory/> [flags]

Iterative document review. Dispatches a single merged reviewer for
completeness, consistency, and implementability. Fixes issues automatically
between rounds. A self-review pass always follows the fixer, checking and
correcting the fixer's own edits once. A fact-checker runs alongside the
reviewer unless --fact-check false is passed.

Flags:
  --against <ref-path>    Reference document for cross-checking (default: none)
  --effort <level>        Reviewer, fact-checker: high, xhigh, max (default: high)
  --fix-effort <level>    Fixer, self-review: high, xhigh, max     (default: high)
  --model <model>         Model for every agent              (default: none)
  --fact-check <bool>     Run fact-checker each iteration    (default: true)
  --max-iterations N      Rounds to run, 0=skip              (REQUIRED)
  --run-id <id>           Prefix for output files            (default: none)
  --help                  Print this help and exit

Agents:
  --effort picks the agent the reviewer and the fact-checker are dispatched
  as, --fix-effort the agent of the fixer and the self-review:
  ai-dev-tools:high-effort, ai-dev-tools:xhigh-effort, ai-dev-tools:max-effort.
  The agent sets the reasoning effort. --model sets the model; without
  it the Agent calls name none and Claude Code chooses.

Removed:
  --min-model, --max-model            Ignored with a warning; use --model
  --verify-fixes                      Ignored with a warning; the self-review
                                      pass always runs

Examples:
  /review-doc docs/spec.md                                  Default review
  /review-doc docs/spec.md --fact-check false               Skip the fact-check
  /review-doc docs/spec.md --max-iterations 3               Up to 3 rounds
  /review-doc docs/spec.md --run-id k3m9p2q7_a1b2c3d4      Scoped output
  /review-doc docs/spec.md --max-iterations 1 --effort max --model opus    Review at max, fixes at high
  /review-doc docs/spec.md --max-iterations 1 --effort max --fix-effort max --model opus    Every agent at max
```

## Setup

1. Ensure `./tmp/_reviews_errors/` directory exists (create if needed).
2. Delete stale files from prior runs:
   - Without `--run-id`: `./tmp/_reviews_errors/review-doc.json`, `./tmp/_reviews_errors/review-doc.json.bak`, `./tmp/_reviews_errors/review-doc-summary.md`, `./tmp/_reviews_errors/review-doc-fix-report.json`, `./tmp/_reviews_errors/review-doc-brainstorm.md`, `./tmp/_reviews_errors/review-doc-iteration-*.md`, `./tmp/_reviews_errors/review-doc-iteration-*.json`, `./tmp/_reviews_errors/review-doc-fix-report-iteration-*.json`, `./tmp/_reviews_errors/review-doc-fact-check.json`, `./tmp/_reviews_errors/review-doc-fact-check-iteration-*.json`
   - With `--run-id`: `./tmp/_reviews_errors/<run_id>-review-doc*.json`, `./tmp/_reviews_errors/<run_id>-review-doc*.json.bak`, `./tmp/_reviews_errors/<run_id>-review-doc*.md`

   The `.bak` entries matter because the `*.json` globs do not match them — a backup left by a prior run's self-review phase would otherwise survive into the next run.

   The three per-round snapshot globs matter for the same reason: the exact filenames beside them name only the live artifacts, so without the globs a four-round run followed by a two-round run leaves the earlier run's `-iteration-3` and `-iteration-4` snapshots sitting beside the new run's rounds with nothing to tell them apart — and those files are the durable per-round record every cross-round aggregate is checked against. The `--run-id` branch needs no addition: `<run_id>-review-doc*.json` already matches all three.

## Pre-Flight Checks

1. **Branch guard — unconditional, never waived.** Resolve the current branch yourself:

   ```bash
   git rev-parse --abbrev-ref HEAD
   ```

   If it is `main` or `master`, the behaviour depends on whether there is a user to ask:
   - **Interactive:** print `Warning: you are on branch '<name>'. Fix commits will land here. Continue?` and pause for explicit approval. Blocking.
   - **Programmatic or auto dispatch (no user to prompt):** abort — `Error: refusing to run on branch '<name>'; dispatch from a feature branch.`

   Worded identically to `review-code`'s pre-flight check 2, and for the same reason: **this skill commits.** The Respond to Remaining Issues phase commits what it applies, and it never asks the user first. A skill that commits unattended needs the guard whether or not it dispatches a fixer that commits — the divergence where `review-code` had this check and `review-doc` did not was an oversight, not a policy.

2. Tokens before the first flag (`--*`) are input paths.
3. If no input paths are provided: print `"Error: no input paths provided."` and exit.
4. If a path is a directory: expand to all `*.md` files inside it (recursive, sorted alphabetically, max 20 files). If more than 20 `.md` files are found: print `"Error: directory contains more than 20 .md files. Use explicit paths to select a subset."` and exit. If zero `.md` files: print `"Error: directory contains no .md files."` and exit.
5. When a mix of directories and explicit files is provided, expand directories first, then merge with explicit paths. Deduplicate any paths that appear in both. The 20-file cap applies to the final merged list.
6. All explicit file paths are validated for existence. If any are missing: print `"Error: file not found: <path>"` for each and exit.
7. `--against` must be a file path, not a directory. If a directory is passed: print `"Error: --against value must be a file, not a directory."` and exit.
8. If `--against` provided, validate `<ref-path>` exists. If not: `"Error: reference document not found: <ref-path>"`
9. **Duplicate locations.** For each input path, glob the repository for other files with the same basename (`**/<basename>`, excluding `node_modules/`, `.git/`, and build output).

   **First, is it one document or a naming convention?** This gate runs before the cap, not inside it. A basename that names a file *per directory* — `SKILL.md`, `README.md`, `index.md`, `AGENTS.md`, `CLAUDE.md`, `CHANGELOG.md` — is a convention, not a document duplicated across locations, however few copies exist. Treat any basename whose copies are not substantially the same document as a convention. Print `Warning: <basename> exists at N locations; treated as a naming convention, not expanded. Copies not reviewed: <paths>` and continue with the explicit paths only.

   Gating on the cap alone is not enough, and the failure is not hypothetical: this plugin has `SKILL.md` at 15 locations, so a two-file review fits the 20-file cap and the rule then mandates pulling 13 unrelated skill definitions into scope — whose differences the reviewer reports as `cross-reference` findings, which the fixer must always defer, so every round re-discovers and re-defers the same divergences and the cap is spent on them.

   When the copies **are** one document in more than one location:
   - Print every matched path. Never resolve the ambiguity silently — the user must see that more than one copy exists whatever happens next.
   - Pass the copies to the reviewer as read-only context if that keeps the total within the 20-file cap. The reviewer then reads **both** and surfaces the conflict as a `cross-reference` finding. Read-only copies never enter the fixer's document paths: which copy is authoritative is the user's call, not the fixer's.
   - If adding them would exceed the cap, do NOT expand and do NOT error — a common basename (`README.md`, `index.md`) is not a duplicated document. Print `Warning: <basename> exists at N locations; not expanded (20-file cap). Copies not reviewed: <paths>` and continue with the explicit paths. This is a skipped check, so it is stated, not dropped.

## Review Loop

**`--max-iterations 0`:** **Handled during argument parsing, before Setup runs**, exactly as in `review-code` — neither Setup's directory creation nor its stale-file deletion happens, so no files are created and a no-op invocation cannot discard a completed prior run's artifacts. Skip loop entirely. Output: `Review Doc Skipped / Reviewed: <docs> / No iterations run. / Brainstorm (needs your decisions): none — no iterations run`. The handoff line prints here too: `references/shared-rules/brainstorm-handoff.md` requires it unconditionally, and a skipped run is exactly the case where a missing line is indistinguishable from a skill that forgot.

**`--max-iterations >= 1`:** Run the simplified loop below. There is no separate single-pass mode — `--max-iterations 1` is just one iteration of the same loop.

```python
# One invocation = one loop, one fact-check setting (the reviewer and the fact-checker are the
# --effort agent, the fixer and the self-reviewer the --fix-effort agent; --model on every call when passed)
for iter in 1..max_iterations:
    if fact_check:
        delete(fact_check_json)         # so the merge can only ever read this round's file
        review() + fact_check()         # dispatched in ONE message, so they run concurrently;
                                        # the fact-checker writes only its own fact-check JSON
    else:
        review()                        # reviewer agent (the --effort agent; --model when passed)
    validate(json)                      # schema-check reviewer output; retry review() alone once on failure, abort iteration on 2nd
    pre_fix_criticals = count(json)     # option Y: measured at review output, before the merge
    if fact_check and fact_check_returned_ok:
        merge_fact_check()              # scripts/merge-fact-check.cjs appends, renumbers, recounts and
                                        # validates; any exit but 0 is a failed fact-check, json stays the reviewer's
    total_criticals = count(json)       # re-count after the merge (includes fact-check-added criticals)
    total_issues = count_issues(json)   # the round's own array only — self-review
                                        # entries are appended after this point
    if total_issues > 0:
        fix()                           # EVERY severity, every iteration — not only criticals (the --fix-effort agent)
        self_review()                   # always: checks the fixer's own edits, fixes what it
                                        # finds ONCE, appends its findings with
                                        # origin: "self-review" (never counted this round)
    snapshot(iter)                      # EVERY round, inside the loop and outside the `if`:
                                        # copy this round's artifacts to …-iteration-N.json
                                        # before the next round's reviewer overwrites them —
                                        # the review JSON always, the fix report ONLY if fix()
                                        # ran this round, the fact-check JSON ONLY if this
                                        # round's fact-check failed (see Cross-Iteration Tracking)
    exit_gate = total_criticals if fact_check else pre_fix_criticals
    if exit_gate == 0:
        break                           # no criticals left -> this was the last round
```


**Key behavioral properties:**
1. No phase logic, no tier promotion, no hidden final gate.
2. The fact-checker runs alongside the reviewer and is merged before the fixer in each iter (so fact-check criticals get resolved in the same iter).
3. **Fixing and iterating are separate decisions.** The fixer runs whenever the round found anything at all — critical, high, medium or low. Only the decision to run *another* round is gated on criticals: `total_criticals == 0` when `--fact-check true`, and `pre_fix_criticals == 0` otherwise.

   Gating the fix phase on criticals meant a round that found eleven highs and ten mediums and no criticals fixed **nothing** and handed all twenty-one to a human — contradicting `references/shared-rules/brainstorm-handoff.md`, which requires the fix phase to always run and the document to receive only what has more than one defensible answer. It also silently disabled the self-review pass, which runs only after a fix phase: on the zero-critical path the triage phase then applied edits with nothing reviewing them. A minor finding the agent can fix is still worth fixing; whether it justifies another *round* is a different question, and that one is still severity-gated.

   Option Y is unchanged where it is defined: `pre_fix_criticals` is still measured at review output, before fact-check. What changed is only which number decides the *early exit*. Gating that on `pre_fix_criticals` meant a run where the reviewer found 0 criticals and the fact-checker found some exited without fixing them — contradicting property 2 below, the skill description, and the Fact-Checker dispatch section, all three of which promise the fixer follows the fact-checker. In orchestrate stage-i phase 2 (`--fact-check true --max-iterations 2`) the abandoned criticals then reach the unresolved-criticals gate as "any critical remaining" and the run stops — for criticals the loop itself declined to fix.

   The unresolved-criticals gate is a separate reader, not a different number. It is evaluated once, at the final round rather than at every round, and it takes `critical_count` off the artifact rather than the loop's own variable — but numerically that is the same pre-fix count the early exit tests: on a fact-checked run the artifact field carries the recount `scripts/merge-fact-check.cjs` makes over the full issues array when it merges the fact-check findings, which is `total_criticals`; otherwise it is the reviewer's own count, which is `pre_fix_criticals`. Pre-fix, then, but not pre-fact-check — fact-check-added criticals do reach the gate, and are meant to: the fact-checker runs against the document as authored, before the fixer, so its findings are document-origin and count like any other.
4. The caller (orchestrate `--auto`) decides phase structure by invoking the skill multiple times with different `--fact-check` settings.
5. The reviewer and the fact-checker are the `--effort` agent and the fixer and the self-reviewer the `--fix-effort` agent (both default `high`), which is what sets their reasoning effort, and every dispatch carries `--model` on the call when it was passed. The call forms are in Argument Parsing.
6. `validate(json)` runs right after `review()`:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-review-json.cjs --schema doc <output-path>
   ```

   Exit 0 → use the printed recount as the authoritative severity counts. Exit 1 or 2 → retry the reviewer once, and abort the iteration on a second failure — status **Error**, per `references/shared-rules/run-failure-disclosure.md`. If node is unavailable, fall back to reading the file and record `schema validation not run: node unavailable` in the iteration log.

   **This call checks the reviewer's own output and nothing else.** Two later phases rewrite the same file — the fact-check merge appends and recomputes `critical_count`, and the self-review pass appends without recomputing. The merge checks itself: `scripts/merge-fact-check.cjs` validates the merged artifact before it renames it over the review JSON, and leaves the reviewer's file untouched when that fails, so property 3's early exit never reads a recount nothing verified. The self-review pass's appends are not covered here; a wrong entry there is not carried anywhere — the next round writes a fresh artifact over this one rather than recounting it — and the closing validation in the Final Report is the only check on them.
7. `self_review()` runs after `fix()`, in every iteration where the fixer ran. It is **always on** — there is no flag. It reads the fix report, re-reads only the regions that report names, and both **reports and fixes** what it finds, exactly once (depth 1). It never rewrites `critical_count` or `high_count`, and everything it appends carries `origin: "self-review"` (see the Self-Review dispatch section).
8. **Depth 1, and the tail is disclosed rather than carried.** The text the self-review pass itself writes is not re-reviewed within the same round — unbounded self-review is the same loop with more steps. If another round runs, its reviewer covers those lines as ordinary document text, because every round re-reads the whole document. The tail is only a real gap on the **final** round, and the summary states how many lines the final self-review pass wrote unreviewed. There is no cross-round carry mechanism: the next round's full re-read already is one.

## Agent Dispatch

All `agents/` and `prompts/` paths in this section are relative to this skill's root directory (e.g., `${CLAUDE_SKILL_DIR}/`).

**Every dispatched prompt receives its output path by substitution, never by description.** `{{OUTPUT_PATH}}`, `{{FACT_CHECK_PATH}}` and `{{FIX_REPORT_PATH}}` are resolved by the skill — which is the only party that knows whether `--run-id` is active — before the prompt reaches the agent. Each prompt states what to do if the placeholder arrives unsubstituted: report and stop, never fall back to the unprefixed default, which would clobber another run's artifact.

### Reviewer

The orchestrator dispatches a single reviewer agent, as the `--effort` agent and on the `--model` model when one was passed.

Read `prompts/reviewer.md` and dispatch it as the reviewer agent prompt using the Agent tool: `Agent(subagent_type: "ai-dev-tools:<--effort value>-effort", prompt: <reviewer-prompt>)`, adding `model: "<--model value>"` when `--model` was passed. The skill substitutes `{{OUTPUT_PATH}}` → the resolved `tmp/_reviews_errors/[<run_id>-]review-doc.json`. Unless `--fact-check false` was passed, this call goes in the same message as the fact-checker's (below), so the two agents run concurrently.

**Each round's reviewer starts fresh.** It is not given the previous iteration's fix report and does not read the previous artifact. Round 2 re-reads the document as it now stands and reports what it finds; a defect round 1 fixed is absent from its findings rather than carried forward and excluded. That is what makes `critical_count` a per-round number by construction instead of by bookkeeping.

The dispatch prompt must include:
- The effort level (`--effort` value) as a depth directive: `max` = exhaustive analysis; `xhigh`/`high` proportionally less. All severities stay in scope regardless. The directive words the depth; the agent type is what sets the reasoning effort.
- The document paths list:
  ```
  Documents to review:
  - path1.md
  - path2.md
  ```
  For single file, use the same list format with one entry.
- Any duplicate copies found by pre-flight check 9 (**Duplicate locations**), as a separate list:
  ```
  Additional copies (read-only, do not fix):
  - other/path/doc.md
  ```
- The `--against` reference path (if provided)

The reviewer writes `tmp/_reviews_errors/review-doc.json` (or `tmp/_reviews_errors/<run_id>-review-doc.json` when `--run-id` is active).

### Fact-Checker (unless `--fact-check false`)

Runs **alongside the reviewer**: the orchestrator dispatches the two in the same message, so neither waits for the other. It verifies the document's claims against the codebase and never reads the reviewer's output, so nothing it does depends on the reviewer finishing first. It is not terminal — its findings are merged into the review JSON before the fixer, which resolves any fact-check-added criticals in the same round.

Before the dispatch, in every round, the orchestrator deletes `tmp/_reviews_errors/review-doc-fact-check.json` (or the run-id-prefixed variant). The merge treats a missing file as a failed fact-check, and that holds in every round only because no earlier round's file can still be there: without the deletion, a fact-checker that returned without writing would leave the previous round's findings to be merged, at locations that round's fixer already changed.

Read `agents/codebase-fact-checker.md` and dispatch: `Agent(subagent_type: "ai-dev-tools:<--effort value>-effort", prompt: <fact-checker-prompt>)`, adding `model: "<--model value>"` when `--model` was passed. Include the effort level (`--effort` value) in the dispatch prompt as a depth directive (the agent type sets the reasoning effort). The skill substitutes `{{FACT_CHECK_PATH}}` → the resolved `tmp/_reviews_errors/[<run_id>-]review-doc-fact-check.json`.

The fact-checker writes that file and touches nothing else, so the orchestrator takes no backup before dispatching it. Once the reviewer's output has passed `validate(json)`, the orchestrator merges the two:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/merge-fact-check.cjs <review-json-path> <fact-check-json-path>
```

The script validates the fact-check artifact, appends its issues to the review JSON's `issues` array numbered from the reviewer's highest id + 1 (from `ISSUE-001` when the reviewer found nothing), copies `fact_check_claims` and `fact_check_accuracy`, recounts `critical_count` and `high_count` over the full array (`origin: "self-review"` excluded, per `references/shared-rules/counts-exclude-self-review.md`), and validates the merged result with `validate-review-json.cjs --schema doc` before renaming it over the review JSON. Exit 0 → use the recount it prints as the round's counts. Any other result — 1 for a missing or invalid artifact or a merged result that fails validation, 2 when it cannot run, 127 when `node` is absent — is a failed fact-check, and the review JSON is still exactly what the reviewer wrote. If the reviewer's output fails validation twice, the iteration aborts as it always has, and a completed fact-check file is not merged.

**Abort and failure.** The fact-check fails when the fact-checker returns a first line beginning with the literal prefix `ABORT: `, when it crashes or returns nothing, or when the merge exits with anything but 0. On a failure the orchestrator does not merge (or the merge has already left the review JSON untouched), prints `Warning: fact-check aborted — <reason>. Falling back to reviewer output.` — for a failed merge `<reason>` gives the exit code and its cause, e.g. `merge exited 127: node unavailable` — and proceeds to the fixer with the reviewer's output. The pass counts as not completed (Status Logic). A dispatch the Agent tool refuses is not one of these: it is status **Error** (Error Handling).

### Fixer

Dispatched whenever the round found **any** issue after review (and optional fact-check) — critical, high, medium or low. Not gated on severity: see Review Loop property 3.

Read `prompts/coder.md` and dispatch: `Agent(subagent_type: "ai-dev-tools:<--fix-effort value>-effort", prompt: <fixer-prompt>)`, adding `model: "<--model value>"` when `--model` was passed. The skill substitutes `{{DOC_PATHS}}` → the newline-separated document path list, `{{AGAINST_PATH}}` → the `--against` value or `none`, and `{{FIX_REPORT_PATH}}` → the resolved `tmp/_reviews_errors/[<run_id>-]review-doc-fix-report.json`.

The dispatch prompt must include:
- The effort level (`--fix-effort` value) as a depth directive (the agent type sets the reasoning effort)
- All issues grouped by severity
- The document paths list
- Reference document path (if `--against` provided)

The fixer reads each document's content using the Read tool (not passed via dispatch context). Edits documents using the Edit tool for targeted fixes. Uses the Write tool only for the fix report — never to create new documents.

Produces `tmp/_reviews_errors/review-doc-fix-report.json` (or `<run_id>-review-doc-fix-report.json`) with dispositions for every issue:
- `fixed` -- issue resolved
- `deferred` -- out of scope, with reason
- `pushed-back` -- reviewer finding is incorrect, with reason

A `fixed` disposition may also carry `collateral: [{location, why}]` — edits the fixer made outside the findings because its own fix to a flagged location invalidated that location (a count, a rule, a cross-reference, a table cell). Unrelated improvements, restyling, and reorganisation remain prohibited; collateral is only the consequence of a sanctioned fix.


### Self-Review

Runs **after the fixer**, in every iteration where the fixer ran. Always on — there is no flag.

**Scope** is the fixer's own edits: only the regions the fix report names (issue `location` values and `collateral` entries). **Remit** is both halves of how a fix goes wrong:

- **Fidelity** — a `fixed` disposition whose edit was never applied; two fixes from this pass that contradict each other; a fix that invalidated a location it did not touch; a recorded `collateral` repair that is itself wrong.
- **Accuracy of the new text** — the claims the fixer just wrote, checked against the rest of the document and, when `--fact-check true`, against the codebase. The fixer's second failure mode is internal inconsistency: a new paragraph contradicting a section it never read. That is neither pure fidelity nor pure fact-check, and the two already overlap ("a fix invalidated a location it did not touch"), so they are one pass rather than two.

**It fixes what it finds, exactly once.** Depth 1 — it edits the documents to correct the defects it reports, and the text it writes is not re-reviewed in the same round. Unbounded self-review is the same loop with more steps.

Before dispatch, the orchestrator backs up `tmp/_reviews_errors/review-doc.json` to `tmp/_reviews_errors/review-doc.json.bak` (or the run-id-prefixed variants). If the pass fails, the orchestrator restores the backup and prints a warning.

**Abort detection contract:** **An agent that cannot do its job aborts by leaving the artifact untouched and returning a first line beginning with the literal prefix "ABORT: ".** Defined once, in `references/shared-rules/agent-abort-contract.md`, and shared with `review-code`. The self-review pass signals a controlled abort (e.g. a missing or unparseable fix report) by leaving the JSON unchanged AND returning a text response whose first line begins with the literal prefix `ABORT: ` followed by a one-line reason. On detection, the orchestrator restores the backup, prints `Warning: self-review aborted — <reason>. Fix results unverified.`, and continues. Any other failure mode (agent crash, exception, no response) is treated identically.

Read `prompts/verifier.md` and dispatch: `Agent(subagent_type: "ai-dev-tools:<--fix-effort value>-effort", prompt: <self-review-prompt>)`, adding `model: "<--model value>"` when `--model` was passed. The skill substitutes `{{DOC_PATHS}}` → the newline-separated document path list, `{{OUTPUT_PATH}}` → the resolved `tmp/_reviews_errors/[<run_id>-]review-doc.json`, and `{{FIX_REPORT_PATH}}` → the resolved `tmp/_reviews_errors/[<run_id>-]review-doc-fix-report.json`.

The dispatch prompt must include:
- The effort level (`--fix-effort` value) as a depth directive (the agent type sets the reasoning effort)
- The document paths list
- The fix report path for this run
- The resolved fact-check setting, written literally as `--fact-check true` or `--fact-check false` (`--fact-check true` when the flag was not passed), so the pass knows whether the codebase is in scope for the accuracy half

It appends every defect to the `issues` array with `origin: "self-review"` and either `category: "verify"` (a fidelity defect) or `category: "fact-check"` (a defect in the accuracy of the new text), minting ids from `max + 1` as the merge script does for the fact-check findings.

**Count invariant: Counts measure the artefact under review, never the review loop's own edits.** The self-review pass does NOT recompute `critical_count` or `high_count`. Those fields carry the pre-fix counts, which is what `/orchestrate`'s stage-i unresolved-criticals gate reads (`../orchestrate/references/auto/stages/stage-i-spec-review.md` — "Phase 2 final iter pre-fix criticals > 0 → Q2 failure"). Its findings carry `origin: "self-review"` and are excluded from this round's counts: the round that wrote those lines both authored and reviewed them, so counting them here would report the loop's own churn as evidence against the authored document — and via the unresolved-criticals gate, that churn could fail the whole auto-pipeline. Self-review issues are folded into the counts by the NEXT iteration's reviewer, which re-reads the whole document, emits anything still wrong in those lines as `origin: "document"`, and recomputes both fields from the full issues array.

The exclusion is **round-local**, and rounds carry nothing forward — so a later round re-reads the whole document and reports defects in those lines as ordinary `"document"` findings, with no boundary flip to arrange it. Defined once, in `references/shared-rules/counts-exclude-self-review.md`, and shared with `review-code`.

**Not counted is not not-shown.** A fixer edit can genuinely damage a document. Self-review findings print on their own line in the terminal output and appear in the summary — outside the round's gate counts, never invisible. Without that, the loop would have a sanctioned channel for silent degradation.

## Hash Verification

Two agents edit the documents in each iteration — `fix()` and then `self_review()` — so the hashes bracket both: capture **before `fix()`** and again **after `self_review()` returns**, not around the fixer alone. A change made only by the self-review pass must not read as "no documents were modified".

Before fix phase: compute `sha256sum '<path>' | cut -d' ' -f1` via Bash for each document path.
After fix phase: same commands, compare values per file.

If all files unchanged: print `Warning: no documents were modified. Proceeding to next step.`

## Output Artifacts

| File | Purpose | Consumer |
|---|---|---|
| `tmp/_reviews_errors/[<run_id>-]review-doc.json` | Structured JSON from last iteration | `/orchestrate`, this skill's own Respond to Remaining Issues phase, machines |
| `tmp/_reviews_errors/[<run_id>-]review-doc-summary.md` | Curated human summary (max 10 items + aggregates) | Humans |
| `tmp/_reviews_errors/[<run_id>-]review-doc-fix-report.json` | Coder dispositions per issue | Orchestrator (iteration log) |
| `tmp/_reviews_errors/[<run_id>-]review-doc-iteration-N.md` | Per-iteration log | Debugging, audit |
| `tmp/_reviews_errors/[<run_id>-]review-doc-iteration-N.json` | That round's findings, snapshotted before the next round overwrites them | Post-hoc audit; the Final Report's aggregates are accumulated in flight |
| `tmp/_reviews_errors/[<run_id>-]review-doc-fix-report-iteration-N.json` | That round's dispositions, same reason | Post-hoc audit; the Final Report's aggregates are accumulated in flight |
| `tmp/_reviews_errors/[<run_id>-]review-doc-fact-check.json` | The fact-checker's own findings, claims and accuracy for the round, before the merge | `scripts/merge-fact-check.cjs` |
| `tmp/_reviews_errors/[<run_id>-]review-doc-fact-check-iteration-N.json` | That round's fact-check artifact, kept only when its fact-check failed | Post-hoc audit of the failure |
| `tmp/_reviews_errors/[<run_id>-]review-doc-brainstorm.md` | Items needing a human decision; its absolute path is the run's last line | Humans |

**Run-id prefixing (applies throughout):** every `tmp/_reviews_errors/review-doc*` path referenced anywhere in this document (Review Loop, Agent Dispatch, Hash Verification, Terminal, Final Report, Respond, Cross-Iteration, Iteration Log, Brainstorm, Schema) is prefixed to `tmp/_reviews_errors/<run_id>-review-doc*` when `--run-id` is active — matching the run-id-aware paths the reviewer, fact-checker and self-review prompts write to. The `[<run_id>-]` prefix is elided inline for brevity and shown explicitly only in the Output Artifacts table above.

## Review Summary Format

The orchestrator generates `tmp/_reviews_errors/review-doc-summary.md` directly during the Final Report step. Format:

```markdown
# Review Summary

**Date:** YYYY-MM-DD HH:MM
**Reviewed:** <file1.md, file2.md, ...> (N files)
**Against:** <ref-path or "standalone">
**Status:** Approved | Approved with suggestions | Issues Found
**Iterations:** N/M

## Aggregate
X Critical fixed | Y High fixed | Z Medium fixed | W Low fixed
Remaining: A Critical | B High | C Medium | D Low
Last round: X Critical fixed | Y High fixed | Z Medium fixed | W Low fixed
Deferred: D | Pushed back: P

## Self-Review
S findings against this run's own fixes (F fixed, R remaining) — excluded from the counts above.
  [ISSUE-NNN] verify | high | <location> — <problem> (fixed)
  [ISSUE-NNN] fact-check | critical | <location> — <problem> (remaining)
Final pass wrote L lines that no review pass read.

## Fact-Check Accuracy
X/Y verifiable claims accurate (Z%)

## Remaining Issues (top 10 by severity)

### ISSUE-NNN — [Title]
**Severity:** high | **Category:** completeness | **Location:** Section 3.2
**Problem:** ...
**Status:** deferred -- reason

[... up to 10 items, each headed by its stable ISSUE-NNN id]
```

Single file: show just the path (no count suffix).

## Terminal Output

After saving the summary, print:

```
Review Doc Complete
  Reviewed: <doc-path>
  Against: <ref-path or "standalone">
  Iterations: N/M
  Status: Approved with suggestions
  Aggregate: 8 Critical fixed | 5 High fixed | 3 Medium fixed | 1 Low fixed
  Remaining: 0 Critical | 2 High | 1 Medium | 0 Low
  Last round: 2 Critical fixed | 1 High fixed | 0 Medium fixed | 0 Low fixed
  Self-review: 3 found, 3 fixed — not counted above (this run's own churn)
  Unreviewed tail: 18 lines written by the final self-review pass
  Fact-check: X/Y claims accurate (Z%)
  Summary: tmp/_reviews_errors/[<run_id>-]review-doc-summary.md
  Full review: tmp/_reviews_errors/[<run_id>-]review-doc.json

Recommended next: focused review — collateral recorded in § 3 rule 3, § 7
/review-doc docs/spec.md --fact-check true --max-iterations 2

Found this round: 0 Critical | 4 High | 2 Medium | 1 Low
Brainstorm (needs your decisions): /abs/path/tmp/_reviews_errors/review-doc-brainstorm.md
```

`Found this round:` is the last of the count lines. It reports what this invocation's final review surfaced, not an aggregate across rounds, and it comes after the others because it is the number that drives the next review round. Exactly one line follows it: the `Brainstorm (needs your decisions):` path (see Brainstorm Document). It differs from `Last round:`, which counts issues *fixed*; the gap between the two is what the fixer could not resolve.

`Self-review:` reports what the self-review pass found against this run's own fixes. Those findings are excluded from every other count on the screen — `Aggregate`, `Remaining`, `Last round`, `Found this round` — because the round that wrote those lines both authored and reviewed them. **They are excluded from the counts, never from the output.** A fixer edit can genuinely damage a document, and a count-only view would make that damage invisible. Print the line whenever the self-review pass ran, including when it found nothing (`0 found`).

`Unreviewed tail:` names the one gap the depth-1 rule leaves: the lines the final iteration's self-review pass wrote itself, which no review pass read. Omit the line entirely when the count is 0. Earlier iterations need no such line — the next round re-reads the whole document.

When `--fact-check false`, the self-review pass still runs; only the accuracy-against-the-codebase half of its remit is out of scope.

The `Recommended next:` block and its command line are described in Next-Round Recommendation below. Under rule 3 the command line is omitted and only the `Recommended next:` line prints.

When `--fact-check false`, replace the `Fact-check:` line — in both this terminal output and the summary's `## Fact-Check Accuracy` section — with `Fact-check: not run`.

When the fact-check failed — the fact-checker aborted, crashed or returned nothing, or the merge exited with anything but 0 — print `Fact-check: aborted — <reason>` in both places. Never print `100%` for a pass that did not run: that number is the reviewer's default, which a failed fact-check leaves in place, and printing it as a result reports the absence of checking as the absence of error.

The `Reviewed:` line supports three formats:
- Single file: `Reviewed: <doc-path>` (unchanged)
- Directory: `Reviewed: <directory/> (N files)`
- Explicit multi-file: `Reviewed: <a.md, b.md, c.md> (N files)`

## Final Report

When the loop completes (final gate passes or max iterations exhausted):

0. **Validate the finished artifact**, once, before anything reads it:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-review-json.cjs --schema doc <output-path>
   ```

   This is the only point at which the self-review pass's appends are checked (the fact-check merge validated its own result before writing it); this check is still
   the last word on the finished artifact. No earlier iteration is covered either — the next round overwrites the artifact rather
   than recounting it — so without this the last thing written to the artifact is the one thing
   nothing verifies, and it is what the summary reports and what a human reads. One invocation per run.

   Exit 0 → proceed. Exit 1 → status **Error** per `references/shared-rules/run-failure-disclosure.md`,
   naming the phase whose write broke the invariant. Exit 2 → status **Error** as well: the validator
   returns `2` for an artifact it could not read or a command it could not parse, not for a check it
   chose to skip, and a finished artifact nothing can open is not a run that completed. `node` being
   absent is a different condition — the command never runs and the shell returns `127`. Only in that
   case proceed, and record `schema validation not run: node unavailable` in the summary, beside the
   status.

1. The orchestrator generates `tmp/_reviews_errors/review-doc-summary.md` directly -- no agent dispatch needed. Read `tmp/_reviews_errors/review-doc.json`, extract the top 10 issues by severity (then descending confidence) from the issues array. The array is not capped at 20: the reviewer caps its own findings at 20 but always includes every critical and high finding, so its own array exceeds that cap whenever those alone do (`prompts/reviewer.md` step 4); and the fact-check and self-review entries appended after it are outside the cap as well.
2. Compute aggregate counts from accumulated fix-report data across all iterations (see Cross-Iteration Tracking).
3. Apply status logic (see Status Logic below).
4. Derive the next-round recommendation (see Next-Round Recommendation below).
5. Print terminal output (see Terminal Output above), ending with the `Found this round:` line — the brainstorm path in step 7 follows it as the run's last line.
6. Unless the status is **Error**, run the Respond to Remaining Issues phase (below).
7. Write the brainstorm document and print its absolute path as the run's last line (see Brainstorm Document below). This runs whatever the status is — a run with nothing to hand back still prints the line.

## Respond to Remaining Issues

**Trigger:** the run completed (status is not **Error**) and anything is left to triage.

**Not gated on status, and not on severity.** Triage used to require "Approved with suggestions", which meant zero criticals — so the runs that most needed automated help got the least of it. A critical the loop could not clear is still a finding with a disposition: `apply` if it has one defensible answer, `push back` with reasoning if the agent believes it is wrong, `defer` if it needs something the repository does not say. Skipping the phase hands every one of them to a human raw, including the ones an agent should simply have fixed.

This is the same rule the fix phase follows. Fixing and iterating are separate decisions; so are triaging and reporting. **Status describes the outcome; it does not gate the work.** The one exception is **Error**: a run that did not complete has no trustworthy artifact to triage from.

After printing the terminal output, auto-triage each remaining issue from `tmp/_reviews_errors/review-doc.json` (sorted by severity descending, then confidence descending). The agent decides autonomously — no user interaction.

**Read the final round's fix report first.** `tmp/_reviews_errors/review-doc-fix-report.json` is the fixer's output; `review-doc.json` is the reviewer's, written before the fix phase and never updated by it. Skip every issue whose `id` that report dispositions as `fixed` — the fixer already resolved it, and re-triaging it would apply a second edit to a location that no longer says what the finding described. What reaches this phase is what the fixer `deferred`, what it `pushed-back`, and any issue with no disposition at all. A self-review finding the pass reported as fixed is the one exception: it carries no disposition because the fixer ran before it, and the pass that raised it already repaired it. If no fix report exists for this run, every issue is triaged.

**Auto-triage rules (per issue):**
- **Apply:** The suggested fix is actionable and the agent can make the edit. Apply directly to the document — surgical edits only.
- **Defer:** The fix requires information the agent doesn't have, depends on future work, or is explicitly a future concern.
- **Push back:** The finding is incorrect, irrelevant, or based on a misunderstanding of the document/spec. Record the agent's reasoning to `tmp/[<run_id>-]response_analysis.md` so the next review cycle can see why the finding was rejected.

A `cross-reference` finding reporting the same document diverging across two locations is **always deferred**, never applied — the same rule the fixer follows (`prompts/coder.md`). Reason: "requires a human decision on which copy is authoritative." This phase commits what it applies, so reconciling the copies here would land the fixer's forbidden edit through a different door.

The agent never asks the user. Every remaining issue resolves to apply, defer, or push back — including critical-severity items the agent cannot confidently fix (push back with explicit reasoning).

After auto-triage, print a summary and commit applied fixes:

```
── Remaining Issues ────────────────────────────
N issues triaged (C critical, H high, M medium, L low).

  [Pushed back] ISSUE-001 critical: <title> — <one-line reason>
  [Applied]     ISSUE-002 high: <title>
  [Applied]     ISSUE-003 medium: <title>
  [Pushed back] ISSUE-004 medium: <title> — <one-line reason>
  [Deferred]    ISSUE-005 medium: <title> — <one-line reason>

Applied: N | Deferred: N | Pushed back: N
```

If any fixes were applied, commit with: `fix(review-doc): apply N review suggestions`.

After all issues are processed, update `tmp/_reviews_errors/review-doc-summary.md` with final dispositions and reprint the terminal output with updated counts.

**Response analysis format:** Write to `tmp/[<run_id>-]response_analysis.md` (overwrite — no need to read first). Use the issue's stable `id` from `review-doc.json` as the section header so future review iterations and human readers can cross-reference findings unambiguously:

The `--run-id` prefix applies here even though the file sits outside `tmp/_reviews_errors/`, and so outside the blanket rule above. The Respond phase runs at the end of every completed run, and `orchestrate` stage i dispatches this skill twice — `<run_id>-phase1` then `<run_id>-phase2` — so an unprefixed name would have phase 2 overwrite phase 1's push-back reasoning before anyone read it. `review-code` prefixes it for the same reason at stage iii; unprefixed, the two skills also share one path and the later stage would clobber the earlier one's.

```markdown
## Review-Doc Response — <date>

### ISSUE-NNN — [Issue title derived from problem]
**Status:** Applied | Deferred | Pushed back

**[If Applied]**
Change: what was changed and where — file:section

**[If Deferred]**
Reason: <agent's reasoning>

**[If Pushed back]**
Reason: <agent's reasoning for why the finding is incorrect or irrelevant>

---
```

**Skipped only on Error.** Every other status runs this phase, including **Issues Found**. That was not always so: the phase used to require "Approved with suggestions", so rule 2 suppressed it on either of its triggers — `critical_count > 0`, or (per skill) a sub-75 fact-check / verification regressions present. Both suppressions were wrong for the same reason. A low fact-check score says some claims were wrong, which is a reason to triage more carefully rather than to stop; and outstanding criticals are precisely the findings a human most needs sorted into "already applied" and "genuinely needs you".

**Approved** reaches this phase and finds nothing to do, which is the correct no-op. **Error** is the only skip: a run that did not complete has no trustworthy artifact to triage from, and its handoff document is the failure report.

## Brainstorm Document

**Everything the run could not decide goes in one brainstorm document, and its absolute path is the last line printed.** What goes in it, how entries are grouped, and what each one states are defined once, in `references/shared-rules/brainstorm-handoff.md`, and shared with `review-code`. The fix phase runs whenever there is something to fix — there is no report-only mode and no scope small enough to exempt one; the fixer runs whenever the round found any issue at any severity, and the only fix phase the loop skips is one with nothing to act on. Only the decision to run *another* round is gated on criticals. Fix what has one defensible answer; hand back only what has more than one, or what depends on something the repository does not say. This skill writes the document to `tmp/_reviews_errors/[<run_id>-]review-doc-brainstorm.md` after the triage phase, and ends the run with:

```
Brainstorm (needs your decisions): /abs/path/to/tmp/_reviews_errors/review-doc-brainstorm.md
```

When there is nothing to hand back, print the line anyway and write no file:

```
Brainstorm (needs your decisions): none — every finding was applied or resolved
```

A missing line is indistinguishable from a skill that forgot.

## Error Handling

| Failure mode | Behavior |
|---|---|
| Reviewer returns invalid JSON or schema validation fails | Retry the reviewer once. Second failure: abort the iteration, status **Error**. |
| Fact-check fails (`ABORT: `, crash, no response, or a merge exit other than 0, `127` when `node` is absent included) | Nothing to restore: the review JSON is still the reviewer's. Print `Warning: fact-check aborted — <reason>. Falling back to reviewer output.`, continue. Not an Error; the pass counts as not completed. |
| Self-review pass aborts (`ABORT: `, crash, or no response) | Restore the `.bak`, print `Warning: self-review aborted — <reason>. Fix results unverified.`, continue. Not an Error. |
| Fix phase fails | Abort the run, status **Error**. Documents are left as the fixer left them; say so in the Artifact line. |
| The Agent tool refuses the agent type or the model at dispatch | Abort the run, status **Error**, and name the phase. This row wins over the two abort rows: a call the Agent tool refused started no agent, so nothing aborted under `references/shared-rules/agent-abort-contract.md`, and the run stops with **Error** at whichever phase it happens, the fact-checker and self-review dispatches included. Never retry the call without `subagent_type`: see `references/shared-rules/agent-dispatch-pin.md`. |
| Max iterations exhausted | Not an Error — status follows the normal rules and the remaining issues are reported. |

Both abort rows follow `references/shared-rules/agent-abort-contract.md`.

## Backlog Writing

review-doc does **NOT** write to `tmp/past-issues-backlog.md`. Document reviews produce section-level locations (e.g., "Section 3.2"), not code-level locations (e.g., "src/auth.ts:42"). The backlog format is designed for code findings. Deferred and pushed-back document review items are recorded in iteration logs and the review summary only.

## Cross-Iteration Tracking

The orchestrator maintains the following state across the loop:

- `total_fixed = {critical: 0, high: 0, medium: 0, low: 0}` -- per-severity breakdown (populates "X Critical fixed | Y High fixed | Z Medium fixed | W Low fixed")
- `last_round_fixed = {critical: 0, high: 0, medium: 0, low: 0}` -- per-severity breakdown for the most recent iteration only (populates "Last round:" line)
- `remaining = {critical: 0, high: 0, medium: 0, low: 0}` -- populates the `Remaining:` line. **Defined as `found_this_round` minus the final round's `fixed` dispositions, plus every self-review finding that pass reported and did NOT fix.** Computed once, after the final iteration's fix phase and its self-review pass.

  Two readings were possible and the difference is not cosmetic. Taking the final review JSON's severity breakdown reports as *remaining* exactly what the last fixer just repaired, which is the opposite of what the word means. Taking `found_this_round` minus `fixed` alone trusts the fixer's own claim that a fix landed — and the self-review pass exists because that claim is sometimes false. Adding back the self-review pass's *verified* failures is what makes the number mean "still wrong in the document", which is what a reader assumes it means. **Status Logic does not read this counter.** Rule 3 tests the issues array directly and filters on `origin: "document"`; rule 4 is the fallthrough, `all other cases` — so a self-review finding the pass could not fix raises `Remaining:` without moving the status, and a final round with no document-origin issue left reports Approved while the `Self-Review` section names the defect that is still there.

  A self-review finding the pass reported **and fixed** is not remaining. One it reported and could not fix is. This is the single place a self-review finding reaches a headline count, and it does so because by then it is no longer this round's churn — it is an unrepaired defect in the artefact. It changes no gate count: `critical_count` and `high_count` are untouched, per `references/shared-rules/counts-exclude-self-review.md`.
- `total_deferred = 0` -- flat count (populates "Deferred: D")
- `total_pushed_back = 0` -- flat count (populates "Pushed back: P")
- `found_this_round = {critical: 0, high: 0, medium: 0, low: 0}` -- severity breakdown of the `issues` array in the CURRENT iteration, measured after review and fact-check but before the fix phase. Overwritten each iteration; the final iteration's value populates the "Found this round:" line and rule 1 of the recommendation.
- `self_review_found = {found: 0, fixed: 0}` -- running total across every self-review pass in this invocation, with each finding's id, category, severity, location and disposition retained for rendering. These populate the `Self-Review` section and the `Self-review:` terminal line. They are **never** added to `total_fixed`, `found_this_round`, `critical_count` or `high_count` for the round that produced them: `references/shared-rules/counts-exclude-self-review.md`.
- `self_review_tail_lines = 0` -- lines written by the FINAL iteration's self-review pass. Those lines are the one part of the document no review pass read, because depth is 1 and no further round follows. Earlier iterations' tails need no tracking: the next round re-reads the whole document. Populates the `Unreviewed tail:` line, which is omitted when the value is 0.
- `collateral_count = 0` -- running total of `collateral` entries across every fix phase in this invocation, with their `location` values retained for rendering. **Not reset between iterations.** Rule 2 names the regions a focused review has to cover, and a region an *earlier* fix phase disturbed needs that cover as much as one the last fix phase disturbed. Scoping the counter to the final iteration would drop exactly the multi-iteration case: an earlier round fixes criticals and records collateral, the final round's review comes back clean, and the recommendation reports no collateral at all.

After each fix phase, **before dispatching the next iteration's reviewer** (which will overwrite `review-doc.json`), parse `tmp/_reviews_errors/review-doc-fix-report.json` and resolve each disposition's severity by `id` lookup against the CURRENT `tmp/_reviews_errors/review-doc.json`. For each disposition with `action: "fixed"`, increment `total_fixed[severity]` immediately; for `deferred` and `pushed-back`, increment the flat counter. Nothing is cached across rounds: ids are per-round, so round 2's `ISSUE-001` is a different finding from round 1's, and a map that outlived a round would resolve it to the earlier round's severity. Every lookup is answered by the artifact of the round that wrote the disposition, and then discarded. Reset `last_round_fixed` to `{critical: 0, high: 0, medium: 0, low: 0}` before each iteration and increment it alongside `total_fixed`.

**Snapshot the round before the next one overwrites it.** At the end of every iteration — after the self-review pass returns if it ran — copy the round's artifacts to iteration-scoped names:

```bash
cp tmp/_reviews_errors/[<run_id>-]review-doc.json            tmp/_reviews_errors/[<run_id>-]review-doc-iteration-N.json
cp tmp/_reviews_errors/[<run_id>-]review-doc-fix-report.json tmp/_reviews_errors/[<run_id>-]review-doc-fix-report-iteration-N.json
cp tmp/_reviews_errors/[<run_id>-]review-doc-fact-check.json tmp/_reviews_errors/[<run_id>-]review-doc-fact-check-iteration-N.json
```

**The first `cp` runs unconditionally; the second runs only when this round's fix phase ran; the third only when this round's fact-check failed and left a file behind.** A merged fact-check needs no copy: the review JSON snapshot already carries its findings, claims and accuracy. The loop guards both `fix()` and `self_review()` behind `total_issues > 0`, and the round that finds nothing is the round a converged run ends on — so a trigger keyed to the self-review pass would leave the final round's findings with no durable copy at all. Such a round has no fix report of its own either: whatever sits at `review-doc-fix-report.json` belongs to an earlier round, and copying it would file that round's dispositions as this one's. When the self-review pass aborted under `references/shared-rules/agent-abort-contract.md`, snapshot the artifact the orchestrator restored from `.bak` — that is what the round ended with.

Rounds start fresh, so round N+1's reviewer **overwrites** both files rather than appending to them. Every cross-round number the Final Report prints — `Aggregate`, `Deferred`, `Pushed back`, `collateral_count` — is accumulated in flight, as each round's fix report is parsed before the next round overwrites it, and without these snapshots the only copy of round N's data is orchestrator state in a context window. That is not a durable source, and a run that reports an aggregate it cannot reconstruct from disk is reporting a number nobody can check.

This is the cost of removing carry-forward, paid deliberately: the accumulating array used to be the record. Two `cp` calls per iteration replace it, and they make each round independently auditable — which the accumulating array never was.

**IDs are per-round.** Every round's reviewer numbers from `ISSUE-001`; the fact-check merge and the self-review pass continue from `max + 1` within that same round. Ids identify a finding while a round is in flight — the fix report and `tmp/[<run_id>-]response_analysis.md` both reference them — and nothing needs one to outlive its round.

They used to be append-only across iterations, matched on a `(location, category)` tuple and exempt from the reviewer's cap, so that round N+1 could re-use round N's numbering. That machinery is gone with carry-forward, and so is the counting contradiction it caused: carried entries sat in the new round's array, so the count could not tell a finding made now from one made earlier and already fixed.

## Status Logic

First match wins:

1. **Error**: the loop aborted — reviewer output failed schema validation twice, the fix phase failed, the Agent tool refused a dispatch, or a required git operation failed. A dispatched pass that aborts under `references/shared-rules/agent-abort-contract.md` is NOT an Error: that contract warns and continues by design, restoring the backup where it took one; a failed fact-check leaves the reviewer's artifact in place.
2. **Issues Found**: `critical_count > 0` OR (the fact-check **completed** AND `fact_check_accuracy < 75`)
3. **Approved with suggestions**: (the fact-check **completed** AND `fact_check_accuracy < 90`) OR any high, medium, or low issue with `origin: "document"` remains
4. **Approved**: all other cases

**A failed fact-check is not a perfect one.** `fact_check_accuracy` is `100` by default — the reviewer writes it, and a failed fact-check leaves exactly that artifact. Read naively, a fact-check that never ran clears both thresholds and contributes an implicit "100% accurate" to the status. Rules 2 and 3 therefore read the number only when the pass completed, which is when its merge exited 0. A failed fact-check leaves the status to be decided by the remaining issues alone, which is the same position a run with `--fact-check false` is in.

Error is rule 1 so that nothing which aborted can reach a rule that would call it clean. Before this rule existed, review-doc's Status Logic ended at "all other cases" and a run whose reviewer failed validation twice reported **Approved**.

**A run that could not complete reports Error, names the phase that failed and why, and never prints a status or a count that implies a review happened.** Defined once, in `references/shared-rules/run-failure-disclosure.md`, and shared with `review-code`.

On an Error the count block is replaced, not relabelled — `Aggregate`, `Remaining`, `Last round` and `Found this round` come from an artifact the run did not finish writing:

```
Review Doc FAILED
  Phase: <reviewer | fact-check | fixer | self-review>
  Reason: <one line — the validator's stderr, the ABORT reason, or the exception>
  Artifact: <path> — <not written | restored from backup | partial, left as-is>
  Reviewed: <paths>
  Iterations completed: N of M
  Counts: not reported — this run did not complete a review
```

Interactive runs then ask `Retry the failed phase / continue with what completed / abort the run? [retry|continue|abort]` and wait. **Programmatic or auto dispatch does not ask** — there is nobody to answer and a prompt in auto mode hangs the pipeline. Exit non-zero, write the reason to the run's error log, and let the caller's failure path handle it. The brainstorm handoff line still prints last; on an Error that document is the failure report.



## Next-Round Recommendation

After the status is computed, the orchestrator derives a recommendation for what to do next. It is computed directly from orchestrator state — no agent dispatch, no judgment call, identical output for identical inputs.

Inputs:

| Input | Source |
|---|---|
| `found_this_round` | Severity breakdown of the `issues` array in the FINAL iteration, measured after review and fact-check but before the fix phase — the same point as `total_criticals`. Medium and low are counted directly from the `issues` array by `severity`; do not derive either by subtraction from `len(issues)`, which folds one into the other. |
| `fact_check_accuracy` | The final `review-doc.json` |
| `collateral_count` | Running total of `collateral` entries across **every** fix phase in this invocation, not just the final iteration's |

Rules, first match wins:

| # | Condition | Recommendation |
|---|---|---|
| 1 | `found_this_round.critical > 0` OR `fact_check_accuracy < 75` | another review round |
| 2 | `collateral_count > 0` | focused review |
| 3 | otherwise | continue to implementation |

Rule 1 dominates rule 2 — a full round covers the collateral regions as well, so there is no point recommending the narrower action when the broader one is already warranted.

**When each rule fires.** Rule 1 matches whenever the final iteration's review found criticals. Rule 2 matches otherwise, whenever any fix phase in the invocation recorded collateral — including a single-iteration run whose fixer ran on a round of highs and mediums and no criticals, which is the ordinary shape now that fixing is not severity-gated. It also covers the multi-iteration shape: an earlier iteration fixed criticals and recorded collateral, and the final iteration's review came back clean. That second shape is why `collateral_count` accumulates across the whole invocation rather than being scoped to the last fix phase — scoped to the last one, an earlier round's collateral would go unreported.

**Rule 1** — reprint the invocation exactly as it was given, so it can be pasted directly:

```
Recommended next: another review round — 3 criticals found this round
/review-doc docs/spec.md --fact-check true --max-iterations 2
```

**Rule 2** — name every distinct `location` appearing in a `collateral` entry, then offer the same invocation again:

```
Recommended next: focused review — collateral recorded in § 3 rule 3, § 7, § 12.2
/review-doc docs/spec.md --fact-check true --max-iterations 2
```

**Rule 3** — no command; review-doc does not know the implementation plan path:

```
Recommended next: continue to implementation — 0 criticals, no collateral recorded
```

The recommendation names a next action, not a scoped review mode. There is no flag that restricts a review to recently-changed regions: document fixes are left uncommitted by the fix phase itself (the fixer never commits; the triage phase does, and its commit spans every edit the run has made, not just the last pass — and orchestrate commits once per phase besides), so no git ref can isolate the last fix pass. Rule 2 therefore names the sections and lets the reader decide.

## Iteration Log Format

Write to `tmp/_reviews_errors/review-doc-iteration-N.md` after each iteration:

```markdown
# Iteration N

**Model:** <--model value> | not passed (the Agent calls named no model; Claude Code chose)
**Effort:** <--effort value> for the reviewer and the fact-checker, <--fix-effort value> for the fixer and the self-reviewer (each dispatched as ai-dev-tools:<level>-effort)
**Agents:** 1 (merged reviewer), plus fact-checker (unless --fact-check false), plus self-reviewer (whenever the fixer ran)
**Issues found:** X critical, Y high, Z medium, W low
**Outcome:** "Fixed N issues (D deferred, P pushed back), continuing" | "Fixed N issues (D deferred, P pushed back), 0 criticals, loop complete" | "0 criticals, early exit" | "0 criticals, loop complete" | "Fixed N issues (D deferred, P pushed back), max iterations reached" | "Fix phase failed: <error>" -- whenever the fixer ran, the outcome carries its counts as well as the reason the loop stopped; the bare "0 criticals" forms are for a round that found nothing to fix at any severity.
**Issues fixed:** [ISSUE-NNN] [category] [severity] at [location]
**Issues deferred:** [ISSUE-NNN] [category] [severity] at [location] -- reason
**Issues pushed back:** [ISSUE-NNN] [category] [severity] at [location] -- reason
**Issues found (no disposition):** [ISSUE-NNN] [category] [severity] at [location], or "none"
```

## JSON Schema

The review-doc schema for `tmp/_reviews_errors/review-doc.json` validation reference:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["critical_count", "high_count", "issues", "fact_check_accuracy", "fact_check_claims"],
  "properties": {
    "critical_count": { "type": "integer", "minimum": 0 },
    "high_count": { "type": "integer", "minimum": 0 },
    "fact_check_accuracy": { "type": "integer", "minimum": 0, "maximum": 100 },
    "fact_check_claims": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["claim", "verdict"],
        "properties": {
          "claim": { "type": "string" },
          "verdict": { "type": "string", "enum": ["ACCURATE", "INACCURATE", "PARTIALLY ACCURATE", "STALE"] }
        }
      }
    },
    "issues": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "severity", "category", "location", "confidence", "problem", "suggested_fix"],
        "properties": {
          "id": { "type": "string", "pattern": "^ISSUE-\\d{3,}$" },
          "severity": { "type": "string", "enum": ["critical", "high", "medium", "low"] },
          "category": { "type": "string", "enum": [
            "completeness", "consistency", "scope", "structure",
            "fact-check", "verify", "vague-action", "vague-step",
            "dependency-gap", "ordering-issue", "agent-pitfall",
            "missing-criteria", "cross-reference"
          ]},
          "location": { "type": "string" },
          "confidence": { "type": "integer", "minimum": 40, "maximum": 100 },
          "problem": { "type": "string" },
          "suggested_fix": { "type": "string" },
          "origin": { "type": "string", "enum": ["document", "self-review"], "default": "document" }
        }
      }
    }
  }
}
```

Note: `fact_check_claims` is populated only by the fact-check merge. The reviewer always writes `fact_check_claims: []` and `fact_check_accuracy: 100`, and that is what a run with `--fact-check false`, or a round whose fact-check failed, keeps.

Note: `origin` is the only optional per-issue key and the only one permitted beyond the seven required — `additionalProperties: false` rejects everything else, including `phase`. It defaults to `"document"`; an issue without it counts as document-origin. The reviewer and the fact-checker emit `"document"`; the self-review pass emits `"self-review"` for what it raises against the fixer's own edits, and those are excluded from the round's `critical_count` and `high_count`. See `references/shared-rules/counts-exclude-self-review.md`.

There used to be a second key, `phase`, recording which pass found a finding. It existed only because rounds carried findings forward and reset `origin` at the boundary, which destroyed that record. Rounds now start fresh, so `origin` is set once and never changes, and there is nothing for `phase` to recover. `scripts/validate-review-json.cjs` rejects an artifact still carrying it — `tests/fixtures/counts/churn-phase-tagged.json` pins that.
