---
name: review-code
description: Review recent repository commits against a milestone analysis document and project architecture constraints to find implementation defects and drift. Use when asked to audit the last N commits for bugs, architecture violations, spec drift, security issues, and missing tests before merge.
---

# Review Code

Audit the latest commits with a code-review mindset, using the analysis doc as the implementation contract and `CLAUDE.md`/ADRs as hard architecture constraints.

## Parameters

| Placeholder | Example |
|-------------|---------|
| `[COMMIT_COUNT]` | `1` |
| `[ANALYSIS_DOC]` | `analysis/r1/m3.md` |

Fixed behavior:
- Response input (round > 1): `./tmp/response_code.md`
- Review output: `./tmp/review_code.md`

## Workflow

1. Resolve inputs:
   - Required: `[COMMIT_COUNT]`, `[ANALYSIS_DOC]`
2. Read context:
   - `CLAUDE.md` (hard constraints)
   - ADRs via scope-based filtering (see ADR Discovery below)
   - `[ANALYSIS_DOC]` (spec contract for the milestone)
3. If `./tmp/response_code.md` exists:
   - Read it first.
   - Do not re-raise pushed-back or deferred items unless new concrete evidence exists in the reviewed commits.
4. Collect target commits:
   - Use the last `[COMMIT_COUNT]` commits from `HEAD`.
   - Review each commit's changed files and patch.
5. For each commit, identify only:
   - `Bug`: logic errors, unhandled edge cases, missing boundary error handling, race conditions, data integrity issues
   - `Architecture`: conflicts with `CLAUDE.md` rules or unresolved ADR constraints
   - `Spec Drift`: divergences from `[ANALYSIS_DOC]`
   - `Security`: OWASP Top 10, injection risks, auth bypass, exposed secrets
   - `Test Gap`: risky logic paths without meaningful test coverage
6. Do not flag:
   - Style preferences not backed by a linter rule
   - Refactoring opportunities that expand scope
   - Missing comments or docstrings
   - Hypothetical future requirements
7. Cite evidence with precise file/line and commit hash.
8. Write output using the exact template below.
9. Write the final review to `./tmp/review_code.md`.

## Output Template (Use Exactly)

---
## [Issue Title]

**Severity:** Critical | High | Medium | Low
**File:** path/to/file.ts:[line_number]
**Commit:** [short hash]
**Category:** Bug | Architecture | Spec Drift | Security | Test Gap

**Description:**
[Clear explanation of the problem]

**Expected (per [ANALYSIS_DOC] or CLAUDE.md):**
[What should happen]

**Suggested fix:**
[Concrete suggestion — be specific enough for Claude to act on it without ambiguity]

---

## Summary
| Severity | Count |
|----------|-------|
| Critical | X |
| High     | Y |
| Medium   | Z |
| Low      | W |

---

## ADR Discovery

This procedure expands Step 2's ADR context loading. It runs before Step 4 (commit collection) — the diff enumeration in step 1 below is a lightweight pre-scan, not the full commit analysis.

If `docs/architecture/adrs/` directory does not exist, skip ADR loading silently.

### Filtering Algorithm

1. **Enumerate diff file paths.** Run `git diff --name-only HEAD~{COMMIT_COUNT}..HEAD` to collect changed file paths. This is lightweight and precedes ADR loading.

2. **Discover ADR files.** Build the candidate list by unioning two sources:
   - Read `docs/architecture/adrs.md` index to get linked ADR paths. If the index file is missing or unreadable, skip this source entirely.
   - Enumerate `docs/architecture/adrs/*.md` directly (excluding `archive/`).

   Union both sets by file path. After unioning, discard any path under `docs/architecture/adrs/archive/` (a stale index may reference archived ADRs) and any path that does not exist on disk. This ensures review-code finds ADRs even when the index is stale, missing, or out of sync — and never loads archived ADRs regardless of index state.

3. **Read frontmatter only.** For each discovered ADR that exists on disk, read only the YAML frontmatter (up to closing `---`). Extract `code_paths` and `status`.

4. **Status filter.** Skip any ADR where `status` is not `Accepted`. Frontmatter `status` is the single source of truth.

5. **Scope match.** Match each `code_paths` entry against the diff file paths from step 1:
   - **Directory entries** (ending in `/`): prefix match. `src/auth/` matches `src/auth/middleware.ts`.
   - **File entries** (no trailing `/`): exact match only. `src/auth.ts` matches only `src/auth.ts`.

   If any entry matches, load the full ADR file.

6. **Use as constraints.** Only loaded ADRs are used during the review (Step 5, Architecture category).

### Context Scaling

ADR context stays proportional to the review scope, not total ADR count:

| Total ADRs | Files in diff | ADRs loaded |
|------------|---------------|-------------|
| 10 | 5 files in src/auth/ | 2-3 (auth-scoped) |
| 30 | 5 files in src/auth/ | 2-3 (auth-scoped) |
| 60 | 5 files in src/auth/ | 2-3 (auth-scoped) |
