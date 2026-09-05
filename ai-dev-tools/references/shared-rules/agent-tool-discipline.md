---
name: agent-tool-discipline
applies-to: [review-code, review-doc]
canonical: A dispatched agent uses Read, Grep, Glob and Write for file work rather than their Bash equivalents, and never runs a git command that pushes, switches branches, or discards work.
---

# What a dispatched agent may reach for

**A dispatched agent uses Read, Grep, Glob and Write for file work rather than their Bash equivalents, and never runs a git command that pushes, switches branches, or discards work.**

Seven prompts across the two review skills carry a `## Tool Usage Rules` block. They were copied,
then edited in place, and by the time this rule was written they had five distinct shapes. Five
shapes of one block, with nothing recording which of the differences were meant, is what a fork
looks like before anyone notices it is one.

## The invariant core

Every dispatched prompt states all six, verbatim:

```
- Use Grep (not grep/rg via Bash) for searching file contents
- Use Glob (not find/ls via Bash) for finding files by pattern
- Use Read (not cat/head/tail via Bash) for reading file contents
- Use Write (not echo/cat heredoc via Bash) for writing files
- NEVER run git push, git checkout, git switch, git branch -d/-D, or any command that modifies or switches branches
- NEVER run destructive git commands (reset --hard, clean -f)
```

The git prohibitions are the load-bearing half. An agent that switches branches or hard-resets
breaks the one invariant the whole pipeline rests on — that the working tree it was handed is the
working tree it returns.

## What each prompt adds, and why that is not drift

The core says what every agent may reach for. What an agent may **change** is its own business, and
differs by design:

| Addition | Who carries it | Why |
|---|---|---|
| `Use Edit …— targeted edits only` | `skills/review-code/prompts/self-review.md`, `skills/review-doc/prompts/verifier.md`; and — stated in their `## Rules` section rather than in the block — `skills/review-code/prompts/coder.md`, `skills/review-doc/prompts/coder.md` | Only the four repair passes may edit: the two fixers and the two self-review passes. A reviewer that could edit would fix instead of report. |
| A `git commit` allowance | `skills/review-code/prompts/self-review.md`, `skills/review-code/prompts/coder.md` | Each commits its own pass. The fixer's commit is load-bearing — `fixer_sha`, the self-review pass's `before_sha..fixer_sha` scope, and `after_sha` all read from it. `review-doc`'s fixer never commits; its skill leaves the edits in the working tree. |
| A validator-command exception | `skills/review-code/prompts/reviewer.md`, `skills/review-doc/prompts/reviewer.md` | One named command against one named path, so the agent can check its own artifact. Both reviewers are required to validate their own output before finishing. |
| A Grep/Glob unavailability fallback | `skills/review-code/prompts/reviewer.md` | Its Verification Gap section requires search evidence; a search it cannot run is a finding it must drop. |

An addition is legitimate when it **widens** one agent's surface for a stated reason. A silent
**narrowing** of the core is drift, and that is what this rule exists to catch.

**One open inconsistency, recorded rather than silently resolved.** The Bash-hygiene bullet — *"Do
not use Bash with newline-separated commands, $() substitution, or shell expansion in paths"* — is
carried by five of the seven prompts. `skills/review-doc/prompts/reviewer.md` and
`skills/review-code/prompts/self-review.md` omit it. Nothing about either agent explains the omission, so
it reads as drift rather than design; but adding it changes what two live agents are permitted to
do, which is a behaviour change and not a documentation repair. Promote it to the core or delete it
from the other five — either is defensible, and this file is where that gets decided.

The same goes for the Bash-scope line, which takes four shapes across the seven prompts. The bare
form — "only for git log, git diff, git status commands" — is carried by
`skills/review-doc/agents/codebase-fact-checker.md`, `skills/review-doc/prompts/coder.md` and
`skills/review-doc/prompts/verifier.md`. Both reviewers append "…and the one exception below" for
the validator command. `skills/review-code/prompts/coder.md` names the `git add -u` / `git commit`
its Procedure mandates, and `skills/review-code/prompts/self-review.md` inverts the phrasing
outright: "Use Bash for `git diff`, `git log`, `git status`, and your one `git commit`". Those
differences are real — the shapes track four genuinely different Bash surfaces — which is why the
line is an addition rather than part of the core.

## Why these prompts keep their bullets instead of citing this file

Every other rule in this registry is single-sourced: the skill states the canonical sentence and
points here. **These prompts do not, and must not.** A dispatched agent receives the prompt text and
nothing else — it has no reason to open `references/shared-rules/`, and a prompt that outsources its
own operating limits to a file the reader never sees has no limits at all. The bullets stay in every
prompt, in full.

What is single-sourced here is the *decision*, not the text: this file is where the core is defined,
where a proposed change to it is argued, and where the per-agent widenings are justified. The gate
binds each governed skill to the canonical sentence; keeping the six bullets in sync is what a
maintainer does when this file changes.

## Governed sites

- `skills/review-code/prompts/reviewer.md`, `skills/review-code/prompts/coder.md`,
  `skills/review-code/prompts/self-review.md`
- `skills/review-doc/prompts/reviewer.md`, `skills/review-doc/prompts/coder.md`,
  `skills/review-doc/prompts/verifier.md`, `skills/review-doc/agents/codebase-fact-checker.md`

No prose detector: the block is prose an agent obeys at runtime, not a mechanical pattern a detector
could tell apart from a legitimate mention of it. The reason is not that a detector would fire on
this rule file — `scripts/check-shared-semantics.cjs` already exempts `references/shared-rules/`
from every detector sweep, precisely so a rule file is free to quote what it governs. Checks A2 and
C bind both skills; the six-bullet core above is what a reviewer diffs against.
