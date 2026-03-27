# convention-enforcer — Design Spec

**Date:** 2026-03-27
**Status:** Approved (R1 revisions applied)
**Plugin:** ai-dev-tools
**Skill:** convention-enforcer

---

## Problem Statement

AI agents introduce convention drift because they pattern-match from whatever context is in their window. When conventions are inconsistent — or only documented in READMEs that agents don't read — agents pick randomly, invent new patterns, or follow the most recent code they've seen. This compounds: each drifted file becomes a new source of bad examples for the next agent session.

The result is codebases where error handling, naming, imports, response shapes, and logging are all slightly different per file. Manual review catches some of this, but the same violations recur across sessions because there's no automated enforcement.

## Success Criteria

- Generated linter rules are syntactically valid for their target linter (ESLint, Ruff, or Roslyn/.editorconfig)
- Generated structural tests compile/run without syntax errors against the detected dominant pattern
- Violations report includes file path and line number for every violation
- Core agent detects and reports on all 6 fixed categories for the detected stack
- Discovery agent identifies at least 1 additional convention in a project with >20 source files
- User confirmation checkpoint presents before any enforcement is generated
- Re-running the skill on an already-hardened codebase produces no new enforcement artifacts (idempotent)

## Scope Boundaries

**What this skill DOES:**
- Scan codebase for convention patterns across 6 fixed categories + open-ended discovery
- Present detected conventions for user confirmation
- Generate structural tests into `tests/structural/`
- Modify existing linter config files with new rules
- Generate a violations report listing current drift

**What this skill DOES NOT do:**
- Auto-fix violations (report only — user owns the fixes)
- Install linter plugins or test runner dependencies
- Modify CI/CD pipelines
- Generate custom linter rules (only configures existing built-in/plugin rules)
- Run the generated tests

**Post-skill manual steps:**
1. Install any linter plugins referenced by generated rules (if not already present)
2. Fix reported violations (manually or with linter auto-fix)
3. Add generated structural tests to CI if not already covered
4. Run structural tests to verify they pass against the current codebase

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

1. **Tech Stack Detection** — auto-detect stack, run mismatch gate if needed
2. **Scope Detection** — determine monorepo boundaries, scope to CWD or user-specified package
3. **Dispatch Agents** — launch Core Agent and Discovery Agent in parallel using the Agent tool (two parallel Agent invocations in a single message)
4. **Merge Findings** — combine results, deduplicate (core takes priority)
5. **Present Detected Conventions** — show dominant pattern per category, user confirms/corrects/skips each
6. **Present Violations** — for confirmed categories, show ranked violations, user picks which to harden
7. **Route to Enforcement** — map selected findings to structural tests and/or linter rules
8. **Generate Artifacts** — produce structural tests, modify linter config, generate violations report
9. **Review Checkpoint** — user reviews generated artifacts via git diff

### Progressive Disclosure Schedule

| Step | Reference file loaded |
|---|---|
| Step 1 (Tech Stack Detection) | `references/tech-stacks.md` |
| Step 8 (Generate Artifacts) | `references/convention-test-templates.md` |
| Step 8 (Generate Artifacts) | `references/linter-rule-mappings.md` |

### Reference Files (to be created during implementation)

- `references/tech-stacks.md` — stack detection heuristics, linter config paths, test runner, DI patterns per stack. This skill's own version, not shared with other skills.
- `references/convention-test-templates.md` — structural test templates per convention category per stack (similar to refactor-to-layers' `structural-test-templates.md`). **Deferred to implementation planning.**
- `references/linter-rule-mappings.md` — mapping from convention categories to specific built-in linter rules per stack (e.g., Naming → Ruff N8xx, Logging → ESLint no-console). Only built-in/plugin rules, not custom rules. **Deferred to implementation planning.**

---

## Workflow

### Phase 1 — Analysis

```
User invokes convention-enforcer
        |
        |--- Step 1: Tech stack auto-detection
        |       |
        |       v
        |    Mismatch gate (see Section: Tech Stack Support)
        |       |
        |       v
        |--- Step 2: Scope detection (monorepo check)
        |       |
        |       v
        +---> Step 3a: Core Agent (6 fixed categories, receives detected stack)
        |                                              parallel
        +---> Step 3b: Discovery Agent (open-ended scan, receives detected stack)
        |
        v
   Step 4: Merge findings (core priority, deduplicate)
        |
        v
   Step 5: Present detected dominant patterns per category
        |
        v
   USER CHECKPOINT: Confirm/correct/skip each convention
        |
        v
   Step 6: Present violations for confirmed categories, ranked
        |
        v
   USER CHECKPOINT: Pick which findings to harden
```

### Phase 2 — Generation

```
   Step 7: For each selected finding:
        |
        +-- Route to enforcement mechanism (see Section: Routing)
        |       |
        |       +-- Structural test --> tests/structural/
        |       |
        |       +-- Linter rule --> modify existing config in place
        |
   Step 8: Generate artifacts + violations report
        |
        v
   Step 9: USER CHECKPOINT: Review generated artifacts (git diff)
```

---

## Core Agent — 6 Fixed Categories

The core agent checks these categories in every run. For each, it detects the **dominant pattern** (majority wins) and presents it for user confirmation before treating it as the convention.

### 1. Error Handling

- **Scans for:** error/exception class hierarchy, try/catch patterns, error propagation style, custom error types vs raw throws
- **Dominant pattern:** most-used error base class + most common handling idiom
- **Violations:** raw `throw new Error()` / bare `except:` / untyped `catch` when project has a custom error base class, swallowed catches, inconsistent error shapes

### 2. Naming Conventions

- **Scans for:** function/method names, class names, file names, variable names, constants
- **Detects per-scope:** files use kebab-case? classes use PascalCase? functions use camelCase / snake_case?
- **Violations:** anything breaking the majority pattern within its scope

### 3. Import/Dependency Patterns (incl. DI)

- **Scans for:** import grouping/ordering, relative vs absolute imports, DI registration patterns, constructor injection vs service locator
- **Dominant pattern:** most common import style + DI approach
- **Violations:** hardcoded dependencies, reaching into internal paths, inconsistent import ordering

### 4. API Response Shapes

- **Scans for:** response envelope structure (e.g. `{ data, error, status }` vs raw returns), consistent status code usage, error response format
- **Dominant pattern:** most common envelope shape across endpoints
- **Violations:** endpoints returning a different shape

### 5. File Organization

- **Scans for:** where files of each type live (controllers in `/api`, services in `/services`, etc.), co-location patterns, index barrel files
- **Dominant pattern:** directory-to-purpose mapping
- **Violations:** files placed outside their expected directory

### 6. Logging

- **Scans for:** logger instantiation (project logger vs raw console.log / print() / Console.WriteLine), log level usage, structured vs unstructured, context inclusion
- **Dominant pattern:** most common logger + call style
- **Violations:** raw console/print calls, missing log levels, unstructured strings

### User Confirmation Checkpoint (Step 5)

After scanning, the core agent presents each detected convention:

```
Category: Error Handling
Detected convention: All errors extend AppError, caught at middleware level (87% of files)
  > Correct, enforce this
  > Wrong, the convention should be [X]
  > Skip this category
```

This prevents locking in a bad pattern. Also handles mid-migration codebases where the old pattern still outnumbers the new one — the user can say "the convention should be Y" even if Y is currently the minority.

### Violation Selection Checkpoint (Step 6)

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

---

## Discovery Agent

Runs in parallel with the core agent. Scans for project-specific conventions outside the 6 fixed categories using **LLM-powered pattern recognition**.

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
2. Sample files across different directories (at least 3 per directory with source files)
3. Identify recurring structures through language understanding — a "pattern" is any code shape (decorator, function signature, return type, comment format, etc.) that appears consistently across 3+ files
4. Filter out anything that falls within a core category's scan scope (see Merge Logic)
5. For each discovered pattern, count frequency and list violating files

### Output

Same format as core agent — each discovered pattern presented with detected convention, frequency, and violation count. Goes through the same user confirmation checkpoint.

---

## Merge Logic (Step 4)

When combining core agent and discovery agent findings:

1. **Core findings take priority** — core agent results are included as-is
2. **Overlap check** — a discovery finding overlaps with a core category if it scans the same code dimension (e.g., a discovery finding about "import ordering" overlaps with core category 3: Import/Dependency Patterns). The overlap check is based on whether the finding's target files and code patterns fall within a core category's stated scan scope.
3. **Discard overlapping discovery findings** — if overlap is detected, the discovery finding is dropped
4. **Append remaining** — non-overlapping discovery findings are appended after core findings, labeled as `[Discovery]`

---

## Severity Model

Each convention category is assigned a severity level based on the impact of drift:

| Severity | Level | Criteria |
|---|---|---|
| High | 3 | Causes runtime errors, security issues, or breaks consumers (error handling, API response shapes, DI patterns) |
| Medium | 2 | Causes confusion, inconsistency, or slows development (naming, file organization, logging) |
| Low | 1 | Cosmetic or stylistic (comment format, import ordering within groups) |

**Ranking formula:** `score = severity_level x violation_count`

Findings are presented in descending score order. Discovery agent findings default to Medium severity unless the agent's analysis indicates otherwise.

---

## Enforcement Routing

After user confirms conventions and picks findings to harden, the skill routes each to the appropriate mechanism:

| Convention type | Primary enforcement | Rationale |
|---|---|---|
| Cross-file architectural rules (import boundaries, DI patterns, file organization) | Structural test | Linters can't express cross-module constraints |
| Single-file code patterns (naming, logging calls, error class usage) | Linter rule | Linters are built for this — fast, per-save, auto-fixable |
| Shape/schema enforcement (API response envelopes, error response format) | Structural test | Needs AST analysis of return types across endpoints |
| Hybrid cases (e.g. error handling = class hierarchy + catch patterns) | Both | Structural test for hierarchy, linter rule for catch patterns |

The routing is presented as a recommendation. The user can override per-finding (e.g. "add a structural test for naming too" or "skip the linter rule").

**Hybrid case mechanics:** For hybrid cases, the skill generates both artifacts and presents them together in the review checkpoint. The user can accept both, accept one and skip the other, or skip entirely.

---

## Output Artifacts

### 1. Structural Tests → `tests/structural/`

- Added to existing structural test files when the test file's topic matches the finding's category (e.g. import boundary finding → add to `layer-boundaries.test.ts` if it exists)
- New test file when no topically matching file exists, using naming pattern: `convention-{category}.test.{ext}` (e.g. `convention-error-handling.test.ts`, `convention-naming.test.py`)
- Each test has a descriptive name: `"all errors must extend AppError"`, `"API responses use standard envelope shape"`
- Each generated test block is preceded by a marker comment: `// --- Generated by convention-enforcer [date] ---`

### 2. Linter Config → Modified In Place

- Rules appended to the project's existing linter config file
- Each added rule gets a comment explaining which convention it enforces and when it was added
- Only built-in or well-known plugin rules — no custom rule authoring
- Stack-specific syntax: ESLint for Node.js, Ruff for Python, Roslyn/.editorconfig for .NET

### 3. Violations Report → `docs/convention-enforcer/violations-report.md`

- Grouped by category
- Each violation: file path, line number, expected vs found
- Summary at top: total violations per category, severity ranking
- Point-in-time snapshot — regenerated on each run, not a living document
- Placed in `docs/convention-enforcer/` rather than `docs/tmp/` so repeated runs can be diffed against each other

---

## Tech Stack Support

Auto-detection with a mismatch gate. Uses its own `references/tech-stacks.md` (not shared with other skills), containing convention-enforcer-specific content: linter config file paths, rule syntax per stack, structural test runner, DI patterns, and detection heuristics.

### Auto-Detection Algorithm

1. Scan project root for detection files: `package.json`, `pyproject.toml`, `.csproj` / `.sln`
2. **One match** → use that stack, confirm with user: "Detected Node.js project. Correct?"
3. **Zero matches** → prompt user to specify stack, linter, test runner, and config file paths (see "Other" stack below)
4. **Multiple matches** → trigger mismatch gate

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
  4. Config file locations?
```

The skill proceeds with user-provided info. Structural test templates fall back to language-generic patterns. Linter rule generation is best-effort using the specified tool's documentation.

### Mismatch Gate

After auto-detection, cross-check for inconsistencies:

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

- **Single-project repo:** Scan entire project from root
- **Monorepo detected** (multiple `package.json` / `pyproject.toml` / `.csproj` files in subdirectories): v1 scopes to the current working directory only. Present to user: "Monorepo detected. Scanning from CWD: `[path]`. Convention analysis scopes to this package only."
- Monorepo-wide convention analysis (cross-package consistency) is deferred to a future version.

---

## Relationship to Other Skills

### refactor-to-layers

Both skills write to `tests/structural/`. Coexistence rules:

- **File naming:** refactor-to-layers uses `layer-boundaries.test.{ext}`. Convention-enforcer uses `convention-{category}.test.{ext}`. No collision.
- **Marker comments:** Each skill marks its generated tests with `// --- Generated by {skill-name} ---`. This distinguishes origins and allows selective regeneration.
- **Independence:** Convention-enforcer tests do not import or reference layer definitions. The two test sets are complementary but independent.
- **Shared directory:** Running both skills produces a coherent, combined structural test suite in `tests/structural/`.

### implement-plan

Convention-enforcer is not invoked by implement-plan. They serve different purposes: implement-plan executes file moves and rewrites; convention-enforcer hardens code-level patterns.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| No source files found | Stop with message: "No source files found for {stack}. Check your CWD and stack detection." |
| No dominant pattern detected (50/50 tie) | Present both patterns to user, ask which to enforce. If user skips, mark category as "no convention detected." |
| Linter config file missing | Warn: "No {linter} config found. Skipping linter rule generation. Only structural tests will be produced." |
| Linter config malformed / unrecognized format | Warn: "Could not parse {config_file}. Skipping linter rule generation for this config." |
| Structural test directory `tests/structural/` missing | Create it. This is safe — it's a new directory with new files. |
| User corrects convention to minority pattern | Re-scan violations using the user's stated convention as the baseline, not the detected majority. |
| Zero violations found for a confirmed convention | Report: "Convention '{name}' is consistently followed. No enforcement needed." Skip artifact generation. |
| Discovery agent finds zero additional patterns | Report: "No additional project-specific conventions found beyond the 6 core categories." |
| Large codebase (>50K LOC) | Sample files rather than exhaustive scan. Core agent samples up to 100 files per category. Discovery agent samples up to 50 files across directories. Report sampling was used. |

---

## Parallel Agent Dispatch

The Core Agent and Discovery Agent are dispatched using the **Agent tool with two parallel invocations in a single message**. This is a standard Claude Code capability — no custom infrastructure needed. Each agent receives the detected stack and scope as context. Results are returned independently and merged in Step 4.

If one agent fails, the other's results are still used. A failed agent's categories are reported as "analysis failed" in the findings.

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
| Structural test location | `tests/structural/` (same as refactor-to-layers) | Unified structural test suite |
| Linter config modification | Direct modification | Hardening tool — enforcement must actually happen |
| Linter rule scope | Built-in/plugin rules only, no custom rules | Custom rule authoring is out of scope for v1 |
| Convention detection | Majority pattern, user-confirmed | Prevents locking in bad patterns; handles mid-migration codebases |
| Violations | Report only, no auto-fix | User should understand and own the fixes |
| Stack detection | Auto-detect with mismatch gate | Stop and ask on ambiguity, never guess |
| Monorepo scope | CWD only in v1 | Cross-package analysis deferred to future version |
| Discovery agent method | LLM-powered pattern recognition | No external similarity tool needed; leverages AI's language understanding |
