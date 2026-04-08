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

<!-- Add-package mode populated in Task 5 -->
