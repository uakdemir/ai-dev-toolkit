---
name: agent-dispatch-pin
applies-to: [review-code, review-doc]
detector: untyped-agent-dispatch
canonical: Every dispatched agent is the plugin agent that matches `--effort`, and carries `--model` on its Agent call whenever the flag was passed.
---

# What decides the effort and the model a dispatched agent runs at

**Every dispatched agent is the plugin agent that matches `--effort`, and carries `--model` on its Agent call whenever the flag was passed.**

Both review skills documented `--effort` as the reasoning-effort level of their agents, and for as
long as they dispatched with a prompt and nothing else, it was not. The Agent tool has no effort
parameter. An agent dispatched without an agent type runs at the effort of the session that
dispatched it, so the flag changed a line of wording in the prompt and the session's own setting
decided the rest. Nothing reported the difference: the run printed the flag's value and the review
looked like any other.

The model had the same shape. The skills said every agent inherits the caller's session model. A
call that names no model is resolved by Claude Code, and where `CLAUDE_CODE_SUBAGENT_MODEL` is
exported that variable decides, not the session.

## The call

```
Agent(subagent_type: "ai-dev-tools:<--effort value>-effort", prompt: <substituted prompt>)
Agent(subagent_type: "ai-dev-tools:<--effort value>-effort", prompt: <substituted prompt>, model: "<--model value>")
```

The first form is for a run without `--model`, the second for a run with it. There is no third.
The forms show the parameters this rule fixes. Whatever else the Agent tool takes or requires, such
as `description`, is written as usual.

| `--effort` | Agent type | Definition |
|---|---|---|
| `high` | `ai-dev-tools:high-effort` | `agents/high-effort.md` |
| `xhigh` | `ai-dev-tools:xhigh-effort` | `agents/xhigh-effort.md` |
| `max` | `ai-dev-tools:max-effort` | `agents/max-effort.md` |

Each definition pins `effort:` and nothing else. It names no model, restricts no tools and gives no
role: the dispatch prompt already defines reviewer, fixer, fact-checker and self-reviewer, and a
definition that repeated any of it would be a second place for it to drift.

## Which of the two sets the reasoning effort

The agent definition does. `{{EFFORT}}` in `skills/review-code/prompts/reviewer.md` and
`skills/review-code/prompts/coder.md`, the effort level `review-code` writes into its self-review
dispatch prompt, and the effort level `review-doc` writes into each dispatch prompt, are a
**depth directive**: wording that tells the agent how far to take the analysis at the level it is
already running at. Every place that describes the directive says so, because the two shared one
flag and one name for long enough to be read as one mechanism.

Measured on 2026-10-05 with Claude Code 2.1.289: an agent dispatched from a session at effort `max`
as `ai-dev-tools:high-effort` ran at effort `high`. A `review-code` round the same day ran its
reviewer, fixer and self-reviewer at `high` on Opus under a session at `max`, and a `review-doc`
round ran its reviewer, fact-checker, fixer and self-reviewer at `max` on Opus under a session at
`high`. Not measured: the `xhigh` agent, and a pinned agent dispatched from inside a sub-agent.

## When `--effort` is absent

The level is `max` and the agent is `ai-dev-tools:max-effort`: both skills default to it.
`orchestrate` passes no `--effort`, so its review stages select that agent. A value outside the
table is an argument error, never a fallback to another level:

```
Error: --effort must be one of: high, xhigh, max.
```

## When `--model` is absent

The call names no model and the skill makes no claim about which one runs. Claude Code resolves it:
`CLAUDE_CODE_SUBAGENT_MODEL` when that variable is exported, the session's model otherwise. A caller
who needs a particular model passes `--model`.

Measured on 2026-10-05 with Claude Code 2.1.289: an agent dispatched with no model on the call, in
a session that exports `CLAUDE_CODE_SUBAGENT_MODEL=sonnet`, ran on Sonnet, and one dispatched with
`model: opus` on the call ran on Opus. Not measured: a session that does not export the variable.

## When the Agent tool does not accept the model

`--model` carries no list of its own. Its value is handed to the Agent tool unchanged, so the
accepted values are the ones that tool's `model` parameter accepts in the running session. A list
kept here would be stale the day a model is added.

A value that parameter does not accept is an error, before anything is dispatched:

```
Error: --model must be a model the Agent tool accepts; got '<value>'.
```

Never a fallback to a call without `model`. That call succeeds, and the review runs on a model the
caller did not name.

## When the agent type is missing

An error, before anything is dispatched:

```
Error: agent type 'ai-dev-tools:<level>-effort' is not available in this session. Run /reload-plugins, or restart the session, and re-run.
```

Never a fallback to a call without `subagent_type`. That call succeeds, the review runs, and the
agents take the session's effort: the failure this rule exists to remove, back again with no
signal. A session that started before the definitions existed does not know their types until its
plugins are reloaded.

## When the session has no Agent tool

An error as well, and checked before the agent type, because its remedy is a different one:

```
Error: this session has no Agent tool, so the review agents cannot be dispatched. Run the skill from the top-level session, or raise CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH (at least 2 for a first-level sub-agent).
```

Never a fallback to running the phases in the session the skill is in. The agents the skill would
have dispatched then share one context, at that session's effort and on its model, and the run
reports as a review by separate agents.

It comes before the check on the `--model` value too. That value is judged against the Agent
tool's `model` parameter, which a session with no Agent tool does not have.

Claude Code caps how deeply agents may nest, with `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`. Read from
Claude Code 2.1.289 and not measured: with the variable unset the cap is three unless a server-side
feature flag sets another value, and an agent at or beyond the cap is given no Agent tool. Observed
on 2026-10-05, in a session whose environment sets the variable to one: agents dispatched from the
top-level session had no Agent tool. A review skill invoked inside a sub-agent can therefore
dispatch its agents only where the cap is at least two.

The cap is the one cause observed here, and the error's two remedies address it. The check itself
is on the tool's absence, whatever removed it: a session that lacks the tool for another reason
gets the same text, and neither remedy is written for it.

`orchestrate --auto` invokes `/review-doc` at stage i and `/review-code` at stage iii inside a
sub-agent (`skills/orchestrate/references/auto/pipeline-overview.md`), so it needs a cap of at least
two. Under a cap of one its review stages stop with the error above. A cap of at least two is
necessary and not known to be sufficient: the nested run itself is not measured under any cap.
Nobody has run a review skill inside a sub-agent since the plugin's agents were added, so two
things are open: whether a sub-agent's Agent tool offers the plugin's agent types, and whether the
pin holds for an agent dispatched from inside a sub-agent.

One run settles both: from a top-level session whose cap is at least two, a sub-agent that runs
`/review-doc` with `--max-iterations 1` on a small tracked document, with a record of whether its
reviewer was dispatched as the pinned agent and ran at that level, or of which error printed. The
run passes an `--effort` level that neither the session nor the sub-agent runs at, because at a
shared level a pinned reviewer and an unpinned one cannot be told apart. The result belongs in this
section.

## When the Agent tool refuses a call

The errors above are all raised before anything is dispatched. A call the Agent tool refuses at
dispatch all the same, for its agent type or its model, ends the run with status Error at whichever
phase it happens. That holds at the fact-checker and self-review dispatches too: a refused call
started no agent, so it is not an abort under `references/shared-rules/agent-abort-contract.md`.
The call is never retried without `subagent_type` or without `model`.

## What the pin does not decide

The pin is a request, and Claude Code applies its own limits to it. Read from Claude Code 2.1.289
and not measured here: a model that does not support the `max` or the `xhigh` level is stepped down
by Claude Code, an organisation's effort cap applies after the pin, and an exported
`CLAUDE_CODE_EFFORT_LEVEL` overrides it. An exported `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` likewise
discards the model a call names, and the model is then resolved as for a call that names none.

Neither skill looks for any of these. Under the three effort limits a run dispatches the `--effort`
agent as usual, the iteration log prints the flag's value, and nothing reports the difference. What
a run with `--model` does under `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`, neither skill says.

That is a decision, taken on 2026-10-05, and not an omission. A session can read both variables
before it dispatches, and the skills still do not. A warning or a stop would rest on a reading of
Claude Code 2.1.289 that nobody measured, and it would leave the other two limits, the model's
step-down and the organisation's cap, as invisible as they are now.

Nor does either skill test that the pin took effect. Their checks ask whether the session has an
Agent tool and whether that tool offers the agent type, so a Claude Code that offers the type and
does not apply its `effort:` passes both, and the agents run at whatever effort that Claude Code
gives them, with no signal. `.claude-plugin/plugin.json` declares no minimum Claude Code version.

The pin covers dispatched agents only. Validation, the status, the summary and the Respond to
Remaining Issues triage run in the session the skill was invoked in, at that session's effort and
on its model, whatever the flags say. The triage applies edits and commits them.

## Naming the agents from a prompt

The agents are not private to the review skills. A prompt that dispatches an agent of its own, such
as a fact-checker run by hand between a reviewer and a fixer, names one the same way and, to choose
the model, passes it on the call: `subagent_type: ai-dev-tools:high-effort` with `model: opus`. The
names are printed by `/ai-dev-tools:help` and by each review skill's `--help`.

Each definition's `description` ends with "It pins no model, so pass `model` on the Agent call."
That sentence is for a prompt author who wants a particular model. It adds no model to a review
skill's call: a run without `--model` still dispatches in the first form.

## Governed sites

- `skills/review-code/SKILL.md`: the reviewer, the fixer and the self-reviewer
- `skills/review-doc/SKILL.md`: the reviewer, the fact-checker, the fixer and the self-reviewer
- `agents/high-effort.md`, `agents/xhigh-effort.md`, `agents/max-effort.md`: the three definitions
- `skills/review-code/prompts/reviewer.md`, `skills/review-code/prompts/coder.md`,
  `skills/review-code/prompts/self-review.md`: the depth-directive wording

Restatements outside the two skills, to be kept in step with this file:

- `skills/orchestrate/references/auto/stages/stage-i-spec-review.md`: the default agent and the
  spawn-depth cap, at both phases
- `skills/orchestrate/references/auto/stages/stage-iii-code-review.md`: the same, for its
  per-iteration dispatch
- `skills/orchestrate/references/auto/profiling-log.md`: how a call that names no model is resolved
- `skills/help/SKILL.md`: the agent names

`implement` and `orchestrate` dispatch agents too and are outside this rule. Neither takes an effort
or a model for the agents it dispatches: `implement`'s `--model` selects an execution topology.
`orchestrate` reaches this rule only by invoking the two review skills.

Detector `untyped-agent-dispatch`, in `scripts/check-shared-semantics.cjs`: a manual gate, run per
the root CLAUDE.md, not an automatic one. In a governed skill, check B fails on any line where the
text from an `Agent(` to its closing bracket carries no `subagent_type` whose value is a quoted or
backticked `ai-dev-tools:...-effort` name. The level in that name is not compared with the table,
so a name with no definition passes the gate and is refused only at dispatch.

Check D fails on a skill outside this rule that writes a call with a `subagent_type` of that shape
outside its `references/` tree. Under that tree no check reads the call: check D skips the tree,
and the sweep that reads it skips this detector. That tree is where `implement` and `orchestrate`
describe the agents they dispatch (`skills/implement/references/implementation-step.md`,
`skills/orchestrate/references/auto/`).

The detector sees a call that is written out. A dispatch described only in prose is invisible to
it, and such a dispatch fails silently, so every dispatch site spells its call in the form above. A
skill outside the rule stays free to dispatch with a prompt and nothing else.

The detector reads the agent type and nothing else. No check looks for `model` on a call, and each
dispatch site gives the `--model` form in words beside its call, so a site that loses those words
stays green and drops the flag. For that half of the canonical sentence, checks A2 and C are the
whole binding: they prove it is stated. Nor does any check compare the definitions under `agents/`
with the table: one whose `effort:` no longer matches its name, or that gains a `model:`, stays
green.
