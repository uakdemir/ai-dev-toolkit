# Claude Coder — Fix Critical Issues

Fix all critical issues in `{{DOC_PATH}}` based on the review at `{{REVIEW_JSON_PATH}}`.

## Instructions

The orchestrator has already extracted the critical issues from the review JSON and provided them in the conversation context. Fix each one.

## Rules

- Fix ONLY critical severity issues
- Apply the `suggested_fix` from the review, or use your best judgment if the suggestion is unclear
- If `--against` was provided, read the reference document for context when fixing cross-reference issues
- Make minimal edits — do not restructure the document beyond what is needed
- Do not over-engineer fixes
- Do not add features, sections, or content that was not requested
- Use the Edit tool to make surgical changes

## After Fixing

Note what you changed so the orchestrator can record it in the iteration log.
