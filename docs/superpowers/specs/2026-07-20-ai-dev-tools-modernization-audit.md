# ai-dev-tools — 4-Month Modernization & Hardening Audit

**Date:** 2026-07-20 · **Status:** Research findings (no work decided yet — feeds brainstorming)
**Method:** 5 fable-model auditors (bottom-up, read every skill file) + context7 against the live Claude Code plugin/skill/marketplace specs (v2.1.89, top-down).
**Constraint honored:** improvements to EXISTING functionality only — no new skills/features proposed.

Everything below is grounded in a specific `file:section`. Effort: S/M/L.

---

## Part 1 — Correctness bugs (existing functionality is broken today)

### orchestrate / implement (`--auto` pipeline)
- **[robustness]** `orchestrate/.../stage-iii-code-review.md` never writes a `code-review-iter-N-complete` state, but `stage-iv-verification-gate.md:4` REQUIRES it → stage iv's mandatory gate can never pass. **S**
- **[robustness]** `implement/references/implementation-step.md` — parallelism threshold contradicts itself: yield gate `>=0.35` (L42-43) vs recommendation algorithm `>=0.30` (L58); `--auto` uses 0.35 in 4 places, 0.30 in 2 → same plan dispatches differently in standard vs auto. Pick 0.35. **S**
- **[robustness]** missing agent-iii JSON has three conflicting handlers (`retry-semantics.md:10` crash-retry vs `stage-iii:43` non-success vs `stage-iii:57` advance-as-clean). Pick one. **S**
- **[reliability]** critical-count field name/parse recipe for `*-review-code-iter{N}.json` is never specified — the exit gate reads a value nobody names. **S**
- **[consistency]** `profiling-log.md:29,44` logs `model=opus` for implement, but implement pins no model (only single/subagent/parallel topology) → wrong profiling whenever session ≠ opus. Emit `inherited`. **S**
- **[modernization]** `implementation-step.md:88` — dead `--strict`/hint-file `mode` block; `--strict` exists nowhere and `hint-file-protocol.md:19` lists mode as removed. Delete. **S**
- Minor: dead schema fields `current_phase*` + unreachable enum states (`auto-state-schema.md:24,33`); phase-1 range says N=1..3 but dispatch is `--max-iterations 2`; `--skip-plan-recommendation` parsed but absent from `--help`; option [1] override list numbered 1,2,3,4,6; hardcoded `200_000` context window. **S each**

### review-code / review-doc / document-for-ai
- **[reliability]** `review-code/prompts/reviewer.md:49` writes `tmp/review-code.json` and `coder.md:31` writes `tmp/review-code-fix-report.json`, but SKILL.md reads/validates `tmp/_reviews_errors/…` everywhere → core pipeline path mismatch (review-doc is the correct reference impl). **S** — *confirmed by two auditors; the nit flagged in the ultracode spec.*
- **[reliability]** `review-doc` carry-forward (`prompts/reviewer.md:107-120` + `SKILL.md:318`) re-emits *fixed* criticals as open (no `status` field) → `pre_fix_criticals>0` blocks the zero-critical early exit → false "Issues Found" at max-iterations on a fully-fixed doc. **L**
- **[robustness]** `review-code` `--run-id` half-wired: prompts + Output Artifacts/Terminal show unprefixed paths → two concurrent runs collide on `review-code.json`. **M**
- **[robustness]** `review-code/SKILL.md:179` synthetic regression criticals omit schema-required `location`/`problem`/`suggested_fix` (schema is `additionalProperties:false`) → validation crash. **S**
- **[robustness]** `review-code/SKILL.md:31-38` positional detection (`isdigit and len<=6`) misreads all-numeric refs/6-char digit SHAs as commit counts. **S**
- **[robustness]** `review-doc/agents/codebase-fact-checker.md:78` `fact_check_accuracy` divides by zero when a doc has no verifiable claims → NaN mis-drives status. Set 100 when total=0. **S**
- **[reliability]** fact-checker line-offset thresholds contradict (`:27` ">5 flagged" vs `:88` "3-5 = partially" + step-3 flags all non-ACCURATE). **S**
- **[robustness]** `review-doc` has no reviewer-JSON validation/retry (review-code does) → malformed reviewer output silently mis-handled. **M**
- **[consistency]** `review-doc` Terminal/Summary print "Fact-check: 0/0 claims (100%)" on the `--fact-check false` default path. **S**
- **[reliability]** `document-for-ai/references/doc-templates.md:18` dangling "§4.9 in the spec" ref (template is in SKILL.md); `tech-stacks.md:106` stale OR-probe naming an unloaded tool vs SKILL.md's 3-step AND probe; `--symbol-scope all` (SKILL.md:304,335) undocumented in help; HUMANIZE multi-file writes flat `docs/tmp/{basename}` → silent overwrite on basename collision. **S each**

### convention-enforcer / api-contract-guard / test-audit / changelog / session-handoff
- **[reliability]** generated Python tests named `*.test.py` → pytest never collects them (plugin's own `test-audit/tech-stacks.md` documents `test_*.py`) → enforcement output is INERT on Python (both convention-enforcer & api-contract-guard). **S**
- **[robustness]** generated Node tests `import { glob } from 'glob'` — undeclared dep → import fails, tsc-validate "skips with warning" → no artifact. Use `fs.globSync`. **M**
- **[reliability]** `api-contract-guard/references/contract-test-templates.md` `resolvesToModule` references undefined `fsSubpath` (var is `subpath`) → `ReferenceError` on the exact monorepo bypass it should catch; also double-dots the path. **S**
- **[reliability]** `convention-enforcer/SKILL.md:Step 4` substitutes only `{stack}/{scope}/{exclusions}` but the agent prompt also contains `{di_patterns…}`/`{di_detection…}`/`{endpoint_detection…}` → 2 of 7 categories ship literal `{…}` scan instructions. **S**
- **[reliability]** `convention-enforcer/references/linter-rule-mappings.md` hardcodes camelCase functions/PascalCase classes — never parameterized from the *confirmed* convention → can enforce the opposite of what the user confirmed. **M**
- **[robustness]** `changelog/SKILL.md:Step 2` `%h%x00%s%x00%b%x00%aI` relies on newline record-separator while `%b` contains newlines → multi-line-body commits mis-parse. Add a record terminator / `-z`. **S**
- **[modernization]** `session-handoff/SKILL.md:68,89,100` references a nonexistent "TaskList tool" (should be `TodoWrite`) → the In-Progress branch is dead on current runtimes. **S**
- Others: convention-enforcer sampled-run recompute silently covers only the sample; `.NET dotnet build --no-restore` false-fails; api-contract-guard consumer scan misses `dist/build/coverage` + test files, and Python `_extract_imports` misses relative imports; test-audit has no standalone agent prompt, a dual-source risk score, a frontend-keyed menu whose axis is unused, and an undefined >30K partition for test-reading agents; changelog ingests all bodies; session-handoff SHA parse lacks `rev-parse --verify`. **S–M**

### refactor-to-monorepo / refactor-to-layers / consolidate / scaffold / help
- **[robustness]** `refactor-to-layers` structural-test templates don't do their job: Node globs only `*.ts` (misses `.tsx` → UI layer unscanned); Python layer-match is raw substring (`"api" in "therapist"` → phantom violations); .NET hardcodes `MyApp` namespace + has an empty-assert `[Fact]` + scans `bin/obj`. **S–M**
- **[robustness]** `refactor-to-layers/SKILL.md:Step 1` Node prompt offers Express/NestJS but every reference implements only Fastify → non-Fastify silently uses wrong DI/entrypoint heuristics. **M**
- **[robustness]** `scaffold` expo placeholder resolution points at a spec in the USER's tree (`docs/superpowers/specs/2026-04-16-…`), not shipped in the skill → expo breaks standalone; also `{{{{X}}}}` escape collides with the substitution regex. **M / S**
- **[efficiency]** `scaffold/SKILL.md` (~550 lines) has no progressive disclosure — refresh/migration/multi-layer machinery loads on every invoke incl. `--help`. **M**
- **[robustness]** `consolidate` non-workspace scan is depth-2 only → misses depth-3 layouts (common in .NET) it calls its primary path. **S–M**
- **[reliability]** `help/SKILL.md` stale: `/consolidate <ai|lint>` omits supported `all`; `/scaffold` one-liner says "monorepo (node-fastify-react)" but there are 3 stacks, `--stack` is required, expo is single-package. **S**
- Others: refactor-to-monorepo silent observation cap + sequential large-repo analysis (parallelizable) + `--next-unit` no prior-unit precondition + Node-flavored watch-list applied to all stacks; consolidate SKILL/prompt duplication, "3-step" labeled but 5 steps, TOML multi-line skip; scaffold `--stack` allowlist repeated 5×, TTY-detection ambiguity, array-merge without dedup, expo `--config` undefined. **S–M**

---

## Part 2 — Install portability (correctness when marketplace-installed)
- **[robustness]** NO skill uses `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_SKILL_DIR}`. `scaffold` (6×), `review-code/SKILL.md:195`, `review-doc/SKILL.md:110` hardcode `ai-dev-tools/skills/…` paths. When installed via marketplace, CWD is the user's project → those paths don't resolve. Replace with the documented portable path vars. **M**

---

## Part 3 — Ecosystem modernization (the "4 months moved on" answer; context7 + fable)
- **[manifest]** `plugin.json` has only `name/version/description/author.name` (author name is a placeholder duplicate). Spec supports `keywords`, `license`, `repository`, `homepage`, `$schema`, `author.{email,url}`. Add them (`$schema: https://json.schemastore.org/claude-code-plugin-manifest.json`). **S**
- **[manifest]** `marketplace.json` (157B) missing `$schema`, `owner.email`, marketplace `description`, and per-plugin `description`/`keywords`/`category` → listing shows no description/category. **S**
- **[modernization]** `argument-hint` frontmatter — CONFIRMED a valid SKILL.md field (not command-only). Add to the ~9 arg-taking skills mirroring their USAGE lines → `/` autocomplete surfaces signatures. **S**
- **[modernization]** `allowed-tools` frontmatter — no skill declares it. Scoping (e.g. review/fix agents to Read/Grep/Glob/Write + git-read) converts prose "NEVER run git push/reset --hard" prohibitions into STRUCTURAL constraints — defense-in-depth for the automated fix loops. **M** (must enumerate accurately)
- **[efficiency]** Progressive-disclosure guidance is ~1,800-word SKILL.md cores + references/. Trim the heavy ones (scaffold ~550 lines, review-code ~418) into references/. **M**
- **Explicitly NOT recommended:** (a) `model:` frontmatter on review-code/review-doc — would REVERSE the deliberate session-inheritance design (commits 45b6008/eda4d63). (b) `effort:` frontmatter — exists, but only affects the current turn, not dispatched sub-agents, so it can't replace the `--effort` flag. (c) plugin-level hooks/agents — that's new capability, out of scope.

---

## Part 4 — Cross-skill consistency (highest structural payoff)
- **[consistency]** `--help` splits into 2 format families (9 UPPERCASE `USAGE/FLAGS` vs 4 lowercase `Usage:/Flags:`) + label drift (`PARAMETERS` vs `FLAGS`) + 3 delivery mechanisms (inline `<help-text>`, external loader, `### --help Output` block). Standardize. **M**
- **[consistency]** review-code/review-doc document flags TWICE (4-col table AND `--help` block) — already drifted (`--run-id` "optional (backward compatible)" vs "(default: none)"). Single source. **S–M** *(note: the recent `--effort` add extended both copies.)*
- **[efficiency]** `tech-stacks.md` duplicated 6× (~940 lines) with drift (Python workspace signal already diverges) → extract shared monorepo/platform-detection into top-level `references/`. **M–L**
- **[consistency]** Tool Usage Rules blocks duplicated across 5 prompt files, already drifted — `review-doc/prompts/reviewer.md:157` is MISSING the Bash `$()`/newline guard the other 4 carry → weaker safety. Extract to a shared reference. **S**
- **[consistency]** Transient-output root has 3 conventions (`tmp/`, `docs/tmp/`, `docs/<name>/`) with arbitrary split; durable dirs named after concept (`docs/monorepo-strategy/`) vs skill (`docs/convention-enforcer/`). Document one taxonomy. **M**
- **[consistency]** `--run-id` threaded only through review-code/review-doc/implement; other fan-out skills (convention-enforcer, test-audit, consolidate) can't be run-scoped under orchestration. **M**
- Minor: `subagent` vs `sub-agent`; "clean break/no backward-compat" phrasing varies; error-message style (`Error:` vs "abort with" vs "exit with") — standardize on exact `Error: <msg>` strings. **S each**

---

## Part 5 — Robustness hardening
- **[robustness]** `review-code` flaky/non-deterministic `--verify` flips exit code across baseline/post-fix → oscillating/runaway loops. Run baseline twice, exclude self-disagreeing commands. **M**
- **[reliability]** severity is derived from confidence in both reviewers (`≥80→critical`), collapsing "certainty it exists" and "impact if real" into one axis → inflates `critical_count`, triggers needless fix cycles. Let severity=impact, confidence=certainty (fact-checker already does). **M**
- **[robustness]** deterministic dependency-graph tools (madge/dependency-cruiser for TS, grimp/pydeps for Python, project-graph for .NET) instead of the agent eyeballing coupling/cycles in refactor-* analysis → reproducible scores. **M–L** *(borderline: adds tool deps — flag in brainstorming)*
- **[reliability]** manual free-JSON agent I/O re-parsed heuristically (convention-enforcer, test-audit) → use structured/tool-shaped returns where the runtime supports it. **L**

---

## Part 6 — Efficiency & dogfooding
- **[efficiency]** No repo-level `CHANGELOG.md`; version lives only in `plugin.json`. The plugin SHIPS `changelog-from-commits` but doesn't dogfood it (the BREAKING commit 1976a67 has no changelog record). Run it on itself → documents releases AND proves the skill works. **S–M**
- **[efficiency]** de-dup within references (profiling-log atomicity ×3; `--auto` narrowed algorithm ×3; eslint zone list ×2; scaffold `--stack` list ×5). **S–M**

---

## The meta-finding
Several Part 1 bugs (path drift, missing schema fields, div-by-zero, dead branches, stale help) are exactly what this plugin's **own** `review-code` / `test-audit` / `convention-enforcer` skills exist to catch. Dogfooding the plugin on itself is both a fix path and a proof of value.

## Provenance
5 fable auditors (orchestrate+implement · review/doc · quality-checks · refactor/scaffold · plugin-structure) + context7 (`/anthropics/claude-code` v2.1.89). Raw per-auditor outputs in the session task transcripts.
