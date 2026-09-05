---
name: severity-is-consequence
applies-to: [review-code, review-doc]
canonical: Severity is consequence, not certainty.
detector: severity-from-confidence
---

# Severity is consequence, not certainty

**Severity is consequence, not certainty.** Rate `severity` by what actually happens downstream if
the finding is real — irreversible loss, a guarantee the system cannot keep, and damage that hides
itself are critical however unsure you are; something nothing is built on is low however certain you
are. Rate `confidence` separately: it is the likelihood the finding is real. The two axes are
independent, and a finding that is uncertain and catastrophic outranks one that is certain and
cosmetic.

**The examples are deliberately domain-neutral.** Each governed skill states this same sentence and
then gives its own concrete cases — `review-code` in terms of the software's user (data loss, auth
bypass, silent corruption), `review-doc` in terms of the reader and the implementer (a step that
destroys data, a contract the system cannot keep, an instruction that silently builds the wrong
thing). That split is the point: the shared rule is the axis, and the domain examples belong to the
skill. Writing one skill's examples here would fork the elaboration while the canonical sentence
still matched — a divergence check A2 cannot see, because it compares the sentence and not the
paragraph around it.

## Why this is shared

`review-code` and `review-doc` emit different artifacts that share a `severity` enum and a
`critical_count` field, and three auto-pipeline gates read that field without knowing which skill
produced it. If one skill rates by consequence and the other by certainty, the same number means two
different things and the gates compare incomparable quantities.

That is not hypothetical. `review-code` gained this rule in `6f22c6a`; that commit touched two
files, both under `review-code`. `review-doc` went on deriving severity from its confidence score,
because nothing in the tree knew the two skills were supposed to agree. This file, its `applies-to`
list, and `scripts/check-shared-semantics.cjs` are what make the next fork *detectable* rather
than invisible. The gate is run by hand (see the root CLAUDE.md), so it makes divergence loud, not
impossible — the impossibility would need it wired into CI or a hook.

## What it forbids

- Deriving `severity` from a confidence score by any threshold, band, table, or arrow mapping.
- Setting `confidence` and `severity` together as a single paired decision — per verdict class, per
  finding template, per anything. A verdict class fixes how sure you are; it cannot fix what breaks.
- Applying the reporting floor before severity has been considered, so a catastrophic-but-uncertain
  finding is discarded unseen. A high-severity finding below the floor is investigated until it can
  be grounded or dropped, never silently discarded.

## What it requires

Rate the two axes independently and report both. Where a finding's severity is capped for a
structural reason — a divergence no agent can resolve, say — the cap is stated as a claim about
consequence, never as a claim about how certain the finding is.

## Governed sites

- `skills/review-code/SKILL.md`
- `skills/review-code/prompts/reviewer.md`
- `skills/review-code/prompts/self-review.md`
- `skills/review-doc/SKILL.md`
- `skills/review-doc/prompts/reviewer.md`
- `skills/review-doc/prompts/verifier.md` — carries the rule by citation; it falls outside the
  detector's `governs()` predicate, so it is not in the coverage snapshot
- `skills/review-doc/agents/codebase-fact-checker.md`

The list is the union of `tests/detector-coverage.txt` — the committed snapshot of the detector's
`governs()` scope, which `scripts/check-detector-coverage.sh` holds the detector to — and the files
that state the canonical sentence. Neither set alone is the rule's reach: `governs()` asks only
whether a file rates severities at all, and a file can carry the rule by citation without doing
either.

Enforced by `scripts/check-shared-semantics.cjs`, detector `severity-from-confidence` — a manual
gate, run per the root CLAUDE.md, not an automatic one.
