# Quality Gate Triggers

This file is loaded by orchestrate at Step 8, after the user confirms finalize.
It contains the quality gate baseline computation logic.

---

## Quality Gate Triggers

Checked after Step 8 (cycle completion) and presented as recommendations. Quality gates are recommended, not invoked — the user decides when to run them.

| Gate | Trigger | Detection | Recommendation |
|---|---|---|---|
| convention-enforcer | >20 files changed since last run | `git diff --name-only {baseline}..HEAD` where baseline = last commit with `convention-enforcer` in message | "Warning: {N} files changed since last convention-enforcer. Run `/convention-enforcer`" |
| api-contract-guard | New module directory created OR >15 files added | `git log --diff-filter=A --name-only {baseline}..HEAD` for new top-level directories or bulk additions | "Warning: New module `{name}` created. Run `/api-contract-guard`" |
| test-audit | >10 commits since last run | `git log --oneline {baseline}..HEAD` where baseline = last commit with `test-audit` in message | "Warning: {N} commits since last test-audit. Run `/test-audit`" |
| document-for-ai | >15 files changed since last run | `git diff --name-only {baseline}..HEAD` where baseline = last commit with `document-for-ai` in message. **Fallback:** If no commit message contains `document-for-ai`, check `git log -- docs/architecture/adrs/ docs/architecture/adrs.md AI_INDEX.md` for the most recent commit touching any ADR artifact. No baseline from either = "never run," always recommend. | "Warning: {N} files changed since last doc update. Run `/document-for-ai`" |
| consolidate | >40 commits since last run | Same pattern with `consolidate` baseline | "Info: {N} commits since last consolidate. Run `/consolidate`" |
| refactor-to-layers | Module exceeds ~30K lines | Scan directories containing source files, `wc -l` (directory detection is project-dependent — scan for directories containing source files) | "Warning: Module `{name}` at {N}K lines. Consider `/refactor-to-layers`" |
| session-handoff | Long conversation (>50 exchanges) or user mentions context pressure | Superseded by Step 0/Step 2 context health check for mid-cycle detection. This quality gate trigger remains for post-cycle recommendation only (between features). | "Info: Long conversation. Consider `/session-handoff` before next feature" |

## Detection of "Last Run"

Scan `git log --oneline` for commits whose messages contain the skill name as a substring. This matches both `feat(convention-enforcer):` parenthetical format and `convention-enforcer: ...` prefix format. Most recent such commit = baseline. No such commit = "never run" and always recommend on first trigger check.

For each gate, compute the baseline independently. The baseline is the most recent commit whose message contains the gate's skill name. If no baseline exists, use the repository root (all history counts).

## Presentation Format

```
Feature "{name}" complete.

Recommendations:
  [Warning] 23 files changed since last convention-enforcer -> run /convention-enforcer
  [Info] Long conversation -- consider /session-handoff before next feature

What's next?
  > Next feature (continue with /orchestrate)
  > Run a recommendation above
  > Something else (tell me what you need)
```

- Warnings first, info second.
- Max 3 recommendations at a time. If more than 3 gates trigger, show the top 3 by priority.
- Priority order: convention-enforcer > api-contract-guard > test-audit > document-for-ai > consolidate > refactor-to-layers > session-handoff.
- User can always choose "something else" — never locked into recommendations.
- "What's next?" always offers 3 options: next feature, run a recommendation, or something else.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Quality gate git commands fail | Skip that gate, warn: "Could not compute baseline for {gate}." Continue with remaining gates. |
| No baseline commit found for a gate | Treat as "never run" — always recommend. |
