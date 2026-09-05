# Auto Mode Pipeline Overview

`/orchestrate --auto <spec1> [<spec2> ...]` — run a 4-stage pipeline on one or more specs, serially.

---

## Invariants

- **No user prompt, no hint file protocol, no breadcrumbs.** Auto mode is a post-brainstorm run.
- **No interaction.** Auto mode never asks for user input. If a decision point arises, the algorithm makes the choice.
- **One spec per run.** Auto mode takes exactly one spec and runs it end to end. Queueing several was removed: it was never parallel, and the only thing it bought was a skip-and-continue failure path whose rewind machinery destroyed the evidence of the failure it was recovering from. Run `--auto` again for the next spec.
- **Progress logging:** concise status lines, one per stage transition:
  `[auto] <spec-filename> > stage <i|ii|iii|iv> — <started|complete|failed>`
- **Auto mode never reads or writes `tmp/orchestrate-state.md`.** It uses `tmp/auto-state.md` exclusively.
- **Profiling log:** auto mode appends one JSONL entry per sub-agent dispatch to `${XDG_DATA_HOME:-$HOME/.local/share}/ai-dev-tools/ai-dev-tools.log`. Write failures are silently swallowed — profiling never blocks the pipeline. See `references/auto/profiling-log.md`.

---

## Pipeline (per spec)

| # | Stage | Composition | Agent? |
|---|---|---|---|
| i | Spec-review two-phase | Phase 1: `/review-doc <spec> --fact-check false --max-iterations 2 --run-id <run_id>-phase1` (no fact-check). Phase 2: `/review-doc <spec> --fact-check true --max-iterations 2 --run-id <run_id>-phase2` (fact-checker on) | Yes — two serial sub-agent dispatches |
| ii | Implement | `/implement <spec> --auto --run-id <id>` | Yes — single dispatch (may spawn 1 helper internally) |
| iii | Code-review loop | `/review-code <spec_baseline> --against <spec_path> --run-id <id> --max-iterations 4` up to 4 iters, commit after each | Yes — one dispatch per iter |
| iv | Verification gate | No-op in this release (no test suite). Final commits, print completion log | No — orchestrate runs directly |

---

## Why no write-plan stage?

Specs entering auto mode have been through brainstorming AND the two-phase review-doc pipeline (2 no-fact-check + 2 fact-checker iters). The fact-checker verifies file paths, function signatures, and architectural claims against the live codebase. By the time a spec reaches agent ii, it IS an implementation blueprint.

The safety net is downstream: if the spec has gaps, the implement agent produces fuzzy code, and the code-review loop (up to 4 iters) catches and fixes it.

---

## Pre-pipeline Validation

Before processing the first spec:
1. Verify every positional spec arg is: (a) an existing regular file, (b) readable, (c) ends in `.md` or `.markdown`.
2. Any failure → print the full list of invalid paths with per-path reasons and exit. No spec processed, no state written.

---

## Profiling Log — One-Time Setup

After pre-pipeline validation passes and before stage i starts (runs once per auto invocation, not per spec):

```bash
LOG_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/ai-dev-tools"
LOG="$LOG_DIR/ai-dev-tools.log"
mkdir -p "$LOG_DIR" 2>/dev/null || echo "[auto] warning: could not create $LOG_DIR (profiling log disabled)" >&2
```

A `mkdir -p` failure prints a single stderr breadcrumb and does NOT abort the run; per-dispatch appends fail silently per the profiling-log failure policy. See `references/auto/profiling-log.md` for the full write protocol and schema.

---

## Commit Cadence (auto mode — structurally required)

| Event | Commit? | Template | Hash update |
|---|---|---|---|
| Before agent i starts | — | — | `spec_baseline = HEAD` |
| After agent i phase 1 | if spec changed | `chore(auto): <spec-slug>: spec review phase 1 fixes` | — |
| After agent i phase 2 | if spec changed | `chore(auto): <spec-slug>: spec review phase 2 fixes` | — |
| During agent ii | yes, via executing-plans | (implement's own commits) | — |
| After agent ii validators | — | — | — |
| After each agent iii iter | **required** | `fix(auto): <spec-slug>: code-review iter <N> — address findings` | — |
| Stage iv verification | if anything changed | `chore(auto): <spec-slug>: verification fixes` | — |

Phase commits are conditional — skip if fixer made zero changes. Detect via `git diff --quiet <spec_path>`.

The per-iteration commit after agent iii is **non-optional**. It used to be load-bearing for the `last_iteration_head` rollback anchor; that anchor is gone, but the commit stays — it is what makes each iteration's fixes separately reviewable, and what `spec_baseline..HEAD` counts at the end.
