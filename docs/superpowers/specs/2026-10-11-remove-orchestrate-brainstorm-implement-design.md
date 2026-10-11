# Remove orchestrate; brainstorm → review-doc → implement → review-code

**Status:** Draft
**Date:** 2026-10-11
**Version:** ai-dev-tools 6.0.0 → 7.0.0 (a skill is removed)

## Goal

The team runs four skills by hand, in this order:

```
/ai-dev-tools:brainstorm      → writes and commits the spec
/ai-dev-tools:review-doc      → reviews the spec until it is sound
/ai-dev-tools:implement       → decides whether a plan is needed, then implements
/ai-dev-tools:review-code     → reviews the commits since /implement started
```

`orchestrate` has no users, so it goes. The spec is the only artefact a human reviews. A plan, when there is
one, is internal to `/implement`. Each step prints the command for the next one (section 1).

## Decisions (founder, 2026-10-11)

1. `/implement` decides whether a plan is needed **by judgement, not by counting**. It reasons about the spec
   the way the session would if asked "does this need a plan?". `--plan` / `--no-plan` override the decision
   and replace `--skip-plan-recommendation`.
2. Plans go to `docs/superpowers/plans/`, as today. That directory is gitignored (`.gitignore:37`), so a plan
   is never committed. It is deleted before the final push; that process does not change. A repo where the
   plugin is used ignores that folder too. The plugin adds nothing for a repo that does not: there
   `/review-code`'s clean-tree check refuses until the folder is ignored.
3. `/implement` never asks the user to review a plan, and does not bother the user with spec changes that
   have one defensible answer: it makes them itself. Only a change that is both **ambiguous** (it needs a
   decision) and **significant** (the session judges) stops the run: the questions are printed and nothing is
   implemented. When the user answers, the session writes the answer into the spec itself and carries on.
4. `orchestrate` is removed completely, and its state file with it. Nothing replaces
   `tmp/orchestrate-state.md`: each skill prints the command for the next step with its paths (section 1). The
   founder asks for the next step in plain words, and the session fills in the paths from that line.
5. `/implement --auto` is removed. Nobody uses it, and running unattended means asking the session to run
   `review-doc`, `implement` and `review-code` in succession, passing `--mode` to `implement` so its FULL-tier
   picker does not wait. `/implement --run-id` goes with it, because only orchestrate passed it. `review-doc`
   and `review-code` keep `--run-id`: it prefixes their `tmp/` artifact names, so two runs in one worktree do
   not overwrite each other.
6. `/implement` marks a refactor unit as done: when its refactor-unit run verifies, it ticks the unit in the
   roadmap. No skill reads or writes a spec's `Status:` line any more.

## 1. Handing over — each skill prints the next command

No skill keeps state. The hand-over is a printed command that carries its paths: a person can paste it, and a
session asked in plain words for the next step reads the paths from it.

| Skill | Prints | When |
|---|---|---|
| `brainstorm` | `/ai-dev-tools:review-doc <spec-path>`, alone, as the run's final output | a spec was committed |
| `review-doc` | `/ai-dev-tools:implement <spec-path>`, as the command of its `Recommended next:` block | rule 3 ("continue to implementation") on a run that reviewed exactly one document, under `docs/superpowers/specs/` or `docs/specs/`. Otherwise rule 3 prints no command, as today |
| `implement` | `/ai-dev-tools:review-code <sha> --against <spec-path>`, ending its output | the run implemented anything. `<sha>` is HEAD when the run started; a run given a plan prints no `--against`. A resumed run is the exception (section 2, item 4) |

- `review-doc` still ends with the brainstorm line, and its rules 1 and 2 still print the `review-doc` command.
  A run whose status is Error derives no recommendation: it prints neither the `Recommended next:` line nor a
  command.
- `/implement` needs a path. Without one it prints `Error: /implement needs a spec or plan path.` and exits.
- `tmp/orchestrate-state.md` is never read again, and no file replaces it.

## 2. `/implement` — Step C becomes a decision, not a prompt

Step A keeps only the positional path and its existence check: the hint-file fallback goes, and a run
without a path prints the error in section 1. Step B is unchanged. Step C is replaced:

**Plan given** → Step D, as today.

**Spec given:**

1. **Decide.** `--plan` → plan. `--no-plan` → no plan. Both → `Error: --plan and --no-plan are exclusive.`
   Otherwise the session reads the spec, and the code it touches, and judges whether a plan would change the
   outcome: the plan pays for itself when the coder would otherwise have to settle sequencing, decomposition or
   interface questions the spec leaves open, or when the work is large enough that per-task execution and
   review are worth their cost. There is no file count, no signal table and no threshold. Print one line,
   `Plan: needed — <reason>` or `Plan: skipped — <reason>`, and do not pause.
2. **Plan stage** (only when a plan is needed). Invoke `superpowers:writing-plans` in this session, on the spec,
   with this instruction placed before it:
   > Give every task a `Rollback:` field stating how to undo it — `Forward-fix only` is a valid value when
   > stated deliberately. Save the plan under `docs/superpowers/plans/` and do not commit it. Do not ask the
   > user to review the plan and do not present the Execution Handoff; return to /implement when the plan is
   > saved.

   If writing-plans still presents a review request or an Execution Handoff, ignore it and continue. Then the
   session fills in any `Rollback:` the plan still lacks, so plan gate 1.5 never prompts on a plan `/implement`
   wrote.
3. **Spec changes found while deciding or planning.** Each one is sorted on two questions: is it ambiguous
   (more than one defensible fix, so a decision is needed), and is it significant (the session judges; there is
   no threshold)?
   - **Not both** → the session makes the change itself: it edits the spec and any plan, commits the spec edit
     alone (`docs(spec): <what changed>`), and continues. Every such edit is listed in the final report.
   - **Ambiguous and significant** → print the questions, delete any unfinished plan file, and stop before any
     dispatch. Nothing is implemented on a spec known to be undecided. When the user answers, the session
     writes the answers into the spec, commits that edit alone (`docs(spec): <what changed>`), and resumes
     Step C with them. The questions are kept nowhere else: a later `/ai-dev-tools:implement <spec-path>`
     asks again about whatever is still open.
4. Print `Plan saved: <plan-path>` when a plan was written, so an interrupted run can resume with
   `/ai-dev-tools:implement <plan-path>`, and under it
   `After resuming, review with: /ai-dev-tools:review-code <sha> --against <spec-path>`, with the SHA of
   section 1. The resumed run is a run given a plan: its own command would start at a later SHA and name no
   spec, and so leave out every commit the interrupted run made. When that line is in the conversation, the
   resumed run ends its output with that command instead of its own. Then continue to Step D with the plan,
   or with the spec when no plan was needed. The plan stage never prompts.

A run that implemented anything ends its output with the `review-code` command of section 1.

**Refactor-unit path (decision 6).** When the run's verification passes, the session ticks the matched roadmap
item (`- [ ]` → `- [x]`) and commits the unit's changes together with the tick. Only orchestrate's step 7
ticked a unit, and only its `/commit` breadcrumb committed this path's work. A run whose verification fails
ticks and commits nothing, and says so in its `## Validation` block.

**Removed:** the signal table, Step C's `[1]/[2]` write-a-plan prompt (the single/per-task mode picker stays),
`--skip-plan-recommendation`, the "Return Contract with Orchestrate" section, the `feature:` hint-file bullet in
the refactor-unit pre-check (the feature name comes from the filename only), and every other orchestrate mention
(description, help text, examples, lines 122 and 133). With the hint file go Step A's two hint-file steps, its
fallthrough and its ordering note, the help text's "If omitted" sentence and no-path example, the "State
Synchronization Rules" section and the intro's "stateless … Orchestrate is the sole writer" sentence.

**Removed with decision 5:** `--auto` in the help text, argument parsing and argument hint, and `--run-id` in the
help text and argument parsing; the `--auto` pre-check in Step D and the `--auto` mentions at lines 138, 148 and
165; the `--auto` branch of the rollback gate (plan gate 1.5), which leaves its two interactive branches as the
whole rule, reached only by a plan `/implement` did not write (Step C item 2); `--auto` in mode settling and the
`Mode: <mode> (recommended)` line; and the RUN-ID THREADING overrides 9 and 10 in
`references/implementation-step.md`, together with that file's `--auto` lines (17, 60, 66).

**Edge cases** 1, 3, 4, 6, 8, 9 and 10 describe the hint file, the prompt or orchestrate and are removed. New
ones:
- A plan path passed with `--plan` or `--no-plan`: the flag is ignored and a one-line warning is printed.
- `--auto` passed: `Error: --auto was removed in 7.0.0.` and exit, since continuing could prompt a caller that
  asked for no prompts.
- `--run-id` is ignored, and `--skip-plan-recommendation` read as `--no-plan`, each with a one-line
  `removed in 7.0.0` warning, as the review skills treat removed flags.

`references/implementation-step.md`: "loaded by orchestrate at Step 5" becomes "loaded by `/implement`", the two
preamble headers read `(from /implement)`, line 68 names only the user as the receiver, and orchestrate's step
numbers go (the `Step 5: Implementation` banner at 43, Steps 6 and 8 at 123 and 190).
`references/refactor-execution.md:3` "Loaded at Step 5" becomes "Loaded by `/implement`".

## 3. New skill — `/ai-dev-tools:brainstorm`

`skills/brainstorm/SKILL.md`, with an optional topic argument.

1. Invoke `superpowers:brainstorming` with the topic and this override:
   > The terminal state is a spec in `docs/superpowers/specs/`, committed after its self-review. Do not invoke
   > writing-plans or any implementation skill. Skip the "user reviews written spec" gate: /review-doc is that
   > review. A bounded request still gets a short written spec instead of in-chat implementation, because
   > the next skill reads a file. A spike ends as brainstorming defines it, with findings and no spec.
2. If brainstorming still proposes writing-plans or implementation, decline it and continue with step 3.
3. When a spec was committed: print the next command, alone, as the run's final output:
   ```
   /ai-dev-tools:review-doc <spec-path>
   ```
   A spike prints no command.

**Wording constraint.** The `handoff-last-line` detector (`scripts/check-shared-semantics.cjs:316`) fails any
skill outside `brainstorm-handoff` that has a file outside `references/` mentioning both a last line and a
decisions document ("hand back", "could not decide", …), and any `references/` line that claims a last line
other than the brainstorm path. So the new SKILL.md and `/implement`'s new text say neither "last line" nor
"final line" ("ends its output with" instead), and stay outside `brainstorm-handoff`, which is a different
concept (a review run's decision document) that only shares the word.

## 4. Removing `orchestrate`

Delete `ai-dev-tools/skills/orchestrate/`. Then remove or rewrite every live reference:

| File | Change |
|---|---|
| `references/shared-rules/counts-exclude-self-review.md` | drop `orchestrate` from `applies-to`, the reader paragraph and the file list, and the unresolved-criticals gate from the round-local rationale (line 46) |
| `references/shared-rules/agent-dispatch-pin.md`, `risk-tier.md`, `run-failure-disclosure.md` | drop the orchestrate paragraphs and the `skills/orchestrate/…` file lists |
| `references/shared-rules/risk-tier.md:149-152` | drop `--auto` from the FULL-without-`--mode` bullet: only the picker prints a Mode line, `Mode: <mode> (picked)` |
| `references/shared-rules/severity-is-consequence.md` | rewrite "Why this is shared", which rests on the three auto-pipeline gates |
| `references/tasks-file.md` | the consumer list names session-handoff only, and line 14 no longer names `tmp/orchestrate-state.md` |
| `skills/review-doc/SKILL.md`, `prompts/reviewer.md`, `prompts/verifier.md`; `skills/review-code/SKILL.md`, `prompts/reviewer.md`, `prompts/self-review.md` | prose that justifies a rule by orchestrate (stage i/iii, `--auto`, the auto-pipeline and unresolved-criticals gates). The rules stay, with these reasons: the counts feed the skill's own stop check; `--must-inspect` serves a re-run after Incomplete; `since` mode serves `/implement`'s `review-code <sha>`; the run-id prefixes keep two runs in one worktree apart; the error log is read by the user, for failure frequency. review-doc's property 4 (the caller sets phase structure) goes. |
| `skills/review-doc/SKILL.md` | rule 3 of the next-round recommendation prints the `implement` command (section 1). `review-doc` commits at the end of every completed run that changed a document, not only when triage applied a fix: orchestrate's `/commit` breadcrumb did that before. The commit names those documents on `git add` and on `git commit`, so nothing already staged rides along. It leaves out a changed document that git ignores, such as a plan (decision 2): the run says so, and that is not an Error. |
| `skills/help/SKILL.md` | replace `/orchestrate` with the four-step workflow; add `/brainstorm` |
| `skills/session-handoff/SKILL.md` | drop the `/orchestrate (/…)` breadcrumb parsing, and Next Action Validation rule 2, which reads `Status: Draft` (decision 6) |
| `skills/refactor-to-layers/SKILL.md`, `skills/refactor-to-monorepo/SKILL.md` | Every `Status:` and `finalized` mention goes (decision 6): generated specs carry no `Status:` line, the `--next-unit` triggers lose "and the previous unit is finalized", refactor-to-monorepo's precondition check (line 459) goes, and the two "Spec already exists" rows become one, which prints `A spec for <next-unit> already exists: <path>. /implement ticks the unit when its run verifies.` and exits. refactor-to-monorepo also rewrites its three orchestrate lines: 272 (`coding` = `/implement`), 410 (`/implement` ticks the checkboxes) and 416 (the spec enters the four-step workflow at review-doc). |
| `skills/document-for-ai/references/adr-extraction.md`, `doc-templates.md` | drop the "orchestrate Step 4" consumer (ADR extraction was already removed there) |
| `scripts/check-shared-semantics.cjs`, `count-exclusion-test.sh`, `validate-review-json.cjs`, `check-schema-drift.cjs`, `check-doc-links.cjs` | comments only; `check-doc-links.cjs` gets a worked example that still exists in place of `failure-handling/unresolved-criticals.md` |
| `scripts/shared-semantics-mutation-test.sh` | comments, plus case N9's fixture (lines 582-584): `skills/orchestrate-fake` and its heading take a neutral name such as `breadcrumb-fake`. It tests detector scope, not orchestrate; N9 keeps its label and the suite still reports 66 passed. |
| `plugin.json`, both `marketplace.json` | drop "orchestration" from descriptions and keywords; version 7.0.0 |
| `CHANGELOG.md` (repo root) | 7.0.0 entry |

Not touched: `skills/scaffold/templates/expo/package/CLAUDE.md:57` (the verb "orchestrate", not the skill), the
generic nouns "orchestrator" (the session that drives a skill) and "orchestration" outside the manifests, and the
historical specs and plans under `docs/`.

**Dropped with orchestrate, not moved:** the roadmap suggestions, session bootstrap, post-implement auto-commit
verification, the step-7 completion phase, the auto-mode profiling log, and the spec `Status:` that step 2 set
to `Approved` (decision 6). None of them is part of the four-step workflow. **Moved:** the roadmap tick, to
`/implement`'s refactor-unit path (section 2).

## Verification

- `claude plugin validate ./ai-dev-tools --strict` and `claude plugin validate . --strict`.
- Every gate in the root `CLAUDE.md` passes, and `shared-semantics-mutation-test.sh` reports 66 passed.
- `grep -rniw orchestrate ai-dev-tools/` returns only the scaffold template's verb, and `grep -il orchestrat`
  over the three manifests returns nothing.
- `grep -rn orchestrate-state ai-dev-tools/` returns nothing.
- `grep -rniE 'unresolved-criticals|auto-pipeline|pipeline gates|error-logs-format|stage[- ]i+\b' ai-dev-tools/`
  returns nothing: it finds orchestrate's rationale where the name itself is absent.
- `grep -rn -- '--auto' ai-dev-tools/` and `grep -rnE -- '--run-id|--skip-plan-recommendation'
  ai-dev-tools/skills/implement/` return only `/implement`'s removed-flag handling.
- `grep -nE 'Status|finalized' ai-dev-tools/skills/refactor-to-layers/SKILL.md
  ai-dev-tools/skills/refactor-to-monorepo/SKILL.md` and `grep -n 'Status: Draft'
  ai-dev-tools/skills/session-handoff/SKILL.md` return nothing.
- `test -f ai-dev-tools/skills/brainstorm/SKILL.md && test ! -e ai-dev-tools/skills/orchestrate`.
- After `/reload-plugins`: `/ai-dev-tools:brainstorm` is listed and `/ai-dev-tools:orchestrate` is not. In a
  scratch repo, `/ai-dev-tools:implement` with no path, `… <spec> --plan --no-plan` and `… <spec> --auto` print
  their errors; `/ai-dev-tools:implement <spec>` prints its `Plan:` line without pausing and ends its output
  with the `review-code` command; and a clean `/ai-dev-tools:review-doc <spec>` prints the `implement` command
  under `Recommended next:`.

## Out of scope

- The colleague-facing wiki page (a separate repo). It needs the same workflow change and is flagged to the
  founder, not edited here.
- The user-level CLAUDE.md lines naming "the ai-dev-tools pipeline (orchestrate, implement, review-code)", and
  the auto-memory entry on orchestrate breadcrumbs. Also flagged to the founder, not edited here.
