# Claude Project Instructions

## Session Bootstrap (do this first)

0. If `tmp/session-handoff.md` exists, read it before starting any work.
1. Read `.claude/hotspots.md` for entrypoints, boundaries, and search commands.
2. Read `tmp/project_status.md` for current project state and next action.
3. Check `tmp/implementation_plans/` for an active plan and continue from the next unchecked item.
4. Update `tmp/project_status.md` at the end of a session.

## Scope

This root CLAUDE.md covers **monorepo integration** only — cross-package wiring, build/deploy, shared infrastructure. Package-internal concerns (architecture, coding patterns, internal ADRs) live in each package's own `CLAUDE.md`. Packages interact exclusively through their `index.ts` barrel exports; no package should import from another package's internal files.

## Commands

```bash
{{BUILD_COMMAND}}              # Build all packages
{{DEV_COMMAND}}                # Start development server
{{TYPECHECK_COMMAND}}          # Typecheck all workspaces
{{TEST_COMMAND}}               # Run all tests
{{MIGRATE_COMMAND}}            # Run database migrations
```

## Workspace Packages

<!-- List all packages with their purpose and export paths -->

| Package | Purpose | Export paths |
|---------|---------|-------------|
| `{{package-name}}` | {{one-line description}} | {{export paths}} |

**Encapsulation rule:** Each package exposes its public API via `index.ts` barrel exports only. Cross-package imports must use the listed export paths — never reach into another package's internal files. Each package has its own `CLAUDE.md` for internal concerns.

## Implementation Plans

Store short, active plans in `tmp/implementation_plans/` as checkbox lists. Delete/archive when done.

## Automated Workflow (MUST FOLLOW)

### After EVERY prompt exchange:

1. **TodoWrite**: Update todo list with current task status
2. **Implementation Plan**: Update checkbox status in `tmp/implementation_plans/`

### When starting new implementation work:

1. Create/update implementation plan in `tmp/implementation_plans/{{feature}}.md`
2. Break down into checkbox items with effort estimates
3. Follow the plan sequentially

### At session end:

1. Update `tmp/project_status.md`
2. Clear completed todos

### Response Timestamps

Add the exact time (HH:MM:SS format) at the end of every response to help correlate with server logs.

## Pre-Deploy Checklist (MUST FOLLOW)

Before any production deployment:

1. **Build with zero errors:** `{{TYPECHECK_COMMAND}}` must report 0 errors.
2. **Production smoke test:** Run the smoke test script if available. Verify the app starts and health endpoint responds.
3. **Verify schema column names** when writing new DB queries: read the schema definition file to confirm column names.

## Database Migrations (MUST FOLLOW)

- **NEVER use schema push** — always use migrations for predictable, reviewable changes.
- **NEVER run migrations directly** — write the migration SQL file and ask the user to run the migrate command.
- When schema changes are needed:
  1. Update the TypeScript schema file
  2. Write the migration file
  3. Tell the user to run: `{{MIGRATE_COMMAND}}`

## Project Status

**See:** `tmp/project_status.md`

Project status is tracked in a separate file to avoid polluting git history with frequent status updates.

---

## Coding Guidelines

1. Follow existing architecture, folder structure, conventions, and ADRs exactly. Do not make assumptions that change architecture or behavior — ask first.
2. Before writing code, restate key requirements and flag missing details that affect correctness.
3. Keep output token-aware: prefer small, high-signal diffs over long narratives.
4. After multi-file changes, run `{{TYPECHECK_COMMAND}}` and report errors before considering the task complete.
5. Prefer explicit types and contracts; keep public interfaces stable. Avoid `any` unless explicitly requested.
6. If you detect conflicting requirements, call them out clearly and propose a minimal resolution path before coding.
7. When changing/updating analysis documents that are already done always keep the changes surgical. Do not change grammatical minor fixes for better looks — changes that matter should be identifiable quickly via diff.

## Project: {{PROJECT_NAME}}

### What This Is

{{PROJECT_DESCRIPTION}}

### Architecture References

<!-- List key architecture docs -->
- `docs/architecture/{{components_doc}}` — Component specs
- `docs/architecture/{{adrs_doc}}` — Architectural decision records

### Workflow Convention

- Analysis-first: for each milestone, clarify requirements -> approve structure -> implement
- Claude handles configuration, folder structure, wiring, and implementation
- All code changes go through git; CLAUDE.md is the persistent context carrier across sessions

---
Project-specific or personal AI guidance not managed by the scaffold lives
in `CLAUDE.local.md` next to this file. Read it if present.
