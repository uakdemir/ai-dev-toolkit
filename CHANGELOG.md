# Changelog

## 6.0.0 (2026-10-10)

The release in which `review-code`, `review-doc` and `implement` classify the risk of their own work
and route every agent from one table. A run resolves a tier (FULL, LIGHT or MECHANICAL), prints it
with its reason, and takes its process and each agent's model and effort from that tier unless a
flag sets them. The tier rules and the routing table live in `references/shared-rules/risk-tier.md`.

### Breaking Changes

- **review-code, review-doc, implement:** a run without flags classifies its tier and routes by it: Opus reviewers at high or max, and Sonnet coders. `orchestrate`'s stages pass no model flags, so they change too. Every Agent call now names a model, so `CLAUDE_CODE_SUBAGENT_MODEL` no longer decides a dispatched agent's model in these skills (1d86fff)
- **review-code, review-doc:** `--max-iterations` is optional: the tier sets the rounds and prints them. A MECHANICAL classification runs no review agents, and writes no review JSON; `orchestrate` reads such a review (`Not reviewed (MECHANICAL)`) as a pass with zero criticals in auto mode and at standard mode's Step 6. Standard mode's Step 2 leaves the spec's Status as it is, because nothing was reviewed (1d86fff)
- **implement:** `--model` names the coders' model, `--effort <level>` sets their effort, and the execution mode is `--mode single|per-task`. A call that passes an old `--model` value (`single`, `subagent`, `parallel`, `clear-context`) gets `Error: --model now names the coders' model; for the execution mode use --mode single|per-task.` (1d86fff)
- **implement:** clear-context, the parallel helper and in-session coding are gone, along with `tmp/implement-exit-status.md`. The picker has two options, and a FULL run is the only one that shows it (1d86fff)
- **prompts:** the five prompts that drove these skills are deleted: `ReviewCode.txt`, `ReviewDoc.txt`, `Implement.txt`, `PlanImplement.txt` and `PlanImplementCodeReview.txt`. `CreateArtifact.txt` and `MergePlanDecisionsIntoSpec.txt` stay (3a5e288)

> As in 5.0.0, no commit carried a `BREAKING CHANGE:` footer. The first item's commit marks the
> break with `!` in its subject, and these are listed because the same invocation now behaves
> differently.

### Features

- **review-code, review-doc, implement:** `--tier full|light|mechanical` skips classification, and is the only flag that lowers a stored tier (1d86fff)
- **review-code, review-doc, implement:** two tier lines name the tier, its reason and the agents' model and effort. A review run prints them before anything else; `implement` prints them when its tier step runs, after Steps A–C and ahead of the task graph (1d86fff)
- **shared-rules:** `risk-tier` is a new shared rule, and `agent-dispatch-pin` now governs `implement` too (1d86fff)
- **review-code, review-doc, implement:** the tier persists per conversation in `tmp/risk-tier-<session-id>.md` and only moves up; it is ignored when its session or branch differs, and not written when `CLAUDE_CODE_SESSION_ID` is unset (1d86fff)
- **review-code:** `Found this round:` in the terminal output, as `review-doc` prints it (1d86fff)
- **implement:** a task the coders report BLOCKED gets one fresh attempt on Opus, at the coders' effort (1d86fff)

### Fixes

- Applied a FULL `review-code` round on this release, one round on Opus at max: 11 of its 14 findings fixed, and three corrections by its self-review (c4e07e5, e99ef26). This entry also no longer says that `orchestrate` reads a MECHANICAL review as a pass throughout standard mode: Step 2 does not. The founder's decisions on the three findings the round could not settle, recorded as decision 12 of the spec: a document nobody has reviewed may still classify MECHANICAL, with `--tier light` as the remedy; agents that write run one at a time (e629dde); and the wiki page is updated
- **scripts:** check B of `check-shared-semantics.cjs` fails a governed Agent call whose `model:` is missing or a literal, as it already did for the agent type. Every call form carries `model: "<...>"`, and a call that lost it would run on `CLAUDE_CODE_SUBAGENT_MODEL`, where that is exported, with every gate green (c4e07e5)
- **review-code:** a rename or move classifies MECHANICAL only once its instrument has proved it at classification: `git grep -n` for the old name or path returns nothing, and the tier reason quotes the command and its result. Otherwise the change is LIGHT (c4e07e5)
- **implement:** `--auto` suppresses Step C's write-a-plan prompt. That prompt used to end `orchestrate --auto`'s stage ii with no commit, on a spec that fires one of its hard signals (c4e07e5)
- **implement:** the refactor-unit path ignores `--mode`, `--model`, `--effort` and `--tier`, with one warning that names the ones passed; it used to warn about `--model` alone, read as the execution mode. `--auto`'s pre-check hands off to Resolve the Tier, which its old wording skipped. "Execution model" reads "execution mode" in the skill's description and in `orchestrate`'s steps 4 and 5 (c4e07e5)
- **orchestrate:** standard mode's hint file gains `review`, which Step 2 and Step 6 set to `mechanical` after a review that ended `Not reviewed (MECHANICAL)`. Step 7 and fast-path rows 3 and 7 read it, where they read a summary an earlier run had left. A write that names another feature starts with `review: ""` (c4e07e5, e99ef26)
- **orchestrate:** in auto mode a review on the MECHANICAL tier is no crash when it ends `Issues Found`: stage i takes the unresolved-criticals path and appends the `✗ UNCONFIRMED` sentences to the spec. The profiling log records `model` as `none` for a run that dispatched no agent (c4e07e5)
- **review-doc:** the MECHANICAL path runs the Duplicate locations check before it confirms sentences (c4e07e5)
- **shared-rules:** `risk-tier` lists the files that restate its routing table, where it called the table the only place the pairing is written. The nested measurement `agent-dispatch-pin` prescribes passes `--tier light`, without which it classifies MECHANICAL and dispatches nothing (c4e07e5)
- **implement:** in `per-task` mode one agent runs at a time. Implementers, fix-round implementers and escalations write in one working tree and its index, and an implementer starts only after the task before it is closed: its task reviewer has returned, its fix rounds have ended and its verification has run, or it is marked BLOCKED. The cap of 3 agents is dropped (e629dde, cecf5e3)
- **review-code, review-doc:** the Pre-Flight Checks run before Setup. A run stopped at the branch guard, or on a dirty tree, used to have deleted the previous run's artifacts already (07f7e1f)
- **review-code, review-doc:** each skill tells the session to substitute the plugin-root variable its reviewer prompt carries. Nothing expanded it in a prompt the session reads, and the reviewer then skipped its validator (25279ad)
- **review-code:** a MECHANICAL run prints its `Verification:` line once (2b242b0)
- **shared-rules:** a run that carries the floor's tier writes the stored reason, setter and time back as it read them, so every later run prints the same `carried from` line (5997d51)
- Applied a LIGHT `review-code` round on the eight commits that applied those decisions, one round on Opus at high: three of its four findings fixed, and one correction by its self-review (01e6008, f598330). The founder's decisions on what the round left open, recorded as decision 13 of the spec: an implementer waits for the task before it to close, and the cap of 3 agents is dropped (cecf5e3); the guard the round added to `orchestrate` for a reused run-id comes out again (9a42161); and the agent prompts' self-check sentences wait for the next change to the prompts
- **review-doc:** the skill also tells the session to substitute the plugin-root variable in the fact-checker's prompt. Left literal, the fact-checker skipped the check of its own artifact, and one invalid issue then discarded its whole pass at the merge (01e6008)
- **implement:** the task graph no longer promises parallel work. Its branches are independent tasks in any order, and its total is the sum of the tasks, because implementers run one at a time (01e6008)
- **orchestrate:** stage iii says that `review-code`'s Setup deletes only on a run that passes its Pre-Flight Checks (01e6008)

### Tests

- **scripts:** `tests/detector-coverage.txt` gains one line, `skills/implement/SKILL.md` under `untyped-agent-dispatch`. That file now names a pinned agent type, and `--print-coverage` does not read `applies-to`. The listing skips every `references/` tree, so `implementation-step.md` does not appear (1d86fff)
- **scripts:** `shared-semantics-mutation-test.sh` has 66 cases, up from 64: T12, a governed call that drops its model, and T13, one that names a fixed model. T4 and T12 each write the failing call beside a compliant one, so a gate that judges the line as a whole fails them (c4e07e5, e99ef26). T6 pins its defect again: a gate that reads past a call's closing bracket had passed all 66 cases (fdf9af8)

## 5.0.1 (2026-10-09)

### Features

- **prompts:** ship the team's seven working prompts in `ai-dev-tools/prompts/`, so they are maintained here instead of sent around as copies. They follow 5.0.0's flags: a FULL-tier `review-code` or `review-doc` round runs `--effort max --fix-effort max --model opus`, with `review-code`'s fact-check agent dispatched as `ai-dev-tools:max-effort`, and a LIGHT-tier round runs `--effort high --fix-effort high --model opus`. Code is written by `ai-dev-tools:high-effort` agents with `model: sonnet`, and spec writing runs on Opus · high (4cbb4b7)

## 5.0.0 (2026-10-08)

The release that makes a review round cheaper and shorter by default. Measured on the founder's
review runs, an agent at `max` costs about twice one at `high` and takes about 2.5 times as long,
and review-doc's fact-checker waited for a reviewer whose output it never reads.

### Breaking Changes

- **review-code, review-doc:** `--effort` defaults to `high`, where it was `max`. A call that passes no `--effort` drops from max to high; `orchestrate`'s review stages pass none, so they drop too (a59cf22)
- **review-code, review-doc:** the fixer and the self-reviewer follow the new `--fix-effort`, default `high`, not `--effort`. A `--effort max` run now fixes at high unless it also passes `--fix-effort max` (a59cf22)
- **review-doc:** `--fact-check` defaults to `true`. A call that passes no `--fact-check` now runs the fact-checker every round, and its self-review checks the fixer's text against the codebase too. That includes `orchestrate` standard mode's spec and plan reviews, which pass none (`skills/orchestrate/references/standard/steps/step-1.md` to `step-4.md`) (a59cf22, 377781c)

> As in 4.0.0, no commit carried a `BREAKING CHANGE:` footer. These are listed because the
> same invocation now behaves differently.

**Note:** with no `--model`, review agents run on `CLAUDE_CODE_SUBAGENT_MODEL` when it is exported
(Sonnet on some machines), and on the session's model otherwise. Pass `--model opus` for review runs.

### Features

- **review-code, review-doc:** `--fix-effort high|xhigh|max` selects the agent the fixer and the self-reviewer are dispatched as (a59cf22)
- **review-doc:** the reviewer and the fact-checker run concurrently. The fact-checker writes its own artifact, `tmp/_reviews_errors/[<run_id>-]review-doc-fact-check.json`, and `scripts/merge-fact-check.cjs` merges it before the fixer; any merge exit but 0 is a failed fact-check, and nothing in the round starts until both agents have returned (a59cf22, e7870dd, 0c1085b)
- **scripts:** `merge-fact-check.cjs`, which appends, renumbers, recounts and validates before it replaces the review JSON (d893900), and its `--check` mode, which the fact-checker runs on its own artifact before it returns, so one malformed finding cannot discard the round's whole fact-check (377781c)

### Tests

- **scripts:** `merge-fact-check-test.sh`, 8 cases on fixtures in `tests/fixtures/fact-check-merge/`, added to the root CLAUDE.md gate block (d893900, 377781c)

## 4.0.0 (2026-10-05)

The release that makes `--effort` and `--model` do what the review skills say they do. Each
dispatched agent is now an agent definition the plugin ships, pinned at the flag's level, and the
model is passed on the Agent call.

### Breaking Changes

- **review-code, review-doc:** every agent runs at the `--effort` level, where it used to run at the effort of the session that dispatched it. A call that passes no `--effort` therefore moves to the default, `max`, whatever the session is at. `orchestrate`'s review stages pass none and so select the `max` agent too; the last item here says what they need in order to dispatch it. Pass `--effort` to choose (6cb0f55)
- **review-code, review-doc:** `--model` acts again. `3.0.0` accepted it with a warning and ignored it; a call that still passes it now gets that model on every agent (6cb0f55)
- **review-code, review-doc:** the skills need the plugin's agents. A session that started before this version does not know them, and a run there stops with `Error: agent type 'ai-dev-tools:<level>-effort' is not available in this session.` until `/reload-plugins` (6cb0f55)
- **review-code, review-doc, orchestrate:** the review skills need a session that can dispatch agents. Where Claude Code gave the session no Agent tool, as it does inside a sub-agent at the spawn-depth cap, they stop with `Error: this session has no Agent tool, so the review agents cannot be dispatched.` and never run the phases in place. `orchestrate --auto` runs both review stages inside a sub-agent, so it needs `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` to be at least 2: a machine that sets it to 1 stops at stage i. With the variable unset, Claude Code 2.1.289 reads as a cap of 3. Not measured under any cap: a review skill run inside a sub-agent (6c2f721)

> As in 3.0.0, no commit carried a `BREAKING CHANGE:` footer. These are listed because the
> same invocation now behaves differently.

### Deprecated

Still accepted with a warning and otherwise ignored: `--min-model` and `--max-model`. The warning now points at `--model` (6cb0f55)

### Features

- **agents:** ship `ai-dev-tools:high-effort`, `ai-dev-tools:xhigh-effort` and `ai-dev-tools:max-effort` — role-neutral definitions that pin a reasoning effort and no model, usable by name from any prompt (918aab9)
- **review:** dispatch every agent as the `--effort` agent, and pass `--model` as `model` on the call (6cb0f55)
- **review:** register the dispatch rule in the shared-rules registry as `agent-dispatch-pin` (6cb0f55)

### Fixes

- **review-code, review-doc:** stop claiming every agent inherits the caller's session model. With no `--model` the call names none and Claude Code resolves it: `CLAUDE_CODE_SUBAGENT_MODEL` when that variable is exported, the session's model otherwise (6cb0f55)
- **review-code, review-doc:** `{{EFFORT}}` and the effort level in a dispatch prompt are described as what they are, a depth directive; the agent type sets the reasoning effort (6cb0f55)
- **orchestrate:** the same claim about the session model, in stage i and the profiling log (c47caa4)
- **review-code, review-doc:** a dispatch the Agent tool refuses is an Error at every phase, the fact-checker and self-review dispatches included, and Status Logic rule 1 lists it. The row used to contradict the abort rows (61dc68a)
- Applied the review round on this change: one finding fixed, and stage i and this entry no longer say that `orchestrate`'s review stages run at `max`, which had not been measured (61dc68a). The founder's decisions on what the round could not settle are 6c2f721, 02202c2 and b351bf2
- **shared-rules:** applied a `review-doc` round, with fact-check, on `agent-dispatch-pin.md`: the rule now states the agent a run without `--effort` selects, every error with its text, what was measured and what was only read from Claude Code 2.1.289, and what the detector sees and misses (0f10263, 23b47c9). The founder's decision on the one finding the round could not settle, whether the skills look for `CLAUDE_CODE_EFFORT_LEVEL` and `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` before they dispatch, is to disclose both and check neither (fc6b976)
- **orchestrate:** stage iii states the spawn-depth cap it needs, as stage i does (23b47c9)

### Tests

- **review:** give `agent-dispatch-pin` a detector, `untyped-agent-dispatch`. An `Agent(` call in a review skill that names no effort-pinned agent now fails `check-shared-semantics.cjs`, and so does a skill outside the rule that dispatches one. Before it, a dispatch rewritten to `Agent(prompt: ...)` passed every gate. `review-code` spells out its reviewer and fixer calls so the detector can see them (02202c2)
- **scripts:** the detector reads a call up to its closing bracket. Read to the end of the line, a pinned type quoted in prose after an untyped call vouched for it; the fact-check of the rule file found that by running the gate (75502cc)
- **scripts:** a second `review-code` round, on the commits that followed the first, found three ways past the detector and closed each with a mutation case that failed first (the suite is at 64). Check D reads a file as a whole, so a pinned call written over several lines, unquoted, or with a bracket ahead of the type now counts. Check B requires the `<...>` placeholder where the level goes, so a review-skill call that names one fixed level fails where it used to run every `--effort` value at that level. The plugin-root `references/` tree is swept with this detector (874d9a0, 6d2a643)

### Other Changes

- **help:** list the effort-pinned agents (d17a45b)
- **docs:** `CLAUDE.md` says what a profile loads, not what its install record shows (a013266)
- **docs:** the July modernization audit notes that this release retired the session-inheritance design (b351bf2)

## 3.0.0 (2026-09-05)

The release that made a review round mean one round. Counts, ids and artifacts are now
per-round by construction rather than by bookkeeping, `orchestrate --auto` runs one spec
instead of a queue, and a registry stops a rule that governs two skills from forking in one
of them.

### Breaking Changes

- **orchestrate:** `--auto` takes exactly one spec. `/orchestrate --auto s1.md s2.md`, documented in `help.md` through 2.9.1 as "run pipeline on multiple specs serially", no longer does — pass one spec per invocation (ba55973)
- **review-code, review-doc:** `--max-iterations` is now **required**. It previously defaulted to `1`; a call that omits it now prints `Error: --max-iterations is required (0-10).` and exits (18887db)
- **orchestrate:** stage iii's review artifact moves from `tmp/_reviews_errors/<run_id>-review-code.json` to `tmp/_reviews_errors/<run_id>-iter<N>-review-code.json`, one file per iteration. Anything reading the old path finds nothing (15da5db)
- **orchestrate:** five failure-handling references are replaced by two. `crash-code-review.md`, `crash-implement.md`, `crash-text-stage.md` and `rollback-mechanism.md` become `crash.md`; `endless-loop.md` becomes `unresolved-criticals.md`. Any document citing a deleted path no longer resolves (ba55973, 18887db)

> As in 2.9.1, none of these commits carried a `BREAKING CHANGE:` footer, so a strict
> conventional-commit reader would not surface them. They are listed here because the
> behaviour changed incompatibly.

### Deprecated

Accepted with a warning and otherwise ignored, rather than rejected — the flag is inert, not invalid:

- `--verify-fixes` — the self-review pass it used to gate now always runs (cb88938)
- `--model`, `--min-model`, `--max-model` — every agent inherits the caller's session model; `--effort` pins reasoning depth

### Features

- **review:** add a shared-rules registry so a rule governing two skills cannot fork (fe97b8c)
- **review:** self-review the fixer's own edits, and stop counting the loop's churn (cb88938)
- **review:** hand back what the run could not decide, as the last line printed (c4f309c)
- **review:** a failed run says so, says why, and asks only when someone is there (d9317e4)
- **review:** counts are per-round, and there is no endless loop to detect (18887db)
- **review:** fix at every severity, and register agent tool discipline (946d2d0)
- **review:** validator gains a doc schema and excludes self-review churn from the counts (526824c)
- **review:** validate the finished artifact once, before the Final Report reads it (7662227). The `phase` provenance field added by the same commit was removed again in 62a4df6 and never shipped — `origin` replaced it
- **orchestrate:** stage iii dispatches one iteration per call, and can direct coverage via `--must-inspect` (15da5db)
- **orchestrate:** count review failures at completion, so the rate is visible (722ec0d)

### Fixes

- **review-code:** count mode must re-review the original scope every iteration (0c056e4)
- **review-doc:** rate severity by consequence, not by confidence (84d7101)
- **review:** triage is not gated on status, and the stop condition reads positively (7d71b60)
- **review:** stop injecting synthetic criticals, snapshot each round (3fd48ae)
- **review:** close the gate defects the Step 0 payload review found (3ec1a1b)
- **review:** close two gaps the end-to-end self-review run exposed (fc3aaf5)
- **orchestrate:** name the review artifacts the pipeline actually writes (91351c5)
- **orchestrate:** resolve 10 findings from the focused review of the stage-iii change — `--must-inspect` was handed on only at zero criticals, step-6's Case C had the rule without the mechanism, and the run-id convention contradicted the layout every stage depends on (ae29240)
- **orchestrate:** drop the `/respond-to-review` dependency from step 3 (e7137c7)
- **scripts:** escape the NUL separator in score-severity-eval so the file is text (fae38f3)
- **scripts:** resolve eval matches by specificity, not by severity alone (eefce4a)
- Applied review findings, by round: 19 (bc70e51), 23 (2dd3180), 27 (ee4f7ba), 35 (bfdb11d), 37 (5e59cb0), 20 (fd524bd), and the focused round's decisions (aafaf3c)

### Refactors

- **review:** rounds start fresh — remove carry-forward and the `phase` field (62a4df6)
- **orchestrate:** auto mode takes one spec, not a queue (ba55973)
- **skills:** share the stack-validation procedure instead of copying it (eaafade)

### Tests

- **review:** add gates and fixtures for severity, churn counts, and shared semantics (5cba874)
- **review:** add four gates and a duplication reporter (6a2cd63)
- **review:** give agent-abort-contract and brainstorm-handoff real detectors (e68da26)

### Other Changes

- **docs:** resolve seven citations an agent had to guess at (87327c1)
- **docs:** apply the dogfood review-doc round's findings (b50bbd5)

## 2.9.1 (2026-08-05)

### Breaking Changes

- **review-code:** the `category` enum value `test-gap` is replaced by `verification-gap`. Any stored `review-code.json`, backlog entry, or tooling that matches on `test-gap` will no longer validate (3e20143)
- **review-code:** `coverage` is now a **required** top-level field in the reviewer's JSON output. Output without it is rejected (ba73b50)
- **review-code:** `critical_count` and `high_count` must now equal the recount from the `issues` array. A file whose declared counts disagree is rejected rather than warned about (e82f703)

> None of these commits carried a `BREAKING CHANGE:` footer, so a strict conventional-commit reader would not surface them. They are listed here because the JSON contract changed incompatibly, and a changelog that omitted them would be wrong.

### Features

- **skills:** make unverified claims impossible to report as verified (fce4e07)
- **references:** extract verification evidence to a shared reference (329c7a6)
- **review-code:** replace test-gap with a verification-gap lens (3e20143)
- **review-code:** separate severity from confidence (6f22c6a)
- **review-code:** report unopened files and add the Incomplete status (ba73b50)
- **review-code:** validate reviewer output with a script, not a claim (d2cf5d2)

### Fixes

- **orchestrate:** stop advancing malformed review output as clean (60e33fb)
- **orchestrate:** route Incomplete reviews away from Complete (e3f1d0b)
- **review-code:** fail closed on count mismatch, triage on Incomplete (e82f703)
- **review-code:** sanction a search fallback when Grep is unavailable (a536fbc)
- **review-code:** align the Final Report's triage trigger with the phase itself (f9875a4)
- **review-code:** apply all 6 findings from the focused round (3f1adf0)
- **review-code:** apply 6 review findings from the 2.9.0 round (7013015)
- **review-code:** apply 4 review suggestions (f30ebff)
- **review-code:** apply 5 review suggestions (a175397)
- **review-code:** resolve 8 issues from iteration 1 (4eb861e)

### Other Changes

- **document-for-ai:** lead the help with the interface-tier-first workflow (90b5d62)
- **spec:** design for the review-code verification lens (566e1f0)
- **spec:** fail closed in both modes and validate output with a script (39e419b)
- **spec:** validator runs on Node, not Python (6f06322)
- **spec:** record the acceptance results, correcting the 2.9.1 release note (adfcc40)
- **release:** 2.8.0 (9caa96c), 2.8.1 (e75442d), 2.8.2 (97c022a), 2.9.0 (c7f8152), 2.9.1 (d7083c6)
