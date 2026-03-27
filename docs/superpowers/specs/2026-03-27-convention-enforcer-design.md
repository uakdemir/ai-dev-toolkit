# convention-enforcer — Design Spec

**Date:** 2026-03-27
**Status:** Approved (R4 revisions applied)
**Plugin:** ai-dev-tools
**Skill:** convention-enforcer

---

## Problem Statement

AI agents introduce convention drift because they pattern-match from whatever context is in their window. When conventions are inconsistent — or only documented in READMEs that agents don't read — agents pick randomly, invent new patterns, or follow the most recent code they've seen. This compounds: each drifted file becomes a new source of bad examples for the next agent session.

The result is codebases where error handling, naming, imports, response shapes, and logging are all slightly different per file. Manual review catches some of this, but the same violations recur across sessions because there's no automated enforcement.

## Success Criteria

- Generated linter rules are syntactically valid for their target linter (ESLint, Ruff, or Roslyn/.editorconfig) — validated by a post-generation parse check (see Step 9a)
- Generated structural tests are syntactically valid — validated by a compile-only / syntax-only check (see Step 9a)
- Violations report includes file path for every violation, plus line number where applicable (file-level violations like naming and file organization omit line numbers)
- Core agent detects and reports on all 7 fixed categories for the detected stack
- Discovery agent runs successfully and returns findings in the correct output format. Zero findings is a valid outcome — discovery success is judged by evidence quality (any reported pattern must appear in 3+ files with a clear violation set), not by minimum count.
- User confirmation checkpoint presents before any enforcement is generated
- Re-running the skill on an already-hardened codebase produces no new enforcement artifacts (idempotent — see Previous Run Detection)

## Scope Boundaries

**What this skill DOES:**
- Scan codebase for convention patterns across 7 fixed categories + open-ended discovery
- Present detected conventions for user confirmation
- Generate structural tests into `tests/structural/`
- Modify existing linter config files with new rules
- Generate a violations report listing current drift
- Remove previously-generated convention-enforcer artifacts on "Start fresh" (test files with markers, tagged linter rules/metadata, violations report) — with user confirmation of what will be removed

**What this skill DOES NOT do:**
- Auto-fix violations (report only — user owns the fixes)
- Install linter plugins or test runner dependencies
- Modify CI/CD pipelines
- Generate custom linter rules (only configures existing built-in/plugin rules)
- Run the generated tests
- Generate linter rules for "Other" stacks (structural tests only — see "Other" Stack Handling)

**Post-skill manual steps:**
1. Install any linter plugins referenced by generated rules (if not already present)
2. Fix reported violations (manually or with linter auto-fix)
3. Add generated structural tests to CI if not already covered
4. Run structural tests — tests will fail for files listed in the violations report, confirming they correctly detect drift. Fix violations to make tests pass.

**Plugin registration:** `plugin.json` description should be updated to include convention enforcement when this skill is implemented.

---

## Core Concept

One skill, two enforcement perspectives — similar to how a code review tool dispatches separate agents for security, performance, and style, each with a different lens. The user invokes `convention-enforcer`, it dispatches parallel agents, and each hardens the codebase from its own angle. The user doesn't pick the mechanism — they pick which conventions to enforce, and the skill routes to the right tool.

## Approach

**Two-phase, scan-first enforce-second (Approach A):**

- Phase 1 — Analysis: parallel agents scan, findings merged and presented
- Phase 2 — Generation: enforcement artifacts produced for user-selected findings

User checkpoints between phases ensure nothing is enforced without explicit approval.

---

## SKILL.md Workflow

### Frontmatter

```yaml
name: convention-enforcer
description: "Use when the user wants to enforce coding conventions, prevent AI agent drift, harden linter rules, generate convention-based structural tests, detect naming/error handling/import/logging inconsistencies, or analyze a codebase for convention violations — even if they don't use the exact skill name."
```

### Numbered Steps

1. **Tech Stack Detection** — auto-detect stack (including linter config, test framework, and sub-framework scans), run mismatch gate if needed
2. **Scope Detection** — walk up from CWD to find project root, determine monorepo boundaries, scope to CWD or user-specified package
3. **Previous Run Detection** — scan for existing convention-enforcer artifacts (see section below)
4. **Dispatch Agents** — launch Core Agent and Discovery Agent in parallel using the Agent tool (two parallel Agent invocations in a single message)
5. **Merge Findings** — combine results, deduplicate (core takes priority, all overlap filtering here)
6. **Present Detected Conventions** — show dominant pattern per category, user confirms/corrects/skips each
7. **Present Violations** — for confirmed categories, show ranked violations, user picks which to harden
8. **Present Routing Plan** — show recommended enforcement mechanism per finding, user can override
9. **Generate Artifacts** — produce structural tests, modify linter config, generate violations report
9a. **Validate Artifacts** — parse modified linter config to verify syntax; run compile-only / syntax-only check on generated test files (e.g. `npx tsc --noEmit`, `python -m py_compile`, `dotnet build --no-restore`). If validation fails, fix or warn before proceeding.
10. **Review Checkpoint** — user reviews generated artifacts via git diff; user can accept all, revert selected artifacts, or discard the entire run

### Progressive Disclosure Schedule

| Step | Reference file loaded |
|---|---|
| Step 1 (Tech Stack Detection) | `references/tech-stacks.md` |
| Step 4 (Dispatch Agents) | `references/agent-prompts.md` |
| Step 9 (Generate Artifacts) | `references/convention-test-templates.md` |
| Step 9 (Generate Artifacts) | `references/linter-rule-mappings.md` |

### Reference Files (to be created during implementation)

- `references/tech-stacks.md` — stack detection heuristics, linter config paths, test runner, DI patterns per stack. This skill's own version, not shared with other skills.
- `references/agent-prompts.md` — full prompt instructions for Core Agent and Discovery Agent invocations, including output format requirements and category-specific scan instructions. **Deferred to implementation planning.**
- `references/convention-test-templates.md` — structural test templates per convention category per stack (similar to refactor-to-layers' `structural-test-templates.md`). **Deferred to implementation planning.**
- `references/linter-rule-mappings.md` — mapping from convention categories to specific built-in linter rules per stack, including format-specific insertion rules (ESLint flat vs legacy, Ruff TOML sections, .editorconfig file-glob sections). Only built-in/plugin rules, not custom rules. **Deferred to implementation planning.**

---

## Workflow

### Phase 1 — Analysis

```
User invokes convention-enforcer
        |
        |--- Step 1: Tech stack auto-detection (incl. linter config + test framework scan)
        |       |
        |       v
        |    Mismatch gate (see Section: Tech Stack Support)
        |       |
        |       v
        |--- Step 2: Scope detection (walk up to project root, monorepo check)
        |       |
        |       v
        |--- Step 3: Previous run detection (scan for existing artifacts)
        |       |
        |       v
        +---> Step 4a: Core Agent (7 fixed categories, receives detected stack)
        |                                              parallel
        +---> Step 4b: Discovery Agent (open-ended scan, receives detected stack)
        |
        v
   Step 5: Merge findings (core priority, all overlap filtering here)
        |
        v
   Step 6: Present detected dominant patterns per category
        |
        v
   USER CHECKPOINT: Confirm/correct/skip each convention
        |
        v
   Step 7: Present violations for confirmed categories, ranked
        |
        v
   USER CHECKPOINT: Pick which findings to harden
```

### Phase 2 — Generation

```
   Step 8: Present routing plan per finding
        |
        v
   USER CHECKPOINT: Review/override enforcement mechanism per finding
        |
        v
   Step 9: Generate artifacts + violations report
        |
        v
   Step 9a: Validate artifacts (parse linter config, syntax-check tests)
        |
        v
   Step 10: USER CHECKPOINT: Review generated artifacts (git diff)
        |
        v
   Accept all / Revert selected / Discard run
```

---

## Core Agent — 7 Fixed Categories

The core agent checks these categories in every run. For each, it detects the **dominant pattern** (>50% of scanned files — see Dominant Pattern Rules) and presents it for user confirmation before treating it as the convention.

### 1. Error Handling

- **Scans for:** error/exception class hierarchy, try/catch patterns, error propagation style, custom error types vs raw throws
- **Dominant pattern:** most-used error base class + most common handling idiom
- **Violations:** raw `throw new Error()` / bare `except:` / untyped `catch` when project has a custom error base class, swallowed catches, inconsistent error shapes
- **Default routing:** Hybrid (structural test for class hierarchy, linter rule for catch patterns)

### 2. Naming Conventions

- **Scans for:** function/method names, class names, file names, variable names, constants
- **Detects per-scope:** files use kebab-case? classes use PascalCase? functions use camelCase / snake_case?
- **Violations:** anything breaking the majority pattern within its scope
- **Default routing:** Linter rule

### 3. Import Ordering

- **Scans for:** import grouping/ordering, relative vs absolute imports, import statement structure
- **Dominant pattern:** most common import grouping and ordering style
- **Violations:** inconsistent import ordering, mixed relative/absolute where one dominates
- **Default routing:** Linter rule

### 4. DI / Dependency Patterns

- **Scans for:** DI registration patterns, constructor injection vs service locator, hardcoded dependencies
- **Dominant pattern:** most common DI approach
- **Violations:** hardcoded dependencies, reaching into internal paths, inconsistent DI registration
- **Default routing:** Structural test

### 5. API Response Shapes

- **Scans for:** response envelope structure (e.g. `{ data, error, status }` vs raw returns), consistent status code usage, error response format
- **Dominant pattern:** most common envelope shape across endpoints
- **Violations:** endpoints returning a different shape
- **Default routing:** Structural test

### 6. File Organization

- **Scans for:** where files of each type live (controllers in `/api`, services in `/services`, etc.), co-location patterns, index barrel files
- **Dominant pattern:** directory-to-purpose mapping
- **Violations:** files placed outside their expected directory
- **Default routing:** Structural test

### 7. Logging

- **Scans for:** logger instantiation (project logger vs raw console.log / print() / Console.WriteLine), log level usage, structured vs unstructured, context inclusion
- **Dominant pattern:** most common logger + call style
- **Violations:** raw console/print calls, missing log levels, unstructured strings
- **Default routing:** Linter rule

### Dominant Pattern Rules

A pattern is **dominant** if it appears in >50% of scanned files relevant to that category. If no pattern exceeds 50%, the category enters the **tie scenario**: present the top two patterns to the user and ask which to enforce. If the user skips, mark the category as "no convention detected."

**Per-category file scope:** `frequency_percent` is computed over files relevant to the category, not all source files. API Response Shapes uses endpoint files, DI Patterns uses DI registration files, Error Handling uses files with try/catch blocks. Categories that apply to all files (Naming, Import Ordering, File Organization, Logging) use all source files as the denominator.

**Multi-scope categories:** For categories with multiple independent scopes (e.g., Naming Conventions checks file names, class names, and function names separately), the >50% threshold applies independently per scope. Each scope is presented as a separate sub-finding at the user confirmation checkpoint.

### User Confirmation Checkpoint (Step 6)

After scanning, the core agent presents each detected convention:

```
Category: Error Handling
Detected convention: All errors extend AppError, caught at middleware level (87% of files)
  > Correct, enforce this
  > Wrong, the convention should be [X]
  > Skip this category
```

This prevents locking in a bad pattern. Also handles mid-migration codebases where the old pattern still outnumbers the new one — the user can say "the convention should be Y" even if Y is currently the minority.

### Violation Selection Checkpoint (Step 7)

After conventions are confirmed, present violations grouped by category:

```
Confirmed conventions with violations:

1. Error Handling (14 violations, severity: high)
   Top files: src/services/auth.ts:42, src/api/users.ts:88, ...
   > Harden  |  Skip

2. Naming Conventions (8 violations, severity: medium)
   Top files: src/utils/dataHelper.ts (file name), src/api/Routes.ts (file name), ...
   > Harden  |  Skip

3. [Discovery] Config access via raw env vars (5 violations, severity: medium)
   Top files: src/services/email.ts:12, src/services/payment.ts:7, ...
   > Harden  |  Skip
```

Selection is per-category, not per-individual-violation. The user picks which categories to generate enforcement for.

### Routing Override Checkpoint (Step 8)

After the user picks which findings to harden, present the recommended enforcement mechanism for each:

```
Routing plan:

1. Error Handling → structural test + linter rule (hybrid)
2. Naming Conventions → linter rule
3. [Discovery] Config access → structural test

Override any? (Enter number to change, or confirm to proceed)
```

The user can override per-finding before generation begins.

---

## Discovery Agent

Runs in parallel with the core agent. Scans for project-specific conventions outside the 7 fixed categories using **LLM-powered pattern recognition**.

### What It Looks For

- Decorator/attribute usage patterns (e.g. every route handler has `@authenticate`)
- Middleware/filter chains (consistent ordering or composition)
- Database query patterns (ORM-only, repository pattern, raw SQL placement)
- Configuration access (always through config service, never raw env vars)
- Event/message naming conventions (dot-notation, past tense, prefixes)
- Test organization patterns (setup/teardown conventions, fixture patterns, mock strategies)
- Comment/docstring conventions (JSDoc on public methods, inline comment style)

### Detection Method

The discovery agent uses the AI's own pattern recognition on source code — no external similarity tool is required. The scanning strategy:

1. Read directory structure to understand project layout
2. Sample files across different directories — at least 3 per directory with source files, selected evenly distributed by modification date (oldest, median, newest) to capture both legacy and recent patterns. When a directory has fewer than 3 source files, include all of them.
3. Identify recurring structures through language understanding — a "pattern" is any code shape (decorator, function signature, return type, comment format, etc.) that appears consistently across 3+ files
4. For each discovered pattern, count frequency and list violating files

**Note:** Overlap filtering with core categories is handled entirely in the Merge Logic step, not by the discovery agent itself. The discovery agent reports everything it finds.

### Output

Same format as core agent (see Agent Output Format) — each discovered pattern presented with detected convention, frequency, and violation count. Goes through the same user confirmation checkpoint.

---

## Agent Output Format

Both agents must return findings in this structured format so that merge logic, severity ranking, and checkpoints can operate on consistent data:

```
{
  category: string,                // e.g. "Error Handling", "Config access via raw env vars"
  convention_description: string,   // human-readable description of the detected convention
  dominant_pattern: string,         // code-level description of what conforming code looks like
  frequency_percent: number,        // % of relevant files following this pattern
  files_total_in_scope: number,     // total files in relevant subset (denominator)
  suggested_severity: "high" | "medium" | "low",  // core: from Severity Model; discovery: agent's assessment
  suggested_routing: "structural_test" | "linter_rule" | "both",  // core: from Routing table; discovery: agent's assessment
  scope_description: string | null, // what constitutes the file subset, e.g. "route handler files", "all source files"
  files_analyzed: [                 // per-file pattern data (enables re-scan on user correction)
    { file: string, pattern_found: string, conforms: boolean }
  ],
  violations: [
    { file: string, line: number | null, expected: string, found: string }
    // line is null for file-level violations (naming, file organization)
  ],
  source: "core" | "discovery"
}
```

**Why per-file data:** When the user corrects a convention at Step 6, the orchestrator recomputes violations from `files_analyzed` using the user's stated convention as the baseline — no agent re-dispatch needed. If the user specifies a pattern not found in any scanned file, all files become violations with a note: "Convention not yet present in codebase — all files reported as violations."

---

## Merge Logic (Step 5)

When combining core agent and discovery agent findings:

1. **Core findings take priority** — core agent results are included as-is
2. **Overlap check** — a discovery finding overlaps with a core category if its `category` and `convention_description` fields combined match **2 or more** keywords from any single core category's keyword list. Single-keyword matches are ignored to avoid false positives from common English words. Overlap keywords per core category:
   - Error Handling: exception, throw, catch, try, fault, error-handling, error-class
   - Naming: camelCase, snake_case, PascalCase, kebab-case, naming-convention
   - Import Ordering: import-order, require-order, import-grouping, absolute-import, relative-import
   - DI / Dependency: inject, dependency-injection, provider, service-locator, IoC, DI-registration
   - API Response: response-envelope, status-code, response-shape, endpoint-return
   - File Organization: directory-structure, folder-convention, co-location, file-placement
   - Logging: logger, structured-logging, log-level, console-log
3. **Discard overlapping discovery findings** — if 2+ keyword overlap is detected, the discovery finding is dropped
4. **Append remaining** — non-overlapping discovery findings are appended after core findings, labeled as `[Discovery]`

**User corrections at Step 6 do not re-trigger merge logic.** They only affect the violation list for the corrected category. Discovery findings that passed the overlap filter remain.

---

## Severity Model

Each convention category is assigned a severity level based on the impact of drift:

| Severity | Level | Criteria | Core categories |
|---|---|---|---|
| High | 3 | Causes runtime errors, security issues, or breaks consumers | Error Handling, DI / Dependency Patterns, API Response Shapes |
| Medium | 2 | Causes confusion, inconsistency, or slows development | Naming, Import Ordering, File Organization, Logging |
| Low | 1 | Cosmetic or stylistic | (Discovery agent findings only, when appropriate) |

**Ranking formula:** `score = severity_level x violation_count`

Findings are presented in descending score order. Discovery agent findings default to Medium severity unless the agent's analysis indicates otherwise.

---

## Enforcement Routing

After user confirms conventions and picks findings to harden, Step 8 presents the recommended enforcement mechanism per finding:

| Core category | Default enforcement | Rationale |
|---|---|---|
| Error Handling | Both (hybrid) | Structural test for class hierarchy, linter rule for catch patterns |
| Naming Conventions | Linter rule | Linters have built-in naming rules |
| Import Ordering | Linter rule | Linters have built-in import sorting |
| DI / Dependency Patterns | Structural test | Cross-file, linters can't express |
| API Response Shapes | Structural test | Needs cross-endpoint analysis |
| File Organization | Structural test | Cross-file directory checking |
| Logging | Linter rule | Single-file pattern (no-console, etc.) |

For discovery findings, the skill recommends based on the `suggested_routing` field in the agent output (cross-file → structural test, single-file → linter rule). If a discovery finding is overridden to "linter rule" at Step 8 and no built-in rule mapping exists, warn: "No known linter rule for this convention. Falling back to structural test." Discovery findings can only be routed to linter rules if a mapping is available in `references/linter-rule-mappings.md`; otherwise structural test is the only generation option.

**Hybrid case mechanics:** For hybrid cases, the skill generates both artifacts and presents them together in the review checkpoint. The user can accept both, accept one and skip the other, or skip entirely.

The user can override any routing at Step 8 before generation begins.

---

## Previous Run Detection (Step 3)

Before dispatching agents, check for existing convention-enforcer artifacts:

1. Scan `tests/structural/` for files matching `convention-*.test.*` with convention-enforcer marker comments
2. Scan linter config for comments containing `convention-enforcer:` or (for JSON configs) a `_conventionEnforcer` metadata key
3. Check for existing `docs/convention-enforcer/violations-report.md`

If previous artifacts exist, present options:

```
Found existing convention-enforcer artifacts:
  - tests/structural/convention-error-handling.test.ts (enforcing: error-handling)
  - tests/structural/convention-naming.test.ts (enforcing: naming)
  - .eslintrc.json: 3 convention-enforcer rules

Options:
  > Re-analyze all (existing artifacts regenerated for any re-confirmed category)
  > Skip already-enforced categories (only scan for new conventions)
  > Start fresh (remove existing artifacts and re-analyze everything)
```

**Option mechanics:**

- **Re-analyze all:** Full run. At Step 9, existing convention-enforcer artifacts for re-confirmed categories are overwritten (matched by marker comment category ID). New categories create new artifacts.
- **Skip already-enforced:** Extract enforced category names from marker comments in detected artifacts. Pass as exclusion list to both agents via prompt context. In Step 5 merge logic, drop any finding whose category matches an excluded name. If no un-enforced categories remain for the core agent, skip core agent dispatch entirely. Discovery agent runs its full scan regardless.
- **Start fresh:** Before proceeding, show user exactly which artifacts will be removed. Only remove entries with convention-enforcer marker comments/metadata. Then run a full analysis from scratch.

---

## Output Artifacts

### 1. Structural Tests → `tests/structural/`

- Append to an existing `tests/structural/convention-{category}.test.*` file if one exists with a convention-enforcer marker comment. Otherwise create a new file.
- Never append to test files not generated by convention-enforcer.
- Naming pattern: `convention-{category}.test.{ext}` for JS/TS and Python (e.g. `convention-error-handling.test.ts`, `convention-naming.test.py`). For .NET, follow PascalCase convention: `Tests/Structural/Convention{Category}Tests.cs` (e.g. `Tests/Structural/ConventionErrorHandlingTests.cs`).
- Each test has a descriptive name: `"all errors must extend AppError"`, `"API responses use standard envelope shape"`
- Each generated test block is preceded by a stable marker comment using the target language's comment syntax:
  - JS/TS/C#: `// --- Generated by convention-enforcer: {category} ---`
  - Python: `# --- Generated by convention-enforcer: {category} ---`
- The category name (not date) is the dedup key, enabling idempotent re-runs.

### 2. Linter Config → Modified In Place

- Rules appended to the project's existing linter config file
- Only built-in or well-known plugin rules — no custom rule authoring
- **Marker strategy for dedup on re-runs:**
  - For JS/TS config files (`.eslintrc.js`, `.eslintrc.cjs`, `eslint.config.*`): inline comment `// convention-enforcer: {category}`
  - For JSON config files (`.eslintrc.json`): add `"_conventionEnforcer": { "{category}": ["rule1", "rule2"] }` metadata key (ignored by ESLint). Previous Run Detection checks this key for JSON configs.
  - For Ruff/TOML: inline comment `# convention-enforcer: {category}`
  - For .editorconfig: inline comment `# convention-enforcer: {category}`
- Stack-specific insertion:
  - **ESLint:** detect flat config vs legacy format; add to the appropriate `rules` object
  - **Ruff:** add rule codes to the `extend-select` list under `[tool.ruff.lint]`
  - **.editorconfig:** place rules under the appropriate file-glob section (e.g. `[*.cs]`); create section if needed
- Before writing, check for existing rules that conflict — warn user if detected
- Full format-specific insertion details in `references/linter-rule-mappings.md`

### 3. Violations Report → `docs/convention-enforcer/violations-report.md`

- Grouped by category
- Each violation: file path, line number (where applicable — omitted for file-level violations), expected vs found
- Summary at top: total violations per category, severity ranking
- Point-in-time snapshot — regenerated on each run
- Placed in `docs/convention-enforcer/` so repeated runs can be diffed via git
- Header note: "Generated snapshot. Regenerate by running convention-enforcer."
- Should be committed to version control for diff tracking

---

## Tech Stack Support

Auto-detection with a mismatch gate. Uses its own `references/tech-stacks.md` (not shared with other skills), containing convention-enforcer-specific content: linter config file paths, rule syntax per stack, structural test runner, DI patterns, and detection heuristics.

### Auto-Detection Algorithm

1. Scan project root for detection files: `package.json`, `pyproject.toml`, `.csproj` / `.sln`
2. Scan for linter config files (`.eslintrc.*`, `eslint.config.*`, `ruff.toml`, `.editorconfig`) and test frameworks (`vitest.config.*`, `jest.config.*`, `pytest.ini`, `xunit.runner.json`)
3. **One stack match** → proceed to sub-framework detection (see below)
4. **Zero stack matches** → prompt user to specify (see "Other" stack below)
5. **Multiple stack matches** → trigger mismatch gate
6. Cross-check linter and test framework findings against detected stack — mismatch gate on inconsistencies

### Sub-Framework Detection

After identifying the language/platform, detect the specific framework via dependency analysis:

- **Node.js:** Check `package.json` dependencies for `fastify`, `express`, `@nestjs/core`, `@hapi/hapi`, `koa`. Confirm: "Detected Node.js + Fastify. Correct?"
- **Python:** Check `pyproject.toml` / `requirements.txt` for `fastapi`, `django`, `flask`, `starlette`. Confirm: "Detected Python + FastAPI. Correct?"
- **.NET:** Check `.csproj` package references and `Program.cs` / `Startup.cs` patterns for MVC controllers vs Minimal APIs. Confirm: "Detected .NET MVC. Correct?"

If the detected sub-framework matches a supported stack profile (Fastify, FastAPI, .NET MVC), use that profile's DI patterns and convention templates. If the sub-framework is not in the supported list (e.g., Express, Django, Flask), the skill still proceeds but with **reduced category coverage**:

- Categories that are framework-agnostic (Naming, Import Ordering, File Organization, Logging, Error Handling) work normally
- DI / Dependency Patterns: scan for generic DI indicators (constructor injection, service locator patterns) but skip framework-specific DI checks. Warn: "DI analysis is generic — no {framework}-specific DI profile available."
- API Response Shapes: scan for response patterns but skip framework-specific envelope expectations. Warn: "API analysis is generic — no {framework}-specific response profile available."

### Supported Stacks

**Node.js + Fastify**
- Linter: ESLint (`.eslintrc.*` or `eslint.config.*`)
- Structural tests: Vitest/Jest (whichever project uses)
- Detection: `package.json` presence
- DI patterns: `@fastify/awilix` or `fastify.decorate()` for manual wiring

**Python + FastAPI**
- Linter: Ruff (`ruff.toml` or `pyproject.toml [tool.ruff]`)
- Structural tests: pytest
- Detection: `pyproject.toml`
- DI patterns: FastAPI `Depends()`, `dependency-injector` container

**.NET MVC**
- Linter: Roslyn analyzers + `.editorconfig`
- Structural tests: xUnit/NUnit (whichever project uses)
- Detection: `.csproj` / `.sln`
- DI patterns: `IServiceCollection` (built-in `Microsoft.Extensions.DependencyInjection`)

### "Other" Stack Handling

If auto-detection fails or the user's framework isn't listed, prompt:

```
Stack not recognized. Please provide:
  1. Language/framework?
  2. Linter tool and config file path?
  3. Test runner?
  4. DI/dependency injection pattern used (if any)?
```

The skill proceeds with user-provided info. Structural test templates fall back to language-generic patterns. **Linter rule generation is skipped for "Other" stacks** — only structural tests are produced. Explain: "Linter rules are only generated for supported stacks (Node.js/ESLint, Python/Ruff, .NET/Roslyn). For your stack, add linter rules manually based on the violations report."

### Mismatch Gate

After auto-detection (including linter config and test framework scans), cross-check for inconsistencies:

- Multiple stacks detected in same root
- Linter config doesn't match detected stack
- Multiple linters for the same concern (e.g. ESLint + Biome)
- Test framework ambiguity (e.g. Jest + Vitest both installed)

On any mismatch, the skill **stops and waits for user input** — no guessing:

```
Warning — Stack mismatch detected:
  Found: package.json (Node.js) + pyproject.toml (Python)

  Is this a monorepo/polyglot project?
  Which stack should we target for this run?
```

---

## Scope Detection

After tech stack detection, determine the analysis scope:

- **Single-project repo:** Walk up from CWD to find the project root (directory containing the detected stack marker file, e.g. `package.json`). Scan from that root.
- **Monorepo detected** (workspace config files found: `pnpm-workspace.yaml`, `lerna.json`, `turbo.json`, `nx.json`, `rush.json`, `workspaces` field in root `package.json`, `.moon/workspace.yml`, `pants.toml`, `Directory.Build.props` (.NET), or equivalent per stack): v1 scopes to the current working directory only. Present to user: "Monorepo detected. Scanning from CWD: `[path]`. Convention analysis scopes to this package only."
- Monorepo-wide convention analysis (cross-package consistency) is deferred to a future version.

---

## Relationship to Other Skills

### refactor-to-layers

Both skills write to `tests/structural/`. Coexistence rules:

- **File naming:** refactor-to-layers uses `layer-boundaries.test.ts` (JS/TS), `test_layer_boundaries.py` (Python), or `LayerBoundaryTests.cs` (.NET). Convention-enforcer uses `convention-{category}.test.{ext}` (JS/TS/Python) or `Convention{Category}Tests.cs` (.NET). No collision — different prefixes.
- **Marker comments:** refactor-to-layers uses `// --- Generated by refactor-to-layers ---`. Convention-enforcer uses `{comment-char} --- Generated by convention-enforcer: {category} ---` (with category as stable ID, no date). Different format but both identifiable by skill name prefix.
- **Independence:** Convention-enforcer tests do not import or reference layer definitions. The two test sets are complementary but independent.
- **Shared directory:** Running both skills produces a coherent, combined structural test suite in `tests/structural/`.

### implement-plan

Convention-enforcer is not invoked by implement-plan. They serve different purposes: implement-plan executes file moves and rewrites; convention-enforcer hardens code-level patterns.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| No source files found | Stop with message: "No source files found for {stack}. Check your CWD and stack detection." |
| No dominant pattern detected (no pattern >50%) | Present the top two patterns to user, ask which to enforce. If user skips, mark category as "no convention detected." |
| Linter config file missing | Warn: "No {linter} config found. Skipping linter rule generation. Only structural tests will be produced." |
| Linter config malformed / unrecognized format | Warn: "Could not parse {config_file}. Skipping linter rule generation for this config." |
| Structural test directory `tests/structural/` missing | Create it. This is safe — it's a new directory with new files. |
| User corrects convention to minority pattern | Recompute violations from per-file data in agent output using user's stated convention as baseline. No agent re-dispatch needed. |
| User states convention not present in codebase | All files become violations. Note: "Convention not yet present in codebase — all files reported as violations." |
| Zero violations found for a confirmed convention | Report: "Convention '{name}' is consistently followed. No enforcement needed." Skip artifact generation. |
| Discovery agent finds zero additional patterns | Report: "No additional project-specific conventions found beyond the 7 core categories." |
| Large codebase (>50K LOC) | Sample files evenly distributed by modification date. Core agent: up to 100 files per category. Discovery agent: up to 50 files across directories. Report as approximate: "Sampled N of M files. Approximately X% follow pattern Y (sampling may affect accuracy)." |
| Linter rule conflicts with existing rule | Warn: "Rule {rule} conflicts with existing {existing_rule}. Skip or override?" |
| One agent fails | Use the other agent's results. Report failed agent's categories as "analysis failed." |
| User rejects artifacts at Step 10 | **Accept all:** commit generated artifacts. **Revert selected:** delete rejected convention-enforcer test files (identified by marker), remove rejected linter rules (identified by marker/metadata key), keep accepted ones. **Discard run:** `git checkout` all modified files, delete all newly created convention-enforcer files. |
| Validation fails at Step 9a | Show validation errors. Attempt auto-fix (e.g. syntax correction). If unfixable, skip that artifact with warning and proceed to Step 10 with remaining artifacts. |

---

## Parallel Agent Dispatch

**Preferred:** The Core Agent and Discovery Agent are dispatched using the **Agent tool with two parallel invocations in a single message**. Each agent receives the detected stack, scope, and output format requirements as context. Results are returned independently and merged in Step 5.

**Sequential fallback:** If the runtime does not support sub-agents or parallel tool dispatch (e.g., policy restrictions, older Claude Code versions), the skill runs both analyses sequentially within a single agent context: core categories first, then discovery scan. The output format and merge logic remain identical — the only difference is execution order, not architecture.

If one agent (or sequential pass) fails, the other's results are still used. A failed agent's categories are reported as "analysis failed" in the findings.

---

## Future: Issues Log (v2)

An append-only log at `tmp/issues-found-refactoring.md` that accumulates real drift patterns over time. In v2, the analysis phase reads this log and:

- Ranks findings by real-world frequency (not just code analysis)
- Routes recurring issues to the most effective enforcement mechanism
- Tracks whether enforcement is actually reducing drift across runs

This turns the skill from reactive ("analyze what's here now") into adaptive ("learn from what keeps going wrong").

---

## Design Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Single skill vs two skills | Single skill, two agents | User shouldn't need two invocations to harden conventions |
| Output types | Structural tests + linter rules | Different enforcement mechanisms for different convention types |
| Analysis approach | Hybrid (auto-scan + user picks) | Skill finds drift, user decides what to enforce |
| Agent execution | Parallel (core + discovery) via Agent tool | Independent scans, standard Claude Code parallel dispatch |
| Core categories | 7 (split Import Ordering from DI Patterns) | Different severity levels and enforcement mechanisms |
| Structural test location | `tests/structural/` (same as refactor-to-layers) | Unified structural test suite |
| Linter config modification | Direct modification | Hardening tool — enforcement must actually happen |
| Linter rule scope | Built-in/plugin rules only, no custom rules | Custom rule authoring is out of scope for v1 |
| "Other" stack linter rules | Skip — structural tests only | Prevents hallucinated rules for unfamiliar linters |
| Convention detection | Majority (>50%), user-confirmed | Prevents locking in bad patterns; handles mid-migration codebases |
| Violations | Report only, no auto-fix | User should understand and own the fixes |
| Stack detection | Auto-detect with mismatch gate | Stop and ask on ambiguity, never guess |
| Monorepo scope | CWD only in v1 | Cross-package analysis deferred to future version |
| Monorepo detection | Workspace config files, not just detection file counts | Prevents false positives from non-monorepo projects with multiple package.json |
| Discovery agent method | LLM-powered pattern recognition | No external similarity tool needed; leverages AI's language understanding |
| Overlap filtering | Merge logic only, not discovery agent | Single responsibility — discovery reports everything, merge deduplicates |
| Marker comments | Category-based stable ID, no date | Enables idempotent re-runs with dedup by category |
| Agent output format | Structured with per-file data | Enables user corrections without re-dispatching agents |
| Sub-framework detection | Dependency scan + user confirmation | Prevents wrong DI/API profile; graceful degradation for unsupported frameworks |
| Violation line numbers | Optional (null for file-level) | File naming and organization violations have no meaningful line number |
| Artifact validation | Parse/syntax check after generation (Step 9a) | Success criteria require syntactic validity; git diff alone can't verify |
| Review checkpoint outcomes | Accept all / revert selected / discard | User must be able to reject artifacts after reviewing the diff |
| Discovery success | Quality-based, zero findings valid | Minimum count incentivizes false positives |
| Agent dispatch | Parallel preferred, sequential fallback | Skill must work in runtimes without sub-agent support |
