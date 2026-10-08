# review-doc: an explicit join for the parallel fact-checker

**Date:** 2026-10-08 · **Target release:** ai-dev-tools 5.0.0 (not yet pushed) · **Skill:** review-doc · **Builds on:** `2026-10-08-review-skills-cost-and-time-design.md`

## Why

5.0.0 runs review-doc's fact-checker alongside the reviewer: both are dispatched in one message, and `scripts/merge-fact-check.cjs` merges the fact-checker's file before the fixer. Nowhere does the skill text say the round **waits for the fact-checker to return**. Line 263 of `skills/review-doc/SKILL.md` only says: "Once the reviewer's output has passed `validate(json)`, the orchestrator merges the two".

Whether that gap matters depends on the session:
- **No harm:** when both Agent results arrive together, the dispatch message itself is the barrier.
- **A race:** when agents run in the background and each one announces itself with a completion notification, the two can arrive in either order. An orchestrator that follows line 263 literally merges as soon as the reviewer validates.

The fact-checker is often the slower of the two: median 15.7 min against the reviewer's 12.5 min at `high` (fact-checker n=2).

One missing barrier allows all of these:

| Without the join | Effect |
|---|---|
| The reviewer returns first and the merge runs | The fact-check file does not exist yet, so the merge exits 1. The round's fact-check findings are dropped with only a warning. |
| The fixer starts while the fact-checker still reads the document | Fact-check locations point at text the fixer already changed. |
| The merge reads the file during the fact-checker's `--check` loop (`377781c`) | A draft is merged or rejected. |
| A round's fact-checker finishes after the next round's `delete(fact_check_json)` | The next round merges stale findings. |

## Decision

**An explicit fork–join.** The fact-checker stays parallel, and one rule, stated where the flow is defined, makes every round wait for both agents. Nothing else changes:
- the merge script;
- the per-round deletion;
- the failure path (warn and fall back to the reviewer's output);
- the fixer and the self-review.

**Alternatives considered:**
- **Back to sequential** (reviewer → fact-checker → fixer, keeping the separate file and the merge script). There is nothing to synchronise, but it gives back 12–31 min per fact-checked round.
- **A file-based barrier.** The fact-checker publishes its file only after `--check` passes, and the orchestrator polls for it. That needs polling and a wider Bash exception for the agent, which is more moving parts for the same guarantee.

**Why the join:** one rule removes all four rows above at their common cause. It adds no code and no new failure mode.

## Changes (`skills/review-doc/SKILL.md` only)

1. **Review Loop pseudo-code.** Directly after the dispatch line `review() + fact_check()` and its comment continuation, inside the `if fact_check:` branch, add:
   ```python
           join()                          # wait until BOTH have returned — nothing below starts
                                           # before, not even the reviewer's validation (Fact-Checker)
   ```
2. **Fact-Checker section.** Insert a new paragraph right after the opening paragraph that begins "Runs **alongside the reviewer**":

   > **The join.** Nothing else in the round starts until both agents have returned — not the reviewer's validation or its retry, not the merge, not the fixer. An agent has returned when its Agent call has delivered its result; in a session where agents run in the background, that is when its completion notification arrives, and the two can arrive in either order. A fact-checker that is still running has neither succeeded nor failed: wait for it, exactly as the sequential flow waited. Never infer its state from its file — the file can exist before the fact-checker has finished its own `--check` loop. The join is what makes the rest of this section hold: the merge reads a finished file, the fixer edits a document no agent is still reading, and no round's fact-checker can write after the next round's deletion.

3. **Fact-Checker section, the merge sentence.** "Once the reviewer's output has passed `validate(json)`, the orchestrator merges the two:" becomes "Once both agents have returned and the reviewer's output has passed `validate(json)`, the orchestrator merges the two:".
4. **Key behavioral property 2.**
   - Before: "The fact-checker runs alongside the reviewer and is merged before the fixer in each iter (so fact-check criticals get resolved in the same iter)."
   - After: "The fact-checker runs alongside the reviewer; the round waits for both to return (the join), then merges before the fixer in each iter (so fact-check criticals get resolved in the same iter)."
5. **Abort and failure.** After the sentence listing the triggers ("…when it crashes or returns nothing, or when the merge exits with anything but 0."), add: "A fact-checker that has not returned yet is none of these: the join waits for it, with no timeout, as for the reviewer."

**CHANGELOG.** The 5.0.0 Features bullet for review-doc's concurrent reviewer and fact-checker gains the clause "and nothing in the round starts until both agents have returned". Its commit list gains this change's SHA. This lands as a separate `docs(changelog)` commit, because a commit cannot cite its own SHA, following `13cee89` and `ae60a50`.

## Not in scope

- **Version skew in already-open sessions.** Such a session holds 4.0.0 skill text but reads 5.0.0 prompt files. It is a one-time transition, fixed by `/reload-plugins`. An `ABORT:`-prefixed "placeholder not substituted" stop was considered and left out: it would diverge from the convention the other prompts follow, where an unsubstituted placeholder is reported, not aborted.
- **Timeouts and polling.** None, as for every agent this skill dispatches.
- **Early validation.** The reviewer's `validate(json)` could start before the join, but it waits too. That is simpler to state, and it costs time only on the rare reviewer retry.

## Verification

- **Gates.** The eight gates in the repo CLAUDE.md, with unchanged expectations: `check-shared-semantics` exit 0, `count-exclusion-test` 5 passed, `check-doc-links` exit 0, `check-schema-drift` exit 0, `check-detector-coverage` PASS, `check-fixtures` PASS, `merge-fact-check-test` 8 passed, and the mutation suite 64 passed.
- **Sweep.** These must hold:
  - `grep -n "Once the reviewer's output has passed" ai-dev-tools/skills/review-doc/SKILL.md` prints nothing.
  - `grep -c '^\*\*The join\.\*\*' ai-dev-tools/skills/review-doc/SKILL.md` prints `1`.
  - `grep -c 'join()' ai-dev-tools/skills/review-doc/SKILL.md` prints at least `1`.
- **Manual smoke test addition.** In runs 2 to 4 of the 5.0.0 spec's §5, also check that the fixer's first transcript record comes after **both** the reviewer's last record and the fact-checker's last record. That shows the join in practice, beside the existing check that the two agents overlap.

## Landing

There are two commits on `master`, and neither is pushed:
1. The `SKILL.md` change, with the gates run on it.
2. The CHANGELOG commit that cites it.

The `SKILL.md` change is self-contained, and an open session sees it only after `/reload-plugins`.
