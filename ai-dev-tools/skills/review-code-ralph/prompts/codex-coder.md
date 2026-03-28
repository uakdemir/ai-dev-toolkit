You are fixing critical code issues found during review. This is iteration {{ITERATION_NUM}}.

## Critical Issues to Fix

{{CRITICAL_ISSUES}}

Each issue includes a `location` field (file:line). Read the source file at that location to understand the context before making changes.

## Verification Regressions to Fix

{{VERIFICATION_REGRESSIONS}}

## Spec Context

{{SPEC_CONTENT}}

## Rules

- Fix ONLY the critical issues and verification regressions listed above
- For each issue, apply the suggested fix or your best judgment
- Read the source file at the indicated location before editing
- Make minimal changes — do not refactor or restructure beyond what is needed
- Do not add features or content that was not requested
- Do not over-engineer fixes
- After fixing all issues, commit your changes with message:
  `fix(ralph): resolve N critical issues from iteration M`
  (replace N with the number of issues fixed and M with the iteration number)
