---
name: agent-dispatch-pin
applies-to: [review-code, review-doc]
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
`skills/review-code/prompts/coder.md`, and the effort level `review-doc` writes into each dispatch
prompt, are a **depth directive**: wording that tells the agent how far to take the analysis at the
level it is already running at. Every place that describes the directive says so, because the two
shared one flag and one name for long enough to be read as one mechanism.

## When `--model` is absent

The call names no model and the skill makes no claim about which one runs. Claude Code resolves it:
`CLAUDE_CODE_SUBAGENT_MODEL` when that variable is exported, the session's model otherwise. A caller
who needs a particular model passes `--model`.

`--model` carries no list of its own. Its value is handed to the Agent tool unchanged, so the
accepted values are the ones that tool's `model` parameter accepts in the running session. A list
kept here would be stale the day a model is added.

## When the agent type is missing

An error, before anything is dispatched:

```
Error: agent type 'ai-dev-tools:<level>-effort' is not available in this session. Run /reload-plugins, or restart the session, and re-run.
```

Never a fallback to a call without `subagent_type`. That call succeeds, the review runs, and the
agents take the session's effort: the failure this rule exists to remove, back again with no
signal. A session that started before the definitions existed does not know their types until its
plugins are reloaded.

## What the pin does not decide

The pin is a request, and Claude Code applies its own limits to it. Read from Claude Code 2.1.289
and not measured here: a model that does not support the `max` or the `xhigh` level is stepped down
by Claude Code, an organisation's effort cap applies after the pin, and an exported
`CLAUDE_CODE_EFFORT_LEVEL` overrides it. An exported `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` likewise
discards the model a call names.

## Naming the agents from a prompt

The agents are not private to the review skills. A prompt that dispatches an agent of its own, such
as a fact-checker run by hand between a reviewer and a fixer, names one the same way and passes the
model on the call: `subagent_type: ai-dev-tools:high-effort` with `model: opus`. The names are
printed by `/ai-dev-tools:help` and by each review skill's `--help`.

## Governed sites

- `skills/review-code/SKILL.md`: the reviewer, the fixer and the self-reviewer
- `skills/review-doc/SKILL.md`: the reviewer, the fact-checker, the fixer and the self-reviewer

`implement` and `orchestrate` dispatch agents too and are outside this rule. Neither takes an effort
or a model for the agents it dispatches: `implement`'s `--model` selects an execution topology.
`orchestrate` reaches this rule only by invoking the two review skills.

No detector. Checks A2 and C bind both skills to the sentence. Nothing mechanical stops a dispatch
added later from leaving the agent type out, and such a dispatch fails silently, so whoever adds a
dispatch to either skill writes it in the form above.
