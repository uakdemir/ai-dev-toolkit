# api-contract-guard — Design Spec

**Date:** 2026-03-27
**Status:** Approved (R1 revisions applied)
**Plugin:** ai-dev-tools
**Skill:** api-contract-guard

---

## Problem Statement

As monorepos and multi-module projects grow, AI agents routinely bypass module boundaries — importing internal helpers, reaching into sub-directories, using symbols that were never meant to be public. This creates tight coupling that defeats the purpose of modular architecture. The result: modules can't be refactored independently, context windows bloat because agents pull in transitive internals, and the codebase becomes a monolith in disguise.

The core scaling constraint is that each module managed by its own AI agent should stay within context limits (~30K lines). Contract tests enforce this by ensuring cross-module communication happens only through explicit, narrow interfaces (barrel files). The tests themselves are cheap — they scan import paths, not file contents — so they scale linearly with the number of cross-module imports, not total LOC. A 1M-line monorepo with 30 modules is fine as long as boundaries are enforced.

## Success Criteria

- Every module has an explicit barrel file defining its public API (or the user has consciously skipped it)
- Generated barrel files are syntactically valid — validated by post-generation checks (see Step 9a)
- Generated structural tests are syntactically valid — validated by compile-only / syntax-only checks (see Step 9a)
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
- Remove previously-generated test artifacts and violations report on "Start fresh" — with user confirmation (barrel files are NOT removed — see Barrel Ownership)

**What this skill DOES NOT do:**
- Enforce the shape/signature of exported symbols (type system concern)
- Auto-fix consumer imports (report only — user owns the rewrites)
- Install dependencies or modify CI
- Modify any file without user approval
- Run the generated tests
- Generate barrel files for .NET (v1 — .NET uses `internal` keyword; see .NET section)

**Post-skill manual steps:**
1. Rewrite flagged consumer imports to go through barrel files instead of internal paths
2. Add generated structural tests to CI if not already covered
3. Run structural tests — tests will fail for consumers that still bypass barrels. Fix imports to make tests pass.

**Plugin registration:** `plugin.json` description should be updated to include API contract enforcement when this skill is implemented.

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
- If a layer strategy spec exists (at `docs/layer-architecture/strategy.md` or detected via refactor-to-layers output paths), load it
- Extract module-to-layer mapping and use it for priority enrichment
- Modules crossing layer boundaries (e.g., Service module consumed by API layer) get a "critical" priority tag, sorted to top of findings
- Layer data affects presentation ordering only, not detection or generation logic

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
3. **Scope Detection** — walk up from CWD to project root, full-repo scan for monorepos (see Scope Detection section)
4. **Previous Run Detection** — scan for existing api-contract-guard artifacts
5. **Module Detection** — identify modules (monorepo packages or top-level src/ dirs)
6. **Barrel File Analysis** — categorize each module: has barrel / missing / incomplete (load `references/barrel-patterns.md`)
7. **Cross-Module Import Analysis** — full scan of import statements across all source files
8. **Present Findings** — summary table, then per-module detail in priority order (USER CHECKPOINT: approve/modify/skip per module)
9. **Generate Artifacts** — barrel files, structural tests (one file per module), violations report (load `references/contract-test-templates.md`)
9a. **Validate Artifacts** — parse barrel files, syntax-check tests (see Validation Commands)
10. **Review Checkpoint** — git diff, accept/revert/discard (USER CHECKPOINT)

### Progressive Disclosure Schedule

| Step | Reference file loaded |
|---|---|
| Step 2 (Tech Stack Detection) | `references/tech-stacks.md` |
| Step 6 (Barrel File Analysis) | `references/barrel-patterns.md` |
| Step 9 (Generate Artifacts) | `references/contract-test-templates.md` |

### Reference Files

- `references/tech-stacks.md` — stack detection, barrel file conventions, import syntax per stack, module detection heuristics per stack
- `references/barrel-patterns.md` — barrel file detection, export analysis (Serena + regex), incomplete barrel detection algorithm, cross-module import scanning, import path resolution rules
- `references/contract-test-templates.md` — per-stack structural test templates with placeholders for import-through-barrel enforcement

---

## Execution Model

Single agent executing SKILL.md sequentially. Unlike convention-enforcer (which dispatches parallel sub-agents), api-contract-guard has no natural parallel decomposition — Steps 5-7 are sequential dependencies (module detection → barrel analysis → import analysis). No sub-agent dispatch needed.

For large monorepos where context pressure is a concern, the agent processes modules in batches that fit within context limits, persisting intermediate results (the Module Analysis Format) between batches.

---

## Scope Detection (Step 3)

After tech stack detection, determine the analysis scope:

- **Single-project repo:** Walk up from CWD to find the project root (directory containing the detected stack marker file). Scan from that root.
- **Monorepo detected:** Unlike convention-enforcer (which scopes to CWD only), api-contract-guard **scans the entire monorepo**. Cross-module import analysis is meaningless if you only see one module — the skill needs visibility into all modules to detect who imports from whom.

**Monorepo workspace config files** (same list as convention-enforcer):
`pnpm-workspace.yaml`, `lerna.json`, `turbo.json`, `nx.json`, `rush.json`, `workspaces` field in root `package.json`, `.moon/workspace.yml`, `pants.toml`, `Directory.Build.props` (.NET)

Present to user: "Monorepo detected. Scanning all packages from root: `{path}`."

---

## Module Detection (Step 5)

**Monorepo (workspace detected):**
- Each workspace package is a module
- Read workspace config to find package paths
- **Node.js:** parse `workspaces` from `package.json`, or tool-specific configs (`pnpm-workspace.yaml` packages list, etc.)
- **Python:** each directory with `pyproject.toml` or `__init__.py` under the workspace root
- **.NET:** each `.csproj` listed in the `.sln` file

**Barrel locations per stack:**
- Node.js: `index.ts`/`index.js` at package root or `src/index.ts`, or the `.` entry in `package.json` `exports` field (subpath exports like `"./utils"` are additional public entry points — imports through them are NOT violations)
- Python: `__init__.py` at module root
- .NET: no barrel — see .NET section

**Single-project repo:**
- Each top-level directory under `src/` is a module
- Infrastructure dirs (`src/types/`, `src/config/`, `src/utils/`) are included
- **Python:** each directory under `src/` with `__init__.py` (or without, for namespace packages)
- **.NET:** each top-level namespace/folder under the project root, or each project in the solution
- Barrel locations: `src/auth/index.ts`, `src/auth/__init__.py`

**Edge cases:**
- Nested modules (e.g., `src/auth/oauth/` inside `src/auth/`) — treat as sub-module only if it has its own barrel file. Otherwise internal to parent.
- Single-file modules — skip, no meaningful boundary
- Module with only a barrel and no other files — skip, nothing to protect
- Module with no cross-module consumers — report: "No external consumers. Skip?"

---

## Module Analysis Format

Both analysis steps (6 and 7) produce findings in this structured format, which flows into Step 8 (presentation) and Step 9 (generation):

```
{
  module_path: string,                    // e.g. "src/auth" or "packages/billing"
  module_name: string,                    // e.g. "auth" or "billing"
  barrel_status: "complete" | "missing" | "incomplete",
  barrel_location: string | null,         // e.g. "src/auth/index.ts", null if missing
  current_exports: [                      // symbols currently in the barrel (empty if missing)
    { symbol: string, source_file: string, export_kind: "named" | "default" | "type" }
  ],
  proposed_exports: [                     // for missing/incomplete barrels
    { symbol: string, source_file: string, export_kind: "named" | "default" | "type",
      consumers: [string] }              // which files consume this symbol
  ],
  discrepancies: [                        // for incomplete barrels only
    { symbol: string, source_file: string, consumers: [string],
      user_decision: "add_to_barrel" | "flag_consumer" | null }
  ],
  violations: [                           // direct internal imports bypassing barrel
    { consumer_file: string, line: number, imported_symbol: string,
      internal_path: string, barrel_path: string }
  ],
  consumer_count: number,                 // total external files that import from this module
  priority: number                        // computed from Priority Model
}
```

---

## Priority Model

Modules are ranked for presentation at Step 8 using this formula:

**Base priority:** `consumer_count × status_weight`

| Barrel status | Weight |
|---|---|
| Missing (no barrel) | 3 |
| Incomplete (discrepancies) | 2 |
| Complete (violations only) | 1 |

**Layer enrichment:** If layer data exists, modules that are consumed across layer boundaries get a 2× multiplier. E.g., a Service module consumed by the API layer is 2× priority vs a Service module consumed by another Service module.

**Presentation order:** Descending priority score. Ties broken by module name alphabetically.

---

## Barrel File Analysis (Step 6)

Load `references/barrel-patterns.md` now.

For each module, categorize into one of three states:

### State 1: Has barrel file (complete)
- Barrel exports symbols, all cross-module consumers import through barrel
- Action: generate enforcement test only

### State 2: No barrel file
- Empty `__init__.py` / empty `index.ts` treated as "no barrel"
- Analyze cross-module imports to determine de facto public API
- **With Serena:** `find_referencing_symbols` from each file in the module → find external consumers → record symbol + source file + consumers
- **Without Serena:** regex scan all files outside the module for imports targeting paths inside the module → extract symbol names from import statements
- For each externally-consumed symbol, determine export kind from source file:
  - **With Serena:** `get_symbols_overview` on source file → named/default/type export
  - **Without Serena:** regex match `export class/function/const/default/type` in source
- Propose barrel that re-exports exactly those symbols
- Order: alphabetically within source file groups, grouped by source file in directory order

**Proposed barrel presentation:**

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

**Python barrel generation specifics:**
- Generated `__init__.py` uses relative imports: `from .service import AuthService`
- Includes `__all__` list matching exported symbols: `__all__ = ['AuthService', 'AuthError', 'verifyToken']`
- Before generating, check for circular imports: if any submodule imports from the package's own `__init__.py`, warn: "Circular import risk detected. Review the generated barrel before committing."

**"Modify exports" interaction:**
Present the proposed export list as a numbered checklist. The user can:
1. Remove items by number
2. Add symbols by typing them (agent warns if symbol not found in module)
After modification, re-present the updated barrel for final approval.

### State 3: Incomplete barrel (discrepancies)
- Barrel exists but some cross-module consumers bypass it
- **Detection algorithm:**
  - **With Serena:** `get_symbols_overview` on barrel → export set. From Step 7, collect all symbols imported from this module by external consumers → consumed set. Diff: symbols in consumed but not in export = discrepancies.
  - **Without Serena:** regex-extract `export { X }` and `export { X } from` from barrel → export set. Same diff.
- For each discrepancy, present:

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

**With Serena:** resolve all symbols via `get_symbols_overview` on the target file. Present resolved list.

**Without Serena (regex fallback):** attempt to resolve one level by reading target file's exports. If target itself has `export *`, warn: "Nested wildcard re-exports. Cannot fully resolve without Serena. Recommend installing Serena or replacing with named exports."

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
- **Path resolution rules** (detailed in `references/barrel-patterns.md`):
  - Relative imports: resolve against dirname of importing file
  - Monorepo bare specifiers: match against workspace package names
  - `package.json` `exports` field: `.` entry = primary barrel; subpath exports = additional public entry points (NOT violations)
  - Path aliases (tsconfig `paths`, Python namespace packages): warn about potential false negatives from unresolved aliases
- If the target is inside another module AND the import path doesn't point to the barrel → violation

**What constitutes a violation:**
- `import { AuthService } from '../auth/service'` → violation (bypasses barrel)
- `import { AuthService } from '../auth'` → OK (goes through barrel)
- `import { utils } from '@myorg/auth/utils'` → check if `./utils` is in `package.json` `exports` field; if yes, OK; if no, violation
- `from auth.service import AuthService` → violation (Python, bypasses `__init__.py`)
- `from auth import AuthService` → OK (Python, goes through `__init__.py`)

---

## Step 8: Present Findings (USER CHECKPOINT)

Present findings in two phases:

**Phase 1 — Summary table:**

```
Module Analysis Results (sorted by priority):

| # | Module | Status | Violations | Consumers | Priority |
|---|--------|--------|-----------|-----------|----------|
| 1 | src/auth | Missing barrel | 12 | 8 | ★★★ |
| 2 | src/billing | Incomplete | 5 | 6 | ★★ |
| 3 | src/users | Complete | 3 | 4 | ★ |
| 4 | src/utils | No consumers | 0 | 0 | — |

Batch operations:
  > Approve all proposed barrels
  > Review modules individually
  > Skip all (abort)
```

**Phase 2 — Per-module detail** (in priority order):

For each module that the user wants to review individually, present the State 1/2/3 detail from the Barrel File Analysis section. The user approves/modifies/skips each module.

Structural test generation is automatic for all approved modules — no separate opt-in needed.

---

## Structural Test Generation

Load `references/contract-test-templates.md` now.

After user approves, generate enforcement tests into `tests/structural/`.

**File naming: one file per module** (not a single combined file):
- Node.js/TS: `api-contracts-{module-name}.test.ts`
- Python: `api-contracts-{module-name}.test.py`
- .NET: `ApiContracts{ModulePascal}Tests.cs`

**Marker:** `{comment_char} --- Generated by api-contract-guard: {module_name} ---`

**Dedup on re-run:** Match by filename (one file per module = simple file replacement). No start/end markers needed.

**Template placeholders:**
- `{MODULE_NAME}` — module name (e.g., "auth")
- `{MODULE_PATH}` — module directory path (e.g., "src/auth")
- `{BARREL_PATH}` — barrel file path (e.g., "src/auth/index.ts")
- `{SOURCE_EXTENSIONS}` — file extensions to scan (e.g., `['.ts', '.js']`)
- `{MODULE_INTERNAL_DIRS}` — directories within the module (everything except the barrel)

**What the test does:**
- Scan all source files outside `{MODULE_PATH}`
- For each import statement, check if target resolves to a path inside `{MODULE_PATH}`
- If yes, verify the import points to `{BARREL_PATH}` (not an internal file)
- Fail with: `"{consumer_file}:{line} imports from {internal_path} — should import from {BARREL_PATH}"`

**What the test does NOT do:**
- Validate export shapes/signatures
- Check internal module structure
- Read file contents beyond import statements

**Scale:** The test scans import paths only. For a 1M-line codebase with 30 modules, this is ~30 barrel paths to check against all import statements. Linear in import count, not LOC.

---

## Validation Commands (Step 9a)

**Barrel file validation:**
- Node.js: `npx tsc --noEmit {barrel_file}` (verifies re-export paths resolve)
- Python: `python -c "import {module_name}"` (verifies imports in `__init__.py` resolve)
- .NET: N/A (no barrel files generated for .NET in v1)

**Structural test validation:**
- Node.js: `npx tsc --noEmit {test_file}`
- Python: `python -m py_compile {test_file}`
- .NET: `dotnet build --no-restore` (project containing test file)

**On validation failure:**
- Common failures: re-export path typo → fix path. Missing source file → remove that export line and warn.
- If auto-fix succeeds, proceed. If unfixable, skip that artifact with warning and continue.

---

## Output Artifacts

### 1. Barrel Files (generated or updated)
- Created at the module's standard barrel location (`index.ts`, `__init__.py`, etc.)
- Named exports only — no wildcard re-exports in generated barrels
- Node.js: `export { X } from './service';`
- Python: `from .service import AuthService` + `__all__ = [...]`
- Each generated barrel has a header comment: `{comment_char} Generated by api-contract-guard. Edit freely — this is now your module's public API.`
- For updated barrels (discrepancy resolution): append new exports at the end with a comment marking the addition

### 2. Structural Tests → `tests/structural/`
- One file per guarded module: `api-contracts-{module-name}.test.{ext}`
- Marker: `{comment_char} --- Generated by api-contract-guard: {module_name} ---`
- Dedup by file replacement on re-runs

### 3. Violations Report → `docs/api-contract-guard/violations-report.md`
- Per-module: barrel status, export list, violations (consumer file + line + internal path used)
- Summary: total modules, guarded modules, violations per module
- Point-in-time snapshot, regenerated on each run
- Should be committed for diff tracking

---

## Barrel Ownership

Generated barrel files say "Edit freely" — they become the user's files after generation. This creates a tension with re-runs:

**Rule:** "Start fresh" and "Re-analyze all" do NOT delete or overwrite user-modified barrel files.

- **On re-run**, if a barrel file exists with the api-contract-guard header comment AND the user has not modified it (content matches what the skill would generate), it is safe to overwrite.
- **If the user has edited the barrel** (added/removed exports, reorganized), treat it as user-owned. The skill re-analyzes it as an existing barrel (State 1 or State 3), not as a generated artifact.
- **"Start fresh" removes:** test files (`api-contracts-*.test.*`) + violations report only. Barrel files are never removed by "Start fresh."

---

## .NET Support (v1 — Limited)

.NET has no barrel file convention. It uses `internal` access modifier and namespace visibility instead. This is a fundamentally different mechanism from the barrel-based approach used for Node.js and Python.

**v1 scope for .NET:**
- Module detection works (projects in solution, top-level namespace folders)
- Cross-module import analysis works (scan `using` statements for references to other modules' internal namespaces)
- Structural test generation works (check no external project references `internal`-marked types)
- Barrel file generation does NOT apply — the skill reports which types should be marked `internal` but does not modify source files

**What the user checkpoint shows for .NET:**

```
Module: App.Auth (project)
Status: Public types analysis
Public types only used internally (candidates for 'internal'):
  - TokenHasher (App.Auth.Utils) → no external references
  - SessionStore (App.Auth.Internal) → no external references
Public types used externally (keep public):
  - AuthService (App.Auth) → used by App.Api, App.Workers
  - AuthOptions (App.Auth) → used by App.Api

  > Accept analysis  |  Skip module
```

The structural test checks: no external project `using` a namespace that contains only `internal` types for that module.

---

## Tech Stack Support

Same auto-detection pattern as convention-enforcer. Uses own `references/tech-stacks.md`.

### Stack-Specific Details

**Node.js:**
- Barrel files: `index.ts` / `index.js` at module root
- Alternative: `package.json` `exports` field — `.` entry is primary barrel; subpath exports are additional public entry points
- Import detection: `import { X } from './auth'` (barrel) vs `import { X } from './auth/service'` (internal)
- Re-export syntax: `export { X } from './service'`

**Python:**
- Barrel files: `__init__.py` at module root
- Import detection: `from auth import X` (barrel) vs `from auth.service import X` (internal)
- Re-export syntax: `from .service import AuthService` + `__all__` list
- Empty `__init__.py` = no barrel (treated as missing)

**.NET:**
- See ".NET Support (v1 — Limited)" section above
- No barrel files. Uses `internal` keyword + namespace visibility.
- Module = project in solution or top-level namespace folder

**"Other" stacks:**

```
Stack not recognized. Please provide:
  1. Language/framework?
  2. Barrel file convention (name and location)?
  3. Re-export syntax (how does the barrel expose symbols)?
  4. Import syntax (how to distinguish barrel import from internal import)?
```

Structural tests only — generic import path matching. No barrel file generation for "Other" stacks.

### Sub-Framework Detection
Same as convention-enforcer: dependency scan for specific framework, user confirmation, generic fallback.

### Mismatch Gate
Identical triggers to convention-enforcer.

---

## Previous Run Detection (Step 4)

1. Scan `tests/structural/` for files matching `api-contracts-*.test.*` with api-contract-guard markers
2. Scan for barrel files with `Generated by api-contract-guard` header comment (note: user-edited barrels still have this header)
3. Check for `docs/api-contract-guard/violations-report.md`

If artifacts exist, present 3 options:

**Option mechanics:**

- **Re-analyze all:** Full run. Extract module names from existing test file names. At Step 9, overwrite test files by filename. Barrel files: if unmodified since generation, overwrite; if user-modified, re-analyze as existing barrel (State 1/3). New modules create new artifacts.
- **Skip already-guarded:** Extract module names from test filenames. Skip those modules in Steps 5-8. Only analyze modules without existing test files. Discovery of new modules proceeds normally.
- **Start fresh:** Show user what will be removed (test files + violations report). Barrel files are NOT removed (see Barrel Ownership). After removal, full analysis from scratch.

---

## Relationship to Other Skills

### refactor-to-layers
- Complementary: layers enforce vertical dependency direction, contracts enforce horizontal module encapsulation
- If layer data exists, api-contract-guard uses it for priority ranking (cross-layer modules get 2× priority)
- Both write to `tests/structural/` — different prefixes (`layer-boundaries.*` vs `api-contracts-*.*`)

### convention-enforcer
- Independent: convention-enforcer checks code patterns within files, contract-guard checks import paths between modules
- Both write to `tests/structural/` — different prefixes (`convention-*.*` vs `api-contracts-*.*`)

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
| Circular cross-module imports | Warn: "Circular dependency between {A} and {B}." Build dependency graph via DFS to detect cycles. Generate barrels but add warning comment. List cycles in violations report with remediation advice. |
| Wildcard re-export in barrel | Warn, resolve symbols (Serena: full resolution; regex: one level, warn if nested), recommend named exports |
| Serena unavailable | Hard gate — user must explicitly choose regex fallback |
| User skips all modules | "No modules selected. No artifacts generated." |
| Barrel file has syntax errors | Warn, skip that module, continue with others |
| Validation fails at Step 9a | Auto-fix common failures (path typo, missing source). If unfixable, skip artifact with warning. |
| User rejects at Step 10 | Accept all / Revert selected (delete test files by name, remove appended barrel exports by marker) / Discard (git checkout modified, delete new test files — barrel files kept per Barrel Ownership) |
| Path aliases configured (`@auth/*`) | With Serena: resolved automatically. Without: warn about potential false negatives. |
| `tests/structural/` directory missing | Create it. |
| `docs/api-contract-guard/` directory missing | Create it. |
| Python circular import risk from generated barrel | Warn: "Circular import risk. Review generated __init__.py before committing." |
| `package.json` `exports` field with conditional entries | Use the `"."` entry (or `main` field) as primary barrel. Warn: "Conditional exports detected — using default condition for analysis." |

---

## Future / v2

- **Full .NET barrel equivalent:** Generate C# source files that consolidate `public` API surface — a generated "facade" class or namespace re-export pattern
- **Auto-fix consumer imports:** Rewrite consumer imports to go through barrel paths (currently report-only)
- **Monorepo-wide enforcement policies:** Central config defining which modules require contracts, minimum export coverage
- **Dynamic import tracking:** Detect `await import()` / `importlib.import_module()` patterns that bypass static analysis
- **CI integration:** Generate CI check that runs contract tests on PR

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
| Test location | `tests/structural/` with one file per module | Unified test suite, no collision, simple dedup by file replacement |
| Import scanning | Full scan, no sampling | Import path scanning is cheap — reads statements not contents |
| Serena | Hard gate, explicit user choice, no silent fallback | Precision matters for binding public/internal decisions |
| Generated barrels | Named exports only, no wildcards | Wildcards defeat explicit contracts |
| .NET handling | Limited v1: analysis + structural tests, no barrel generation | Fundamentally different mechanism (internal keyword); full support deferred |
| Monorepo scope | Full-repo scan (not CWD-only) | Cross-module analysis requires seeing all modules |
| Execution model | Single agent, sequential steps | No natural parallel decomposition — steps are sequential dependencies |
| Barrel ownership | User-owned after generation, never deleted by re-runs | Barrels are source files the user is invited to edit |
| No routing checkpoint | Single enforcement mechanism (barrel + test) | Unlike convention-enforcer, no choice between enforcement types |
| Test file per module | `api-contracts-{name}.test.{ext}` | Simpler dedup than multi-block single file; no start/end markers needed |
