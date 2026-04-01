# Phase 2: Diff -- AI Config Files

Compare AI configs across discovered projects. Classify every section/key as:

- **Identical** -- same content in all projects that have it.
- **Divergent** -- different content across projects.
- **Unique** -- exists in only one project.
- **Local** -- marked with local override markers; preserved as-is, excluded from diffing.

---

## CLAUDE.md -- Section-Level Diffing

**Splitting:** Read each project's CLAUDE.md (check both `<project>/CLAUDE.md` and `<project>/.claude/CLAUDE.md`). Split by `##` headers into sections. Preamble (content before first `##`) is preserved verbatim and never diffed. `###` sub-headers belong to their parent `##` section -- they are not split boundaries.

**Section matching** -- 3-step algorithm applied across all projects:

1. **Normalize** each header: lowercase, strip punctuation, strip leading numbering (`1.`, `2.`, `01.`), trim whitespace.
2. **Exact match:** compare normalized headers. If identical, pair those sections.
3. **Suffix stripping:** if no exact match, strip these suffixes and retry:
   - `guidelines`, `rules`, `conventions`, `policy`
   - `standards`, `notes`, `overview`, `setup`
   After stripping, trim trailing whitespace and compare again.
4. **Ambiguity:** if suffix stripping yields multiple candidates (e.g., `## Code Conventions` and `## Code Rules` both reduce to `code`), flag for the user in Report. Do NOT auto-match.
5. **Unmatched** sections are classified as Unique.

**Content comparison:** For each matched (non-local) section, compare full text across projects. Normalize trailing whitespace and trailing newlines before comparing. Classify as Identical or Divergent.

**Local markers** use HTML comments: `<!-- consolidate:local -->` / `<!-- /consolidate:local -->`.
- Must be contained within a **single `##` section**.
- If markers wrap an entire section including its `##` header, the whole section is local.
- If markers span multiple `##` sections, warn: `[consolidate] Warning: local markers in <project>/CLAUDE.md span multiple sections. Treating all spanned sections as local.`
- Local sections are excluded from diffing entirely.

---

## JSON Configs -- Key-Level Diffing

Applies to: `.claude/settings.json`, `.mcp.json`

1. Parse each JSON file and flatten to dot-separated key paths:
   ```
   { "permissions": { "allow": ["read"] } }  ->  permissions.allow = ["read"]
   ```
2. Compare values across projects for each key path.
3. **Local overrides** via `.consolidate.json` sidecar at the project root:
   ```json
   {
     ".claude/settings.json": { "local": ["permissions.allow", "hooks.custom"] },
     ".mcp.json": { "local": ["mcpServers.local-server"] }
   }
   ```
   Keys in `local` arrays are excluded from diffing and preserved untouched in Apply.
4. Classification per key:
   - Same value in all projects -> Identical
   - Different values -> Divergent
   - One project only -> Unique
   - In `.consolidate.json` local array -> Local (skip)

---

## TOML Configs -- Key-Level, Comment-Preserving

Applies to: `.codex/config.toml`

1. **Before parsing**, scan raw file text for `# consolidate:local` / `# /consolidate:local` comment blocks. Record line ranges; keys within those ranges are excluded from all diffing.
2. Parse TOML to extract key-value pairs for comparison. Retain the original file text -- needed for string-level Apply later.
3. Compare non-local values across projects. Classify as Identical, Divergent, Unique, or Local.
4. Never rewrite TOML from a parsed structure. Original text with comments, ordering, and formatting must be preserved. Changes are applied via targeted string replacements in Phase 4.

---

## After Diffing

Collect all classification results across all config types. Pass to Phase 3 (Report) via `prompts/ai-report.md`.

Exit early if:
- Everything is Identical or Local: `[consolidate] All AI configs are identical across projects. Nothing to do.`
- All differences are Local: `[consolidate] All differing sections are marked local. Nothing to consolidate.`
