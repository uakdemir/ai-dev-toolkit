# ai-dev-tools Refresh — "Bugs + Cheap Wins" Design

**Date:** 2026-07-20 · **Status:** Approved design (ready for implementation plan)
**Approach:** A — phased direct edits, small commits, one L-effort bug deferred.
**Companion:** grounded findings in `2026-07-20-ai-dev-tools-modernization-audit.md` (every item below traces to a `file:section` there).

## Decisions taken
- Scope = correctness bugs + low-effort modernization. Comprehensive structural refactors and efficiency work are **out** (see Deferred).
- ① The review-code path fix and the `--run-id` fix are **coupled** into one output-path-templating change.
- ② License = **MIT** (add SPDX field + a top-level `LICENSE` file).
- ③ Version bump → **2.6.0** (minor: fixes + additive modernization).
- Manifest `author` = name + GitHub URL; **email intentionally omitted** from the published manifest (privacy) unless the maintainer opts in.

## Problem & goal
The plugin is ~4 months old and, despite a "complete" roadmap, an audit found ~25–30 grounded correctness defects (broken output paths, an unpassable pipeline gate, inert generated tests, non-terminating loops, dead branches) plus low-effort gaps versus the current Claude Code plugin spec (thin manifest, no `argument-hint`, non-portable hardcoded paths, stale help). Goal: make existing functionality correct and bring it to current conventions — **no new features** — and ship 2.6.0.

## Scope

### Phase 1 — Correctness defects
Grouped into reviewable commits by skill-cluster. Each is a fix to existing behavior.

**orchestrate / implement**
- `stage-iii-code-review.md` — write `state: code-review-iter-<N>-complete` in the per-iteration commit + Next Stage (so `stage-iv-verification-gate.md:4`'s gate can pass).
- `implementation-step.md` — unify the parallelism threshold to **0.35** (replace the two 0.30 uses at L58/L82).
- `stage-iii` — pick one missing-agent-iii-JSON policy (recommend: optimistic "0 criticals, advance" overrides the generic crash-retry); state it once.
- `common/error-logs-format.md` — name the exact critical-count JSON field + read recipe used by early-exit/success gates.
- `profiling-log.md:29,44` — emit `model=inherited` for implement (it pins no model).
- `implementation-step.md:88` — delete the dead `--strict`/hint-file `mode` block (marker-file flow in SKILL.md D.5 is authoritative).
- S-nits: delete dead `current_phase*` schema fields + unreachable enum states (`auto-state-schema.md`); phase-1 range `1..3`→`1..2`; add `--skip-plan-recommendation` to implement `<help-text>`; renumber option-[1] override list (…,4,5 not …,4,6).

**review-code** (decision ①)
- Template the reviewer/coder output path as `{{OUTPUT_PATH}}` (+ fix-report path); SKILL.md passes the fully-resolved `tmp/_reviews_errors/[<run_id>-]…` path. Fixes both the `tmp/` vs `tmp/_reviews_errors/` mismatch (`prompts/reviewer.md:49`, `coder.md:31`) **and** the `--run-id` concurrent-collision (unprefixed prompt paths). Update Output Artifacts/Terminal/Iteration sections to `[<run_id>-]`.
- `SKILL.md:179` — specify the full synthetic-regression issue object (`location`/`problem`/`suggested_fix`) so it satisfies the `additionalProperties:false` schema.
- `SKILL.md:31-38` — positional detection: resolve `git rev-parse --verify` first; treat as count only if it does not resolve as a ref.
- `SKILL.md:176-181` — flaky-`--verify` guard: capture baseline by running each verify twice; exclude self-disagreeing commands from regression comparison (warn).

**review-doc**
- `agents/codebase-fact-checker.md:78` — `total_claims == 0` → `fact_check_accuracy = 100`.
- `codebase-fact-checker.md:27` — delete the ">5 lines" clause; defer to the L88 bands (1-2/3-5/>5).
- `SKILL.md` — add reviewer-JSON schema-validation + single-retry (mirror review-code L111-116/413-420).
- `SKILL.md:204-205,232` — print "Fact-check: not run" (or omit) when `--fact-check false`.

**document-for-ai**
- `references/doc-templates.md:18` — replace dangling "§4.9 in the spec" with the SKILL.md Open-Questions section.
- `references/tech-stacks.md:106` — replace stale OR-probe (names unloaded `find_referencing_symbols`) with a deferral to SKILL.md's 3-step probe.
- `SKILL.md:304,335` — declare `--symbol-scope <all|exports-only>` in the flag list (or drop the `all` references).
- `SKILL.md:475-484` — HUMANIZE: preserve relative path under `docs/tmp/` (or suffix) to prevent basename-collision overwrite.

**convention-enforcer / api-contract-guard**
- Generated Python test filenames `*.test.py` → `test_*.py` (pytest discovery). Both skills' templates + self-check.
- Node templates: drop `import { glob } from 'glob'` → Node `fs.globSync`/recursion (no undeclared dep).
- `api-contract-guard/references/contract-test-templates.md` — `resolvesToModule`: `fsSubpath`→`subpath` and drop the double-dot (`path.resolve(pkgDir, subpath)`).
- `convention-enforcer/SKILL.md:Step 4` — add `{di_patterns…}`/`{di_detection…}`/`{endpoint_detection…}` to the substitution list (+ re-read tech-stacks sections before dispatch).
- `convention-enforcer/references/linter-rule-mappings.md` — parameterize the naming rule from the confirmed `dominant_pattern` (not hardcoded camelCase/PascalCase).
- `api-contract-guard` consumer scan — add `dist/build/coverage` + test-file excludes; Python `_extract_imports` — handle leading-dot relative imports.

**test-audit**
- `SKILL.md:Step 1` — re-key the tech-stack menu on backend (Node/.NET/Python/Other); fold the unused frontend axis into the sub-framework step.
- `SKILL.md:Step 5 (>30K)` — define partitioning for the test-reading agents (2 & 3) or exempt them.
- summary path `docs/tmp/test-audit-summary.md` → `docs/test-audit/`.

**refactor-to-layers**
- `structural-test-templates/node.md` — glob `**/*.{ts,tsx,js,jsx,vue}` (currently `*.ts` only → UI unscanned).
- `structural-test-templates/python.md` — match layers on path/dotted-segment boundaries, not raw substrings.
- `structural-test-templates/dotnet.md` — add "replace `MyApp`/`SomeEntity`" callouts, finish-or-delete the empty `[Fact]`, exclude `bin/obj`.
- `SKILL.md:Step 1` — drop Express/NestJS from the Node prompt (only Fastify is backed) or add explicit fallbacks.

**changelog / session-handoff / consolidate / scaffold / refactor-to-monorepo**
- `changelog/SKILL.md:Step 2` — add a per-commit record terminator (`%x00` after `%aI`, split on the NUL run) so multi-line bodies parse.
- `session-handoff/SKILL.md:68,89,100` — `TaskList tool` → `TodoWrite`.
- `consolidate/SKILL.md` — walk to a project marker (or configurable depth) instead of depth-2; report scan depth. Fix "3-step"→"5-step" label.
- `scaffold/SKILL.md` — ship `references/placeholder-resolution-expo.md` in-skill (stop depending on a doc in the user's tree); fix the `{{{{X}}}}` escape-vs-substitution ordering; dedup array merges (`hooks`, `allowedHosts`); single-source the `--stack` allowlist.
- `refactor-to-monorepo/SKILL.md` — explicit observation cap ("top 3/category") + "N truncated" notice; `--next-unit` precondition (prior unit `finalized`); gate the Node-flavored watch-list by stack.

### Phase 2 — Install portability
Replace the 6 functional hardcoded paths, per the current spec's portable path vars:
- `review-code/SKILL.md:195` → `${CLAUDE_PLUGIN_ROOT}/references/backlog-entry-format.md` (cross-skill shared ref).
- `scaffold/SKILL.md:120,143,442,447,488,493` → `${CLAUDE_SKILL_DIR}/…` (same-skill templates/references).
- `review-doc/SKILL.md:110` — correct the descriptive example text (`${CLAUDE_SKILL_DIR}`).
- Out of scope: converting bare `references/foo.md` refs (flagged for separate verification that skill-relative resolution works when installed).

### Phase 3 — Modernization + release
- **`plugin.json`:** bump to `2.6.0`; add `keywords`, `license: "MIT"`, `repository: {type:"git", url:"https://github.com/uakdemir/ai-dev-toolkit.git"}`, `homepage: "https://github.com/uakdemir/ai-dev-toolkit#readme"`, `author: {name:"Umut Akdemir", url:"https://github.com/uakdemir"}` (email omitted), `$schema: "https://json.schemastore.org/claude-code-plugin-manifest.json"`.
- **`marketplace.json`:** add `$schema`, marketplace `description`, `owner` (name; email opt-in), and per-plugin `description`/`keywords`/`category: "development"`.
- **`LICENSE`** (top-level): MIT, © 2026 Umut Akdemir.
- **`argument-hint` frontmatter** on the arg-taking skills, mirroring each USAGE line. **Verify on one skill first** that the field renders/behaves before rolling out to the rest.
- **`help/SKILL.md`:** `/consolidate <ai|lint>` → `<ai|lint|all>`; reword `/scaffold` (three stacks, `--stack` required, expo single-package).

## Commit strategy
Small commits by skill-cluster within each phase (matches the maintainer's small-commit convention); no test suite (project convention); each commit message ends with the standard trailers. Optional post-hoc `/review-code <base-ref>` over the whole diff as a non-circular sanity pass.

## Success criteria
- Every Phase 1 item's file:section is changed and the described wrong/broken behavior no longer occurs (spot-verified by reading the touched logic).
- Generated Python enforcement tests are named `test_*.py`; api-contract-guard's Node template no longer `ReferenceError`s.
- review-code writes and reads the same `tmp/_reviews_errors/[<run_id>-]…` path; two run-ids don't collide.
- `plugin.json`/`marketplace.json` validate against their `$schema`; `LICENSE` present; version = 2.6.0.
- `help` output matches the actual command/flag surface.

## Deferred (explicit follow-ups)
- **review-doc carry-forward convergence bug** (needs issue-status tracking — its own mini-design).
- Comprehensive structural: `--help` format unification, `tech-stacks.md` extraction, output-dir taxonomy, `allowed-tools` rollout, `--run-id` threading to the other fan-out skills.
- Efficiency: progressive-disclosure trims, large-repo parallelization, structured-output agent I/O, severity-vs-confidence split, deterministic dep-graph tooling, dogfood `changelog-from-commits`.

## Provenance
5 fable auditors + context7 (`/anthropics/claude-code` v2.1.89). Full grounding: `2026-07-20-ai-dev-tools-modernization-audit.md`.
