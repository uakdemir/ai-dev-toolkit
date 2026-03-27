# Verification Patterns

Three verification granularities are supported: **per-step** (verify after every action),
**per-phase** (verify after each phase completes), and **end-only** (verify once after all
phases). Choose based on risk tolerance and time budget. Per-phase is the default recommendation.

## Pre-flight Validation

Before execution begins, run these checks:

1. **Source existence** — Scan all remaining step source paths. Report every missing path before
   starting. Do not proceed with partial plans; surface all missing sources at once so the user
   can decide whether to abort or adjust the plan.

2. **Target collisions per action type**
   - `move-file` / `extract-interface` → target already exists: warn and prompt to overwrite or
     stop. **No skip option** — skipping a move or extraction invalidates downstream steps that
     reference the new path.
   - `create-folder` → target already exists: proceed silently (idempotent, equivalent to
     `mkdir -p`).
   - `rewrite-import` → no collision concept; the step mutates file content in place.

3. **Git state** — Require a clean working tree before execution starts. Uncommitted changes risk
   being conflated with plan changes, making rollback harder. Stash or commit before proceeding.

## Per-Stack Verification Commands

### Node.js

```bash
npx tsc --noEmit                     # TypeScript type-check (no output files)
npx eslint .                         # Lint all files
test -f path/to/expected/file.ts     # File existence assertion
```

### .NET

```bash
dotnet build                         # Compile and report errors
test -f path/to/expected/File.cs     # File existence assertion
```

### Python

```bash
python -c "import package_name"      # Import smoke-test
python -m py_compile path/to/file.py # Syntax check without running
test -f path/to/expected/file.py     # File existence assertion
```

**Phase-specific notes:**

- **Phase 0** (folder creation): assert directory existence only. No build needed.
- **Phase 1** (file moves): assert source gone + target present. **Do not run build or
  type-check** — imports still point to old paths and will fail until Phase 2 rewrites them.
- **Phase 2** (import rewrites): run full build / type-check. This is the first phase where
  compilation is expected to succeed.
- **Phase 3** (interface extraction and final cleanup): run full build / type-check. Confirm
  all consumers reference the new interface path.

## Failure Analysis Heuristics

| Symptom | Likely cause | Proposed fix |
|---|---|---|
| `Cannot find module 'X'` / `Module not found: X` | Missed `rewrite-import` step | Find old import path `X` in the erroring file; replace with new path |
| `CS0246: The type or namespace 'X' could not be found` | Missed `rewrite-import` step (.NET) | Update `using` directive or namespace reference to new location |
| `ModuleNotFoundError: No module named 'X'` | Missed `rewrite-import` step (Python) | Update `import` / `from … import` to new module path |
| Interface incompatibility / type mismatch after extraction | Extracted interface does not match concrete class public API | Compare interface method signatures with the public methods of the source class; reconcile differences |
| Circular dependency compile error | Two modules in different phases import each other | Reference the circular dependency classification from the pre-execution analysis; apply the recommended resolution (e.g., introduce a shared abstractions module or invert the dependency) |
| Ambiguous reference / `CS0104` namespace conflict (.NET) | Two `using` directives expose types with the same short name | Replace the ambiguous short name with the fully qualified type name |

## Target Collision Rules

| Action type | Target exists | Behaviour |
|---|---|---|
| `move-file` | Yes | Warn user. Overwrite or stop. **No skip.** |
| `extract-interface` | Yes | Warn user. Overwrite or stop. **No skip.** |
| `create-folder` | Yes | Proceed silently (`mkdir -p` semantics). |
| `rewrite-import` | N/A | No collision concept; mutates existing file content. |

Skipping a `move-file` or `extract-interface` step is never safe: later steps that import or
reference the expected target path will fail, producing cascading errors that are harder to
diagnose than the original collision warning.

## Execution Report Template

Generated at `tmp/execution-report.md` after execution completes.

```markdown
# Execution Report

> Generated from implement-plan execution on YYYY-MM-DD — this is a one-time report, not a source of truth.
Execution mode: Serena / fallback (regex)
Verification granularity: per-step / per-phase / end-only

## Phase Summary

| Phase | Steps attempted | Completed | Failed |
|-------|----------------|-----------|--------|
| 0 — Folders      | N | N | N |
| 1 — File moves   | N | N | N |
| 2 — Imports      | N | N | N |
| 3 — Interfaces   | N | N | N |

## Circular Dependencies Classified

| Pattern | Confidence | Recommendation |
|---------|-----------|----------------|
| ModuleA ↔ ModuleB | high | Extract shared interface to /shared |

## Files Moved

| Old path | New path |
|----------|----------|
| src/old/File.ts | src/new/File.ts |

## Imports Rewritten

| File | Rewrites | Method |
|------|---------|--------|
| src/consumer.ts | 3 | Serena |

## Interfaces Extracted

| Interface name | Source class | Consumers |
|----------------|-------------|-----------|
| IServiceName | ServiceName | ConsumerA, ConsumerB |

## Failures and Resolutions

- **Step N** — description of failure — resolution applied or pending

## Recommended Manual Steps

- Resolve circular dependency between ModuleA and ModuleB (see classification above)
- Review regex-rewritten imports in files where Serena was unavailable
```
