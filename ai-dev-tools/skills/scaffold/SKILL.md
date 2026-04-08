---
name: scaffold
description: "Use when the user wants to bootstrap a monorepo from scratch, scaffold a new project, generate the initial CLAUDE.md/.claude/ layout for a fresh repo, or add a new workspace package to an existing monorepo — even if they don't use the exact skill name. Supports --bootstrap (fresh monorepo) and --add-package <name> (add to existing). Default stack: node-fastify-react."
---

<help-text>
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
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

# /scaffold

Bootstraps a monorepo or adds a new package to an existing monorepo, writing a standardized `CLAUDE.md` + `.claude/` layout baked from the `node-fastify-react` template stack.

## Argument Parsing

Parse flags from `$ARGUMENTS`. Recognized tokens:

| Token | Meaning |
|---|---|
| `--bootstrap` | Fresh-monorepo mode (mutually exclusive with `--add-package`) |
| `--add-package <name>` | Add-package mode (mutually exclusive with `--bootstrap`) |
| `--stack <name>` | Template stack; default `node-fastify-react` |
| `--config <path>` | YAML file with placeholder values |
| `--has-schema` | (add-package) scaffold `src/db/schema/` |
| `--has-routes` | (add-package) scaffold `src/routes/` |
| `--has-client` | (add-package) scaffold `src/client/` |
| `--force` | Overwrite manifest-listed files (loud confirmation first) |
| `--help` | Print the `<help-text>` block verbatim and exit |

If `--help` is present, output the `<help-text>` block and stop immediately — do not execute any workflow.

If both `--bootstrap` and `--add-package` are present → error:

```
[scaffold] Cannot combine --bootstrap and --add-package. Pick one.
```

If `--stack <name>` is present and `<name>` is not `node-fastify-react` → error:

```
[scaffold] Unknown stack '<name>'. Available stacks: node-fastify-react
```

(v1 ships only one stack.)

## Mode Inference (plain `/scaffold` with no mode flag)

If neither `--bootstrap` nor `--add-package` is present, infer the mode from the current directory state:

| Detected state | Inferred mode | Action |
|---|---|---|
| cwd is empty (or contains only `.git/`) | `--bootstrap` | Proceed as bootstrap |
| cwd contains `pnpm-workspace.yaml` OR `turbo.json` | `--add-package` | Prompt: `"Add a new package? Enter package name (or Ctrl-C to cancel):"`, then proceed as `--add-package <answer>` |
| Neither (random non-empty directory) | error | Print: `"Cannot infer scaffold mode. Specify --bootstrap or --add-package <name>."` and exit |

**Do not print `--help` on plain invocation.** `--help` is only shown when explicitly requested.

## Stack Resolution

Resolve `--stack` (default `node-fastify-react`). Confirm the template directory exists:

```
ai-dev-tools/skills/scaffold/templates/<stack>/
```

If the directory does not exist → error with the available-stacks message from the argument-parsing section.

## Placeholder Resolution

The authoritative placeholder table lives at `references/placeholder-resolution.md`. Read it at invocation time to build the resolution plan. The high-level resolution order is:

1. **Auto-derive** from cwd context (see `references/placeholder-resolution.md` § Auto-derivation details).
2. **`--config <path>.yaml`** if present — validate unknown keys (fail loud), fill in known keys.
3. **Interactive prompts** for anything still unresolved, in the order specified in the reference doc, with the per-placeholder defaults from the reference doc. The user presses Enter to accept defaults.

After all placeholders resolved → print a summary table of resolved values and ask:

```
Proceed with scaffold? [Y/n]
```

On `n` → exit without writing any files. No partial state, no manifest update.

## Bootstrap Mode

Triggered by `--bootstrap` or by mode inference in an empty directory.

### Step B1 — Pre-flight checks

1. **Directory check.** If cwd contains any files other than `.git/`:
   - If `--force` not present → error: `"Directory not empty. Use --force to scaffold over existing files (skip-existing protection still applies via the manifest)."`
   - If `--force` present → continue. (Manifest still protects already-scaffolded files; only files listed in `.scaffold-manifest.yaml` get overwritten.)
2. **Git check.** If `.git/` is missing → print: `"warning: not a git repository, scaffold will create files but you'll need to run 'git init' yourself"`. Continue.
3. **Stack check.** Per the Stack Resolution section above.

### Step B2 — Resolve placeholders

Follow the Placeholder Resolution section above. For bootstrap mode, also prompt for the **first package name** during this step (used as the subdirectory name under `packages/` for the Layer 2 write).

### Step B3 — Write template layers

Iterate the three layers in order: `root/`, `package/`, `technology/`. For each file under `templates/<stack>/<layer>/`:

1. **Compute target path.** Layer mappings:
   - `root/<path>` → `./<path>` at monorepo root (e.g., `root/CLAUDE.md` → `./CLAUDE.md`; `root/.claude/settings.json` → `./.claude/settings.json`).
   - `package/<path>` → `./packages/<first-package-name>/<path>` (e.g., `package/CLAUDE.md` → `./packages/<first-package-name>/CLAUDE.md`).
   - `technology/<path>` → merged into the root layer's files; see Step B3.5 below.
2. **Skip-existing check.**
   - Read `.scaffold-manifest.yaml` at monorepo root. If it does not exist, treat the manifest as empty (all files are "user-modified").
   - If target file does not exist → write it, append target path to the in-memory manifest list.
   - If target file exists AND is in the manifest AND `--force` is true → overwrite, keep in manifest.
   - If target file exists AND is in the manifest AND `--force` is false → skip silently.
   - If target file exists AND is NOT in the manifest → skip with warning: `"warning: file <path> exists but is not in the scaffold manifest, skipping (likely user-modified)"`.
3. **Placeholder substitution.** Read the template file content. Replace every `{{PLACEHOLDER}}` marker with its resolved value from Step B2. Write the substituted content.
4. **Create parent directories** as needed before writing.

### Step B3.5 — Technology layer merges into root layer

The technology layer does NOT write separate files. Instead:

1. **`technology/CLAUDE.md`** → append its content (after substitution) to the just-written root `CLAUDE.md` as a new trailing section. The tech file already starts with an H2 heading; no extra separator needed.
2. **`technology/.claude/settings.json`** → deep-merge its content (after substitution) into the just-written root `.claude/settings.json`. Merge rules:
   - **Array-valued keys** (e.g., `hooks`, `allowedHosts`): concatenate — root values first, then technology values appended. Preserve order.
   - **Scalar-valued keys** (string/number/bool): technology value wins on conflict.
   - **Object-valued keys**: recurse the deep-merge rule.
   - Applies to `permissions`, `hooks`, `network` keys (and any others present).
3. **`technology/.claude/hookify.warn-db-push.local.md`** → treat as a normal file-write to `./.claude/hookify.warn-db-push.local.md` (not a merge); apply skip-existing check.

### Step B4 — Write manifest and post-scaffold output

1. Write `.scaffold-manifest.yaml` to monorepo root:

   ```yaml
   # .scaffold-manifest.yaml
   stack: node-fastify-react
   created: <ISO-8601 timestamp>
   files:
     - CLAUDE.md
     - .claude/settings.json
     - .claude/hotspots.md
     - .claude/hookify.block-git-operations.local.md
     - .claude/hookify.block-sql-writes.local.md
     - .claude/hookify.warn-db-push.local.md
     - packages/<first-package-name>/CLAUDE.md
     - packages/<first-package-name>/.claude/settings.json
   ```

   Include every file the scaffold actually wrote in this run. Skipped files are NOT added.

2. Print summary:

   ```
   Scaffold complete.
     Stack: node-fastify-react
     Files written: <N>
     Location: <monorepo-root-absolute-path>
   ```

3. Print wire-up checklist:

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

### Bootstrap edge cases

| Case | Behavior |
|---|---|
| `--bootstrap` in non-empty directory, no `--force` | Error, mention `--force` |
| `.git/` missing | Warn, continue |
| User aborts at the `Proceed? [Y/n]` prompt with `n` | Exit cleanly, no files written, no manifest |
| `--config` references unknown keys | Error, list unknown keys and valid key set |
| `--config` missing required keys | Fall back to interactive prompts for just those keys |
| Manifest file corrupt (invalid YAML) | Error: `"Manifest file <path> is corrupt. Fix or delete to proceed."` |
| `--force` in a fully-bootstrapped dir | Print loud confirmation: `"--force will OVERWRITE every file listed in .scaffold-manifest.yaml (N files). Proceed? [y/N]"`. Default `N`. |

## Add-Package Mode

Triggered by `--add-package <name>` or by mode inference in a directory containing `pnpm-workspace.yaml` or `turbo.json`.

### Step A1 — Pre-flight checks

1. **Monorepo root check.** Cwd must contain `pnpm-workspace.yaml` OR `turbo.json`. If neither → error: `"Not a monorepo root. cd to the monorepo root or use --bootstrap to create one."`
2. **Package name validation.** `<name>` must be a valid npm package name: lowercase, no spaces, no leading dots, no uppercase letters. Regex check: `^[a-z0-9][a-z0-9._-]*$`. If invalid → error: `"Invalid package name '<name>'. npm package names must be lowercase, no spaces, no leading dots."`
3. **Package collision check.** If `packages/<name>/` already exists → error: `"Package <name> already exists at packages/<name>/. Pick a different name or remove the existing directory."`
4. **Stack check.** Per the Stack Resolution section above.

### Step A2 — Resolve placeholders

1. Auto-derive `{{MONOREPO_ROOT}}`, `{{PACKAGE_MANAGER}}`, `{{BUILD_TOOL}}` per `references/placeholder-resolution.md`.
2. `{{PACKAGE_NAME}}` ← `<name>` from the `--add-package` argument.
3. `{{@scope/package-name}}` → read root `package.json` `name` field. Extract scope (the part before `/` if `name` starts with `@`). Produce `@<scope>/<name>`. If root has no scope → prompt the user for the scope.
4. `{{PACKAGE_DESCRIPTION}}` → prompt, or `package_description:` from `--config`.
5. `{{@scope/dep-package}}` (multi-value, optional) → prompt: `"Workspace dependencies for this package? (comma-separated, blank for none):"`, or `deps:` list from `--config`.
6. After all placeholders resolved → print a summary table and ask `"Proceed with scaffold? [Y/n]"`. On `n` → exit without writing files.

### Step A3 — Write package layer

For each file under `templates/<stack>/package/`:

1. **Compute target path.** `package/<path>` → `./packages/<name>/<path>` (e.g., `package/CLAUDE.md` → `./packages/<name>/CLAUDE.md`; `package/.claude/settings.json` → `./packages/<name>/.claude/settings.json`).
2. **Skip-existing check** per the same rules as bootstrap Step B3.
3. **Substitute placeholders**, write the file, append to in-memory manifest list.
4. **Create parent directories** as needed.

Then conditionally scaffold subdirectories:

- If `--has-schema` → create `packages/<name>/src/db/schema/` and write `packages/<name>/src/db/schema/.gitkeep` (empty file).
- If `--has-routes` → create `packages/<name>/src/routes/` and write `packages/<name>/src/routes/.gitkeep`.
- If `--has-client` → create `packages/<name>/src/client/` and write `packages/<name>/src/client/.gitkeep`.

Each `.gitkeep` file is added to the manifest. If `.gitkeep` already exists → skip silently (content-free, replacement is a no-op).

### Step A4 — Wire workspace declarations

1. **Update `pnpm-workspace.yaml`** using text-level insertion (not YAML parse-and-rewrite — standard YAML parsers strip comments):
   - Read the file as text.
   - Search for a line matching `packages/<name>` exactly. If found → skip silently (already registered).
   - Find the `packages:` block. If it is an inline empty list (`packages: []`) → rewrite to block form: `packages:\n  - packages/<name>`.
   - If the `packages:` block is present in block form → find the last line starting with `  - ` under the block, append `  - packages/<name>` on a new line immediately after it using 2-space indentation.
   - If `packages:` is missing from the file entirely → append a new block at the end of the document:
     ```
     packages:
       - packages/<name>
     ```
   - If the `packages:` block cannot be located for any other reason (e.g., malformed YAML, unexpected structure) → print warning: `"warning: could not update pnpm-workspace.yaml, wire it manually"`. Do not abort.
   - Write the modified text back.
2. **Update root `CLAUDE.md` Workspace Packages table:**
   - Read the root `CLAUDE.md`.
   - Locate the `## Workspace Packages` heading (exact string). If not found, try `### Workspace Packages`. If neither → print warning: `"warning: could not locate Workspace Packages table in root CLAUDE.md, skipping table update — add the row manually"`, continue.
   - Read the header row directly below the heading to determine column layout. Typical layout: `| Package | Description | Path |`.
   - Append a new row immediately after the last existing row:
     ```
     | @<scope>/<name> | <description> | packages/<name>/ |
     ```
   - Write the modified file back.
3. If either wiring step fails for any reason → print warning, do NOT abort. Package files are already written; wiring failures are recoverable via the wire-up checklist.

### Step A5 — Manifest update and wire-up checklist

1. **Update `.scaffold-manifest.yaml`:** read the existing manifest (if any), append the new package's files to the `files:` list. Do NOT rewrite existing manifest entries. Preserve the existing `stack:` and `created:` top-level fields. If the manifest is missing → create a fresh one listing only the files written in this run.
2. Print summary:

   ```
   Package <name> scaffolded.
     Files: <N>
     has-schema: <true|false>
     has-routes: <true|false>
     has-client: <true|false>
   ```

3. Print wire-up checklist:

   ```
   Package <name> scaffolded. Remaining manual steps:

     1. If your package has routes: register them in apps/server/src/app.ts
        Example: app.register(import('@<scope>/<name>'))
     2. If your package has client hooks: import them in apps/client/src/main.tsx
     3. Run 'pnpm install' to link the workspace symlinks
     4. Add a typecheck script to packages/<name>/package.json if not already there
   ```

4. Exit successfully.

### Add-package edge cases

| Case | Behavior |
|---|---|
| Not a monorepo root | Error mentioning `--bootstrap` |
| Package name collision | Error, do not merge |
| Invalid npm package name | Error before doing any work |
| Manifest missing | Treat as user-modified; create fresh manifest with just the new package's files |
| Workspace-declaration update fails | Warn, continue (files already written) |
| Root `CLAUDE.md` Workspace Packages table not found | Warn, continue |
| `.gitkeep` already exists | Skip silently |
| Ambiguous package manager (multiple lockfiles) | Pick in priority order: pnpm-lock.yaml → bun.lockb → package-lock.json → default pnpm. Print choice. |

## References

- `references/placeholder-resolution.md` — authoritative list of every `{{PLACEHOLDER}}` marker, resolution source per placeholder, and `--config` YAML schema.

## Design decisions (v1)

- **Templates only, no convention generation.** Drizzle test generation, declarative `conventions:` blocks, ESLint rule generation are deferred. v1 ships the 10 template files verbatim.
- **No `app.ts` or `main.tsx` wiring** during `--add-package`. Wiring is project-specific and gets messy when automated. The scaffold prints a wire-up checklist instead.
- **`--force` is asymmetric.** Overrides manifest-listed files, but does NOT override files that are not in the manifest. User files are always protected.
- **Plain `/scaffold` does mode inference, not help printing.** `--help` is only shown when explicitly requested.
- **Unknown config keys are errors; missing config keys fall back to prompts.** Typos are silent and dangerous; partial configs are intentional.
- **Manifest corruption is fail-loud.** Never silently regenerate.
- **Layer 3 (`technology/`) merges into Layer 1 root files** rather than writing separately. Arrays concatenate (root first); scalars use technology value on conflict; objects recurse.
- **Only stack in v1: `node-fastify-react`.** The `--stack` flag exists for future extensibility.
