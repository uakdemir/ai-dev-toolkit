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
/ai-dev-tools:review-code     → reviews the commits since /implement started (/implement prints the command)
```

`orchestrate` has no users, so it goes. The spec is the only artefact a human reviews. A plan, when there is
one, is internal to `/implement`.

## Decisions (founder, 2026-10-11)

1. `/implement` decides whether a plan is needed **by judgement, not by counting**. It reasons about the spec
   the way the session would if asked "does this need a plan?". `--plan` / `--no-plan` override the decision
   and replace `--skip-plan-recommendation`.
2. Plans go to `docs/superpowers/plans/`, as today. That directory is gitignored (`.gitignore:37`), so a plan
   is never committed. It is deleted before the final push; that process does not change.
3. `/implement` never asks the user to review a plan, and does not bother the user with spec changes that
   have one defensible answer: it makes them itself. Only a change that is both **ambiguous** (it needs a
   decision) and **significant** (the session judges) stops the run: the questions are printed and nothing is
   implemented. When the user answers, the session writes the answer into the spec itself and carries on.
4. `orchestrate` is removed completely. A small state file stays, so the four skills can find the current spec
   and plan: `tmp/pipeline-state.md`, which replaces `tmp/orchestrate-state.md`.
5. `/implement --auto` is removed. Nobody uses it, and running unattended means asking the session to run
   `review-doc`, `implement` and `review-code` in succession, passing `--mode` to `implement` so its FULL-tier
   picker does not wait. `/implement --run-id` goes with it, because only orchestrate passed it. `review-doc`
   and `review-code` keep `--run-id`: it prefixes their `tmp/` artifact names, so two runs in one worktree do
   not overwrite each other.

## 1. The state file — `tmp/pipeline-state.md`

```
spec: docs/superpowers/specs/2026-10-11-foo-design.md
plan: docs/superpowers/plans/2026-10-11-foo.md
```

Two fields with repo-relative paths. An empty value means none. The file is per worktree, so it holds one
cycle at a time.

| Skill | Writes | Reads (only when no path is given) |
|---|---|---|
| `brainstorm` | `spec:` = the new spec; `plan:` = empty | — |
| `review-doc` | given one path under `docs/superpowers/specs/`: `spec:` = it, and `plan:` = empty when that changes `spec:` | `spec:` |
| `implement` | given a spec: `spec:` = it, `plan:` = the plan it wrote or empty. Given a plan: nothing | `plan:`, then `spec:` (today's order) |
| `review-code` | — | `spec:`, used as `--against` |

- `brainstorm` clears `plan:` when it writes a new `spec:`. Otherwise `/implement` with no path would pick up
  the previous feature's plan, because it prefers `plan:` over `spec:` (`skills/implement/SKILL.md:56`).
- A path given on the command line always wins over the file; the writers above record it only as their
  rows say (a spec, never a plan), so the state follows the user, not only `brainstorm`.
- A missing file or an empty field behaves exactly as no state did before: `implement` prints its "no path"
  error with `/orchestrate` removed from the message, `review-doc` its usual missing-path error, and
  `review-code` runs without a spec.
- A skill that takes a path from the file prints `spec: <path> (from tmp/pipeline-state.md)` (or `plan: …`), so
  a stale entry is visible rather than silent; the review skills print it after their tier lines, which come
  first. `review-code --against none` runs without a spec whatever the file says.
- `tmp/orchestrate-state.md` is never read again. There is no migration: `tmp/` is scratch.

## 2. `/implement` — Step C becomes a decision, not a prompt

Steps A and B are unchanged apart from the state-file name, and Step A's no-path message and
`(from tmp/pipeline-state.md)` line (section 1). Step C is replaced:

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
   - **Ambiguous and significant** → print the questions, delete any unfinished plan file, write the state with
     `plan:` empty, and stop before any dispatch. Nothing is implemented on a spec known to be undecided. When
     the user answers, the session writes the answers into the spec, commits that edit alone
     (`docs(spec): <what changed>`), and resumes Step C with them. The questions are kept nowhere else: a
     later `/ai-dev-tools:implement <spec-path>` asks again about whatever is still open.
4. Write the state file (section 1), then continue to Step D with the plan, or with the spec when no plan was
   needed. The plan stage never prompts.

A run that implemented anything ends its output with `/ai-dev-tools:review-code <sha>`, `<sha>` being HEAD when
the run started.

**Removed:** the signal table, Step C's `[1]/[2]` write-a-plan prompt (the single/per-task mode picker stays),
`--skip-plan-recommendation`, the "Return Contract with Orchestrate" section, the `feature:` hint-file bullet in
the refactor-unit pre-check (the feature name comes from the filename only), and every other orchestrate mention
(description, help text, examples, lines 122 and 133). "State Synchronization Rules" and the intro's "stateless
… Orchestrate is the sole writer" sentence are rewritten to section 1's table.

**Removed with decision 5:** `--auto` in the help text, argument parsing and argument hint, and `--run-id` in the
help text and argument parsing; the `--auto` pre-check in Step D and the `--auto` mentions at lines 138, 148 and
165; the `--auto` branch of the rollback gate (plan gate 1.5), which leaves its two interactive branches as the
whole rule, reached only by a plan `/implement` did not write (Step C item 2); `--auto` in mode settling and the
`Mode: <mode> (recommended)` line; and the RUN-ID THREADING overrides 9 and 10 in
`references/implementation-step.md`, together with that file's `--auto` lines (17, 60, 66).

**Edge cases** 4, 6, 8, 9 and 10 describe the prompt or orchestrate and are removed. New ones:
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
3. When a spec was committed: write `spec:` (and empty `plan:`) to the state file, and print the next command,
   alone, as the run's final output:
   ```
   /ai-dev-tools:review-doc <spec-path>
   ```
   A spike writes no state and prints no command.

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
| `references/tasks-file.md` | consumer list and the state-file name |
| `skills/review-doc/SKILL.md`, `prompts/reviewer.md`, `prompts/verifier.md`; `skills/review-code/SKILL.md`, `prompts/reviewer.md`, `prompts/self-review.md` | prose that justifies a rule by orchestrate (stage i/iii, `--auto`, the auto-pipeline and unresolved-criticals gates). The rules stay, with these reasons: the counts feed the skill's own stop check; `--must-inspect` serves a re-run after Incomplete; `since` mode serves `/implement`'s `review-code <sha>`; the run-id prefixes keep two runs in one worktree apart; the error log is read by the user, for failure frequency. review-doc's property 4 (the caller sets phase structure) goes. |
| `skills/review-doc/SKILL.md`, `skills/review-code/SKILL.md` | the state-file handling from section 1, and `review-code --against none`. `review-doc` commits at the end of every completed run that changed a document, not only when triage applied a fix: orchestrate's `/commit` breadcrumb did that before. |
| `skills/help/SKILL.md` | replace `/orchestrate` with the four-step workflow; add `/brainstorm` |
| `skills/session-handoff/SKILL.md` | drop the `/orchestrate (/…)` breadcrumb parsing |
| `skills/refactor-to-layers/SKILL.md`, `skills/refactor-to-monorepo/SKILL.md` | "orchestrate cycle" → the four-step workflow; refactor-to-monorepo also drops orchestrate from lines 272 and 410 |
| `skills/document-for-ai/references/adr-extraction.md`, `doc-templates.md` | drop the "orchestrate Step 4" consumer (ADR extraction was already removed there) |
| `scripts/check-shared-semantics.cjs`, `count-exclusion-test.sh`, `validate-review-json.cjs`, `check-schema-drift.cjs`, `check-doc-links.cjs` | comments only; `check-doc-links.cjs` gets a worked example that still exists in place of `failure-handling/unresolved-criticals.md` |
| `scripts/shared-semantics-mutation-test.sh` | comments, plus case N9's fixture (lines 582-584): `skills/orchestrate-fake` and its heading take a neutral name such as `breadcrumb-fake`. It tests detector scope, not orchestrate; N9 keeps its label and the suite still reports 66 passed. |
| `plugin.json`, both `marketplace.json` | drop "orchestration" from descriptions and keywords; version 7.0.0 |
| `CHANGELOG.md` (repo root) | 7.0.0 entry |

Not touched: `skills/scaffold/templates/expo/package/CLAUDE.md:57` (the verb "orchestrate", not the skill), the
generic nouns "orchestrator" (the session that drives a skill) and "orchestration" outside the manifests, and the
historical specs and plans under `docs/`.

**Dropped with orchestrate, not moved:** roadmap checks, session bootstrap, post-implement auto-commit
verification, the step-7 completion phase and the auto-mode profiling log. None of them is part of the
four-step workflow.

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
- `test -f ai-dev-tools/skills/brainstorm/SKILL.md && test ! -e ai-dev-tools/skills/orchestrate`.
- After `/reload-plugins`: `/ai-dev-tools:brainstorm` is listed and `/ai-dev-tools:orchestrate` is not. In a
  scratch repo, `/ai-dev-tools:implement <spec> --plan --no-plan` and `… --auto` print their errors,
  `/ai-dev-tools:implement <spec>` prints its `Plan:` line without pausing, and `/ai-dev-tools:review-code 1`
  with a hand-written state file prints the `(from tmp/pipeline-state.md)` line after its tier lines.

## Out of scope

- The colleague-facing wiki page (a separate repo). It needs the same workflow change and is flagged to the
  founder, not edited here.
- The user-level CLAUDE.md lines naming "the ai-dev-tools pipeline (orchestrate, implement, review-code)", and
  the auto-memory entry on orchestrate breadcrumbs. Also flagged to the founder, not edited here.
