# Audit Checklist — Scoring Methodology

Used during AUDIT mode to score existing docs and prioritize fixes.

---

## 3-Dimension Scoring Table

Each document is scored on three dimensions, each on a 1–5 scale:

| Score | Accuracy | Completeness | Format Compliance |
|-------|----------|--------------|-------------------|
| 5 | Matches code exactly | All template sections filled with substantive content | Correct frontmatter + correct template |
| 4 | Minor drift, still correct | All key sections filled, some thin | Correct frontmatter, minor template deviation |
| 3 | Mostly correct, some outdated info | Key sections present, some missing | Has frontmatter, missing some fields |
| 2 | Significantly outdated | Stub sections, major gaps | Partial frontmatter, wrong template |
| 1 | Contradicts current code | Missing entirely or empty | No frontmatter |

---

## Priority Score Formula

```
priority = (5 - accuracy) x 3 + (5 - completeness) x 2 + (5 - format) x 1
```

- **Maximum:** 24 (worst — all dimensions scored 1)
- **Minimum:** 0 (perfect — all dimensions scored 5)
- Accuracy is weighted highest (x3) because inaccurate docs cause the most damage.

### Priority Thresholds

| Score Range | Status | Action |
|-------------|--------|--------|
| 0–6 | Healthy (green) | No immediate action needed |
| 7–12 | Needs attention (yellow) | Schedule update |
| 13+ | Urgent fix (red) | Fix before next release |

---

## Overall Quality Score

The overall quality score is the **average of all individual doc scores** across all three dimensions,
expressed as a percentage of the maximum possible score per doc (15).

```
overall = (sum of all dimension scores across all docs) / (num_docs x 15) x 100%
```

- **Passes at:** >= 80% (average score >= 12/15 per doc)
- Below 80% means the documentation suite requires remediation before it can be considered healthy.

---

## Accuracy Scoping Guidance

When evaluating accuracy, apply the following rules:

1. **Components and Endpoints/Exports sections:** Compare directly against actual exported symbols
   in the codebase. A referenced symbol that no longer exists should be flagged.

2. **Data Flow and Key Decisions sections:** Verify that all referenced files and functions exist.
   Cross-check described behavior against current implementation.

3. **Stale symbol rule:** If a section references symbols that no longer exist, set `accuracy = 2`
   for that section regardless of other content quality.

4. **Scope of comparison:** Accuracy is assessed at the section level but rolled up to a single
   score per document. Use the lowest section accuracy as the document accuracy when any section
   contains contradictory or missing symbols.
