You are fixing code issues found during review. This is iteration {{ITERATION_NUM}}.

## Issues to Fix

{{ALL_ISSUES}}

Each issue includes a `location` field (file:line). Read the source file at that location to understand the context before making changes.

## Verification Regressions to Fix

{{VERIFICATION_REGRESSIONS}}

## Spec Context

{{SPEC_CONTENT}}

## Rules

- Fix all issues — critical, high, and medium severity
- For each issue, apply the suggested fix or your best judgment
- Read the source file at the indicated location before editing
- Make minimal changes — do not refactor or restructure beyond what is needed
- Do not add features or content that was not requested
- Do not over-engineer fixes
- If an issue cannot be fixed because it is out of scope, defer it with a reason
- If a reviewer finding is incorrect, push back with a reason
- Verification regressions are tracked separately — do NOT include them in fix-report.json

## After Fixing

1. Write `./tmp/fix-report.json` with the disposition of every issue from `./tmp/review.json` (NOT verification regressions):

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

2. Commit your changes with message:
  `fix(ralph): resolve N issues from iteration M`
  (replace N with the number of issues fixed and M with the iteration number)
