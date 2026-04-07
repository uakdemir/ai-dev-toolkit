# Item 02: New `/implement` skill extracted from orchestrate Step 5

**Date:** 2026-04-07
**Status:** Draft

## Problem

Orchestrate Step 5 today owns:
1. Plan/spec detection
2. Task graph construction (`task-graph.md`)
3. Execution model recommendation (single-agent / subagent-per-task / clear-context / parallel helper)
4. 4-option dispatch with override preambles
5. Conditional loading of `implementation-step.md` references

This is overloaded. Three concrete pain points:
1. **No standalone entry point.** A user with a hand-written plan can't say "just execute it" without going through the full orchestrate state machine.
2. **Hard to maintain.** Step 5's 90-line dispatch logic lives mid-flow in a 430-line state machine, mixed with hint-file write logic and breadcrumb emission.
3. **Re-use is impossible.** Other future skills (e.g., a "redo last step" command) can't reach the implementation logic without copying it.

## Scope

**In scope:**
- Create new skill `ai-dev-tools/skills/implement/`
- Move `implementation-step.md` and `task-graph.md` from `orchestrate/references/` to `implement/references/`
- Define a clean argument signature for `/implement`
- Rewrite orchestrate Step 5 as a delegating wrapper that emits a breadcrumb to `/implement <plan>` instead of dispatching inline

**Out of scope:**
- Changing the task graph algorithm itself
- Changing the execution model recommendation algorithm itself
- Removing override preambles (still needed for the 4 dispatch options)
- A "redo last step" or "/re-implement" skill (future work)

## Files Modified / Created

| File | Action |
|---|---|
| `ai-dev-tools/skills/implement/SKILL.md` | **CREATE** — full new skill |
| `ai-dev-tools/skills/implement/references/implementation-step.md` | **MOVE** from `orchestrate/references/implementation-step.md` |
| `ai-dev-tools/skills/implement/references/task-graph.md` | **MOVE** from `orchestrate/references/task-graph.md` |
| `ai-dev-tools/skills/orchestrate/SKILL.md` | **EDIT** — Step 5 becomes delegating wrapper; Conditional Loading section drops the two moved files |
| `ai-dev-tools/skills/orchestrate/references/implementation-step.md` | **DELETE** (moved) |
| `ai-dev-tools/skills/orchestrate/references/task-graph.md` | **DELETE** (moved) |

## Argument Signature

```
/implement [path] [--model single|subagent|parallel] [--help]
```

| Argument | Required | Description |
|---|---|---|
| `path` | optional | Path to a plan file OR a spec file. If omitted, falls back to orchestrate hint file (see Step A) |
| `--model` | optional | Short-circuits the execution model recommendation. Valid values: `single`, `subagent`, `parallel`. **`clear-context` is NOT a valid value** — that option is dispatch-only and always interactive |
| `--help` | optional | Print the help text and exit |

### `--help` output

```
/implement — execute a plan or spec

Usage: /implement [path] [--model single|subagent|parallel]

Arguments:
  path             Plan or spec file to implement. If omitted, uses the
                   active orchestrate plan or spec from tmp/orchestrate-state.md
  --model MODEL    Skip the execution model picker and dispatch directly:
                     single   = single-agent in current context
                     subagent = subagent-per-task
                     parallel = parallel helper agents
                   (clear-context is interactive-only — use the picker)
  --help           Show this help

Examples:
  /implement                                    # use orchestrate hint file
  /implement docs/plans/2026-04-06-foo-plan.md  # explicit plan
  /implement docs/specs/2026-04-06-bar.md       # implement directly from spec
  /implement docs/plans/baz.md --model parallel # skip the picker
```

## Step-by-Step Logic

### Step A — Path Resolution

1. If positional `path` argument was provided → use it
2. Else read `tmp/orchestrate-state.md` and use the `plan:` field if non-empty
3. Else read `tmp/orchestrate-state.md` and use the `spec:` field if non-empty
4. Else print error: `"No path argument and no active plan/spec in orchestrate hint file. Specify a path or run /orchestrate first."` and exit

The order **plan → spec** matters: if both are populated (the normal case after `/writing-plans` ran on a spec), prefer the more-recently-written plan.

### Step B — Plan vs Spec Detection (location-first)

1. **Location check:** If the resolved path matches `docs/superpowers/plans/**` (or `docs/plans/**`) → treat as **plan**
2. **Location check:** If the resolved path matches `docs/superpowers/specs/**` (or `docs/specs/**`) → treat as **spec**
3. **Content fallback:** If location is ambiguous (e.g., `tmp/foo.md`), grep the file for content markers:
   - Plan markers: `## Phase`, `## Task`, `### Step`
   - Spec markers: `## Architecture`, `## Components`, `## Data Flow`
4. If both location and content are ambiguous → print error and exit

Location-first detection covers >95% of cases. The content fallback only fires for ad-hoc files in `tmp/`.

### Step C — Branch on Plan vs Spec

#### If **plan** detected → proceed to Step D directly with the plan path

#### If **spec** detected → run **Spec Recommendation Algorithm** first

The spec recommendation is **skip-by-default**: most specs do not need a separate plan because they're already implementation-ready. Only recommend `/writing-plans` if at least one of three **hard signals** is present:

| Hard signal | Detection |
|---|---|
| Multi-component spec | Spec mentions ≥3 distinct files/modules to create or modify |
| Cross-cutting concern | Spec mentions database migration AND code change AND test change |
| Explicit phase markers | Spec already has `## Phase 1`, `## Phase 2` (treat as proto-plan) |

If **none** of these signals are present → silently proceed to Step D treating the spec as the implementation source.

If **at least one** signal is present → print the spec recommendation prompt:

```
This spec has [signal description]. A plan would help you sequence the work.

[1] Recommended: write a plan first
    /writing-plans <spec-path>

[2] Skip the plan, implement directly from the spec
    /implement <spec-path> --skip-plan-recommendation

Pick one to proceed.
```

The `--skip-plan-recommendation` flag exists ONLY to suppress this prompt on a re-invocation; it's not a public-facing flag.

### Step D — Dispatch with Execution Model

Same as today's `implementation-step.md` reference (which is now under `implement/references/`):

1. Build task graph from plan
2. Recommend execution model based on task count, parallelism, context size
3. If `--model` flag was provided → short-circuit the picker, dispatch directly with that model
4. Else → present the 4-option dispatch picker:
   ```
   [1] Single-agent in current context — recommended for [N tasks, no parallelism]
   [2] Subagent-per-task — recommended for [N tasks with isolated state]
   [3] Clear context + single-agent — recommended for [tight context budget]
   [4] Parallel helper agents — recommended for [N parallelizable tasks]
   ```
5. If user picks Option [3] (clear-context) → print the exit message with the `/clear → /implement <path> --model single` breadcrumb and exit (do not dispatch)
6. Else dispatch the chosen execution model with the appropriate override preamble

## Orchestrate Step 5 Changes

Step 5 in `orchestrate/SKILL.md` is rewritten as a **delegating wrapper**:

**Before:** ~90 lines of inline plan/spec detection + task graph + execution model dispatch
**After:** ~10 lines that:
1. Read `plan:` field from hint file
2. Emit breadcrumb: `/orchestrate (/implement <plan-path>)` (or `--strict` form per Item 03)
3. Exit

The orchestrate state machine still owns the **transitions** (Step 4 → Step 5 → Step 6). It no longer owns the **execution** of Step 5 — that's `/implement`'s job.

### Conditional Loading section

Update `orchestrate/SKILL.md` Conditional Loading section (around line 231-232) to **remove** the two moved files. They're now loaded by `/implement` itself.

## Hint File Step Transitions

| Orchestrate step | Hint file `step:` field | Breadcrumb emitted |
|---|---|---|
| 4 → 5 | `step: 5` | `/orchestrate (/implement <plan-path>)` |
| 5 (during /implement) | unchanged — /implement doesn't write hint file | n/a |
| 5 → 6 | `step: 6` (written by orchestrate when /implement returns) | `/orchestrate (/review-code N)` |

## State Synchronization Rules

**Only orchestrate writes the hint file.** `/implement` is **stateless** with respect to `tmp/orchestrate-state.md`:
- It READS the hint file (in Step A path resolution) but never WRITES to it
- The orchestrate wrapper that called `/implement` is responsible for advancing the `step:` field after `/implement` returns
- This keeps the hint file single-writer and prevents race conditions if `/implement` is invoked standalone

When `/implement` is invoked **standalone** (not via orchestrate), the hint file is left untouched. Standalone invocations do not need orchestrate's flow.

## Edge Cases

1. **Both `path` arg and hint file populated** — `path` arg wins (Step A.1).
2. **`path` arg points to a nonexistent file** — Print `"File not found: <path>"` and exit.
3. **Hint file plan field points to nonexistent file but spec field is valid** — Fall through to spec field (Step A.3). Don't error on plan-not-found if spec is available.
4. **Spec has `## Phase 1` but only one phase** — Hard signal triggers, recommendation prompt shows. (We can refine the threshold later if this is too aggressive.)
5. **Plan file has zero tasks** — Task graph is empty; print `"Plan contains no actionable tasks. Nothing to implement."` and exit.
6. **`--model parallel` requested but plan has no parallelizable tasks** — Print warning `"--model parallel requested but plan tasks have linear dependencies; falling back to subagent-per-task."` and continue.
7. **`--model clear-context`** — **NOT a valid value.** Reject with `"--model clear-context is not supported; clear-context is dispatch-only. Omit --model and choose option [3] from the picker."` Clear-context is interactive-only (it has to print a breadcrumb and exit, which doesn't fit the `--model` short-circuit semantics).
8. **Spec recommendation prompt declined repeatedly** — User passes `--skip-plan-recommendation` once; future invocations of the same spec see the prompt again. (We don't persist the skip — it's a one-shot suppression.)
9. **Plan and spec both in `tmp/`** — Location detection ambiguous; content fallback decides. If still ambiguous, error.
10. **Plan written by `/writing-plans` mid-orchestrate, then `/implement` invoked standalone with no path** — Hint file's `plan:` field has the freshly-written plan. Step A picks it up. Works.
11. **Concurrent orchestrate sessions writing different plans to the hint file** — Out of scope. Single-session assumption holds across the whole toolkit.
12. **Spec with no hard signals AND user wants a plan anyway** — User can manually run `/writing-plans <spec>` first; `/implement` doesn't try to be a hard gate.

## Verification

Per project conventions: no test suite. Manual verification:
1. Run `/implement docs/superpowers/plans/<existing-plan>.md` standalone — confirm task graph + execution model picker fires
2. Run `/implement docs/superpowers/specs/<small-spec>.md` (no hard signals) — confirm it implements directly without prompting for a plan
3. Run `/implement docs/superpowers/specs/<multi-component-spec>.md` (≥3 components) — confirm spec recommendation prompt appears
4. Run `/orchestrate` past Step 4 to Step 5 — confirm orchestrate emits a breadcrumb to `/implement <plan>` instead of dispatching inline
5. Confirm `orchestrate/references/implementation-step.md` and `task-graph.md` no longer exist (moved to `implement/references/`)
6. Run `/implement nonexistent.md` — confirm clean error
7. Run `/implement <plan> --model parallel` on a plan with no parallel tasks — confirm fallback warning

---

**Summary of this spec:**
- New `/implement [path] [--model single|subagent|parallel] [--help]` skill that owns plan/spec detection, task graph, execution model picker, and dispatch
- Path resolution: positional arg → hint file `plan:` field → hint file `spec:` field → error
- Orchestrate Step 5 becomes a 10-line delegating wrapper; the two reference files (`implementation-step.md`, `task-graph.md`) physically move from `orchestrate/references/` to `implement/references/`

**Decisions taken implicitly:**
- `--model clear-context` is **NOT** a valid CLI value. Clear-context remains as picker option [3] only — interactive dispatch, because it has to print a breadcrumb and exit rather than executing the implementation in-process
- Spec recommendation algorithm is **skip-by-default** with three hard signals (multi-component, cross-cutting, explicit phase markers). Most specs go straight to implementation. Let me know if you'd prefer prompt-by-default
- `/implement` is **stateless** w.r.t. the hint file (reads only; orchestrate is the sole writer). This prevents race conditions but means standalone invocations don't update orchestrate's progress
