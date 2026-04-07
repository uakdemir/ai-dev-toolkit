# ai-dev-toolkit Improvements — Spec Batch

**Date:** 2026-04-07
**Status:** Draft
**Sub-specs:** 5 (numbered by implementation order, NOT by original discussion order)

## Sub-Specs

| # | File | Title | Source |
|---|------|-------|--------|
| 01 | `01-review-doc-final-gate.md` | review-doc always runs final gate on last allowed iteration | `tmp/ai-dev-tool-improvement-prompt.md` |
| 02 | `02-implement-skill.md` | New `/implement` skill extracted from orchestrate Step 5 | mid-brainstorm |
| 03 | `03-orchestrate-strict-propagation.md` | `--strict` propagation in breadcrumbs + breadcrumb-as-last-line | mid-brainstorm |
| 04 | `04-orchestrate-recommendation-breadcrumbs.md` | Multi-line breadcrumbs, auto-commit, quality-gate suggestions | mid-brainstorm split from Item 03 |
| 05 | `05-scaffold-skill.md` | New `/scaffold` skill (monorepo bootstrap + add-package) | original prompt |

## Rationale

Four pain points motivate this batch:

1. **Silent quality degradation in review-doc** — When a complex spec keeps surfacing finer-grained criticals across rounds, `review-doc --max-iterations N` exits without ever running the opus reviewer + fact-checker. The `--max-iterations` flag reads like "N rounds total, last is the heavy pass" but currently behaves like "budget cap on the early-round phase only." Item 01 fixes this so the **last allowed iteration is always the final gate**.

2. **Step 5 of orchestrate is overloaded** — Implementation step has its own task graph + execution model selection + 4-option dispatch with override preambles, all crammed inside the orchestrate state machine. This is hard to invoke standalone (e.g., "I have a plan, just execute it") and hard to maintain. Item 02 extracts it into a standalone `/implement` skill with a clean argument signature, preserving the orchestrate flow via a delegating Step 5.

3. **`--strict` mode is invisible in breadcrumbs** — When the user runs orchestrate in strict mode, breadcrumbs printed at step boundaries omit the `--strict` flag, so copy-pasting the breadcrumb silently downgrades the next step. Additionally, breadcrumbs are sometimes followed by trailing prose, which makes them harder to grab as the literal final line. Item 03 makes `--strict` propagate to every breadcrumb form (bare, wrapped, phase-boundary) AND guarantees the breadcrumb is the literal last line at every exit point.

4. **Single-path breadcrumbs miss user choice** — Today, every step boundary recommends exactly one next command, so the user has no way to choose alternative paths (skip the review, run an extra review, run a quality gate) without manually rewriting the command. Item 04 adds multi-line labeled breadcrumb suggestions, auto-commit verification before transitions, and randomized quality-gate suggestions at success points.

5. **Project bootstrap is manual and convention-blind** — Starting a new monorepo or adding a new package means hand-copying scaffolding files, manually wiring workspace declarations, and re-deriving CLAUDE.md conventions every time. Item 05 introduces a `/scaffold` skill that bakes the `tmp/scaffold/` templates as a v1 stack (`node-fastify-react`) and supports both `--bootstrap` (empty folder) and `--add-package` (existing monorepo) modes.

## Dependency Diagram

```
              Item 01 (review-doc final gate)
                       │
                       │ standalone — no deps on others
                       ▼
                  [independent]


              Item 02 (/implement skill)
                       │
                       │ moves implementation-step.md + task-graph.md
                       │ from orchestrate/references/ to implement/references/
                       │ rewrites orchestrate Step 5 as a delegating wrapper
                       ▼
              Item 03 (orchestrate --strict propagation)
                       │
                       │ depends on Item 02 because Step 5's breadcrumbs
                       │ change shape after the /implement extraction
                       ▼
              Item 04 (orchestrate recommendation breadcrumbs)
                       │
                       │ depends on Item 03 because multi-line breadcrumbs
                       │ build on the strict-propagation + breadcrumb-as-last-line
                       │ guarantees from Item 03
                       ▼
              Item 05 (/scaffold skill)
                       │
                       │ standalone — no deps on others, but ordered last
                       │ because it's the largest net-new surface area
                       ▼
                  [independent]
```

## Implementation Order

**01 → 02 → 03 → 04 → 05**

File numbering matches the build sequence — implement in numeric order.

Reasoning:
- **01 first** because it's the smallest, most isolated fix (a self-contained edit to one file with no inbound or outbound dependencies). Landing it first puts a fast win on the board and clears the smallest item before the larger orchestrate work begins.
- **02 second** because it's the foundational refactor — extracts `/implement` from orchestrate Step 5. Items 03 and 04 both depend on the new Step 5 shape.
- **03 third** because it adds the `--strict` propagation contract and breadcrumb-as-last-line guarantee that Item 04 builds on.
- **04 fourth** because multi-line labeled breadcrumbs need the strict-propagation and position guarantees from Item 03 in place.
- **05 last** because it's the largest net-new surface area (new `/scaffold` skill + 11 templates) with no inbound dependencies — best to land after the orchestrate changes settle so any `/scaffold` breadcrumbs at completion use the new format.

## Out of Scope

- **No `--no-final-gate` escape hatch** for review-doc (Item 01). Listed as optional follow-up in the source prompt; deferred.
- **No structural test generation** for /scaffold (Item 05). The `tmp/scaffold_recommendations.md` and `tmp/scaffold_ideas.md` documents propose generating Drizzle convention tests, declarative `conventions:` YAML blocks, and ESLint rule generation. All deferred — v1 ships templates only.
- **No app.ts route registration** during `--add-package`. The scaffold creates the package and updates `pnpm-workspace.yaml` + root CLAUDE.md table, but does NOT touch `apps/server/src/app.ts` or `apps/client/src/main.tsx`. The scaffold prints a wire-up checklist for the user to apply manually.
- **No `--dry-run` mode** for /scaffold. The `--force` flag plus skip-existing default is sufficient for v1.
- **No stack support beyond `node-fastify-react`** for /scaffold v1. The `--stack` flag exists for future extensibility but only one value is implemented.
- **No `respond-to-review` skill changes** in Item 04. The user clarified that the review-doc loop already applies fixes, so the additional `respond-to-review` line was dropped from the breadcrumb proposal.

## Verification

No test suite in this plugin project (per project conventions). Verification is by:
- Manual smoke test of each touched skill on a representative input
- `cat`-style review of the modified SKILL.md files to confirm intended structure
- For Item 05: a one-shot `/scaffold --bootstrap` run in a temp directory + a `/scaffold --add-package test-pkg --has-routes` run in the resulting monorepo

---

**Summary of this overview doc:**
- Five sub-specs (01–05) covering review-doc, /implement extraction, /strict propagation, multi-line breadcrumbs, /scaffold
- Implementation order is **01 → 02 → 03 → 04 → 05** — file numbering matches the build sequence
- Five OOS callouts to prevent scope creep — most notably the structural-test generation ideas are deferred from /scaffold v1

**Decisions taken:**
- File numbering matches implementation order — `01` is the first item to land, `05` is the last. Reading the files in numeric order is reading them in build sequence.
- Item 01 ordered first despite being the smallest fix to put a fast win on the board and clear the smallest item before the larger orchestrate work begins. Items 02–04 form a dependency chain (02 → 03 → 04); Item 05 is standalone and lands last because it's the largest net-new surface area.
