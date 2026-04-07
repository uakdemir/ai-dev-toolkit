---
name: implement
description: "Use when the user wants to execute a written implementation plan or implement directly from a spec — generates a task graph, recommends an execution model, and dispatches with quality overrides. Invoked standalone (/implement <path>) or via orchestrate (/orchestrate (/implement <plan>))."
---

<help-text>
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
</help-text>

Parse arguments: if `--help` is present, output ONLY the text inside `<help-text>` tags above verbatim and exit. If `--model` is present, validate its value against the set `{single, subagent, parallel}` — reject `clear-context` with the exact error from Edge Case 7 below. If `--skip-plan-recommendation` is present, suppress the Step C spec recommendation prompt for this invocation only (see Step C).

# implement

Execute a written implementation plan or implement directly from a spec. `/implement` owns plan/spec detection, task-graph construction, execution-model recommendation, the 4-option dispatch picker, and the refactor-unit branch. It is **stateless** with respect to `tmp/orchestrate-state.md` — it READS the hint file in Step A but NEVER writes it. Orchestrate is the sole writer of the hint file.

---

## Step A — Path Resolution

1. If positional `path` argument was provided → use it. Go to Step A.5.
2. Else read `tmp/orchestrate-state.md`. If the `plan:` field is non-empty → use it. Go to Step A.5.
3. Else read `tmp/orchestrate-state.md`. If the `spec:` field is non-empty → use it. Go to Step A.5.
4. Else print this error and exit:
   ```
   No path argument and no active plan/spec in orchestrate hint file. Specify a path or run /orchestrate first.
   ```
5. **Existence check:** verify the resolved path points to a real file. If not, print `File not found: <path>` and exit (Edge Case 2). Exception: if path came from the hint file `plan:` field and the file does not exist, fall through to step 3 (hint file `spec:` field) before erroring (Edge Case 3).

The order **positional → plan → spec** matters. When both `plan:` and `spec:` are populated (the normal case after `/writing-plans` ran on a spec), prefer the more-recently-written plan.

---

## Step B — Plan vs Spec Detection (location-first)

1. **Location check:** If the resolved path matches `docs/superpowers/plans/**` OR `docs/plans/**` → classify as **plan**, go to Step C.
2. **Location check:** If the resolved path matches `docs/superpowers/specs/**` OR `docs/specs/**` → classify as **spec**, go to Step C.
3. **Content fallback** (for ad-hoc files such as `tmp/foo.md` where location is ambiguous): grep the file for content markers.
   - Plan markers: `## Phase`, `## Task`, `### Step`
   - Spec markers: `## Architecture`, `## Components`, `## Data Flow`
   - **Tiebreaker:** If both plan and spec markers are found, classify as **plan** (plan markers are more distinctive and less likely to appear incidentally in spec files). Require a minimum of **2** plan markers total to classify as plan; a single `### Step` hit alone is insufficient.
4. If neither location nor content resolves the classification → print `Cannot classify <path> as plan or spec. Location is ambiguous and no marker match.` and exit.

Location-first detection covers >95% of cases. The content fallback only fires for ad-hoc files in `tmp/`.

---

## Step C — Branch on Plan vs Spec

### If **plan** detected

Proceed directly to Step D with the plan path.

### If **spec** detected

Run the **Spec Recommendation Algorithm**. This is **skip-by-default**: most specs do not need a separate plan. Only recommend `/writing-plans` if at least one of three **hard signals** fires:

| Hard signal | Detection |
|---|---|
| Multi-component spec | Spec mentions ≥3 distinct files/modules to create or modify (scan `## Files Modified / Created` tables or "Create:" bullets) |
| Cross-cutting concern | Spec mentions database migration AND code change AND test change in the same document |
| Explicit phase markers | Spec already contains `## Phase 1`, `## Phase 2` (treat as proto-plan) |

**If none of the signals fire** → silently proceed to Step D treating the spec as the implementation source.

**If at least one signal fires** → print this prompt and await user input:

```
This spec has [signal description]. A plan would help you sequence the work.

[1] Recommended: write a plan first
    /writing-plans <spec-path>

[2] Skip the plan, implement directly from the spec
    /implement <spec-path> --skip-plan-recommendation

Pick one to proceed.
```

Then exit. Do not auto-dispatch either option.

**`--skip-plan-recommendation` suppression:** If the flag was passed on the current invocation, skip the hard-signal check entirely and proceed directly to Step D. The flag is a one-shot suppression; it is not persisted.

---

## Step D — Dispatch with Execution Model

### Refactor-Unit Branch Handling (pre-check)

Before building the task graph, perform this refactor-unit check (moved verbatim from the previous `orchestrate/SKILL.md` Step 5):

1. Check if a refactor roadmap exists at `docs/monorepo-strategy/roadmap.md` OR `docs/layer-architecture/roadmap.md` with unchecked items.
2. If so, perform a **case-insensitive substring match** of the feature name against the bold roadmap item labels (text between `**` markers in the checkbox line, not the full rationale). The feature name is derived from:
   - The resolved plan/spec filename (stripped of date prefix and `-plan.md`/`.md` suffix), OR
   - The hint file's `feature:` field when `/implement` was invoked with no positional arg (i.e., via orchestrate)
3. **If the match succeeds → refactor-unit path:**
   - Skip the task graph generation and execution model recommendation (steps 1-2 in the normal-feature path below).
   - Load `references/refactor-execution.md` and execute directly following its **Pre-flight → File Operations → Verification** sequence.
   - Perform the checklist pre-flight surfacing: read `tmp/checklists/index.md` if it exists, filter for rows where Phase is `coding` or `both` AND Recommended Skill contains `refactor-to-monorepo` or `refactor-to-layers`. Surface any matching entries to the user before beginning execution. Note: the `refactor-to-layers` filter branch currently returns empty (no checklist crystallization section) — do not warn on an empty result from that branch.
   - **`--model` flag handling:** The `--model` flag is **ignored** on the refactor-unit path because refactor execution is inherently single-agent. If `--model` was explicitly passed, print `warning: --model ignored for refactor-unit execution` and continue.
   - After the refactor-execution sequence completes, return control to the caller (orchestrate or standalone shell).
4. **If the match fails (normal-feature path) → proceed to the normal-feature dispatch below.**

### Normal-feature path

Load `references/implementation-step.md` (which transitively loads `references/task-graph.md`) and follow its logic:

1. Build the task graph from the plan (per `references/task-graph.md`).
2. Compute the execution model recommendation (per `references/implementation-step.md` Execution Model Recommendation section).
3. **If `--model` flag was provided** → short-circuit the picker, dispatch directly with that model. The preamble block in `implementation-step.md` Override Dispatch section is still prepended.
4. **Else** → present the 4-option dispatch picker exactly as defined in `references/implementation-step.md`:
   ```
   [1] Single-agent <(recommended) if applicable>
   [2] Subagent-per-task <(recommended) if applicable>
   [3] Clear context + single-agent
   [4] Single-agent + one parallel helper <(recommended) if applicable>
   ```
5. **If user picks Option [3] (clear-context) → early-exit path:**
   - **Write the marker file** `tmp/implement-exit-status.md` with the following exact schema (plain key-value, one per line, NOT YAML frontmatter):
     ```
     early_exit: clear_context
     exit_reason: user picked option [3] at execution model picker
     exit_time: <ISO-8601 timestamp>
     plan_or_spec: <absolute path that /implement was invoked with>
     ```
     `early_exit` is the required discriminator. Orchestrate matches on the literal value `clear_context`. The other three fields are informational.
   - Print the breadcrumb:
     ```
     ── Next ────────────────────────────────────────
     /clear → /implement <path> --model single
     ────────────────────────────────────────────────
     ```
     The `--model single` is explicit so that on re-entry after `/clear`, the picker is bypassed regardless of whether the user edits the command before pasting.
   - Exit. Do NOT dispatch.
6. **Else** dispatch the chosen execution model with the appropriate override preamble from `references/implementation-step.md` Override Dispatch section.

### Default Model Selection

When `--model` is not passed and the picker is not presented (e.g., `/implement` invoked standalone without arguments, no picker interaction occurs), the default execution model is **single** (single-agent in current context). Override explicitly with `--model single|subagent|parallel`.

---

## Return Contract with Orchestrate

When `/implement` is invoked via orchestrate (breadcrumb `/orchestrate (/implement <plan>)`), orchestrate resumes control after `/implement` returns. Orchestrate's post-`/implement` logic (defined in spec 04) runs auto-commit verification, writes `step: 6` to the hint file, and emits the Step 5 → Step 6 breadcrumb — BUT ONLY on normal completion. Option [3] clear-context is an **early exit** before any implementation has run, and orchestrate must NOT run post-`/implement` logic in that case.

`/implement` signals early-exit to orchestrate via the marker file `tmp/implement-exit-status.md` described in Step D.5 above.

**Marker file lifecycle (canonical definition — spec 04 references this section):**

- **Location:** Always `tmp/implement-exit-status.md` (plain file, not YAML frontmatter).
- **Written by:** `/implement` ONLY, and ONLY on Option [3] clear-context exit.
- **Read by:** orchestrate Step 5 post-`/implement` logic (spec 04 wires this in).
- **Deleted by:** orchestrate as part of its post-`/implement` resume.
- **When to write:** Option [3] exit ONLY.
- **When NOT to write:**
  - Normal dispatch completion (Options [1], [2], [4]) — orchestrate's normal resume path applies.
  - `--model single|subagent|parallel` dispatch returning control after implementation — normal resume.
  - Refactor-unit path returning after `refactor-execution.md` completes — normal resume.
  - Error exits from path-resolution or plan-not-found — orchestrate's existing error-handling path applies; marker is unnecessary.
- **Unknown-field tolerance:** The `early_exit:` field is the sole load-bearing discriminator. Orchestrate MUST NOT ignore the marker because of unknown or missing informational fields.

---

## State Synchronization Rules

**Only orchestrate writes the hint file.** `/implement` is stateless with respect to `tmp/orchestrate-state.md`:
- Reads the hint file (Step A path resolution) but never writes it.
- The orchestrate wrapper that invoked `/implement` is responsible for advancing the `step:` field after `/implement` returns.
- Standalone invocations (not via orchestrate) leave the hint file untouched.

---

## Edge Cases

1. **Both `path` arg and hint file populated** — `path` arg wins (Step A.1).
2. **`path` arg points to a nonexistent file** — Print `File not found: <path>` and exit.
3. **Hint file `plan:` field points to nonexistent file but `spec:` field is valid** — Fall through to `spec:` (Step A.3). Do not error on plan-not-found if spec is available.
4. **Spec has `## Phase 1` but only one phase** — Hard signal triggers, recommendation prompt shows. (Refine the threshold later if this is too aggressive.)
5. **Plan file has zero actionable tasks** — Task graph is empty; print `Plan contains no actionable tasks. Nothing to implement.` and exit.
6. **`--model parallel` requested but plan has no parallelizable tasks** — Print `--model parallel requested but plan tasks have linear dependencies; falling back to subagent-per-task.` and continue with subagent-per-task dispatch.
7. **`--model clear-context` passed** — **NOT a valid value.** Reject with: `--model clear-context is not supported; clear-context is dispatch-only. Omit --model and choose option [3] from the picker.` and exit.
8. **Spec recommendation prompt declined repeatedly** — User passes `--skip-plan-recommendation` once per invocation; not persisted.
9. **Plan and spec both in `tmp/`** — Location detection ambiguous; content fallback decides. If still ambiguous, error per Step B.4.
10. **Plan written by `/writing-plans` mid-orchestrate, then `/implement` invoked standalone with no path** — Hint file's `plan:` field has the freshly-written plan. Step A picks it up. Works.
11. **Concurrent orchestrate sessions writing different plans to the hint file** — Out of scope. Single-session assumption.
12. **Spec with no hard signals AND user wants a plan anyway** — User manually runs `/writing-plans <spec>` first; `/implement` is not a hard gate.
13. **Hint still says `step: 5` after standalone `/implement` completes from the clear-context path** — Expected. `/implement` is stateless. User re-invokes `/orchestrate` to resume; Fast-Path Detection advances to Step 6 automatically via commit detection.
