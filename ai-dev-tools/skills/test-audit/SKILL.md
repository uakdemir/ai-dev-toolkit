---
name: test-audit
description: "Use when the user wants to audit test quality, find coverage gaps, detect flaky tests, assess assertion quality, identify missing edge cases, prioritize test improvements, or evaluate test suite health — even if they don't use the exact skill name."
---

<help-text>
test-audit — Audit test quality and coverage gaps

USAGE
  /test-audit [path] [flags]

PARAMETERS
  path               Scope audit to a directory
  --changed           Audit only git-changed files
  --base <branch>    Merge base for --changed

EXAMPLES
  /test-audit                        Full codebase audit
  /test-audit src/services/          Path-scoped audit
  /test-audit --changed              Changed files only
  /test-audit --changed --base main  Explicit merge base
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

# test-audit

Analyze test suites and production code across 4 dimensions — coverage gaps, assertion quality, flakiness signals, and missing edge cases. Produce a prioritized test improvement plan scored by risk × effort. Optionally generate fixes by category.

## Workflow Overview

Execute these steps in order. Each step feeds into the next:

1. **Tech Stack Selection** — determine test runner, file patterns, assertion libraries.
2. **Scope Detection** — detect monorepo boundaries, apply scope mode (full / path / `--changed`).
3. **Codebase Size Gate** — count production LOC. If >30K, warn and recommend decomposition.
4. **Discovery** — build file inventory (source files, test files, test-to-source mapping).
5. **Dispatch** — spawn 4 parallel agents, each receives the file inventory.
6. **Merge** — coordinator collects 4 agent reports, deduplicates, applies risk × effort scoring.
7. **Present Findings** (user checkpoint) — prioritized report with risk × effort matrix.
8. **Offer to Fix** — generate fixes by category on user request.

Reference files used throughout (do not inline their content — read them at the indicated step):

- `references/tech-stacks.md` — test runner detection, test file patterns, naming conventions, monorepo detection
- `references/finding-schema.md` — shared finding format, risk/effort scoring rubrics, priority formula, deduplication rules, output templates
- `references/dimension-heuristics.md` — per-dimension detection patterns for all 4 agents

If "Other" is selected for tech stack, skip `references/tech-stacks.md` entirely.

---

## Step 1: Tech Stack Selection

Present these 6 options:

1. Node.js + React
2. Node.js + Vue
3. .NET + React
4. .NET + Vue
5. Python + React
6. Other

**Sub-framework prompt:** After selection, ask for the specific sub-framework:

- **Node.js** — "Fastify / Express / NestJS / Other?"
- **.NET** — "MVC Controllers / Minimal APIs / Other?"
- **Python** — "FastAPI / Django / Flask / Other?"

**Test framework prompt:** After sub-framework, ask: "What test runner do you use?"

- **Node.js** — "Jest / Vitest / Mocha / Other?"
- **.NET** — "xUnit / NUnit / MSTest / Other?"
- **Python** — "pytest / unittest / Other?"

**Validation:** After selection (options 1-5), scan the project root for the stack's validation file as defined in `references/tech-stacks.md`. If missing, warn: "Expected {file} for {stack} but did not find it. Continue anyway?"

**If "Other" is selected,** ask these 5 follow-up questions:

1. What is your backend language and framework?
2. What is your frontend framework (if any)?
3. What test runner do you use?
4. What assertion library do you use (or built-in)?
5. Where are your test files located? (e.g., `tests/`, co-located, `__tests__/`)

**Progressive disclosure:** After tech stack selection, read `references/tech-stacks.md` and locate the matching stack section. If "Other" was selected, skip loading tech-stacks.md and rely on the user's answers instead.

---

## Step 2: Scope Detection

Detect monorepo structure before proceeding.

1. Walk up from CWD looking for workspace config files listed in the General Monorepo Detection section of `references/tech-stacks.md`.
2. Check each detection file type for the selected stack.

| Condition | Behavior |
|-----------|----------|
| Single repo (no workspace config) | Process entire project as one unit. |
| Monorepo, CWD inside a package | Default to that package. Ask: "Audit `packages/[name]/` or the whole monorepo?" |
| Monorepo, CWD at repo root | Ask: "Audit entire monorepo or a specific package?" If entire, process each package independently with per-package strategy docs. |

### Scope Modes

Applied after monorepo detection:

| Mode | Trigger | Behavior |
|------|---------|----------|
| Full codebase | `/test-audit` (no args) | Scan all source + test files within detected scope |
| Path-scoped | `/test-audit src/services/` | Filter file inventory to path prefix. Include tests that map to source files under that path. |
| Git-diff aware | `/test-audit --changed` | `git diff --name-only` against merge base. Include changed source + test files + tests mapping to changed source. |

**Merge base detection for `--changed` mode:** Default: `git merge-base HEAD main`. If `main` does not exist, try `master`. If neither exists, prompt: "What branch should I diff against?" Users can also specify explicitly: `/test-audit --changed --base develop`.

For `--changed` mode: if a source file was changed but has no mapped test file, that's an immediate coverage gap finding.

---

## Step 3: Codebase Size Gate

Count production code LOC using `wc -l` on all source files matching stack extensions (excluding test files, vendor directories, generated code). The 30K threshold counts physical lines.

| Condition | Behavior |
|-----------|----------|
| ≤30K LOC | Proceed normally. |
| >30K LOC | **Prominent warning:** "This codebase is {N}K LOC. Codebases above 30K LOC are harder to test effectively and may benefit from structural decomposition first. Recommended: `/ai-dev-tools:refactor-to-monorepo`." Ask: "Proceed with audit anyway, or decompose first?" |

If user proceeds despite warning:
- Build full file inventory and test-to-source map in Discovery as one pass. Partition source files by top-level source directory for agent processing. Each agent batch receives the full test-to-source map but only source files for that partition. Findings accumulate, merged once in Step 6. Single strategy doc.
- Inject a **critical finding at position #1** in the final report.

If user chooses to decompose: exit gracefully with a pointer to refactor-to-monorepo.

---

## Step 4: Discovery

Runs before agents are spawned. Lightweight — file listing and convention matching only.

**4.1 Find test files:** Use stack-specific patterns from `references/tech-stacks.md`.

**4.2 Find source files:** All files matching stack extensions, excluding test files, vendor directories, and generated code.

**4.3 Build test-to-source map:** Three strategies in priority order:

1. **Naming convention:** Stack-specific rules from `references/tech-stacks.md`.
2. **Import analysis:** Test file imports a source module → mapped to that source file.
3. **Unmapped:** Test files matching neither heuristic — flagged in report.

**"Other" stack fallback:** Use the test file location from the user's answer as the glob base, combined with their language extension. Rely on import analysis for mapping.

Unmapped tests still get analyzed for assertion quality, flakiness, and hygiene — they just can't contribute to coverage gap or edge case analysis.

**4.4 Compute inventory summary:** Total source files, test files, mapped count, unmapped count, LOC per directory.

---

## Step 5: Dispatch — Parallel Agents

Spawn 4 agents simultaneously using the `dispatching-parallel-agents` pattern. Each receives the file inventory and test-to-source map, returns findings conforming to `references/finding-schema.md`.

### File-Processing Strategy

Agents process files in batches of 10-20, accumulating findings across batches. Agent 4 uses 10-pair batches (source+test). If file count exceeds 200, use a two-pass approach: first pass scans signatures only, second pass deep-reads files with signals.

### Agent Responsibilities

| Agent | Reads | Dimension | Key Outputs |
|-------|-------|-----------|-------------|
| 1: Coverage Gaps | Source files, test-to-source map | `coverage` | `untested-module`, `untested-function`, `untested-endpoint` |
| 2: Assertion Quality (composite) | Test files | `assertion` | `weak-assertion`, `zero-assertions`, `excessive-mocking`, `implementation-coupling`, `duplicate-coverage`, `duplicate-setup`, `oversized-test-file`, `missing-fixtures`, `inconsistent-naming` |
| 3: Flakiness Signals | Test files | `flakiness` | `timing-dependency`, `shared-mutable-state`, `missing-cleanup`, `non-deterministic-input`, `order-dependency`, `uncontrolled-io` |
| 4: Edge Cases (heuristic) | Source + test files | `edge-case` | `untested-branch`, `missing-boundary-test`, `untested-error-path`, `missing-null-test`, `untested-guard-clause` |

Each agent loads its dimension section from `references/dimension-heuristics.md` for detection patterns.

Agent 2 is intentionally composite (3 sub-concerns, 9 categories). The coordinator should not block on the fastest agent — Agent 2 may take longer.

Agent 4 uses heuristic text matching, not AST analysis. Findings are advisory — false positives are acceptable.

---

## Step 6: Merge & Prioritization

Read `references/finding-schema.md` for the shared format, scoring rubrics, priority formula, and deduplication rules.

1. Collect findings from all 4 agents.
2. Deduplicate: same file + same line (including both `null`) → merge.
3. Compute priority: `risk × (6 - effort)`. Tiebreaker: risk descending, then file path alphabetically.
4. Sort all findings by priority descending. Tiebreaker: risk descending, then file path alphabetically.
5. If >30K LOC gate was triggered, inject the codebase-size finding at position #1.
6. Compute per-file assertion quality ratings (Strong / Adequate / Weak) per `references/finding-schema.md`.

---

## Step 7: Present Findings (User Checkpoint)

Present the merged, prioritized report:

1. **Summary stats** — files scanned, findings count by severity, mapping success rate
2. **Quick wins** — top 5 by priority (high risk, low effort)
3. **Findings by dimension** — grouped tables, sorted by priority
4. **Unmapped tests** — test files that couldn't be mapped
5. **Test-to-source mapping** — full map for reference

Checkpoint prompt: "Review the findings above. You can: approve and proceed to fix generation, adjust risk scores for specific findings, exclude findings, or export the report only (skip fixes)."

If the user adjusts scores or excludes findings, re-sort the priority list before proceeding.

Write output artifacts: strategy doc and human summary per templates in `references/finding-schema.md`. For monorepo-wide audits, write per-package strategy docs per the monorepo template in `references/finding-schema.md`.

---

## Step 8: Offer to Fix

Present fix options grouped by category:

- "Generate skeleton tests for {N} uncovered functions?"
- "Strengthen {N} weak assertions?"
- "Add cleanup/isolation to {N} tests with shared state?"
- "Add edge case tests for {N} untested branches?"
- "Refactor {N} tests with duplicate setup into shared fixtures?"

**Informational-only findings** (`oversized-test-file`, `missing-fixtures`, `inconsistent-naming`) appear in the report but are not offered for auto-generation.

**Fix generation rules:**
- Follow existing project conventions (test runner, assertion library, file naming)
- Include `# TODO: verify` / `// TODO: verify` on assertions requiring domain knowledge
- New test files placed in the project's test directory following existing conventions
- Existing test files edited in place when strengthening assertions or adding cleanup
- Not committed automatically — user reviews and commits
- In `--changed` or path-scoped mode, fixes limited to scoped file set

**After fix generation,** print recommended next steps:
1. Review generated tests and fill in `TODO: verify` assertions
2. Run the full test suite to verify generated tests pass
3. Consider re-running `/ai-dev-tools:test-audit` to verify improvements
4. Run `/ai-dev-tools:document-for-ai` if test conventions changed significantly

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No test files found | Report "No tests detected." Offer coverage-gap-only mode. |
| No source files found | Abort. "No source files matching {stack} patterns." |
| >50% tests unmapped | Warn. Present unmapped list, ask for naming convention hints. |
| >30K LOC production code | Prominent warning + recommend decomposition. Batch + inject critical finding if user proceeds. |
| `--changed` with no changes | "No changes detected. Run without `--changed` for a full audit." |
| `--changed` with merge conflicts | Abort. "Merge conflicts detected — resolve first." |
| `--changed` with no merge base | Prompt: "No merge base found. What branch should I diff against?" |
| Unknown test framework | Warn, fall back to generic patterns. |
| Agent timeout / failure | Merge available results. Note: "{dimension} analysis incomplete — {N}/4 dimensions." |
| Mixed test frameworks | Detect all, apply heuristics per framework. Note in report. |
| Monorepo, CWD at root | Ask: "Audit entire monorepo or a specific package?" |
| Previous strategy doc exists | Overwrite. Compare across runs via `git diff`. |
| <5 source files | Warn: "Very small codebase. Findings may be limited." Proceed. |
| Dynamic imports | Flag as "not statically analyzable." Mark findings as estimates. |

---

## Progressive Disclosure Schedule

| Phase | Load | Section |
|-------|------|---------|
| After tech stack selection | `references/tech-stacks.md` | Relevant stack section only |
| Before dispatching agents | `references/finding-schema.md` | Full file |
| Agent 1: Coverage Gaps | `references/dimension-heuristics.md` | "Coverage Gaps" section only |
| Agent 2: Assertion Quality | `references/dimension-heuristics.md` | "Assertion Quality" section only |
| Agent 3: Flakiness Signals | `references/dimension-heuristics.md` | "Flakiness Signals" section only |
| Agent 4: Edge Cases | `references/dimension-heuristics.md` | "Edge Cases" section only |
| Fix generation | `references/dimension-heuristics.md` | Relevant section for fix patterns |

**Exception:** If "Other" was selected for tech stack, skip `references/tech-stacks.md` entirely. Derive patterns from the user's follow-up answers.
