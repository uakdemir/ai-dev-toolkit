# {{@scope/package-name}} — Package Instructions

## Package Overview

{{PACKAGE_DESCRIPTION}}

## Public API (DO NOT CHANGE exports)

The package exposes its public API through barrel exports — these are the contract with consumers:

| Export path | Entry file | Contents |
|---|---|---|
| `.` | `src/server/index.ts` | {{server exports: routes, services, types}} |
| `./client` | `src/client/index.ts` | {{client exports: components, hooks, API clients}} |
| `./schema` | `src/server/schema/index.ts` | {{schema exports: ORM table definitions}} |
| `./types/*` | `src/types/*.ts` | {{type exports: shared type definitions}} |

<!-- Remove export rows that don't apply to this package -->

**Never modify these barrel files without explicit approval.** They define what other packages can import.

## Build & Test

```bash
npm run build                          # compile to dist/
npm run test                           # run all tests
npx vitest run path/to/file.test.ts    # run a single test file
npx tsc --noEmit                       # typecheck without emitting
```

## Workspace Dependencies

This package imports from sibling packages via their `index.ts` barrel exports only:

| Package | Import path(s) | What this package uses |
|---------|---------------|----------------------|
| `{{@scope/dep-package}}` | `{{./server, ./types/*}}` | {{specific functions, types, and services used}} |

Never import from another package's internal files — use only the export paths above.

## Key Subsystems

<!-- List the main directories/files and what they do -->
- **`src/server/services/`** — {{description of service layer}}
- **`src/server/routes.ts`** — {{description of route handlers}}
- **`src/server/schema/`** — {{description of schema definitions}}
- **`src/client/`** — {{description of client-side code}}

## File Conventions

- `index.ts` = public API boundary (only in paths listed in package.json exports)
- `mod.ts` = intra-package organizational barrel (sub-directory public surface)
- Cross-sub-directory imports: use the target's `mod.ts` barrel
- Intra-sub-directory imports: use direct file paths

## Coding Guidelines

1. Follow existing architecture, folder structure, and conventions exactly.
2. Before writing code, restate key requirements and flag missing details that affect correctness.
3. Do not make assumptions that change architecture or behavior — ask first.
4. Keep diffs small and high-signal. Avoid unnecessary reformatting.
5. Produce production-quality code: readable naming, clear boundaries, dependency injection where appropriate.
6. Prefer simple, standard solutions over cleverness; optimize for maintainability.
7. Add focused tests only where they materially reduce risk. Tests must be deterministic and intention-revealing.
8. Validate edge cases for user-facing flows and external integrations, but do not invent features.
9. Prefer explicit types; avoid `any` unless explicitly requested.
10. When changing analysis documents, keep changes surgical — no gratuitous grammar/punctuation fixes.

## Safety Rules

- **No SQL writes**: Never run INSERT/UPDATE/DELETE/DROP on the database. Provide SQL for the user to run. Read-only SELECTs are OK.
- **Schema column verification**: When writing DB queries, read the schema definition file to confirm column names.
- **Run build after multi-file changes**: `npx tsc --noEmit` must pass before considering work complete.

## Git

Git commits are allowed in this package. Merge, branch, and push operations require user approval.

After completing a code implementation task, suggest a commit message:
```
Suggested commit: <message>
Files changed: <list>
```

## Response Timestamps

Add the exact time (HH:MM:SS format, local clock via `date '+%H:%M:%S'`) at the end of every response.

---
Project-specific or personal AI guidance not managed by the scaffold lives
in `CLAUDE.local.md` next to this file. Read it if present.
