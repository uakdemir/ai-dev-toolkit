# Placeholder Resolution — node-fastify-react stack

Authoritative list of every `{{PLACEHOLDER}}` marker used across the three template layers (`root/`, `package/`, `technology/`) and how the `/scaffold` skill resolves each one.

**Resolution source legend:**

| Source | Meaning |
|---|---|
| `auto` | Derived at runtime from project context (cwd, lockfiles, config files) |
| `prompt-bootstrap` | Asked interactively in `--bootstrap` mode (not in `--add-package`) |
| `prompt-addpkg` | Asked interactively in `--add-package` mode (not in `--bootstrap`) |
| `config` | Can be supplied via `--config <path>.yaml`; falls back to the other source if missing |

**Config key normalization:** YAML keys in `--config` files are `snake_case`; the skill normalizes them to the `{{UPPER_CASE}}` placeholder names. For example, YAML `project_name:` → placeholder `{{PROJECT_NAME}}`.

## Placeholder table

| Placeholder | Example | Used in | Source | Default |
|---|---|---|---|---|
| `{{PROJECT_NAME}}` | `MyApp` | root/CLAUDE.md | prompt-bootstrap, config | basename of cwd |
| `{{PROJECT_DESCRIPTION}}` | `AI-powered analytics platform` | root/CLAUDE.md | prompt-bootstrap, config | (empty, user must type) |
| `{{BUILD_COMMAND}}` | `npx turbo build` | root/CLAUDE.md, hotspots.md | prompt-bootstrap, config | `npx turbo build` |
| `{{DEV_COMMAND}}` | `pnpm dev` | root/CLAUDE.md | prompt-bootstrap, config | `pnpm dev` |
| `{{TYPECHECK_COMMAND}}` | `npx turbo typecheck` | root/CLAUDE.md, hotspots.md | prompt-bootstrap, config | `npx turbo typecheck` |
| `{{TEST_COMMAND}}` | `npx turbo test` | root/CLAUDE.md, hotspots.md | prompt-bootstrap, config | `npx turbo test` |
| `{{MIGRATE_COMMAND}}` | `pnpm run db:migrate` | root/CLAUDE.md | prompt-bootstrap, config | `pnpm run db:migrate` |
| `{{TYPECHECK_HOOK_COMMAND}}` | `npx tsc --noEmit 2>&1 \| head -20` | root/.claude/settings.json | prompt-bootstrap, config | `npx tsc --noEmit 2>&1 \| head -20` |
| `{{BACKEND_ENTRY}}` | `apps/server/src/app.ts` | hotspots.md | prompt-bootstrap, config | `apps/server/src/app.ts` |
| `{{FRONTEND_ENTRY}}` | `apps/client/src/main.tsx` | hotspots.md | prompt-bootstrap, config | `apps/client/src/main.tsx` |
| `{{MIGRATIONS_PATH}}` | `apps/server/src/db/migrations` | hotspots.md | prompt-bootstrap, config | `apps/server/src/db/migrations` |
| `{{DB_CONFIG}}` | `apps/server/src/config/database.ts` | hotspots.md | prompt-bootstrap, config | `apps/server/src/config/database.ts` |
| `{{SCHEMA_DIR}}` | `apps/server/src/db/schema` | hotspots.md | prompt-bootstrap, config | `apps/server/src/db/schema` |
| `{{PACKAGE_MANAGER}}` | `pnpm` | hotspots.md | auto | lockfile detection, else `pnpm` |
| `{{BUILD_TOOL}}` | `Turborepo` | hotspots.md | auto | `turbo.json` → Turborepo, `nx.json` → Nx, else Turborepo |
| `{{MONOREPO_ROOT}}` | `/home/user/projects/myapp` | package/.claude/settings.json | auto | `pwd` absolute path |
| `{{PACKAGE_NAME}}` | `auth` | package/.claude/settings.json | prompt-addpkg, config; prompt-bootstrap for first package | `<name>` arg for `--add-package`; prompted for first package in bootstrap |
| `{{@scope/package-name}}` | `@myapp/auth` | package/CLAUDE.md | auto (derived from root `package.json` `name` scope) + prompt-addpkg fallback | derived from root `package.json` `name` field |
| `{{PACKAGE_DESCRIPTION}}` | `JWT auth plugin and credential management` | package/CLAUDE.md | prompt-addpkg, config; prompt-bootstrap for first package | (empty, user must type) |
| `{{@scope/dep-package}}` | `@myapp/shared` | package/CLAUDE.md | prompt-addpkg (multi-value, optional), config `deps:` list | (empty list) |

## Auto-derivation details

**`{{PACKAGE_MANAGER}}`** — scan cwd for lockfiles in priority order: `pnpm-lock.yaml` → `bun.lockb` → `package-lock.json`. Print the chosen value so the user can override via `--config` if needed. Default when no lockfile present: `pnpm`.

**`{{BUILD_TOOL}}`** — check cwd for `turbo.json` (→ `Turborepo`), `nx.json` (→ `Nx`). Default: `Turborepo`.

**`{{MONOREPO_ROOT}}`** — `pwd` at invocation time, absolute path.

**`{{@scope/package-name}}` in `--add-package`** — read root `package.json` `name` field. If it starts with `@`, extract the scope up to the first `/`. Combine with `<name>` arg: scope `@myapp` + name `auth` → `@myapp/auth`. If root `package.json` has no scope, prompt the user for the scope.

## `--config <path>.yaml` format

**Bootstrap mode:**

```yaml
project_name: MyApp
project_description: AI-powered analytics platform
build_command: npx turbo build
dev_command: pnpm dev
typecheck_command: npx turbo typecheck
test_command: npx turbo test
migrate_command: pnpm run db:migrate
typecheck_hook_command: "npx tsc --noEmit 2>&1 | head -20"
backend_entry: apps/server/src/app.ts
frontend_entry: apps/client/src/main.tsx
migrations_path: apps/server/src/db/migrations
db_config: apps/server/src/config/database.ts
schema_dir: apps/server/src/db/schema
```

**Add-package mode:**

```yaml
package_name: auth
package_scope: "@myapp"
package_description: JWT auth plugin and credential management
deps:
  - "@myapp/shared"
  - "@myapp/db"
```

## Validation rules

- **Unknown keys** in the YAML file → fail loud, list unknown keys and the valid key set.
- **Missing required keys** → fall back to interactive prompt for only those keys; do not fail the run.
- **`package_name`** in add-package config must match the `--add-package <name>` argument if both are present; if they disagree, fail loud with both values.
