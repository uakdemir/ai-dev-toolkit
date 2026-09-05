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

## The loop's own edits are not only self-review findings

The formula above is the self-review half of the invariant, and it is the half both review skills
apply. `review-code` applies a second half on the same reasoning. A **verification regression** is
measured against a baseline captured before the first iteration runs, so a command that passes at
baseline and fails later is failing on the loop's own edits by construction — the artefact under
review did not carry that failure when the run started. It is therefore never written into the
review JSON, and the counts above never move because of one. `origin` cannot express this case:
a regression is not a finding a pass raised, it is a command's exit code, and there is no issue
record to tag.

Excluded from the counts is still not excluded from the output, and the channels are named rather
than implied: the round's fixer receives the regression through `{{VERIFICATION_REGRESSIONS}}`, and
`review-code`'s Status Logic reads "verification regressions still present at the final post-fix
verification run" as a disjunct standing beside `critical_count > 0`, not folded into it. A
regression one round's fixer introduced and a later round's repaired then leaves no residue in
either the count or the status — which is the whole point of keeping it out of the count.

This half is `review-code`'s alone: `review-doc` runs no verification commands and so has no
regressions to exclude, and `orchestrate` is governed here as a reader of the counts, which it reads
the same way whichever half kept a number out of them.

## The exclusion is round-local

It holds only within the round that wrote those lines. That round both authored and reviewed them,
so counting them there reports the loop's own sloppiness as evidence against the authored artefact
— and the unresolved-criticals gate stops the run when any critical remains.

**A later round counts them normally, and needs no mechanism to do it.** Rounds carry nothing
forward: the next reviewer re-reads the whole artefact from scratch and reports what it finds,
including defects in text an earlier round's fixer wrote — as ordinary `"document"` findings,
because that reviewer is not the pass that wrote them. An implementation that suppresses
self-review findings permanently is a different rule, and a wrong one.

This used to require an `origin` reset at the round boundary, and a second field (`phase`) to
preserve the provenance that reset destroyed. Removing carry-forward removed the need for both:
`origin` is set once by the pass that raises a finding and never changes.

**The exception is the final round.** The argument above rests on there being a next round to do
the counting, and on the last round there is not: findings the self-review pass raises there are
excluded from the counts and never folded into any later ones. That is why the pass also *fixes*
what it finds, and why the summary discloses how many lines the final pass wrote unreviewed —
the disclosure is what stops "not counted" becoming "not known" at the one point where no
later round will notice.

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
