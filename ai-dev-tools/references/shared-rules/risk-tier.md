---
name: risk-tier
applies-to: [review-code, review-doc, implement]
canonical: Every run resolves its tier before it dispatches an agent, prints the tier and its reason first, and takes its process and each agent's model and effort from that tier unless a flag sets them.
---

# What decides a run's process, and the model and effort of its agents

**Every run resolves its tier before it dispatches an agent, prints the tier and its reason first, and takes its process and each agent's model and effort from that tier unless a flag sets them.**

The tier is FULL, LIGHT or MECHANICAL. It decides the process of a run; the activity (reviewer,
fixer, coder) decides the model and the effort. The routing table at the end of this file defines
the pairing. The three skills read it at run time and do not restate it, except the escalation's
Opus, which `implement` names on its call. Every file that restates any of it is listed under
Governed sites, to be kept in step with the table.

## Tiers

**Code tier.** `review-code` reads it from the diff, and `implement` from the plan or spec it
implements.

- **FULL if any of these hold:**
  - the work deletes, erases or retains data
  - it touches authentication, sessions or identity
  - it touches billing or entitlements
  - it changes a database migration or schema
  - it touches a security boundary
  - it changes infrastructure-as-code
  - it changes legal or consent-bearing copy
  - it changes a cross-package public surface
  - it exceeds about 400 production lines
  - it is hard to reverse once shipped: a new stored-data shape, a mobile release, messages sent to
    users
- **MECHANICAL if all of these hold:**
  - the work changes no behaviour
  - it is docs or comments, renames or moves proven by an instrument, formatting, generated files,
    or internal scripts off the production path
- **LIGHT:** everything else.

`review-code` runs the instrument that proves a rename or move when it classifies (for a rename, a
`git grep` for the old name, which must return nothing) and quotes the command and its result in the
reason. A rename or move it cannot prove that way is LIGHT: its MECHANICAL path runs only
`--verify`, so the classification is the one place the proof can happen.

**Doc tier.** `review-doc` reads it from the documents as they stand. For a tracked document it also
reads the latest change: `git diff HEAD -- <doc>` when there are uncommitted edits, otherwise the
last commit that touched it. An untracked document has no latest change, so it is never MECHANICAL.

- **FULL if any:** the document drives FULL-tier work, carries legal, policy or consent content, or
  makes claims about existing code.
- **MECHANICAL if all:** the change is wording, formatting or links, or runbook steps and notes with
  no decision content.
- **LIGHT:** everything else.

**When unsure between two tiers, take the higher.** The session classifies; no agent is dispatched
for it. It works from what the skill already reads, plus the root CLAUDE.md's `## Risk tiers`
section (below) and, in `review-code`, the instrument above. The reason it prints names the
trigger and the evidence, such as a path or a task number.

## Project extension

A `## Risk tiers` section in the project's root CLAUDE.md adds FULL triggers in the project's own
vocabulary. For Tune, that is the moat (IAM, access, network), the exports doors, and messages sent
to members. A project section adds triggers; it never removes a generic one. `review-code` already
reads CLAUDE.md for its reviewer, and the classifier reads the same file.

## Resolution

1. **`--tier <level>`:** that tier, with no classification. It may lower a stored tier, and it is
   the only thing that can. Its values are `full`, `light` and `mechanical`, matched exactly as
   `--effort`'s are; any other prints `Error: --tier must be one of: full, light, mechanical.` and
   exits.
2. **Otherwise:** classify, read the floor (next section), and take the higher of the two. If the
   result is higher than the floor, print it as "moved up". If the floor's tier stands, print it as
   carried.
3. **Explicit `--max-iterations N` with N at least 1 on a MECHANICAL run:** the tier wins. The run
   skips review, and the tier line reports the flag as unused. This holds whether MECHANICAL was
   classified or passed as `--tier mechanical`. Only `--tier light` or `--tier full` forces a review
   of a mechanical change.
4. **`--max-iterations 0`:** keeps its meaning in both review skills. It is resolved before tier
   resolution, so it prints no tier line and writes no tier file.
5. **Agent flags on a MECHANICAL review run** (`--effort`, `--fix-effort`, `--model`) set fields of
   agents that run does not dispatch. They are unused too, and the tier line says so. `implement`'s
   MECHANICAL coder takes `--model` and `--effort` as usual; they are unused only when the session
   makes the scripted edit.

## The floor: `tmp/risk-tier-<session-id>.md`

One file per conversation, named by `$CLAUDE_CODE_SESSION_ID`. A run opens only its own
conversation's file and never reads another conversation's, so two conversations in one worktree
never overwrite each other's floor.

```
tier: FULL
reason: the diff touches auth/session.ts
session: <$CLAUDE_CODE_SESSION_ID>
branch: <git rev-parse --abbrev-ref HEAD>
set_by: review-code
set_at: <ISO-8601>
```

- **Read:** the stored tier counts only when `session` matches `$CLAUDE_CODE_SESSION_ID` and
  `branch` matches the current branch. Otherwise it is ignored and then overwritten, never used. A
  new conversation has its own file, so nothing goes stale overnight.
- **Write:** every run that resolved a tier writes the file after printing the tier line. A `--tier`
  run stores `reason: --tier <level>`.
- **Unset variable:** when `CLAUDE_CODE_SESSION_ID` is unset, the run neither reads nor writes the
  file, and the tier line ends with `(not carried: no session id)`.
- **Never deleted by the review skills' Setup**, which deletes only under `tmp/_reviews_errors/`.
  Nothing else deletes the files either: earlier conversations' files stay behind in gitignored
  `tmp/`.
- **Measured on 2026-10-10:** Claude Code exports `CLAUDE_CODE_SESSION_ID` to the session's Bash
  calls; its value matched the session's scratchpad directory. A sub-agent sees the same value as
  the session that dispatched it, so a skill run inside one reads and writes its session's floor.
  `/clear` changes the value, so it starts a new floor; resuming a conversation keeps it.

## Precedence

An explicit flag beats the tier's row, one field at a time:

| Field | Flag |
|---|---|
| Round count | `--max-iterations` |
| Effort of the reviewer and the fact-checker; implement's coders and its escalation | `--effort` |
| Effort of the fixer and the self-reviewer | `--fix-effort` |
| Model of every agent in the run, except implement's escalation, which is always Opus | `--model` |
| implement's execution mode | `--mode` |

## Output

The two tier lines print before anything else a review run prints. `implement` prints them when its
tier step runs, after Steps A to C and ahead of the task graph. The run does not pause after them.

```
Tier: FULL — the diff touches auth/session.ts
1 round · reviewer Opus·max · fixer Opus·max
```

Variants:

- **Carried:** `Tier: FULL — carried from implement (12:04): the plan's tasks 3-4 add a migration`
- **Moved up:** `Tier: LIGHT — moved up from MECHANICAL: session.ts changes behaviour`
- **A field set by a flag:** labelled, e.g. `fixer Opus·high (--fix-effort)`
- **review-doc:** `1 round · reviewer, fact-checker Opus·max · fixer Opus·high`
- **implement:** `mode single · coders Sonnet·high · escalation Opus·high`
- **implement on a FULL run without `--mode`:** the mode is not chosen yet, so the line
  reads `mode pending · coders Sonnet·high · escalation Opus·high`. When the picker answers, or
  `--auto` takes the recommendation, the run prints `Mode: per-task (picked)` or
  `Mode: single (recommended)`.
- **implement's scripted edit (MECHANICAL):** `mode scripted edit · no agents`
- **MECHANICAL:** `no review agents · runs --verify` (review-code) or `no review round` (review-doc)

## Routing table

| Skill | Field | MECHANICAL | LIGHT | FULL |
|---|---|---|---|---|
| review-code | rounds | none; runs `--verify` once | 1 | 1 |
| | reviewer | — | Opus·high | Opus·max |
| | fixer, self-review | — | Opus·high | Opus·max |
| review-doc | rounds | none; the session confirms each changed factual sentence | 1 | 1 |
| | reviewer, fact-checker | — | Opus·max | Opus·max |
| | fixer, self-review | — | Opus·high | Opus·max |
| implement | process | one coder, or a scripted one-off edit | one coder | the picker: `single` or `per-task` |
| | coders, per-task spec reviewers | Sonnet·high | Sonnet·high | Sonnet·high |
| | escalation | one fresh attempt on Opus at the coders' effort, then BLOCKED | same | same |

In agent terms, Opus·high is `ai-dev-tools:high-effort` with `model: opus`, Opus·max is
`ai-dev-tools:max-effort` with `model: opus`, and Sonnet·high is `ai-dev-tools:high-effort` with
`model: sonnet`.

**Every call names a model.** The tier always supplies one, so `CLAUDE_CODE_SUBAGENT_MODEL` no
longer decides a dispatched agent's model in these skills.

## Governed sites

- `skills/review-code/SKILL.md`
- `skills/review-doc/SKILL.md`
- `skills/implement/SKILL.md`

Restatements of the routing table, to be kept in step with it. No gate reads them:

- `skills/implement/SKILL.md` (Escalation) and `references/shared-rules/agent-dispatch-pin.md` (The
  call): the escalation's `model: "opus"`
- `skills/orchestrate/references/auto/stages/stage-i-spec-review.md` (both phases) and
  `skills/orchestrate/references/auto/stages/stage-iii-code-review.md`: the review agents' model
- `skills/orchestrate/references/auto/stages/stage-ii-implement.md`: the coders' model
