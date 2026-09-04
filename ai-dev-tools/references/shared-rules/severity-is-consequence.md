---
name: severity-is-consequence
applies-to: [review-code, review-doc]
canonical: Severity is consequence, not certainty.
detector: severity-from-confidence
---

# Severity is consequence, not certainty

**Severity is consequence, not certainty.** Rate `severity` by what actually happens to the
software's user if the finding is real — data loss, auth bypass and silent corruption are critical
however unsure you are; a cosmetic issue is low however certain you are. Rate `confidence`
separately: it is the likelihood the finding is real. The two axes are independent, and a finding
that is uncertain and catastrophic outranks one that is certain and cosmetic.

## Why this is shared

`review-code` and `review-doc` emit the same JSON shape, with the same `severity` enum and the same
`critical_count` field, and four auto-pipeline gates read that field without knowing which skill
produced it. If one skill rates by consequence and the other by certainty, the same number means two
different things and the gates compare incomparable quantities.

That is not hypothetical. `review-code` gained this rule in `6f22c6a`; that commit touched two
files, both under `review-code`. `review-doc` went on deriving severity from its confidence score,
because nothing in the tree knew the two skills were supposed to agree. This file, its `applies-to`
list, and `scripts/check-shared-semantics.cjs` are what make the next fork structurally impossible
rather than merely unlikely.

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

- `skills/review-code/prompts/reviewer.md`
- `skills/review-doc/prompts/reviewer.md`
- `skills/review-doc/prompts/verifier.md`
- `skills/review-doc/agents/codebase-fact-checker.md`

Enforced by `scripts/check-shared-semantics.cjs`, detector `severity-from-confidence` — a manual
gate, run per the root CLAUDE.md, not an automatic one.
