# Phase 4+5+6: Decision, Apply, Summary

## Phase 4: Decision

### Divergent Items

Present options for each divergent section/key:
```
[consolidate] Decisions needed:

1. CLAUDE.md > ## Naming Conventions
   3/4 projects agree on base. packages/api/ adds extra rule.
   a) Adopt packages/api/ version everywhere
   b) Keep base version, mark extra as local to packages/api/
   c) Custom merge (tell me what you want)
   Your choice?
```

Wait for user response. Interpret, confirm understanding. Max **2 retries** if ambiguous, then skip: `[consolidate] Skipping item N -- could not determine decision.`

### Unique Items

```
2. CLAUDE.md > ## API Versioning (only in packages/api/)
   a) Propagate to all projects
   b) Keep only in packages/api/ (mark as local)
   c) Move to root only
```

### Single-Project Configs

```
3. .codex/config.toml exists only in packages/web/
   a) Propagate to all projects
   b) Propagate to selected projects (tell me which)
   c) Keep only in packages/web/
```

### Batch Mode (>5 items)

Present all items as a numbered list with majority-wins defaults pre-selected:
```
[consolidate] 12 decisions needed. Defaults shown (majority wins):
 1. CLAUDE.md > ## Naming       -> [a] adopt packages/api/ version
 2. settings.json > permissions -> [a] use root/ value (3/4 agree)
 ...

Accept all defaults? (y) Or override by number (e.g., "2a, 5c, rest default"):
```
User types `y` for all defaults, overrides by number, or `n` for one-by-one mode.

### Confirmation

After collecting all decisions, present summary and require `y/n`:
```
[consolidate] Decision summary:
  1. ## Naming Conventions -> adopt packages/api/ version
  2. ## API Versioning -> keep local to packages/api/
  3. permissions.allow -> use superset
Apply these changes? (y/n)
```
If declined, allow revision by number. Re-confirm after revisions.

## Phase 5: Apply

### Pre-Apply Safety

Run `git status` for files about to be modified. If any have uncommitted changes:
```
[consolidate] These files have uncommitted changes:
  packages/api/CLAUDE.md
Applying will overwrite them. Continue? (y/n)
```
User must confirm. If declined, stop without modifying files.

**No commits.** User reviews via `git diff`.

### CLAUDE.md Reconstruction

Per project: (1) preserve preamble verbatim, (2) maintain original section ordering, (3) replace section content with decided version, (4) preserve `<!-- consolidate:local -->` blocks in place, (5) append new propagated sections before any local sections, (6) omit removed sections, (7) preserve inter-section spacing.

### JSON Merge

Read file, apply decided key values, preserve keys in `.consolidate.json` sidecar, write with 2-space indent and trailing newline.

### TOML Merge

Read as raw text. Apply changes via **targeted string replacement** (find key's line, replace value). For multi-line values (arrays, inline tables), skip with warning: `[consolidate] Warning: cannot auto-merge multi-line TOML value for key '<key>'. Please merge manually.` Preserve `# consolidate:local` blocks and original formatting.

### Serena/YAML Merge

Use YAML-aware writing preserving comments. Preserve `# consolidate:local` blocks. Never write `.local.yml` files. When propagating to a project without `.serena/`, create the directory and write decided content (no `.local.yml`). Write anchors/aliases as plain resolved values.

### New Files

Create files with decided content, creating parent directories as needed (`.codex/`, `.serena/`).

## Phase 6: Summary

```
[consolidate] Applied changes:

  CLAUDE.md:
    root/CLAUDE.md              -- updated ## Naming Conventions
    packages/api/CLAUDE.md      -- no changes (was source of truth)
    packages/web/CLAUDE.md      -- updated ## Naming Conventions

  .claude/settings.json:
    root/.claude/settings.json  -- updated permissions.allow (superset)

  .codex/config.toml:
    packages/api/.codex/config.toml -- created (propagated from packages/web/)

  Unchanged: N files
  Updated: N files
  Created: N files
  Local sections preserved: N

Review changes with `git diff` and commit when ready.
Report saved to: ./tmp/consolidate-ai-report.md
```

List every project file per config type with what happened (updated, created, no changes). Include aggregate counts and remind user to review via `git diff`.
