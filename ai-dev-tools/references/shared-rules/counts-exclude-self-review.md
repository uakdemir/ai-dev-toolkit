---
name: counts-exclude-self-review
applies-to: [review-code, review-doc, orchestrate]
canonical: Counts measure the artefact under review, never the review loop's own edits.
---

# Counts measure the artefact under review

**Counts measure the artefact under review, never the review loop's own edits.**

Every issue carries an `origin`, one of `"document"` or `"self-review"`, defaulting to `"document"`.
A round's own self-review pass raises findings against text that same round's fixer has just
written; those carry `origin: "self-review"`, and the round's gate counts skip them:

```
critical_count = count(severity == "critical" AND origin != "self-review")
high_count     = count(severity == "high"     AND origin != "self-review")
```

## The exclusion is round-local

It holds only within the round that wrote those lines. That round both authored and reviewed them,
so counting them there reports the loop's own sloppiness as evidence against the authored artefact
— and the endless-loop gate skips a spec at `>1 criticals remaining`.

**At the round boundary the origin flips to `"document"`.** From the next round onward those lines
are ordinary artefact text: the next reviewer re-reads the whole artefact and counts everything it
finds, including defects in text an earlier round wrote. An implementation that suppresses
self-review findings permanently is a different rule, and a wrong one.

Worked example. A 600-line document. Round 1's fixer writes 100 lines; round 1's self-review pass
checks those and writes more; round 1's counts reflect only the original 600. Round 2 reviews the
whole file and counts everything in it.

## Not counted is not not-shown

A fixer edit can genuinely damage an artefact. Self-review findings print on their own line in the
terminal output and appear in the summary — outside the round's gate counts, never invisible.
Without that, the loop would have a sanctioned channel for silent degradation.

## Why an explicit field

The convention "the post-fix pass simply does not recount" achieved the in-round exclusion by
nobody recounting. Once that pass also *fixes* what it finds, recount timing gets harder, and an
unwritten rule that no one may recount is exactly the class of thing that forks. `origin` is a fact
a validator can check.

`origin` rather than a `category` value because what kind of defect it is and who introduced it are
independent facts, and `category` already carries the first.

## Governed sites

- `skills/review-code/SKILL.md`
- `skills/review-doc/SKILL.md`
- `skills/orchestrate/references/common/error-logs-format.md` (the gate read contract)

Enforced by `scripts/validate-review-json.cjs`, which both review skills invoke, and covered by
`scripts/count-exclusion-test.sh` (a manual gate, run per the root CLAUDE.md). This is a
data invariant, so its gate is the validator, not a prose detector; the registry entry binds both
skills to the rule and makes it discoverable.
