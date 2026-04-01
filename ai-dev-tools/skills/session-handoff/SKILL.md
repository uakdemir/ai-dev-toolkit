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

Generate a structured handoff document at `./tmp/session-handoff.md` for consumption by the next AI agent session. Gathers facts from git state and context from conversation, producing a terse, machine-parseable file with YAML frontmatter + 5 sections.

**Prerequisite:** Auto-discovery requires a one-time setup — a CLAUDE.md instruction or SessionStart hook that reads `./tmp/session-handoff.md` on startup. Without this setup, the file is written but not automatically consumed.

## Workflow Overview

Execute these steps in order. Each step feeds into the next:

1. **Gather** — collect git state + scan conversation for context
2. **Compose** — assemble the handoff document
3. **Write** — write to `./tmp/session-handoff.md`, confirm to user

No tech stack selection, no scope detection, no parallel agents, no reference files. Single-pass, single output.

---

## Step 1: Gather

### Git Analysis (Factual Backbone)

**Preflight:** Check if `gitStatus` is present in the conversation context (injected by Claude Code at session start).

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

If gitStatus is absent from conversation context, read
references/edge-cases.md for the fallback flow.

> **Non-normative implementation note:** The agent has witnessed every commit it made during the session via tool call results. The `git log <start_head>..HEAD` output serves as the authoritative commit list, but the agent should cross-reference with its own memory of commits for richer Done item descriptions (commit messages alone may lack context the agent observed).

### Conversation Analysis (User Messages Only)

Scan ONLY the user's messages in the conversation. Do not scan LLM responses
or tool results — they are verbose and waste context tokens. One exception:
the TaskList tool may be invoked directly as a structured artifact — it is
not part of conversation scanning (see In-Progress Skill Detection below).

From user messages, extract:

**Done:** Commands the user ran — skill invocations, /orchestrate calls,
  /orchestrate (/...) wrapped commands. Each invocation = one completed action.

**Pending:** Explicit deferrals in user messages ("later", "next session",
  "TODO", "skip for now"). Also: uncompleted /orchestrate (/...) breadcrumbs
  where the user ran /orchestrate (/X) but there is no subsequent /orchestrate
  call in the conversation.

**Decisions:** User choices ("go with A", "option 2", "yes to X", "no,
  because Y"). Capture the choice and the stated reason.

**Gotchas:** User-stated warnings ("be careful with", "don't forget",
  "this breaks if"). Do not extract gotchas from tool results.

### In-Progress Skill Detection

After scanning user messages, check TaskList for active tasks.

If tasks exist:
1. Use task subjects, descriptions, and completion status as the primary
   source for Done and Pending items. Tasks created by skill workflows
   have reliable status tracking and ordering.
2. The first incomplete task is the next action. Do not skip to a
   downstream task.
3. If tasks are numbered sequentially, preserve ordering and terminology.
   Skill identification is not required — task order and subject are sufficient.

If TaskList tool is unavailable or returns an error, skip In-Progress Skill Detection and rely on user-message scanning only. If TaskList returns no tasks or all tasks are completed: fall back to user-message scanning as sole source. Completed tasks may supplement the Done section.

Task list items take priority over conversation-derived items when they
conflict. Conversation scanning fills gaps (decisions, gotchas) that
tasks do not capture.

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

### Next Action Validation

Before writing the Pending section, validate ordering:

1. If a review or approval step is incomplete in the task list, do not
   list any post-review step (implementation, plan writing) as the
   first pending item.
2. If a spec file referenced in pending items has Status: Draft, do not
   list implementation or plan writing as the next action.
3. The first Pending bullet must be the immediate next action. Downstream
   steps may follow but must be listed after it.

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
2. Write the composed document to `./tmp/session-handoff.md`, overwriting any existing file.
3. **Self-check:** Read the file back and confirm: frontmatter contains `git_available`, `branch`, `uncommitted_changes`, `uncommitted_files`, `session_commits`, `pending_items`; all 5 section headers (`## Done`, `## Pending`, `## Decisions`, `## Gotchas`, `## Git State`) are present. If validation fails, attempt one rewrite. If second attempt also fails, write as-is and warn: "Handoff written but missing: {list of missing elements}."
4. Print confirmation: "Handoff written to `./tmp/session-handoff.md`." Check the project's root `CLAUDE.md` for a reference to `session-handoff.md`. If not found, append: "Note: Add this line to your CLAUDE.md for auto-discovery: `If ./tmp/session-handoff.md exists, read it before starting any work.`"
5. Print a continuation prompt the user can paste into a new session:
   ```
   ── Continuation prompt ─────────────────────────
   Read ./tmp/session-handoff.md and continue where the previous session left off.
   ────────────────────────────────────────────────
   ```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `tmp/` doesn't exist | Create it. |
| Previous handoff exists | Overwrite. Each invocation is a cumulative snapshot. |

See references/edge-cases.md for non-standard scenarios (no git repo, no commits, detached HEAD, nothing to hand off).
