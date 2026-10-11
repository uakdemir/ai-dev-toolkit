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
/ai-dev-tools:review-code     → reviews the commits
```

`orchestrate` has no users, so it goes. The spec is the only artefact a human reviews. A plan, when there is
one, is internal to `/implement`.

## Decisions (founder, 2026-10-11)

1. `/implement` decides whether a plan is needed **by judgement, not by counting**. It reasons about the spec
   the way the session would if asked "does this need a plan?". `--plan` / `--no-plan` override the decision
   and replace `--skip-plan-recommendation`.
2. Plans go to `docs/superpowers/plans/`, as today. That directory is gitignored (`.gitignore:37`), so a plan
   is never committed. It is deleted before the final push; that process does not change.
3. `/implement` never asks the user to review a plan. It asks only questions whose answer changes the spec.
   After the user answers, it edits the spec and the plan itself and continues.
4. `orchestrate` is removed completely. A small state file stays, so the four skills can find the current spec
   and plan: `tmp/pipeline-state.md`, which replaces `tmp/orchestrate-state.md`.

## 1. The state file — `tmp/pipeline-state.md`

```
spec: docs/superpowers/specs/2026-10-11-foo-design.md
plan: docs/superpowers/plans/2026-10-11-foo.md
```

Two fields with repo-relative paths. An empty value means none.

| Skill | Writes | Reads (only when no path is given) |
|---|---|---|
| `brainstorm` | `spec:` = the new spec; `plan:` = empty | — |
| `review-doc` | — | `spec:` |
| `implement` | `plan:` = the plan it wrote, if it wrote one | `plan:`, then `spec:` (today's order) |
| `review-code` | — | `spec:`, used as `--against` |

- `brainstorm` clears `plan:` when it writes a new `spec:`. Otherwise `/implement` with no path would pick up
  the previous feature's plan, because it prefers `plan:` over `spec:` (`skills/implement/SKILL.md:56`).
- A path given on the command line always wins, and the file is then neither read nor written by readers.
- A missing file or an empty field behaves exactly as no state did before: `implement` prints its "no path"
  error with `/orchestrate` removed from the message, `review-doc` its usual missing-path error, and
  `review-code` runs without a spec.
- When `review-code` takes the spec from the file, it prints `spec: <path> (from tmp/pipeline-state.md)`, so a
  stale spec is visible rather than silent.
- `tmp/orchestrate-state.md` is never read again. There is no migration: `tmp/` is scratch.

## 2. `/implement` — Step C becomes a decision, not a prompt

Steps A and B are unchanged apart from the state-file name. Step C is replaced:

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

   If writing-plans still presents a review request or an Execution Handoff, ignore it and continue. Write
   `plan:` to the state file.
3. **Spec questions.** While planning, any question whose answer would change the spec goes to the user, as
   one `AskUserQuestion` call. Everything else is the session's to decide. After the answer, edit the spec and
   the plan to match, commit the spec edit alone (`docs(spec): <what changed>`), and continue. Under `--auto`,
   which takes no input, print the questions instead and exit before any dispatch: nothing is implemented on a
   spec known to be wrong.
4. Continue to Step D with the plan, or with the spec when no plan was needed.

**Removed:** the signal table, the `[1]/[2]` prompt, `--skip-plan-recommendation`, the "Return Contract with
Orchestrate" section, and the `feature:` hint-file bullet in the refactor-unit pre-check (the feature name comes
from the filename only). "State Synchronization Rules" is rewritten to section 1's table.

**Kept:** `--auto` and `--run-id`. Both work standalone. Only their orchestrate rationale text goes.

**Edge cases** 4, 6, 8, 9 and 10 describe the prompt or orchestrate and are removed. New ones:
- A plan path passed with `--plan` or `--no-plan`: the flag is ignored and a one-line warning is printed.
- A user answer to a spec question that empties the scope: stop with `Spec no longer describes work to implement.`

`references/implementation-step.md`: "loaded by orchestrate at Step 5" becomes "loaded by `/implement`", and the
two preamble headers read `(from /implement)`.

## 3. New skill — `/ai-dev-tools:brainstorm`

`skills/brainstorm/SKILL.md`, with an optional topic argument.

1. Invoke `superpowers:brainstorming` with the topic and this override:
   > The terminal state is a written, self-reviewed, committed spec in `docs/superpowers/specs/`. Do not invoke
   > writing-plans or any implementation skill. Skip the "user reviews written spec" gate: /review-doc is that
   > review. A bounded request still gets a short written spec instead of in-chat implementation, because
   > the next skill reads a file. A spike ends as brainstorming defines it, with findings and no spec.
2. If brainstorming still proposes writing-plans or implementation, decline and stop.
3. When a spec was committed: write `spec:` (and empty `plan:`) to the state file, and print the next command,
   alone, as the run's final output:
   ```
   /ai-dev-tools:review-doc <spec-path>
   ```
   A spike writes no state and prints no command.

**Wording constraint.** The `handoff-last-line` detector (`scripts/check-shared-semantics.cjs:316`) governs any
skill file that mentions both a last line and a decisions document ("hand back", "could not decide", …). The
new SKILL.md describes its final output without either phrase, so it stays outside `brainstorm-handoff`, which
is a different concept (a review run's decision document) that only shares the word.

## 4. Removing `orchestrate`

Delete `ai-dev-tools/skills/orchestrate/`. Then remove or rewrite every live reference:

| File | Change |
|---|---|
| `references/shared-rules/counts-exclude-self-review.md` | drop `orchestrate` from `applies-to` and the reader paragraph and file list |
| `references/shared-rules/agent-dispatch-pin.md`, `risk-tier.md`, `run-failure-disclosure.md` | drop the orchestrate paragraphs and the `skills/orchestrate/…` file lists |
| `references/tasks-file.md` | consumer list and the state-file name |
| `skills/review-doc/SKILL.md`, `prompts/verifier.md`; `skills/review-code/SKILL.md`, `prompts/self-review.md` | prose that justifies a rule by orchestrate. The rules stay; the reason given becomes the skill's own stop check and the `tmp/_reviews_errors/` reader. `review-doc` and `review-code` gain the state-file read from section 1. |
| `skills/help/SKILL.md` | replace `/orchestrate` with the four-step workflow; add `/brainstorm` |
| `skills/session-handoff/SKILL.md` | drop the `/orchestrate (/…)` breadcrumb parsing |
| `skills/refactor-to-layers/SKILL.md`, `skills/refactor-to-monorepo/SKILL.md` | "orchestrate cycle" → the four-step workflow |
| `skills/document-for-ai/references/adr-extraction.md`, `doc-templates.md` | drop the "orchestrate Step 4" consumer (ADR extraction was already removed there) |
| `scripts/check-shared-semantics.cjs`, `count-exclusion-test.sh`, `shared-semantics-mutation-test.sh` | comments only. The `orchestrate-fake` fixture tests detector scope, not orchestrate, so it stays under a neutral name. |
| `plugin.json`, both `marketplace.json` | drop "orchestration" from descriptions and keywords; version 7.0.0 |
| `CHANGELOG.md` (repo root) | 7.0.0 entry |

Not touched: `skills/scaffold/templates/expo/package/CLAUDE.md:57` (the verb "orchestrate", not the skill), and
the historical specs and plans under `docs/`.

**Dropped with orchestrate, not moved:** roadmap checks, session bootstrap, post-implement auto-commit
verification, the step-7 completion phase and the auto-mode profiling log. None of them is part of the
four-step workflow.

## Verification

- `claude plugin validate ./ai-dev-tools --strict` and `claude plugin validate . --strict`.
- Every gate in the root `CLAUDE.md` passes, and `shared-semantics-mutation-test.sh` reports 66 passed.
- `grep -rn orchestrat ai-dev-tools/ --exclude=CHANGELOG.md` returns only the scaffold template's verb.
- `grep -rn orchestrate-state ai-dev-tools/` returns nothing.
- After `/reload-plugins`: `/ai-dev-tools:brainstorm` is listed and `/ai-dev-tools:orchestrate` is not.

## Out of scope

- The colleague-facing wiki page (a separate repo). It needs the same workflow change and is flagged to the
  founder, not edited here.
