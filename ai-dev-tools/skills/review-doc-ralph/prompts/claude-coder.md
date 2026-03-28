# Claude Coder — Fix Document Issues

Fix all issues in `{{DOC_PATH}}` based on the review at `{{REVIEW_JSON_PATH}}`.

## Instructions

The orchestrator has already extracted all issues from the review JSON and provided them in the conversation context, grouped by severity (critical first, then high, then medium). Fix each one.

## Rules

- Fix all issues — critical, high, and medium severity
- Apply the `suggested_fix` from the review, or use your best judgment if the suggestion is unclear
- If `--against` was provided, read the reference document for context when fixing cross-reference issues
- Make minimal edits — do not restructure the document beyond what is needed
- Do not over-engineer fixes
- Do not add features, sections, or content that was not requested
- Use the Edit tool to make surgical changes
- If an issue cannot be fixed because it is out of scope, defer it
- If a reviewer finding is incorrect, push back on it

## After Fixing

1. Write `./tmp/fix-report.json` with the disposition of every issue from `review.json`:

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

2. Note what you changed so the orchestrator can record it in the iteration log.
