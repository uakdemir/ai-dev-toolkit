You are fixing issues found during document review.

**Document to fix:** `{{DOC_PATH}}`
**Reference document:** {{AGAINST_PATH}}

Read the document at `{{DOC_PATH}}`. If a reference document is provided above, also read it for context when fixing cross-reference issues.

## Issues to Fix

{{ALL_ISSUES}}

## Rules

- Fix all issues — critical, high, and medium severity
- For each issue, apply the suggested fix or your best judgment
- Make minimal edits — do not restructure the document beyond what is needed
- Do not add content that was not requested
- Do not over-engineer fixes
- If fixing a cross-reference issue and a reference document is provided, read it first
- If an issue cannot be fixed because it is out of scope, defer it with a reason
- If a reviewer finding is incorrect, push back with a reason

## After Fixing

Write `./tmp/fix-report.json` with the disposition of every issue from `./tmp/review.json`:

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

Note what you changed so the orchestrator can record it in the iteration log.
