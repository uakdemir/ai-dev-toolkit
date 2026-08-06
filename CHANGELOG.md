# Changelog

## 2.9.1 (2026-08-05)

### Breaking Changes

- **review-code:** the `category` enum value `test-gap` is replaced by `verification-gap`. Any stored `review-code.json`, backlog entry, or tooling that matches on `test-gap` will no longer validate (3e20143)
- **review-code:** `coverage` is now a **required** top-level field in the reviewer's JSON output. Output without it is rejected (ba73b50)
- **review-code:** `critical_count` and `high_count` must now equal the recount from the `issues` array. A file whose declared counts disagree is rejected rather than warned about (e82f703)

> None of these commits carried a `BREAKING CHANGE:` footer, so a strict conventional-commit reader would not surface them. They are listed here because the JSON contract changed incompatibly, and a changelog that omitted them would be wrong.

### Features

- **skills:** make unverified claims impossible to report as verified (fce4e07)
- **references:** extract verification evidence to a shared reference (329c7a6)
- **review-code:** replace test-gap with a verification-gap lens (3e20143)
- **review-code:** separate severity from confidence (6f22c6a)
- **review-code:** report unopened files and add the Incomplete status (ba73b50)
- **review-code:** validate reviewer output with a script, not a claim (d2cf5d2)

### Fixes

- **orchestrate:** stop advancing malformed review output as clean (60e33fb)
- **orchestrate:** route Incomplete reviews away from Complete (e3f1d0b)
- **review-code:** fail closed on count mismatch, triage on Incomplete (e82f703)
- **review-code:** sanction a search fallback when Grep is unavailable (a536fbc)
- **review-code:** align the Final Report's triage trigger with the phase itself (f9875a4)
- **review-code:** apply all 6 findings from the focused round (3f1adf0)
- **review-code:** apply 6 review findings from the 2.9.0 round (7013015)
- **review-code:** apply 4 review suggestions (f30ebff)
- **review-code:** apply 5 review suggestions (a175397)
- **review-code:** resolve 8 issues from iteration 1 (4eb861e)

### Other Changes

- **document-for-ai:** lead the help with the interface-tier-first workflow (90b5d62)
- **spec:** design for the review-code verification lens (566e1f0)
- **spec:** fail closed in both modes and validate output with a script (39e419b)
- **spec:** validator runs on Node, not Python (6f06322)
- **spec:** record the acceptance results, correcting the 2.9.1 release note (adfcc40)
- **release:** 2.8.0 (9caa96c), 2.8.1 (e75442d), 2.8.2 (97c022a), 2.9.0 (c7f8152), 2.9.1 (d7083c6)
