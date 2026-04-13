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

Edge: >50% non-feature commits interleaved → warn.

`/respond-to-review` is never rendered here — review-code applies fixes during iterations.
