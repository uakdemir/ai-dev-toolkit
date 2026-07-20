# ai-dev-tools Refresh — "Bugs + Cheap Wins" Design

**Date:** 2026-07-20 · **Status:** Approved design (ready for implementation plan; all review findings resolved)
**Approach:** A — phased direct edits, small commits, one L-effort bug deferred.
**Companion:** grounded findings in `2026-07-20-ai-dev-tools-modernization-audit.md` (every item below traces to a `file:section` there).
**Reviewed:** fact-checked at opus/max (99% claim accuracy); 17 precision fixes applied from that review.

## Decisions taken
- Scope = correctness bugs + low-effort modernization. Comprehensive structural refactors and efficiency work are **out** (see Deferred).
- ① The review-code path fix and the `--run-id` fix are **coupled** into one output-path-templating change.
- ② License = **MIT** (add SPDX field + a top-level `LICENSE` file).
- ③ Version bump → **2.6.0** (minor: fixes + additive modernization).
- Manifest `author` = name + GitHub URL; **email intentionally omitted** from the published manifest (privacy) unless the maintainer opts in.

## Problem & goal
The plugin is ~4 months old and, despite a "complete" roadmap, an audit found ~30 grounded defects — mostly correctness (broken output paths, an unpassable pipeline gate, inert generated tests, non-terminating loops, dead branches), plus a few bundled low-effort doc/precision nits — and gaps versus the current Claude Code plugin spec (thin manifest, no `argument-hint`, non-portable hardcoded paths, stale help). Goal: make existing functionality correct and bring it to current conventions — **no new features** — and ship 2.6.0.

## Scope

### Phase 1 — Correctness defects (+ a few bundled low-effort doc/precision nits)
Grouped into reviewable commits by skill-cluster. Each is a fix to existing behavior.

**orchestrate / implement**
- `stage-iii-code-review.md` — write `state: code-review-iter-<N>-complete` in the per-iteration commit + Next Stage (so `stage-iv-verification-gate.md:4`'s gate can pass).
- `implementation-step.md` — unify the parallelism threshold to **0.35** (the canonical `--auto` value already at `:42,43,86`) by replacing the two divergent 0.30 uses (`:58` algorithm, `:82` eligibility note). Consistency fix — removes the split where the same plan dispatches differently in standard vs `--auto` mode — not a new tuning.
- `stage-iii` — pick one missing-agent-iii-JSON policy (recommend: optimistic "0 criticals, advance" overrides the generic crash-retry); state it once.
- `common/error-logs-format.md` — document that the early-exit/success gates read the `critical_count` field (recounted from the `issues[]` array per the review JSON schema); read recipe `jq '.critical_count' <file>`.
- `profiling-log.md:29,44` — emit `model=inherited` for implement (it pins no model).
- `implementation-step.md:88` — delete the dead `--strict`/hint-file `mode` block (marker-file flow in SKILL.md D.5 is authoritative).
- S-nits (each with its file): delete dead `current_phase*` schema fields + unreachable enum states (`auto-state-schema.md:24-25,33-35`); phase-1 range `1..3`→`1..2` (`auto-state-schema.md:33`); add `--skip-plan-recommendation` to implement's `<help-text>` Usage line (`implement/SKILL.md:9`; already parsed at `:32,96,103`); renumber the option-[1] override list to `…,4,5` (`implementation-step.md`, currently `…,4,6`).

**review-code** (decision ①)
- Template two output paths — `{{OUTPUT_PATH}}` (reviewer/coder JSON) and `{{FIX_REPORT_PATH}}` (coder fix-report); SKILL.md resolves and passes both run-id-aware `tmp/_reviews_errors/[<run_id>-]…` paths. Fixes both the `tmp/` vs `tmp/_reviews_errors/` mismatch (`prompts/reviewer.md:49`, `coder.md:31`) **and** the `--run-id` concurrent-collision (unprefixed prompt paths). Update Output Artifacts/Terminal/Iteration sections to `[<run_id>-]`.
- `SKILL.md:179` — emit the synthetic-regression issue with ALL six schema-required fields (currently only `category`/`severity`/`confidence`; the schema fails on the three MISSING required fields, not on `additionalProperties`): `severity:"critical"`, `category:"bug"`, `location:"<verify-cmd>"`, `confidence:85`, `problem:"verification regression: <cmd> exit <n>"`, `suggested_fix:"restore <cmd> to passing"`.
- `SKILL.md:31-38` — positional detection: resolve `git rev-parse --verify` first; treat as count only if it does not resolve as a ref.
- `SKILL.md:176-181` — flaky-`--verify` guard: capture baseline by running each verify twice; exclude self-disagreeing commands from regression comparison (warn).

**review-doc**
- `agents/codebase-fact-checker.md:78` — `total_claims == 0` → `fact_check_accuracy = 100`.
- `codebase-fact-checker.md:26` — delete the ">5 lines" clause; defer to the `:88` bands (1-2/3-5/>5). *(spec earlier cited `:27`; actual line is `:26`.)*
- `SKILL.md` (Review Loop, immediately after `review()` and before the `pre_fix_criticals` count) — add reviewer-JSON schema-validation + single-retry, mirroring review-code's Validation step (`review-code/SKILL.md:111-116` + Error Handling `:413-420`); abort the iteration on the second failure.
- `SKILL.md:204-205,232` — print `Fact-check: not run` when `--fact-check false`.

**document-for-ai**
- `references/doc-templates.md:18` — replace dangling "§4.9 in the spec" with the SKILL.md Open-Questions section.
- `references/tech-stacks.md:106` — replace stale OR-probe (names unloaded `find_referencing_symbols`) with a deferral to SKILL.md's 3-step probe.
- `SKILL.md:304,335` — declare `--symbol-scope <all|exports-only>` in the flag list (with `--exports-only` as the documented alias for `exports-only`), matching its use as a real override.
- `SKILL.md:475-484` — HUMANIZE: mirror the source's relative path beneath `docs/tmp/<relpath>` (deterministic; eliminates basename-collision overwrite).

**convention-enforcer / api-contract-guard**
- `*.test.py`→`test_*.py` naming (pytest discovery) across both skills' templates + self-check.
- Node templates: drop the undeclared `import { glob } from 'glob'` → Node `fs.globSync`/recursion.
- `api-contract-guard/references/contract-test-templates.md:125` — `resolvesToModule`: `fsSubpath`→`subpath` and drop the double-dot (`path.resolve(pkgDir, subpath)`).
- `convention-enforcer/SKILL.md:Step 4` — add `{di_patterns…}`/`{di_detection…}`/`{endpoint_detection…}` to the substitution list (+ re-read tech-stacks sections before dispatch).
- `convention-enforcer/references/linter-rule-mappings.md:144-145,159-160` — parameterize the naming rule from the confirmed `dominant_pattern` (not hardcoded camelCase/PascalCase).
- `api-contract-guard` consumer scan — add `dist/build/coverage` + test-file excludes; Python `_extract_imports` — handle leading-dot relative imports.

**test-audit**
- `SKILL.md:Step 1` — re-key the tech-stack menu on backend (Node/.NET/Python/Other); fold the unused frontend axis into the sub-framework step.
- `SKILL.md:Step 5 (>30K)` — partition the test-reading agents (2 & 3) by test directory (same greedy size-balanced scheme as the source partition; merge/dedup their outputs), keeping each agent's context within the >30K budget.
- summary path `docs/tmp/test-audit-summary.md` → `docs/test-audit/test-audit-summary.md` (targeted defect fix — the summary diverged from test-audit's own `docs/test-audit/` strategy-doc dir — distinct from the deferred comprehensive output-dir taxonomy; `document-for-ai` HUMANIZE intentionally stays under `docs/tmp/` this round).

**refactor-to-layers**
- `structural-test-templates/node.md:68` — glob `**/*.{ts,tsx,js,jsx,vue}` (currently `*.ts` only → UI unscanned).
- `structural-test-templates/python.md:45` — match layers on path/dotted-segment boundaries, not raw substrings.
- `structural-test-templates/dotnet.md` — add "replace `MyApp`/`SomeEntity` with the project's root namespace/a real type" callouts; exclude `bin/obj` from the `*.cs` scan (`:44`); delete the assertion-less `NoCsprojBoundaryViolations` `[Fact]` (`:53`) — a real csproj-boundary check is a deferred follow-up, not this round.
- `SKILL.md:60` — drop Express/NestJS from the Node framework prompt (offer `Fastify / Other` only), since only Fastify is backed; removes the silent wrong-heuristic fallthrough. (Proper Express/NestJS support is a deferred follow-up.)

**changelog / session-handoff / consolidate / scaffold / refactor-to-monorepo**
- `changelog/SKILL.md:97` — add a per-commit record terminator (`%x00` after `%aI`, split on the NUL run) so multi-line bodies parse.
- `session-handoff/SKILL.md:68,89,100` — `TaskList tool` → `TodoWrite`.
- `consolidate/SKILL.md:57` — walk up to the first project marker (`package.json` / `*.csproj` / `pyproject.toml` / `go.mod`) in a directory, max depth 4, instead of the fixed depth-2 walk; report scan depth. Separately, retarget the `3-step`→`5-step` label fix to `consolidate/prompts/ai-diff.md:16` (`Section matching -- 3-step algorithm` → `5-step`; five steps follow) — it is NOT in SKILL.md.
- `scaffold/SKILL.md` — ship `references/placeholder-resolution-expo.md` in-skill, transcribed from the expo placeholder list in `docs/superpowers/specs/2026-04-16-mobile-scaffold-integration-design.md §3` (referenced at `:144,535`), then point the table there; fix the escape ordering (`:167`) so `{{{{X}}}}` is protected/tokenized BEFORE substitution and restored to `{{X}}` after; dedup array merges (`hooks`, `allowedHosts`) after concatenation; single-source the `--stack` allowlist by deriving it from the `templates/*/` directory set at runtime (currently duplicated at `:42,71,74,111,539`).
- `refactor-to-monorepo/SKILL.md` — explicit observation cap ("top 3/category") + "N truncated" notice; `--next-unit` precondition (prior unit `finalized`); gate the Node-flavored watch-list by stack.

### Phase 2 — Install portability
Replace the 7 functional hardcoded paths (review-code `:195` + scaffold's 6), per the current spec's portable path vars:
- `review-code/SKILL.md:195` → `${CLAUDE_PLUGIN_ROOT}/references/backlog-entry-format.md` (cross-skill shared ref).
- `scaffold/SKILL.md:120,143,442,447,488,493` → `${CLAUDE_SKILL_DIR}/…` (same-skill templates/references).
- `review-doc/SKILL.md:110` — correct the descriptive example text (`${CLAUDE_SKILL_DIR}`).
- Out of scope: converting bare `references/foo.md` refs (flagged for separate verification that skill-relative resolution works when installed).

### Phase 3 — Modernization + release
- **`plugin.json`:** bump to `2.6.0`; add `keywords`, `license: "MIT"`, `repository: {type:"git", url:"https://github.com/uakdemir/ai-dev-toolkit.git"}`, `homepage: "https://github.com/uakdemir/ai-dev-toolkit#readme"`, `author: {name:"Umut Akdemir", url:"https://github.com/uakdemir"}` (email omitted), `$schema: "https://json.schemastore.org/claude-code-plugin-manifest.json"`.
- **`marketplace.json`:** add `$schema: "https://json.schemastore.org/claude-code-marketplace.json"`, marketplace `description`, `owner` (name; email opt-in), and per-plugin `description`/`keywords`/`category: "development"`.
- **`LICENSE`** (top-level): MIT, © 2026 Umut Akdemir.
- **`argument-hint` frontmatter** on the 14 arg-taking skills (all except `help`), each mirroring its USAGE line. **Pilot on `review-code` first** to confirm the field renders/behaves before rolling out to the rest.
- **`help/SKILL.md`:** `/consolidate <ai|lint>` → `<ai|lint|all>`; reword `/scaffold` (three stacks, `--stack` required, expo single-package).

## Commit strategy
Small commits by skill-cluster within each phase (matches the maintainer's small-commit convention); no test suite (project convention); each commit message ends with the standard trailers. Optional post-hoc `/review-code <base-ref>` over the whole diff as a non-circular sanity pass.

## Success criteria
- Every Phase 1 item's file:section is changed and the described wrong/broken behavior no longer occurs (spot-verified by reading the touched logic).
- Generated Python enforcement tests are named `test_*.py`; api-contract-guard's Node template no longer `ReferenceError`s.
- review-code writes and reads the same `tmp/_reviews_errors/[<run_id>-]…` path; two run-ids don't collide.
- **Phase 2:** each replaced path resolves to the correct file under an installed-plugin layout (spot-checked by expanding `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_SKILL_DIR}`); no functional (non-example) `ai-dev-tools/…` hardcoded path remains (grep confirms).
- `plugin.json`/`marketplace.json` validate against their `$schema`; `LICENSE` present; version = 2.6.0.
- The changed `help` entries (`/consolidate`, `/scaffold`) match the actual command/flag surface.

## Deferred (explicit follow-ups)
- **review-doc carry-forward convergence bug** (needs issue-status tracking — its own mini-design).
- Comprehensive structural: `--help` format unification, `tech-stacks.md` extraction, output-dir taxonomy, `allowed-tools` rollout, `--run-id` threading to the other fan-out skills.
- Framework/enforcement build-out (surfaced by the spec review): Express/NestJS layer support in `refactor-to-layers`; a real `.csproj` `<ProjectReference>` boundary assertion for .NET.
- Efficiency: progressive-disclosure trims, large-repo parallelization, structured-output agent I/O, severity-vs-confidence split, deterministic dep-graph tooling, dogfood `changelog-from-commits`.

## Provenance
5 fable auditors + context7 (`/anthropics/claude-code` v2.1.89), then a fact-checked `/review-doc` pass at opus/max (99% claim accuracy). Full grounding: `2026-07-20-ai-dev-tools-modernization-audit.md`.
