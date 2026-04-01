# Phase 1: Discovery -- AI Config Files

Scan the monorepo for projects containing AI-related configuration files.

## Project Detection

A directory qualifies as a "project" if it contains **any** of:

| File | Notes |
|------|-------|
| `CLAUDE.md` | Top-level or inside `.claude/` |
| `.claude/settings.json` | Shared settings. **`.claude/settings.local.json` does NOT qualify** -- machine-specific, ignored. |
| `.codex/config.toml` | Codex configuration |
| `.mcp.json` | MCP server configuration |

The monorepo root itself is always checked as a project.

## Scan Order

Follow shared discovery logic in SKILL.md:
1. **Workspace config (preferred):** read `package.json` workspaces or `pnpm-workspace.yaml` packages. Do NOT use `turbo.json`.
2. **Fallback:** scan root + `*/` + `*/*/` (depth-2).
3. **Exclusions:** skip `node_modules/`, `.git/`, `vendor/`, `dist/`, `build/`, `.next/`, `__pycache__/`.

Only directories containing at least one qualifying file are projects.

## Output Format

Present using the `[consolidate]` prefix:
```
[consolidate] Scanned monorepo. Found AI configs in:
  root/          CLAUDE.md, .claude/settings.json, .mcp.json
  packages/web/  CLAUDE.md, .claude/settings.json, .codex/config.toml
  packages/lib/  CLAUDE.md

Config types found: CLAUDE.md (4), .claude/settings (2), .codex (1), .mcp.json (1)
```

List config files per project (comma-separated), then a summary line with counts per config type.

## Single-Project Configs

Config types in only one project are **not diffed** but offered for **propagation** in Phase 4:
```
Single-project configs (will offer propagation):
  .codex/config.toml -- only in packages/web/
  .mcp.json -- only in root/
```

## Exit Conditions

- **No projects:** `[consolidate] No projects with AI configs found. Run from monorepo root.` Stop.
- **One project only:** `[consolidate] Only one project has AI configs (<project>). Nothing to diff across projects.` List what was found, stop.

## Next

Proceed to Phase 2 (Diff) by reading `prompts/ai-diff.md`.
