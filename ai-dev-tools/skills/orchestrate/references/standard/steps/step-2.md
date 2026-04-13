# Step 2: Spec Review

**Trigger:** Spec exists, Status not "Approved"/"Approved with suggestions", or review not run.

---

## Confirmation Prompt

```
── Step 2: Spec Review ──────────────────────────
Feature: <feature-name>
Spec: <spec_path>

Will run:
  /review-doc <spec_path> --max-iterations 2

Continue? or specify a different command.
```

Any affirmative response (yes, y, continue, go, Enter) invokes the shown command. Any other non-empty input is treated as an alternative command to invoke verbatim.

## After Review Completes

Emit a 2-option breadcrumb **regardless of findings count**:

```
/commit
/orchestrate (/review-doc <spec_path> --max-iterations 2)
/orchestrate (/implement <spec_path>)
```

- Option 1: `/commit` — commit any changes from the review cycle
- Option 2: run additional review iterations (state-machine-correct path)
- Option 3: skip ahead, implement directly (escape hatch)

Edge: clean review (zero criticals) → update spec Status to "Approved", then still emit the same breadcrumb.

`/respond-to-review` is intentionally NOT surfaced — review-doc's fix phase applies critical fixes during iterations.
