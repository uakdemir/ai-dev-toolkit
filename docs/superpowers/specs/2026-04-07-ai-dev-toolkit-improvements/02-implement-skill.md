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
- Move `implementation-step.md`, `task-graph.md`, AND `refactor-execution.md` from `orchestrate/references/` to `implement/references/` (refactor-unit handling moves into `/implement` along with the normal-feature path — see "Refactor-Unit Branch Handling" below)
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
| `ai-dev-tools/skills/implement/references/refactor-execution.md` | **MOVE** from `orchestrate/references/refactor-execution.md` |
| `ai-dev-tools/skills/orchestrate/SKILL.md` | **EDIT** — Step 5 becomes delegating wrapper; Conditional Loading section drops the `implementation-step.md` reference AND the `refactor-execution.md` reference block (`task-graph.md` was only loaded transitively by `implementation-step.md` and is not directly referenced in `orchestrate/SKILL.md`) |
| `ai-dev-tools/skills/orchestrate/references/implementation-step.md` | **DELETE** (moved) |
| `ai-dev-tools/skills/orchestrate/references/task-graph.md` | **DELETE** (moved) |
| `ai-dev-tools/skills/orchestrate/references/refactor-execution.md` | **DELETE** (moved) |

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
   - **Tiebreaker:** If both plan and spec markers are found, classify as plan (plan markers are more distinctive and less likely to appear incidentally in spec files). Require a minimum of 2 plan markers to classify as plan; a single `### Step` hit alone is insufficient.
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

#### Refactor-Unit Branch Handling (pre-check)

Before building the task graph, `/implement` performs a refactor-unit check identical to the one that orchestrate Step 5 does today:

1. Check if a refactor roadmap exists (`docs/monorepo-strategy/roadmap.md` or `docs/layer-architecture/roadmap.md`) with unchecked items.
2. If so, perform a case-insensitive substring match of the feature name (from the resolved plan/spec filename, or from the hint file's `feature:` field when invoked via orchestrate) against the bold roadmap item labels (text between `**` markers in the checkbox line, not the full rationale).
3. **If the match succeeds → refactor-unit path:**
   - Skip the task graph generation (step 1 below) and the execution model recommendation (step 2 below).
   - Load `references/refactor-execution.md` and execute directly following its Pre-flight → File Operations → Verification sequence.
   - Perform the checklist pre-flight surfacing (`tmp/checklists/index.md` filter for `refactor-to-monorepo` or `refactor-to-layers` rows) per the rules previously documented in `orchestrate/SKILL.md` Conditional Loading section.
   - `--model` flag is **ignored** on the refactor-unit path (refactor execution is inherently single-agent). If `--model` is explicitly passed, print `"warning: --model ignored for refactor-unit execution"` and continue.
   - After the refactor-execution sequence completes, return control to the caller (orchestrate or standalone shell).
4. **If the match fails (normal-feature path) → proceed to steps 1-6 below:**

#### Normal-feature path

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
5. If user picks Option [3] (clear-context) → **write the early-exit marker file `tmp/implement-exit-status.md` with `early_exit: clear_context` (see Return Contract with Orchestrate below for the full schema), then** print the exit message with the `/clear → /implement <path> --model single` breadcrumb and exit (do not dispatch). The breadcrumb includes `--model single` explicitly so that on re-entry after `/clear`, the picker is bypassed regardless of whether the user edits the command before pasting. If the user removes `--model` from the breadcrumb before pasting, the re-invocation falls back to the default model selection defined below. The marker file exists solely to signal this early exit to orchestrate so it doesn't stomp on the clear-context breadcrumb; see Return Contract with Orchestrate for orchestrate-side handling.
6. Else dispatch the chosen execution model with the appropriate override preamble

### Default Model Selection

When `--model` is not passed and the picker is not presented (e.g., when `/implement` is invoked standalone without explicit arguments and no picker interaction occurs), the default execution model is **single** (single-agent in current context). Override explicitly with `--model single`, `--model subagent`, or `--model parallel`. (`--model clear-context` is not a valid value — see Edge Case 7.)

### Return Contract with Orchestrate

When `/implement` is invoked via orchestrate (wrapped breadcrumb: `/orchestrate (/implement <plan>)`), orchestrate resumes control after `/implement` returns and runs its post-implement logic (auto-commit verification, `step: 6` hint-file write, Step 5 → Step 6 breadcrumb emission — all defined in spec 04). But not every return path from `/implement` is a normal completion — the **Option [3] clear-context path** exits *early*, before any implementation has run, and expects the user to re-invoke `/implement` in a fresh context. If orchestrate treated that early exit like a normal completion, it would run auto-commit verification against an unchanged tree, overwrite the hint file with `step: 6`, and emit its own Step 5 → Step 6 breadcrumb — stomping on `/implement`'s `/clear → /implement <path> --model single` breadcrumb.

To prevent this, `/implement` signals early-exit to orchestrate via a **marker file**:

**Marker file: `tmp/implement-exit-status.md`**

- **Location:** Always `tmp/implement-exit-status.md` (plain file, not YAML frontmatter).
- **Written by:** `/implement` only.
- **Read by:** orchestrate Step 5 post-`/implement` logic (see spec 04 for details).
- **Lifecycle:** `/implement` writes the marker **immediately before** exiting via Option [3] (clear-context dispatch). Orchestrate reads and **deletes** the marker as part of its post-`/implement` resume sequence. If the marker is absent when orchestrate resumes, normal-completion logic runs (the default).
- **Schema (plain key-value, one per line):**
  ```
  early_exit: clear_context
  exit_reason: user picked option [3] at execution model picker
  exit_time: <ISO-8601 timestamp>
  plan_or_spec: <absolute path that /implement was invoked with>
  ```
  `early_exit` is the required discriminator; orchestrate matches on the literal value `clear_context`. The other three fields are informational. Unknown or missing fields MUST NOT cause orchestrate to ignore the marker — only the `early_exit:` field is load-bearing.
- **When to write the marker:** Only on Option [3] clear-context exit. **Do NOT** write it on:
  - Normal dispatch completion (Options [1], [2], [4]) — orchestrate's normal resume path applies.
  - `--model single|subagent|parallel` dispatch returning control after implementation completes — normal resume.
  - Refactor-unit path returning after `refactor-execution.md` completes — normal resume.
  - Error exits from path-resolution or plan-not-found errors — orchestrate's existing error-handling path applies; marker is unnecessary.

**Orchestrate-side behavior (canonical definition lives here; spec 04 references this section):** After `/implement` returns, orchestrate MUST:
1. Check if `tmp/implement-exit-status.md` exists.
2. If **yes** and `early_exit: clear_context`:
   - **Skip** auto-commit verification.
   - **Do NOT** write `step: 6` to the hint file (hint stays at `step: 5`).
   - **Do NOT** emit the Step 5 → Step 6 breadcrumb.
   - Delete the marker file (cleanup).
   - Return control to the user — `/implement`'s `/clear → /implement <path> --model single` breadcrumb is already the last line of output; orchestrate does not append anything after it.
3. If **no** (normal completion): run the standard post-`/implement` sequence (spec 04 Step 5 post-`/implement`): auto-commit → write `step: 6` → emit Step 5 → Step 6 breadcrumb.

**Cross-reference:** Spec 04 Step 5 post-`/implement` must call the marker-file check defined above before running auto-commit verification. Spec 02 is the canonical definition of the marker schema, lifecycle, and when-to-write rules; spec 04 only references this section and wires the check into its Step 5 post-`/implement` rewrite. Implementer of spec 04: see spec 04 Step 5 post-`/implement` rewrite for the explicit call-site.

## Orchestrate Step 5 Changes

Step 5 in `orchestrate/SKILL.md` is rewritten as a **delegating wrapper**:

**Before:** ~90 lines of inline plan/spec detection + task graph + execution model dispatch, plus a mutually exclusive refactor-unit branch that skipped execution model selection and executed directly via `refactor-execution.md`.
**After:** ~10 lines that:
1. Read `plan:` field from hint file
2. If the `plan:` field is empty or the plan file does not exist, emit an error breadcrumb: `"No plan found for the current feature. Run /writing-plans <spec> first to produce a plan, then re-invoke orchestrate."` and route the user back to Step 4.
3. Emit breadcrumb: `/orchestrate (/implement <plan-path>)` (or `--strict` form per Item 03)
4. Exit

**Both branches (normal-feature AND refactor-unit) are removed from orchestrate.** `/implement` inherits both paths via its Step D: the Refactor-Unit Branch Handling pre-check (see Step D above) decides which path to run after it resolves the feature name from the hint file or the plan/spec filename. Specifically, the existing orchestrate Step 5 inline text in `orchestrate/SKILL.md` (around lines 284 at time of writing) — "If the current feature is a refactor unit (matched via roadmap check): skip execution model selection, execute directly using `references/refactor-execution.md`..." — is deleted as part of this rewrite. The roadmap detection, `refactor-execution.md` load, and checklist pre-flight surfacing all move into `/implement` Step D's Refactor-Unit Branch Handling subsection.

The orchestrate state machine still owns the **transitions** (Step 4 → Step 5 → Step 6). It no longer owns the **execution** of Step 5 — that's `/implement`'s job.

### Conditional Loading section

Update `orchestrate/SKILL.md` Conditional Loading section (around lines 230-248) to **remove two blocks**:

1. The `implementation-step.md` reference block (around lines 230-232). `task-graph.md` was never directly referenced by `orchestrate/SKILL.md` — it was loaded transitively from inside `implementation-step.md`, which now lives under `implement/references/`.
2. The entire `refactor-execution.md` + checklist pre-flight block (around lines 234-248, starting "At Step 5 onset, if a refactor roadmap exists..."). This block is deleted from orchestrate because `/implement` Step D's Refactor-Unit Branch Handling subsection (see above) now owns roadmap detection, `refactor-execution.md` loading, and the `tmp/checklists/index.md` pre-flight surfacing.

All three reference files (`implementation-step.md`, `task-graph.md`, `refactor-execution.md`) are loaded by `/implement` itself. Other Conditional Loading entries unrelated to Step 5 (strict-mode.md, quality-gates.md, etc.) are untouched.

## Hint File Step Transitions

| Orchestrate step | Hint file `step:` field | Breadcrumb emitted |
|---|---|---|
| 4 → 5 | `step: 5` | `/orchestrate (/implement <plan-path>)` |
| 5 (during /implement) | unchanged — /implement doesn't write hint file | n/a |
| 5 → 6 (normal completion) | `step: 6` written by orchestrate when the wrapped `/implement` command completes normally (Options [1], [2], [4], or refactor-unit path) and orchestrate resumes control within the same invocation, following the Wrapped Next-Command Output parsing behavior and the Return Contract with Orchestrate (marker-file check passes as absent or non-clear-context) | `/clear → /orchestrate (/review-code N --against spec --max-iterations 3)` (emitted by orchestrate at the end of Step 5 before exit) |
| 5 → 5 (clear-context early exit) | **unchanged — stays at `step: 5`**. `/implement` exits via Option [3] after writing the `tmp/implement-exit-status.md` marker (`early_exit: clear_context`). Orchestrate reads the marker, skips auto-commit, does NOT write `step: 6`, does NOT emit its own breadcrumb, and deletes the marker. | `/clear → /implement <path> --model single` (emitted by `/implement` itself — orchestrate emits nothing after) |

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
13. **Hint file still says `step: 5` after standalone `/implement` completes from the clear-context path** — When the user picks option `[3]` at Step D, `/implement` exits with the `/clear → /implement <path> --model single` breadcrumb; the user runs `/clear`, then re-invokes `/implement` standalone, which completes the implementation without touching the hint file (per the State Synchronization Rules — `/implement` is stateless w.r.t. the hint file). After this standalone completion, the hint file still says `step: 5`. The user should run `/orchestrate` to resume the cycle — Fast-Path Detection will detect commits since `plan_hash` and advance to Step 6 automatically per the existing Step 5/6 validation rules.

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
