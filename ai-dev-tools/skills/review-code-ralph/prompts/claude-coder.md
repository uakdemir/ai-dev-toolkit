# Claude Coder — Fix Code Issues

Fix all issues and verification regressions below.

## Issues to Fix

{{ALL_ISSUES}}

## Verification Regressions to Fix

{{VERIFICATION_REGRESSIONS}}

## Instructions

Fix each issue and verification regression listed above. Issues are grouped by severity (critical first, then high, then medium). Fix all where possible.

## Rules

- Fix all issues — critical, high, and medium severity
- Apply the `suggested_fix` from the review, or use your best judgment if the suggestion is unclear
- If `--against` was provided, read the reference spec for context when fixing spec-drift issues
- Read the source file at the indicated `location` before editing
- Make minimal changes — do not refactor or restructure beyond what is needed
- Do not over-engineer fixes
- Do not add features or content that was not requested
- Use the Edit tool to make surgical changes
- If an issue cannot be fixed because it is out of scope or requires changes beyond the current codebase context, defer it
- If a reviewer finding is incorrect, push back on it

## Verification Regressions

If verification regressions are listed, fix them too. These are verification commands that started failing after the previous fix iteration. Regressions are tracked separately — do NOT include them in fix-report.json.

## After Fixing

1. Write `./tmp/fix-report.json` with the disposition of every issue from `review.json` (NOT verification regressions):

```json
{
  "dispositions": [
    {
      "issue_index": 0,
      "action": "fixed",
      "detail": null
    },
    {
      "issue_index": 1,
      "action": "deferred",
      "detail": "Reason why this was deferred"
    },
    {
      "issue_index": 2,
      "action": "pushed-back",
      "detail": "Reason why this finding is incorrect"
    }
  ]
}
```

- `issue_index`: position in the `issues` array of `./tmp/review.json`
- `action`: `fixed` | `deferred` | `pushed-back`
- `detail`: null for fixed, required string for deferred/pushed-back
- Every issue in review.json MUST have an entry

2. Commit: `fix(ralph): resolve N issues from iteration M`
