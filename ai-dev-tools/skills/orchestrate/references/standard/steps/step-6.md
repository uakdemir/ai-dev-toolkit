# Step 6: Code Review

**Trigger:** Commits after plan hash (`git log {plan_hash}..HEAD`).

---

## Confirmation Prompt

```
── Step 6: Code Review ──────────────────────────
Feature: <feature-name>
Commits since plan: <N>

Will run:
  /review-code <N> --against <spec_path> --max-iterations 3

Continue? or specify a different command.
```

**N derivation:** `git log {plan_hash}..HEAD --oneline | wc -l`. If plan_hash empty, attempt populate via `git log --format=%H -1 -- {plan_path}`; if still empty, show `unknown`.

## After Review Completes

**Case M (status `Not reviewed (MECHANICAL)` — no review round ran):**
Checked first. The review wrote no review JSON and no summary, so there are no counts to route on. Write `review: mechanical` to the hint (`references/standard/hint-file-protocol.md`), so Step 7 reads this result and not a summary an earlier run left, and advance to Step 7 as Case B does.
```
/commit
/clear → /orchestrate
```

**Case A (criticals or highs remaining):**
Write `step: 7` to hint BEFORE emitting breadcrumb.
```
/commit
/clear → /orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)
/clear → /orchestrate
```

**Case B (0 criticals, 0 highs — success):**
Phase boundary advancing to Step 7 (Complete).
```
/commit
/clear → /orchestrate
```

**Case C (status Incomplete — review did not see every changed file):**
Do NOT advance to Step 7. A run with 0 criticals and 0 highs can still be Incomplete, and routing on counts alone would send a coverage hole through as a success. Name the files from `coverage.not_inspected` and re-review with those files front-loaded via `--must-inspect`. The flag does not narrow scope — the paths must already be in the reviewed diff, and the reviewer opens them before anything else rather than instead of anything else (`skills/review-code/SKILL.md` > Argument Parsing):
```
/commit
/clear → /orchestrate (/review-code <N> --against <spec_path> --max-iterations 1 --must-inspect <files from coverage.not_inspected>)
```
Case M is checked before every other case. Case C is checked **before** Case B, since both match on the same counts. If the user explicitly accepts the coverage hole, advance to Step 7 with the uninspected files carried into the Step 7 status line.

Edge: >50% non-feature commits interleaved → warn.

`/respond-to-review` is never rendered here — review-code applies fixes during iterations.
