# Session Handoff — Edge Cases

## gitStatus Absent (Non-Standard Invocation)

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

---

## Auto-Discovery Setup

The next session discovers the handoff via a CLAUDE.md instruction:

> "If `./tmp/session-handoff.md` exists, read it before starting any work. It contains context from the previous AI session. If the `generated` timestamp is more than 24 hours old, note that the handoff may be outdated."

This is a one-time setup. The skill does not modify CLAUDE.md.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Not a git repository | Skip git analysis. Conversation only. Warn: "No git repo — handoff will be conversation-based only." Non-git frontmatter: `git_available: false`, `branch: null`, `uncommitted_changes: false`, `uncommitted_files: []`, `session_commits: 0`. |
| No commits today | Git State shows branch + uncommitted changes only. `session_commits: 0`. |
| No conversation context | Git-only handoff. Done from git. Decisions, Gotchas, Pending: "No conversation context available." |
| Nothing to hand off | Warn, do not write. Condition: no git changes AND all four content sections empty. Placeholders don't count as content — if git produced Done items but conversation produced nothing, the file IS written (with placeholders for Pending/Decisions/Gotchas). |
| Context compressed | Scan available context, prioritize recent. Note: "Conversation partially scanned." |
| Detached HEAD | Use commit hash from `git rev-parse --short HEAD`. |
