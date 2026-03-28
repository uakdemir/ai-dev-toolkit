# Classification Patterns Reference

Loaded after range detection, before classification and composition. Contains the
classification rules and formatting templates for changelog entry generation.

---

## Conventional Commit Parsing

Match commit messages against these patterns in order:

1. `<type>(<scope>)!: <description>` — breaking change with scope
2. `<type>!: <description>` — breaking change without scope
3. `<type>(<scope>): <description>` — standard with scope
4. `<type>: <description>` — standard without scope

Additionally, scan the commit **body** for `BREAKING CHANGE:` or `BREAKING-CHANGE:` footer
lines, regardless of subject format.

### Category Assignment

| Signal | Category | Priority |
|--------|----------|----------|
| `!` suffix on type | Breaking Changes | Highest — overrides type |
| `BREAKING CHANGE:` in body footer | Breaking Changes | Highest — overrides type |
| `feat` type (without `!`) | Features | |
| `fix` type (without `!`) | Fixes | |
| `perf`, `refactor`, `chore`, `docs`, `style`, `test`, `ci`, `build` | Other Changes | |

**Conflict resolution:** If a commit has both a type (`feat`, `fix`) AND a breaking signal
(`!` or footer), list under Breaking Changes only — the breaking nature is the most important
signal for consumers.

### Scope Extraction

If a scope is present in parentheses (`type(scope): desc`), extract it. The scope is displayed
as a bold prefix in the changelog entry: `- **scope:** description`. If no scope is present,
the entry has no prefix. Never fabricate a scope.

---

## AI Fallback Classification

For commits that don't match any conventional format, classify by reading the subject line:

- Adds new capability, feature, or endpoint → **Features**
- Fixes a bug, error, crash, or incorrect behavior → **Fixes**
- Removes/renames a public API, changes behavior consumers depend on → **Breaking Changes**
- Everything else (refactoring, deps, docs, CI, tests) → **Other Changes**

**Ambiguity rule:** When a commit does not clearly match a single category, prefer the
higher-impact category (Features > Other Changes, Breaking Changes > Features).

**Worked examples:**

| Commit message | Category | Reasoning |
|----------------|----------|-----------|
| "Updated payment logic to handle refunds" | Features | Adds new capability (refund handling) |
| "Cleanup unused imports in auth module" | Other Changes | Refactoring, no behavior change |
| "Remove legacy /v1/users endpoint" | Breaking Changes | Removes a public API |
| "Bump lodash from 4.17.20 to 4.17.21" | Other Changes | Dependency update |
| "Handle null user in checkout flow" | Fixes | Fixes an unhandled case (null user) |

---

## Entry Formatting Rules

- Each entry: `- [**scope:** ]<description> (<short-hash>)`
- Scope shown only when present in the commit message — never fabricated
- Description: commit's subject line, stripped of conventional prefix, first letter capitalized
- Short hash in parentheses for traceability
- Use the commit subject line verbatim after stripping any conventional prefix. Do not rewrite
  commit messages. Ticket references (e.g., JIRA IDs) are preserved as-is.

---

## Category Ordering

In the output, categories appear in this order (most important first):

1. **Breaking Changes** — what will break existing consumers
2. **Features** — what's new
3. **Fixes** — what was wrong and is now corrected
4. **Other Changes** — everything else

Categories with zero entries are omitted entirely.

---

## Output Template

```markdown
## {version} ({YYYY-MM-DD})

### Breaking Changes
- **scope:** Description of breaking change (abc1234)

### Features
- **scope:** Description of new feature (def5678)
- Description without scope (ghi9012)

### Fixes
- Description of fix (jkl3456)

### Other Changes
- Description of other change (mno7890)
```

The date is derived from the commit timestamp of the most recent collected commit
(not system date), formatted as `YYYY-MM-DD`.
