# Volatility Assessment

Algorithm for classifying subsystem documentation depth (L1 vs L2) based on git churn history.

---

## Pre-checks (in order)

### 1. Existing-doc pre-check

Before running the classification algorithm, check if an existing doc for this subsystem already has a `depth` field in its frontmatter.

- If existing doc has `depth: L1` → keep L1, skip classification.
- If existing doc has `depth: L2` → keep L2, skip classification.
- Override: the `--force-reclassify` flag bypasses this check and runs the full algorithm.

The algorithm below only applies to subsystems with no existing doc (or when `--force-reclassify` is passed).

### 2. Zero-history guard

If `total_commits_touching_paths_ever == 0`, treat the subsystem as L2. Do not attempt to compute `churn_rate`. Set `volatility` to `"unknown"` and `churn_rate` to `null` in frontmatter.

### 3. Thin-history guard

If `total_commits_touching_paths_ever < 20`, treat the subsystem as L2. Do not compute `churn_rate`. Volatility-based routing only kicks in when there is enough data to compute a meaningful rate. Set `volatility` to `"unknown"` and `churn_rate` to `null` in frontmatter.

---

## Classification algorithm

**Git commands:**

```bash
# Per-subsystem 90-day activity
git log --since="90 days ago" --oneline -- <subsystem_paths> | wc -l

# Total-ever baseline
git log --oneline -- <subsystem_paths> | wc -l
```

**Decision:**

```
churn_rate = commits_touching_paths_in_last_90_days / total_commits_touching_paths_ever

churn_rate > 0.40        → L1 (high-churn; narrative would go stale fast)
0.15 ≤ churn_rate ≤ 0.40 → L2 (mixed; short prose + symbol index)
churn_rate < 0.15        → L2 with deeper data-flow sections
```

**Volatility label mapping:**

| churn_rate range | `volatility` value | `depth` |
|---|---|---|
| > 0.40 | `high` | L1 |
| 0.15 – 0.40 | `medium` | L2 |
| < 0.15 | `low` | L2 (with deeper data-flow sections) |
| zero/thin history | `unknown` | L2 |

---

## Edge cases

- **Low symbol count:** A subsystem with > 0.40 churn but < 5 exported symbols still gets L1. The doc is cheap to generate, and a volatile surface is exactly where staleness bites. Do not prematurely optimize by skipping.
- **L1 → L2 promotion:** If a subsystem is classified L1 and on a subsequent invocation its churn_rate drops below 0.15, keep it at L1. Promotion to L2 requires an explicit user request. Sudden depth changes confuse readers.

---

## Frontmatter output

Set these fields based on the classification result:

```yaml
depth: L1                # or L2
volatility: high         # high / medium / low / unknown
volatility_measured: 2026-04-08   # today's date, ISO format
churn_rate: 0.47         # raw number, or null for zero/thin history
```

See `references/frontmatter-schema.md` for the full field definitions.
