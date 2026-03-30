---
name: session-handoff
description: "Use when the user wants to generate a handoff document for the next AI session, capture session progress, save context between sessions, create a session summary, preserve decisions and pending work, wrap up a session, or indicate they are done for now — even if they don't use the exact skill name."
---

<help-text>
session-handoff — Create handoff document for next session

USAGE
  /session-handoff

EXAMPLES
  /session-handoff                   Generate handoff from current session
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

# session-handoff

Generate a structured handoff document at `tmp/session-handoff.md` for consumption by the next AI agent session. Gathers facts from git state and context from conversation, producing a terse, machine-parseable file with YAML frontmatter + 5 sections.

**Prerequisite:** Auto-discovery requires a one-time setup — a CLAUDE.md instruction or SessionStart hook that reads `tmp/session-handoff.md` on startup. Without this setup, the file is written but not automatically consumed.

## Workflow Overview

Execute these steps in order. Each step feeds into the next:

1. **Gather** — collect git state + scan conversation for context
2. **Compose** — assemble the handoff document
3. **Write** — write to `tmp/session-handoff.md`, confirm to user

No tech stack selection, no scope detection, no parallel agents, no reference files. Single-pass, single output.

---

## Step 1: Gather

### Git Analysis (Factual Backbone)

**Preflight:** Run `git rev-parse --is-inside-work-tree` first. If it fails, skip all git commands and proceed to Conversation Analysis. Warn: "No git repo — handoff will be conversation-based only." Use non-git frontmatter defaults (see Error Handling).

If inside a git repo, check for commits: `git rev-parse --verify HEAD`. If HEAD is invalid (empty repo with no commits), skip `git log` and `git diff --stat HEAD` — use `session_commits: 0` and collect only branch name and `git status`.

Run these commands to collect the factual state:

1. `git branch --show-current` — current branch name. If empty (detached HEAD), use `git rev-parse --short HEAD` to get the commit hash.
2. `git status --short` — list of uncommitted changes (staged + unstaged)
3. `git log --oneline -20` — recent commits for session detection (skip if no HEAD)
4. `git diff --stat HEAD` — all uncommitted changes summary (skip if no HEAD)

**Session commit detection:** Distinguish this session's commits using this fallback chain:
1. `git log --oneline --since="midnight" -20` on the current branch — today's commits (capped at 20)
2. If no commits found or on a shared branch (main/master), fall back to last 10 commits on the current branch
3. Note "session boundary estimated" if using the fallback

Known limitation: sessions spanning midnight will miss pre-midnight commits. On shared branches, today's commits may include other authors' work — acceptable since the handoff captures observable state, not attribution.

### Conversation Analysis (Context Layer)

The agent scans conversation content available in its current context window. Do not attempt to retrieve conversation history beyond what is in context. If context has been compressed or truncated, note "Conversation partially scanned" in the handoff.

Scan for context that git cannot provide:

**Done items:** Look for completed actions — tool calls that wrote files, test runs that passed, user confirmations of completed work. Cross-reference with git commits to avoid duplication.

**Pending items:** Scan for:
- Explicit deferrals: "later", "next session", "TODO", "we'll do this after"
- Unfinished implement-plan tasks: if the conversation references a strategy spec path, read the spec and count `[DONE]` vs remaining steps. Include the spec path and remaining count. If `tmp/execution-report.md` exists, reference it in the Done section but do not attempt to derive the strategy spec path from it — require the path from conversation context. This `[DONE]` parsing is specific to implement-plan artifacts.
- Unfinished plan tasks (generic): if a plan file is referenced (e.g., `docs/superpowers/plans/*.md`), parse unchecked checkbox items (`- [ ]`) into concrete Pending bullets. Include the plan path and completion ratio as summary metadata.
- Discussed but not started: topics the user raised that weren't acted on

**Decisions:** Scan for:
- User choices: "let's go with", "option X", "yes", "agreed", accepted proposals
- Rejected alternatives: "not option Y because Z"
- Constraints expressed: "don't", "always", "never", "we prefer"

**Gotchas:** Scan for:
- Warnings: "be careful", "don't forget", "this is tricky", "won't work unless"
- Environment requirements: Docker, database, API keys, specific versions
- Generated files: files flagged as generated or auto-created
- Order dependencies: "do X before Y", "this must run first"

**File paths:** Collect file paths mentioned in context of work done or pending. Include them inline with their relevant Done/Pending items, not as a separate section.

**Scanning priorities:** If the conversation is long, prioritize recent tool calls, user instructions, and decisions over early-session exploration.

---

## Step 2: Compose

Assemble the handoff document from gathered data.

### Frontmatter

```yaml
---
generated: YYYY-MM-DDTHH:MM  # local time, no timezone suffix
git_available: true | false
branch: <current-branch or commit-hash or null>
uncommitted_changes: true | false
uncommitted_files: [list of paths]
session_commits: <count>
pending_items: <count>
---
```

### Document Template

```markdown
# Session Handoff

## Done
- <bullet: brief description + relevant file paths>

## Pending
- <bullet: what needs to happen + relevant file paths>

## Decisions
- <bullet: "Decided X because Y">

## Gotchas
- <bullet: non-obvious traps, warnings, environment requirements>

## Git State
- **Branch:** <name>
- **Uncommitted changes:** <yes/no, list of files if yes>
- **Session commits:**
  - <hash> <message>
```

### Content Guidelines

- **Terse:** Bullet points, not paragraphs. This is for an AI agent, not a human reader.
- **Factual:** State what happened, not what was discussed.
- **Paths, not content:** Reference files by path. Never inline file content.
- **Why over what:** In Decisions, the *why* is more valuable than the *what*.
- **Actionable pending items:** Tell the next agent what to do, not just what exists.
- **Concise:** Target 5-15 bullets per section. If >20 items, group and summarize. Total target: under 200 lines.

---

## Step 3: Write

1. Create `tmp/` directory if it doesn't exist.
2. Write the composed document to `tmp/session-handoff.md`, overwriting any existing file.
3. **Self-check:** Read the file back and confirm: frontmatter contains `git_available`, `branch`, `uncommitted_changes`, `uncommitted_files`, `session_commits`, `pending_items`; all 5 section headers (`## Done`, `## Pending`, `## Decisions`, `## Gotchas`, `## Git State`) are present. If validation fails, attempt one rewrite. If second attempt also fails, write as-is and warn: "Handoff written but missing: {list of missing elements}."
4. Print confirmation: "Handoff written to `tmp/session-handoff.md`." Check the project's root `CLAUDE.md` for a reference to `session-handoff.md`. If not found, append: "Note: Add this line to your CLAUDE.md for auto-discovery: `If tmp/session-handoff.md exists, read it before starting any work.`"
5. Print a continuation prompt the user can paste into a new session:
   ```
   ── Continuation prompt ─────────────────────────
   Read tmp/session-handoff.md and continue where the previous session left off.
   ────────────────────────────────────────────────
   ```

---

## Auto-Discovery Setup

The next session discovers the handoff via a CLAUDE.md instruction:

> "If `tmp/session-handoff.md` exists, read it before starting any work. It contains context from the previous AI session. If the `generated` timestamp is more than 24 hours old, note that the handoff may be outdated."

This is a one-time setup. The skill does not modify CLAUDE.md.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Not a git repository | Skip git analysis. Conversation only. Warn: "No git repo — handoff will be conversation-based only." Non-git frontmatter: `git_available: false`, `branch: null`, `uncommitted_changes: false`, `uncommitted_files: []`, `session_commits: 0`. |
| No commits today | Git State shows branch + uncommitted changes only. `session_commits: 0`. |
| No conversation context | Git-only handoff. Done from git. Decisions, Gotchas, Pending: "No conversation context available." |
| Nothing to hand off | Warn, do not write. Condition: no git changes AND all four content sections empty. Placeholders don't count as content — if git produced Done items but conversation produced nothing, the file IS written (with placeholders for Pending/Decisions/Gotchas). |
| `tmp/` doesn't exist | Create it. |
| Previous handoff exists | Overwrite. Each invocation is a cumulative snapshot. |
| Context compressed | Scan available context, prioritize recent. Note: "Conversation partially scanned." |
| Detached HEAD | Use commit hash from `git rev-parse --short HEAD`. |
