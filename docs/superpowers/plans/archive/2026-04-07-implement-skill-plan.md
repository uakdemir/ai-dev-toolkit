# /implement Skill Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This project has NO test suite — every "verify" step is a manual re-read or a `/implement --help` probe, never a `pytest`/`jest` invocation.

**Goal:** Extract orchestrate Step 5 into a standalone `/implement` skill that owns plan/spec detection, task-graph generation, execution-model dispatch, and the refactor-unit branch; rewrite orchestrate Step 5 as a ~10-line delegating wrapper that emits a breadcrumb to `/implement <plan>`.

**Architecture:** Physically move three reference files (`implementation-step.md`, `task-graph.md`, `refactor-execution.md`) from `ai-dev-tools/skills/orchestrate/references/` into a new `ai-dev-tools/skills/implement/references/` directory, create a new `ai-dev-tools/skills/implement/SKILL.md` that drives all execution logic, then rewrite orchestrate Step 5 and its Conditional Loading blocks to simply emit `/orchestrate (/implement <plan-path>)`. All four changes (file moves + new SKILL.md + orchestrate rewrites) land in a single commit because the orchestrate delegation references the new file locations — splitting would leave the repo in a broken state mid-commit. Sub-specs 03 and 04 in the same batch depend on this foundation.

**Tech Stack:** Markdown skill files only — these are AI-agent instruction documents, no runtime code. `git mv` for history-preserving file moves.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `ai-dev-tools/skills/implement/SKILL.md` | **CREATE** (~200 lines) | New standalone skill: argument parsing, path resolution (Step A), plan/spec detection (Step B), spec recommendation algorithm (Step C), refactor-unit pre-check + normal-feature dispatch (Step D), Return Contract marker-file writer |
| `ai-dev-tools/skills/implement/references/implementation-step.md` | **MOVE (git mv)** from `ai-dev-tools/skills/orchestrate/references/implementation-step.md` | Task graph visualization, execution model recommendation, 4-option dispatch, override preambles |
| `ai-dev-tools/skills/implement/references/task-graph.md` | **MOVE (git mv)** from `ai-dev-tools/skills/orchestrate/references/task-graph.md` | ASCII task dependency graph format + generation rules |
| `ai-dev-tools/skills/implement/references/refactor-execution.md` | **MOVE (git mv)** from `ai-dev-tools/skills/orchestrate/references/refactor-execution.md` | Refactor-unit file-operation patterns, per-stack import rewrite, pre-flight & verification commands |
| `ai-dev-tools/skills/orchestrate/SKILL.md` | **EDIT** | Step 5 becomes ~10-line delegating wrapper; Conditional Loading section drops the implementation-step.md block AND the refactor-execution.md + checklist pre-flight block |
| `ai-dev-tools/skills/orchestrate/references/implementation-step.md` | **DELETE** (via `git mv`) | Moved to implement/references/ |
| `ai-dev-tools/skills/orchestrate/references/task-graph.md` | **DELETE** (via `git mv`) | Moved to implement/references/ |
| `ai-dev-tools/skills/orchestrate/references/refactor-execution.md` | **DELETE** (via `git mv`) | Moved to implement/references/ |

**Commit strategy:** One atomic commit at the end of Task 4 ("Move + create + rewrite orchestrate"). The file moves, the new SKILL.md, and the orchestrate delegation all reference each other — if split across commits, intermediate commits would be broken (orchestrate would reference a moved file at its new location while the file still lives at its old location, or vice versa). A second commit at the end of Task 5 covers the Conditional Loading section cleanup. A third commit at Task 6 adds any help-text wiring if needed.

---

### Task 1: Create the implement/ skill directory skeleton

**Files:**
- Create: `ai-dev-tools/skills/implement/`
- Create: `ai-dev-tools/skills/implement/references/`

- [ ] **Step 1: Verify the implement/ directory does NOT already exist**

Run:

```bash
ls ai-dev-tools/skills/implement 2>&1
```

Expected output: `ls: cannot access 'ai-dev-tools/skills/implement': No such file or directory`

If the directory already exists, STOP and inspect its contents — this plan assumes a clean starting state. Do not overwrite existing files silently.

- [ ] **Step 2: Create the directory tree**

Run:

```bash
mkdir -p ai-dev-tools/skills/implement/references
```

- [ ] **Step 3: Verify the directory tree was created**

Run:

```bash
ls -la ai-dev-tools/skills/implement/
ls -la ai-dev-tools/skills/implement/references/
```

Expected: both directories exist, `references/` is empty.

**No commit yet.** Empty directories are not tracked by git; the next task populates them. Task 4 commits everything together.

---

### Task 2: Move the three reference files via `git mv`

**Files:**
- Source: `ai-dev-tools/skills/orchestrate/references/implementation-step.md`
- Source: `ai-dev-tools/skills/orchestrate/references/task-graph.md`
- Source: `ai-dev-tools/skills/orchestrate/references/refactor-execution.md`
- Destination: `ai-dev-tools/skills/implement/references/` (all three)

- [ ] **Step 1: Verify all three source files exist**

Run:

```bash
ls -la ai-dev-tools/skills/orchestrate/references/implementation-step.md \
       ai-dev-tools/skills/orchestrate/references/task-graph.md \
       ai-dev-tools/skills/orchestrate/references/refactor-execution.md
```

Expected: all three files listed. If any is missing, STOP and investigate — the spec assumes all three live in `orchestrate/references/` at the start of this refactor.

- [ ] **Step 2: Verify git state is clean**

Run:

```bash
git status --porcelain
```

Expected: empty output (clean tree). If there are uncommitted changes, stash them first:

```bash
git stash push -m "pre-implement-skill-refactor"
```

- [ ] **Step 3: Move implementation-step.md**

Run:

```bash
git mv ai-dev-tools/skills/orchestrate/references/implementation-step.md \
       ai-dev-tools/skills/implement/references/implementation-step.md
```

- [ ] **Step 4: Move task-graph.md**

Run:

```bash
git mv ai-dev-tools/skills/orchestrate/references/task-graph.md \
       ai-dev-tools/skills/implement/references/task-graph.md
```

- [ ] **Step 5: Move refactor-execution.md**

Run:

```bash
git mv ai-dev-tools/skills/orchestrate/references/refactor-execution.md \
       ai-dev-tools/skills/implement/references/refactor-execution.md
```

- [ ] **Step 6: Verify the moves with git status**

Run:

```bash
git status
```

Expected output includes three `renamed:` lines:

```
renamed:    ai-dev-tools/skills/orchestrate/references/implementation-step.md -> ai-dev-tools/skills/implement/references/implementation-step.md
renamed:    ai-dev-tools/skills/orchestrate/references/task-graph.md -> ai-dev-tools/skills/implement/references/task-graph.md
renamed:    ai-dev-tools/skills/orchestrate/references/refactor-execution.md -> ai-dev-tools/skills/implement/references/refactor-execution.md
```

If git shows these as `deleted:` + `new file:` instead of `renamed:`, that is also acceptable — git rename detection is heuristic. The key check: no file content should appear in the diff. Run `git diff --cached -M` to force rename detection and confirm the diff is empty for these three files.

- [ ] **Step 7: Verify the content is identical after the move**

Run:

```bash
git diff --cached -M --stat
```

Expected: the three renamed files appear with `0 insertions, 0 deletions` (content unchanged, only path changed).

**No commit yet.** Task 4 will commit the moves alongside the new SKILL.md and the orchestrate rewrites as one atomic change.

---

### Task 3: Verify implementation-step.md references to task-graph.md still resolve

**Files:**
- Read: `ai-dev-tools/skills/implement/references/implementation-step.md` (post-move location)

Context: `implementation-step.md` contains the line `Read `references/task-graph.md`, analyze the plan, and generate an ASCII dependency graph.` That relative path `references/task-graph.md` was correct under `orchestrate/` (where `references/task-graph.md` lived) and remains correct under `implement/` (where `references/task-graph.md` now lives). But we need to confirm the relative path is still valid because a sibling reference in the same `references/` directory resolves the same way regardless of parent skill.

- [ ] **Step 1: Read implementation-step.md and confirm the relative reference**

Run:

```bash
grep -n "references/task-graph.md" ai-dev-tools/skills/implement/references/implementation-step.md
```

Expected: one line in the Task Graph section referencing `references/task-graph.md`.

- [ ] **Step 2: Confirm `references/task-graph.md` exists at the expected sibling location**

Run:

```bash
ls ai-dev-tools/skills/implement/references/task-graph.md
```

Expected: file exists.

Note: The relative path `references/task-graph.md` from inside `implementation-step.md` is interpreted by the AI agent relative to the skill being loaded (the `implement` skill in this case), not relative to the file containing the reference. So `/implement`'s agent resolves `references/task-graph.md` to `ai-dev-tools/skills/implement/references/task-graph.md`. This is the same convention orchestrate uses. No content change needed.

- [ ] **Step 3: Confirm no other cross-skill references exist in the moved files**

Run:

```bash
grep -n "orchestrate/references" ai-dev-tools/skills/implement/references/implementation-step.md \
                                  ai-dev-tools/skills/implement/references/task-graph.md \
                                  ai-dev-tools/skills/implement/references/refactor-execution.md
```

Expected: no matches. If any match appears, it is a hard-coded path to `orchestrate/references/...` that will break after the move — stop and update the path to the new location. (Based on pre-move inspection, no such reference exists in any of the three files, but verify.)

**No commit yet.** Still part of the atomic Task 4 commit.

---

### Task 4: Create implement/SKILL.md + rewrite orchestrate Step 5 (atomic commit)

**Files:**
- Create: `ai-dev-tools/skills/implement/SKILL.md`
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (Step 5 body only — Conditional Loading edits come in Task 5)

This is the largest task. It lands in one commit together with the file moves from Task 2 because the new orchestrate Step 5 references the new `/implement` skill; splitting would leave the repo in a broken intermediate state.

- [ ] **Step 1: Create `ai-dev-tools/skills/implement/SKILL.md`**

Write the file with this exact content:

````markdown
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
````

- [ ] **Step 2: Verify the new SKILL.md was written**

Run:

```bash
wc -l ai-dev-tools/skills/implement/SKILL.md
```

Expected: approximately 200-230 lines.

- [ ] **Step 3: Re-read the file for sanity**

Read `ai-dev-tools/skills/implement/SKILL.md` from top to bottom. Confirm:
- YAML frontmatter `name: implement` is present
- `<help-text>` block is present and matches the spec
- Steps A, B, C, D are all present in order
- Return Contract section describes the marker file
- All 13 edge cases are listed

- [ ] **Step 4: Rewrite orchestrate Step 5 body**

Edit `ai-dev-tools/skills/orchestrate/SKILL.md`. Locate Step 5 by its exact anchor string and replace the body with the new delegating-wrapper text.

**Anchor (old Step 5 body — match exactly):**

```
**Step 5 — Implement:** Plan exists, implementation not confirmed complete. If the current feature is a refactor unit (matched via roadmap check): skip execution model selection, execute directly using `references/refactor-execution.md` following Pre-flight → File Operations → Verification. Otherwise: Read references/implementation-step.md: generate task graph, execution model recommendation, dispatch with overrides. Edge: user explicitly states implementation is done -> advance to Step 6; 0 commits since plan_hash -> stay at Step 5 and present implementation dispatch. User explicit confirmation always overrides the commit signal. If the user states implementation is done with 0 commits, advance to Step 6 with warning: "No commits since plan_hash — proceeding to code review at your confirmation."
```

**Replacement:**

```
**Step 5 — Implement:** Plan exists, implementation not confirmed complete. Step 5 is a delegating wrapper: orchestrate does NOT inline plan detection, task graph, or execution model dispatch — all of that lives in `/implement`. Read the `plan:` field from the hint file. If the `plan:` field is empty or the plan file does not exist, emit this error breadcrumb and route the user back to Step 4:

```
No plan found for the current feature. Run /writing-plans <spec> first to produce a plan, then re-invoke orchestrate.
```

Otherwise, emit the breadcrumb `/orchestrate (/implement <plan-path>)` (or the `--strict` form per Item 03) and exit. After `/implement` returns control to orchestrate, check for the marker file `tmp/implement-exit-status.md`:
- If the marker exists AND contains `early_exit: clear_context`: skip auto-commit verification, do NOT write `step: 6` (hint stays at `step: 5`), do NOT emit a Step 5 → Step 6 breadcrumb, delete the marker file, return control to the user. `/implement` has already printed its own `/clear → /implement <path> --model single` breadcrumb.
- If the marker is absent OR does not contain `early_exit: clear_context`: run the standard post-`/implement` sequence — auto-commit verification, write `step: 6` to the hint file, emit the Step 5 → Step 6 breadcrumb `/clear → /orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)`.

Edge: user explicitly states implementation is done -> advance to Step 6; 0 commits since plan_hash -> stay at Step 5 and emit the `/implement` breadcrumb. User explicit confirmation always overrides the commit signal. If the user states implementation is done with 0 commits, advance to Step 6 with warning: "No commits since plan_hash — proceeding to code review at your confirmation."
```

Use the Edit tool with the exact old text as `old_string` and the replacement as `new_string`. Do not use line numbers — the surrounding content will shift during review iterations.

- [ ] **Step 5: Verify the orchestrate edit applied**

Run:

```bash
grep -n "delegating wrapper" ai-dev-tools/skills/orchestrate/SKILL.md
```

Expected: one match in the Step 5 section.

Run:

```bash
grep -n "references/implementation-step.md" ai-dev-tools/skills/orchestrate/SKILL.md
```

Expected: still appears in the Conditional Loading section (Task 5 will remove it) — if Step 5 body still mentions it, the edit was not clean. Investigate.

Run:

```bash
grep -n "references/refactor-execution.md" ai-dev-tools/skills/orchestrate/SKILL.md
```

Expected: still appears in the Conditional Loading section (Task 5 will remove it). Step 5 body should NOT mention it any more.

- [ ] **Step 6: Sanity-check the full diff**

Run:

```bash
git diff ai-dev-tools/skills/orchestrate/SKILL.md
```

Confirm:
- Only the Step 5 body block changed.
- No other part of the file was touched.
- The new Step 5 mentions "delegating wrapper" and the marker file check.
- Step 4 and Step 6 blocks are untouched.

- [ ] **Step 7: Commit the atomic change**

```bash
git add ai-dev-tools/skills/implement/SKILL.md \
        ai-dev-tools/skills/implement/references/implementation-step.md \
        ai-dev-tools/skills/implement/references/task-graph.md \
        ai-dev-tools/skills/implement/references/refactor-execution.md \
        ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "feat(implement): extract /implement skill from orchestrate Step 5

Create new standalone /implement skill that owns plan/spec detection,
task graph, execution model recommendation, 4-option dispatch, and
refactor-unit branching. Move implementation-step.md, task-graph.md,
and refactor-execution.md from orchestrate/references/ to
implement/references/ via git mv (preserves history).

Rewrite orchestrate Step 5 body as a ~10-line delegating wrapper that
emits /orchestrate (/implement <plan>) and reads the tmp/
implement-exit-status.md marker file on return to handle the
clear-context early-exit path without stomping on /implement's
breadcrumb.

Refs: docs/superpowers/specs/2026-04-07-ai-dev-toolkit-improvements/02-implement-skill.md"
```

---

### Task 5: Remove the old Conditional Loading blocks from orchestrate

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (Conditional Loading section)

This is a separate commit from Task 4 because the file-move + new SKILL.md must land together first — the Conditional Loading edit is a pure cleanup that depends on the move being already in place (it removes references to files that orchestrate no longer loads, only after orchestrate has stopped referencing them via Step 5).

- [ ] **Step 1: Remove the implementation-step.md block from Conditional Loading**

Use the Edit tool. **Anchor (match exactly, including the blank line before `At Step 5 onset, if a refactor roadmap exists`):**

```
At Step 5 onset (all paths including User Prompt):
  -> Read references/implementation-step.md for task graph visualization,
    execution model recommendation, and override dispatch.

At Step 5 onset, if a refactor roadmap exists and the current feature
name appears in that roadmap (case-insensitive substring match of the
feature name against roadmap item labels — match against the bold
module/layer name only, i.e., text between ** markers in the checkbox
line, not the full rationale text):
  → Read references/refactor-execution.md for file operation, import rewrite,
    and verification patterns.
  → Checklist pre-flight: read tmp/checklists/index.md (if it exists), filter
    for rows where Phase is `coding` or `both` AND Recommended Skill contains
    `refactor-to-monorepo` or `refactor-to-layers`. Surface any matching entries
    to the user before beginning execution.
    Note: the `refactor-to-layers` filter branch is reserved for future use.
    refactor-to-layers has no checklist crystallization section, so the
    `refactor-to-layers` filter will currently return empty. This is expected —
    do not warn the user on an empty result from the `refactor-to-layers` branch.
```

**Replacement:** (empty string — delete the entire block)

```

```

Actually use the Edit tool with `old_string` set to the full anchor block above AND `new_string` set to a single empty line (to preserve the paragraph break before the next block `If --strict is active at Step 8:`). Verify the next block `If --strict is active at Step 8:` is now the first entry after the `User Prompt` block.

- [ ] **Step 2: Verify implementation-step.md no longer appears in orchestrate/SKILL.md**

Run:

```bash
grep -n "implementation-step.md" ai-dev-tools/skills/orchestrate/SKILL.md
```

Expected: **no matches**. If any remain, locate and remove them.

- [ ] **Step 3: Verify refactor-execution.md no longer appears in orchestrate/SKILL.md**

Run:

```bash
grep -n "refactor-execution.md" ai-dev-tools/skills/orchestrate/SKILL.md
```

Expected: **no matches**.

- [ ] **Step 4: Verify task-graph.md was not directly referenced in orchestrate/SKILL.md in the first place**

Run:

```bash
grep -n "task-graph.md" ai-dev-tools/skills/orchestrate/SKILL.md
```

Expected: **no matches**. (Per the spec, `task-graph.md` was only loaded transitively from inside `implementation-step.md`, not directly from `orchestrate/SKILL.md`. This check is a safety net — if a match exists, investigate.)

- [ ] **Step 5: Verify Conditional Loading still contains the unrelated entries**

Run:

```bash
grep -n "strict-mode.md\|quality-gates.md" ai-dev-tools/skills/orchestrate/SKILL.md
```

Expected: matches in the Conditional Loading section for both files. These entries are unrelated to Step 5 and must remain.

- [ ] **Step 6: Re-read the Conditional Loading section**

Read `ai-dev-tools/skills/orchestrate/SKILL.md` and locate the `## Conditional Loading` section. Confirm the order is:
1. Hint file missing block → User Prompt
2. `If --strict is active at Step 8` → strict-mode.md
3. `At Step 8, after user confirms finalize` → quality-gates.md

There should be NO Step 5-related entry in this section.

- [ ] **Step 7: Diff check**

Run:

```bash
git diff ai-dev-tools/skills/orchestrate/SKILL.md
```

Expected: only the Conditional Loading section shows deletions. No other changes.

- [ ] **Step 8: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "chore(orchestrate): drop Step 5 references from Conditional Loading

With Step 5 now delegating to /implement, orchestrate no longer loads
implementation-step.md or refactor-execution.md. Remove both blocks
from the Conditional Loading section. strict-mode.md and
quality-gates.md entries are unrelated to Step 5 and remain.

Refs: docs/superpowers/specs/2026-04-07-ai-dev-toolkit-improvements/02-implement-skill.md"
```

---

### Task 6: Add `/implement` to the help skill output

**Files:**
- Modify: `ai-dev-tools/skills/help/SKILL.md`

The help skill lists all commands available in the plugin. Adding `/implement` to the listing makes it discoverable alongside `/orchestrate`.

- [ ] **Step 1: Read the existing help text**

Read `ai-dev-tools/skills/help/SKILL.md` in full. Locate the `COMMANDS (ORCHESTRATE FLOW)` section.

- [ ] **Step 2: Insert a line for /implement**

Use the Edit tool. **Anchor (match exactly):**

```
COMMANDS (ORCHESTRATE FLOW)
  /orchestrate              Development cycle manager (start here)
  /review-doc <path> [...]  Review specs and design documents
  /document-for-ai          Generate AI-optimized docs (auto-invoked by orchestrate)
  /review-code <N> <spec>   Review last N commits against a spec
```

**Replacement:**

```
COMMANDS (ORCHESTRATE FLOW)
  /orchestrate              Development cycle manager (start here)
  /review-doc <path> [...]  Review specs and design documents
  /implement [path] [...]   Execute a plan or spec (task graph + dispatch)
  /document-for-ai          Generate AI-optimized docs (auto-invoked by orchestrate)
  /review-code <N> <spec>   Review last N commits against a spec
```

- [ ] **Step 3: Verify the edit**

Run:

```bash
grep -n "/implement" ai-dev-tools/skills/help/SKILL.md
```

Expected: one match in the `COMMANDS (ORCHESTRATE FLOW)` block.

- [ ] **Step 4: Commit**

```bash
git add ai-dev-tools/skills/help/SKILL.md
git commit -m "docs(help): list /implement in ORCHESTRATE FLOW commands

/implement is now a standalone entry point extracted from orchestrate
Step 5. List it alongside /orchestrate, /review-doc, /document-for-ai,
and /review-code so users can discover it via /help.

Refs: docs/superpowers/specs/2026-04-07-ai-dev-toolkit-improvements/02-implement-skill.md"
```

---

### Task 7: Manual verification (no test suite — re-read + dry probe)

This project has no automated test suite. Verification is manual: re-read every modified file, confirm the skill loads via the Skill tool, and run an exploratory `/implement --help` probe.

**Files (read-only verification):**
- Read: `ai-dev-tools/skills/implement/SKILL.md`
- Read: `ai-dev-tools/skills/implement/references/implementation-step.md`
- Read: `ai-dev-tools/skills/implement/references/task-graph.md`
- Read: `ai-dev-tools/skills/implement/references/refactor-execution.md`
- Read: `ai-dev-tools/skills/orchestrate/SKILL.md` (Step 5 + Conditional Loading sections)
- Read: `ai-dev-tools/skills/help/SKILL.md`

- [ ] **Step 1: Confirm the skill directory layout**

Run:

```bash
ls -la ai-dev-tools/skills/implement/
ls -la ai-dev-tools/skills/implement/references/
```

Expected:
- `ai-dev-tools/skills/implement/SKILL.md` exists
- `ai-dev-tools/skills/implement/references/implementation-step.md` exists
- `ai-dev-tools/skills/implement/references/task-graph.md` exists
- `ai-dev-tools/skills/implement/references/refactor-execution.md` exists

- [ ] **Step 2: Confirm the old locations are empty**

Run:

```bash
ls ai-dev-tools/skills/orchestrate/references/
```

Expected output: `quality-gates.md` and `strict-mode.md` only. No `implementation-step.md`, no `task-graph.md`, no `refactor-execution.md`.

- [ ] **Step 3: Re-read `implement/SKILL.md` end-to-end**

Read the full file. Verify:
- YAML frontmatter with `name: implement`
- `<help-text>` block matches the Argument Signature table from the spec
- Step A (path resolution) has 5 sub-steps including the hint-file fall-through
- Step B (plan vs spec detection) has the location check + content fallback + tiebreaker rule (minimum 2 plan markers)
- Step C has the three hard signals (multi-component, cross-cutting, explicit phase markers) and the skip-by-default behavior
- Step D has the refactor-unit pre-check BEFORE the normal-feature path
- Step D.5 (Option [3] clear-context) writes the marker file BEFORE printing the breadcrumb
- Return Contract section matches the marker lifecycle from the spec
- All 13 edge cases are present

- [ ] **Step 4: Re-read `orchestrate/SKILL.md` Step 5**

Read the Step 5 section of `orchestrate/SKILL.md`. Verify:
- Step 5 is ~15 lines (was ~5 lines before rewrite; the new version adds the marker-file check)
- Mentions "delegating wrapper"
- References `/implement` via the `/orchestrate (/implement <plan-path>)` breadcrumb
- Includes the marker-file post-`/implement` check logic
- Does NOT mention `references/implementation-step.md` or `references/refactor-execution.md`

- [ ] **Step 5: Re-read `orchestrate/SKILL.md` Conditional Loading**

Verify the Conditional Loading section contains ONLY:
- The hint-file-missing → User Prompt entry
- The `--strict` at Step 8 → strict-mode.md entry
- The Step 8 finalize → quality-gates.md entry

And does NOT contain:
- Any entry referencing `implementation-step.md`
- Any entry referencing `refactor-execution.md`
- Any entry referencing `task-graph.md`

- [ ] **Step 6: Probe the new skill via the Skill tool**

In the current session, invoke the Skill tool with `skill: "ai-dev-tools:implement"` (or `implement`, depending on plugin naming convention). Pass `--help` as the argument. Expected: the skill loads without error and prints the `<help-text>` block contents.

If the skill fails to load with an error like `skill not found: implement`, inspect `ai-dev-tools/skills/implement/SKILL.md` — the YAML frontmatter may be malformed or the `name:` field may not match the directory name.

Note: If the plugin registry caches skill listings, you may need to reload. In this repo, plugin skills are auto-discovered from `ai-dev-tools/skills/*/SKILL.md` at skill-load time — no explicit manifest update is needed.

- [ ] **Step 7: Dry-run `/orchestrate` at Step 5 against a known plan**

Pick an existing plan from `docs/superpowers/plans/`, e.g. `docs/superpowers/plans/2026-03-30-orchestrate-fast-detection-plan.md`.

Write a throwaway hint file:

```bash
cat > tmp/orchestrate-state.md <<'EOF'
---
mode: standard
feature: orchestrate-fast-detection
step: 5
spec: docs/superpowers/specs/2026-03-30-orchestrate-fast-detection.md
plan: docs/superpowers/plans/2026-03-30-orchestrate-fast-detection-plan.md
plan_hash: ""
head: $(git rev-parse HEAD)
updated: 2026-04-07T00:00:00Z
---
EOF
```

Then invoke `/orchestrate`. Expected: orchestrate detects Step 5 via fast-path, runs the NEW Step 5 delegating wrapper, and emits a breadcrumb like:

```
── Next ────────────────────────────────────────
/orchestrate (/implement docs/superpowers/plans/2026-03-30-orchestrate-fast-detection-plan.md)
────────────────────────────────────────────────
```

Rather than inlining the task graph + execution picker. The breadcrumb signals the refactor is working.

**Important:** After this probe, restore or delete the throwaway hint file. Do not commit it. Run `git checkout -- tmp/orchestrate-state.md` if the file was tracked, or `rm tmp/orchestrate-state.md` if it was untracked.

- [ ] **Step 8: Probe `/implement` standalone with an explicit plan path**

Invoke `/implement docs/superpowers/plans/2026-03-30-orchestrate-fast-detection-plan.md` directly (without going through orchestrate). Expected: `/implement` loads, runs Step A (resolves path from positional arg), runs Step B (classifies as plan via location check), proceeds to Step D normal-feature path, builds task graph via `references/implementation-step.md`, presents execution model recommendation, prompts for 4-option picker. Do not actually dispatch — interrupt at the picker prompt.

This probe validates the `/implement` entry point without going through orchestrate.

- [ ] **Step 9: Probe `--help` output**

Invoke `/implement --help`. Expected: prints the `<help-text>` block verbatim and exits. No other logic runs.

- [ ] **Step 10: Probe the `--model clear-context` rejection**

Invoke `/implement docs/superpowers/plans/2026-03-30-orchestrate-fast-detection-plan.md --model clear-context`. Expected: the skill rejects with the exact error from Edge Case 7:

```
--model clear-context is not supported; clear-context is dispatch-only. Omit --model and choose option [3] from the picker.
```

- [ ] **Step 11: Confirm git history preserved the moves**

Run:

```bash
git log --follow --oneline ai-dev-tools/skills/implement/references/implementation-step.md | head -5
```

Expected: history predates the move commit — `git log --follow` should show commits from before the file lived at the new path, confirming `git mv` preserved history.

**No commit for Task 7.** Verification is read-only.

---

## Self-Review

Run this checklist against the plan above with fresh eyes. Fix any issues inline.

**1. Spec coverage:**

Walk through each section of `docs/superpowers/specs/2026-04-07-ai-dev-toolkit-improvements/02-implement-skill.md` and confirm a task implements it:

- [ ] **Files Modified / Created table** — Task 1 (directory), Task 2 (moves), Task 4 (SKILL.md create + orchestrate Step 5 rewrite), Task 5 (Conditional Loading cleanup). All 8 file actions from the spec's table are covered.
- [ ] **Argument Signature** — Task 4 Step 1 includes the full `<help-text>` block and argument parsing instructions.
- [ ] **Step A (Path Resolution)** — Task 4 Step 1 implement/SKILL.md Step A covers positional → plan → spec → error + existence check fall-through.
- [ ] **Step B (Plan vs Spec Detection)** — Task 4 Step 1 implement/SKILL.md Step B covers location-first + content fallback + tiebreaker (minimum 2 plan markers).
- [ ] **Step C (Spec Recommendation Algorithm)** — Task 4 Step 1 implement/SKILL.md Step C covers the 3 hard signals, skip-by-default behavior, the recommendation prompt, and `--skip-plan-recommendation` suppression.
- [ ] **Step D Refactor-Unit Branch Handling (pre-check)** — Task 4 Step 1 implement/SKILL.md Step D covers roadmap detection, case-insensitive substring match, refactor-execution.md loading, checklist pre-flight, `--model` ignore warning, return-to-caller.
- [ ] **Step D Normal-feature path (steps 1-6)** — Task 4 Step 1 implement/SKILL.md Step D covers task graph, execution model recommendation, `--model` short-circuit, picker, Option [3] early-exit with marker file, normal dispatch.
- [ ] **Default Model Selection** — Task 4 Step 1 implement/SKILL.md has a Default Model Selection subsection.
- [ ] **Return Contract with Orchestrate** — Task 4 Step 1 implement/SKILL.md has a Return Contract section with marker-file schema, lifecycle, and "when NOT to write" rules.
- [ ] **Orchestrate Step 5 delegating wrapper** — Task 4 Steps 4-6 rewrite Step 5 body.
- [ ] **Orchestrate Conditional Loading cleanup** — Task 5 removes both blocks (implementation-step.md + refactor-execution.md+checklist pre-flight).
- [ ] **Hint File Step Transitions table** — Task 4 Step 4 replacement covers the 5→5 clear-context path and the 5→6 normal-completion path in the rewritten Step 5 body.
- [ ] **State Synchronization Rules** — Task 4 Step 1 implement/SKILL.md has a State Synchronization Rules section stating `/implement` is stateless w.r.t. the hint file.
- [ ] **All 13 Edge Cases** — Task 4 Step 1 implement/SKILL.md lists all 13 edge cases from the spec verbatim (renumbered if needed, content preserved).
- [ ] **Verification procedure from spec** — Task 7 covers all 7 manual verification items from the spec (spec items 1-7).

**2. Placeholder scan:**

Search the plan above for these red-flag patterns. Fix any hits inline.

- [ ] No "TBD", "TODO", "implement later", "fill in details"
- [ ] No "add appropriate error handling" / "add validation" / "handle edge cases" (abstract)
- [ ] No "write tests for the above" without actual code (moot here — no test suite)
- [ ] No "similar to Task N" (every task self-contained)
- [ ] Every step that changes a file shows the exact anchor string AND the exact replacement
- [ ] Every reference to a type, function, or file resolves to a task that creates or modifies it

**3. Type / naming consistency:**

- [ ] The marker file path is `tmp/implement-exit-status.md` in EVERY mention across Task 4 (implement/SKILL.md Step D.5, implement/SKILL.md Return Contract, orchestrate/SKILL.md Step 5 rewrite) — no typos, no variant paths.
- [ ] The marker file discriminator field is `early_exit: clear_context` in EVERY mention — not `exit_type:`, not `mode: clear-context`, not `early-exit`.
- [ ] The Option [3] breadcrumb is `/clear → /implement <path> --model single` in EVERY mention — the `--model single` is always explicit.
- [ ] The positional argument name is `path` (not `plan`, not `file`) in the help text, Step A, Step B, and edge cases.
- [ ] The `/implement` argument signature matches the spec table: `[path] [--model single|subagent|parallel] [--help]`. `--skip-plan-recommendation` is mentioned as an internal suppression flag but is NOT in the main help-text (the spec says it's not a public-facing flag).
- [ ] `--model clear-context` rejection text matches EXACTLY between Edge Case 7 in the SKILL.md and the verification probe in Task 7 Step 10.

**4. Commit granularity:**

- [ ] Task 4 is ONE commit (file moves + new SKILL.md + orchestrate Step 5 rewrite) — atomic because orchestrate references the new file locations.
- [ ] Task 5 is a SEPARATE commit — pure cleanup, depends on Task 4 but is not atomic with it.
- [ ] Task 6 is a SEPARATE commit — help listing, independent.
- [ ] Task 7 creates NO commits — verification only.
- [ ] No commits use `--no-verify`, `--amend`, `--force`, or any destructive flag.

**5. Project constraints:**

- [ ] No `pytest`, `jest`, `cargo test`, `go test` — the project has no test suite.
- [ ] No `git checkout -b`, no worktree creation — the plan runs on master.
- [ ] All `git mv` preserves history (verified in Task 7 Step 11 via `git log --follow`).
- [ ] All `Edit` tool invocations use anchor strings, not line numbers.

If any checklist item above has a `[ ]` that cannot be checked after re-reading the plan, fix the plan and re-run the affected checklist section.
