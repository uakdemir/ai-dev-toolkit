# Auto Mode Pipeline Overview

`/orchestrate --auto <spec1> [<spec2> ...]` — run a 4-stage pipeline on one or more specs, serially.

---

## Invariants

- **No user prompt, no hint file protocol, no breadcrumbs.** Auto mode is a post-brainstorm batch run.
- **No interaction.** Auto mode never asks for user input. If a decision point arises, the algorithm makes the choice.
- **Serial spec processing.** Each spec completes the full pipeline before the next begins.
- **Progress logging:** concise status lines, one per stage transition:
  `[auto] <spec-filename> > stage <i|ii|iii|iv> — <started|complete|failed>`
- **Auto mode never reads or writes `tmp/orchestrate-state.md`.** It uses `tmp/auto-state.md` exclusively.

---

## Pipeline (per spec)

| # | Stage | Composition | Agent? |
|---|---|---|---|
| i | Spec-review two-phase | Phase 1: `/review-doc <spec> --fact-check false --max-iterations 3 --run-id <run_id>-phase1` (sonnet). Phase 2: `/review-doc <spec> --fact-check true --model opus --max-iterations 2 --run-id <run_id>-phase2` (opus + fact-checker) | Yes — two serial sub-agent dispatches |
| ii | Implement | `/implement <spec> --auto --run-id <id>` | Yes — single dispatch (may spawn 1 helper internally) |
| iii | Code-review loop | `/review-code <spec_baseline> --against <spec_path> --run-id <id>` opus-only, up to 4 iters, commit after each | Yes — one dispatch per iter |
| iv | Verification gate | No-op in this release (no test suite). Final commits, print completion log | No — orchestrate runs directly |

---

## Why no write-plan stage?

Specs entering auto mode have been through brainstorming AND the two-phase review-doc pipeline (3 sonnet + 2 opus+fact-checker iters). The fact-checker verifies file paths, function signatures, and architectural claims against the live codebase. By the time a spec reaches agent ii, it IS an implementation blueprint.

The safety net is downstream: if the spec has gaps, the implement agent produces fuzzy code, and the opus code-review loop (up to 4 iters) catches and fixes it.

---

## Pre-pipeline Validation

Before processing the first spec:
1. Verify every positional spec arg is: (a) an existing regular file, (b) readable, (c) ends in `.md` or `.markdown`.
2. Any failure → print the full list of invalid paths with per-path reasons and exit. No spec processed, no state written.

---

## Commit Cadence (auto mode — structurally required)

| Event | Commit? | Template | Hash update |
|---|---|---|---|
| Before agent i starts | — | — | `spec_baseline = HEAD` |
| After agent i phase 1 | if spec changed | `chore(auto): <spec-slug>: spec review phase 1 fixes` | — |
| After agent i phase 2 | if spec changed | `chore(auto): <spec-slug>: spec review phase 2 fixes` | — |
| During agent ii | yes, via executing-plans | (implement's own commits) | — |
| After agent ii validators | — | — | `implement_head = HEAD` |
| After each agent iii iter | **required** | `fix(auto): <spec-slug>: code-review iter <N> — address findings` | `last_iteration_head = HEAD` |
| Stage iv verification | if anything changed | `chore(auto): <spec-slug>: verification fixes` | — |

Phase commits are conditional — skip if fixer made zero changes. Detect via `git diff --quiet <spec_path>`.

The per-iteration commit after agent iii is **non-optional** — it's load-bearing for the `last_iteration_head` rollback anchor.
