---
name: changelog-from-commits
description: "Use when the user wants to generate release notes, create a changelog, produce a changelog from git history, document what changed between versions, summarize commits for a release, or group changes by type — even if they don't use the exact skill name."
---

# changelog-from-commits

Generate meaningful release notes from git history, grouped by category (Features, Fixes, Breaking Changes, Other Changes). Auto-detects tag ranges, classifies commits using Conventional Commits with AI fallback, and prepends to `CHANGELOG.md`.

## Workflow Overview

Execute these steps in order. Each step feeds into the next:

1. **Detect Range** — auto-detect tags or accept explicit range argument
2. **Collect** — gather commits in the range with `--no-merges`
3. **Classify** — categorize each commit (conventional parse → AI fallback)
4. **Compose** — group by category, format entries, build release section
5. **Write** — prepend to `CHANGELOG.md`, confirm to user

Reference file used in Steps 3-4 (do not inline — read at the indicated step):

- `references/classification-patterns.md` — conventional commit type mappings, AI fallback heuristics, scope extraction, entry formatting rules, output template

No tech stack selection, no scope detection, no parallel agents.

---

## Step 1: Detect Range

### Invocation Grammar

```
/changelog-from-commits [<range>] [--version <label>]
```

Where `<range>` is exactly ONE of:
- `<ref>..<ref>` — git range (e.g., `v1.0.0..v2.0.0`, `v1.0.0..HEAD`)
- `--since <YYYY-MM-DD>` — date-based, maps to `git log --since=<date>`
- `--last <N>` — count-based, maps to `git log -n <N>` (note: `--no-merges` may yield fewer than N)

`--version <label>` is optional — overrides the version label for any range type.

**Mutual exclusivity:** `..` range, `--since`, and `--last` are mutually exclusive. If multiple are provided, abort: "Only one range specifier allowed."

**Validation failures:**
- `--since` without a valid date → abort with format hint
- `--last` without a positive integer → abort with format hint
- `--version` without a label → abort: "Missing version label after --version"
- Unrecognized flags → abort: "Unknown argument: {arg}"

If no range is provided, fall through to tag auto-detection.

### Tag Auto-Detection

If no argument provided:

1. `git tag --merged HEAD --sort=-version:refname` — list tags reachable from current HEAD, sorted by version descending. **Semver detection:** if the top 2 tags both match `v?[0-9]+.[0-9]+.*`, use version sort. Otherwise, fall back to `git tag --merged HEAD --sort=-creatordate` (chronological) and warn: "Tags do not appear to follow semver. Using chronological order — verify the detected range."
2. If 2+ tags: use the two most recent as the range. Count: `git rev-list --count --no-merges <range>`. Present: "Generating changelog for `{tag1}..{tag2}` (N commits). Proceed?"
3. If 1 tag: use `<tag>..HEAD`. Present: "Generating changelog for `{tag}..HEAD` (N commits). Proceed?"
4. If 0 tags: prompt user — "No tags found. Provide a commit range, date (`--since YYYY-MM-DD`), or number of recent commits (`--last N`)."

### Version Label

| Condition | Label |
|-----------|-------|
| Range ends at a tag | Tag name (e.g., `## v1.4.0`) |
| Range ends at HEAD | `## Unreleased` |
| Date-based or count-based | `## Unreleased` |
| Any range + `--version` flag | Use the provided label |

---

## Step 2: Collect

```
git log --no-merges --format="%h%x00%s%x00%b%x00%aI" <range>
```

Collects per commit: short hash, subject line, body (for BREAKING CHANGE footer detection), and commit date (for heading date). Fields are null-byte delimited. Author is not collected.

If 0 commits: warn "No commits found in range." Do not write.

---

## Step 3: Classify

Read `references/classification-patterns.md` for parsing rules and AI fallback guidance.

**Pass 1 — Conventional Commit parsing:** Match each commit against the 4 patterns in the reference file (type with/without scope, with/without `!`). Scan body for `BREAKING CHANGE:` footer. Apply the category assignment table.

**Pass 2 — AI fallback:** For unmatched commits, classify by intent using the heuristics in the reference file. When ambiguous, prefer the higher-impact category.

---

## Step 4: Compose

Build the release section using the output template and formatting rules from `references/classification-patterns.md`.

- Version heading: `## {version} ({date})` where date is from the most recent commit timestamp
- Categories ordered: Breaking Changes → Features → Fixes → Other Changes
- Empty categories omitted
- Scopes shown when present, never fabricated
- Entries: `- [**scope:** ]<description> (<short-hash>)`

---

## Step 5: Write

1. If `CHANGELOG.md` exists: read it, prepend the new release section. If the first non-empty line is an H1 (`# ...`), insert after that line, separated by one blank line. Otherwise prepend at the very top.
2. If `CHANGELOG.md` doesn't exist: create with `# Changelog` title + release section.
3. **Self-check:** Read file back. Confirm section heading matches expected version/date and at least one category has entries. If validation fails, attempt one rewrite. If second attempt fails, warn with specifics.
4. Print confirmation: "Changelog updated with {N} entries for {version}. Review at `CHANGELOG.md`."

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Not a git repository | Abort. "Not a git repository — cannot generate changelog." |
| No commits in range | Warn: "No commits found in range." Do not write. |
| No tags found (no args) | Prompt user for range, date, or count. |
| Invalid range argument | Abort with format hint. |
| Multiple range specifiers | Abort: "Only one range specifier allowed." |
| All commits are merge commits | Warn: "All commits filtered out." Do not write. |
| 0 conventional commits | Proceed. Note: "All entries AI-classified — review for accuracy." |
| Unexpected CHANGELOG.md format | Prepend at top. Do not restructure existing content. |
| Duplicate version section | Warn: "Section for {version} exists. Overwrite or abort?" If overwrite: find `## {version}` heading, scan to next `## ` or EOF, remove range, prepend new section at normal insertion point. |
| >200 commits | Warn: "Large range." Proceed. |
| `--version` with tag range | Use provided label instead of tag name. |
| Detached HEAD, no args | Same as "no tags found" — prompt user. |
| Non-semver tags | Fall back to chronological sort. Warn user. |

---

## Progressive Disclosure Schedule

| Phase | Load | Section |
|-------|------|---------|
| After range detection, before classification and composition | `references/classification-patterns.md` | Full file |

Single reference file, loaded once before Step 3.
