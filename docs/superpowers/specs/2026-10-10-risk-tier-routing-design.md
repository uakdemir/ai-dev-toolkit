# Risk tiers: review-code, review-doc and implement route their own agents

**Date:** 2026-10-10 · **Target release:** ai-dev-tools 6.0.0 · **Skills:** review-code, review-doc,
implement (plus restatements in orchestrate, help, the agent definitions and two shared rules) ·
**Part A of three.** Part B deprecates orchestrate. Part C covers spec creation, plan depth by tier,
artifacts, and merging plan decisions back into the spec.

## Why

5.0.1 shipped seven copy-and-paste prompts in `ai-dev-tools/prompts/`. Their central idea is a risk
tier, FULL, LIGHT or MECHANICAL, that decides the process, the model and the effort of a run. No
skill implements that idea. An analysis on 2026-10-10 found the following; it was written to a
gitignored `tmp/` file, so the findings are copied here:

- **Unguarded and drifting.** No gate reads `prompts/*.txt`. The code tier exists in four copies,
  in two wordings: "sessions" and the "move up midway" rule appear only in the long one.
- **Two passages contradict the skills they drive.**
  - ReviewCode.txt:16 says "Reviewer, fact-checker, fixer — no other agents", but review-code's
    self-review is always on (`skills/review-code/SKILL.md:280`).
  - Implement.txt:12-14 uses picker option [1] to mean one Sonnet subagent, but the skill's [1]
    runs `superpowers:executing-plans` in the session (`implementation-step.md:98`).
- **Claude Code never loads `prompts/`,** so colleagues have to paste them.
- **The plugin's own pipeline never gets the policy.** `orchestrate` passes no `--model`, so its
  reviews run on `CLAUDE_CODE_SUBAGENT_MODEL`, which is Sonnet on the founder's machine. Sonnet
  reviewers found 1/5 to 1/3 of Opus's serious findings (5.0.0 spec, Risks).
- **What max effort buys** (5.0.0 spec, Why):
  - A max reviewer costs about 2× a high one.
  - Per review-code round, it finds about 2× the Critical and High findings (0.54 vs 0.26).
  - So its cost per serious finding is the same. Max is worth paying where a miss is expensive,
    which is what FULL means.

## Decisions (settled in brainstorming, 2026-10-10)

| # | Decision |
|---|---|
| 1 | Each skill classifies the tier itself. The tier decides the process; the activity decides model and effort |
| 2 | `--tier full\|light\|mechanical` skips classification. An explicit `--model`, `--effort`, `--fix-effort`, `--max-iterations` or `--mode` overrides the tier's row, one field at a time |
| 3 | Routing follows §2: reviewers by tier, and fixers at max in FULL |
| 4 | The tier sets the round count and prints it, so `--max-iterations` becomes optional |
| 5 | Generic triggers live in the rule. A project adds its own under `## Risk tiers` in its CLAUDE.md |
| 6 | `--model` names an LLM in every skill. implement's execution mode moves to `--mode single\|per-task`, and in-session coding is removed |
| 7 | The tier persists in `tmp/risk-tier.md`, per worktree and per conversation, as a floor |
| 8 | review-code gets no fact-checker. Its findings are already re-judged by the fixer's push-back and by the triage phase, and `--verify` is its ground truth (`skills/review-code/SKILL.md:237`). This closes the 5.0.0 spec's Follow-up 1 |
| 9 | Delete the five prompts that drive these three skills |

## Scope

**In:** the new shared rule; tier resolution and routing in review-code, review-doc and implement;
rewriting `agent-dispatch-pin` to govern implement; updating restatements; deleting five prompts;
release 6.0.0.

**Out:**
- **Part B, deprecating orchestrate:** the founder and colleagues now run review-doc, implement and
  review-code directly, and each works on its own. `tmp/risk-tier.md` already carries the tier
  between those calls, which was the one thing orchestrate would have added. So orchestrate gets no
  new work: part B marks it deprecated and later removes it. Part A changes it only where its files
  would otherwise become wrong (§7).
- **Part C:**
  - plan depth by tier (FULL uses writing-plans, LIGHT a chat plan of up to 15 lines, MECHANICAL the
    change plus the instrument that proves it)
  - spec creation at the right effort; brainstorming runs in the session, and a skill can read
    `CLAUDE_EFFORT` but cannot set it
  - artifact creation
  - merging plan decisions back into the spec
  - CreateArtifact.txt and MergePlanDecisionsIntoSpec.txt
- **The session's own effort:** the founder drops `--effort max` from the `cl`/`cla`/`cld` aliases.
  `modelSettings` already defaults both Opus and Sonnet to high. Pins never depended on this
  (measured 2026-10-05, `agent-dispatch-pin.md`); it affects only work done in the session.

## 1. The rule: `references/shared-rules/risk-tier.md`

```
---
name: risk-tier
applies-to: [review-code, review-doc, implement]
canonical: Every run resolves its tier before it dispatches an agent, prints the tier and its reason first, and takes its process and each agent's model and effort from that tier unless a flag sets them.
---
```

The rule has no detector, so checks A, A', A2 and C are its whole binding. A2 requires each skill
to state the canonical sentence word for word; C requires each to cite the rule's path.

### 1.1 Tiers

**Code tier.** review-code reads it from the diff, and implement from the plan or spec it
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
  - it is hard to reverse once shipped: a new stored-data shape, a mobile release, messages sent
    to users
- **MECHANICAL if all of these hold:**
  - the work changes no behaviour
  - it is docs or comments, renames or moves proven by an instrument, formatting, generated files,
    or internal scripts off the production path
- **LIGHT:** everything else.

**Doc tier.** review-doc reads it from the documents as they stand. For a tracked document it also
reads the latest change: `git diff HEAD -- <doc>` when there are uncommitted edits, otherwise the
last commit that touched it.
- **FULL if any:** the document drives FULL-tier work, carries legal, policy or consent content, or
  makes claims about existing code.
- **MECHANICAL if all:** the change is wording, formatting or links, or runbook steps and notes with
  no decision content.
- **LIGHT:** everything else.

**When unsure between two tiers, take the higher.** The session classifies; no agent is dispatched
for it. It works from what the skill already reads. The reason it prints names the trigger and the
evidence, such as a path or a task number.

### 1.2 Project extension

A `## Risk tiers` section in the project's root CLAUDE.md adds FULL triggers in the project's own
vocabulary. For Tune, that is the moat (IAM, access, network), the exports doors, and messages sent
to members. A project section adds triggers; it never removes a generic one. review-code already
reads CLAUDE.md for its reviewer, and the classifier reads the same file.

### 1.3 Resolution

1. **`--tier <level>`:** that tier, with no classification. It may lower a stored tier, and it is
   the only thing that can.
2. **Otherwise:** classify, read the floor (§1.4), and take the higher of the two. If the result is
   higher than the floor, print it as "moved up".
3. **Explicit `--max-iterations N` with N ≥ 1:** lifts a classified MECHANICAL to LIGHT, since a
   requested round is a request for review. With `--tier mechanical` it is an argument error:
   `Error: --tier mechanical runs no review rounds; drop --max-iterations or pass --tier light.`
4. **`--max-iterations 0`:** keeps its meaning in both review skills. It is resolved before tier
   resolution, so it prints no tier line and writes no tier file.
5. **Agent flags on a MECHANICAL run** (`--effort`, `--fix-effort`, `--model`) set fields of agents
   that run does not dispatch. They are unused, and the tier line says so; they do not lift the tier.

### 1.4 The floor: `tmp/risk-tier.md`

```
tier: FULL
reason: the diff touches auth/session.ts
session: <$CLAUDE_CODE_SESSION_ID>
branch: <git rev-parse --abbrev-ref HEAD>
set_by: review-code
set_at: <ISO-8601>
```

- **Read:** the stored tier counts only when `session` matches `$CLAUDE_CODE_SESSION_ID` and
  `branch` matches the current branch. Otherwise it is ignored and overwritten. A new conversation
  starts fresh, so nothing goes stale overnight.
- **Write:** every run that resolved a tier writes the file after printing the tier line.
- **Unset variable:** when `CLAUDE_CODE_SESSION_ID` is unset, the run neither reads nor writes the
  file, and the tier line ends with `(not carried: no session id)`.
- **Never deleted by the review skills' Setup**, which deletes only under `tmp/_reviews_errors/`. Say
  so beside the existing `tmp/past-issues-backlog.md` note.
- **Measured on 2026-10-10:** Claude Code exports `CLAUDE_CODE_SESSION_ID` to the session's Bash
  calls; its value matched the session's scratchpad directory. **Not measured:** whether a
  sub-agent sees the same value, and whether `/clear` changes it. Record both in the rule (§9).

### 1.5 Precedence

An explicit flag beats the tier's row, one field at a time:

| Field | Flag |
|---|---|
| Round count | `--max-iterations` |
| Effort of the reviewer and the fact-checker; implement's coders | `--effort` |
| Effort of the fixer and the self-reviewer | `--fix-effort` |
| Model of every agent in the run | `--model` |
| implement's execution mode | `--mode` |

### 1.6 Output

The two tier lines print before anything else the run prints. The run does not pause after them.

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
- **MECHANICAL:** `no review agents · runs --verify` (review-code) or `no review round` (review-doc)

## 2. Routing table

This table lives in the rule file only. Skills read it at run time
(`${CLAUDE_PLUGIN_ROOT}/references/shared-rules/risk-tier.md`), as review-code already does for
the backlog format, and none of them restates it.

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
| | escalation | one fresh attempt at Opus·high, then BLOCKED | same | same |

In agent terms, Opus·high is `ai-dev-tools:high-effort` with `model: opus`, Opus·max is
`ai-dev-tools:max-effort` with `model: opus`, and Sonnet·high is `ai-dev-tools:high-effort` with
`model: sonnet`.

**Every call now names a model.** The tier always supplies one, so `CLAUDE_CODE_SUBAGENT_MODEL` no
longer decides a dispatched agent's model in these skills.

**Gate traps for the rule file:**
- **Check A':** no line in a file under `references/shared-rules/` may hold a two-digit number
  next to a bare `high`, `medium`, `low` or `critical`. A date counts. Keep numbers off every line
  that names an effort.
- **Severity detector:** it reads a table row that holds `high` as a severity literal. Skill files
  are scanned by it, which is a second reason they must not restate this table.

## 3. review-code

- **Argument parsing:**
  - adds `--tier`
  - `--max-iterations` becomes optional; the tier sets it (§2)
  - the defaults of `--effort`, `--fix-effort` and `--model` become the tier's row
  - the tier is resolved before the Agent-tool and agent-type checks, because those checks depend
    on the resolved levels
- **MECHANICAL path:** handled before Setup and Pre-Flight, like `--max-iterations 0`, so it
  deletes no prior artifact, needs no clean tree, and makes no commit.
  - It runs each `--verify` command once and quotes the command, its exit code and the tail of its
    output.
  - With no `--verify`, it prints `Verification: none configured`.
  - Status is `Not reviewed (MECHANICAL)`, or `Issues Found` when a command fails.
  - It ends with `Brainstorm (needs your decisions): none — no review round`.
  - It dispatches nothing, so it skips the Agent-tool and agent-type checks and works inside a
    sub-agent at the spawn-depth cap.
- **`Found this round:` in the terminal output**, as in review-doc. It counts the final round's
  `origin: "document"` findings, excluding self-review findings per
  `counts-exclude-self-review.md`. It is the last count line and comes immediately before the
  brainstorm line.
- **The iteration log** gains a line:
  `**Tier:** FULL — <reason> (classified | --tier | carried | moved up)`.
- **Also updated:** `argument-hint`, the argument table, `--help` and its examples. The sentence
  "this skill has no fact-checker" stays true.

## 4. review-doc

- **Argument parsing:** the same tier step, using the doc tier. `--max-iterations` becomes optional.
  The defaults follow §2. `--fact-check` still defaults to true, and an explicit `false` is still
  honoured.
- **MECHANICAL path:** handled before Setup.
  - For each factual sentence the latest change touched, the session shows the command (`git grep`,
    `ls`, `git show`) that confirms it.
  - A sentence it cannot confirm is printed `UNCONFIRMED`, and the status is `Issues Found`.
    Otherwise the status is `Not reviewed (MECHANICAL)`.
  - The output ends with the brainstorm line, `none — no review round`.
- **Also updated:** the iteration log's Tier line, `argument-hint`, the argument table, `--help`.

## 5. implement

- **Flags:**
  - `--mode single|per-task` replaces `--model single|subagent|parallel`.
  - `--model <model>` and `--effort <level>` set the coders' model and effort.
  - `--tier` is added.
  - `--auto`, `--skip-plan-recommendation` and `--run-id` keep their meaning.
  - An old value is an argument error: `Error: --model now names the coders' model; for the
    execution mode use --mode single|per-task.` This covers `single`, `subagent`, `parallel` and
    `clear-context`.
- **The tier step** classifies the plan or spec being implemented, using the code tier. It runs
  after Steps A–C (path resolution, plan-or-spec detection, the spec recommendation) and right
  before dispatch. A run that exits at Step C dispatches nothing, so it resolves no tier.
- **Process by tier:**
  - **FULL:** the picker below. `--mode` skips it. Under `--auto` the recommendation is taken.
  - **LIGHT:** `single`, with no picker and no per-task reviewers.
  - **MECHANICAL:** `single`, or a scripted exact-once edit by the session. The edit is allowed when
    the plan's change is a rename, move or reformat that one command applies and an instrument (a
    grep that must return nothing, a build) proves.
- **The picker (FULL, interactive):**
  ```
  [1] single   — one Sonnet·high agent carries the whole plan
  [2] per-task — one Sonnet·high agent per task, and a spec reviewer per task
  ```
  - The recommendation keeps the coupling assessment from `implementation-step.md`: LOW coupling
    recommends `per-task`, and anything else recommends `single`.
  - The context-budget branch goes, because the session no longer writes code.
- **Dispatch:**
  - **`single`:** one agent, in the §6 call form, given the `single` preamble and the plan. It
    follows `superpowers:executing-plans`. The preamble covers TDD, the verification gate, the spec
    compliance check, two retries then BLOCKED, "report is not evidence", the Validation block, and
    the run-id.
  - **`per-task`:** the session coordinates `superpowers:subagent-driven-development` with the
    `per-task` preamble. Every implementer and spec reviewer is dispatched in the §6 call form. The
    per-task code-quality reviewer is skipped (unchanged). New: SDD's final whole-branch review is
    skipped too, because review-code follows at the tier's level.
  - **Concurrency** is the session's `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`. The skill states no
    number.
- **Escalation:**
  - For each task the coders report BLOCKED, the session dispatches one fresh agent for that task
    at the coders' effort on `model: opus`.
  - If the coders already ran on Opus, this is a fresh attempt on the same model.
  - If it fails, the task stays BLOCKED in the report.
- **The session verifies before it reports.** After the coders return, the session runs the plan's
  verification commands itself and quotes them, because a subagent's report is not evidence. The
  report then gives commits, the exact commands and their output, checks SKIPPED and why, and
  residual risk.
- **Errors:**
  - No Agent tool: `Error: this session has no Agent tool, so the coding agents cannot be
    dispatched. Run the skill from the top-level session, or raise
    CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH (at least 2 for a first-level sub-agent).` The MECHANICAL
    scripted edit needs no agent, so this check does not apply to it.
  - Missing agent type: the same text as the review skills.
- **Removed:**
  - in-session [1]
  - [3] clear-context and its marker file `tmp/implement-exit-status.md`
  - the Return Contract's marker lifecycle
  - [4] parallel helper
  - Edge Cases 6, 7 and 13
  - the `--auto` [4]/[1] algorithm
- **Unchanged:** the refactor-unit path, reached by a roadmap match. It still runs in the session:
  file moves proven by an instrument, which is MECHANICAL work by definition. It dispatches no
  agent, so it resolves no tier.

## 6. `agent-dispatch-pin`, rewritten

- **`applies-to`:** `[review-code, review-doc, implement]`. Its sentence excluding implement ("Neither
  takes an effort or a model for the agents it dispatches") no longer holds and is deleted.
- **New canonical sentence:** *"Every dispatched agent is the plugin agent that matches its phase's
  effort, and carries its phase's model on its Agent call; the run's tier sets both unless a flag
  does."* Check A2 requires the rule and all three skills to change in **one commit**.
- **Call forms.** Every form carries `model`; the two forms without it go. Each call is written on
  one line, with the `<…>` placeholder where the level goes, so check B can read it.
  ```
  Agent(subagent_type: "ai-dev-tools:<reviewer effort>-effort", prompt: <substituted prompt>, model: "<reviewer model>")   # reviewer, fact-checker
  Agent(subagent_type: "ai-dev-tools:<fixer effort>-effort", prompt: <substituted prompt>, model: "<fixer model>")         # fixer, self-reviewer
  Agent(subagent_type: "ai-dev-tools:<coder effort>-effort", prompt: <plan or task prompt>, model: "<coder model>")        # implement: coder, spec reviewer, escalation
  ```
  implement's form goes in `SKILL.md` itself. A form written only under `references/` is read by
  no check.
- **Sections rewritten:**
  - "When an effort flag is absent" and "When `--model` is absent" become: the tier's row decides.
  - The example in "Naming the agents from a prompt", a fact-checker run by hand between a reviewer
    and a fixer, is replaced with a neutral one.
  - "What the pin does not decide" is unchanged. `CLAUDE_CODE_EFFORT_LEVEL` and
    `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` still override, and neither skill looks for them.
- **Governed sites** gain implement's `SKILL.md` and the preamble wording in
  `implementation-step.md`.

## 7. Restatements that become false

| File | Becomes |
|---|---|
| `skills/orchestrate/references/auto/stages/stage-i-spec-review.md` (both phases) | review-doc resolves the doc tier and dispatches Opus. Its explicit `--max-iterations 2` lifts a MECHANICAL classification to LIGHT |
| `skills/orchestrate/references/auto/stages/stage-iii-code-review.md` | The same for review-code, with `--max-iterations 1` |
| `skills/orchestrate/references/auto/stages/stage-ii-implement.md` | `--auto` takes the recommendation (`single` or `per-task`); coders run on Sonnet in sub-agents, so the spawn-depth cap must be at least 2 |
| `skills/orchestrate/references/auto/profiling-log.md` | `model` records the model the tier line names: `opus` for the review skills, `sonnet` for implement, or the override. No longer `inherited` |
| `skills/orchestrate/references/standard/steps/step-5.md` | The marker handling is deleted, because it can no longer fire |
| `skills/help/SKILL.md` | The agents block: the tier chooses, flags override, and implement is listed |
| `agents/high-effort.md`, `xhigh-effort.md`, `max-effort.md` | `description`: dispatched by review-code, review-doc and implement as the tier or a flag selects |
| `skills/orchestrate/references/common/help.md` | Wherever it states implement's or the review skills' flags |
| `scripts/shared-semantics-mutation-test.sh` | N10's comment ("implement and orchestrate dispatch with a prompt and nothing else, by design") becomes orchestrate only. The case is unchanged |

orchestrate's *dispatch commands* do not change in part A. Its explicit round counts stay as they are, because it is being deprecated (part B).

## 8. Prompts

- **Deleted:** ReviewCode.txt, ReviewDoc.txt, Implement.txt, PlanImplement.txt,
  PlanImplementCodeReview.txt.
- **Kept until part C:** CreateArtifact.txt and MergePlanDecisionsIntoSpec.txt.
- **Lost until part C:** plan depth by tier. Until then, an automated flow asks for the plan it
  wants.

## 9. Gates, commits and release

**Commits.** This working tree is the live plugin, so every commit must leave it consistent:
- The rule, the three skills' tier steps, the rewritten `agent-dispatch-pin`, the §7 restatements
  and the regenerated coverage baseline land as **one commit**. Check A2 fails in between, and
  other profiles load whatever is committed.
- Then, as separate commits: deleting the prompts, the CHANGELOG, and the version bump.

**Gates**, each run before its commit with the output quoted:
- **The seven gate scripts** from the root CLAUDE.md.
- **`check-shared-semantics.cjs`:**
  - checks A, A', A2 and C for `risk-tier`
  - check B now reads implement's files for `untyped-agent-dispatch`, and check D no longer
    applies to implement
- **`check-detector-coverage.sh`:** the baseline `tests/detector-coverage.txt` changes because
  implement joins `agent-dispatch-pin`. Regenerate it in the same commit and explain the diff in
  the commit message.
- **`shared-semantics-mutation-test.sh`:** still 64 passed, since no gate logic changes.
- **Both manifest validations**, for the 6.0.0 bump:
  - `claude plugin validate ./ai-dev-tools --strict`
  - `claude plugin validate . --strict`

**6.0.0, breaking:**
- **review-code, review-doc, implement:** a run without flags classifies its tier and routes by it:
  Opus reviewers at high or max, and Sonnet coders. orchestrate's stages pass no model flags, so
  they change too.
- **Both review skills:** `--max-iterations` is optional, and a MECHANICAL classification runs no
  review agents.
- **implement:**
  - `--model` names the coders' model, and the execution mode is `--mode single|per-task`.
  - clear-context, the parallel helper and in-session coding are gone, along with
    `tmp/implement-exit-status.md`.
- **New:** the per-conversation file `tmp/risk-tier.md`.
- **Features:**
  - `--tier`
  - the tier lines
  - `Found this round:` in review-code
  - escalation to Opus

**Proof**, after `/reload-plugins`:
1. **MECHANICAL:** a comment-only commit, then `/review-code 1`. Expect the MECHANICAL tier, no
   agents, `--verify` run, and the tier file written.
2. **Floor:** in one conversation, `/implement` on a FULL plan and then `/review-code`. Expect
   `carried`.
3. **FULL:** the implementation's own review-code round. Confirm with `agent-effort-check.py` that
   the reviewer ran at max on Opus. With the session at high, a max pin can be told apart from
   inheritance.
4. **Open questions to measure and record in `risk-tier.md`:** does a sub-agent see the same
   `CLAUDE_CODE_SESSION_ID`, and does `/clear` change it?

## Risks

| Risk | Mitigation |
|---|---|
| Classification is LLM judgment, so two runs can disagree | The floor only moves up, the tier line shows the reason, and `--tier` corrects it |
| FULL runs cost more (Opus·max, fixes at max) | FULL's triggers are specific, and cost per serious finding at max equals high's (5.0.0 data) |
| A MECHANICAL misclassification skips a needed review | review-code classifies the diff even when the floor says MECHANICAL, and a behaviour change lifts the tier |
| orchestrate's explicit rounds multiply FULL costs (stage iii up to 4 dispatches) | orchestrate is deprecated (part B); the direct skill calls use the tier's single round |
| At a spawn depth of 1, implement can't code inside a sub-agent | `orchestrate --auto` already stops at stage i at depth 1; documented in stage ii |
| An exported `CLAUDE_CODE_EFFORT_LEVEL` overrides every pin | Keep it unexported (the founder's `~/.bashrc:237` is commented out); already disclosed in `agent-dispatch-pin` |
| `CLAUDE_CODE_SESSION_ID` is not documented | When it is unset there is no floor and no file, and the tier line says so |

## Follow-ups

1. **Part B, deprecating orchestrate:**
   - mark it deprecated in its description, its `--help` and `/ai-dev-tools:help`, pointing at the
     direct calls
   - remove it in a later major release, with the references only it uses
2. **Part C:**
   - plan depth by tier
   - spec creation gated on `CLAUDE_EFFORT`, which Claude Code exports from `--effort`
   - artifact creation
   - merging plan decisions back into the spec (orchestrate Step 7 is a candidate)
   - delete the last two prompts
3. **Measure 6.0.0 the way 5.0.0 was measured:** median round time and cost per tier, against
   5.0.0's baselines.
