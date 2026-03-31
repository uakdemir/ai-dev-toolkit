# Strict Mode Overrides

This file is loaded by orchestrate when --strict is active at Step 8 for verification gate and structured finishing.

---

## Verification Gate (--strict only)

Discover and run the project's test/build commands fresh (discovery: check CLAUDE.md → package.json scripts → Makefile test target → probe pytest/jest/cargo test; none found → skip gate with "No verification command found. Configure in CLAUDE.md."). If failing:
- "Verification failed. Fix before completing?"
- → Yes: fix failing tests inline, then re-run verification
- → No: proceed with warning in completion output

## Structured Finishing (--strict only)

After quality gate recommendations, present:

```
── Step 8: Complete ──────────────────────────
Feature: <feature-name>
Status: <Approved | Approved with suggestions | Issues Found>
Verification: <PASS | FAIL with details>

Options:
  [1] Print merge command for <base-branch>
  [2] Keep branch as-is (no action)
  [3] Generate session handoff for next session

Proceed with?
```

**Base-branch resolution:** Use the branch that was checked out when `/orchestrate` was first invoked (captured at Step 1 via `git rev-parse --abbrev-ref HEAD` before any feature branch is created). If not available, prompt the user: "Which branch should this merge into?"

**Option behaviors:**
- [1] Print the `git merge` command for the user to run manually. Do not execute it.
- [2] Exit with no action.
- [3] Dispatch `/session-handoff`.

**Blocked task reporting:** If any tasks were marked BLOCKED during Step 5, include them in the Status field: e.g., "Status: Approved with 2 blocked tasks".

---

## Error Handling (--strict only)

| Scenario | Behavior |
|---|---|
| Verification gate fails at Step 8 | Offer to fix failing tests inline and re-run verification, or proceed with warning. |
| All tasks BLOCKED at Step 5 | Report blocked list, skip to Step 6 (review-code reviews what was committed). |
| Base-branch unknown at Step 8 | Prompt user: "Which branch should this merge into?" |
| Override ignored by superpowers | Benign — redundant quality review wastes tokens, caught by review-code at Step 6. |
