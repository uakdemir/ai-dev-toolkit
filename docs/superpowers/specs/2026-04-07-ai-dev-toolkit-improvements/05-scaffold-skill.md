# Item 05: New `/scaffold` skill — monorepo bootstrap and add-package

**Date:** 2026-04-07
**Status:** Draft
**Depends on:** None — standalone, but ordered last because it's the largest net-new surface area in this batch

## Problem

Starting a new monorepo (or adding a new package to an existing one) means hand-copying scaffolding files, manually wiring workspace declarations, and re-deriving CLAUDE.md conventions every time. Three concrete pain points:

1. **No skill owns project bootstrap.** Today the user has to know which files go where (`root/CLAUDE.md`, `.claude/settings.json`, hookify rules, package-level `CLAUDE.md`, etc.), copy them by hand, and resolve placeholders manually. The `tmp/scaffold/` templates exist but there's no skill that bakes them and writes them to disk with placeholder substitution.

2. **Adding a package is a multi-step manual ritual.** Creating a new package means: create the directory structure, copy `package/CLAUDE.md`, copy `package/.claude/settings.json`, register the package in `pnpm-workspace.yaml`, add a row to the root `CLAUDE.md` Workspace Packages table, and (optionally) update `apps/server/src/app.ts` to register routes. The user forgets at least one step every time.

3. **Convention drift across projects.** The `tmp/scaffold/` templates encode best practices from a production monorepo (10 packages, full-stack Node/React) but they're not enforced or standardized — every new project re-invents which hooks to enable, which placeholders to fill, which directory structure to use. A scaffold skill makes the encoded conventions the default starting point.

## Scope

**In scope:**
- New `/scaffold` skill at `ai-dev-tools/skills/scaffold/`
- Two modes: `--bootstrap` (fresh monorepo) and `--add-package <name>` (add to existing monorepo)
- Plain `/scaffold` (no flags) infers mode from current directory state
- `--stack <name>` flag with default value `node-fastify-react`; v1 ships only this one stack
- Templates baked into the skill at `ai-dev-tools/skills/scaffold/templates/<stack>/` (copied verbatim from `tmp/scaffold/`)
- `{{PLACEHOLDER}}` substitution per the resolution table in `placeholder-resolution.md`
- Interactive prompts for non-derivable values (PROJECT_NAME, PACKAGE_DESCRIPTION, etc.); `--config <path>.yaml` flag to provide all values up-front and skip prompts
- Skip-existing default with a `.scaffold-manifest.yaml` recording every file the scaffold created
- `--force` flag to overwrite manifest-listed files (with a loud warning)
- `--add-package` wires `pnpm-workspace.yaml` and adds a row to root `CLAUDE.md` Workspace Packages table
- `--add-package` supports `--has-schema`, `--has-routes`, `--has-client` flags to control which subdirectories are scaffolded
- `--help` flag (only when explicitly requested, not on every plain invocation)

**Out of scope (deferred from `tmp/scaffold_recommendations.md` and `tmp/scaffold_ideas.md`):**
- Structural test generation (Drizzle convention tests, ESLint rule generation, declarative `conventions:` YAML blocks) — v1 ships templates only
- Rule re-promotion pattern (`warn` → `error` flow)
- Schema/service code templates beyond the bare directory structure
- `apps/server/src/app.ts` route registration during `--add-package` — print a wire-up checklist for the user instead
- `apps/client/src/main.tsx` client wiring during `--add-package` — same, print checklist
- `--dry-run` mode — `--force` plus skip-existing default is sufficient for v1
- Stack support beyond `node-fastify-react` — `--stack` flag exists for future extensibility but only one value is implemented
- Auto-detection of existing CLAUDE.md content for merging — skip-existing protects user files; merge is manual

## Files Created / Modified

| File | Action |
|---|---|
| `ai-dev-tools/skills/scaffold/SKILL.md` | **CREATE** — full new skill |
| `ai-dev-tools/skills/scaffold/references/placeholder-resolution.md` | **CREATE** — `{{PLACEHOLDER}}` table with resolution semantics for every placeholder |
| `ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/CLAUDE.md` | **CREATE** (copy from `tmp/scaffold/root/CLAUDE.md`) |
| `ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/.claude/settings.json` | **CREATE** (copy from `tmp/scaffold/root/.claude/settings.json`) |
| `ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/.claude/hotspots.md` | **CREATE** (copy from `tmp/scaffold/root/.claude/hotspots.md`) |
| `ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/.claude/hookify.block-git-operations.local.md` | **CREATE** (copy) |
| `ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/.claude/hookify.block-sql-writes.local.md` | **CREATE** (copy) |
| `ai-dev-tools/skills/scaffold/templates/node-fastify-react/package/CLAUDE.md` | **CREATE** (copy from `tmp/scaffold/package/CLAUDE.md`) |
| `ai-dev-tools/skills/scaffold/templates/node-fastify-react/package/.claude/settings.json` | **CREATE** (copy from `tmp/scaffold/package/.claude/settings.json`) |
| `ai-dev-tools/skills/scaffold/templates/node-fastify-react/technology/CLAUDE.md` | **CREATE** (copy from `tmp/scaffold/technology/CLAUDE.md`) |
| `ai-dev-tools/skills/scaffold/templates/node-fastify-react/technology/.claude/settings.json` | **CREATE** (copy from `tmp/scaffold/technology/.claude/settings.json`) |
| `ai-dev-tools/skills/scaffold/templates/node-fastify-react/technology/.claude/hookify.warn-db-push.local.md` | **CREATE** (copy from `tmp/scaffold/technology/.claude/hookify.warn-db-push.local.md`) |

10 template files (verbatim copies from `tmp/scaffold/`) plus `SKILL.md` and `placeholder-resolution.md` — 12 files total. No edits to existing files.

The templates retain their original `{{PLACEHOLDER}}` markers and are substituted at runtime by the skill. The reference file `placeholder-resolution.md` documents how each placeholder is resolved (CLI flag, prompt, or auto-derived from project context).

## Argument Signature

```
/scaffold [--bootstrap | --add-package <name>] [--stack <name>] [--config <path>] [--has-schema] [--has-routes] [--has-client] [--force] [--help]
```

| Argument | Required | Description |
|---|---|---|
| `--bootstrap` | one of these two | Generate a fresh monorepo from scratch (root + `.claude/` + first package). Errors if current directory is non-empty (unless `--force`). |
| `--add-package <name>` | one of these two | Add a new package to an existing monorepo. Errors if not in a monorepo root. |
| `--stack <name>` | optional | Template stack to use. Default: `node-fastify-react`. v1 only ships this one stack. |
| `--config <path>` | optional | YAML file with all placeholder values pre-filled. Skips all interactive prompts. |
| `--has-schema` | optional, `--add-package` only | Scaffold a `db/schema/` directory in the new package |
| `--has-routes` | optional, `--add-package` only | Scaffold a `routes/` directory in the new package |
| `--has-client` | optional, `--add-package` only | Scaffold a `client/` directory (frontend hook + types) |
| `--force` | optional | Overwrite manifest-listed files. Prints a loud warning before doing so. Required for `--bootstrap` in a non-empty directory. |
| `--help` | optional | Print help text and exit |

### Plain `/scaffold` (no flags) — mode inference

Plain invocation infers the mode from the current directory state:

| Detected state | Inferred mode |
|---|---|
| Empty directory (no files, or only `.git/`) | `--bootstrap` |
| Monorepo root detected (presence of `pnpm-workspace.yaml` OR `turbo.json`) | Prompt: `"Add a new package? Enter package name (or Ctrl-C to cancel):"`. On answer, proceed as `--add-package <answer>` |
| Neither (e.g., random non-empty directory) | Error: `"Cannot infer scaffold mode. Specify --bootstrap or --add-package <name>."` |

`--help` is **only** printed when explicitly requested. Plain `/scaffold` in an ambiguous directory errors with the inference message above, not with help.

### `--help` output

```
/scaffold — bootstrap a monorepo or add a package

Usage: /scaffold [--bootstrap | --add-package <name>] [options]

Modes:
  --bootstrap                  Generate a fresh monorepo (empty dir)
  --add-package <name>         Add a package to an existing monorepo

Options:
  --stack <name>               Template stack (default: node-fastify-react)
  --config <path>              YAML file with placeholder values (skips prompts)
  --has-schema                 (--add-package) include db/schema/ directory
  --has-routes                 (--add-package) include routes/ directory
  --has-client                 (--add-package) include client/ hooks
  --force                      Overwrite manifest-listed files (warns first)
  --help                       Show this help

Examples:
  /scaffold --bootstrap
  /scaffold --bootstrap --config scaffold.yaml
  /scaffold --add-package auth --has-routes --has-schema
  /scaffold --add-package billing --config billing.yaml
```

## Placeholder Resolution

The `node-fastify-react` stack uses ~20 placeholders across the three template layers (`root/`, `package/`, `technology/`) — the full authoritative list lives in `references/placeholder-resolution.md`. **Note for implementors:** A pre-existing 20-entry placeholder table is available at `tmp/scaffold/claude_prompt.md` — use this as the starting point for `references/placeholder-resolution.md` rather than re-scanning templates from scratch. SKILL.md documents only the **resolution sources** at a high level:

| Source | Placeholders | When resolved |
|---|---|---|
| **CLI flag** | (none directly) | n/a |
| **Auto-derived** from project context | `{{MONOREPO_ROOT}}`, `{{PACKAGE_MANAGER}}`, `{{BUILD_TOOL}}` | At runtime, by inspecting the cwd, presence of `pnpm-lock.yaml`/`bun.lockb`/`package-lock.json`, presence of `turbo.json`/`nx.json` |
| **Prompted** in `--bootstrap` mode | `{{PROJECT_NAME}}`, `{{PROJECT_DESCRIPTION}}`, `{{BUILD_COMMAND}}`, `{{DEV_COMMAND}}`, `{{TYPECHECK_COMMAND}}`, `{{TEST_COMMAND}}`, `{{MIGRATE_COMMAND}}`, `{{TYPECHECK_HOOK_COMMAND}}`, `{{BACKEND_ENTRY}}`, `{{FRONTEND_ENTRY}}`, `{{MIGRATIONS_PATH}}`, `{{DB_CONFIG}}`, `{{SCHEMA_DIR}}` | Interactively, in order, with sensible defaults the user can accept by pressing Enter |
| **Prompted** in `--add-package` mode | `{{PACKAGE_NAME}}`, `{{@scope/package-name}}`, `{{PACKAGE_DESCRIPTION}}`, `{{@scope/dep-package}}` (multi-value, optional) | Interactively, with `{{PACKAGE_NAME}}` defaulting to the `--add-package <name>` argument |
| **Provided via `--config`** | All of the above | All at once, from a YAML file. Missing keys fall back to prompts. |

### `--config <path>.yaml` format

```yaml
# Bootstrap-mode config example
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

```yaml
# Add-package-mode config example
package_name: auth
package_scope: "@myapp"           # produces "@myapp/auth"
package_description: JWT auth plugin and credential management
deps:                              # optional
  - "@myapp/shared"
  - "@myapp/db"
```

Keys are snake_case in the YAML file; the skill normalizes them to the `{{UPPER_CASE}}` placeholder names internally.

**Unknown keys** in the YAML file → error with the list of unknown keys (don't silently ignore — typos in config files are a common source of subtle scaffold bugs).

**Missing required keys** in the YAML file → fall back to interactive prompts for those specific keys (don't fail the whole run — partial configs are useful).

## Bootstrap Mode

When invoked as `/scaffold --bootstrap` (or inferred via empty directory):

### Step B1 — Pre-flight checks

1. **Directory check.** If cwd is non-empty (anything other than `.git/`):
   - If `--force` not present → error: `"Directory not empty. Use --force to scaffold over existing files (skip-existing protection still applies via the manifest)."`
   - If `--force` present → continue (manifest still protects already-scaffolded files; only `--force` re-runs blow them away).
2. **Git check.** If `.git/` is missing → print `"warning: not a git repository, scaffold will create files but you'll need to run 'git init' yourself"` and continue.
3. **Stack check.** Resolve `--stack` (default `node-fastify-react`); confirm `templates/<stack>/` exists in the skill directory; error if not.

### Step B2 — Resolve placeholders

1. Auto-derive `{{MONOREPO_ROOT}}` (cwd absolute path), `{{PACKAGE_MANAGER}}` (detect from lockfile if any, else default `pnpm`), `{{BUILD_TOOL}}` (detect from `turbo.json`/`nx.json` if any, else default `Turborepo`).
2. If `--config <path>` provided → load YAML, validate keys, fill in resolved values.
3. For any placeholder not yet resolved → prompt the user interactively (with sensible defaults the user can accept by pressing Enter).
4. After all placeholders resolved → print a summary table of resolved values and ask `"Proceed with scaffold? [Y/n]"`. On `n` → exit without writing files.

### Step B3 — Write template layers

In order (root → package → technology), for each file in `templates/<stack>/<layer>/`:
1. Compute target path (e.g., `templates/<stack>/root/CLAUDE.md` → `./CLAUDE.md`).
2. **Skip-existing check:** (1) Read `.scaffold-manifest.yaml` to get the list of manifest-listed (overwritable) files. (2) If target file does not exist → write it. (3) If target file exists AND is listed in the manifest AND `--force` is true → overwrite it. (4a) If target file exists AND is listed in the manifest AND `--force` is false → skip silently. (4b) If target file exists AND is NOT listed in the manifest → skip with warning: `"warning: file <path> exists but is not in the scaffold manifest, skipping (likely user-modified)"`.
3. Substitute all `{{PLACEHOLDER}}` markers in the template content.
4. Write the file.
5. Append the target path to the in-memory manifest list.

The three layers compose:
- **Layer 1 (`root/`)** → writes to monorepo root: `CLAUDE.md`, `.claude/settings.json`, `.claude/hotspots.md`, `.claude/hookify.*.local.md`.
- **Layer 2 (`package/`)** → in `--bootstrap` mode, writes the **first package** at `packages/<first-package-name>/`. The user is prompted for the first package name during Step B2.
- **Layer 3 (`technology/`)** → in v1, **merges** into the root files written in Layer 1. Specifically: appends technology/CLAUDE.md content to root/CLAUDE.md as a new section, and merges technology/.claude/settings.json into the just-written root/.claude/settings.json using the following deep-merge rules: (a) **array-valued keys** (e.g., `hooks`): concatenate — root values first, technology values appended; (b) **scalar-valued keys**: technology value wins on conflict; (c) **object-valued keys**: recurse the deep-merge rule. This applies to `permissions`, `hooks`, and `network` keys.

### Step B4 — Write manifest and post-scaffold output

1. Write `.scaffold-manifest.yaml` to monorepo root listing every file the scaffold created (relative paths).
2. Print summary: file count, layer breakdown, location.
3. Print **wire-up checklist**:
   ```
   Scaffold complete. Remaining manual steps:

     1. Run 'git init' if not already a git repo
     2. Run 'pnpm install' (or your package manager equivalent)
     3. Initialize the database (if your stack uses one):
        - Create migrations directory: <MIGRATIONS_PATH>
        - Run initial migration
     4. Verify CLAUDE.md content matches your project conventions
   ```
4. Exit successfully.

## Add-Package Mode

When invoked as `/scaffold --add-package <name>` (or inferred via monorepo-root detection + prompt):

### Step A1 — Pre-flight checks

1. **Monorepo root check.** Cwd must contain `pnpm-workspace.yaml` OR `turbo.json`. If neither → error: `"Not a monorepo root. cd to the monorepo root or use --bootstrap to create one."`
2. **Package name collision check.** If `packages/<name>/` already exists → error: `"Package <name> already exists at packages/<name>/. Pick a different name or remove the existing directory."`
3. **Stack check.** Same as bootstrap.

### Step A2 — Resolve placeholders

1. Auto-derive `{{MONOREPO_ROOT}}`, `{{PACKAGE_MANAGER}}`, `{{BUILD_TOOL}}` (same as bootstrap).
2. `{{PACKAGE_NAME}}` ← `<name>` from CLI argument.
3. `{{@scope/package-name}}` → derived from existing root `package.json` `name` field (e.g., root `name: "@myapp/root"` → scope is `@myapp` → produces `@myapp/<name>`). If root `package.json` has no scope → prompt the user.
4. `{{PACKAGE_DESCRIPTION}}` → prompted (or from `--config`).
5. `{{@scope/dep-package}}` (multi-value, optional) → prompted with `"Workspace dependencies for this package? (comma-separated, blank for none):"`.
6. Same `--config` and prompt logic as bootstrap.

### Step A3 — Write package layer

For each file in `templates/<stack>/package/`:
1. Compute target path (e.g., `templates/<stack>/package/CLAUDE.md` → `packages/<name>/CLAUDE.md`).
2. Skip-existing check (per the manifest).
3. Substitute placeholders.
4. Write the file.
5. Append to manifest.

Then conditionally:
- If `--has-schema` → create `packages/<name>/src/db/schema/` (empty directory + `.gitkeep`).
- If `--has-routes` → create `packages/<name>/src/routes/` (empty directory + `.gitkeep`).
- If `--has-client` → create `packages/<name>/src/client/` (empty directory + `.gitkeep`).

### Step A4 — Wire workspace declarations

1. **Update `pnpm-workspace.yaml`:** use text-level insertion rather than a YAML parse-and-rewrite (standard YAML parsers strip comments). Strategy: read the file as text, find the last line of the `packages:` list block (the last line that starts with `  - `), and append `  - packages/<name>` on a new line immediately after it using standard 2-space indentation. Write the modified text back. Edge cases: if `packages:` is an inline empty list (`packages: []`), rewrite it to block form (`packages:\n  - packages/<name>`) before appending. If `packages:` is missing from the file entirely, add it at the document root as a new block entry. If `packages/<name>` already appears in the file → skip silently. If the `packages:` block cannot be located for any other reason → fall back to warning and skip (same behavior as other wiring failures).
2. **Update root `CLAUDE.md` Workspace Packages table:** locate the table (find heading `## Workspace Packages` or similar; if not present → print warning and skip), add a new row:
   ```
   | @<scope>/<name> | <description> | packages/<name>/ |
   ```
   (Exact column structure matches the existing table; the skill reads the header row to determine which columns to fill.)
3. If either wiring step fails (file unparseable, table not found) → print warning, do not abort. The user can wire manually using the wire-up checklist.

### Step A5 — Manifest update and wire-up checklist

1. Update `.scaffold-manifest.yaml` (append the new package's files; do **not** rewrite the existing manifest entries).
2. Print summary: package name, files created, has-schema/has-routes/has-client flags.
3. Print **wire-up checklist** (manual steps the scaffold deliberately does NOT do):
   ```
   Package <name> scaffolded. Remaining manual steps:

     1. If your package has routes: register them in apps/server/src/app.ts
        Example: app.register(import('@<scope>/<name>'))
     2. If your package has client hooks: import them in apps/client/src/main.tsx
     3. Run 'pnpm install' to link the workspace symlinks
     4. Add a typecheck script to packages/<name>/package.json if not already there
   ```
4. Exit successfully.

## Skip-Existing Manifest

`.scaffold-manifest.yaml` is the durable record of "what the scaffold has written." It lives at monorepo root and has the structure:

```yaml
# .scaffold-manifest.yaml
stack: node-fastify-react
created: 2026-04-07T14:30:00Z
files:
  - CLAUDE.md
  - .claude/settings.json
  - .claude/hotspots.md
  - .claude/hookify.block-git-operations.local.md
  - .claude/hookify.block-sql-writes.local.md
  - packages/auth/CLAUDE.md
  - packages/auth/.claude/settings.json
  - packages/billing/CLAUDE.md
  - packages/billing/.claude/settings.json
```

**Behavior:**
- On every scaffold run, the skill reads the existing manifest (if any).
- For each file the scaffold *would* write, if the file is **listed in the manifest** AND already exists on disk → skip silently.
- For each file the scaffold *would* write, if the file is **NOT listed in the manifest** AND already exists on disk → skip with a warning (`"warning: file <path> exists but is not in the scaffold manifest, skipping (likely user-modified)"`).
- For each file the scaffold *would* write, if the file does **NOT exist** → write it and append to the manifest.
- `--force` overrides the manifest-listed-and-exists case: it overwrites those files. It does NOT override the not-in-manifest-and-exists case (user files are still protected).

**Manifest file missing:**
- Treat as "all files are user-modified" — fall back to skip-existing-by-name behavior. The scaffold creates a fresh manifest with just the files it writes in this run.

**Manifest is corrupt (invalid YAML):**
- Error: `"Manifest file <path> is corrupt. Fix or delete to proceed."` — do not silently overwrite, do not silently regenerate.

## Edge Cases

1. **`--bootstrap` in non-empty directory.** Error unless `--force` is also set. The error message explicitly mentions `--force` so the user knows the escape hatch.

2. **`--add-package` in a non-monorepo directory.** Error: `"Not a monorepo root. cd to the monorepo root or use --bootstrap to create one."` Detection is via presence of `pnpm-workspace.yaml` OR `turbo.json` — either signal is sufficient.

3. **Package name collision (`--add-package <existing-name>`).** Error: `"Package <name> already exists at packages/<name>/."` The user explicitly picks the next action (rename, remove, or scaffold elsewhere); the skill never tries to merge into an existing package.

4. **Manifest file missing on `--add-package`.** Treat as all-user-modified: skip-existing-by-name protects everything. Scaffold creates a fresh manifest containing only the new package's files.

5. **`--config` references undefined placeholder keys.** Error with the list of unknown keys: `"Unknown keys in config: foo_bar, baz_qux. Valid keys: <list>."` Don't silently ignore — typos in config files are subtle and dangerous.

6. **`--config` is missing required keys.** Fall back to interactive prompts for the missing keys only. Don't fail the run — partial configs are a useful workflow (`"my CI provides project_name, the rest I'll fill in by hand"`).

7. **Existing CLAUDE.md at the root or in a package directory.** Skip-existing protects it. The scaffold prints a warning and proceeds; the user can manually merge later.

8. **`--force` in a production-like monorepo with substantial scaffolding history.** Print a loud confirmation prompt: `"--force will OVERWRITE every file listed in .scaffold-manifest.yaml (N files). Proceed? [y/N]"`. Default is `N` (the safe answer). Only proceed on explicit `y`.

9. **Workspace declaration update fails (e.g., `pnpm-workspace.yaml` is malformed).** Print warning, do not abort. The package files are still written; the user must wire workspace declarations manually using the wire-up checklist.

10. **Root `CLAUDE.md` Workspace Packages table not found during `--add-package` wiring.** Print warning (`"warning: could not locate Workspace Packages table in root CLAUDE.md, skipping table update — add the row manually"`), continue.

11. **Auto-derived `{{PACKAGE_MANAGER}}` ambiguous (multiple lockfiles present).** Pick the first one in priority order: `pnpm-lock.yaml` → `bun.lockb` → `package-lock.json` → default `pnpm`. Print which one was chosen so the user can override via `--config` if needed.

12. **`--add-package <name>` where `<name>` contains characters invalid for npm packages (e.g., uppercase, spaces).** Error before doing any work: `"Invalid package name '<name>'. npm package names must be lowercase, no spaces, no leading dots."` Reference the npm naming rules briefly.

13. **`.gitkeep` already exists in a target subdirectory.** Skip silently — `.gitkeep` is content-free, replacing it is a no-op.

14. **User aborts at the bootstrap confirmation prompt (`Proceed? [Y/n]` → `n`).** Exit cleanly without writing any files. No partial state. No manifest update.

15. **Stack value other than `node-fastify-react`.** Error: `"Unknown stack '<name>'. Available stacks: node-fastify-react"` (single-item list for v1).

## Verification

Per project conventions: no test suite. Manual verification:

1. **Bootstrap in empty dir.** `mkdir /tmp/scaffold-test && cd /tmp/scaffold-test && /scaffold --bootstrap` — confirm prompts fire for required values, files write to disk in three layers, `.scaffold-manifest.yaml` lists all created files, wire-up checklist prints at the end.

2. **Bootstrap with config file.** Create a complete `scaffold.yaml` with all bootstrap-mode keys, run `/scaffold --bootstrap --config scaffold.yaml` — confirm zero prompts fire, all files write, manifest is correct.

3. **Bootstrap in non-empty dir without `--force`.** `cd /tmp/scaffold-test-nonempty && touch existing.txt && /scaffold --bootstrap` — confirm clean error message mentioning `--force`.

4. **Add-package to a freshly-bootstrapped monorepo.** From the bootstrap output dir, run `/scaffold --add-package auth --has-routes --has-schema` — confirm package directory writes, `pnpm-workspace.yaml` updates, root `CLAUDE.md` table gets a new row, manifest is appended to (not replaced), wire-up checklist prints.

5. **Add-package collision.** Run the same `--add-package auth` command twice — confirm the second invocation errors with the collision message.

6. **Plain `/scaffold` in empty dir.** `cd /tmp/empty && /scaffold` — confirm it infers `--bootstrap` and proceeds.

7. **Plain `/scaffold` in monorepo root.** `cd <monorepo-root> && /scaffold` — confirm it prompts for a package name and proceeds as add-package.

8. **Plain `/scaffold` in random non-empty dir.** Confirm it errors with the mode-inference message.

9. **`--config` with unknown keys.** Add a typo'd key (`projetc_name:`) to `scaffold.yaml`, run `--bootstrap --config scaffold.yaml` — confirm error lists the unknown key.

10. **`--config` with missing required keys.** Remove `project_name:` from a complete config, run — confirm prompt fires for `PROJECT_NAME` only, all other prompts skipped.

11. **`--force` with confirmation.** From a fully-bootstrapped dir, run `/scaffold --bootstrap --force` — confirm the loud confirmation prompt fires, default is `N`, type `n` and confirm exit.

12. **Manifest corruption.** Manually corrupt `.scaffold-manifest.yaml` (invalid YAML), run any `/scaffold` command — confirm fail-loud error.

13. **Read the created `SKILL.md`** and confirm it documents all placeholders by reference (pointing to `placeholder-resolution.md`), and that the per-mode flow tables match the spec.

14. **Read `placeholder-resolution.md`** and confirm every placeholder from the templates is documented with its resolution source.

---

**Summary of this spec:**
- **New `/scaffold` skill** with two modes: `--bootstrap` (fresh monorepo) and `--add-package <name>` (add to existing). Plain `/scaffold` infers mode from the directory state. Default stack is `node-fastify-react` (the only stack in v1); templates baked verbatim from `tmp/scaffold/` into `templates/node-fastify-react/`.
- **Three-layer template composition** (root → package → technology) with `{{PLACEHOLDER}}` substitution. ~20 placeholders, resolved via auto-derivation, interactive prompts, or `--config <path>.yaml`. The full authoritative reference table is generated during implementation and lives in `references/placeholder-resolution.md`.
- **Skip-existing protection** via `.scaffold-manifest.yaml` — files in the manifest can be overwritten with `--force`; files not in the manifest are protected even from `--force`. `--add-package` wires `pnpm-workspace.yaml` and the root `CLAUDE.md` Workspace Packages table; explicitly does NOT touch `apps/server/src/app.ts` or `apps/client/src/main.tsx` — those go in the wire-up checklist.

**Decisions taken:**
- **Templates only, no convention generation** — Drizzle test generation, declarative `conventions:` blocks, ESLint rule generation, rule re-promotion patterns are all deferred from `tmp/scaffold_recommendations.md` and `tmp/scaffold_ideas.md`. v1 ships templates only.
- **No `app.ts` or `main.tsx` wiring** during `--add-package` — explicit out-of-scope decision. The scaffold prints a wire-up checklist instead. Rationale: wiring is project-specific (route prefixes, middleware order, lazy-loading boundaries) and gets messy when automated.
- **`--force` is asymmetric** — overrides manifest-listed files, but does NOT override user files (files not in the manifest). This protects user work even under the most aggressive flag combination.
- **Plain `/scaffold` does mode inference, not help-printing** — `--help` is only shown when explicitly requested. Rationale: a user in an empty dir running plain `/scaffold` wants to bootstrap, not read help.
- **Unknown config keys are errors, missing config keys fall back to prompts** — asymmetry justified by failure modes (typos are silent and dangerous; missing values are intentional partial configs).
- **Manifest corruption is fail-loud** — never silently regenerate the manifest. The user must investigate and resolve.
- **Layer 3 (`technology/`) merges into Layer 1 root files** rather than writing separately — appends to root CLAUDE.md, deep-merges into root settings.json (arrays concatenated with root first; scalars use technology value on conflict; objects recurse).
