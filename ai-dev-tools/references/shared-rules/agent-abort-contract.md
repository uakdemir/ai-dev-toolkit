---
name: agent-abort-contract
applies-to: [review-code, review-doc]
detector: abort-sentinel
canonical: An agent that cannot do its job aborts by leaving the artifact untouched and returning a first line beginning with the literal prefix "ABORT: ".
---

# How a dispatched agent gives up

**An agent that cannot do its job aborts by leaving the artifact untouched and returning a first line beginning with the literal prefix "ABORT: ".**

Two passes append to a review JSON that another pass already wrote: `review-doc`'s self-review pass
and `review-code`'s self-review pass. A third, `review-doc`'s fact-checker, writes an artifact of its
own, which a script merges into the review JSON after it returns. Each can find itself unable to
proceed — a missing fix report, an unparseable review JSON, a document it cannot read, a diff range
that resolves to nothing. Each therefore
needs the same three things, and the same three things were written out separately for each, in
different amounts of detail, until one of them ended up specified in the prompt and nowhere in the
SKILL.md that drives it.

## The contract

**Before dispatch** of a pass that appends to the review JSON, which is either self-review pass, the
orchestrator backs the review JSON up to `<path>.bak`. The fact-checker writes only its own file, so
it gets no backup: there is nothing of another pass's for it to damage.

**To abort**, the agent does both of these, not one:

1. Leaves its artifact **untouched**, which is the review JSON for a self-review pass and its own file
   for the fact-checker: does not write it, does not partially write it.
2. Returns a text response whose **first line begins with the literal prefix `ABORT: `**, followed
   by a one-line reason.

```
ABORT: fix report not found at tmp/_reviews_errors/review-doc-fix-report.json
```

**On detection**, the orchestrator restores the backup where it took one, skips the merge where there
is one to skip, prints a warning naming the phase, the reason, and what the run proceeds with, and
**continues** — an abort is not a run failure:

```
Warning: <phase> aborted — <reason>. <what the run proceeds with>
```

The tail is phase-dependent, because what survives an abort depends on where in the round it
happened. Both instances:

- **After the fixer** — `Fix results unverified.` Used by both skills' self-review pass.
- **Before the fixer** — `Falling back to reviewer output.` Used by `review-doc`'s fact-checker,
  which runs alongside the reviewer and is merged before the fixer; "fix results" do not exist yet,
  so the other tail would be a false statement.

**Any other failure mode** — agent crash, exception, no response at all — is treated identically.
The orchestrator cannot distinguish them from the outside, so it must not try.

## Why both halves are required

The sentinel without the untouched artifact leaves a half-written JSON that the backup restore then
silently discards, hiding whatever the pass had already appended. The untouched artifact without the
sentinel is indistinguishable from a pass that ran and found nothing — which is the failure mode that
matters most, because "found nothing" is the answer that lets the loop proceed.

## What each governed skill must carry

A skill that dispatches one of these passes states, in its own SKILL.md and not only in the prompt:
the sentinel, the warning text, the continue-on-abort behaviour and a row in its Error Handling
table, and, for a pass that appends to the review JSON, the backup step and the `.bak` paths in its
Setup deletion list. A prompt that describes an
orchestrator behaviour its SKILL.md never establishes is a contract with one party.

## Governed sites

- `skills/review-doc/SKILL.md` — fact-checker and self-review dispatch
- `skills/review-code/SKILL.md` — self-review dispatch
- `skills/review-doc/prompts/verifier.md`, `skills/review-doc/agents/codebase-fact-checker.md`,
  `skills/review-code/prompts/self-review.md` — the agent side of the same contract

No prose detector: "did the orchestrator actually restore the backup" is a runtime property. Checks
A2 and C bind both skills to the rule, which is what stops one of them specifying the sentinel in a
prompt while its SKILL.md knows nothing about it.
