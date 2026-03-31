# Quality Gate Triggers

This file is loaded by orchestrate at Step 8, after the user confirms finalize.
It contains the quality gate baseline computation logic.

---

## Unified Commit-Count Heuristic

All commit-based gates use a single git command with the plan hash as baseline.

### Algorithm

```
plan_hash = read from tmp/orchestrate-state.md
if plan_hash is empty → skip quality gates entirely (nothing was implemented)

Run `git log --oneline {plan_hash}..HEAD` and count the number of returned
lines as `commit_count` (count in the orchestrator, not via shell pipe).

If the git log command fails → skip quality gates entirely and warn:
"Could not compute commit count from plan hash. Quality gates skipped."

Recommendations (check all, collect matches):
  convention-enforcer:  commit_count > 7   [Warning]
  test-audit:           commit_count > 10  [Warning]
  document-for-ai:      commit_count > 5   [Warning]
  consolidate:          commit_count > 40  [Info]
  session-handoff:      [Info] (not git-based, see below)
```

Threshold rationale: file-based gates converted using ~3 files per commit (convention-enforcer 20/3≈7, document-for-ai 15/3=5). Commit-based gates (test-audit >10, consolidate >40) kept their original thresholds.

### Session-Handoff Detection

The session-handoff gate is not git-based and is unaffected by the commit count heuristic. It triggers when the conversation exceeds ~50 exchanges or the user mentions context pressure. This is a subjective heuristic the orchestrating LLM evaluates based on conversation length.

### Recommendation Messages

Each gate uses commit count in its message:

| Gate | Message |
|---|---|
| convention-enforcer | "{N} commits since plan → run /convention-enforcer (recommended)" |
| test-audit | "{N} commits since plan → run /test-audit" |
| document-for-ai | "{N} commits since plan → run /document-for-ai" |
| consolidate | "{N} commits since plan → run /consolidate" |
| session-handoff | "Long conversation. Consider /session-handoff before next feature" |

## Presentation Format

```
Feature "{name}" complete.

Recommendations:
  [Warning] 7 commits since plan → run /convention-enforcer (recommended)
  [Warning] 12 commits since plan → run /test-audit

What's next?
  > Next feature (continue with /orchestrate)
  > Run a recommendation above
  > Something else (tell me what you need)
```

- Warnings first, info second.
- Max 3 recommendations at a time. If more than 3 gates trigger, show the top 3 by priority.
- Priority order: convention-enforcer > test-audit > document-for-ai > consolidate > session-handoff.
- User can always choose "something else" — never locked into recommendations.
- "What's next?" always offers 3 options: next feature, run a recommendation, or something else.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `git log` command fails | Skip all quality gates, warn: "Could not compute commit count from plan hash. Quality gates skipped." |
| plan_hash empty | Skip all quality gates (nothing was implemented). |
