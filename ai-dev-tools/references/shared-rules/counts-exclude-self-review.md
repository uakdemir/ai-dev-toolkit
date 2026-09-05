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

**The exception is the final round.** The argument above rests on there being a next round to do
the counting, and on the last round there is not: findings the self-review pass raises there are
excluded from the counts and never folded into any later ones. That is why the pass also *fixes*
what it finds, and why the summary discloses how many lines the final pass wrote unreviewed —
the disclosure is what stops "not counted" becoming "not known" at the one point where no
later round will notice.

Worked example. A 600-line document. Round 1's fixer writes 100 lines; round 1's self-review pass
checks those and writes more; round 1's counts reflect only the original 600. Round 2 reviews the
whole file and counts everything in it.

## `phase` records where a finding came from — and must not be counted on

Every issue also carries `phase` — `"review"`, `"fact-check"` or `"self-review"` — recording which
pass found it. Unlike `origin`, it is **never reset**: a later round flips `origin` to `"document"`
while `phase` keeps the provenance. It exists because `origin` alone loses that information after one
round, and `category` cannot supply it — the fact-checker and the self-review pass both emit
`"fact-check"`.

**Do not compute the counts from `phase`.** A carried-forward self-review finding keeps
`phase: "self-review"` forever, so a phase-based count would suppress it permanently — which is the
wrong rule this whole section exists to distinguish from the round-local one, and the one
`tests/fixtures/counts/churn-next-round.json` is built to reject. `phase` is for diagnostics: which
pass is producing the criticals, and therefore which prompt needs work.

The validator enforces the one direction that must hold, and only where `phase` is present: it
rejects `origin: "self-review"` paired with a phase other than `"self-review"`, because only that
pass may mark a finding as the round's own churn. **A missing `phase` is not caught** — the check is
guarded on the key existing, and that is deliberate. `phase` is optional on every issue: the
self-review pass has exactly one phase, so `origin: "self-review"` already carries the information
`phase: "self-review"` would repeat. Requiring it would tighten the artifact contract that four
auto-pipeline gates and both skills write against, in exchange for a field that is redundant
wherever the constraint would apply. What the validator rejects is a *contradiction* — `origin`
claiming the round's own churn while `phase` names a different pass — not an omission. The reverse — `phase: "self-review"` with `origin: "document"` — is the
normal carried-forward shape.

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
