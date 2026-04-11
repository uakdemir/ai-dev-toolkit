# Orchestrate Overhaul — Design Spec

**Date:** 2026-04-11
**Branch:** feat/orchestrate-auto
**Status:** Design approved, ready for implementation planning
**Target skills:** `ai-dev-tools:orchestrate` (primary), `ai-dev-tools:review-doc`, `ai-dev-tools:review-code`, `ai-dev-tools:implement` (sub-skill refactors)

---

## Problem Statement

The current `ai-dev-tools:orchestrate` skill (v1.8.0) has four serious issues:

1. **Too manual.** One step per invocation — the user must drive every breadcrumb, paste the next command, re-enter orchestrate, and pay the re-initialization cost each time. A single feature goes through 8–9 manual round-trips.
2. **`--strict` has near-zero practical influence.** The TDD enforcement that `--strict` advertises is actually implemented inside the `superpowers` skills it calls, not by strict mode itself. Standard and strict modes produce nearly identical behavior in practice, and the mode toggle is mostly dead weight.
3. **Context bloat.** The SKILL.md is 604 lines / ~13K tokens loaded on every invocation. Over a full 9-step cycle, the skill alone burns ~120K tokens before counting any sub-skill work. The Context Health Check section ironically inflates context to estimate context usage.
4. **No automation path.** There's no way to hand one or more reviewed specs to orchestrate and have it carry them through review → implement → code-review → verification without human intervention.

This spec overhauls orchestrate to fix all four, refactors three sibling skills to support the new pipeline, and introduces cross-cutting infrastructure (`tmp/_reviews_errors/`, run-id scoping) needed to make multi-agent orchestration safe.

---

## Goals

1. **Two modes, clearly separated:** `standard` (default, manual, lean) and `--auto` (agent-based automated pipeline).
2. **Dramatic context reduction** via progressive disclosure — main `SKILL.md` drops to ~150–180 lines; failure-handling machinery loads only when a failure occurs.
3. **End-to-end automation** — `/orchestrate --auto spec1.md [spec2.md …]` runs review → implement → code-review → verification per spec, serially.
4. **Non-destructive failure handling** — no `git reset --hard` anywhere in auto mode; all rollbacks use soft reset + stash.
5. **Single Responsibility Principle for sub-skills** — `review-doc`, `review-code`, and `implement` become dumb, composable workers; orchestrate composes phases on top.
6. **Preserve standalone usability** — every sub-skill change is additive or backward compatible; standalone invocations of `/review-doc`, `/review-code`, and `/implement` keep working as today.

## Non-Goals

- **Parallel spec processing.** Auto mode processes specs serially. Multiple specs in one invocation is convenience, not parallelism.
- **Cross-session state sharing.** Each `/orchestrate --auto` invocation is self-contained; there is no shared queue, no resume-across-sessions state for auto mode.
- **Documentation extraction / ADR generation.** The ADR extraction block currently inlined at the start of Step 4 (Write Plan) is deleted and deferred to a future release that will handle documentation holistically. Step 4 itself (Write Plan) is retained.
- **Replacing `/writing-plans`.** The skill still exists and is usable standalone; it is simply not invoked by auto mode (rationale below).
- **Test infrastructure.** This project has no test suite; commit cadence and verification gate logic acknowledge this.

---

## Design Overview

```
┌────────────────────────────────────────────────────────────────┐
│  /orchestrate [--auto <spec...>] [--handoff] [--use-roadmap]   │
└────────────────┬──────────────────────────┬────────────────────┘
                 │                          │
         (default)                      (--auto)
                 │                          │
                 ▼                          ▼
        ┌────────────────┐          ┌────────────────┐
        │ Standard mode  │          │   Auto mode    │
        │ (manual, lean) │          │ (agent pipeline)│
        └───────┬────────┘          └───────┬────────┘
                │                           │
                ▼                           ▼
      tmp/orchestrate-state.md      tmp/auto-state.md
      (hint file, lean)             (three-hash rollback model)
                │                           │
                ▼                           ▼
        Steps 1–7 (interactive)    Per spec, serial:
        with /commit breadcrumbs    i.   Spec-review (2-phase)
                                    ii.  Implement (/implement --auto)
                                    iii. Code-review loop (≤4 iters)
                                    iv.  Verification gate
```

**Two independent state machines** sharing only a directory (`tmp/`). Standard mode reads git state; auto mode reads and writes git state.

**Progressive disclosure** — the main SKILL.md is a thin router that loads only the references needed for the current invocation.

**Four sub-skill refactors** are bundled into a single coordinated PR (Approach C below) because their interfaces are coupled through run-id threading.

---

## Architecture — Progressive Disclosure Layout

```
skills/orchestrate/
├── SKILL.md                                    # ~150-180 line hot path
└── references/
    ├── common/
    │   ├── help.md                             # --help output
    │   └── error-logs-format.md                # error-logs.md schema
    ├── standard/
    │   ├── session-bootstrap.md
    │   ├── hint-file-protocol.md
    │   ├── fast-path-detection.md
    │   ├── user-prompt.md
    │   ├── session-handoff.md                  # loaded only on --handoff
    │   ├── refactor-roadmap-check.md           # loaded only on --use-roadmap
    │   └── steps/
    │       ├── step-1.md
    │       ├── step-2.md
    │       ├── step-3.md
    │       ├── step-4.md
    │       ├── step-5.md
    │       ├── step-6.md
    │       └── step-7.md
    └── auto/
        ├── pipeline-overview.md
        ├── auto-state-schema.md
        ├── stages/
        │   ├── agent-i-spec-review.md
        │   ├── agent-ii-implement.md
        │   ├── agent-iii-code-review.md
        │   └── stage-iv-verification-gate.md
        └── failure-handling/
            ├── overview.md                     # failure matrix
            ├── retry-semantics.md
            ├── endless-loop.md
            ├── crash-text-stage.md             # agent i crashes
            ├── crash-implement.md              # agent ii crashes
            ├── crash-code-review.md            # agent iii crashes
            ├── rollback-mechanism.md
            └── error-log-templates.md
```

**Main `SKILL.md` contains only:**
- YAML frontmatter
- Argparse for `--auto`, `--help`, `--handoff`, `--use-roadmap`
- Mode dispatch logic
- Auto mode invariants (<15 lines)
- References index mapping intent → file path

**Happy-path load budget:**
- **Standard mode:** `SKILL.md` + `session-bootstrap.md` + `hint-file-protocol.md` + `fast-path-detection.md` + `user-prompt.md` + 1 step file = ~6 files
- **Auto mode:** `SKILL.md` + `pipeline-overview.md` + `auto-state-schema.md` + 4 stage files = ~7 files
- **Failure-handling files:** zero loads unless a failure occurs
- **Handoff / roadmap files:** zero loads unless the corresponding flag is passed

Compared to today's 604-line monolith, the hot path drops by roughly 70%.

---

## Top-level Interface

```
/orchestrate [--auto <spec...>] [--handoff] [--use-roadmap] [--help]
```

| Flag | Mode | Purpose |
|---|---|---|
| (none) | standard | Manual step-by-step flow |
| `--auto <spec...>` | auto | Run agent pipeline on one or more specs, serially |
| `--handoff` | standard only | Load `tmp/session-handoff.md` and resume |
| `--use-roadmap` | standard only | Enable refactor-unit routing via roadmap match |
| `--help` | — | Print help text and exit |

**Removed from today's interface:** `--strict` (flag deleted; strict becomes standard).

**Hard errors:**
- `--handoff` + `--auto` together → reject at argparse:
  ```
  Error: --handoff and --auto are incompatible. --auto is a targeted
  post-brainstorm pipeline run; --handoff is for resuming standard-mode
  sessions. Use one or the other.
  ```
- `--use-roadmap` + `--auto` together → reject at argparse:
  ```
  Error: --use-roadmap is not supported in --auto mode. Refactor-unit
  execution requires the interactive standard-mode flow.
  ```

**Positional args (`<spec...>`) under `--auto`:**
- `orchestrate --auto spec1.md spec2.md` works
- `orchestrate --auto specs/*.md` works (shell expands before orchestrate sees args)
- `orchestrate --auto` with no positional args → interactive prompt for spec paths

---

## Standard Mode

### What stays

- Session bootstrap (feature detection from hint file or user prompt)
- Hint file protocol at `tmp/orchestrate-state.md` (lighter than today)
- Fast-Path Detection (reads `git log` to determine current step on re-entry)
- User prompt flow
- Steps 1–7 (interactive, one step per invocation)
- Session handoff on explicit `--handoff`
- Refactor-unit routing on explicit `--use-roadmap`

### What gets removed

- **`--strict` flag and all strict-mode code paths** — strict becomes standard.
- **Step 0 (Context Health Check)** — the estimation formula is unreliable and the check bloats context to measure context. Removed entirely.
- **Step 8 (Structured Completion / git branch flow)** — removed from standard mode entirely. Users who want branch/PR hygiene invoke it themselves.
- **ADR extraction block inside Step 4 (Write Plan)** — deferred to a future documentation release. Step 4 itself remains — it still invokes `/writing-plans` — but the inline ADR extraction prelude (currently referencing `ai-dev-tools/skills/document-for-ai/references/adr-extraction.md`) is deleted. Step 4 becomes a thin wrapper around `/writing-plans` with no ADR pre-work.
- **Auto-Commit Verification remediation** — the section that runs `git log {plan_hash}..HEAD | wc -l` to detect missing commits and fires a `chore: post-<step>-checkpoint for <plan>` commit as remediation is deleted from standard mode. The three templates (`post-implement`, `post-review-code`, `post-finalize`) go with it. Standard mode becomes **read-only on git state** — it only reads `git log` for Fast-Path Detection, never writes commits.

**Net step count:** today's orchestrate has Steps 0–8 (nine steps). Removing Step 0 and Step 8 leaves Steps 1–7, no renumbering (Step 0 and Step 8 are at the edges):

| # | Name | Status after overhaul |
|---|---|---|
| 1 | Brainstorm | Kept |
| 2 | Spec Review | Kept |
| 3 | Respond to Review | Kept |
| 4 | Write Plan | Kept (ADR extraction prelude deleted) |
| 5 | Implement | Kept |
| 6 | Code Review | Kept |
| 7 | Fix Findings | Kept |

### Hint file changes (`tmp/orchestrate-state.md`)

Remove the `mode:` field entirely (no strict mode to record). Existing v1.8.0 hint files with `mode: strict` are treated as plain standard-mode hint files; the field is a no-op during transition. No migration logic is written.

### Commit cadence — Option Z (user-driven with breadcrumb nudges)

Standard mode never runs `git commit` itself. Instead, step-boundary breadcrumbs include `/commit` as the first suggestion line when a step produced changes. Example breadcrumb after Step 5:

```
── Next ────────────────────────────────────────
/commit
/orchestrate
────────────────────────────────────────────────
```

Rationale: matches the user's "breadcrumbs are commands-only, copy-pastable" preference — `/commit` is just another command on its own line. No descriptions, no labels, no headers beyond the divider.

### `--use-roadmap` behavior

When passed, orchestrate loads `references/standard/refactor-roadmap-check.md` and performs the substring match logic currently inline in Step 5. If the spec/plan filename matches an unchecked item in `docs/monorepo-strategy/roadmap.md` or `docs/layer-architecture/roadmap.md`, route to the refactor-unit path (delegates to `/implement`'s existing refactor-unit pre-check).

When NOT passed, the roadmap check is **skipped entirely** — no stat calls on the roadmap files, no substring match logic loaded. Default standard-mode invocations are unaffected by the roadmap's presence.

The `/implement` skill's standalone refactor-unit detection (per `implement/SKILL.md:107-119`) is unchanged; only the orchestrate-level integration moves behind the flag.

### `--handoff` behavior

When passed, orchestrate loads `references/standard/session-handoff.md` and reads `tmp/session-handoff.md` to resume a prior mid-session state. When NOT passed, neither file is loaded. This is the key change from today's auto-load behavior and is the single biggest contributor to the hot-path context reduction.

---

## Auto Mode

### Invocation

```bash
/orchestrate --auto <spec1> [<spec2> ...]
```

Each spec is processed through the full pipeline before the next spec begins. No parallelism across specs.

**No user prompt, no hint file protocol, no breadcrumbs.** Auto mode is a post-brainstorm batch run — the user has already selected the specs they want processed. Progress is communicated via **concise progress lines** (status-only, no interaction), one per stage transition.

### Pipeline (per spec, four stages, serial)

| # | Stage | Composition | Agent? |
|---|---|---|---|
| i | Spec-review two-phase | `/review-doc <spec> --fact-check false --max-iterations 3` (sonnet loop), then `/review-doc <spec> --fact-check true --model opus --max-iterations 2` (opus + fact-checker) | Yes — two serial sub-agent dispatches |
| ii | Implement | `/implement <spec> --auto` — uses the narrowed 2-option algorithm | Yes — single dispatch (may spawn 1 helper internally) |
| iii | Code-review loop | `/review-code <spec_baseline>` opus-only, up to 4 iters, commit after each successful iter | Yes — one dispatch per iter |
| iv | Verification gate | Run tests if present, final commits, print completion log | No — orchestrate runs directly |

### Why no write-plan stage?

`/writing-plans` is NOT invoked in auto mode. The pipeline goes directly from reviewed spec → implement.

**Rationale:**
1. Specs entering auto mode have already been through brainstorming (clarifying questions, design sections, self-review) AND the two-phase review-doc pipeline (3 sonnet iters + 2 opus+fact-checker iters). The fact-checker verifies file paths, function signatures, and architectural claims against the live codebase. By the time a spec reaches agent ii, it IS an implementation blueprint.
2. Running `/writing-plans` on top of a fact-checked spec is duplication with a small risk of reinterpretation drift (the planner may re-interpret an already-precise spec less precisely than the original).
3. The safety net is downstream: if the spec has gaps, the implement agent produces fuzzy code, and the opus code-review loop (up to 4 iters) catches and fixes it.

**Simplifications this enables:**
- One fewer agent definition file
- One fewer state in the auto-state enum (`plan-written` removed)
- One fewer crash-handling case
- Mental model: review → implement → review → verify (four beats, no hidden conditionals)

Standard mode still keeps `/writing-plans` available as a separate user-invocable skill. This decision only removes the auto-mode invocation of it.

### Agent i — Spec-review two-phase structure

**SRP principle:** `review-doc` stays a dumb, composable worker with one model and one fact-check setting per invocation. Orchestrate composes phase structure by making two serial `/review-doc` calls. Two skills, one responsibility each.

**Cost discipline:** opus + fact-check is expensive; use sonnet for bulk exploration, opus as a mandatory safety net.

**Orchestrate's two serial dispatches:**

```bash
# Phase 1 — cheap sonnet exploration, no fact-check, up to 3 iters
/review-doc <spec> --fact-check false --max-iterations 3 --run-id <id>

# Phase 2 — rigorous opus + fact-check, up to 2 iters (mandatory pass)
/review-doc <spec> --fact-check true --model opus --max-iterations 2 --run-id <id>
```

**Handoff between phases:** The spec file on disk is the state. Phase 1 mutates the spec via its fixer and exits. Phase 2 reads the already-improved spec and iterates further. No in-memory state threading.

**Endless-loop check applies ONLY to phase 2's final iter** (not phase 1):
- Phase 2 final iter pre-fix criticals ≤ 1 → success, continue pipeline
- Phase 2 final iter pre-fix criticals > 1 → Q2 failure path (see Failure Handling)

Phase 1's exit state is irrelevant for the endless-loop check — whatever criticals remain after phase 1 just become phase 2's input.

**Bounded worst case:** 3 + 2 = 5 review dispatches per spec.

### Agent ii — Implement (via `/implement --auto`)

Orchestrate dispatches `/implement <spec> --auto --run-id <id>`. The `--auto` flag (new, added in PR 1) short-circuits the interactive 4-option picker and narrows the decision to:

```
IF parallelism_ratio >= 0.35  → dispatch option [4]: single-agent + 1 parallel helper
ELSE                           → dispatch option [1]: single-agent
```

Options [2] subagent-per-task and [3] clear-context are **excluded** from auto mode because:
- Option [2] introduces multi-agent coordinator complexity and a larger failure surface
- Option [3] (clear-context) is meaningless in auto mode because the calling context is already fresh (orchestrate just dispatched)

The parallel helper cap is **max 1 helper ever** (per existing `implementation-step.md:178`).

**Threshold raised from 30% → 35%:** parallel helper has real dispatch overhead and fallback complexity; 5 extra percentage points excludes marginal cases where "technically parallelizable but not meaningfully faster" would otherwise trigger the code path. Applies to standalone `/implement` as well — no reason to differ.

### Agent iii — Code-review loop

**Single phase, opus-only.** Code review has too much false-negative risk on sonnet for complex logic bugs; there's no cheap phase to delegate to.

Each iteration invokes `/review-code <spec_baseline> --run-id <id>`. Because `spec_baseline` is set once at the start of agent i and never moves, every iteration reviews the **full scope of the spec** — from hash0 through current HEAD:

- Iter 1 reviews: hash0 → hash2 (implement work)
- Iter 2 reviews: hash0 → hash2a (implement + iter 1 fixes)
- Iter 3 reviews: hash0 → hash2b (implement + iter 1 + iter 2 fixes)

This guarantees every iteration sees both original implementation quality AND any regressions introduced by earlier fixes. Delta-only review (from `last_iteration_head`) was rejected because it would miss fix-introduced regressions.

**Up to 4 iterations** (endless-loop cap). Endless-loop measurement happens at iter 4's REVIEW output, pre-fix (option Y):
- Pre-fix criticals ≤ 1 → acceptable, treat as success
- Pre-fix criticals > 1 → endless-loop failure (Q2 path)

**Per-iteration commit invariant:** After every successful agent iii iter, orchestrate commits:
```
fix(auto): <spec-slug>: code-review iter <N> — address findings
```

This is non-optional and is the only place where auto mode adds its own commits on top of agent-produced commits. The commit creates the hash2a/hash2b/hash2c anchor chain that makes granular rollback possible.

### Stage iv — Verification gate

**No agent dispatch.** Orchestrate runs this directly:
1. Run test suite if one exists (this project has none — the step is a no-op)
2. If tests produced fixes, commit: `chore(auto): <spec-slug>: verification fixes`
3. Print completion log line: `✓ <spec-slug> complete (spec_baseline..HEAD: N commits)`
4. Advance to next spec or exit

### Auto-state.md — three-hash rollback model

**Location:** `tmp/auto-state.md`. Markdown with YAML frontmatter — matches `orchestrate-state.md`'s style for consistency but is a completely independent file.

```markdown
---
specs: [spec1.md, spec2.md, spec3.md]
current_spec: spec1.md
state: code-review-iter-2-complete
datetime: 2026-04-11T15:02:33Z

# Three hashes, three purposes:
spec_baseline: hash0           # review anchor for this spec — "start of scope"
                               # set when agent i begins, never updated
implement_head: hash2          # set when agent ii (implement) completes
                               # rollback target if code-review iter 1 crashes
last_iteration_head: hash2b    # updates after each successful code-review iter
                               # rollback target if code-review iter N>1 crashes

current_iteration: 3
---
```

**State enum:**
- `spec-review-iter-{N}-complete`
- `implementation-complete`
- `code-review-iter-{N}-complete`
- `finalized`
- `skipped-endless-loop` (Q2 case)
- `skipped-crash-{stage}` (Q3 case)
- `halted-crash-implement` (Q3 case)

**No migration logic between `orchestrate-state.md` and `auto-state.md`.** They are independent state machines sharing only a directory. Standard mode never reads `auto-state.md`; auto mode never reads `orchestrate-state.md`.

---

## Sub-Skill Refactors (PR 1 — coupled as one unit)

All four sub-skills refactor together in one PR because run-id threading must be consistent across them.

### `review-doc` — SRP refactor

**Problems with the current skill:**
- Only 1 opus iter ever runs (no second-chance verification)
- Three "final gate" trigger paths conflate sonnet exit, opus entry, and fact-checker dispatch
- Fast path can skip all sonnet iters if iter 1 finds 0 criticals
- Fact-checker runs AFTER fixer, so its findings are never fixed in the same run
- `--max-iterations` semantics are overloaded and can't express "N sonnet + M opus"
- review-doc tries to be both worker AND phase orchestrator (SRP violation)

**New interface:**

```
/review-doc <paths...> [--against <ref>] [--effort <level>]
            [--model <sonnet|opus>] --fact-check <true|false>
            [--max-iterations N] [--run-id <id>] [--help]
```

| Flag | Default | Notes |
|---|---|---|
| `--model` | `sonnet` | `opus` requests 200K context (not 1M) for cost control |
| `--fact-check` | **REQUIRED** | No default — caller must be explicit |
| `--max-iterations` | 3 | Honors option Y early-exit when pre-fix criticals == 0 |
| `--against` | current git ref | Unchanged from today |
| `--effort` | `high` | Unchanged from today |
| `--run-id` | none | Prefixes intermediary output files; optional (backward compatible) |

**Removed flags:** `--min-model`, `--max-model` (clean break, no backward compat).

**Simplified loop structure:**

```python
# One invocation = one loop, one model, one fact-check setting
for iter in 1..max_iterations:
    review_with(model)                  # reviewer: sonnet or opus
    if fact_check:
        fact_check_with(model)          # appends fact-check issues BEFORE fix
    pre_fix_criticals = count(json)     # option Y: measured at review output
    fix_with(model)                     # fixer: sonnet or opus
    if pre_fix_criticals == 0:
        break
```

**Key behavioral properties:**
1. No phase logic, no tier promotion, no hidden final gate
2. Fact-checker runs BEFORE fixer in each iter (so fact-check criticals get resolved in the same iter)
3. Early exit only on pre-fix criticals == 0 (option Y — always measure at review output)
4. The caller (orchestrate `--auto`) decides phase structure by invoking the skill multiple times
5. Model flag controls all dispatches in that invocation, including the fact-checker

**Tmp file output:** intermediary files move to `tmp/_reviews_errors/`. Standalone invocations without `--run-id` write to `tmp/_reviews_errors/review-doc.json` (un-prefixed, backward compatible). With `--run-id`, files are prefixed per the run-id convention (see Cross-Cutting Infrastructure).

### `review-code` — widening refactor

**Current:** accepts integer count → "review the last N commits"
**New:** also accepts a git revision → "review changes since that commit"

**Detection logic:**

```python
if arg.isdigit() and len(arg) <= 6:
    mode = "count"
elif git("rev-parse", "--verify", arg) succeeds:
    mode = "since"
else:
    error
```

Backward compatible. No new flags. Add `--run-id` for run-id threading.

**Auto mode usage:** every code-review iteration invokes `/review-code <spec_baseline> --run-id <id>`, reviewing the full scope of the spec's work (implement + all prior iteration fixes).

### `implement` — `--auto` flag addition

**Why:** auto mode needs to dispatch `/implement` non-interactively. The existing 4-option picker (single / subagent / clear-context / parallel) is interactive and blocks automation. Auto mode also wants to exclude the multi-agent coordinator path and the clear-context early-exit to keep the failure surface small.

**New flag:** `--auto`. Also add `--run-id` for run-id threading to dispatched sub-agents via the override preamble.

**Behavior when `--auto` is passed:**
1. Run the existing task graph + parallelism yield check from `implementation-step.md`
2. Dispatch path narrows to **two options only** — `{single, parallel (1 helper max)}`
3. Option [2] subagent-per-task is EXCLUDED
4. Option [3] clear-context is EXCLUDED
5. Dispatch the chosen model with the usual override preamble
6. Return control to caller (orchestrate)

**Simplified algorithm in auto mode:**

```
IF parallelism_ratio >= 0.35  → dispatch option [4]: single-agent + 1 parallel helper
ELSE                           → dispatch option [1]: single-agent
```

The `task_count >= 4 AND coupling != HIGH` precondition is implicit — when that check doesn't run, `parallelism_ratio` defaults to 0, which fails the gate.

**Does NOT replace existing behavior.** Without `--auto`, the interactive 4-option picker still works as today. `--auto` is additive and narrowing.

**Scope touches:**
- `ai-dev-tools/skills/implement/SKILL.md` — parse `--auto` flag, short-circuit picker, exclude options [2] and [3], thread `--run-id`
- `ai-dev-tools/skills/implement/references/implementation-step.md` — note about auto mode's two-option restriction, threshold bumped 30% → 35%
- Help text updated

**Failure surface in auto mode:**

| Failure | Handling | Where |
|---|---|---|
| Main agent crash | Retry once → halt pipeline | Orchestrate Q3 (crash-implement) |
| Helper hang/crash | Main agent absorbs helper's tasks | `executing-plans` override preamble (existing) |

No new orchestrate-level crash handling is introduced by the helper path.

---

## Cross-Cutting Infrastructure (PR 1)

### `tmp/_reviews_errors/` folder

**New folder, created lazily on first use.** Contains:
- `error-logs.md` — append-only, human-readable
- Intermediary review outputs (JSON) prefixed with run-id
- No automatic cleanup; user manages manually

### `error-logs.md` format

Append-only, one entry per incident:

```
[YYYY-MM-DD HH:MM:SS] <run_id> <Error|Warning>  <human-readable description with spec name, stage, outcome, and any relevant commit hashes>
```

Examples:

```
[2026-04-11 15:02:33] k3m9p2q7_a1b2c3d4 Warning  spec1.md: agent i phase 2 endless loop at iter 2, 3 criticals remaining, committed wip, skipped spec
[2026-04-11 15:10:17] k3m9p2q7_e5f6g7h8 Error    spec1.md: agent ii implement crashed twice, halting pipeline, wip committed at hash7f2a
```

### Run-id double-hash convention

**Why:** Multiple agents write to shared tmp files. Without scoping, concurrent or re-invoked agents clobber each other's output, and debugging is a nightmare. A double-hash run-id prefix makes every artifact traceable, concurrency-safe, and resilient to retries.

**Format:** `{spec_hash}_{dispatch_hash}` — each 8-char base36.
Example: `k3m9p2q7_a1b2c3d4-review-doc-phase1.json`

**Why double hash:**
- `spec_hash` gives per-spec grouping — `ls tmp/_reviews_errors/k3m9p2q7_*` shows all artifacts for that spec's pipeline
- `dispatch_hash` gives per-dispatch uniqueness — retries produce a fresh dispatch_hash so you can diff the two attempts

**Generation rules:**
- `spec_hash`: generated once when orchestrate auto mode begins the pipeline for a spec. Shared across all stages and iterations within that spec's pipeline.
- `dispatch_hash`: generated fresh for every individual agent dispatch. Retries (per Q3 retry-once rule) get a new dispatch_hash.

**Propagation:** every agent dispatch includes the run-id in its prompt context:
> "You are agent `<name>` for run `<run_id>`. Write your output to `tmp/_reviews_errors/<run_id>-<artifact>.json`."

**File layout example:**

```
tmp/_reviews_errors/
├── error-logs.md                                           # global append-only log
├── k3m9p2q7_a1b2c3d4-review-doc-phase1.json                # spec1 agent i phase 1
├── k3m9p2q7_e5f6g7h8-review-doc-phase2.json                # spec1 agent i phase 2
├── k3m9p2q7_i9j0k1l2-review-code-iter1.json                # spec1 agent iii iter 1
├── k3m9p2q7_m3n4o5p6-review-code-iter2.json                # spec1 agent iii iter 2
├── b7n4x1y8_q7r8s9t0-review-doc-phase1.json                # spec2 agent i phase 1
└── ...
```

**Standalone usage (no `--run-id`):** skills default to the un-prefixed filename (e.g. `review-doc.json`). Backward-compatible — standalone invocations still work as today and do not create run-id-prefixed files.

---

## Failure Handling

All failure-handling logic lives under `references/auto/failure-handling/` and loads only when a failure fires.

### Q2 — Endless-loop failure (iteration limit hit)

**Trigger:** the configured `--max-iterations` is exhausted without convergence.

**Measurement rule (option Y):** criticals are counted at the final iteration's REVIEW output, BEFORE that iteration's fix phase runs. The fix phase always runs regardless (so the user gets whatever progress the fixer can make on the last pass).

- **≤1 critical remaining** → acceptable, treat as success, continue pipeline normally
- **>1 criticals remaining** → endless-loop failure:
  1. Commit wip: `wip(auto): <spec>: <spec-review|code-review> endless-loop at iter <N> — see tmp/_reviews_errors/error-logs.md`
  2. Append the unresolved criticals to the spec file itself (so user can review post-run)
  3. Log a Warning to `tmp/_reviews_errors/error-logs.md`
  4. Mark spec `skipped-endless-loop` in `auto-state.md`
  5. Continue to next spec

Applies symmetrically to agent i (spec-review, text artifacts) and agent iii (code-review, code artifacts).

### Q3 — Crash handling (stage-differentiated, retry-once)

**Retry-once rule:** On any agent crash, dispatch the same agent once more with identical inputs (fresh `dispatch_hash`). If retry succeeds, continue normally.

**If retry also fails:**

| Stage | Response | Rationale |
|---|---|---|
| Agent i (spec-review) | Skip spec + continue, no commit, log Error | Text artifacts are inert; spec file left as-is |
| Agent ii (implement) | Commit wip + **HALT pipeline**, log Error | Uncommitted broken code could contaminate downstream specs; halt is the safe default |
| Agent iii (code-review) iter 1 | Soft reset to `implement_head` + stash + skip + continue | Implement work preserved; only the failed iter 1 attempt is rewound |
| Agent iii (code-review) iter N>1 | Soft reset to `last_iteration_head` + stash + skip + continue | All successful iterations preserved; only failed iter N rewound |

**Key invariants:**
- `git reset --hard` is NOT used anywhere in auto mode
- All rewinds use `git reset --soft` + `git stash push --include-untracked`
- Crashed work is always preserved (stash list or reflog)
- Implement crash halts the whole pipeline; other stage crashes skip the current spec

### Rollback mechanism (non-destructive)

```bash
# Never destructive — uses soft reset + stash
git reset --soft <rollback_target>
git stash push --include-untracked \
  -m "wip(auto): <spec> <stage> iter <N> crashed"
```

After: HEAD = rollback_target, working tree clean, crashed work preserved in a named stash entry.

User can inspect with:
```bash
git stash list
git stash show -p stash@{0}
git stash pop          # recover if desired
```

### Unusable-output handling (asymmetric policy)

Agent dispatches can return "successfully" but produce wrong-shaped output (malformed JSON, missing commits, empty issue lists). Policy varies by stage based on downstream consequences:

| Stage | Policy | Rationale |
|---|---|---|
| **Agent i** (review-doc phase 1 & 2) | Optimistic trust | Text artifacts. Downstream implement agent reads the spec on disk, not the review JSON — bad review JSON doesn't corrupt anything. |
| **Agent ii** (implement) | Strict validation → crash on failure | Implement output is load-bearing. Bad commits or missing commits leave disk state inconsistent for review-code and downstream specs. This is the one stage where optimism is dangerous. |
| **Agent iii** (code-review loop) | Optimistic trust | If iter N produces garbage, iter N+1 re-reads git state from scratch. Endless-loop cap (4 iters) bounds the downside. |

**Agent ii validators** (run after implement returns, before advancing to agent iii):
1. At least one commit made since `spec_baseline` — `git rev-list --count spec_baseline..HEAD > 0`
2. Spec file still exists (implement must not delete its input)
3. Working tree is clean or has only expected artifacts — no random partial edits sitting uncommitted

**On validator failure:** retry once (Q3 crash path). If retry fails, halt pipeline per Q3 crash-implement rule.

**"Optimistic trust" operational definition for agents i and iii:**
- Orchestrate does NOT validate review JSON for agents i and iii
- If the file is missing or malformed, orchestrate treats it as "no criticals" and advances
- Residual criticals are caught by the next iteration (agent iii loop) or by agent iii (after agent i)
- No retry, no crash, no error log
- **Exception:** if agent iii's final-iter (iter 4) JSON is unreadable, orchestrate cannot evaluate the Q2 endless-loop check. Assume critical count = 0 and continue (fail open, not closed).

---

## Commit Cadence

### Auto mode — structurally required

Commits in auto mode are load-bearing for rollback anchors. The cadence is not discretionary.

| Event | Commit? | Template | Hash update |
|---|---|---|---|
| Before agent i starts | — | — | `spec_baseline = HEAD` (no new commit) |
| After agent i phase 1 | if spec changed | `chore(auto): <spec-slug>: spec review phase 1 fixes` | — |
| After agent i phase 2 | if spec changed | `chore(auto): <spec-slug>: spec review phase 2 fixes` | — |
| During agent ii (implement) | yes, via executing-plans TDD cycle | (implement's own commits) | — |
| After agent ii validators pass | — | — | `implement_head = HEAD` (no new commit) |
| After each agent iii iter (1..N) | **required invariant** | `fix(auto): <spec-slug>: code-review iter <N> — address findings` | `last_iteration_head = HEAD` |
| Stage iv verification | if anything changed | `chore(auto): <spec-slug>: verification fixes` | — |

**Notes:**
- Phase 1 / phase 2 / verification commits are conditional — skip if the fixer made zero changes. No empty commits.
- Implement itself produces commits internally. Orchestrate does NOT add a checkpoint on top; it relies on the agent ii validators (`git rev-list --count spec_baseline..HEAD > 0`) to confirm commits happened. Validator failure → crash per Q3.
- The per-iteration commit after agent iii is the one non-optional invariant — it's load-bearing for the `last_iteration_head` rollback anchor.

### Standard mode — Option Z (user-driven with breadcrumb nudges)

Standard mode never runs `git commit` itself. Instead:

- The entire `Auto-Commit Verification` remediation section is deleted from standard mode
- The three `post-*-checkpoint` templates (`post-implement`, `post-review-code`, `post-finalize`) are deleted
- Step-boundary breadcrumbs include `/commit` as the first suggestion line when a step produced changes
- Breadcrumbs remain commands-only, one per line, no labels/descriptions/headers

Standard mode becomes **read-only on git state** — it only reads `git log` for Fast-Path Detection, never writes commits. Auto mode is the only mode that writes commits.

**Asymmetry is principled:** auto mode's cadence is structurally required (rollback anchors depend on it); standard mode's cadence is user preference (convenience). Bundling them under one behavior would either over-commit standard mode or under-commit auto mode.

---

## Rollout Plan — Approach C (two PRs)

Approach C groups changes by coupling, not by skill.

### PR 1 — Cross-cutting infrastructure + sub-skill refactors

All four sub-skills move as one unit because run-id threading must be consistent across them.

**Contents:**
- `tmp/_reviews_errors/` folder + `error-logs.md` schema
- Run-id double-hash convention (`{spec_hash}_{dispatch_hash}`)
- review-doc refactor — new flags (`--model`, `--fact-check`, `--max-iterations`, `--run-id`), simplified loop, remove `--min-model`/`--max-model`
- review-code widening — accept git ref in addition to count, `--run-id`
- implement `--auto` flag — narrowed 2-option algorithm, threshold 35%, `--run-id` threading

**Scope of changes:**
- `ai-dev-tools/skills/review-doc/SKILL.md` and references
- `ai-dev-tools/skills/review-code/SKILL.md` and references
- `ai-dev-tools/skills/implement/SKILL.md` and `references/implementation-step.md`
- New infrastructure references for `tmp/_reviews_errors/` schema

**Rationale for bundling:** none of these sub-skills have non-orchestrate heavy users today, so merging them in isolation gives near-zero production value. The four are coupled via run-id and share a new output directory. Separating them would create a window where some skills know about `tmp/_reviews_errors/` and others don't.

### PR 2 — Orchestrate overhaul (assumes PR 1 has landed)

**Contents:**
- Lean SKILL.md rewrite (~150–180 lines) with progressive disclosure
- New `references/` tree (common/standard/auto subdirs)
- Standard mode cleanup:
  - Remove `--strict` flag
  - Remove Step 0 (Context Health Check)
  - Remove Step 8 (Structured Completion / git branch flow)
  - Remove ADR extraction prelude from Step 4 (Step 4 itself kept)
  - Remove Auto-Commit Verification remediation
  - Add `/commit` breadcrumb suggestions
- Standard mode new flags:
  - `--use-roadmap` for refactor-unit routing (gated, default off)
- Auto mode pipeline (new):
  - `--auto` flag with positional spec args
  - 4-stage pipeline (agent i two-phase, agent ii implement, agent iii code-review loop, stage iv verification)
  - `tmp/auto-state.md` three-hash model
  - Concise progress logging (no breadcrumbs)
  - Failure handling (Q2, Q3, rollback mechanism, unusable-output asymmetry)
- Hard-error flag combinations (`--handoff + --auto`, `--use-roadmap + --auto`)

**Scope of changes:**
- `ai-dev-tools/skills/orchestrate/SKILL.md`
- `ai-dev-tools/skills/orchestrate/references/` (all new)

PR 2 invokes the new sub-skill interfaces without transitional flags because PR 1 is already live. There is no backward-compat shim layer.

### Rejected sequencing options

- **Approach A (five separate PRs, bottom-up)** — each sub-skill merged independently, then orchestrate. Rejected because sub-skills carry transitional dead code (`--run-id` with no caller) until PR 5; five review cycles; near-zero intermediate value since none of the sub-skills have non-orchestrate heavy users.
- **Approach B (one big PR)** — everything in one diff. Rejected because the diff is too large to review effectively, risk isolation is lost, and one broken piece blocks the whole thing.

---

## Files Created / Modified

### New files

**orchestrate progressive disclosure (PR 2):**
- `ai-dev-tools/skills/orchestrate/references/common/help.md`
- `ai-dev-tools/skills/orchestrate/references/common/error-logs-format.md`
- `ai-dev-tools/skills/orchestrate/references/standard/session-bootstrap.md`
- `ai-dev-tools/skills/orchestrate/references/standard/hint-file-protocol.md`
- `ai-dev-tools/skills/orchestrate/references/standard/fast-path-detection.md`
- `ai-dev-tools/skills/orchestrate/references/standard/user-prompt.md`
- `ai-dev-tools/skills/orchestrate/references/standard/session-handoff.md`
- `ai-dev-tools/skills/orchestrate/references/standard/refactor-roadmap-check.md`
- `ai-dev-tools/skills/orchestrate/references/standard/steps/step-1.md` through `step-7.md` (7 files, one per kept step)
- `ai-dev-tools/skills/orchestrate/references/auto/pipeline-overview.md`
- `ai-dev-tools/skills/orchestrate/references/auto/auto-state-schema.md`
- `ai-dev-tools/skills/orchestrate/references/auto/stages/agent-i-spec-review.md`
- `ai-dev-tools/skills/orchestrate/references/auto/stages/agent-ii-implement.md`
- `ai-dev-tools/skills/orchestrate/references/auto/stages/agent-iii-code-review.md`
- `ai-dev-tools/skills/orchestrate/references/auto/stages/stage-iv-verification-gate.md`
- `ai-dev-tools/skills/orchestrate/references/auto/failure-handling/overview.md`
- `ai-dev-tools/skills/orchestrate/references/auto/failure-handling/retry-semantics.md`
- `ai-dev-tools/skills/orchestrate/references/auto/failure-handling/endless-loop.md`
- `ai-dev-tools/skills/orchestrate/references/auto/failure-handling/crash-text-stage.md`
- `ai-dev-tools/skills/orchestrate/references/auto/failure-handling/crash-implement.md`
- `ai-dev-tools/skills/orchestrate/references/auto/failure-handling/crash-code-review.md`
- `ai-dev-tools/skills/orchestrate/references/auto/failure-handling/rollback-mechanism.md`
- `ai-dev-tools/skills/orchestrate/references/auto/failure-handling/error-log-templates.md`

**Cross-cutting (PR 1):**
- `tmp/_reviews_errors/` folder (created lazily on first use, not in repo)

### Modified files

**PR 1:**
- `ai-dev-tools/skills/review-doc/SKILL.md` — new flags, simplified loop, remove `--min-model`/`--max-model`, `--run-id` support, output to `tmp/_reviews_errors/`
- `ai-dev-tools/skills/review-doc/references/*` — update references to match new interface
- `ai-dev-tools/skills/review-code/SKILL.md` — accept git ref, add `--run-id`, output to `tmp/_reviews_errors/`
- `ai-dev-tools/skills/review-code/references/*` — update references
- `ai-dev-tools/skills/implement/SKILL.md` — parse `--auto` flag, narrow dispatch options, add `--run-id` threading
- `ai-dev-tools/skills/implement/references/implementation-step.md` — threshold 30% → 35%, auto-mode note

**PR 2:**
- `ai-dev-tools/skills/orchestrate/SKILL.md` — wholesale rewrite to lean router (~150–180 lines)

### Deleted from orchestrate SKILL.md (PR 2)

- `--strict` flag and all strict-mode code paths
- Step 0 (Context Health Check) and its supporting machinery
- Step 8 (Structured Completion / git branch flow)
- ADR extraction prelude block inside Step 4 (Step 4 itself kept — it remains Write Plan)
- Auto-Commit Verification section and `post-*-checkpoint` templates
- Auto-load of `tmp/session-handoff.md` (moved behind `--handoff`)

---

## Out of Scope / Future Work

- **ADR extraction and documentation generation** — the ADR extraction prelude currently inlined at the start of Step 4 is deleted entirely. A future release will handle documentation extraction holistically (candidates: structured ADR skill, automated changelog extraction, spec-to-doc pipeline).
- **Cross-session auto-mode resume** — if `/orchestrate --auto` is interrupted mid-pipeline, there is no resume mechanism; the user re-invokes with remaining specs. Resume-across-sessions is deferred.
- **Parallel spec processing** — specs are processed serially in auto mode. Parallel processing would require a much more complex state model and is deferred.
- **Test infrastructure integration** — this project has no test suite; stage iv verification is effectively a no-op. When tests are added to the project, stage iv becomes meaningful.
- **`writing-plans` integration with auto mode** — explicitly removed for the reasons above. If downstream experience shows that specs entering auto mode benefit from a plan stage, it can be added back as a conditional stage i.5 in a future release.

---

## Summary

- **10 design sections**, every decision traced to the brainstorm file (`tmp/orchestrate-overhaul-brainstorm.md`), every Q1–Q12 resolved.
- **Two PRs** (Approach C): cross-cutting infrastructure + four sub-skill refactors land together; orchestrate overhaul lands second.
- **Non-goals explicit:** no parallel specs, no cross-session auto-resume, no test infrastructure, no ADR extraction — all deferred.

**Decisions taken:** two modes only (standard default, `--auto` new); `--strict` removed entirely; progressive disclosure for SKILL.md; 4-stage auto pipeline (spec-review two-phase → implement → code-review → verification); no write-plan stage; `/implement --auto` narrowed to `{single, parallel 1-helper}`; parallelism threshold 30% → 35%; three-hash rollback model (`spec_baseline` / `implement_head` / `last_iteration_head`); non-destructive rollback via `git reset --soft` + stash; asymmetric unusable-output policy (optimistic agents i/iii, strict agent ii); Option Y critical measurement at REVIEW output; Option Z standard-mode commit cadence with `/commit` breadcrumbs; run-id double-hash `{spec_hash}_{dispatch_hash}`; `tmp/_reviews_errors/` shared directory; hard errors for `--handoff + --auto` and `--use-roadmap + --auto`.
