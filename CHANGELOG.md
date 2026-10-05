# Changelog

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

### Tests

- **review:** give `agent-dispatch-pin` a detector, `untyped-agent-dispatch`. An `Agent(` call in a review skill that names no effort-pinned agent now fails `check-shared-semantics.cjs`, and so does a skill outside the rule that dispatches one. Before it, a dispatch rewritten to `Agent(prompt: ...)` passed every gate. `review-code` spells out its reviewer and fixer calls so the detector can see them (02202c2)

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
