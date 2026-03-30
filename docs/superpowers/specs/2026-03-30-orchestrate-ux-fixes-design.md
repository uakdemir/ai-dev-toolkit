# Orchestrate UX Fixes — Design Spec

**Date:** 2026-03-30
**Status:** Draft
**Plugin:** ai-dev-tools
**Scope:** Three targeted changes to the orchestrate skill's `--strict` mode and first-run experience.

---

## Summary

Three small changes to orchestrate that improve execution efficiency and first-run UX:

- **Change A:** Add a 4th execution model option — "single-agent + one parallel helper" — that spawns one reusable background agent for parallelizable tasks while the main agent continues working. One context copy total.
- **Change B:** When `--strict` and no hint file exists, ask the user where they left off before running the expensive full scan.
- **Change C:** When invoked without `--strict` and no persisted mode preference, offer a one-time choice between standard and strict mode. Persist the choice so it never asks again.

---

## Change A: Single-Agent + One Parallel Helper (Option [4])

### Motivation

The current strict-mode execution model offers single-agent (no parallelism) or subagent-per-task (N context copies). For plans with 4+ tasks where some are independent, a middle ground exists: the main agent works on tasks AND one persistent background helper handles parallel work. This gives ~30-50% time savings with only 1 context copy.

### Mechanism

1. At execution start, spawn one background Agent (the "helper").
2. For each parallel phase, main agent takes one task, sends the other to the helper via `SendMessage` (reusing the same agent instance).
3. For serial/coupled tasks, main agent works directly — helper idles.
4. After each parallel phase, main agent confirms both tasks completed before proceeding. Confirmation is done by reading the helper's returned output: if the output contains an explicit error, a tool-failure message, or the string "BLOCKED", the main agent logs the failure, takes ownership of the remaining work for that task, and continues serially.
5. The helper accumulates codebase knowledge across tasks — no reload needed.

**Key constraint:** Never spawn more than one helper. The Agent tool's `SendMessage` preserves the helper's full context between tasks.

### Parallelism Yield Check

Before recommending [4], evaluate whether the parallelism justifies the overhead:

```
1. Parse plan for task dependencies (prerequisites, ordering constraints).
2. Greedily pair independent tasks into parallel phases.
   Scan tasks in plan order. For each unassigned task, find the next
   unassigned task with no dependency on it or vice versa. If found,
   pair them. Continue until all tasks are assigned or no more pairs exist.
3. Count parallel pairs: P.
4. parallelism_ratio = P / task_count.

If parallelism_ratio >= 0.30 → [4] is eligible.
If parallelism_ratio < 0.30  → not worth it, fall through to [1].
```

Note: `parallelism_ratio` is a proxy for time savings potential (fraction of tasks that can be parallelised), not a direct wall-clock measurement.

**Example:** 8 tasks, 3 parallel pairs → ratio = 3/8 = 37.5% → eligible.
**Counter-example:** 6 tasks, 1 parallel pair → ratio = 1/6 = 16.7% → not worth it.

### Updated Recommendation Algorithm

```
remaining = 200_000 - estimated_used
implementation_estimate = task_count × 12_000
parallelism_ratio = 0  # default; overwritten if yield check is run

If implementation_estimate > remaining × 0.8 → subagent-per-task
  (+ "Consider clearing context first for single-agent (Option [3])")
Else if coupling == HIGH → single-agent
Else if task_count > 8 AND coupling == LOW → subagent-per-task
Else if task_count >= 4 AND coupling != HIGH AND parallelism_ratio >= 0.30 → single-agent + parallel helper
Else → single-agent
```

### Updated Presentation

```
── Step 5: Implementation ──────────────────────
Plan: <N> tasks, <coupling assessment>
Context: ~<used>K / 200K used, ~<remaining>K remaining
Estimated cost: ~<estimate>K tokens
Parallelism yield: <P> pairs, ratio <parallelism_ratio>%

Recommendation: <option name>
  Reason: <one-line explanation>

Alternatives:
  [1] Single-agent
  [2] Subagent-per-task
  [3] Clear context + single-agent
  [4] Single-agent + one parallel helper

Proceed with [N]?
```

The "Parallelism yield" line is shown only when parallelism_ratio was computed (task_count >= 4 and coupling != HIGH). When [4] is not eligible, it still appears as an alternative but the recommendation arrow does not point to it.

### Override Dispatch for [4]

Dispatch to `superpowers:executing-plans` (same target as [1]) with the same TDD, verification, and spec-compliance overrides as [1], plus:

```
6. PARALLEL HELPER: Spawn one background helper agent on the first
   parallelizable task. Reuse it via SendMessage for all subsequent
   parallel tasks. Never spawn more than one helper. For serial or
   coupled tasks, work directly — helper idles. Before each task,
   check the remaining tasks for one with no dependency on the
   current task. If found, send it to the helper. Wait for the
   helper to complete before starting the next phase. If the helper
   has not returned output after the main agent completes its own
   task, proceed without the helper's result and take ownership of
   the helper's task.
```

---

## Change B: First-Run User Prompt Before Full Scan (--strict only)

### Motivation

When `tmp/orchestrate-state.md` is missing, orchestrate runs a full scan of all specs, plans, git history, and review files. In strict mode, this is followed by execution model analysis and coupling checks — the combined cost is significant. If the user already knows what they're working on, this is wasted context.

### Flow

```
1. Print: "No previous state found."
   Ask:  "What are you working on and where did you leave off?"

2. Parse response for:
   - Feature name: match against docs/superpowers/specs/ filenames
     (strip YYYY-MM-DD- prefix and -design suffix).
     Matching algorithm: case-insensitive substring match against the stripped filename.
     If exactly one filename matches → resolved. If zero or more than one match → ambiguous (go to step 4).
   - Step: map natural language to step number:
       "just started" / "haven't done anything yet" → step 1
       "brainstormed" / "wrote spec"                → step 2
       "spec in review" / "waiting on spec review"  → step 3
       "spec reviewed" / "spec approved"            → step 4
       "wrote plan" / "finished planning"           → step 5
       "implementing" / "in the middle of code"     → step 5
       "done implementing"                          → step 6
       "code review in progress" / "reviewing code" → step 7
       "code review done" / "review clean"          → step 8
     For phrases not listed above, treat the step as ambiguous and proceed to step 4.
     A phrase that matches zero rows or more than one row is treated as ambiguous and triggers the follow-up in step 4. Prefer the most-specific match when phrases overlap (e.g., "code review done" matches step 8, not step 7).

3. If BOTH feature and step resolved without ambiguity (feature matched exactly one spec filename; step phrase matched exactly one row in the table above with no overlapping candidates):
   → Run one targeted step-specific validation check
     (same as fast-path validation table in SKILL.md).
   → If the validation check contradicts the user-stated step (e.g., expected artefacts for that step are absent), print: "The project state doesn't match step <N> — let me scan to determine the correct step." and fall back to full scan.
   → Otherwise, write hint file, proceed to detected step.

4. If EITHER is ambiguous:
   → Ask a follow-up question. Max 2-3 rounds total.
   Examples:
     "Did you mean `convention-enforcer` or `consolidate-learn`?"
     "You said review — spec review (step 2-3) or code review (step 6-7)?"

5. If still unclear after 2-3 rounds:
   → Print: "Let me scan the project to figure it out."
   → Fall back to full scan (read references/full-scan.md).
```

### Scope

- **Strict-only.** Non-strict invocations — including the first run after Change C picks `[1]` — continue to full scan immediately when no valid cycle state exists. The user prompt added by this change is never shown in standard mode; the cost is lower without the strict-mode analysis overhead.
- The prompt fires when `tmp/orchestrate-state.md` is missing, has malformed YAML, OR has no valid cycle state (empty/missing `feature` field) — AND `--strict` is active (either via flag or persisted mode preference from Change C). This correctly handles the case where Change C has already created the hint file with just a `mode` field.

---

## Change C: One-Time Mode Selection Prompt

### Motivation

Users unfamiliar with orchestrate may not know about `--strict`. Users who prefer strict shouldn't need to type the flag every time. A one-time prompt on first non-flagged invocation solves both.

### Flow

**Trigger:** `/orchestrate` invoked without `--strict` flag AND no persisted `mode` field in `tmp/orchestrate-state.md`.

**Placement:** Very first thing, before Step 0 (context health check).

**Presentation:**
```
Orchestrate mode:
  [1] Standard (relaxed)
  [2] Strict — full workflow orchestration, TDD, verification gates
      (recommended if you're experienced with orchestrate)

Proceed with?
```

**Behavior:**
- User picks `[1]` → persist `mode: standard` in hint file → continue as standard. Never ask again.
- User picks `[2]` → persist `mode: strict` in hint file → print the strict-mode banner immediately after the mode prompt (before Step 0) → activate strict for this invocation, continue. Future no-flag invocations auto-activate strict. Never ask again.
- `--strict` flag present → skip prompt entirely, always strict.
- Any other input → re-present the prompt once. If the second response is also invalid, default to `[1]` (standard) and print: "Unrecognised input — defaulting to Standard mode."

### Persistence

Add a `mode` field to the `tmp/orchestrate-state.md` YAML frontmatter. Valid values: `standard`, `strict`.

**Hint file reset behavior:** When the hint file is reset (e.g., routing to Step 1 from `finalized`), the `mode` field is preserved — it is a user preference, not cycle state. The reset sets `feature`, `spec`, `plan`, and `plan_hash` to empty strings and `step` to `1`, but keeps `mode`.

**Updated hint file schema:**
```yaml
---
mode: standard | strict     # persisted user preference (new)
feature: ""
step: 1
spec: ""
plan: ""
plan_hash: ""
head: <40-char SHA>
updated: <ISO timestamp>
---
```

If the hint file exists but has no `mode` field (written by a previous version of orchestrate), treat as "no preference" → show the mode prompt on next non-flagged invocation.

**Hint file creation:** If the hint file does not exist when the mode prompt fires, create the hint file with only the `mode` field in YAML frontmatter. Do not include `feature`, `step`, `spec`, `plan`, `plan_hash`, `head`, or `updated` — their absence signals no valid cycle state. These fields will be populated by subsequent state detection (Change B's user prompt or full scan).

---

## Out of Scope

- Changing the execution models for [1], [2], or [3].
- Modifying the full-scan logic or its cost profile.
- Adding mode-selection UI in any place other than the first invocation without `--strict`.
- Supporting more than one parallel helper agent (Change A is capped at one).
- Persisting user answers from Change B's clarification rounds beyond the hint file write.

---

## Full Invocation Flow (All Three Changes Active)

The following sequence applies when all three changes are deployed and the user runs `/orchestrate` without `--strict` for the first time:

```
1. [Change C] No mode preference on file → show mode prompt.
   - User picks [1] → persist mode: standard → proceed as standard (no strict-mode steps below apply).
   - User picks [2] → persist mode: strict → print strict-mode banner → continue with strict.

2. [Existing] Step 0: context health check.

3. [Change B, strict only] No valid cycle state → ask "What are you working on?"
   - Resolved → targeted validation → write hint → jump to detected step.
   - Unresolved after 2-3 rounds → fall back to full scan.

4. [Existing] Step 1 onwards (planning, execution model selection).

5. [Change A, at execution model step] If plan has ≥ 4 tasks and coupling != HIGH
   and parallelism_ratio >= 0.30 → [4] is shown and may be recommended.
   - If user picks [4] → dispatch with parallel helper override instructions.
```

On subsequent invocations with persisted mode, step 1 is skipped entirely.

---

## Acceptance Criteria

### Change A

- [4] appears in the execution model list when task_count >= 4, coupling != HIGH, and parallelism_ratio >= 0.30.
- [4] does not appear as the recommendation when parallelism_ratio < 0.30; it still appears as an alternative.
- The "Parallelism yield" display line is absent when task_count < 4 or coupling == HIGH.
- Selecting [4] dispatches with the parallel-helper override block appended to the prompt.
- No more than one helper agent is spawned per execution.
- If the helper returns a BLOCKED/error output, the main agent takes over the task serially and continues.

### Change B

- When strict mode is active and no valid cycle state exists, the user is asked where they left off before any scan runs.
- A response matching exactly one feature filename and exactly one step mapping skips the full scan.
- A validation contradiction (expected artefacts absent) causes fallback to full scan, not a silent wrong step.
- After 2-3 failed clarification rounds, the full scan runs.
- Non-strict invocations never show this prompt.

### Change C

- The mode prompt fires exactly once per project (first non-flagged invocation with no `mode` field).
- Picking [1] persists `mode: standard`; the prompt never reappears.
- Picking [2] persists `mode: strict` and prints the banner before Step 0.
- Invalid input re-presents the prompt once; a second invalid input defaults to standard mode with a notice.
- `--strict` flag bypasses the prompt entirely.
- Hint file reset preserves the `mode` field.

---

## Files Modified

| File | Changes |
|---|---|
| `ai-dev-tools/skills/orchestrate/SKILL.md` | Add mode selection prompt section before Step 0. Update hint-file-missing path with strict-only user prompt (Change B). Add `mode` field to hint file schema and write rules. |
| `ai-dev-tools/skills/orchestrate/references/strict-mode.md` | Add [4] to execution model presentation. Add parallelism yield check. Update recommendation algorithm. Add override dispatch block for [4]. Update input guard to accept `1`, `2`, `3`, or `4` (was `1`, `2`, or `3`). |

No new files created.
