---
name: stack-validation
applies-to: [document-for-ai, refactor-to-layers, refactor-to-monorepo, test-audit]
canonical: Validate the selected stack against its validation file before proceeding.
---

# Validate the selected stack before proceeding

**Validate the selected stack against its validation file before proceeding.**

Four skills ask the user to pick a technology stack from a numbered list, and all four then have to
confirm the answer against the repository rather than trusting it. The procedure was written out
four times, in four slightly different wordings, with nothing aware the four were meant to agree —
which is how the wordings drifted apart in the first place.

## The procedure

After the user selects a stack:

1. Read that skill's own `skills/<skill>/references/tech-stacks.md` and find the validation file the selected
   stack is identified by. Each skill keeps its own stack list, so the file lives in the skill, not
   here; only the procedure is shared.
2. Scan the project root for that file.
3. If it is missing, warn and let the user decide — do not abort and do not silently continue:

   ```
   Expected {file} for {stack} but did not find it. Continue anyway?
   ```

4. If the user continues, proceed with the selected stack and record that validation was skipped
   wherever the skill reports what it did.

## What varies per skill, legitimately

- **The number of options.** `test-audit` offers 1-3; the other three offer 1-5. The count belongs
  to the skill's stack list, not to this rule.
- **The stack set itself**, and therefore which validation file each option maps to.

Nothing else. The warning text, the decision to ask rather than abort, and the requirement to
validate at all are the same in all four.

## Known variance — not yet reconciled

`refactor-to-monorepo`'s own `skills/refactor-to-monorepo/references/tech-stacks.md` does **not** name a validation file per stack.
Its SKILL.md instructed the agent to read "the **Validation file** entry" in that file; there are
none, and the file marks stacks with a `Detection Files` table instead. An agent following the
instruction literally finds nothing to scan. Recorded here rather than papered over, because
inventing per-stack validation files for that skill is a content decision, not a deduplication.

## Governed sites

- `skills/document-for-ai/SKILL.md`
- `skills/refactor-to-layers/SKILL.md`
- `skills/refactor-to-monorepo/SKILL.md`
- `skills/test-audit/SKILL.md`

No prose detector: this is a procedure, not a semantic axis, so there is no mechanical signature of
"doing it wrong". What the gate enforces is that all four skills state the canonical sentence and
point here (checks A2 and C) — enough that deleting the rule, or forking it again in one skill, is
loud rather than silent.
