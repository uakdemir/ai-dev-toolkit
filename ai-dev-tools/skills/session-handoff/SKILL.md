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

**Preflight:** Check if `gitStatus` is present in the conversation context (injected by Claude Code at session start).

**If `gitStatus` is present (typical case):**

Extract from `gitStatus`:
- **Branch name:** from "Current branch:" line
- **Starting HEAD:** the first commit SHA listed in the "Recent commits:" field (gitStatus lists commits most-recent-first) — this is HEAD at session start since gitStatus is injected before any work begins
- **Git repo:** confirmed by `gitStatus` presence

If `gitStatus` is present but "Recent commits:" is missing or empty, extract branch name from `gitStatus`, then fall back to `git log --oneline --since="midnight" -20` for session commits.

Run exactly 2 commands:
1. `git status --short` — current uncommitted state (may differ from session start)
2. `git log --oneline <start_head>..HEAD` — exact session commits (commits made between session start and now)

`git diff --stat HEAD` is dropped. `git status --short` is sufficient for the Git State section body (file paths with status codes replace the line-count format from `git diff --stat HEAD`).

If `git log` returns nothing (no new commits this session), `session_commits: 0`.

If `git log` fails for any reason — including ambiguous SHA, rebase, or force-push — fall back to `git log --oneline --since="midnight" -20`.

**If `gitStatus` is absent (non-standard invocation):**

1. Run `git rev-parse --is-inside-work-tree`. If fails, skip all git and proceed
   conversation-only. Warn: "No git repo — handoff will be conversation-based only."
2. Run `git rev-parse --verify HEAD`. If fails (empty repo with no commits), skip
   all git history commands. Set `session_commits: 0` and note
   "Empty repo (no commits) — handoff will be conversation-based only." Proceed to
   conversation-only path.
3. Run `git branch --show-current` and `git status --short` (always — lightweight).
4. Ask: "I don't have the session start point. Want me to check recent git history
   to find session commits?"
   - If yes: run `git log --oneline --since="midnight" -20`.
     If the result is zero commits, set `session_commits: 0` and note
     "No commits found since midnight — handoff will be conversation-based only."
     If commits found, note "session boundary estimated" in the handoff.
   - If no: conversation-only for commits. Set `session_commits: 0`. Branch name and uncommitted file state (from steps 2-3) are still written to the handoff frontmatter. Only session commit history is omitted.

> **Non-normative implementation note:** The agent has witnessed every commit it made during the session via tool call results. The `git log <start_head>..HEAD` output serves as the authoritative commit list, but the agent should cross-reference with its own memory of commits for richer Done item descriptions (commit messages alone may lack context the agent observed).

### Conversation Analysis (Context Layer)

The agent scans conversation content available in its current context window. Do not attempt to retrieve conversation history beyond what is in context. If context has been compressed or truncated, note "Conversation partially scanned" in the handoff.

Scan for context that git cannot provide:

**Done items:** Look for completed actions — tool calls that wrote files, test runs that passed, user confirmations of completed work. Cross-reference with git commits to avoid duplication.

**Pending items:** Scan for:
- Explicit deferrals: "later", "next session", "TODO", "we'll do this after"
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
