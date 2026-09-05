---
name: run-failure-disclosure
applies-to: [review-code, review-doc]
canonical: A run that could not complete reports Error, names the phase that failed and why, and never prints a status or a count that implies a review happened.
---

# A failed run says so

**A run that could not complete reports Error, names the phase that failed and why, and never prints a status or a count that implies a review happened.**

Reviewing is not reading. A skill can be handed a perfectly good document and still produce nothing:
the reviewer can emit unparseable JSON twice, the fixer can fail, a dispatched pass can abort. The
document was fine; the review did not happen. Those are different outcomes and they must not print
the same way.

`review-doc` reached this rule with no failure status at all — its Status Logic ended in "all other
cases", so a run whose reviewer failed validation twice fell through and reported **Approved**.

## Why the status is load-bearing

It is read by a machine before it is read by a person. `orchestrate --auto` branches on the review
artifact: stage iii requires that `review-code`'s artifact exists and passes
`scripts/validate-review-json.cjs` before it will call an iteration successful. An internally
aborted run still *returns*, so it is not a crash and the crash handler never fires — which means a
run that reports success on an artifact nothing wrote will carry the pipeline forward into
implementation on a spec that was never reviewed.

## Status Logic

`Error` is **rule 1**, ahead of every other status. First match wins, so nothing that aborted can
reach a rule that would call it clean.

Triggers, at minimum: reviewer output failed schema validation twice; the fix phase failed; a git
operation required by the run failed. A dispatched pass that aborts under
`references/shared-rules/agent-abort-contract.md` is **not** an Error — that contract restores the
backup, warns, and continues by design.

## What Error prints

Replace the count block entirely. Do not print `Aggregate`, `Remaining`, `Last round` or
`Found this round` on an Error run: those numbers come from an artifact the run did not finish
writing, and printing them under an error heading still reads as a clean review to anyone skimming.

```
Review <Doc|Code> FAILED
  Phase: <reviewer | fact-check | fixer | self-review>
  Reason: <one line — the validator's stderr, the ABORT reason, or the exception>
  Artifact: <path> — <not written | restored from backup | partial, left as-is>
  Reviewed: <paths>
  Iterations completed: N of M
  Counts: not reported — this run did not complete a review
```

## Whether to ask

**Interactive — ask.** The reader can answer, so offer the three real options and wait:

```
  Retry the failed phase / continue with what completed / abort the run? [retry|continue|abort]
```

**Programmatic or auto dispatch — do not ask.** There is nobody to answer, and a prompt in auto mode
is a hung pipeline rather than a safe default. Exit non-zero, write the reason to the run's error
log, and let the caller's failure path handle it — `orchestrate` already has one.

A rule that says "ask the human" without this split is the same defect as a guard that delegates to a
caller nobody wrote: correct-looking on the path where it is never needed, absent on the path where
it is.

## The handoff still prints

`references/shared-rules/brainstorm-handoff.md` requires the last line of every run to be the
brainstorm document's absolute path. That holds for a failed run too — and on an Error the document
*is* the failure report: what broke, what state the artifact is in, what the options are. A failure
a human must decide about is precisely the thing that rule exists to hand over.

## Governed sites

- `skills/review-code/SKILL.md` — Status Logic, Error Handling, Terminal Output
- `skills/review-doc/SKILL.md` — Status Logic, Error Handling, Terminal Output

No prose detector: whether a run actually printed this is a runtime property. Checks A2 and C bind
both skills to the rule, which is what stops one of them growing a failure path while the other
keeps reporting Approved.
