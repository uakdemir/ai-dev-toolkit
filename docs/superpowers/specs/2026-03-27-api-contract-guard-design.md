# api-contract-guard — Design Spec

**Date:** 2026-03-27
**Status:** Approved
**Plugin:** ai-dev-tools
**Skill:** api-contract-guard

---

## Problem Statement

As monorepos and multi-module projects grow, AI agents routinely bypass module boundaries — importing internal helpers, reaching into sub-directories, using symbols that were never meant to be public. This creates tight coupling that defeats the purpose of modular architecture. The result: modules can't be refactored independently, context windows bloat because agents pull in transitive internals, and the codebase becomes a monolith in disguise.

The core scaling constraint is that each module managed by its own AI agent should stay within context limits (~30K lines). Contract tests enforce this by ensuring cross-module communication happens only through explicit, narrow interfaces (barrel files). The tests themselves are cheap — they scan import paths, not file contents — so they scale linearly with the number of cross-module imports, not total LOC. A 1M-line monorepo with 30 modules is fine as long as boundaries are enforced.

## Success Criteria

- Every module has an explicit barrel file defining its public API (or the user has consciously skipped it)
- Generated barrel files are syntactically valid — validated by a post-generation syntax check
- Generated structural tests are syntactically valid — validated by a compile-only / syntax-only check
- Structural tests detect all direct internal imports that bypass barrel files
- Import scanning covers the full codebase (no sampling — import path scanning is cheap even at 1M+ lines)
- Re-running the skill on an already-guarded codebase produces no new artifacts (idempotent)
- Serena availability is checked upfront with explicit user decision (no silent fallback)

## Scope Boundaries

**What this skill DOES:**
- Detect modules (monorepo packages or top-level `src/` directories)
- Analyze barrel file state per module (present/missing/incomplete)
- Analyze cross-module imports to determine de facto public API
- Propose barrel files for modules that lack them, with user approval
- Generate barrel files after approval
- Update existing barrel files when user chooses "add to barrel" for discrepancies
- Generate structural tests into `tests/structural/` that enforce import-through-barrel
- Remove previously-generated artifacts on "Start fresh" — with user confirmation

**What this skill DOES NOT do:**
- Enforce the shape/signature of exported symbols (type system concern)
- Auto-fix consumer imports (report only — user owns the rewrites)
- Install dependencies or modify CI
- Modify any file without user approval
- Run the generated tests

**Post-skill manual steps:**
1. Rewrite flagged consumer imports to go through barrel files instead of internal paths
2. Add generated structural tests to CI if not already covered
3. Run structural tests — tests will fail for consumers that still bypass barrels. Fix imports to make tests pass.

---

## Core Concept

Barrel file = contract. No barrel file = no contract. The skill creates missing barrels with user approval and generates structural tests that enforce consumers only import through the barrel. The user explicitly decides what's public for every module — the skill never guesses.

## Approach

**Two-phase: discovery first, then batch generation (Approach C):**

- Phase 1 — Discovery: detect modules, analyze barrel state, cross-module imports, present findings
- Phase 2 — Generation: create/update barrel files, generate structural tests, validate

User checkpoints between phases.

## Layer Model Integration

Independent but layer-aware:
- Works on any codebase, with or without refactor-to-layers output
- If a layer strategy spec exists, load it to enrich analysis: modules in higher layers exposing to lower layers are higher-priority boundaries
- Layer data affects priority ranking of findings, not detection logic

---

## Serena Gate

Before any analysis, check for Serena MCP plugin availability:

**Serena available:** Proceed with semantic tools (`get_symbols_overview`, `find_referencing_symbols`, `find_symbol`) for precise symbol resolution.

**Serena NOT available:** Stop and present:

```
⚠ Serena MCP plugin is strongly recommended for api-contract-guard.

Serena provides precise symbol resolution for detecting exports,
cross-module references, and internal path usage. Without it, the
skill falls back to regex-based import scanning which is less precise
for re-exports, aliases, and dynamic imports.

  > Install Serena and continue
  > Proceed without Serena (regex fallback — less precise)
```

The user must explicitly choose. No silent fallback. This is a hard gate — analysis does not begin until the user responds.

**With Serena:**
- `get_symbols_overview` on barrel files → exact export list
- `find_referencing_symbols` → precise cross-module consumer detection
- Handles re-exports, aliases, dynamic imports correctly

**Without Serena (regex fallback):**
- Scan import/require/from statements via regex
- Match import paths against module directory structure
- Less precise for: wildcard re-exports, aliased imports, dynamic imports, conditional exports
- Warn user about precision limitations at each ambiguous finding

---

## SKILL.md Workflow

### Frontmatter

```yaml
name: api-contract-guard
description: "Use when the user wants to define module API boundaries, enforce that consumers import through barrel files, generate contract tests for module encapsulation, create index/barrel files for modules, or prevent AI agents from importing internal module paths — even if they don't use the exact skill name."
```

### Numbered Steps

1. **Serena Check** — check availability, present explicit choice if not available
2. **Tech Stack Detection** — auto-detect stack (including sub-framework), mismatch gate
3. **Scope Detection** — walk up from CWD to project root, monorepo check
4. **Previous Run Detection** — scan for existing api-contract-guard artifacts
5. **Module Detection** — identify modules (monorepo packages or top-level src/ dirs)
6. **Barrel File Analysis** — categorize each module: has barrel / missing / incomplete
7. **Cross-Module Import Analysis** — full scan of import statements across all source files
8. **Present Findings** — per-module: barrel status, proposed exports, discrepancies, violations (USER CHECKPOINT)
9. **Generate Artifacts** — barrel files, structural tests, violations report
9a. **Validate Artifacts** — syntax check barrels + tests
10. **Review Checkpoint** — git diff, accept/revert/discard (USER CHECKPOINT)

### Progressive Disclosure Schedule

| Step | Reference file loaded |
|---|---|
| Step 2 (Tech Stack Detection) | `references/tech-stacks.md` |
| Step 6-7 (Analysis) | `references/barrel-patterns.md` |
| Step 9 (Generate Artifacts) | `references/contract-test-templates.md` |

### Reference Files

- `references/tech-stacks.md` — stack detection, barrel file conventions, import syntax per stack
- `references/barrel-patterns.md` — barrel file detection heuristics, export analysis patterns, cross-module import scanning (Serena mode + regex fallback)
- `references/contract-test-templates.md` — structural test templates per stack for import-through-barrel enforcement

---

## Workflow

### Phase 1 — Discovery

```
User invokes api-contract-guard
        |
        |--- Step 1: Serena check (hard gate)
        |       |
        |       v
        |--- Step 2: Tech stack auto-detection (+ sub-framework)
        |       |
        |       v
        |--- Step 3: Scope detection (walk up to root, monorepo check)
        |       |
        |       v
        |--- Step 4: Previous run detection
        |       |
        |       v
        |--- Step 5: Module detection
        |       |
        |       v
        |--- Step 6: Barrel file analysis (per module)
        |       |
        |       v
        |--- Step 7: Cross-module import analysis (full scan)
        |       |
        |       v
   Step 8: Present findings per module
        |
        v
   USER CHECKPOINT: Per module approve/modify/skip
```

### Phase 2 — Generation

```
   Step 9: Generate barrel files + structural tests + violations report
        |
        v
   Step 9a: Validate artifacts (syntax check)
        |
        v
   Step 10: USER CHECKPOINT: Review via git diff
        |
        v
   Accept all / Revert selected / Discard run
```

---

## Module Detection (Step 5)

**Monorepo (workspace detected):**
- Each workspace package is a module
- Read workspace config to find package paths
- Barrel locations: `index.ts`/`index.js` at package root or `src/index.ts`, or `main`/`exports` field in package's `package.json`

**Single-project repo:**
- Each top-level directory under `src/` is a module
- Infrastructure dirs (`src/types/`, `src/config/`, `src/utils/`) are included — they're modules too
- Barrel locations: `src/auth/index.ts`, `src/auth/__init__.py`

**Edge cases:**
- Nested modules (e.g., `src/auth/oauth/` inside `src/auth/`) — treat as sub-module only if it has its own barrel file. Otherwise internal to parent.
- Single-file modules — skip, no meaningful boundary
- Module with only a barrel and no other files — skip, nothing to protect
- Module with no cross-module consumers — report: "No external consumers. Skip?" No barrel needed if nothing imports from it.

**If layer data exists:**
- Load refactor-to-layers strategy spec
- Use layer assignments to enrich priority: higher-layer modules (API, UI) exposing to lower layers (Service, Data) = critical boundaries
- Present layer context alongside findings

---

## Barrel File Analysis (Step 6)

For each module, categorize into one of three states:

### State 1: Has barrel file (complete)
- Barrel exports symbols, all cross-module consumers import through barrel
- Action: generate enforcement test only

### State 2: No barrel file
- Empty `__init__.py` / empty `index.ts` treated as "no barrel"
- Analyze cross-module imports to determine de facto public API (with Serena: `find_referencing_symbols`; without: regex import scan)
- For each symbol consumed by other modules, record: symbol name, source file, consumers
- Propose barrel that re-exports exactly those symbols
- Present to user:

```
Module: src/auth/
Status: No barrel file
Currently consumed by other modules:
  - AuthService (from src/auth/service.ts) → used by src/api/users.ts, src/api/admin.ts
  - AuthError (from src/auth/errors.ts) → used by src/services/payment.ts
  - verifyToken (from src/auth/jwt.ts) → used by src/middleware/auth.ts

Proposed barrel (src/auth/index.ts):
  export { AuthService } from './service';
  export { AuthError } from './errors';
  export { verifyToken } from './jwt';

  > Approve  |  Modify exports  |  Skip module
```

### State 3: Incomplete barrel (discrepancies)
- Barrel exists but some cross-module consumers bypass it
- For each discrepancy:

```
Module: src/billing/
Status: Barrel exists but has discrepancies
Barrel exports: BillingService, Invoice, PaymentError
Not in barrel but consumed externally:
  - calculateTax (from src/billing/utils/tax.ts) → used by src/api/checkout.ts

  For calculateTax:
    > Add to barrel (it's intentionally public)
    > Flag consumer as violation (it's reaching into internals)
```

### Wildcard re-exports
If a barrel has `export * from './service'`, warn:

```
⚠ Wildcard re-export in src/auth/index.ts defeats explicit contract.
Resolved symbols: AuthService, AuthError, verifyToken, hashPassword, ...

Replace with named exports?
  > Yes, replace with named exports for: [user selects]
  > Keep wildcard (enforcement will be weaker)
```

---

## Cross-Module Import Analysis (Step 7)

Full scan of all source files — no sampling. Import path scanning reads import statements only, not file contents, so it's cheap even at 1M+ lines.

**With Serena:**
- For each module's barrel, use `get_symbols_overview` to get export list
- Use `find_referencing_symbols` on each exported symbol to find consumers
- Cross-reference: any consumer not importing through the barrel path is a violation

**Without Serena (regex fallback):**
- Scan all source files for import/require/from statements
- For each import, resolve the target path
- If the target is inside another module AND the import path doesn't point to the barrel → violation
- Less precise for: re-exports, path aliases (`@auth/service`), dynamic imports

**What constitutes a violation:**
- `import { AuthService } from '../auth/service'` → violation (bypasses barrel)
- `import { AuthService } from '../auth'` → OK (goes through barrel)
- `from auth.service import AuthService` → violation (Python, bypasses `__init__.py`)
- `from auth import AuthService` → OK (Python, goes through `__init__.py`)

---

## Structural Test Generation

After user approves, generate enforcement tests into `tests/structural/`.

**File naming:** `api-contracts.test.{ext}` for JS/TS and Python, `ApiContractTests.cs` for .NET.

**Marker:** `{comment_char} --- Generated by api-contract-guard: {module_name} ---`

**What the test does:**
- For each guarded module, scan all source files outside that module
- Check every import statement: if it resolves to a path inside the module, verify it points to the barrel (not an internal path)
- Fail with: `"{consumer_file} imports {symbol} directly from {internal_path} — should import from {barrel_path}"`

**What the test does NOT do:**
- Validate export shapes/signatures
- Check internal module structure
- Read file contents beyond import statements

**Scale:** The test scans import paths only. For a 1M-line codebase with 30 modules, this is ~30 barrel paths to check against all import statements. Linear in import count, not LOC.

---

## Output Artifacts

### 1. Barrel Files (generated or updated)
- Created at the module's standard barrel location (`index.ts`, `__init__.py`, etc.)
- Named exports only — no wildcard re-exports in generated barrels
- Each generated barrel has a header comment: `{comment_char} Generated by api-contract-guard. Edit freely — this is now your module's public API.`
- For updated barrels (discrepancy resolution): append new exports at the end with a comment marking the addition

### 2. Structural Tests → `tests/structural/`
- File: `api-contracts.test.{ext}` (JS/TS/Python) or `ApiContractTests.cs` (.NET)
- One test per guarded module
- Marker: `{comment_char} --- Generated by api-contract-guard: {module_name} ---`
- Category-based dedup key (module name) for idempotent re-runs

### 3. Violations Report → `docs/api-contract-guard/violations-report.md`
- Per-module: barrel status, export list, violations (consumer file + internal path used)
- Summary: total modules, guarded modules, violations per module
- Point-in-time snapshot, regenerated on each run
- Should be committed for diff tracking

---

## Tech Stack Support

Same auto-detection pattern as convention-enforcer. Uses own `references/tech-stacks.md`.

### Stack-Specific Details

**Node.js:**
- Barrel files: `index.ts` / `index.js` at module root
- Alternative: `package.json` `exports` field (monorepo packages)
- Import detection: `import { X } from './auth'` (barrel) vs `import { X } from './auth/service'` (internal)
- Re-export syntax: `export { X } from './service'`

**Python:**
- Barrel files: `__init__.py` at module root
- Import detection: `from auth import X` (barrel) vs `from auth.service import X` (internal)
- Re-export syntax: in `__init__.py`: `from .service import AuthService`
- Empty `__init__.py` = no barrel (treated as missing)

**.NET:**
- No barrel file convention — uses namespace visibility
- Public API = `public` classes/methods in root namespace
- Internal = `internal` keyword or nested namespaces
- Skill checks: consumers referencing `internal`-marked types or sub-namespaces not part of public surface
- "Barrel" equivalent: recommend proper use of `internal` access modifier. The skill does NOT generate barrel files for .NET — it generates structural tests that check namespace/access-modifier boundaries instead.
- For modules where `internal` is not used consistently, present findings and let user decide which types to mark `internal`

**"Other" stacks:**
- Prompt for barrel convention and import syntax
- Structural tests only — generic import path matching

### Sub-Framework Detection
Same as convention-enforcer: dependency scan for specific framework, user confirmation, generic fallback for unsupported sub-frameworks.

### Mismatch Gate
Identical triggers to convention-enforcer.

---

## Previous Run Detection (Step 4)

1. Scan `tests/structural/` for files matching `api-contracts.test.*` with api-contract-guard markers
2. Scan for generated barrel files with api-contract-guard header comments
3. Check for `docs/api-contract-guard/violations-report.md`

If artifacts exist, present 3 options:
- **Re-analyze all:** Full run, overwrite existing artifacts for re-confirmed modules
- **Skip already-guarded modules:** Only analyze modules without existing contract tests
- **Start fresh:** Remove existing artifacts (with user confirmation), re-analyze everything

---

## Relationship to Other Skills

### refactor-to-layers
- Complementary: layers enforce vertical dependency direction, contracts enforce horizontal module encapsulation
- If layer data exists, api-contract-guard uses it for priority ranking
- Both write to `tests/structural/` — different prefixes (`layer-boundaries.*` vs `api-contracts.*`)

### convention-enforcer
- Independent: convention-enforcer checks code patterns within files, contract-guard checks import paths between modules
- Both write to `tests/structural/` — different prefixes (`convention-*.*` vs `api-contracts.*`)

### implement-plan
- Not related. implement-plan executes file moves; contract-guard enforces boundaries.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| No modules detected | Stop: "No modules found. Check CWD and project structure." |
| All modules complete with no violations | Report: "All module boundaries clean. No enforcement needed." |
| Empty barrel file (`__init__.py` / `index.ts` with no exports) | Treat as "no barrel" — propose exports |
| Module has no cross-module consumers | Report: "No external consumers. Skip?" |
| Circular cross-module imports | Warn: "Circular dependency between {A} and {B}. Resolve cycle before enforcing boundaries." Flag but don't block. |
| Wildcard re-export in barrel | Warn, resolve symbols, recommend named exports |
| Serena unavailable | Hard gate — user must explicitly choose regex fallback |
| User skips all modules | "No modules selected. No artifacts generated." |
| Barrel file has syntax errors | Warn, skip that module, continue with others |
| Validation fails at Step 9a | Attempt auto-fix. If unfixable, skip artifact with warning. |
| User rejects at Step 10 | Accept/revert/discard with same mechanics as convention-enforcer |
| Path aliases configured (`@auth/*`) | With Serena: resolved automatically. Without: warn about potential false negatives from unresolved aliases. |

---

## Design Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Layer coupling | Independent but layer-aware | Works without refactor-to-layers; enriched when available |
| Module definition | Auto-detected (packages or top-level dirs) | Matches developer mental model per context |
| Contract scope | Export surface + import enforcement | Name is "contract-guard" — both halves needed |
| Public/internal boundary | Barrel file is the contract, strict | No guessing. No conventions. Barrel or nothing. |
| Missing barrels | Analyze usage, propose, user approves, generate | Skill does the work after explicit approval |
| Incomplete barrels | User chooses: add to barrel or flag consumers | Genuinely ambiguous — only user knows intent |
| Approach | Two-phase (discovery → batch generation) | Consistent with convention-enforcer pattern |
| Test location | `tests/structural/` with prefix `api-contracts.*` | Unified test suite, no collision |
| Import scanning | Full scan, no sampling | Import path scanning is cheap — reads statements not contents |
| Serena | Hard gate, explicit user choice, no silent fallback | Precision matters for binding public/internal decisions |
| Generated barrels | Named exports only, no wildcards | Wildcards defeat explicit contracts |
| .NET handling | Namespace visibility instead of barrel files | .NET has `internal` keyword — different mechanism, same goal |
