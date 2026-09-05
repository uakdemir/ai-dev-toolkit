---
name: brainstorm-handoff
applies-to: [review-code, review-doc]
canonical: Everything the run could not decide goes in one brainstorm document, and its absolute path is the last line printed.
---

# Hand back what the run could not decide

**Everything the run could not decide goes in one brainstorm document, and its absolute path is the last line printed.**

A review run resolves most of what it finds. What it cannot resolve alone is the part a human has to
answer, and that part is exactly what gets lost — spread across a fix report's `deferred` reasons, a
`pushed-back` justification in `tmp/response_analysis.md`, and a "Remaining Issues" block that
scrolls off the screen. Collecting it into one file, and printing that file's path where it cannot
be missed, is what turns a review into something the founder can act on.

## The fix phase always runs — including on a focused review

**Fix what has one defensible answer; hand back only what has more than one.** A review that reports
without fixing hands the whole list to a human, which is the failure this rule exists to prevent: it
makes the brainstorm document a dumping ground instead of a decision queue, and it wastes the one
thing an agent is reliably good at.

There is no "report-only" mode and no scope small enough to skip fixing. A focused review, a
single-file review, a `--max-iterations 1` review — all of them fix. The narrower the scope, the
*more* certain the agent should be about the obvious repairs in it.

The test for handing something back is not difficulty and not size. It is: **can the agent name more
than one defensible answer, or does the right answer depend on something the repository does not
say?** If yes, it goes in the document. If no, fix it — a finding the agent could have fixed and
chose to escalate has cost a human's attention for nothing.

Concretely, fix: a stale path, a wrong count, a contradiction with one obviously-correct side, a
missing statement the rest of the document already implies, a name that does not match its
definition. Hand back: a choice between two consistent designs, anything that changes an interface
another skill depends on, anything whose right answer is a policy the documents do not record, and
anything where fixing it would mean inventing content rather than repairing it.

## What goes in it

Everything triage could not settle on its own:

- Every `deferred` disposition — the fix needs information the agent does not have, or depends on
  work not done yet.
- Every `pushed-back` disposition — the agent believes the finding is wrong, and the reasoning has
  to be checkable.
- Every remaining `critical` or `high` the agent declined to fix, including ones it could not fix
  confidently.

Not the fixes it applied, and not findings it resolved cleanly. Those are already in the summary and
do not need a decision.

## What each entry states

Group by theme rather than by disposition — a founder answers "what do we do about `source_ref`?"
once, not three times under three headings. Per entry:

- the stable issue id, severity and location, so it can be traced back to the review JSON
- what the question actually is, in one sentence
- the options, where the agent can see more than one defensible answer
- what the agent would do, and why it did not just do it

## Where it goes and what gets printed

Write it to `tmp/_reviews_errors/[<run_id>-]review-<doc|code>-brainstorm.md`, alongside the other
artifacts of the run.

Then print its **absolute** path as the **last line**, after every other line the skill prints:

```
Brainstorm (needs your decisions): /abs/path/to/tmp/_reviews_errors/review-doc-brainstorm.md
```

Absolute, not relative: the line is meant to be copied into a new session or another terminal, where
the working directory is not this one.

**When there is nothing to decide, say so on the same line** rather than omitting it — a missing
line is indistinguishable from a skill that forgot:

```
Brainstorm (needs your decisions): none — every finding was applied or resolved
```

## This displaces the previous last line

`review-doc` documented `Found this round:` as "always the last line printed … because it is the
number the next decision keys off". That was right when nothing followed it. It no longer is: when a
run produces questions, the next decision keys off the answers to those questions, not off a count.
`Found this round:` stays exactly where it is and keeps its meaning; one line now follows it.

## Governed sites

- `skills/review-code/SKILL.md`
- `skills/review-doc/SKILL.md`

No prose detector: "did the skill actually write the file" is a runtime property, not a textual one.
Checks A2 and C bind both skills to this rule — each states the canonical sentence and points here —
so the two cannot drift into printing different last lines.
