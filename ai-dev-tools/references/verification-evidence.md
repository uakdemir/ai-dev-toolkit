# Verification Evidence

> Shared definition of what counts as verification. Read by `review-code`'s reviewer
> (diff-scoped) and by `test-audit`'s Assertion Quality agent (suite-wide). One definition,
> two consumers — neither restates it.

## The Question

**If the behaviour this change is supposed to produce broke where it is actually used, would
verification fail?**

Coverage is not the property. A test that runs the code and asserts nothing has coverage and
answers nothing.

## What Counts

A test counts only if it **runs normally** and **an assertion observes** the changed output,
branch, or contract.

## What Does Not Count

- No execution — the code path is never reached
- Source-text assertions that match a file's wording instead of running it
- Success, no-throw, or snapshot-only checks
- Mock-call and log-call checks
- Tests that mock away the integration under test
- e2e tests that pass through without checking the changed output
- Stale assertions or fixtures that no longer describe current behaviour

Worked example: `expect(x ?? DEFAULT).toBe(DEFAULT)` passes when `x` is missing. It asserts the
fallback, not the behaviour.

## Weak Assertion Patterns by Stack

Assertion patterns that check existence or type but not value:

**Node.js (Jest/Vitest):**
- `expect(…).toBeDefined()` — weak, should check actual value
- `expect(…).toBeTruthy()` — weak unless checking a boolean
- `expect(…).not.toBeNull()` — weak, should check actual value
- `expect(…).toBeInstanceOf(…)` without subsequent value check — weak

**Python (pytest):**
- `assert result is not None` — weak
- `assert isinstance(result, …)` without value check — weak
- `assert result` (truthy check only) — weak unless checking boolean
- `assert len(result) > 0` without checking contents — weak

**.NET (xUnit):**
- `Assert.NotNull(…)` without subsequent value assertion — weak
- `Assert.IsType<…>(…)` without value check — weak
- `Assert.True(result != null)` — weak

## Scope of This Reference

This file defines **evidence**. It does not define severity, risk, effort, or finding shape —
each consumer keeps its own scoring.
