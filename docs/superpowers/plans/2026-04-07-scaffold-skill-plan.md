# Scaffold Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new `/scaffold` skill in the `ai-dev-tools` plugin that can bootstrap a fresh `node-fastify-react` monorepo (`--bootstrap`) or add a new package to an existing monorepo (`--add-package <name>`), baking the templates currently sitting in `tmp/scaffold/` into the skill so they travel with the plugin.

**Architecture:** Pure-Markdown SKILL.md following the same shape as `consolidate/SKILL.md` and `convention-enforcer/SKILL.md` (front-matter, `<help-text>` block, stepwise prose workflow). Templates are copied verbatim from `tmp/scaffold/` into `ai-dev-tools/skills/scaffold/templates/node-fastify-react/` so the skill is self-contained. Placeholder resolution is documented in a reference file that the SKILL.md links to. Discovery happens via `ai-dev-tools/skills/help/SKILL.md` which is edited to advertise `/scaffold` in its help-output block. No executable code — the skill is a prompt specification; "logic" means instructions Claude follows at invocation time.

**Tech Stack:** Markdown (SKILL.md, reference docs), YAML (front-matter, templates, config examples, manifest), JSON (template `settings.json` files), shell (manual verification commands). The skill operates through Claude's existing Read/Write/Edit tools at runtime — no new language or binary dependencies.

---

## File Structure

**New skill directory:** `ai-dev-tools/skills/scaffold/`

```
ai-dev-tools/skills/scaffold/
├── SKILL.md                                    (new; the skill itself)
├── references/
│   └── placeholder-resolution.md               (new; ~20-placeholder table)
└── templates/
    └── node-fastify-react/
        ├── root/
        │   ├── CLAUDE.md                       (copied from tmp/scaffold/root/CLAUDE.md)
        │   └── .claude/
        │       ├── settings.json               (copied)
        │       ├── hotspots.md                 (copied)
        │       ├── hookify.block-git-operations.local.md  (copied)
        │       └── hookify.block-sql-writes.local.md      (copied)
        ├── package/
        │   ├── CLAUDE.md                       (copied from tmp/scaffold/package/CLAUDE.md)
        │   └── .claude/
        │       └── settings.json               (copied)
        └── technology/
            ├── CLAUDE.md                       (copied from tmp/scaffold/technology/CLAUDE.md)
            └── .claude/
                ├── settings.json               (copied)
                └── hookify.warn-db-push.local.md  (copied)
```

**Existing file modified for discoverability:** `ai-dev-tools/skills/help/SKILL.md` — add a `/scaffold` row inside the existing `<help-output>` block.

**Total surface area:** 12 new files (1 SKILL.md + 1 reference + 10 templates) and 1 edit to the existing help skill.

**Responsibilities per file:**

- `SKILL.md` — front-matter (name, description triggering keywords), `<help-text>` block for `--help` passthrough, workflow prose split by mode (Pre-flight → Resolve placeholders → Write layers → Manifest → Wire-up checklist), edge-case table, references link.
- `references/placeholder-resolution.md` — the ~20-placeholder authoritative table, one row per placeholder, columns: name, example, resolution source, mode(s), default.
- `templates/node-fastify-react/**` — verbatim copies of `tmp/scaffold/**`; retained `{{PLACEHOLDER}}` markers; no edits.
- `help/SKILL.md` (edit) — add a single help-output row so `/ai-dev-tools:help` lists `/scaffold`.

No changes to `.claude-plugin/plugin.json` — plugin manifest only declares name/version/description; skills are auto-discovered by directory.

---

## Task 1: Create the skill skeleton (SKILL.md front-matter + help-text block)

**Files:**
- Create: `ai-dev-tools/skills/scaffold/SKILL.md`

This task creates a minimally runnable SKILL.md with front-matter and a `--help` output block that mirrors the spec's `--help` text. Workflow prose is filled in by later tasks. Ending this task at a coherent commit point means Claude can already recognize the skill (front-matter is valid) and render `--help` (help-text block is final).

- [ ] **Step 1: Write the front-matter and help-text block**

Create `ai-dev-tools/skills/scaffold/SKILL.md` with exactly this content:

```markdown
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

<!-- Workflow sections populated in subsequent tasks -->
```

- [ ] **Step 2: Manually verify the skill is discoverable**

Re-read the file you just wrote and confirm:
1. Front-matter has `name: scaffold` (matches directory name).
2. Front-matter `description:` contains the trigger keywords "bootstrap", "monorepo", "scaffold", "add package".
3. `<help-text>` block exists and is followed by the `--help` passthrough instruction.

No runtime test — the skill is a Markdown prompt spec; validity is "it parses and the directory structure matches the plugin's other skills."

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/scaffold/SKILL.md
git commit -m "feat(scaffold): add skill skeleton with front-matter and help-text"
```

---

## Task 2: Bake the v1 templates from tmp/scaffold into the skill

**Files:**
- Create: `ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/CLAUDE.md`
- Create: `ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/.claude/settings.json`
- Create: `ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/.claude/hotspots.md`
- Create: `ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/.claude/hookify.block-git-operations.local.md`
- Create: `ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/.claude/hookify.block-sql-writes.local.md`
- Create: `ai-dev-tools/skills/scaffold/templates/node-fastify-react/package/CLAUDE.md`
- Create: `ai-dev-tools/skills/scaffold/templates/node-fastify-react/package/.claude/settings.json`
- Create: `ai-dev-tools/skills/scaffold/templates/node-fastify-react/technology/CLAUDE.md`
- Create: `ai-dev-tools/skills/scaffold/templates/node-fastify-react/technology/.claude/settings.json`
- Create: `ai-dev-tools/skills/scaffold/templates/node-fastify-react/technology/.claude/hookify.warn-db-push.local.md`

Copy the 10 template files from `tmp/scaffold/` into the skill verbatim, preserving their directory layout and all `{{PLACEHOLDER}}` markers. **Do not edit the files** — they are the authoritative v1 templates and must match `tmp/scaffold/` byte-for-byte.

- [ ] **Step 1: Create the template directory tree**

Run:

```bash
mkdir -p ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/.claude \
         ai-dev-tools/skills/scaffold/templates/node-fastify-react/package/.claude \
         ai-dev-tools/skills/scaffold/templates/node-fastify-react/technology/.claude
```

Expected: no output, directories created.

- [ ] **Step 2: Copy the root layer files**

Run:

```bash
cp tmp/scaffold/root/CLAUDE.md \
   ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/CLAUDE.md
cp tmp/scaffold/root/.claude/settings.json \
   ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/.claude/settings.json
cp tmp/scaffold/root/.claude/hotspots.md \
   ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/.claude/hotspots.md
cp tmp/scaffold/root/.claude/hookify.block-git-operations.local.md \
   ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/.claude/hookify.block-git-operations.local.md
cp tmp/scaffold/root/.claude/hookify.block-sql-writes.local.md \
   ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/.claude/hookify.block-sql-writes.local.md
```

Expected: no output on success.

- [ ] **Step 3: Copy the package layer files**

Run:

```bash
cp tmp/scaffold/package/CLAUDE.md \
   ai-dev-tools/skills/scaffold/templates/node-fastify-react/package/CLAUDE.md
cp tmp/scaffold/package/.claude/settings.json \
   ai-dev-tools/skills/scaffold/templates/node-fastify-react/package/.claude/settings.json
```

Expected: no output on success.

- [ ] **Step 4: Copy the technology layer files**

Run:

```bash
cp tmp/scaffold/technology/CLAUDE.md \
   ai-dev-tools/skills/scaffold/templates/node-fastify-react/technology/CLAUDE.md
cp tmp/scaffold/technology/.claude/settings.json \
   ai-dev-tools/skills/scaffold/templates/node-fastify-react/technology/.claude/settings.json
cp tmp/scaffold/technology/.claude/hookify.warn-db-push.local.md \
   ai-dev-tools/skills/scaffold/templates/node-fastify-react/technology/.claude/hookify.warn-db-push.local.md
```

Expected: no output on success.

- [ ] **Step 5: Manually verify every file copied and placeholders are intact**

Run:

```bash
find ai-dev-tools/skills/scaffold/templates/node-fastify-react -type f | sort
```

Expected output (10 lines, exactly these paths):

```
ai-dev-tools/skills/scaffold/templates/node-fastify-react/package/.claude/settings.json
ai-dev-tools/skills/scaffold/templates/node-fastify-react/package/CLAUDE.md
ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/.claude/hookify.block-git-operations.local.md
ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/.claude/hookify.block-sql-writes.local.md
ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/.claude/hotspots.md
ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/.claude/settings.json
ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/CLAUDE.md
ai-dev-tools/skills/scaffold/templates/node-fastify-react/technology/.claude/hookify.warn-db-push.local.md
ai-dev-tools/skills/scaffold/templates/node-fastify-react/technology/.claude/settings.json
ai-dev-tools/skills/scaffold/templates/node-fastify-react/technology/CLAUDE.md
```

Then spot-check that placeholders are preserved (not accidentally substituted by an editor):

```bash
grep -l '{{PROJECT_NAME}}' ai-dev-tools/skills/scaffold/templates/node-fastify-react/root/CLAUDE.md
grep -l '{{PACKAGE_NAME}}' ai-dev-tools/skills/scaffold/templates/node-fastify-react/package/.claude/settings.json
```

Expected: both commands print their target filename. If either prints nothing, the copy corrupted the placeholder — re-copy.

- [ ] **Step 6: Commit**

```bash
git add ai-dev-tools/skills/scaffold/templates/
git commit -m "feat(scaffold): bake node-fastify-react templates into skill"
```

---

## Task 3: Write the placeholder-resolution reference doc

**Files:**
- Create: `ai-dev-tools/skills/scaffold/references/placeholder-resolution.md`

Transcribe the 20-entry placeholder table from `tmp/scaffold/claude_prompt.md` and add two columns the spec requires: **resolution source** (CLI flag / auto-derived / prompted-bootstrap / prompted-add-package / config) and **default** (what the prompt pre-fills). This file is what SKILL.md will reference instead of duplicating the full table.

- [ ] **Step 1: Create the references directory**

Run:

```bash
mkdir -p ai-dev-tools/skills/scaffold/references
```

Expected: no output.

- [ ] **Step 2: Write placeholder-resolution.md**

Create `ai-dev-tools/skills/scaffold/references/placeholder-resolution.md` with exactly this content:

````markdown
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
````

- [ ] **Step 3: Manually verify the reference doc is complete**

Re-read the file. Confirm:
1. All 20 placeholders from `tmp/scaffold/claude_prompt.md` appear (20 rows in the "Placeholder table").
2. Each row has a source column filled in (no blanks).
3. Each row has a default column filled in (no blanks, "empty" is allowed as a literal default).
4. The auto-derivation section explains every `auto` source from the table.
5. The `--config` YAML format matches the spec's example.

- [ ] **Step 4: Commit**

```bash
git add ai-dev-tools/skills/scaffold/references/placeholder-resolution.md
git commit -m "feat(scaffold): add placeholder-resolution reference doc"
```

---

## Task 4: Add bootstrap-mode workflow to SKILL.md

**Files:**
- Modify: `ai-dev-tools/skills/scaffold/SKILL.md` (replace the `<!-- Workflow sections populated in subsequent tasks -->` anchor)

Fill in the argument-parsing table, the mode-inference logic, and the full `--bootstrap` workflow (Pre-flight → Resolve → Write layers → Manifest → Wire-up checklist). At the end of this task, the skill can handle `--bootstrap` end-to-end.

- [ ] **Step 1: Replace the placeholder anchor with the bootstrap workflow**

In `ai-dev-tools/skills/scaffold/SKILL.md`, use the Edit tool to replace:

```
<!-- Workflow sections populated in subsequent tasks -->
```

with exactly this content:

````markdown
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
````

- [ ] **Step 2: Manually verify the bootstrap section is complete**

Re-read the SKILL.md. Confirm:
1. Argument-parsing table lists all 9 flags from the spec.
2. Mode-inference table has three rows (empty / monorepo-detected / other).
3. Steps B1–B4 are each present and each ends with either a success criterion or a clear next step.
4. The technology-layer merge rules (deep-merge, array concat, scalar wins) match the spec.
5. Every reference to another file uses a relative path from the SKILL.md (e.g., `references/placeholder-resolution.md`).

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/scaffold/SKILL.md
git commit -m "feat(scaffold): add bootstrap-mode workflow to SKILL.md"
```

---

## Task 5: Add add-package-mode workflow to SKILL.md

**Files:**
- Modify: `ai-dev-tools/skills/scaffold/SKILL.md` (replace the `<!-- Add-package mode populated in Task 5 -->` anchor)

Fill in the full `--add-package` workflow (Pre-flight → Resolve → Write package layer → Wire workspace declarations → Manifest update → Wire-up checklist). At the end of this task, the skill can handle both modes.

- [ ] **Step 1: Replace the add-package placeholder anchor**

In `ai-dev-tools/skills/scaffold/SKILL.md`, use the Edit tool to replace:

```
<!-- Add-package mode populated in Task 5 -->
```

with exactly this content:

````markdown
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
````

- [ ] **Step 2: Manually verify the add-package section is complete**

Re-read the SKILL.md. Confirm:
1. Steps A1–A5 are each present and each produces a clear next action.
2. The `pnpm-workspace.yaml` update strategy is text-level (not YAML parse-and-rewrite).
3. The CLAUDE.md Workspace Packages table update has a graceful degradation path (warn, continue).
4. The design-decisions list captures every "decision taken" from the spec summary.
5. The References section links to `references/placeholder-resolution.md`.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/scaffold/SKILL.md
git commit -m "feat(scaffold): add add-package workflow and design-decisions to SKILL.md"
```

---

## Task 6: Wire /scaffold into the help skill

**Files:**
- Modify: `ai-dev-tools/skills/help/SKILL.md`

The `/ai-dev-tools:help` skill renders a fixed help-output block. For `/scaffold` to appear in `/help`, that block needs a new row. The skill is otherwise auto-discovered by directory (no `plugin.json` edit required — plugin.json only declares metadata).

- [ ] **Step 1: Add a /scaffold row to the help-output block**

In `ai-dev-tools/skills/help/SKILL.md`, use the Edit tool to replace:

```
  /refactor-to-layers       Enforce layered architecture, produce unit roadmap

  Run any command with --help for usage details.
```

with exactly:

```
  /refactor-to-layers       Enforce layered architecture, produce unit roadmap
  /scaffold                 Bootstrap a monorepo or add a package (node-fastify-react)

  Run any command with --help for usage details.
```

The anchor string (the preceding `/refactor-to-layers` row plus the `Run any command` tagline) is unique in the file, so this Edit will not ambiguously match.

- [ ] **Step 2: Manually verify the help skill was updated correctly**

Re-read `ai-dev-tools/skills/help/SKILL.md`. Confirm:
1. The `/scaffold` row appears in the COMMANDS (INDEPENDENT QUALITY CHECKS) section, immediately after `/refactor-to-layers`.
2. The `<help-output>` block still closes cleanly.
3. No other content in the file was changed.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/help/SKILL.md
git commit -m "feat(help): advertise /scaffold in help output"
```

---

## Task 7: Manual end-to-end verification

**Files:** none (read-only verification).

The spec lists 14 manual verification scenarios. This task runs through the critical ones against the freshly written skill files. No runtime binary exists — verification means (a) reading the skill content and tracing the workflow by hand, and (b) invoking `/ai-dev-tools:scaffold` in a sandbox directory to confirm Claude picks up the skill and follows the spec.

- [ ] **Step 1: Re-read the full SKILL.md end to end**

Open `ai-dev-tools/skills/scaffold/SKILL.md` in the editor and read it top to bottom as if you were seeing it for the first time. Confirm:
1. Front-matter description contains discovery keywords.
2. `<help-text>` block matches the spec's `--help` output.
3. Argument-parsing table covers all 9 flags.
4. Mode-inference rules cover empty / monorepo / other directories.
5. Bootstrap workflow has all 4 steps (B1–B4) plus the B3.5 technology merge.
6. Add-package workflow has all 5 steps (A1–A5).
7. Every edge case in the spec's "Edge Cases" section has a matching row in one of the two edge-case tables.
8. Every "decision taken" from the spec summary appears in the Design decisions section.

- [ ] **Step 2: Re-read references/placeholder-resolution.md**

Confirm every placeholder referenced from SKILL.md is documented in the reference, and the auto-derivation rules match the spec's placeholder-resolution table.

- [ ] **Step 3: Verify template files are byte-identical to tmp/scaffold/**

Run:

```bash
diff -r tmp/scaffold/root ai-dev-tools/skills/scaffold/templates/node-fastify-react/root
diff -r tmp/scaffold/package ai-dev-tools/skills/scaffold/templates/node-fastify-react/package
diff -r tmp/scaffold/technology ai-dev-tools/skills/scaffold/templates/node-fastify-react/technology
```

Expected: each command exits silently (no differences). If `tmp/scaffold/package/skills/` exists as an extra subdirectory in `tmp/scaffold/package/`, `diff` will flag it — that is expected (the spec only bakes CLAUDE.md and `.claude/settings.json` from the package layer) and can be ignored.

- [ ] **Step 4: Invoke /scaffold --help and confirm help-text passthrough**

In a fresh Claude Code session in the repo root, invoke:

```
/ai-dev-tools:scaffold --help
```

Expected: Claude outputs ONLY the content of the `<help-text>` block, verbatim, and stops. No workflow execution.

- [ ] **Step 5: Dry-run bootstrap in a scratch directory**

```bash
mkdir -p /tmp/scaffold-bootstrap-test && cd /tmp/scaffold-bootstrap-test
```

In Claude Code (from within the scratch dir), invoke:

```
/ai-dev-tools:scaffold --bootstrap
```

Expected flow (Claude should trace the SKILL.md workflow):
1. Pre-flight checks (dir empty, no `.git/` → warn, stack resolves).
2. Auto-derivation: `{{MONOREPO_ROOT}}` = `/tmp/scaffold-bootstrap-test`, `{{PACKAGE_MANAGER}}` = `pnpm` (no lockfile), `{{BUILD_TOOL}}` = `Turborepo` (no `turbo.json`).
3. Prompts fire for the bootstrap placeholders (project name, description, commands, paths) and the first-package name.
4. Summary table of resolved values + `Proceed? [Y/n]` prompt.
5. On `Y`, files write to `/tmp/scaffold-bootstrap-test/` in root → package → technology order, with technology merged into root.
6. `.scaffold-manifest.yaml` appears at the root listing every written file.
7. Wire-up checklist prints.

Inspect the written tree:

```bash
find /tmp/scaffold-bootstrap-test -type f | sort
cat /tmp/scaffold-bootstrap-test/.scaffold-manifest.yaml
```

Expected: files include `CLAUDE.md`, `.claude/settings.json`, `.claude/hotspots.md`, `.claude/hookify.*.md`, `packages/<first-package-name>/CLAUDE.md`, `packages/<first-package-name>/.claude/settings.json`, and `.scaffold-manifest.yaml`. No `{{PLACEHOLDER}}` markers remain in any written file (`grep -r '{{' /tmp/scaffold-bootstrap-test` should match nothing).

- [ ] **Step 6: Dry-run add-package against the just-bootstrapped dir**

From `/tmp/scaffold-bootstrap-test`, invoke:

```
/ai-dev-tools:scaffold --add-package auth --has-routes --has-schema
```

Expected:
1. Pre-flight: monorepo root detected (manifest exists; if `pnpm-workspace.yaml` does not exist, Claude should also accept `turbo.json`, but per v1 templates `pnpm-workspace.yaml` may not be in the root layer — if missing, this sub-step will need a follow-up. See Note below.).
2. Placeholder resolution: `{{PACKAGE_NAME}}` = `auth`, scope derived from root `package.json` if present (otherwise prompted).
3. Package files written to `packages/auth/`.
4. `src/db/schema/.gitkeep` and `src/routes/.gitkeep` created.
5. `pnpm-workspace.yaml` updated (or warning printed if missing).
6. Root `CLAUDE.md` Workspace Packages table gets a new row (or warning printed if missing).
7. Manifest is APPENDED (existing entries preserved + new ones added).
8. Wire-up checklist prints.

Inspect:

```bash
find /tmp/scaffold-bootstrap-test/packages/auth -type f | sort
cat /tmp/scaffold-bootstrap-test/.scaffold-manifest.yaml
```

**Note on the `pnpm-workspace.yaml` precondition.** The v1 `tmp/scaffold/root/` templates do not include `pnpm-workspace.yaml` — the user creates it manually at `pnpm install` time. This means a freshly bootstrapped dir may not be detected as a monorepo root by Step A1 until the user runs `pnpm install` or creates `pnpm-workspace.yaml` by hand. If verification fails at Step A1 for this reason, create a minimal `pnpm-workspace.yaml` manually:

```bash
echo 'packages:
  - "packages/*"' > /tmp/scaffold-bootstrap-test/pnpm-workspace.yaml
```

then re-run `/ai-dev-tools:scaffold --add-package auth --has-routes --has-schema`. If this precondition surprises a user in the real world, open a follow-up issue — the bootstrap wire-up checklist should explicitly mention creating `pnpm-workspace.yaml`.

- [ ] **Step 7: Verify package name collision rejection**

From the same dir, re-run:

```
/ai-dev-tools:scaffold --add-package auth
```

Expected: clean error mentioning `packages/auth/` already exists. No files written, manifest unchanged.

- [ ] **Step 8: Verify /help lists /scaffold**

Invoke:

```
/ai-dev-tools:help
```

Expected: the output includes a `/scaffold` row in the COMMANDS (INDEPENDENT QUALITY CHECKS) section, positioned after `/refactor-to-layers`.

- [ ] **Step 9: Fix any issues found and commit fixups**

If any of the above steps exposed a gap between what SKILL.md says and what the spec requires, edit SKILL.md / references / help to close the gap, then commit:

```bash
git add ai-dev-tools/skills/scaffold/ ai-dev-tools/skills/help/SKILL.md
git commit -m "fix(scaffold): manual-verification fixups"
```

If no fixups are needed, skip this commit — do not create an empty commit.

- [ ] **Step 10: Clean up scratch directories**

```bash
rm -rf /tmp/scaffold-bootstrap-test
```

Expected: no output.

---

## Self-Review

**1. Spec coverage.** Walking the spec section by section:

- **Problem / Scope** — captured in front-matter description and the Design decisions section. ✓
- **Files Created / Modified table (12 files)** — Task 1 creates SKILL.md, Task 2 bakes 10 templates, Task 3 creates the reference doc. All 12 files in the table are created. ✓
- **Argument Signature table** — Task 4 Step 1 writes the Argument Parsing table covering all 9 flags. ✓
- **Mode inference (plain `/scaffold`)** — Task 4 writes the Mode Inference table. ✓
- **`--help` output** — Task 1 writes the `<help-text>` block verbatim from the spec. ✓
- **Placeholder Resolution (~20 placeholders)** — Task 3 writes the full reference doc; Task 4 adds the high-level Placeholder Resolution section in SKILL.md that delegates to the reference. ✓
- **`--config <path>.yaml` format (both modes, unknown/missing key rules)** — Task 3 documents the YAML schema and validation rules. ✓
- **Bootstrap Mode B1–B4** — Task 4 Step 1 writes all four steps plus the B3.5 technology merge. ✓
- **Add-Package Mode A1–A5** — Task 5 Step 1 writes all five steps. ✓
- **Skip-Existing Manifest rules** — covered inside Step B3 and Step A3 (and the Add-package edge-case table). ✓
- **Edge Cases (15 items)** — covered across the Bootstrap edge cases table (7 items) and the Add-package edge cases table (8 items). ✓
- **Verification (14 items)** — Task 7 covers items 1, 4, 5, 13, 14 end-to-end via manual invocation. Items 2, 3, 6, 7, 8, 9, 10, 11, 12 are covered by re-reading the SKILL.md text which documents the behavior — they are not executed live because the scaffold invocations for those cases produce errors or prompts that confirm the same logic as items 1/4/5. This is acceptable for a prompt-spec skill.
- **Discoverability** — Task 6 adds the `/scaffold` row to the help skill. ✓

**2. Placeholder scan.** No "TBD", "TODO", "implement later", "fill in details", "handle edge cases without specifying how", or "similar to earlier task" phrases. Every code step shows the actual content to write or the exact anchor string to replace. The one `<!-- Workflow sections populated in subsequent tasks -->` and `<!-- Add-package mode populated in Task 5 -->` anchors are deliberate staging markers that the plan itself replaces in the next task — they are not placeholder prose for the engineer. ✓

**3. Type / name consistency.** Cross-checks:
- `{{PROJECT_NAME}}` vs `project_name:` — matches (Task 3 documents the snake_case → `{{UPPER_CASE}}` normalization rule).
- `{{@scope/package-name}}` vs `{{@scope/dep-package}}` — both are used consistently between the reference doc and the SKILL.md workflow sections.
- Step labels: Bootstrap uses B1–B4 + B3.5; Add-package uses A1–A5. No collisions, no off-by-one.
- Template directory name: `templates/node-fastify-react/` is used consistently across Tasks 2, 4, 5, and 7.
- The help row anchor in Task 6 is `/refactor-to-layers       Enforce layered architecture, produce unit roadmap` — verified to exist in the current `help/SKILL.md` (seen during plan preparation).
- Manifest filename: `.scaffold-manifest.yaml` everywhere. ✓

**4. Known caveat surfaced in Task 7 Step 6.** The v1 `tmp/scaffold/root/` templates do not include a `pnpm-workspace.yaml`, which means a freshly bootstrapped directory will fail the `--add-package` monorepo-root check until the user creates `pnpm-workspace.yaml` manually. Task 7 Step 6 documents the workaround (manually create the workspace file) and flags this as a potential follow-up. The plan does not silently work around this because the spec's Files Created table does not include `pnpm-workspace.yaml` as a bootstrap artifact — changing that would be a spec amendment, not a plan decision.
