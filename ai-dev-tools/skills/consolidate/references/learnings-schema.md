# Learnings Schema

Runtime reference for `learn-report.md`. Contains all rules for writing `learnings.md` entries and organizing the `configs/` folder structure.

---

## 1. Folder Structure

Place learnings at `learnings/` relative to the consolidate skill directory:

```
learnings/
├── react/
│   ├── configs/
│   └── learnings.md
├── typescript/
│   ├── configs/
│   └── learnings.md
├── nodejs-fastify/
│   ├── configs/
│   └── learnings.md
├── dotnet/
│   ├── configs/
│   └── learnings.md
├── python/
│   ├── configs/
│   └── learnings.md
└── common-ai/
    ├── configs/
    └── learnings.md
```

- Create buckets on first encounter. Do not pre-populate empty buckets.
- `configs/` holds the "best known" canonical config files. Preserve their relative path from the project root (e.g., `configs/CLAUDE.md`, `configs/.claude/settings.json`, `configs/.serena/default.yml`, `configs/.eslintrc.json`).
- `learnings.md` holds per-rule rationale entries with source project name and date.

---

## 2. learnings.md Format

### Title

Use `# <Bucket Name> — Learnings` as the document title. Examples: `# React — Learnings`, `# Common AI — Learnings`.

### Entry Structure

Each entry follows this format:

```markdown
### <rule-name>: <value>
- **Source:** <project-name> (<YYYY-MM-DD>)
- **Rationale:** <explanation>
```

### Superseded Entries

When a rule is updated, keep the old entry in place and add a `Superseded by` bullet. Place the new entry immediately after:

```markdown
### indent: ["error", 4]
- **Source:** project-alpha (2026-03-15)
- **Rationale:** Standardized on 4-space indent for readability.
- **Superseded by:** indent: ["error", 2] — project-beta (2026-04-02)

### indent: ["error", 2]
- **Source:** project-beta (2026-04-02)
- **Rationale:** Aligned with community standard. 2-space is predominant in React/TS ecosystem.
```

### Source Project Name Resolution

Resolve the source project name as follows:
1. If root `package.json` exists with a `name` field, use that value.
2. Otherwise, use `basename` of the working directory.
3. Record the name exactly as resolved — no normalization.

### Rationale Generation

Generate rationale using this priority:
1. **Tier 1 — Inline comments:** Use comments from the config file if present.
2. **Tier 2 — Inference:** Infer from the rule name and value using general tool knowledge (e.g., `strict: true` in tsconfig is universally recommended).
3. **Tier 3 — Generic placeholder:** Use "Configured in [source project]. Review and add specific rationale." Flag entries with generic rationale in the report so the human reviewer can enrich them.

For buckets with more than 5 entries of the same type, use a single summary rationale for groups of related entries (e.g., "Standard TypeScript strict-mode rules") rather than per-entry rationales. Group rationales use the tier-3 format.

---

## 3. Grouping Rules

Group entries under `##` headers within `learnings.md`:

- **Lint/tool buckets** (react, typescript, nodejs-fastify, dotnet, python): Group under `## <tool-name>` headers.
  - Examples: `## ESLint`, `## TypeScript (tsconfig)`, `## Prettier`, `## Ruff`, `## MyPy`, `## EditorConfig`

- **`common-ai` bucket**: Group under `## <config-type>` headers.
  - Examples: `## CLAUDE.md`, `## .claude/settings.json`, `## .mcp.json`, `## .codex/config.toml`, `## .serena/`

---

## 4. Entry Granularity

- **JSON, TOML, YAML configs:** Key-level granularity. One learning entry per rule/setting. The entry title is the key name and value.
- **Markdown configs (CLAUDE.md):** Section-level granularity. Each `##` section is one learning entry. The entry title is the section header. The full section content lives in the canonical config file in `configs/`. The `learnings.md` entry captures the header and a brief description of the section's purpose.
