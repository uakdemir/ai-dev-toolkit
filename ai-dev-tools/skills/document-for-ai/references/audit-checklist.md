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

---

## ADR Scoring: Reversibility × Blast Radius

Used during ADR extraction (see `references/adr-extraction.md`) to determine which architectural decisions qualify for formal ADRs. Score = Reversibility × Blast radius (range 1-9). Only candidates scoring >= 4 are extracted.

### Reversibility Cost

| Score | Description | Examples |
|-------|-------------|----------|
| 3 (High) | Requires migration, data rewrite, or API breaking change to undo | Database engine choice, auth protocol, public API contract |
| 2 (Medium) | Significant refactor but no data/API impact | Internal service boundaries, state management approach |
| 1 (Low) | Localized change, easy to swap | Naming conventions, file organization, utility library choice |

### Blast Radius

| Score | Description | Examples |
|-------|-------------|----------|
| 3 (High) | Crosses module boundaries, affects multiple consumers | Event bus architecture, shared middleware, data format |
| 2 (Medium) | Affects full module/feature | Module-internal storage, single-feature auth flow |
| 1 (Low) | Affects single file or function | Helper function implementation, single test fixture |

### Calibration Examples

| Decision | Reversibility | Blast Radius | Score | Qualifies? |
|----------|--------------|--------------|-------|------------|
| Use Redis for encrypted session storage | 3 (data migration) | 2 (auth module) | 6 | Yes |
| Event-driven notification dispatch | 3 (rewrite publishers/consumers) | 3 (crosses modules) | 9 | Yes |
| Name controllers with -Controller suffix | 1 (rename refactor) | 1 (single file each) | 1 | No |
| Use JWT for stateless auth tokens | 3 (token migration) | 2 (auth module) | 6 | Yes |
| Store config in YAML not JSON | 1 (file conversion) | 2 (all config consumers) | 2 | No |

### Filtering

- Keep top 3 candidates with score >= 4.
- If fewer than 3 qualify, keep only those that do.
- If zero qualify, return empty — no ADRs generated.
