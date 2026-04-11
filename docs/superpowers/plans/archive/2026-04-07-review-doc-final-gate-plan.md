# review-doc Final Gate — Always-Runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the last allowed `review-doc` iteration to `is_final_gate=true` *before* the reviewer dispatches, so opus reviewer + opus fixer + opus fact-checker always run on the cap iteration even when criticals never reached zero in earlier rounds.

**Architecture:** Three pinpoint edits to one workflow document (`ai-dev-tools/skills/review-doc/SKILL.md`). The skill is interpreted by Claude at runtime — no compiled code, no schema changes, no agent prompt changes. The fix is purely a control-flow rule added to the iteration pseudocode plus the matching narrative + audit-log enum updates that keep the doc internally consistent.

**Tech Stack:** Markdown skill document interpreted by Claude Code. No build tooling, no test runner — verification is reading the modified file and (optionally) running `/ai-dev-tools:review-doc` against a known spec to observe the cap-path behavior live.

**Spec source:** `docs/superpowers/specs/2026-04-07-ai-dev-toolkit-improvements/01-review-doc-final-gate.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `ai-dev-tools/skills/review-doc/SKILL.md` | Modify | Iteration loop pseudocode + narrative + audit log enum |

**No new files. No deletes. No agent prompt changes.** The fix lives entirely inside the orchestrator narrative that Claude reads when `/ai-dev-tools:review-doc` is invoked.

**Why one file:** The spec's "Files Modified" table explicitly scopes the change to a single file. The agent prompts (`prompts/reviewer.md`, `prompts/coder.md`, `agents/codebase-fact-checker.md`) accept their model as a dispatch parameter from the orchestrator and need no change — they already work model-agnostically.

**Why one commit:** The three edits are mutually consistent only when applied together. Edit 1 introduces a control-flow rule, Edit 2 documents that rule in narrative form, and Edit 3 adds the audit log enum value the new path emits. Splitting into separate commits would create intermediate states where the pseudocode says one thing and the explanatory paragraph contradicts it.

---

## Task 1: Apply the Three SKILL.md Edits

**Files:**
- Modify: `ai-dev-tools/skills/review-doc/SKILL.md`

This task is intentionally single-task with sequenced steps. The three edits target non-overlapping regions of the same file but cannot be parallelized — the `Edit` tool's `old_string` uniqueness requirement forces serial application, and concurrent edits to the same file would risk clobbering. Steps 1-3 apply the edits, Step 4 statically verifies the result, Step 5 commits.

Optional Step 6 runs a live `/ai-dev-tools:review-doc` invocation to observe the cap-path behavior end-to-end. This is recommended but not required, since static verification (re-reading the modified file) is the authoritative check for a workflow doc.

---

- [ ] **Step 1: Insert PRE-REVIEW PROMOTION block at the top of the loop body**

Open `ai-dev-tools/skills/review-doc/SKILL.md` and locate the iteration loop pseudocode that currently begins:

```
While iteration <= max_iterations OR is_final_gate:

  REVIEW PHASE:
```

Use the `Edit` tool to replace this block. The anchor (`old_string`) is the exact substring:

```
While iteration <= max_iterations OR is_final_gate:

  REVIEW PHASE:
    If NOT is_final_gate:
      Dispatch 1 reviewer at min-model -> writes tmp/review-doc.json
    If is_final_gate:
      Dispatch 1 reviewer at max-model -> writes tmp/review-doc.json
```

Replace with:

```
While iteration <= max_iterations OR is_final_gate:

  PRE-REVIEW PROMOTION:
    If iteration == max_iterations AND NOT is_final_gate:
      Set is_final_gate = true (this iteration runs as the final gate from the start)

  REVIEW PHASE:
    If NOT is_final_gate:
      Dispatch 1 reviewer at min-model -> writes tmp/review-doc.json
    If is_final_gate:
      Dispatch 1 reviewer at max-model -> writes tmp/review-doc.json
```

**Critical positioning:** PRE-REVIEW PROMOTION is the first block inside the `While` body, *before* REVIEW PHASE. The opus reviewer must run on the cap iteration — not just the fixer and fact-checker — because the opus reviewer catches finer issues that sonnet misses, and you want those issues *found* in the same pass that has the fact-checker available to verify them.

The existing STOP CHECK fast-path (`If critical_count == 0 AND NOT is_final_gate: Set is_final_gate = true, continue`) stays unchanged — it remains a parallel trigger for early termination when criticals reach zero before the cap.

---

- [ ] **Step 2: Replace the explanatory paragraph below the loop pseudocode**

Locate the paragraph that currently follows the loop pseudocode (one paragraph below the end of the `iteration += 1` line of the pseudocode block).

Use the `Edit` tool. Anchor (`old_string`) is the exact paragraph:

```
The final gate is exempt from the `--max-iterations` cap: if criticals reach zero at iteration N == max_iterations, the final gate still runs as iteration N+1. Terminal output reports this as e.g. "5/4" (5 iterations with cap of 4).
```

Replace with:

```
The final gate runs at the last allowed iteration. Three trigger paths:

1. **Fast path (early termination, criticals = 0 before max):** If `critical_count == 0` in an early round (iteration N < max_iterations), `is_final_gate` flips to `true`, the next iteration runs as the final gate, and the loop ends early. Terminal output: e.g. `3/4` (if criticals hit zero at iteration 2 with cap 4, final gate runs as iteration 3).
2. **Cap path (always-runs guarantee):** If criticals never reach zero before iteration `max_iterations`, that iteration is promoted to the final gate at the start of the loop body — meaning the reviewer, fixer, and fact-checker all run at max-model. Terminal output: `N/N`.
3. **Fast path (criticals = 0 exactly at max iteration):** If `critical_count == 0` at iteration `max_iterations` and `is_final_gate` is not yet set, the STOP CHECK flips `is_final_gate = true` and continues; the final gate runs as iteration `max_iterations + 1` (exempt from cap). Terminal output: e.g. `5/4`.

Either way, the user is guaranteed at least one max-model pass with fact-check before the loop exits, as long as `--max-iterations >= 1`. (Single-pass mode `--max-iterations 1` is already handled by the existing edge case path and is unchanged by this rule.)
```

**Note on positioning:** The new paragraph is multi-line markdown with a numbered list. After applying, the next section header (`## Agent Dispatch (Early Rounds)` per the surrounding structure) should still appear two newlines below the closing parenthesis of the last sentence — confirm in Step 4.

---

- [ ] **Step 3: Add new outcome enum value to the iteration log format**

Locate the iteration log format block under `## Iteration Log Format`. The line to edit is the `**Outcome:**` enum.

Use the `Edit` tool. Anchor (`old_string`) is the exact line:

```
**Outcome:** "Fixed N issues (D deferred, P pushed back), continuing" | "0 criticals, final gate triggered" | "0 criticals, loop complete" | "Fix phase failed: <error>"
```

Replace with:

```
**Outcome:** "Fixed N issues (D deferred, P pushed back), continuing" | "0 criticals, final gate triggered" | "0 criticals, loop complete" | "Last allowed iteration, final gate triggered" | "Fix phase failed: <error>"
```

**What this adds:** A new enum value `"Last allowed iteration, final gate triggered"` distinguishes the cap-path final gate from the existing fast-path values in audit logs. When the orchestrator emits the iteration log for an iteration that PRE-REVIEW PROMOTION just promoted, it picks this new value instead of `"0 criticals, final gate triggered"` (which is reserved for the fast path).

The orchestrator's outcome-selection logic is implicit in the SKILL.md narrative — there is no separate code file mapping conditions to enum values. By adding the enum here, you authorize Claude to choose this value when interpreting the iteration log step.

---

- [ ] **Step 4: Static verification — re-read the modified file**

Use the `Read` tool to read `ai-dev-tools/skills/review-doc/SKILL.md` from approximately line 100 to line 145 and confirm:

1. The `While` loop body now has `PRE-REVIEW PROMOTION:` as its first inner block, *before* `REVIEW PHASE:`.
2. The two-line guard inside PRE-REVIEW PROMOTION reads: `If iteration == max_iterations AND NOT is_final_gate: Set is_final_gate = true`.
3. The explanatory paragraph below the loop pseudocode is the new three-trigger-path version (not the old single-sentence "exempt from cap" version).
4. The `## Agent Dispatch (Early Rounds)` heading still follows the explanatory paragraph (no accidentally deleted heading).

Then read the file again from approximately line 380 to line 395 and confirm:

5. The `**Outcome:**` enum line includes the new value `"Last allowed iteration, final gate triggered"` between `"0 criticals, loop complete"` and `"Fix phase failed: <error>"`.

If any of the five checks fails, fix the discrepancy with another `Edit` call before proceeding to Step 5.

---

- [ ] **Step 5: Commit**

```bash
git add ai-dev-tools/skills/review-doc/SKILL.md
git commit -m "fix(review-doc): always run final gate on last allowed iteration

PRE-REVIEW PROMOTION promotes iteration == max_iterations to is_final_gate
before the reviewer dispatches, guaranteeing opus reviewer + opus fixer +
opus fact-checker run on the cap iteration. Previously, complex specs that
took more than max_iterations rounds to converge exited with no opus pass
at all because is_final_gate only flipped when criticals hit zero.

Three pinpoint edits:
- Insert PRE-REVIEW PROMOTION block at top of loop body
- Replace cap-exempt paragraph with three-trigger-path explanation
- Add 'Last allowed iteration, final gate triggered' outcome enum value

Spec: docs/superpowers/specs/2026-04-07-ai-dev-toolkit-improvements/01-review-doc-final-gate.md"
```

Run `git status` after the commit and confirm a clean working tree.

---

- [ ] **Step 6 (optional, recommended): Live verification**

Pick any spec file with known structural issues and run:

```
/ai-dev-tools:review-doc <some-spec.md> --max-iterations 2
```

Observe that **iteration 2** dispatches the opus reviewer (max-model), opus fixer, *and* the codebase fact-checker — not just sonnet. The terminal output should read `2/2` and the iteration log should record outcome `"Last allowed iteration, final gate triggered"`.

If you have time for two more verifications:

- `/ai-dev-tools:review-doc <simple-spec.md> --max-iterations 4` → confirm fast path still triggers early termination (e.g. output `3/4`), no regression on the existing fast-path behavior.
- `/ai-dev-tools:review-doc <any-spec.md> --max-iterations 1` → confirm single-pass mode is unchanged (the `max_iterations == 1` guard at line ~99 still skips the loop entirely).

This step is optional because (a) it consumes opus tokens and (b) static verification of the modified workflow doc in Step 4 is the authoritative check for a markdown skill. The live run is a behavioral confirmation, not a correctness gate.

---

## Self-Review

**1. Spec coverage:** Walking the spec's "Concrete Changes" section: Change 1 (PRE-REVIEW PROMOTION block) → Step 1. Change 2 (replace explanatory paragraph) → Step 2. Change 3 (new outcome enum value) → Step 3. Change 4 (Cross-Iteration Tracking note, "no changes needed") → no task required (correctly skipped). All seven edge cases in the spec are covered by the combination of Steps 1+4 (positioning verification handles edge cases 1, 2, 6, 7) and Step 6 (live verification handles edge cases 3, 4, 5).

**2. Placeholder scan:** No "TBD", "TODO", "implement later", or "appropriate error handling" phrases. All code blocks contain literal anchor strings and replacement text. The optional Step 6 instructs running specific commands with specific expected outputs.

**3. Type consistency:** No code types in this plan — only markdown anchors. Anchor strings in Steps 1, 2, 3 are copy-paste matches to the current SKILL.md content (verified by reading the actual file before writing this plan).
