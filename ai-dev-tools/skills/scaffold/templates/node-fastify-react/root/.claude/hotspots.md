# Hotspots

## 1) Repo Overview
- **{{PACKAGE_MANAGER}} workspaces + {{BUILD_TOOL}}** monorepo: `apps/` + `packages/`.
- Primary runtime entrypoints: `{{BACKEND_ENTRY}}`, `{{FRONTEND_ENTRY}}`.
- API surface is route-based in `packages/*/src/server/*.routes.ts`, registered via the backend entry.
- DB schema + migrations live in `{{MIGRATIONS_PATH}}`.
- Local infra via `docker-compose.yml`.

## 2) Workspace Packages

| Package | Purpose | Key exports |
|---|---|---|
| `{{@scope/package}}` | {{description}} | {{export paths}} |

## 3) Hotspot Map

| Area | Start here files (entry points) | High-change files/dirs | Config/secrets locations | Notes |
|---|---|---|---|---|
| Backend API | `{{BACKEND_ENTRY}}` (wires all package routes) | `packages/*/src/server/` | `.env.example`, `config/env.ts` | Backend registers all package routes at startup. |
| Frontend Web | `{{FRONTEND_ENTRY}}` | `apps/client/src/pages/` | `vite.config.ts` | Routing + auth gate in main app component. |
| Data/DB | `{{DB_CONFIG}}`, `{{SCHEMA_DIR}}` | `{{MIGRATIONS_PATH}}` | `drizzle.config.ts`, `config/env.ts` | Schema updates cascade into services + tests. |

## 4) Commands (copy/paste)

### Find entrypoints
```bash
rg --files packages/*/src apps/client/src apps/server/src | rg "(routes\\.ts$|main\\.tsx$|App\\.tsx$|app\\.ts$|api\\.ts$)"
```

### Find routing
```bash
rg -n "/api/v1/" packages/*/src/server/*.routes.ts packages/*/src/server/**/*.routes.ts
```

### Find config
```bash
rg -n "process\\.env|DATABASE_URL|REDIS_URL" apps/server/src packages/*/src -g"*.ts"
```

### Find tests
```bash
rg --files | rg "\\.test\\.ts$"
```

### Build / typecheck / test
```bash
{{BUILD_COMMAND}}
{{TYPECHECK_COMMAND}}
{{TEST_COMMAND}}
```

## 5) Dependency / Integration Touchpoints
- Client -> API boundary: shared API client, hooks, `packages/*/src/server/*.routes.ts`
- Auth boundary: auth package barrel, client auth store
- DB boundary: database config, schema barrel
- Queue/Redis boundary: pipeline/queue package (producers), workers (consumers)
- Secrets/encryption boundary: env config, encryption utilities
