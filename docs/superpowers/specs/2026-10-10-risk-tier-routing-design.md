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
| 10 | Open calls, answered `1C 2A 3A 4A 5A 6A 7A` on the decision page: an explicit round count does not override MECHANICAL, and neither do agent flags; MECHANICAL review-doc confirms each changed fact; the picker recommends `per-task` only when tasks barely overlap, with at most 3 agents at once; a task blocked on Opus still gets one fresh Opus attempt; the refactor-unit path stays in the session |

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
- **The session's own effort:** the founder drops `--effort max` from the `cld` alias (`cl` and
  `cla` already omit it). `modelSettings` already defaults both Opus and Sonnet to high. Pins never
  depended on this (measured 2026-10-05, `agent-dispatch-pin.md`); it affects only work done in the
  session.

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
last commit that touched it. An untracked document has no latest change, so it is never
MECHANICAL.
- **FULL if any:** the document drives FULL-tier work, carries legal, policy or consent content, or
  makes claims about existing code.
- **MECHANICAL if all:** the change is wording, formatting or links, or runbook steps and notes with
  no decision content.
- **LIGHT:** everything else.

**When unsure between two tiers, take the higher.** The session classifies; no agent is dispatched
for it. It works from what the skill already reads, plus the root CLAUDE.md's `## Risk tiers`
section (§1.2). The reason it prints names the trigger and the evidence, such as a path or a task
number.

### 1.2 Project extension

A `## Risk tiers` section in the project's root CLAUDE.md adds FULL triggers in the project's own
vocabulary. For Tune, that is the moat (IAM, access, network), the exports doors, and messages sent
to members. A project section adds triggers; it never removes a generic one. review-code already
reads CLAUDE.md for its reviewer, and the classifier reads the same file.

### 1.3 Resolution

1. **`--tier <level>`:** that tier, with no classification. It may lower a stored tier, and it is
   the only thing that can. Its values are `full`, `light` and `mechanical`, matched exactly as
   `--effort`'s are; any other prints `Error: --tier must be one of: full, light, mechanical.` and
   exits.
2. **Otherwise:** classify, read the floor (§1.4), and take the higher of the two. If the result is
   higher than the floor, print it as "moved up".
3. **Explicit `--max-iterations N` with N ≥ 1 on a MECHANICAL run:** the tier wins. The run skips
   review, and the tier line reports the flag as unused. This holds whether MECHANICAL was
   classified or passed as `--tier mechanical`. Only `--tier light` or `--tier full` forces a review
   of a mechanical change.
4. **`--max-iterations 0`:** keeps its meaning in both review skills. It is resolved before tier
   resolution, so it prints no tier line and writes no tier file.
5. **Agent flags on a MECHANICAL review run** (`--effort`, `--fix-effort`, `--model`) set fields of
   agents that run does not dispatch. They are unused too, and the tier line says so. implement's
   MECHANICAL coder takes `--model` and `--effort` as usual; they are unused only when the session
   makes the scripted edit (§5).

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
- **Write:** every run that resolved a tier writes the file after printing the tier line. A
  `--tier` run stores `reason: --tier <level>`.
- **Unset variable:** when `CLAUDE_CODE_SESSION_ID` is unset, the run neither reads nor writes the
  file, and the tier line ends with `(not carried: no session id)`.
- **Never deleted by the review skills' Setup**, which deletes only under `tmp/_reviews_errors/`. Say
  so in review-code's Setup, beside its `tmp/past-issues-backlog.md` note, and in a new review-doc
  Setup step, since review-doc has no such note.
- **Measured on 2026-10-10:** Claude Code exports `CLAUDE_CODE_SESSION_ID` to the session's Bash
  calls; its value matched the session's scratchpad directory. **Not measured:** whether a
  sub-agent sees the same value, and whether `/clear` changes it. Record both in the rule (§9).

### 1.5 Precedence

An explicit flag beats the tier's row, one field at a time:

| Field | Flag |
|---|---|
| Round count | `--max-iterations` |
| Effort of the reviewer and the fact-checker; implement's coders and its escalation | `--effort` |
| Effort of the fixer and the self-reviewer | `--fix-effort` |
| Model of every agent in the run, except implement's escalation, which is always Opus (§5) | `--model` |
| implement's execution mode | `--mode` |

### 1.6 Output

The two tier lines print before anything else a review run prints. implement prints them when its
tier step runs (§5), after Steps A–C and ahead of the task graph. The run does not pause after them.

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
- **implement on a FULL run without `--mode`:** the mode is not chosen yet, so the line reads
  `mode pending · coders Sonnet·high · escalation Opus·high`. When the picker answers, or `--auto`
  takes the recommendation, the run prints `Mode: per-task (picked)` or `Mode: single (recommended)`.
- **implement's scripted edit (MECHANICAL):** `mode scripted edit · no agents`
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
| | escalation | one fresh attempt on Opus at the coders' effort, then BLOCKED | same | same |

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
  "this skill has no fact-checker" stays true. The closing parenthesis of the Self-Review section,
  which says this skill has no `found_this_round`, keeps only the Next-Round Recommendation as
  review-doc's.

## 4. review-doc

- **Argument parsing:** the same tier step, using the doc tier. `--max-iterations` becomes optional.
  The defaults follow §2. `--fact-check` still defaults to true, and an explicit `false` is still
  honoured.
- **Path resolution moves ahead of the tier step.** Pre-Flight's steps 2-8 (input paths, directory
  expansion, the 20-file cap, existence, `--against`) write nothing, so they run before it: the doc
  tier classifies the resolved documents, and a path error exits before any tier line or floor
  write. The branch guard stays in Pre-Flight.
- **MECHANICAL path:** handled before Setup.
  - For each factual sentence the latest change touched, the session shows the command (`git grep`,
    `ls`, `git show`) that confirms it: `✓ <sentence> — <command> → <result>`.
  - A sentence it cannot confirm is printed `✗ UNCONFIRMED <sentence>`, and the status is
    `Issues Found`. Otherwise the status is `Not reviewed (MECHANICAL)`.
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
  inside Step D, after the refactor-unit pre-check fails (`--auto` skips that check) and before the
  task graph is built. A run that exits at Step C dispatches nothing, so it resolves no tier.
- **Process by tier:**
  - **FULL:** the picker below. `--mode` skips it. Under `--auto` the recommendation is taken.
  - **LIGHT:** `single`, with no picker and no per-task reviewers.
  - **MECHANICAL:** `single`, or a scripted exact-once edit by the session. The edit is allowed when
    the plan's change is a rename, move or reformat that one command applies and an instrument (a
    grep that must return nothing, a build) proves. The session commits the edit as one commit
    before it verifies and reports.
- **The picker (FULL, interactive):**
  ```
  [1] single   — one Sonnet·high agent carries the whole plan
  [2] per-task — one Sonnet·high agent per task, and a spec reviewer per task
  ```
  - The recommendation keeps the coupling assessment from `implementation-step.md`: LOW coupling
    recommends `per-task`, and anything else recommends `single`. `per-task` is only worth it when
    the tasks barely touch the same files.
  - The context-budget branch goes, because the session no longer writes code.
- **Dispatch:**
  - **`single`:** one agent, in the §6 call form, given the `single` preamble and the plan. It
    follows `superpowers:executing-plans`. The preamble covers TDD, the verification gate, the spec
    compliance check, two retries then BLOCKED, "report is not evidence", the Validation block, and
    the run-id.
  - **`per-task`:** the session coordinates `superpowers:subagent-driven-development` with the
    `per-task` preamble. Every implementer and task reviewer is dispatched in the §6 call form. SDD
    has one task reviewer per task, which gives the spec and the quality verdict; it stays,
    and it is the per-task spec reviewer of §2 and the picker.
  - **Both preambles** override these points where superpowers expects a human partner: work
    stays in the current tree and branch (running `/implement` there is the consent; no worktree),
    the final whole-branch review and `finishing-a-development-branch` are skipped, because
    review-code follows at the tier's level, and the run returns after the last task. Checked in
    superpowers 6.1.1, 6.4.1 and 6.4.2, the versions installed on the founder's machine: all three
    have these points, except that `executing-plans` 6.1.1 runs no final review, so that override
    changes nothing there.
  - **Concurrency:** at most 3 agents run at once, or fewer when the session's
    `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` is lower.
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
  - Flag values: `--effort` and `--tier` as in the review skills (`Error: --effort must be one of:
    high, xhigh, max.`); a `--mode` other than `single` or `per-task` prints `Error: --mode must be
    one of: single, per-task.`; `--model` is checked for an old value first, then as in the review
    skills (`Error: --model must be a model the Agent tool accepts; got '<value>'.`).
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
  implement's form goes in `SKILL.md`, where `--print-coverage` sees it; that listing skips every
  `references/` tree. Check B still reads all of a governed skill's files, `references/` included,
  so any call in `implementation-step.md` is written in the same one-line form. An escalation is
  dispatched in the third form with `model: "opus"`, whatever the coders' model (§5).
- **Sections rewritten:**
  - "When an effort flag is absent" and "When `--model` is absent" become: the tier's row decides.
  - The example in "Naming the agents from a prompt", a fact-checker run by hand between a reviewer
    and a fixer, is replaced with a neutral one.
  - "What the pin does not decide" keeps its facts. `CLAUDE_CODE_EFFORT_LEVEL` and
    `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` still override, and none of the three skills looks for them.
    Only its wording changes: "neither skill" names the three, and the agents a run dispatches are
    the ones the tier or a flag names.
  - Every other passage the new scope makes false follows it:
    - each phase's directive carries its resolved level, not its flag's value
    - the no-Agent-tool error gains implement's wording, "the coding agents"
    - `orchestrate --auto` needs the spawn-depth cap at stage ii too
    - the sentence that a run without `--model` dispatches in the first form goes
    - only `orchestrate` stays outside the rule, and implement's `references/` tree is no longer
      the example of a tree no check reads
    - no dispatch site gives `model` in words beside its call any more: every form carries it
- **Governed sites** gain implement's `SKILL.md` and the preamble wording in
  `implementation-step.md`.

## 7. Restatements that become false

| File | Becomes |
|---|---|
| `skills/orchestrate/references/auto/stages/stage-i-spec-review.md` (both phases) | review-doc resolves the doc tier and dispatches Opus. A MECHANICAL result runs no round and writes no review JSON. The stage treats that status line as a pass, not as a crash |
| `skills/orchestrate/references/auto/stages/stage-iii-code-review.md` | The same for review-code |
| `skills/orchestrate/references/auto/stages/stage-ii-implement.md` | `--auto` takes the recommendation (`single` or `per-task`); coders run on Sonnet in sub-agents, so the spawn-depth cap must be at least 2. The Failure Surface's helper row goes |
| `skills/orchestrate/references/auto/profiling-log.md`, and the Profiling section of each stage file | `model` records the model the tier line names: `opus` for the review skills, `sonnet` for implement, or the override. No longer `inherited`, in the schema, its examples or the stage files' `model=inherited` |
| `skills/orchestrate/references/auto/pipeline-overview.md` | Stage ii's one dispatch spawns its coders (`single` or `per-task`), not a helper, and the commits during it are theirs |
| `skills/orchestrate/references/auto/failure-handling/unresolved-criticals.md` | `--max-iterations` is no longer required. The loop stays bounded by construction: the tier sets the rounds, and an explicit value is at most 10 |
| `skills/orchestrate/references/standard/steps/step-5.md` | The marker handling is deleted, because it can no longer fire |
| `skills/help/SKILL.md` | The agents block: the tier chooses, flags override, and implement is listed |
| `agents/high-effort.md`, `xhigh-effort.md`, `max-effort.md` | `description`: dispatched by review-code, review-doc and implement as the tier or a flag selects |
| `scripts/shared-semantics-mutation-test.sh`, `scripts/check-shared-semantics.cjs` | N10's comment, and the same sentence on the `untyped-agent-dispatch` detector ("implement and orchestrate dispatch with a prompt and nothing else, by design"), become orchestrate only. Comments only: the case and the gate logic are unchanged |

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
  other profiles load the working tree, committed or not. So the work is done in one sitting, and
  no other session starts a review skill until it lands.
- Then two more commits: deleting the prompts, and the release. As in every release since 3.0.0,
  one `chore(release)` commit holds both the CHANGELOG and the version bump.

**Gates**, each run before its commit with the output quoted:
- **The seven gate scripts** from the root CLAUDE.md.
- **`check-shared-semantics.cjs`:**
  - checks A, A', A2 and C for `risk-tier`
  - check B now reads implement's files for `untyped-agent-dispatch`, and check D no longer
    applies to implement
- **`check-detector-coverage.sh`:** the baseline `tests/detector-coverage.txt` gains
  `skills/implement/SKILL.md`, because that file now names a pinned agent type; `--print-coverage`
  does not read `applies-to`. Regenerate it in the same commit and explain the diff in the commit
  message.
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
3. **FULL:** the implementation's own review-code round. Confirm that the reviewer ran at max on
   Opus with
   `python3 /home/umut/projects/tune/tmp/token-usage/2026-10-05/agent-effort-check.py --minutes 30 --project ai-dev-toolkit`
   (the script is not in this repository). With the session at high, a max pin can be told apart
   from inheritance.
4. **Open questions to measure and record in `risk-tier.md`:** does a sub-agent see the same
   `CLAUDE_CODE_SESSION_ID`, and does `/clear` change it?

## Risks

| Risk | Mitigation |
|---|---|
| Classification is LLM judgment, so two runs can disagree | The floor only moves up, the tier line shows the reason, and `--tier` corrects it |
| FULL runs cost more (Opus·max, fixes at max) | FULL's triggers are specific, and cost per serious finding at max equals high's (5.0.0 data) |
| A MECHANICAL misclassification skips a needed review | review-code classifies the diff even when the floor says MECHANICAL, and a behaviour change lifts the tier. An explicit round count does not override MECHANICAL (decision 10); `--tier light` does |
| orchestrate's explicit rounds multiply FULL costs (stage iii up to 4 dispatches) | orchestrate is deprecated (part B); the direct skill calls use the tier's single round |
| At a spawn depth of 1, implement can't code inside a sub-agent | `orchestrate --auto` already stops at stage i at depth 1, unless the doc tier is MECHANICAL, which needs no agent. Stage ii then stops with implement's no-Agent-tool error, unless it makes the scripted edit. Documented in stage ii |
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
