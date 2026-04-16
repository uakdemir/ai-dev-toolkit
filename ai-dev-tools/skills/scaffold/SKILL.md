---
name: scaffold
description: "Use when the user wants to bootstrap a project from scratch, scaffold a new project, generate the initial CLAUDE.md/.claude/ layout for a fresh repo, or add a new package/feature to an existing scaffolded project — even if they don't use the exact skill name. Supports --bootstrap (fresh project) and --add-package <name> (add to existing). Stacks: node-fastify-react (monorepo), expo (single-package React Native), dotnet-mvc-react (stub). `--stack` is required on bootstrap (no default)."
---

<help-text>
/scaffold — bootstrap a project or add a package/feature

Usage: /scaffold [--bootstrap | --add-package <name>] [options]

Modes:
  --bootstrap                  Scaffold a fresh project (writes governance files)
  --add-package <name>         Add a package/feature to an existing scaffolded project

Options:
  --stack <name>               REQUIRED on --bootstrap unless the cwd already has
                               a .scaffold-manifest.yaml pinning a stack. Allowlist:
                               node-fastify-react, expo, dotnet-mvc-react.
                               On --add-package, stack is read from the manifest.
  --config <path>              YAML file with placeholder values (skips prompts)
  --has-schema                 (--add-package, node-fastify-react) include db/schema/
  --has-routes                 (--add-package, node-fastify-react) include routes/
  --has-client                 (--add-package, node-fastify-react) include client/ hooks
  --force                      Overwrite manifest-listed files (refresh on template update)
  --yes                        Skip interactive confirmations (non-interactive mode)
  --help                       Show this help

Examples:
  /scaffold --bootstrap --stack node-fastify-react
  /scaffold --bootstrap --stack expo --force
  /scaffold --bootstrap --force --yes        (manifest must already pin a stack)
  /scaffold --add-package auth --has-routes --has-schema
  /scaffold --add-package matching           (reads stack from manifest)
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

# /scaffold

Bootstraps a project or adds a new package/feature to an existing scaffolded project. Writes a standardized `CLAUDE.md` + `.claude/` layout baked from one of the available template stacks.

**Available stacks** (allowlist): `node-fastify-react`, `expo`, `dotnet-mvc-react`. See § Stack Resolution for details.

## Argument Parsing

Parse flags from `$ARGUMENTS`. Recognized tokens:

| Token | Meaning |
|---|---|
| `--bootstrap` | Bootstrap mode (mutually exclusive with `--add-package`) |
| `--add-package <name>` | Add-package mode (mutually exclusive with `--bootstrap`) |
| `--stack <name>` | Template stack (required unless manifest pins one) |
| `--config <path>` | YAML file with placeholder values |
| `--has-schema` | (add-package, node-fastify-react) scaffold `src/db/schema/` |
| `--has-routes` | (add-package, node-fastify-react) scaffold `src/routes/` |
| `--has-client` | (add-package, node-fastify-react) scaffold `src/client/` |
| `--force` | Overwrite manifest-listed files (refresh on template update) |
| `--yes` | Skip interactive confirmations (see § `--yes` flag below) |
| `--help` | Print the `<help-text>` block verbatim and exit |

If `--help` is present, output the `<help-text>` block and stop immediately — do not execute any workflow.

If both `--bootstrap` and `--add-package` are present → error:

```
[scaffold] Cannot combine --bootstrap and --add-package. Pick one.
```

### `--stack` allowlist

The fixed allowlist is `["node-fastify-react", "dotnet-mvc-react", "expo"]`. If `--stack <name>` is present and `<name>` is not in the allowlist → error:

```
[scaffold] Unknown stack '<name>'. Valid stacks: node-fastify-react, dotnet-mvc-react, expo
```

### `--stack` on `--add-package`

`--stack` is NOT accepted with `--add-package`. If both are present → error:

```
[scaffold] stack is read from the manifest; `--stack` is only valid with `--bootstrap`.
```

### Manifest vs `--stack` disagreement

If a `.scaffold-manifest.yaml` already pins a stack AND `--stack` passes a different stack → error:

```
[scaffold] manifest pins stack=<pinned>, but --stack=<passed> was given.
To change stacks, delete `.scaffold-manifest.yaml` first and re-run --bootstrap.
```

If `--stack` matches the manifest-pinned stack → proceed.

### `--yes` flag

Skips all interactive confirmation prompts. Scope:
- The Step B1 `--force` overwrite confirmation on `--bootstrap`.
- The refresh `Proceed? [y/N]` prompt in the refresh workflow (§ Refresh on Template Update).
- The proceed-after-summary prompt in § Placeholder Resolution.

Use case: non-interactive execution by AI agents or automation scripts. When stdin is not a TTY and `--yes` is not passed, the scaffold errors out rather than hang (see § Refresh on Template Update, Non-interactive context handling).

## Mode Inference (plain `/scaffold` with no mode flag)

If neither `--bootstrap` nor `--add-package` is present, infer the mode from the current directory state:

| Detected state | Inferred mode | Action |
|---|---|---|
| cwd is empty (or contains only `.git/`) and `--stack` not given | n/a | exit with error listing the allowlist (`["node-fastify-react", "dotnet-mvc-react", "expo"]`) |
| cwd is empty (or contains only `.git/`) and `--stack` is given | `--bootstrap` | Proceed as bootstrap with that stack |
| cwd contains `.scaffold-manifest.yaml` (any stack) | `--add-package` | Prompt: `"Add a new package/feature? Enter name (or Ctrl-C to cancel):"`, then proceed as `--add-package <answer>`. Stack is read from the manifest. |
| cwd contains `pnpm-workspace.yaml` OR `turbo.json` without manifest | `--add-package` (node-fastify-react) | Prompt for name; treat stack as `node-fastify-react`. Error if manifest is missing and user did not pass `--bootstrap`. |
| Neither (random non-empty directory) | error | Print: `"Cannot infer scaffold mode. Specify --bootstrap --stack <name> or --add-package <name>."` and exit |

**Do not print `--help` on plain invocation.** `--help` is only shown when explicitly requested.

## Stack Resolution

Every stack has a metadata file at `ai-dev-tools/skills/scaffold/templates/<stack>/stack.yaml`. Read it at invocation time to determine layout, `add_package_target_dir`, `package_dir_creates_settings`, `bootstrap_prereq`, and `template_version`.

**Resolution order on `--bootstrap`:**
1. If `.scaffold-manifest.yaml` exists in cwd AND pins a stack → that's the stack (validate against `--stack` per § Manifest vs --stack disagreement).
2. Else if `--stack <name>` is given → that's the stack. Validate it's in the allowlist; error if not.
3. Else → error listing the allowlist. There is no default stack and no interactive stack prompt.

**Resolution on `--add-package`:**
- Read `stack:` from `.scaffold-manifest.yaml`. If the manifest is missing → error: `"Not a scaffolded project. Run `--bootstrap --stack <name>` first."`

**Stub stacks.** If the chosen stack's `stack.yaml` has `status: registered_templates_pending`, exit immediately with the `error_on_select` message from `stack.yaml` (e.g., "stack registered, templates pending") and write NOTHING. This is the behaviour for `dotnet-mvc-react` at v0.0.0.

**Bootstrap prerequisites.** If the chosen stack's `stack.yaml` declares `bootstrap_prereq`, evaluate each entry in the `any_of:` list before writing any files:
- `file_exists: <path>` → cwd must contain `<path>`.
- `package_json_dependency: <name>` → cwd must have `package.json` with `<name>` listed under `dependencies` or `devDependencies`.
If none of the `any_of:` entries match → exit with the `error_message` field and write nothing. (For the `expo` stack, this enforces "run `create-expo-app` first.")

## Placeholder Resolution

### Authoritative placeholder lists

| Stack | Authoritative placeholder source |
|---|---|
| `node-fastify-react` | `ai-dev-tools/skills/scaffold/references/placeholder-resolution.md` |
| `expo` | Mobile Scaffold Integration spec § Section 3 root-layer and package-layer placeholder tables (`{{PROJECT_NAME}}`, `{{STACK_DECISIONS_DOC_PATH}}`, `{{FEATURE_NAME}}`, `{{FEATURE_DESCRIPTION}}`, `{{RELATED_SDKS}}`) |
| `dotnet-mvc-react` | n/a (stub, no placeholders resolved) |

The high-level resolution order is:
1. **Auto-derive** from cwd context where documented (e.g., directory basename for `{{PROJECT_NAME}}`).
2. **`--config <path>.yaml`** if present — validate unknown keys (fail loud), fill in known keys.
3. **Interactive prompts** for anything still unresolved, with the per-placeholder defaults documented in the authoritative source. The user presses Enter to accept defaults.

Under `--yes`, the scaffold MUST NOT prompt; any unresolved placeholder with no default and no config value is a hard error with message `"Placeholder {{X}} cannot be resolved non-interactively. Pre-seed via --config or the manifest's placeholders: map."`.

After all placeholders resolved → print a summary table of resolved values and ask:

```
Proceed with scaffold? [Y/n]
```

On `n` → exit without writing any files. No partial state, no manifest update. Under `--yes`, skip the prompt and proceed.

### Placeholder substitution rules (canonical)

- **Per-layer substitution.** Placeholder substitution happens per-layer on raw template bytes BEFORE any append or deep-merge (Change 3 dispatch; see § Technology Layer Dispatch).
- **Single flat namespace.** The manifest `placeholders:` map is a single flat namespace applied uniformly across every layer. If two layers reference the same token they both receive the same value; template authors MUST use distinct placeholder names for distinct values.
- **Blank-value line dropping.** For specific placeholders documented as "omit if blank" (notably `{{STACK_DECISIONS_DOC_PATH}}` for expo), if the resolved value is the empty string, the entire line containing the placeholder is dropped from the output. This prevents broken file references in generated projects.
- **Literal `{{X}}` escape syntax.** Template authors who need a literal `{{IDENTIFIER}}` token in generated output write it as `{{{{IDENTIFIER}}}}` in the template source. After all placeholder substitution completes, the substitution pass replaces every `{{{{` with `{{` and every `}}}}` with `}}`.
- **Strict identifier regex.** Placeholder tokens match the regex `\{\{([A-Z][A-Z0-9_]*)\}\}`: must start with two braces + an uppercase letter, allow uppercase/digit/underscore after. Markdown or documentation prose with lowercase `{{x}}` or `{{ something }}` does NOT trigger substitution.

### New-placeholder discovery (refresh)

At refresh time, after substituting all stored placeholder values into every template layer's substituted bytes, the scaffold scans each substituted byte stream with `\{\{([A-Z][A-Z0-9_]*)\}\}`. Every remaining match is a **new placeholder** introduced by the current template version:
- Under interactive mode: prompt for a value (showing every template file path where it appeared), store in the manifest `placeholders:` map.
- Under `--yes`: abort with `"New placeholder {{X}} introduced by template version Y requires interactive input. Re-run without --yes, or pre-seed the manifest's placeholders: map with a value for X."` using the first unresolved identifier as `X`.

### Cross-layer collision notice

During bootstrap and refresh, the scaffold collects every `{{IDENTIFIER}}` occurrence from each layer's raw (pre-substitution) template bytes into a map `identifier -> set[layer]`. If any identifier appears in more than one layer, the scaffold emits a **notice (not an error)**:

```
Placeholder {{IDENTIFIER}} is defined in multiple template layers ([root, technology, ...]);
the manifest's flat placeholders: value applies uniformly to all occurrences. If you need
distinct per-layer values, rename one of the identifiers in the template source.
```

This converts a silent-bug failure mode into a visible notice at the moment a human is most likely watching.

## Bootstrap Mode

Triggered by `--bootstrap` or by mode inference in an empty directory with `--stack` set.

### Step B1 — Pre-flight checks

1. **Stack check.** Per § Stack Resolution. If the chosen stack's `stack.yaml` has `status: registered_templates_pending`, exit with the `error_on_select` message and write nothing.
2. **Bootstrap prerequisite check.** If the stack's `stack.yaml` declares `bootstrap_prereq`, evaluate it (see § Stack Resolution). On failure, exit with the `error_message` and write nothing. (For `expo`: requires `app.json` OR `package.json` with an `expo` dependency.)
3. **Directory check.**
   - If cwd contains `.scaffold-manifest.yaml` (already scaffolded):
     - Without `--force` → error: `"Project already scaffolded. Pass --force to refresh, or run --add-package to add a feature."`
     - With `--force` → proceed into the refresh workflow (§ Refresh on Template Update). `--force` is REQUIRED for refresh.
   - If cwd is non-empty but has no `.scaffold-manifest.yaml`:
     - For stacks with a `bootstrap_prereq` (e.g., expo), the prerequisite check in step 2 already validated that the expected pre-existing files are present. In that case, non-emptiness is EXPECTED (the user just ran `create-expo-app`). Do NOT require `--force`.
     - For stacks WITHOUT `bootstrap_prereq` (e.g., node-fastify-react): warn if cwd contains files other than `.git/`. Without `--force` → error: `"Directory not empty. Use --force to scaffold over existing files (skip-existing protection still applies via the manifest)."` With `--force` → continue. (Manifest still protects already-scaffolded files; only files listed in `.scaffold-manifest.yaml` get overwritten.)
   - First-time bootstrap with no manifest: `--force` is optional and has no effect — silently accepted so scripts always-passing `--force` keep working.
4. **Git check.** If `.git/` is missing → print: `"warning: not a git repository, scaffold will create files but you'll need to run 'git init' yourself"`. Continue.

### Step B2 — Resolve placeholders

Follow § Placeholder Resolution for the chosen stack's placeholder list.

- For `node-fastify-react` bootstrap, also prompt for the **first package name** (used as the subdirectory name under `packages/` for the package-layer write).
- For `expo` bootstrap, the package layer is NOT written at bootstrap time (features are added later via `--add-package`). No first-feature prompt.

### Step B3 — Write template layers

Iterate layers in this order: `root/`, `package/` (skipped for expo bootstrap), `technology/`. For each file under `templates/<stack>/<layer>/`, dispatch per § Technology Layer Dispatch.

**Target-path mapping:**
- `root/<path>` → `<cwd>/<path>` at project root.
- `package/<path>` → `<cwd>/<add_package_target_dir>/<name>/<path>`:
  - `node-fastify-react`: `<cwd>/packages/<first-package-name>/<path>`.
  - `expo`: not written during bootstrap.
- `technology/<path>` → per § Technology Layer Dispatch.

**Skip-existing / force semantics:**
- If target file does not exist → write it, record in the in-memory manifest list with `source_layer: <layer>` (or `source_layers:` for multi-layer files — see § Technology Layer Dispatch).
- If target file exists AND is in the manifest AND `--force` is true → overwrite, keep in manifest.
- If target file exists AND is in the manifest AND `--force` is false → route to the refresh workflow (`--force` is REQUIRED to overwrite — see Step B1.3).
- If target file exists AND is NOT in the manifest → skip with warning: `"warning: file <path> exists but is not in the scaffold manifest, skipping (likely user-modified)"`.

**Placeholder substitution** happens per § Placeholder Resolution rules: on raw template bytes before any append or merge.

**Create parent directories** as needed before writing.

### Step B3.5 — Technology layer dispatch

The technology layer writes are governed by the three-rule algorithm in § Technology Layer Dispatch. Rules 1 and 2 (CLAUDE.md append, settings.json deep-merge) compose with the already-written root-layer output; rule 3 writes arbitrary nested files to their mirrored path.

### Step B4 — Write manifest and post-scaffold output

1. **Write `.scaffold-manifest.yaml`** to the project root using the new schema (§ Manifest Schema). Every file the scaffold actually wrote appears under `files:` as an object with `path:` and `source_layer:` (or `source_layers:` list for multi-layer). Skipped files are not added. The top-level `placeholders:` map records every value resolved in Step B2.

2. **Print summary:**

   ```
   Scaffold complete.
     Stack: <stack>
     Template version: <template_version>
     Files written: <N>
     Location: <project-root-absolute-path>
   ```

3. **Print wire-up checklist** (stack-specific):

   For `node-fastify-react`:
   ```
   Scaffold complete. Remaining manual steps:
     1. Run 'git init' if not already a git repo
     2. Run 'pnpm install' (or your package manager equivalent)
     3. Initialize the database (if your stack uses one):
        - Create migrations directory: <MIGRATIONS_PATH>
        - Run initial migration
     4. Verify CLAUDE.md content matches your project conventions
   ```

   For `expo`:
   ```
   Scaffold complete. Remaining manual steps:
     1. Review root CLAUDE.md and adjust stack-decisions reference if needed
     2. Configure EAS Secrets for the SDKs you use (see each lib/<sdk>/CLAUDE.md)
     3. Wire SDK init code under lib/<sdk>/ (initialisation code is NOT generated)
     4. Run 'npx tsc --noEmit' to confirm typecheck passes
     5. Add features via: /scaffold --add-package <feature-name>
   ```

4. Exit successfully.

### Bootstrap edge cases

| Case | Behavior |
|---|---|
| Stack not in allowlist | Error listing valid stacks |
| `--stack` missing and no manifest | Error listing the allowlist; no default, no prompt |
| `--stack` disagrees with manifest-pinned stack | Error; tell user to delete manifest to change stacks |
| Stub stack (`dotnet-mvc-react`) | Exit with `error_on_select` from stack.yaml, write nothing |
| Bootstrap prereq unmet (expo without `create-expo-app`) | Exit with `error_message` from `bootstrap_prereq`, write nothing |
| `.git/` missing | Warn, continue |
| User aborts at `Proceed? [Y/n]` prompt with `n` | Exit cleanly, no files written, no manifest |
| `--config` references unknown keys | Error, list unknown keys and valid key set |
| `--config` missing required keys | Fall back to interactive prompts (or error under `--yes`) |
| Manifest file corrupt (invalid YAML) | Error: `"Manifest file <path> is corrupt. Fix or delete to proceed."` |
| `--force` in a fully-bootstrapped dir | Route to refresh workflow (see § Refresh on Template Update) |

## Technology Layer Dispatch (canonical)

The technology-layer write rules (same for every stack) form a canonical three-rule algorithm:

| Technology file path | Write rule |
|---|---|
| `technology/CLAUDE.md` | Append to project root `CLAUDE.md` after placeholder substitution. Multi-layer file — manifest entry uses `source_layers: [root, technology]`. |
| `technology/.claude/settings.json` | Deep-merge into project `.claude/settings.json` after placeholder substitution. Multi-layer file — manifest entry uses `source_layers: [root, technology]`. |
| All other files under `technology/` | Direct write to the same relative path in the project root. Example: `technology/lib/revenuecat/CLAUDE.md` → `<project>/lib/revenuecat/CLAUDE.md`. Single-layer file — manifest entry uses `source_layer: technology`. |

**Deep-merge rules for `.claude/settings.json`:**
- **Array-valued keys** (e.g., `hooks`, `sandbox.network.allowedHosts`): concatenate — root values first, then technology values appended. Preserve order.
- **Scalar-valued keys** (string/number/bool): technology value wins on conflict.
- **Object-valued keys**: recurse the deep-merge rule.
- `sandbox.network.allowedHosts` is the canonical JSON path; do NOT use a top-level `network.allowedHosts` key.
- Claude Code allowlist matches host entries as **exact strings**, not wildcards or suffix patterns. `revenuecat.com` does NOT auto-cover `docs.revenuecat.com` — subdomains must be listed explicitly. The expo technology layer adds provider-doc subdomains (e.g., `docs.revenuecat.com`, `docs.sentry.io`) that are not redundant with root-layer top-level entries.

**Multi-layer file diff/apply.** At refresh time, for files with `source_layers:` (plural — list), the scaffold MUST reconstruct the expected on-disk content by running the full build pipeline across EVERY contributing layer (substitute placeholders per layer, then append for CLAUDE.md or deep-merge for settings.json). Only the reconstructed bytes are compared against the on-disk file. Writing a single-layer version would silently strip the other layer's contribution — never do that.

## Add-Package Mode

Triggered by `--add-package <name>` or by mode inference in a directory containing `.scaffold-manifest.yaml` (stack read from manifest).

### Step A1 — Pre-flight checks

1. **Manifest check.** cwd must contain `.scaffold-manifest.yaml`. If missing → error: `"Not a scaffolded project. Run `--bootstrap --stack <name>` first."`
2. **Stack resolution.** Read `stack:` from the manifest. Load `templates/<stack>/stack.yaml` for `add_package_target_dir` and `package_dir_creates_settings`.
3. **`--stack` disallowed.** If `--stack` is present → error per § Argument Parsing.
4. **Package name validation.** `<name>` must match `^[a-z0-9][a-z0-9._-]*$` (lowercase, no spaces, no leading dots, no uppercase). If invalid → error: `"Invalid name '<name>'. Must be lowercase, no spaces, no leading dots."`
5. **Stack-specific prerequisite check.**
   - `node-fastify-react`: cwd must contain `pnpm-workspace.yaml` OR `turbo.json`. If neither → error: `"Not a monorepo root. cd to the monorepo root or use --bootstrap to create one."`
   - `expo`: cwd must satisfy the `bootstrap_prereq` (`app.json` OR `package.json` with `expo` dependency). If not → error using the `bootstrap_prereq.error_message`.
6. **Collision check.**
   - `node-fastify-react`: if `packages/<name>/` already exists → error: `"package <name> already exists."`
   - `expo`: if `features/<name>/` already exists → error: `"feature <name> already exists — remove or rename it before re-adding."`
7. **SDK-name collision notice (expo only).** If `<name>` matches an existing `lib/<name>/` directory (i.e., the user is adding a feature that shares a name with a scaffold-managed SDK boundary), print the notice: `"Note: lib/<name>/ already exists as a scaffold-managed SDK boundary."`. Record `sdk_name_collision: true` on the `features/<name>/CLAUDE.md` manifest entry. Inject a "See also `lib/<name>/CLAUDE.md` (SDK boundary for `<name>`)" line into the generated feature CLAUDE.md at write time so the cross-reference persists in the file itself.

### Step A2 — Resolve placeholders

Per the stack's authoritative placeholder list (§ Placeholder Resolution). For `--add-package`:

- `node-fastify-react`: per `references/placeholder-resolution.md` (e.g., `{{PACKAGE_NAME}}`, `{{@scope/package-name}}`, `{{PACKAGE_DESCRIPTION}}`, `{{@scope/dep-package}}`).
- `expo`: `{{FEATURE_NAME}}` ← `<name>` arg; prompt for `{{FEATURE_DESCRIPTION}}` (default "Feature description TBD") and `{{RELATED_SDKS}}` (comma-separated SDK names, default empty).

Print a summary and ask `"Proceed with scaffold? [Y/n]"`. On `n` → exit without writing files. Skip under `--yes`.

### Step A3 — Write package layer

For each file under `templates/<stack>/package/`:

1. **Compute target path.** `package/<path>` → `<cwd>/<add_package_target_dir>/<name>/<path>`:
   - `node-fastify-react`: `packages/<name>/<path>`.
   - `expo`: `features/<name>/<path>`.
2. **Skip-existing check** per the same rules as bootstrap Step B3. On `expo`, all feature files are `write_once: true` — if the target exists, skip silently.
3. **Substitute placeholders**, write the file, append to in-memory manifest list.
4. **Create parent directories** as needed.

**Package-layer settings.json:** for stacks with `package_dir_creates_settings: true` (`node-fastify-react`), also process `package/.claude/settings.json`. For `package_dir_creates_settings: false` (`expo`), the package layer writes ONLY `CLAUDE.md`; no per-feature `.claude/settings.json` is emitted.

**`write_once` in manifest.** For stacks where the package layer is declared `write_once` (expo), the manifest entry carries `write_once: true`. Refresh skips these entries unconditionally.

**Conditional subdirectories** (`node-fastify-react` only):
- If `--has-schema` → create `packages/<name>/src/db/schema/.gitkeep`.
- If `--has-routes` → create `packages/<name>/src/routes/.gitkeep`.
- If `--has-client` → create `packages/<name>/src/client/.gitkeep`.

Each `.gitkeep` file is added to the manifest. If `.gitkeep` already exists → skip silently.

### Step A4 — Wire workspace declarations

(Applies to `node-fastify-react` only — `expo` has no workspace wiring step.)

1. **Update `pnpm-workspace.yaml`** using text-level insertion (see previous version; unchanged).
2. **Update root `CLAUDE.md` Workspace Packages table** (unchanged).
3. On any wiring failure → warn, do NOT abort.

### Step A5 — Manifest update and wire-up checklist

1. **Update `.scaffold-manifest.yaml`:** read existing manifest, append the new package/feature's file entries (as structured objects, not bare strings) to `files:`. Preserve existing `stack:`, `created:`, `template_version:`, and `placeholders:`. For expo features, the new file entry carries a per-file `placeholders:` sub-map for `{{FEATURE_NAME}}`/`{{FEATURE_DESCRIPTION}}`/`{{RELATED_SDKS}}` so refresh can re-substitute if the template wording changes.
2. **Template version preservation.** Add-package does NOT bump `template_version`; only bootstrap-with-force does. The manifest's stored `template_version` is left unchanged.
3. Print summary and the stack-appropriate wire-up checklist (unchanged for `node-fastify-react`; for `expo` print a short note pointing to the new `features/<name>/CLAUDE.md` and any SDK cross-reference injected by § Step A1.7).
4. Exit successfully.

### Add-package edge cases

| Case | Behavior |
|---|---|
| Manifest missing | Error, mention `--bootstrap --stack <name>` |
| Name collision (package/feature already exists) | Error, do not merge |
| Invalid name | Error before doing any work |
| `--stack` present | Error (stack is read from manifest) |
| SDK-name collision (expo) | Proceed with notice + manifest flag + cross-ref injection (see Step A1.7) |
| `node-fastify-react`: workspace-declaration update fails | Warn, continue (files already written) |
| `node-fastify-react`: Workspace Packages table not found | Warn, continue |
| `.gitkeep` already exists | Skip silently |

## Manifest Schema

The `.scaffold-manifest.yaml` file at the project root uses the following schema (applies to ALL stacks):

```yaml
# .scaffold-manifest.yaml
stack: <stack-name>
template_version: <X.Y.Z>
created: <ISO-8601 timestamp>
placeholders:                     # bootstrap-wide values; applied to every scaffold-written file
  PROJECT_NAME: my-app
  STACK_DECISIONS_DOC_PATH: ''    # empty string means blank — line dropped from generated file
files:
  - path: CLAUDE.md
    source_layers: [root, technology]   # multi-layer (Change 3 rule 1) — refresh reconstructs from both
  - path: .claude/settings.json
    source_layers: [root, technology]   # multi-layer (Change 3 rule 2) — deep-merge reconstruction
  - path: lib/revenuecat/CLAUDE.md
    source_layer: technology            # single-layer direct-write (Change 3 rule 3)
  - path: features/matching/CLAUDE.md
    source_layer: package
    write_once: true                    # add-package feature, refresh skips
    sdk_name_collision: true            # set when feature name shadows an SDK boundary (expo)
    placeholders:                       # per-file feature placeholders (add-package only)
      FEATURE_NAME: matching
      FEATURE_DESCRIPTION: User-to-user matching flow
      RELATED_SDKS: supabase,posthog
```

**Placeholder scope rules:**
- Top-level `placeholders:` holds bootstrap-wide values (PROJECT_NAME, STACK_DECISIONS_DOC_PATH).
- Per-file `placeholders:` holds feature-specific values (FEATURE_NAME, FEATURE_DESCRIPTION, RELATED_SDKS) that MUST NOT pollute other files.
- **Resolution order at diff time:** for a given file, merge top-level placeholders with the file's per-file placeholders (per-file wins on key collision), then substitute into the template content.

**Single-layer vs multi-layer entries:**
- `source_layer: <layer>` (singular, string) → single-layer file. Refresh loads `templates/<stack>/<layer>/<path>`, substitutes, and byte-compares.
- `source_layers: [<l1>, <l2>, ...]` (plural, list) → multi-layer file. Refresh reconstructs by running the full build pipeline across all listed layers (see § Technology Layer Dispatch, Multi-layer file diff/apply).

## Migrating old-format manifests

Manifests written by prior `/scaffold` versions use a bare-string `files:` list and have no `template_version`, no `placeholders:`. On the first `--bootstrap --force` or `--add-package` call against such a manifest, the scaffold:

1. Infers `template_version: 1.0.0` for the pinned stack (only `node-fastify-react` is plausible — other stacks did not exist before).
2. Rewrites each bare-string `files:` entry as `{ path: <string>, source_layer: <inferred> }`. The layer is inferred by matching the path against known template files:
   - Paths matching root-layer templates (`CLAUDE.md`, `.claude/settings.json`, `.claude/hotspots.md`, `.claude/hookify.*.local.md`) → `source_layers: [root, technology]` for CLAUDE.md and settings.json (multi-layer by construction), `source_layer: root` for the rest, `source_layer: technology` for `hookify.warn-db-push.local.md`.
   - Paths matching `packages/*/` → `source_layer: package`.
3. **Placeholder recovery.** Old-format manifests have no `placeholders:` map; the scaffold cannot run the byte-compare diff until placeholder values are known. The scaffold prompts interactively for every placeholder in the stack's authoritative placeholder list.

   For `node-fastify-react`, the authoritative list lives at `ai-dev-tools/skills/scaffold/references/placeholder-resolution.md`. The migration logic reads this file under the following schema contract — each placeholder documented in the reference MUST expose:
   - `placeholder_name` (the `{{IDENTIFIER}}` token without braces)
   - `resolution_source` (where the value comes from — prompt, directory basename, config, etc.)
   - `default_value` (the value used if the user accepts the prompt default; may be empty)

   Any additional fields in the reference are ignored by migration. If the reference cannot be parsed under this schema, migration aborts with: `"placeholder-resolution.md schema mismatch at ai-dev-tools/skills/scaffold/references/placeholder-resolution.md — expected columns/fields placeholder_name, resolution_source, default_value."`

   Each prompt shows the placeholder name, its documented resolution source, and a best-effort default derived the same way the original bootstrap would have. The user may accept defaults or override. All answers are written to the new `placeholders:` map before the first refresh diff runs.

   Under `--yes`, migration with missing placeholders aborts with: `"Old-format manifest requires interactive placeholder recovery. Re-run without --yes, or pre-seed the manifest with a placeholders: map."`

4. Print a one-line migration notice: `"Manifest migrated to new schema (template_version: 1.0.0)."`.

The manifest maintainer is responsible for keeping the reference schema stable across template versions; schema changes to the reference are a breaking change and require a major `template_version` bump for `node-fastify-react`.

## Refresh on Template Update

Triggered by `--bootstrap --force` against a directory that already contains `.scaffold-manifest.yaml`.

### Workflow

1. **Read manifest.** Parse `.scaffold-manifest.yaml`. If it uses the old bare-string schema, run § Migrating old-format manifests first.
2. **Compare versions.** Read `stack.yaml.template_version` for the manifest's pinned stack.
3. **If versions match** → print:
   ```
   No template updates available (manifest version matches current template).
   All scaffold-owned files are already up to date.
   ```
   Write nothing. Exit.
4. **If versions differ** → compute the change set:
   - For every file entry in the manifest, reconstruct the expected substituted content per § Technology Layer Dispatch (single-layer or multi-layer reconstruction).
   - Byte-compare against the on-disk file.
     - File absent on disk → `A` (added).
     - File present but differs → `M` (modified).
     - File present and identical → skip from the change list.
     - Entry has `write_once: true` → `-` (skipped, include in "skipped" list).
   - For each file in the templates that is NOT in the manifest → `A` (new in this version).
   - For each manifest entry where the template file is missing from its recorded `source_layer` template path:
     - **Layer-migration rule:** if the file is missing from its recorded `source_layer` but IS present in ANOTHER layer (`root` / `technology` / `package`) of the same stack → update the manifest entry's `source_layer` to the new layer and mark as `M` (NOT `D`).
     - **True-D rule:** if the file is missing from ALL three layers → `D` (orphaned).
5. **Run new-placeholder discovery** (§ Placeholder Resolution). Prompt for values (or abort under `--yes`).
6. **Run cross-layer placeholder collision detection** (§ Placeholder Resolution) and emit the notice if applicable.
7. **Print the summary** (legend: `M` = modified, `A` = added, `D` = deleted/no-longer-in-template, `-` = skipped). If the major version changed (1.x → 2.x, etc.), also print:
   ```
   WARNING: Major template version bump (1.x → 2.x) — layout or convention
   changes likely. Review the changelog at:
     ai-dev-tools/skills/scaffold/templates/<stack>/CHANGELOG.md
   ```
   If `CHANGELOG.md` is absent for the stack, print instead:
   ```
   WARNING: Major template version bump (1.x → 2.x) — changelog not found at
     ai-dev-tools/skills/scaffold/templates/<stack>/CHANGELOG.md
     Review the template diff manually.
   ```

   Example summary:
   ```
   Template update: 1.0.0 → 1.1.0
   Changes since your version:
     M   CLAUDE.md                                  (content changed)
     M   .claude/settings.json                      (content changed)
     A   lib/sentry/CLAUDE.md                       (new in 1.1.0)
     A   .claude/hookify.warn-bundle-size.local.md  (new in 1.1.0)
     D   lib/obsolete/CLAUDE.md                     (orphaned — no longer in template; remove manually if no longer needed)
     -   features/matching/CLAUDE.md                (skipped: write_once)
   Proceed? [y/N]
   (Note: CLAUDE.local.md files are user-owned and never appear in this diff — they are not tracked in the manifest.)
   ```
8. **On `y`** (or under `--yes`) → apply changes:
   - `M` files: reconstruct (multi-layer: full pipeline; single-layer: substitute + write), write.
   - `A` files: write as usual. For files new in the current template version, add a new entry to the manifest with the appropriate `source_layer` or `source_layers`.
   - `D` files: remove the manifest entry (so future refreshes don't track it). Do NOT delete the on-disk file — the user decides whether to remove it.
   - `-` files: skip.
   - Update manifest `template_version` to the current value.
9. **On `n`** → exit clean, no changes.

### `--yes` flag and non-interactive context handling

- `--yes` skips the `Proceed? [y/N]` prompt in step 8; the scaffold applies changes automatically after printing the summary.
- Under `--yes`, if any new placeholder is missing a value, the scaffold aborts per § Placeholder Resolution — never substitutes an implicit default.
- **Non-TTY stdin detection.** When stdin is NOT a TTY (e.g., CI, Claude Code agent invocation) AND `--yes` was NOT passed, the scaffold errors: `"stdin is not a TTY — pass --yes to run non-interactively, or omit --force to skip refresh."` This prevents the skill from silently hanging inside an agent session. Agents invoking the skill MUST pass `--yes` explicitly when they want the refresh to apply.

### Ownership rule — `CLAUDE.local.md`

`CLAUDE.local.md` files at any level are USER-OWNED and MUST NEVER be written, read, or listed in the manifest by the scaffold. Refresh logic MUST classify "is this user-owned?" using an explicit basename match on `CLAUDE.local.md`, NOT a generic `*.local.md` glob — this is required so `hookify.*.local.md` files (which are scaffold-owned refreshable rule files) are correctly refreshed. The two `.local.md` conventions are distinct and must not be conflated.

No 3-way merge UI. Users with hand-edited scaffold-owned files (`CLAUDE.md`, `.claude/settings.json`) lose their hand edits on refresh — the ownership split (CLAUDE.local.md for user extensions) is the explicit escape valve.

## References

- `references/placeholder-resolution.md` — authoritative `node-fastify-react` placeholder list; also the schema contract consumed by old-manifest migration.
- `templates/<stack>/stack.yaml` — per-stack layout/version metadata.
- `templates/<stack>/CHANGELOG.md` — per-stack changelog (minimum format: `## vX.Y.Z` header + bullet list of added/changed/removed items; maintainer-authored).
- `docs/superpowers/specs/2026-04-16-mobile-scaffold-integration-design.md` — Mobile Scaffold Integration design spec; Section 3 is the authoritative placeholder list for `expo`.

## Design decisions (v2 — mobile scaffold integration)

- **`--stack` is mandatory** on `--bootstrap` unless the manifest pins one. Hard cutover, no default, no deprecation period. Allowlist: `["node-fastify-react", "dotnet-mvc-react", "expo"]`.
- **Three stacks registered; two live.** `dotnet-mvc-react` is a stub — the dispatch path is exercised end-to-end so filling its templates later is just template work, not wiring.
- **`stack.yaml` per stack** decouples the skill logic from any one stack's conventions (`layout`, `add_package_target_dir`, `package_dir_creates_settings`, `bootstrap_prereq`, `template_version`).
- **Technology layer generalised** to a three-rule algorithm: append CLAUDE.md, deep-merge settings.json, direct-write everything else. Works for monorepo (`node-fastify-react`) and single-package (`expo`) layouts without forking.
- **`CLAUDE.md` (scaffold-owned) + `CLAUDE.local.md` (user-owned) ownership split** applies to ALL stacks. The trailer pointing to CLAUDE.local.md is baked into every scaffold-shipped CLAUDE.md at template-source time, not injected at write time — this keeps the refresh byte-compare simple.
- **Structured manifest entries** (`path`/`source_layer`/`write_once`/`placeholders`) replace the bare-string `files:` list so multi-layer reconstruction, write-once semantics, and per-file placeholder scope are all expressible. Old-format manifests are migrated automatically on first refresh or add-package.
- **Placeholder substitution is per-layer on raw bytes before append/merge** so cross-layer composition doesn't re-substitute or collide. New placeholders introduced by template bumps trigger a prompt (or an error under `--yes`) so automation never gets an implicit default.
- **Refresh skips 3-way merge.** Users who want to extend scaffold-owned content use `CLAUDE.local.md`; hand-edits to scaffold-owned files are lost on refresh by design.
- **`--yes` + non-TTY detection** makes the skill safe to invoke from AI agents and CI without silent hangs.
