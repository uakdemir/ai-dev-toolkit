# Full Scan Fallback

This file is loaded by orchestrate when the hint file is missing, malformed, or validation fails.
It contains the complete state detection algorithm.

---

## State Detection

Orchestrate detects the current cycle position by scanning artifacts and git history. This full scan runs when the hint file (`tmp/orchestrate-state.md`) is missing or invalid. After detection, the hint file is written so subsequent invocations can use the fast path.

Evaluate the state table top-to-bottom. The first matching trigger determines which step to present:

| Check | Source | Status signal |
|---|---|---|
| Feature identified | `tmp/current-roadmap.md` | Next unimplemented item (if file exists) |
| Spec exists | `docs/superpowers/specs/*-design.md` | File exists for current feature |
| Spec reviewed | Spec file `**Status:**` header (line 4, bold format) | Contains "Approved" (matches both "Approved" and "Approved with suggestions") |
| Spec review has findings | `tmp/review_summary.md` `**Reviewed:**` field | Matches current spec path AND status is "Issues Found" |
| Spec review applied | `tmp/response_analysis.md` | Has entries for current round AND spec status still not "Approved" |
| Plan exists | `docs/superpowers/plans/*-plan.md` | File exists matching spec's feature name |
| Implementation in progress | Plan file checkboxes | Some `- [x]`, some `- [ ]` |
| Implementation complete | Plan file checkboxes + git | All `- [x]` OR commits after plan commit hash |
| Code reviewed | `tmp/review_summary.md` | File exists, commits in findings match current feature |
| Review resolved | `tmp/review_summary.md` Summary table | 0 Critical, 0 High |
| Fixes applied, re-review needed | Commits after reviewed commits | New commits since last review |

## Feature Detection Algorithm

1. Scan `docs/superpowers/specs/` for all `*-design.md` files.
2. For each spec, extract the feature name from the filename.
3. Check if the feature's cycle is complete. A cycle is complete if:
   - (a) Matching plan exists with all checkboxes `[x]` AND `tmp/review_summary.md` is clean (0 Critical, 0 High) with commit hashes matching this feature, OR
   - (b) Feature is marked Done in `tmp/current-roadmap.md` (legacy features completed before orchestrate), OR
   - (c) Plan exists with all unchecked boxes BUT feature-specific commits exist after plan hash AND `tmp/review_summary.md` has 0 Critical/0 High for matching commits (fallback for plans where checkboxes were not tracked).
4. Collect all specs whose cycle is NOT complete.
5. If exactly one incomplete spec: that is the current feature.
6. If multiple incomplete specs: present list: "Found multiple in-progress features: {list}. Which one?"
7. If zero incomplete specs: clean slate, go to Step 1.

## Matching Logic

Spec and plan filenames encode date + feature name (e.g., `2026-03-28-convention-enforcer-design.md` maps to feature `convention-enforcer`). Extract feature name by stripping the date prefix (`YYYY-MM-DD-`) and the `-design`/`-plan` suffix. This feature name is used for:
- Matching specs to plans (same feature name, different suffix).
- Scoping git log searches via `--grep='{feature_name}'`.
- Cross-checking commit hashes in tmp/ review files.

**Known limitation:** Feature names that are prefixes of other feature names (e.g., `implement-plan` vs `implement-plan-monorepo`) may cause inaccurate commit counts due to substring matching. The ambiguity handler (step 3 above) presents both features for user selection, so the critical path is unaffected. Commit counts may be slightly inflated — review-code examines actual diffs, so this is harmless.

## Implementation Detection

To determine if implementation has started or completed:

- Find the plan's commit hash: `git log --format=%H -1 -- {plan_path}`
- Count commits from plan to HEAD: `git log --oneline {plan_commit_hash}..HEAD --grep='{feature_name}'`
- Uses `--grep` for feature scoping by commit message substring matching. Note: `--grep` and pathspec cannot be combined in a single git log command — use `--grep` only.
- Doc/temp commits for the feature are included — review-code examines actual diffs, so inflated count is harmless.
- If count > 0: implementation has started.
- If count > 0 AND all plan checkboxes are `[x]`: implementation is complete, route to Step 6.

## Cross-Checking tmp/ Files

`tmp/review_summary.md` and `tmp/review.json` are global singletons (no feature prefix). They contain results from whatever feature was last reviewed, which may not be the current feature. To avoid attributing a stale review to the wrong feature:

- **Code review with findings:** Parse commit hashes from the `tmp/review.json` issues array `location` fields. Verify those commits appear in `git log --grep='{feature_name}'` output. If commits do not match: treat as stale, ignore.
- **Code review with zero findings (clean review):** A clean review has no commit hashes in findings. To attribute it: check the `**Scope:**` header in `tmp/review_summary.md` (review-code includes the commit range). Verify the commit range overlaps with the current feature's plan_hash..HEAD window. If it doesn't overlap or the header is missing: treat as stale.
- **Doc review:** Verify the `**Reviewed:**` field in `tmp/review_summary.md` matches the current spec path. If it references a different spec: treat as stale, ignore.
- **response_analysis.md:** This file is NOT read by orchestrate for state detection of code reviews. It is only relevant for spec review rounds (Step 3 round counting).

## Ambiguity Handling

- **Multiple in-progress features:** Present list, ask user to pick. Do not auto-select by date.
- **No artifacts at all:** Clean slate, go to Step 1 (suggest from roadmap or ask).
- **Stale artifacts:** If spec exists but is >30 days old with no plan, ask: "Found stale spec for `{name}` from {date}. Continue or start fresh?" Staleness is determined by comparing the date prefix in the spec filename against the current date.
- **Conflicting signals:** If artifacts suggest different steps (e.g., plan exists but spec is not approved), prioritize earlier steps. The spec approval gate must be passed before planning proceeds.
