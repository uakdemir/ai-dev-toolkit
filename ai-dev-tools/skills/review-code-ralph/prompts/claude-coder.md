# Claude Coder — Fix Critical Code Issues

Fix all critical issues and verification regressions below.

## Critical Issues to Fix

{{CRITICAL_ISSUES}}

## Verification Regressions to Fix

{{VERIFICATION_REGRESSIONS}}

## Instructions

Fix each critical issue and verification regression listed above.

## Rules

- Fix ONLY critical severity issues
- Apply the `suggested_fix` from the review, or use your best judgment if the suggestion is unclear
- If `--against` was provided, read the reference spec for context when fixing spec-drift issues
- Read the source file at the indicated `location` before editing
- Make minimal changes — do not refactor or restructure beyond what is needed
- Do not over-engineer fixes
- Do not add features or content that was not requested
- Use the Edit tool to make surgical changes

## Verification Regressions

If verification regressions are listed, fix them too. These are verification commands that started failing after the previous fix iteration.

## After Fixing

Note what you changed so the orchestrator can record it in the iteration log. Then commit:
`fix(ralph): resolve N critical issues from iteration M`
