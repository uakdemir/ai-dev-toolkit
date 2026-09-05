# Q2: Unresolved Criticals

**Trigger:** the caller's `--max-iterations` is exhausted and the final round still found criticals.

---

## This is not a loop failure

It used to be called one. `--max-iterations` is a **required** argument on both review skills, so the
loop is bounded by construction — it cannot run away, and there is nothing to detect. What this
records is a result, not a pathology: the review ran the number of rounds it was given and did not
clear every critical.

The old framing did real harm. Calling it "endless loop" implied the loop was misbehaving, so the
response was tuned to tolerate a bad count (`≤1 critical` counted as success) rather than to trust
it. That tolerance existed because `critical_count` used to accumulate: rounds carried their findings
forward, so a critical the fixer had already resolved was counted again and the number grew whatever
the fixer did. Rounds now start fresh — each one re-reviews and reports only what it finds — so the
number can be trusted and the tolerance is unnecessary.

## Measurement

`critical_count` at the final iteration's REVIEW output, before that iteration's fix phase. The fix
phase runs regardless.

That field counts findings in the artefact under review. It excludes the round's own self-review
churn (`origin: "self-review"`, see `../../../../../references/shared-rules/counts-exclude-self-review.md`),
and it counts only what **this** round found — an issue a previous round fixed is not counted again.

- **0 criticals** → success, continue pipeline
- **any critical remaining** → stop the run, per Response below

## Response

1. Append the unresolved criticals where the reader will find them:
   - **Agent i (spec-review):** to the spec file itself
   - **Agent iii (code-review):** to `tmp/_reviews_errors/<run_id>-unresolved-criticals.md`
2. Commit wip: `wip(auto): <spec-slug>: <spec-review|code-review> unresolved criticals at iter <N> — see tmp/_reviews_errors/error-logs.md`. Stage every modified and untracked file outside `tmp/`, matching stage iii's `':!tmp/'` exclusion — so agent i's criticals, appended to the spec file in step 1, are committed with the work rather than left dirty in the tree. Agent iii's record stays under `tmp/`, which is never committed; step 3's log entry is what points a reader at it.
3. Log a Warning to `tmp/_reviews_errors/error-logs.md`
4. State → `stopped-unresolved-criticals` in `auto-state.md`
5. **Stop.** Exit non-zero.

At stage i this still means the spec is never implemented, which is the whole point: a spec whose
criticals are unresolved is not one to build from.
