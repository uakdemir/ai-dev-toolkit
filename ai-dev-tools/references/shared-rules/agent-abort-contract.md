---
name: agent-abort-contract
applies-to: [review-code, review-doc]
canonical: An agent that cannot do its job aborts by leaving the artifact untouched and returning a first line beginning with the literal prefix "ABORT: ".
---

# How a dispatched agent gives up

**An agent that cannot do its job aborts by leaving the artifact untouched and returning a first line beginning with the literal prefix "ABORT: ".**

Three passes append to a review JSON that another pass already wrote: the fact-checker, `review-doc`'s
self-review pass, and `review-code`'s self-review pass. Each can find itself unable to proceed — a
missing fix report, an unparseable review JSON, a diff range that resolves to nothing. Each therefore
needs the same three things, and the same three things were written out separately for each, in
different amounts of detail, until one of them ended up specified in the prompt and nowhere in the
SKILL.md that drives it.

## The contract

**Before dispatch**, the orchestrator backs up the review JSON to `<path>.bak`.

**To abort**, the agent does both of these, not one:

1. Leaves the review JSON **unchanged** — does not write it, does not partially write it.
2. Returns a text response whose **first line begins with the literal prefix `ABORT: `**, followed
   by a one-line reason.

```
ABORT: fix report not found at tmp/_reviews_errors/review-doc-fix-report.json
```

**On detection**, the orchestrator restores the backup, prints a warning naming the phase and the
reason, and **continues** — an abort is not a run failure:

```
Warning: <phase> aborted — <reason>. Fix results unverified.
```

**Any other failure mode** — agent crash, exception, no response at all — is treated identically.
The orchestrator cannot distinguish them from the outside, so it must not try.

## Why both halves are required

The sentinel without the untouched artifact leaves a half-written JSON that the backup restore then
silently discards, hiding whatever the pass had already appended. The untouched artifact without the
sentinel is indistinguishable from a pass that ran and found nothing — which is the failure mode that
matters most, because "found nothing" is the answer that lets the loop proceed.

## What each governed skill must carry

A skill that dispatches one of these passes states, in its own SKILL.md and not only in the prompt:
the backup step, the sentinel, the warning text, the continue-on-abort behaviour, a row in its Error
Handling table, and the `.bak` paths in its Setup deletion list. A prompt that describes an
orchestrator behaviour its SKILL.md never establishes is a contract with one party.

## Governed sites

- `skills/review-doc/SKILL.md` — fact-checker and self-review dispatch
- `skills/review-code/SKILL.md` — self-review dispatch
- `skills/review-doc/prompts/verifier.md`, `skills/review-doc/agents/codebase-fact-checker.md`,
  `skills/review-code/prompts/self-review.md` — the agent side of the same contract

No prose detector: "did the orchestrator actually restore the backup" is a runtime property. Checks
A2 and C bind both skills to the rule, which is what stops one of them specifying the sentinel in a
prompt while its SKILL.md knows nothing about it.
