# Finding Schema Reference

Defines the shared format all agents emit, scoring rubrics, priority calculation,
deduplication rules, and output templates.

---

## Shared Finding Format

Each agent emits findings conforming to this schema:

```
{
  file: string | null,
  line: number | null,
  dimension: "coverage" | "assertion" | "flakiness" | "edge-case",
  category: string,
  severity_risk: 1-5,
  severity_effort: 1-5,
  description: string,
  suggested_action: string
}
```

**Valid categories by dimension:**

| Dimension | Categories |
|-----------|-----------|
| coverage | `untested-module`, `untested-function`, `untested-endpoint`, `codebase-size` |
| assertion | `weak-assertion`, `zero-assertions`, `excessive-mocking`, `implementation-coupling`, `duplicate-coverage`, `duplicate-setup`, `oversized-test-file`, `missing-fixtures`, `inconsistent-naming` |
| flakiness | `timing-dependency`, `shared-mutable-state`, `missing-cleanup`, `non-deterministic-input`, `order-dependency`, `uncontrolled-io` |
| edge-case | `untested-branch`, `missing-boundary-test`, `untested-error-path`, `missing-null-test`, `untested-guard-clause` |

---

## Risk Scoring Rubric

| Score | Meaning | Examples |
|-------|---------|----------|
| 5 | Critical path, data mutation, security | Untested payment charge, auth bypass path, DB write without test |
| 4 | Business logic with branching | Untested discount calculation, order state machine |
| 3 | Moderate complexity utility | Untested date formatting with locale handling |
| 2 | Simple logic | Untested getter, simple DTO mapping |
| 1 | Trivial | Missing test for constants file, re-export module |

---

## Effort Scoring Rubric

| Score | Meaning | Examples |
|-------|---------|----------|
| 1 | One-line fix | Add missing assertion, remove unused mock |
| 2 | Simple test (<20 lines) | Write unit test for pure function |
| 3 | Test requiring setup | Write test with mocking, fixtures, or database setup |
| 4 | Multiple tests or refactor | Write test suite for untested module, refactor duplicate setup |
| 5 | Infrastructure change | New test helpers, fixture framework, environment setup |

---

## Priority Formula

```
priority = severity_risk × (6 - severity_effort)
```

Range: 1-25. High risk + low effort sorts first.

**Tiebreaker:** When priority scores are equal, sort by risk descending (higher risk first),
then by file path alphabetically for stable ordering.

---

## Severity Labels

Used in strategy doc summary and human summary:

| Label | Condition |
|-------|-----------|
| Critical | risk >= 4 |
| Moderate | risk 2-3 |
| Low | risk 1 |

---

## Deduplication Rules

Same file + same line (including both `null`) from multiple agents → merge into one finding.

When merging:
- List all dimensions and categories from the merged findings
- Use the highest risk score (worst case)
- Use the lowest effort score (easiest interpretation)
- Concatenate descriptions, deduplicate suggested actions

---

## Assertion Quality Per-File Rating

Roll up individual findings into a per-file rating:

| Rating | Condition |
|--------|-----------|
| Strong | Zero `weak-assertion` or `zero-assertions` findings |
| Adequate | 1-2 `weak-assertion` findings, no `zero-assertions` |
| Weak | Any `zero-assertions` finding OR 3+ `weak-assertion` findings |

---

## >30K LOC Critical Finding

Injected as finding #1 when codebase exceeds 30K LOC and user chose to proceed:

```
{
  file: null,
  line: null,
  dimension: "coverage",
  category: "codebase-size",
  severity_risk: 5,
  severity_effort: 5,
  description: "Codebase exceeds 30K LOC. Test improvements will have diminishing returns without structural decomposition.",
  suggested_action: "Run /ai-dev-tools:refactor-to-monorepo before investing heavily in test improvements."
}
```

---

## Strategy Doc Template

Output path: `docs/test-audit/strategy.md`

Monorepo: per-package at `{package_root}/docs/test-audit/strategy.md`, root summary at
`docs/test-audit/strategy.md` linking to each package.

```markdown
---
generated: YYYY-MM-DD
scope: full | path:<path> | changed:<base>..<head>
tech_stack: <stack>
test_runner: <runner>
total_findings: N
critical_findings: N
---

# Test Audit Strategy

## Summary
- **Source files scanned:** N
- **Test files scanned:** N
- **Test-to-source mapping:** N mapped, N unmapped
- **Findings:** N total (N critical, N moderate, N low)

## Findings by Dimension

### Coverage Gaps (N findings)
| Priority | Risk | Effort | File | Category | Description | Suggested Action |
|----------|------|--------|------|----------|-------------|-----------------|

### Assertion Quality (N findings)
| Priority | Risk | Effort | File | Category | Description | Suggested Action |
|----------|------|--------|------|----------|-------------|-----------------|

### Flakiness Signals (N findings)
| Priority | Risk | Effort | File | Category | Description | Suggested Action |
|----------|------|--------|------|----------|-------------|-----------------|

### Edge Cases (N findings)
| Priority | Risk | Effort | File | Category | Description | Suggested Action |
|----------|------|--------|------|----------|-------------|-----------------|

## Unmapped Tests
| Test File | Reason |
|-----------|--------|

## Test-to-Source Mapping
| Test File | Source File | Mapping Method |
|-----------|------------|----------------|
```

---

## Human Summary Template

Output path: `docs/tmp/test-audit-summary.md`

Header: `Generated from test audit on [date] — this is a one-time review document, not a source of truth.`

Contents:
- Biggest risk areas in plain English
- Top 5 quick wins (high risk, low effort) with concrete descriptions
- Top 5 big lifts (high risk, high effort) for sprint planning
- Overall test health assessment (percentage of source files with adequate coverage)
- Dimension-level summaries

---

## Informational-Only Findings

These categories are diagnostic without automated fixes. They appear in the report with
suggested manual actions but are not offered for auto-generation:

- `oversized-test-file`
- `missing-fixtures`
- `inconsistent-naming`

All other categories support fix generation when the user opts in.
