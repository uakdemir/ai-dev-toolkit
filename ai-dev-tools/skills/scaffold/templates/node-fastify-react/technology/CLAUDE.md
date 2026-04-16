## Technology Layer — Node.js / Fastify / React

These instructions supplement the root and package CLAUDE.md files with technology-specific conventions and gotchas.

## Tech Stack

- **Backend:** Node.js + Fastify, TypeScript
- **Frontend:** React + Vite, TailwindCSS, React Query + Zustand
- **Database:** PostgreSQL, Drizzle ORM
- **Job Queue:** BullMQ + Redis
- **Testing:** Vitest (unit/integration) + Playwright (E2E)
- **Package Manager:** pnpm workspaces + Turborepo

## Commands (resolved for this stack)

```bash
./deploy.sh && npm run dev    # Build all packages (turbo) + start dev server
npx turbo build               # Build all packages
npx turbo typecheck           # Typecheck all workspaces
npx turbo test                # Run all tests
pnpm run db:migrate           # Run database migrations (from monorepo root)
```

## Development Environment

- **WSL 2 + Ubuntu** recommended for parity with Linux deployment targets
- **Docker Compose** for local services (PostgreSQL, Redis)
- Project files must live in WSL filesystem (not /mnt/c/) for performance
- Node.js installed via nvm inside WSL

## Fastify Conventions

- **Plugin pattern**: All packages register routes as Fastify plugins via `fastify-plugin` wrapper.
- **Module augmentation**: Auth packages extend `FastifyInstance` and `@fastify/jwt` interfaces in a `types.ts` file. This is required for TypeScript to recognize custom decorators (`authenticate`, `authorizeProject`, etc.) across the monorepo.
- **Route registration**: `apps/server/src/app.ts` imports and registers all package route plugins. This is the monorepo's backend wiring point.
- **Multipart uploads**: Use `@fastify/multipart` for file upload endpoints.

## React Conventions

- **Client exports are unbundled**: Package `./client` export paths point to source TypeScript (not compiled JS). The consuming app (`apps/client`) handles compilation via Vite.
- **State management**: Zustand stores for auth and domain state. Persist to `localStorage` where appropriate.
- **Data fetching**: React Query (TanStack Query) for server state. Custom hooks wrap API calls and return query/mutation objects.
- **HTTP client**: Ky (lightweight fetch wrapper) for API calls. Shared `api` instance in the shared package with auth token injection via `beforeRequest` hook.

## Drizzle ORM Conventions

- **Schema-per-package**: Each package defines its Drizzle tables in `src/server/schema/`. Shared tables (e.g., `customers`) live in the shared package.
- **Schema exports**: Packages export their Drizzle tables for cross-package joins and queries.
- **JSONB storage**: Complex data structures stored as serialized JSONB columns (typed via Drizzle's `.$type<T>()` pattern).
- **Migration flow**: Always use `db:migrate` (never `db:push`). Write migration SQL files manually. Number sequentially (e.g., `0012_description.sql`).

## BullMQ / Redis Conventions

- **Queue per domain**: Each async workflow gets its own named queue (e.g., `harvest-pipeline`, `peaka-cache`).
- **Lazy queue init**: Use `getOrCreateQueue()` pattern with Redis connection pooling. Close queues on shutdown.
- **Polling pattern**: For status tracking, use BullMQ delayed jobs with fixed intervals (e.g., 60s). Re-enqueue if still running.
- **Non-blocking workers**: Background tasks (auto-discovery, cache polling) should never block the primary job. Log failures as warnings.

## Testing Conventions

- **Vitest**: Unit and integration tests. Tests co-located with source (`.test.ts` suffix).
- **jsdom for client tests**: Use `@vitest-environment jsdom` docblock directive or `environmentMatchGlobs` in vitest config.
- **No over-mocking**: Prefer real implementations where feasible. Mock only external boundaries (Peaka API, LLM calls, Redis).
- **Deterministic tests**: No timers, no random data, no external network calls. Use fixtures and test factories.

## Connection Pool Patterns

- **Singletons**: Database pool (`getPool`), Redis (`getRedis`) are lazy singletons. Call once at startup, close on shutdown. Do not create multiple instances.
- **Per-resource mutex**: For file-based resources (e.g., DuckDB per-project databases), use async mutex locks to prevent concurrent write races. Multiple reads are safe; writes are serialized.

## Encryption

- **AES-256-GCM** for stored secrets (API keys, credentials). Format: `iv:tag:ciphertext` (hex-encoded).
- **Never expose decrypted secrets** in logs, error messages, or API responses.
- **Timing-safe comparison** for credential validation (`crypto.timingSafeEqual`).

## SSE (Server-Sent Events)

- Use Fastify raw response with `text/event-stream` headers.
- Shared SSE helper utilities for consistent event formatting.
- Events follow a lifecycle pattern: `start` -> per-item `progress` -> `complete`/`error`.

## Hookify Addition (db:push warning)

```markdown
---
name: warn-db-push
enabled: true
event: bash
pattern: db:push|drizzle-kit\s+push
action: warn
---

**Prefer `db:migrate` over `db:push`.**

`db:push` bypasses migration history and can cause unpredictable schema state. Always prefer the migrate command for reviewable, repeatable changes.

Only use `db:push` as a fallback when migrate fails to apply (e.g., journal thinks migration already ran).
```

## TypeScript Settings

The PostToolUse typecheck hook for this stack:

**Root level** (fallback for `apps/` edits):
```json
"command": "if [ -f apps/server/tsconfig.json ]; then (cd apps/server && npx tsc --noEmit 2>&1 | head -20); else npx tsc --noEmit 2>&1 | head -20; fi"
```

**Package level** (for actively developed packages):
```json
"command": "cd {{MONOREPO_ROOT}}/packages/{{PACKAGE_NAME}} && npx tsc --noEmit 2>&1 | head -20"
```

## Network Allowlist (additional hosts for this stack)

Add these to `settings.json` sandbox network allowlist:
```json
"stackoverflow.com",
"developer.mozilla.org",
"nodejs.org",
"vitejs.dev",
"react.dev",
"fastify.dev",
"orm.drizzle.team",
"turbo.build",
"pnpm.io",
"tailwindcss.com"
```
