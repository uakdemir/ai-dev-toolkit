# Phase 3: Report -- AI Config Diff Report

Present a structured diff report and save to `./tmp/consolidate-ai-report.md`.

## Format

Begin with:
```
[consolidate] AI Config Diff Report
═══════════════════════════════════
```

Group by config type. Each type gets a `##` header with project count:
```
## CLAUDE.md (N projects)
## .claude/settings.json (N projects)
## .codex/config.toml (N projects)
## .mcp.json (N projects)
```

If a config type has nothing to diff (one project or all identical): `## .codex/config.toml (1 project) -- nothing to diff`

## Per-Type Subsections

**Identical:** compact summary, no action needed.
```
### Identical sections (skipped): N
  - ## Section1, ## Section2, ...
```

**Divergent:** box-drawing display with majority detection.
```
### Divergent sections: N
  ┌─ ## Section Name ───────────────────────────
  │ project-a/:  "first 3 lines or summary..."
  │ project-b/:  "different content..."
  │
  │ -> 3/4 agree on version A. packages/api/ has version B.
  └────────────────────────────────────────────
```
For CLAUDE.md show first 3 lines; for JSON/TOML/YAML show actual values.

**Unique:**
```
### Unique sections: N
  - ## Unique Section (only in project-x/)
```

**Local:**
```
### Local sections (preserved): N
  - ## Local Section (project-y/)
```

**Ambiguous matches** (from suffix-stripping in Phase 2):
```
### Ambiguous matches: N
  ┌─ "## Code Conventions" (project-a/) vs "## Code Rules" (project-b/)
  │  Both normalize to "code" after suffix stripping.
  │  Are these the same section? (y = match as Divergent, n = treat as separate Unique)
  └────────────────────────────────────────────
```

Ambiguous matches are carried into the Decision phase as unresolved selections. The user must resolve each before the skill can classify and apply.

## Save

Create `./tmp/` if needed. Write report to `./tmp/consolidate-ai-report.md` (overwrite). Confirm: `Report saved to: ./tmp/consolidate-ai-report.md`

## Next

If no divergent and no unique items: `[consolidate] All AI configs are identical across projects. Nothing to do.` Stop.

Otherwise proceed to Phase 4 via `prompts/ai-apply.md`.
