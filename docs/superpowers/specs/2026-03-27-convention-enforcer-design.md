# convention-enforcer — Design Spec

**Date:** 2026-03-27
**Status:** Approved
**Plugin:** ai-dev-tools
**Skill:** convention-enforcer

---

## Purpose

Analyze existing codebase conventions and generate enforcement artifacts (structural tests + linter rules) that prevent AI agent drift. A hardening tool — designed to be run repeatedly, each run tightening enforcement.

## Core Concept

One skill, two enforcement perspectives — similar to how review-docs/review-code dispatch agents with different lenses. The user invokes `convention-enforcer`, it dispatches parallel agents, and each hardens the codebase from its own angle. The user doesn't pick the mechanism — they pick which conventions to enforce, and the skill routes to the right tool.

## Approach

**Two-phase, scan-first enforce-second (Approach A):**

- Phase 1 — Analysis: parallel agents scan, findings merged and presented
- Phase 2 — Generation: enforcement artifacts produced for user-selected findings

User checkpoints between phases ensure nothing is enforced without explicit approval.

---

## Workflow

### Phase 1 — Analysis

```
User invokes convention-enforcer
        |
        |--- Tech stack auto-detection
        |       |
        |       v
        |    Mismatch gate (see Section: Tech Stack Support)
        |       |
        |       v
        +---> Core Agent (6 fixed categories, receives detected stack)
        |                                              parallel
        +---> Discovery Agent (open-ended scan, receives detected stack)
        |
        v
   Merge findings
        |
        v
   Present detected dominant patterns per category
        |
        v
   USER CHECKPOINT: Confirm/correct/skip each convention
        |
        v
   Present violations for confirmed categories, ranked by severity x frequency
        |
        v
   USER CHECKPOINT: Pick which findings to harden
```

### Phase 2 — Generation

```
   For each selected finding:
        |
        +-- Route to enforcement mechanism (see Section: Routing)
        |       |
        |       +-- Structural test --> tests/structural/
        |       |
        |       +-- Linter rule --> modify existing config in place
        |
        +-- Generate violations report
        |
        v
   USER CHECKPOINT: Review generated artifacts (git diff)
```

---

## Core Agent — 6 Fixed Categories

The core agent checks these categories in every run. For each, it detects the **dominant pattern** (majority wins) and presents it for user confirmation before treating it as the convention.

### 1. Error Handling

- **Scans for:** error/exception class hierarchy, try/catch patterns, error propagation style, custom error types vs raw throws
- **Dominant pattern:** most-used error base class + most common handling idiom
- **Violations:** raw `throw new Error()` when project has `AppError`, swallowed catches, inconsistent error shapes

### 2. Naming Conventions

- **Scans for:** function/method names, class names, file names, variable names, constants
- **Detects per-scope:** files use kebab-case? classes use PascalCase? functions use camelCase?
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

- **Scans for:** logger instantiation (project logger vs raw console/print), log level usage, structured vs unstructured, context inclusion
- **Dominant pattern:** most common logger + call style
- **Violations:** raw console.log/print, missing log levels, unstructured strings

### User Confirmation Checkpoint

After scanning, the core agent presents each detected convention:

```
Category: Error Handling
Detected convention: All errors extend AppError, caught at middleware level (87% of files)
  > Correct, enforce this
  > Wrong, the convention should be [X]
  > Skip this category
```

This prevents locking in a bad pattern. Also handles mid-migration codebases where the old pattern still outnumbers the new one — the user can say "the convention should be Y" even if Y is currently the minority.

---

## Discovery Agent

Runs in parallel with the core agent. Scans for project-specific conventions outside the 6 fixed categories using **pattern frequency analysis**.

### What It Looks For

- Decorator/attribute usage patterns (e.g. every route handler has `@authenticate`)
- Middleware/filter chains (consistent ordering or composition)
- Database query patterns (ORM-only, repository pattern, raw SQL placement)
- Configuration access (always through config service, never raw env vars)
- Event/message naming conventions (dot-notation, past tense, prefixes)
- Test organization patterns (setup/teardown conventions, fixture patterns, mock strategies)
- Comment/docstring conventions (JSDoc on public methods, inline comment style)

### Detection Method

- Looks for repeated code shapes across 3+ files (threshold for "intentional, not accidental")
- Groups by similarity and counts frequency
- Filters out anything already covered by core categories

### Output

Same format as core agent — each discovered pattern presented with detected convention, frequency, and violation count. Goes through the same user confirmation checkpoint.

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

---

## Output Artifacts

### 1. Structural Tests → `tests/structural/`

- Added to existing structural test files when the test file's topic matches the finding's category (e.g. import boundary finding → add to `layer-compliance.test.ts` if it exists)
- New test file when no topically matching file exists (e.g. `convention-enforcement.test.ts` for naming/logging/error conventions)
- Each test has a descriptive name: `"all errors must extend AppError"`, `"API responses use standard envelope shape"`

### 2. Linter Config → Modified In Place

- Rules appended to the project's existing linter config file
- Each added rule gets a comment explaining which convention it enforces and when it was added
- Stack-specific syntax: ESLint for Node.js, Ruff for Python, Roslyn/.editorconfig for .NET

### 3. Violations Report → `docs/convention-enforcer/violations-report.md`

- Grouped by category
- Each violation: file path, line number, expected vs found
- Summary at top: total violations per category, severity ranking
- Point-in-time snapshot — regenerated on each run, not a living document

---

## Tech Stack Support

Auto-detection with a mismatch gate. Uses `references/tech-stacks.md` following the established plugin pattern.

### Supported Stacks

**Node.js + Fastify**
- Linter: ESLint (`.eslintrc.*` or `eslint.config.*`)
- Structural tests: Vitest/Jest (whichever project uses)
- Detection: `package.json` presence
- DI patterns: constructor injection, Fastify plugin registration

**Python + FastAPI**
- Linter: Ruff (`ruff.toml` or `pyproject.toml [tool.ruff]`)
- Structural tests: pytest
- Detection: `pyproject.toml` or `requirements.txt`
- DI patterns: FastAPI `Depends()`, constructor injection

**.NET MVC**
- Linter: Roslyn analyzers + `.editorconfig`
- Structural tests: xUnit/NUnit (whichever project uses)
- Detection: `.csproj` / `.sln`
- DI patterns: `IServiceCollection` registration

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
| Agent execution | Parallel (core + discovery) | Independent scans, no reason to serialize |
| Structural test location | `tests/structural/` (same as refactor-to-layers) | Unified structural test suite |
| Linter config modification | Direct modification | Hardening tool — enforcement must actually happen |
| Convention detection | Majority pattern, user-confirmed | Prevents locking in bad patterns; handles mid-migration codebases |
| Violations | Report only, no auto-fix | User should understand and own the fixes |
| Stack detection | Auto-detect with mismatch gate | Stop and ask on ambiguity, never guess |
