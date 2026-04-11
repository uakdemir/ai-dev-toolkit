# Orchestrate Recommendation Breadcrumbs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite orchestrate's step-boundary breadcrumbs to surface multiple next-command options (when they exist), auto-commit uncommitted work before transitions, and randomly surface quality-gate options at success points. All rendered output is **commands only, one per line** — no labels, no descriptions, no headers, no decorative separators, no conditional prose.

**Architecture:** All changes land in a single file — `ai-dev-tools/skills/orchestrate/SKILL.md`. Sub-spec 02 (`/implement` extraction) and sub-spec 03 (strict propagation + breadcrumb-as-last-line) are assumed already landed; this plan builds on those guarantees. It ALSO retroactively corrects two format artifacts introduced by sub-spec 03 that are incompatible with the "commands-only output" rule:

1. The `── Next ──` decorative separator lines in the Exit Output Format and Wrapped Next-Command Output examples. These must be stripped — the breadcrumb is now just bare command lines.
2. The mapping table's two-column layout (`After Step | Next Command (standard / strict)`) with conditional prose inside the output cell (`If criticals > 0 — Standard: X / Strict: Y`). This must be restructured to a three-column layout (`After Step | Standard | Strict`) with case distinctions moved into the "After Step" label column and the Standard/Strict cells containing only literal command text.

The plan adds (a) a new "Multi-Line Breadcrumb Format" subsection, (b) an "Auto-Commit Verification" subsection, (c) a "Quality-Gate Pool" subsection, (d) per-step rewrites for Steps 2, 4, 5, 6, 8, and (e) a full mapping-table restructure. Work is sliced into three coherent commits so each commit is reviewable in isolation.

**Tech Stack:** Markdown (SKILL.md is a Claude Code skill file — no code compilation, rendered by the Claude Code harness). Plain `git` CLI for auto-commit. No external libraries, no tests — this project has no test suite, so all verification is manual.

**Breadcrumb rendering principle (applies to every rendered breadcrumb in SKILL.md):**

- Output is **commands only**, one command per line.
- No `[N]` numbering, no short descriptions, no `Next:` header, no `── Next ──` separator lines, no conditional prose in the user-visible output.
- When multiple options exist at a single emission point, stack them — each line is a literal, copy-pasteable slash command identical in form to how it would look as a single-line breadcrumb.
- Case distinctions (criticals present, clean review, phase boundary, etc.) are Claude-facing decision logic. They live in Step body prose and in the mapping table's "After Step" label column. They **MUST NOT** appear in the rendered breadcrumb output the user sees.
- In SKILL.md mapping tables: the "After Step" column carries the case label; the Standard and Strict output columns contain only literal command text (multiple options stacked with `<br>`).

---

## File Structure

**Single file modified:** `ai-dev-tools/skills/orchestrate/SKILL.md`

No files created, moved, or deleted. No new references/ files. The three subsystem changes (multi-line breadcrumbs, auto-commit, quality-gate pool) are all localized additions plus per-step rewrites inside the existing SKILL.md.

**Section-level change map (for reviewer orientation):**

| SKILL.md section | Change |
|---|---|
| `## Exit Output Format` | Strip `── Next ──` decorative separators; the literal final line of the response is now the last bare command line of the breadcrumb. |
| `## Wrapped Next-Command Output` (intro examples) | Strip `── Next ──` decorative separators from both the single-line and phase-boundary example blocks. |
| New subsection `### Multi-Line Breadcrumb Format` | Added after the Phase boundaries paragraph inside `## Wrapped Next-Command Output`, before the mapping table. |
| New subsection `### Auto-Commit Verification` | Added after `### Multi-Line Breadcrumb Format`, before the mapping table. |
| New subsection `### Quality-Gate Pool` | Added directly after `### Auto-Commit Verification`, before the mapping table. |
| `**Step-to-command mapping:**` table | Restructured from 2 columns to 3 columns (`After Step | Standard | Strict`). All rows rewritten to commands-only output cells. Multi-case steps (2, 3, 6, 8) split into one row per case. |
| Per-step inline descriptions (`**Step 2 — Spec Review:**` through `**Step 8 — Complete:**`) | Updated to reference the new breadcrumb format, auto-commit verification, and quality-gate pool where applicable. |

---

## Commit Plan

Three commits, roughly one per subsystem. Commit 1 is the largest because it bundles the format cleanup with the Steps 2/4/8 semantic changes; the format cleanup cannot be split out cleanly without leaving SKILL.md in an incoherent mid-state.

1. **Commit 1 — Format cleanup + Multi-Line Breadcrumb Format + Steps 2, 4, 8 exit rewrites.** Strips `── Next ──` separators from Exit Output Format and Wrapped Next-Command Output examples, adds the Multi-Line Breadcrumb Format subsection, restructures the mapping table to the 3-column commands-only format, and rewrites the Step 2, Step 4, and Step 8 next-cycle exit rows + inline descriptions. No auto-commit, no quality gates yet.
2. **Commit 2 — Auto-Commit Verification subsection + Step 5 post-implement + Step 6 Case A.** Adds the auto-commit subsection, wires it into the Step 5 post-implement sequence, and rewrites Step 6's criticals/highs-remaining case to offer a 2-option (re-run review / escape to Step 8) breadcrumb.
3. **Commit 3 — Quality-Gate Pool subsection + Step 6 Case B + Step 8 Phase 2 finalize.** Adds the quality-gate pool subsection and wires two random gates into the Step 6 clean-review case and the Step 8 post-finalize success point.

Do not squash. Each commit should leave SKILL.md in a coherent, readable state.

---

## Task 1: Rewrite Exit Output Format subsection to strip decorative separators

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (Exit Output Format subsection)

- [ ] **Step 1.1: Re-read the Exit Output Format subsection for context**

Run: Read `ai-dev-tools/skills/orchestrate/SKILL.md` offset 392 limit 20

Confirm you can see the `## Exit Output Format` header, the `**Format at every exit:**` label, the code block containing `── Next ────────────────────────────────────────`, the closing-rule-line paragraph, and the `**When NOT to emit a breadcrumb:**` reference line.

- [ ] **Step 1.2: Rewrite the Exit Output Format subsection**

Use Edit with this anchor:

`old_string`:
```
## Exit Output Format

Every step exit point that hands control back to the user MUST end with the breadcrumb as the literal last line(s) of the response. No prose, no commentary, no celebration text, no "next-step" hints may follow the breadcrumb. If you need to say something to the user, say it BEFORE the breadcrumb.

**Format at every exit:**

```
[any informational output the step produces]

── Next ────────────────────────────────────────
<breadcrumb command per Step-to-command mapping, with --strict per Strict Mode Breadcrumbs>
────────────────────────────────────────────────
```

The closing rule line `────────────────────────────────────────────────` is the literal final line of the response. Nothing follows it. This applies to all 15 exit points enumerated in the audit list of the source spec, including Step 0 RED (which appends the breadcrumb after the auto-handoff prose — see "Step 0 RED auto-handoff" below).

**When NOT to emit a breadcrumb:** see the "When NOT to emit a breadcrumb" subsection below.
```

`new_string`:
```
## Exit Output Format

Every step exit point that hands control back to the user MUST end with the breadcrumb as the literal last line(s) of the response. No prose, no commentary, no celebration text, no "next-step" hints, no decorative separator lines, no headers, no labels may follow (or wrap) the breadcrumb. If you need to say something to the user, say it BEFORE the breadcrumb.

**Format at every exit:**

```
[any informational output the step produces]

<breadcrumb command(s) per Step-to-command mapping, with --strict per Strict Mode Breadcrumbs>
```

The breadcrumb itself is one or more bare command lines — no wrapper, no separator rules, no labels, no numbering. For single-option breadcrumbs this is one line. For multi-option breadcrumbs (see the Multi-Line Breadcrumb Format subsection under Wrapped Next-Command Output below) it is N lines, one literal command per line.

The literal final line of the response is the last command line of the breadcrumb. Nothing follows it. This applies to all 15 exit points enumerated in the audit list of the source spec, including Step 0 RED (which appends the breadcrumb after the auto-handoff prose — see "Step 0 RED auto-handoff" below).

**Why commands-only, no decoration:** The user copy-pastes the emitted commands into the next turn. When the conversation history contains literal commands verbatim (one per line), the history becomes a searchable audit trail that `session-handoff` can parse, orchestrate Fast-Path Detection can cross-reference against the hint file, and `git log` can correlate against by matching breadcrumb command arguments to commit messages. Any wrapper text, labels, or decorative separators pollute that audit trail and break the copy-paste flow.

**When NOT to emit a breadcrumb:** see the "When NOT to emit a breadcrumb" subsection below.
```

- [ ] **Step 1.3: Manual verification — re-read the rewritten subsection**

Run: Read `ai-dev-tools/skills/orchestrate/SKILL.md` offset 392 limit 30

Expected: the `## Exit Output Format` header, the rewritten prose emphasizing "no decorative separator lines", the new code block showing only bare `<breadcrumb command(s) ...>` without any `── Next ──` wrapping, the new "Why commands-only" paragraph, and the unchanged `**When NOT to emit a breadcrumb:**` reference line. Grep for `── Next ──` inside this subsection — MUST return zero matches.

---

## Task 2: Rewrite Wrapped Next-Command Output section intro examples

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (intro prose of `## Wrapped Next-Command Output`, both example code blocks)

- [ ] **Step 2.1: Re-read the Wrapped Next-Command Output intro for context**

Run: Read `ai-dev-tools/skills/orchestrate/SKILL.md` and grep for `## Wrapped Next-Command Output`.

Confirm you see the intro prose, the single-line example code block wrapped with `── Next ──`, the **Phase boundary breadcrumbs** paragraph, the phase-boundary example code block wrapped with `── Next ──`, and the "Phase boundaries:" sentence about which transitions use `/clear →`.

- [ ] **Step 2.2: Rewrite both intro example blocks to bare-command form**

Use Edit with this anchor:

`old_string`:
```
## Wrapped Next-Command Output

Every step's exit point outputs a breadcrumb for the user's message history:

```
── Next ────────────────────────────────────────
/orchestrate (/next-skill-command args)
────────────────────────────────────────────────
```

**Phase boundary breadcrumbs** use `/clear →` to recommend clearing context before continuing. This frees accumulated agent dispatch context between heavy phases (spec review cycle, implementation, code review cycle). The hint file persists all state needed for Fast-Path Detection to resume at the correct step.

```
── Next ────────────────────────────────────────
/clear → /orchestrate (/next-skill-command args)
────────────────────────────────────────────────
```

Phase boundaries: Steps 2-3 advancing to Step 4, Step 5 advancing to Step 6, Steps 6-7 advancing to Step 8. Steps looping within a phase (2↔3, 6↔7) do NOT recommend `/clear`.
```

`new_string`:
```
## Wrapped Next-Command Output

Every step's exit point ends the response with a breadcrumb — one or more literal next-commands, one per line, as the absolute final line(s) of the response. Single-option example:

```
/orchestrate (/next-skill-command args)
```

**Phase boundary breadcrumbs** prepend `/clear → ` to recommend clearing context before continuing. This frees accumulated agent dispatch context between heavy phases (spec review cycle, implementation, code review cycle). The hint file persists all state needed for Fast-Path Detection to resume at the correct step. Phase-boundary example:

```
/clear → /orchestrate (/next-skill-command args)
```

Phase boundaries: Steps 2-3 advancing to Step 4, Step 5 advancing to Step 6, Steps 6-7 advancing to Step 8. Steps looping within a phase (2↔3, 6↔7) do NOT recommend `/clear`.
```

- [ ] **Step 2.3: Manual verification**

Run: Grep `ai-dev-tools/skills/orchestrate/SKILL.md` for `── Next ──` — MUST return zero matches across the entire file after Tasks 1 and 2 land (all references to the decorative separator are gone). Grep for `Single-option example:` — MUST return exactly one match in the Wrapped Next-Command Output intro.

---

## Task 3: Add Multi-Line Breadcrumb Format subsection

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (add subsection after the Phase boundaries paragraph, before the `**Step-to-command mapping:**` header)

- [ ] **Step 3.1: Insert Multi-Line Breadcrumb Format subsection**

Use Edit with this anchor (the blank line plus the mapping header is the insertion point):

`old_string`:
```
Phase boundaries: Steps 2-3 advancing to Step 4, Step 5 advancing to Step 6, Steps 6-7 advancing to Step 8. Steps looping within a phase (2↔3, 6↔7) do NOT recommend `/clear`.

**Step-to-command mapping:**
```

`new_string`:
```
Phase boundaries: Steps 2-3 advancing to Step 4, Step 5 advancing to Step 6, Steps 6-7 advancing to Step 8. Steps looping within a phase (2↔3, 6↔7) do NOT recommend `/clear`.

### Multi-Line Breadcrumb Format

When a step has ≥2 alternative next-commands at a single exit point, the breadcrumb renders as stacked literal commands — one command per line — as the absolute final lines of the response. No header, no numbering, no descriptions, no separator lines, no conditional prose.

**Example** (Step 2 emits 2 options after `/review-doc` completes, strict mode):

```
/orchestrate --strict (/review-doc <spec_path> --max-iterations 2)
/orchestrate --strict (/implement <spec_path>)
```

**Rules:**

- Each line is a literal, copy-pasteable slash command identical in form to how it would look as a single-line breadcrumb.
- Options are ordered top-to-bottom by the user's likely next action. The recommended option is first; escape hatches and alternatives follow.
- No blank lines separate the commands themselves. A single blank line may appear between any informational output the step produces and the first breadcrumb line, but within the breadcrumb block all lines are contiguous.
- The absolute last line of the response is the last option's command line. Nothing follows it.
- The `--strict` propagation rule applies to every line: in strict mode, every `/orchestrate` token in every option becomes `/orchestrate --strict`. This includes wrapped and phase-boundary forms.
- Case distinctions (criticals present, clean review, phase boundary, etc.) are Claude-facing decision logic that belong in Step body prose and the mapping table's "After Step" label column. They MUST NOT appear in the rendered breadcrumb output. The end user never sees conditional prose like `if criticals > 0 — Standard: X / Strict: Y`.

**When NOT to use multi-line format:**

- Single-recommendation step boundaries (e.g., Step 1 → Step 2, Step 5 → Step 6 normal completion, Step 8 next-cycle exit when no quality gates are surfaced). Single-line is simpler and unambiguous.
- Mid-conversation prompts that are not step-boundary breadcrumbs.
- Error exits with only one valid retry path.

**Single-line exception inside multi-line blocks:** Randomly-selected quality-gate pool options (see Quality-Gate Pool subsection below) are rendered as single lines in the phase-boundary form `/clear → /<gate-name>`, one per line, alongside the recommended state-machine option. All lines in a multi-line block follow the same "one literal command per line" rule — there is no special per-option formatting.

**Step-to-command mapping:**
```

- [ ] **Step 3.2: Manual verification — re-read the inserted subsection**

Run: Read `ai-dev-tools/skills/orchestrate/SKILL.md` and grep for `### Multi-Line Breadcrumb Format`.

Expected: you see the new subsection with the intro paragraph, the strict-mode Step 2 example, the 6-item Rules list, the 3-item "When NOT to use" list, the single-line-exception paragraph, and the unchanged `**Step-to-command mapping:**` header below it. Grep for `[N]` in the subsection — MUST return zero matches (no numbering prescription). Grep for `short description` in the subsection — MUST return zero matches (no labeling prescription).

---

## Task 4: Restructure Step-to-command mapping table from 2 columns to 3 columns

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (replace the entire table header + all 8 rows)

This task does the large restructure in one edit so the table stays coherent. Subsequent tasks (5, 6, 7, 8, 9, 10 in this commit, plus tasks in commits 2 and 3) will further update specific rows with semantic changes layered on top.

- [ ] **Step 4.1: Rewrite the mapping table header and all rows**

Use Edit with this anchor:

`old_string`:
```
**Step-to-command mapping:**

Each row shows the standard-mode form first; the strict-mode form is the same string with `--strict` inserted after `/orchestrate` (per the Strict Mode Breadcrumbs subsection above). Both forms are listed inline so the implementer never has to derive them.

| After Step | Next Command (standard / strict) |
|---|---|
| 1 (Brainstorm) | Standard: `/orchestrate (/review-doc <spec_path> --max-iterations 2)`<br>Strict: `/orchestrate --strict (/review-doc <spec_path> --max-iterations 2)`<br>`<spec_path>` is the path of the newly created spec. If brainstorming did not produce a file, emit bare `/orchestrate` (or `/orchestrate --strict`) instead. |
| 2 (Spec Review) | If criticals > 0 — Standard: `/orchestrate (/respond-to-review <round> <spec_path>)` / Strict: `/orchestrate --strict (/respond-to-review <round> <spec_path>)`<br>If criticals = 0 (phase boundary, advancing to Step 4) — Standard: `/clear → /orchestrate` / Strict: `/clear → /orchestrate --strict` |
| 3 (Respond to Review) | If criticals > 0 — Standard: `/orchestrate (/review-doc <spec_path> --max-iterations 2)` / Strict: `/orchestrate --strict (/review-doc <spec_path> --max-iterations 2)`<br>If criticals = 0 (phase boundary, advancing to Step 4) — Standard: `/clear → /orchestrate` / Strict: `/clear → /orchestrate --strict` |
| 4 (Write Plan) | Standard: `/orchestrate`<br>Strict: `/orchestrate --strict`<br>(Step 5 requires its own analysis before recommending a specific command.) |
| 5 (Implement, delegating wrapper to `/implement`) | Phase boundary — implementation complete.<br>Standard: `/clear → /orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)`<br>Strict: `/clear → /orchestrate --strict (/review-code <N> --against <spec_path> --max-iterations 3)` |
| 6 (Code Review) | If findings (criticals or highs > 0) — Standard: `/orchestrate` / Strict: `/orchestrate --strict` (Fast-Path Detection routes to Step 7).<br>If no findings (phase boundary, advancing to Step 8) — Standard: `/clear → /orchestrate` / Strict: `/clear → /orchestrate --strict` |
| 7 (Fix Findings) | Standard: `/orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)`<br>Strict: `/orchestrate --strict (/review-code <N> --against <spec_path> --max-iterations 3)` |
| 8 (Complete) | Standard: `/orchestrate`<br>Strict: `/orchestrate --strict`<br>(For next feature or new cycle.) |
```

`new_string`:
```
**Step-to-command mapping:**

The table has three columns: **After Step** (case label — free to contain case-distinction prose like `criticals present` or `phase boundary advancing to Step 4`), **Standard** (literal command text for standard mode), and **Strict** (literal command text for strict mode). Output cells contain only literal `/command args` text — never conditional prose, never wrapper labels, never descriptions. When a step emits multiple options at one case, the options are stacked in the output cell using `<br>` as the line separator, rendered at runtime as one command per line per the Multi-Line Breadcrumb Format subsection above.

Rows 2, 3, 6, and 8 are split into one row per case (e.g., Step 6 has separate `criticals or highs remaining` and `clean review` rows) so each row's output cell is unambiguous.

| After Step | Standard | Strict |
|---|---|---|
| 1 (Brainstorm — brainstorming produced a spec file) | `/orchestrate (/review-doc <spec_path> --max-iterations 2)` | `/orchestrate --strict (/review-doc <spec_path> --max-iterations 2)` |
| 1 (Brainstorm — brainstorming produced no spec file) | `/orchestrate` | `/orchestrate --strict` |
| 2 (Spec Review — criticals present) | `/orchestrate (/respond-to-review <round> <spec_path>)` | `/orchestrate --strict (/respond-to-review <round> <spec_path>)` |
| 2 (Spec Review — clean, phase boundary advancing to Step 4) | `/clear → /orchestrate` | `/clear → /orchestrate --strict` |
| 3 (Respond to Review — criticals present) | `/orchestrate (/review-doc <spec_path> --max-iterations 2)` | `/orchestrate --strict (/review-doc <spec_path> --max-iterations 2)` |
| 3 (Respond to Review — clean, phase boundary advancing to Step 4) | `/clear → /orchestrate` | `/clear → /orchestrate --strict` |
| 4 (Write Plan) | `/orchestrate` | `/orchestrate --strict` |
| 5 (Implement — phase boundary advancing to Step 6) | `/clear → /orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)` | `/clear → /orchestrate --strict (/review-code <N> --against <spec_path> --max-iterations 3)` |
| 6 (Code Review — criticals or highs remaining) | `/orchestrate` | `/orchestrate --strict` |
| 6 (Code Review — clean, phase boundary advancing to Step 8) | `/clear → /orchestrate` | `/clear → /orchestrate --strict` |
| 7 (Fix Findings) | `/orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)` | `/orchestrate --strict (/review-code <N> --against <spec_path> --max-iterations 3)` |
| 8 (Complete) | `/orchestrate` | `/orchestrate --strict` |
```

- [ ] **Step 4.2: Manual verification**

Run: Read `ai-dev-tools/skills/orchestrate/SKILL.md` and locate the mapping table. Grep for `If criticals > 0` — MUST return zero matches inside the table (all conditional prose is gone). Grep for `Standard:` inside the table cells — MUST return zero matches (the `Standard:` / `Strict:` labels-inside-cells are gone; only the column headers `Standard` and `Strict` remain). Grep for `|` in the table header row — MUST show exactly 4 pipe characters (3 columns).

Visual check: every cell in the Standard and Strict columns contains only backtick-wrapped literal command text, no prose, no parentheses with explanatory notes.

---

## Task 5: Rewrite Step 2 inline description to always emit 2-option breadcrumb

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (Step 2 inline description)

- [ ] **Step 5.1: Update the Step 2 inline description**

Use Edit with this anchor:

`old_string`:
```
**Step 2 — Spec Review:** Spec exists, Status not "Approved"/"Approved with suggestions", or review not run. Present confirmation prompt with spec_path, then invoke `/review-doc {spec_path} --max-iterations 2` or user override. Edge: clean review (zero criticals) -> update spec Status to "Approved" immediately.
```

`new_string`:
```
**Step 2 — Spec Review:** Spec exists, Status not "Approved"/"Approved with suggestions", or review not run. Present confirmation prompt with spec_path, then invoke `/review-doc {spec_path} --max-iterations 2` or user override. After `/review-doc` completes, emit a 2-option multi-line breadcrumb **regardless of the review's findings count**: option 1 is `/orchestrate (/review-doc <spec_path> --max-iterations 2)` (run additional review iterations — the recommended state-machine-correct path), option 2 is `/orchestrate (/implement <spec_path>)` (skip ahead — implement directly; escape hatch). `/respond-to-review` is intentionally NOT surfaced as a breadcrumb option — the review-doc loop's own fix phase already applies critical fixes during its iterations, so a separate respond-to-review step is redundant at this boundary. If the user picks option 2 and the spec has plan-recommendation signals (see spec 02), `/implement` may still show its plan-recommendation prompt; the user can edit the breadcrumb to append `--skip-plan-recommendation` to bypass it. Render both options as bare commands stacked one per line (no numbering, no descriptions) per the Multi-Line Breadcrumb Format subsection. In strict mode, both options get the `--strict` token per Strict Mode Breadcrumbs. Edge: clean review (zero criticals) -> update spec Status to "Approved" immediately, then still emit the same 2-option breadcrumb.
```

- [ ] **Step 5.2: Update the Step 2 mapping table rows**

The Task 4 restructure left Step 2 with two rows (criticals present, clean phase boundary). This task collapses them into a single "any result" row reflecting the always-emit-2-options behavior.

Use Edit with this anchor:

`old_string`:
```
| 2 (Spec Review — criticals present) | `/orchestrate (/respond-to-review <round> <spec_path>)` | `/orchestrate --strict (/respond-to-review <round> <spec_path>)` |
| 2 (Spec Review — clean, phase boundary advancing to Step 4) | `/clear → /orchestrate` | `/clear → /orchestrate --strict` |
```

`new_string`:
```
| 2 (Spec Review — any result, always 2 options) | `/orchestrate (/review-doc <spec_path> --max-iterations 2)`<br>`/orchestrate (/implement <spec_path>)` | `/orchestrate --strict (/review-doc <spec_path> --max-iterations 2)`<br>`/orchestrate --strict (/implement <spec_path>)` |
```

- [ ] **Step 5.3: Manual verification**

Run: Read SKILL.md. Grep for `**Step 2 — Spec Review:**` and for `| 2 (Spec Review` (partial match).

Expected: the inline description mentions "2-option multi-line breadcrumb regardless of the review's findings count", explicitly states `/respond-to-review` is NOT surfaced, and names the two options as `/review-doc` and `/implement`. The mapping table has exactly one Step 2 row (the criticals/clean split is gone) with two stacked commands in the output cells.

---

## Task 6: Rewrite Step 4 inline description to always emit 2-option breadcrumb

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (Step 4 inline description)

- [ ] **Step 6.1: Update the Step 4 inline description**

Use Edit with this anchor:

`old_string`:
```
**Step 4 — Write Plan:** Spec Approved, no matching plan. ADR extraction inline per `ai-dev-tools/skills/document-for-ai/references/adr-extraction.md`, then invoke `superpowers:writing-plans`. When invoking superpowers:writing-plans, prepend to the dispatch prompt: "After saving the plan, do NOT present the Execution Handoff section. Return control to the caller. Orchestrate manages execution model selection at Step 5." If writing-plans still presents an Execution Handoff section, orchestrate ignores it and proceeds to Step 5. Edge: extraction failure -> do not auto-proceed, offer: retry/skip ADRs/exit.
```

`new_string`:
```
**Step 4 — Write Plan:** Spec Approved, no matching plan. ADR extraction inline per `ai-dev-tools/skills/document-for-ai/references/adr-extraction.md`, then invoke `superpowers:writing-plans`. When invoking superpowers:writing-plans, prepend to the dispatch prompt: "After saving the plan, do NOT present the Execution Handoff section. Return control to the caller. Orchestrate manages execution model selection at Step 5." If writing-plans still presents an Execution Handoff section, orchestrate ignores it and proceeds to Step 5. After the plan file is saved, emit a 2-option multi-line breadcrumb: option 1 is `/orchestrate (/implement <plan_path>)` (implement the plan — recommended, since `/writing-plans` is the dedicated plan-authoring skill and produces high-quality output by default), option 2 is `/orchestrate (/review-doc <plan_path>)` (review the freshly-written plan first — optional extra layer). `<plan_path>` is the plan file just saved. Render both options as bare commands stacked one per line per the Multi-Line Breadcrumb Format subsection. In strict mode, both options get the `--strict` token per Strict Mode Breadcrumbs. Edge: extraction failure -> do not auto-proceed, offer: retry/skip ADRs/exit.
```

- [ ] **Step 6.2: Update the Step 4 mapping table row**

Use Edit with this anchor:

`old_string`:
```
| 4 (Write Plan) | `/orchestrate` | `/orchestrate --strict` |
```

`new_string`:
```
| 4 (Write Plan — plan saved, always 2 options) | `/orchestrate (/implement <plan_path>)`<br>`/orchestrate (/review-doc <plan_path>)` | `/orchestrate --strict (/implement <plan_path>)`<br>`/orchestrate --strict (/review-doc <plan_path>)` |
```

- [ ] **Step 6.3: Manual verification**

Run: Read SKILL.md. Grep for `**Step 4 — Write Plan:**` and for `| 4 (Write Plan`.

Expected: the inline description now mentions "2-option multi-line breadcrumb", names both options (`/implement` and `/review-doc`), and flags `/implement` as the recommendation. The mapping row has two stacked commands in each output cell.

---

## Task 7: Rewrite Step 8 inline description for next-cycle exit (trailing prose removal)

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (Step 8 Phase 2 sub-bullet — remove the "What's next?" trailing prose and the "recommendations both appear BEFORE the breadcrumb" clause, replace with clean "emit breadcrumb as last line" wording; the quality-gate success-path breadcrumb comes in commit 3)

This task only strips the trailing-prose wording so commit 1 leaves Step 8 in a coherent "clean" state. The 3-option quality-gate breadcrumb wiring lands in Task 16 (commit 3).

- [ ] **Step 7.1: Update the Step 8 Phase 2 sub-bullet**

Use Edit with this anchor:

`old_string`:
```
- **Phase 2 (post-confirmation):** Update hint to `finalized` -> Read references/quality-gates.md -> compute baselines -> update roadmap -> print recommendations -> print "What's next?" prompt -> emit the breadcrumb (`/orchestrate` or `/orchestrate --strict` per mode) as the literal last line per the Exit Output Format subsection. The "What's next?" prompt and recommendations both appear BEFORE the breadcrumb.
```

`new_string`:
```
- **Phase 2 (post-confirmation):** Update hint to `finalized` -> Read references/quality-gates.md -> compute baselines -> update roadmap -> print recommendations -> emit the breadcrumb (`/orchestrate` or `/orchestrate --strict` per mode) as the literal last line per the Exit Output Format subsection. Recommendations appear BEFORE the breadcrumb; no trailing "What's next?" prose follows the breadcrumb.
```

- [ ] **Step 7.2: Manual verification**

Run: Read SKILL.md and grep for `**Phase 2 (post-confirmation):**`.

Expected: the Phase 2 bullet no longer contains the `"What's next?" prompt` string. It ends with "no trailing 'What's next?' prose follows the breadcrumb." The mapping table's Step 8 row (from Task 4) remains `/orchestrate` / `/orchestrate --strict` — this row is not yet touched in commit 1; it will be rewritten in commit 3 to add quality gates.

---

## Task 8: Commit 1 — Format cleanup + Multi-Line Breadcrumb Format + Steps 2/4/8 exits

- [ ] **Step 8.1: Confirm all Task 1–7 edits applied cleanly**

Run: Grep `ai-dev-tools/skills/orchestrate/SKILL.md` for these literal strings:

- `── Next ──` — MUST return 0 matches (decorative separators fully stripped)
- `### Multi-Line Breadcrumb Format` — MUST return 1 match (new subsection)
- `2-option multi-line breadcrumb **regardless of the review's findings count**` — MUST return 1 match (Step 2 inline)
- `recommended, since \`/writing-plans\` is the dedicated plan-authoring skill` — MUST return 1 match (Step 4 inline)
- `no trailing "What's next?" prose follows the breadcrumb` — MUST return 1 match (Step 8 Phase 2)
- `If criticals > 0 — Standard:` — MUST return 0 matches (all conditional prose in mapping cells is gone)
- `| After Step | Standard | Strict |` — MUST return 1 match (3-column mapping table header)

Expected: all seven checks pass as listed.

- [ ] **Step 8.2: Commit the edits**

Run:
```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "$(cat <<'EOF'
feat(orchestrate): multi-line breadcrumb format + Steps 2/4/8 rewrites

Strips `── Next ──` decorative separators from Exit Output Format and
Wrapped Next-Command Output examples — the breadcrumb is now bare
command lines as the literal last line(s) of the response. Adds the
Multi-Line Breadcrumb Format subsection prescribing commands-only
stacking (no numbering, no descriptions, no headers) for
multi-option breadcrumbs. Restructures the Step-to-command mapping
table from 2 columns to 3 columns (After Step | Standard | Strict),
moving all case distinctions into the "After Step" label column and
rewriting every output cell to contain only literal command text.
Rewrites Steps 2 and 4 to always emit 2-option breadcrumbs
(review-more vs skip-to-implement at Step 2; implement-plan vs
review-plan-first at Step 4). Drops `/respond-to-review` from the
Step 2 breadcrumb — review-doc's fix phase already handles
criticals. Strips the trailing "What's next?" prose from the Step 8
Phase 2 exit.
EOF
)"
```

Expected: commit succeeds with the message above.

- [ ] **Step 8.3: Verify the commit**

Run: `git log --oneline -1 && git diff HEAD~1 HEAD --stat`

Expected: one commit ahead, one file changed (`ai-dev-tools/skills/orchestrate/SKILL.md`).

---

## Task 9: Add Auto-Commit Verification subsection

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (add subsection after `### Multi-Line Breadcrumb Format` from Task 3, still before the `**Step-to-command mapping:**` header)

- [ ] **Step 9.1: Insert Auto-Commit Verification subsection**

Use Edit with this anchor (inserts directly after the single-line exception paragraph from Task 3 and before the `**Step-to-command mapping:**` header):

`old_string`:
```
**Single-line exception inside multi-line blocks:** Randomly-selected quality-gate pool options (see Quality-Gate Pool subsection below) are rendered as single lines in the phase-boundary form `/clear → /<gate-name>`, one per line, alongside the recommended state-machine option. All lines in a multi-line block follow the same "one literal command per line" rule — there is no special per-option formatting.

**Step-to-command mapping:**
```

`new_string`:
```
**Single-line exception inside multi-line blocks:** Randomly-selected quality-gate pool options (see Quality-Gate Pool subsection below) are rendered as single lines in the phase-boundary form `/clear → /<gate-name>`, one per line, alongside the recommended state-machine option. All lines in a multi-line block follow the same "one literal command per line" rule — there is no special per-option formatting.

### Auto-Commit Verification

Run this sequence **before** emitting the next-step breadcrumb at the following three transitions:

- After `/implement` returns control to orchestrate (Step 5 post-implement).
- After `/review-code` returns control to orchestrate (Step 6 post-review-code).
- After Step 8 finalize logic completes inside orchestrate (post-confirmation).

**Algorithm:**

1. Run `git status --porcelain`.
2. If output is **empty** (clean tree) → print `[git status: clean]` and proceed directly to the breadcrumb. No-op.
3. If output contains **only untracked files** (every line starts with `??`) → skip auto-commit, print `warning: untracked files present, not auto-committing`, proceed to the breadcrumb. Untracked files may be intentional cruft and must not be silently swept into a checkpoint commit.
4. If output contains **any modified or staged files** (any line starting with anything other than `??`) → run `git add -A && git commit -m "<message>"` using the templates below, then print the commit confirmation and proceed to the breadcrumb.

**Commit message templates (literal — bake into emission logic):**

| Trigger | Commit message template |
|---|---|
| After `/implement` returns with uncommitted modifications | `chore: post-implement checkpoint for <plan-filename>` |
| After `/review-code` returns with uncommitted modifications | `chore: post-review-code checkpoint for <spec-filename>` |
| After Step 8 finalize completes with uncommitted modifications | `chore: post-finalize checkpoint for <spec-filename>` |

`<plan-filename>` and `<spec-filename>` are the **basenames only** — no directory path, no `.md` extension. Example: a plan at `docs/superpowers/plans/2026-04-07-foo-plan.md` yields `chore: post-implement checkpoint for 2026-04-07-foo-plan`.

**Commit confirmation line (printed before the breadcrumb when a commit happens):**

```
[git status: N files modified, auto-committed as "<commit message>"]
```

**On commit failure** (e.g., pre-commit hook rejection):

- Print the git error verbatim.
- **Still emit the next-step breadcrumb**, but prepend a single warning line at the top of the breadcrumb output on its own line, followed by a blank line, followed by the breadcrumb commands:

```
**IMPORTANT** COMMIT FIRST, LAST COMMIT FAILED.

/command-1 args
/command-2 args
```

- The `**IMPORTANT** COMMIT FIRST, LAST COMMIT FAILED.` line is the first line of the warning-prepended breadcrumb output. A blank line separates it from the first command line. The breadcrumb commands follow below.
- The breadcrumb-as-last-line guarantee still holds: the absolute last line of the response is the last command line of the breadcrumb. The warning is prepended at the top, not appended at the bottom.
- Do NOT exit. The user is trusted to read the warning and choose commit-and-continue, override, or manually resolve.

**Step-to-command mapping:**
```

- [ ] **Step 9.2: Manual verification — re-read the new subsection**

Run: Read `ai-dev-tools/skills/orchestrate/SKILL.md` and grep for `### Auto-Commit Verification`.

Expected: you see the 4-step algorithm, the three-row commit message template table, the confirmation line format, and the commit-failure prepend rules. Grep inside the commit-failure example block for `── Next ──` — MUST return 0 matches (the example shows bare commands, no separator lines). Grep for `[1]` and `[2]` inside the example — MUST return 0 matches (no numbering in the example).

---

## Task 10: Rewrite Step 5 post-implement sequence in inline description

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (Step 5 inline description — currently the delegating-wrapper body landed by sub-spec 02)

- [ ] **Step 10.1: Update the Step 5 post-implement marker-check paragraph**

Note: sub-spec 02 landed a Step 5 delegating-wrapper body that already includes post-`/implement` marker handling and breadcrumb emission. This task adds the Auto-Commit Verification invocation to that sequence.

Use Edit with this anchor:

`old_string`:
```
Otherwise, emit the breadcrumb (Standard: `/orchestrate (/implement <plan-path>)`; Strict: `/orchestrate --strict (/implement <plan-path>)`) per the Strict Mode Breadcrumbs subsection, and exit. After `/implement` returns control to orchestrate, check for the marker file `tmp/implement-exit-status.md`:
- If the marker exists AND contains `early_exit: clear_context`: skip auto-commit verification, do NOT write `step: 6` (hint stays at `step: 5`), do NOT emit a Step 5 → Step 6 breadcrumb, delete the marker file, return control to the user. `/implement` has already printed its own `/clear → /implement <path> --model single` breadcrumb.
- If the marker is absent OR does not contain `early_exit: clear_context`: run the standard post-`/implement` sequence — auto-commit verification, write `step: 6` to the hint file, emit the Step 5 → Step 6 breadcrumb (Standard: `/clear → /orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)`; Strict: `/clear → /orchestrate --strict (/review-code <N> --against <spec_path> --max-iterations 3)`) per the Strict Mode Breadcrumbs subsection.
```

`new_string`:
```
Otherwise, emit the breadcrumb (Standard: `/orchestrate (/implement <plan-path>)`; Strict: `/orchestrate --strict (/implement <plan-path>)`) per the Strict Mode Breadcrumbs subsection, and exit. After `/implement` returns control to orchestrate, check for the marker file `tmp/implement-exit-status.md`:
- If the marker exists AND contains `early_exit: clear_context`: skip Auto-Commit Verification, do NOT write `step: 6` (hint stays at `step: 5`), do NOT emit a Step 5 → Step 6 breadcrumb, delete the marker file, return control to the user. `/implement` has already printed its own `/clear → /implement <path> --model single` breadcrumb as the last line of its output.
- If the marker is absent OR does not contain `early_exit: clear_context`: run the standard post-`/implement` sequence — (1) run the **Auto-Commit Verification** sequence (see the Auto-Commit Verification subsection under Wrapped Next-Command Output) with the `chore: post-implement checkpoint for <plan-filename>` template, (2) write `step: 6` to the hint file, (3) emit the Step 5 → Step 6 phase-boundary breadcrumb (Standard: `/clear → /orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)`; Strict: `/clear → /orchestrate --strict (/review-code <N> --against <spec_path> --max-iterations 3)`) as a single-line breadcrumb per the Strict Mode Breadcrumbs and Exit Output Format subsections.
```

- [ ] **Step 10.2: Manual verification**

Run: Read SKILL.md and grep for `**Step 5 — Implement:**` and the marker-check bullet.

Expected: the paragraph now names "Auto-Commit Verification" explicitly, lists the three post-`/implement` sub-steps (auto-commit, write step: 6, emit breadcrumb), and still references the early-exit-marker bypass. The Step 5 mapping table row from Task 4 (single-line phase-boundary form) is unchanged — auto-commit is an inline behavior, not a breadcrumb option.

---

## Task 11: Rewrite Step 6 inline description for Case A (criticals/highs remaining)

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (Step 6 inline description)

- [ ] **Step 11.1: Update the Step 6 inline description**

Use Edit with this anchor:

`old_string`:
```
**Step 6 — Code Review:** Commits after plan hash (`git log {plan_hash}..HEAD`). Present confirmation prompt with N and spec_path, then invoke `/review-code {N} --against {spec_path} --max-iterations 3` or user override. Edge: >50% non-feature commits interleaved -> warn.
```

`new_string`:
```
**Step 6 — Code Review:** Commits after plan hash (`git log {plan_hash}..HEAD`). Present confirmation prompt with N and spec_path, then invoke `/review-code {N} --against {spec_path} --max-iterations 3` or user override. After `/review-code` returns control to orchestrate, run the **Auto-Commit Verification** sequence with the `chore: post-review-code checkpoint for <spec-filename>` template, then emit a next-steps breadcrumb. Two cases:

- **Case A (criticals or highs remaining):** 2-option multi-line breadcrumb. Option 1 is `/clear → /orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)` (run another `/review-code` iteration — recommended, fixes remaining findings). Option 2 is `/clear → /orchestrate` (advance to Step 8 anyway — escape hatch, shown even when criticals remain; the user is trusted to know when to defer). When Case A is emitted, orchestrate writes `step: 8` to `tmp/orchestrate-state.md` **before** emitting the breadcrumb so that Fast-Path Detection's criticals check on the next invocation does not re-route bare `/clear → /orchestrate` back to Step 7. This hint-file write happens regardless of which option the user ultimately picks: if the user pastes option 1 (the wrapped `/clear → /orchestrate (/review-code ...)` form), Fast-Path Detection honors the wrapped inner command via the Wrapped Next-Command Output parsing rules and overrides the `step: 8` write. `/respond-to-review` is never rendered as an option here — review-code applies fixes during its own iterations.
- **Case B (0 criticals, 0 highs — success):** see the Quality-Gate Pool subsection below and Task 15's mapping row for the 3-option success-path breadcrumb (recommended advance + 2 random quality gates). Case B wiring lands in commit 3.

Render Case A options as bare commands stacked one per line per the Multi-Line Breadcrumb Format subsection. In strict mode, both options get the `--strict` token per Strict Mode Breadcrumbs. Edge: >50% non-feature commits interleaved -> warn.
```

- [ ] **Step 11.2: Update the Step 6 Case A mapping table row**

The Task 4 restructure left Step 6 Case A as `/orchestrate` / `/orchestrate --strict` (a single command, Fast-Path Detection routes to Step 7). This task rewrites it to the new 2-option phase-boundary form.

Use Edit with this anchor:

`old_string`:
```
| 6 (Code Review — criticals or highs remaining) | `/orchestrate` | `/orchestrate --strict` |
```

`new_string`:
```
| 6 (Code Review — criticals or highs remaining) | `/clear → /orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)`<br>`/clear → /orchestrate` | `/clear → /orchestrate --strict (/review-code <N> --against <spec_path> --max-iterations 3)`<br>`/clear → /orchestrate --strict` |
```

- [ ] **Step 11.3: Manual verification**

Run: Read SKILL.md. Grep for `**Step 6 — Code Review:**` and for `| 6 (Code Review — criticals or highs remaining)`.

Expected: inline description explicitly names "Auto-Commit Verification", describes Case A with both options and the pre-emission `step: 8` hint-file write, explains Fast-Path Detection's wrapped-command override of that write, and references Case B as "lands in commit 3". Mapping row contains two stacked commands in each cell, both phase-boundary form (`/clear → `).

---

## Task 12: Commit 2 — Auto-Commit Verification + Step 5 + Step 6 Case A

- [ ] **Step 12.1: Confirm Task 9–11 edits applied cleanly**

Run: Grep `ai-dev-tools/skills/orchestrate/SKILL.md` for:

- `### Auto-Commit Verification` — MUST return 1 match
- `chore: post-implement checkpoint for <plan-filename>` — MUST return ≥2 matches (template table + Step 5 inline)
- `chore: post-review-code checkpoint for <spec-filename>` — MUST return ≥2 matches (template table + Step 6 inline)
- `**IMPORTANT** COMMIT FIRST, LAST COMMIT FAILED.` — MUST return 1 match
- `orchestrate writes \`step: 8\` to \`tmp/orchestrate-state.md\`` — MUST return 1 match (Step 6 Case A pre-emission write)

Expected: all five checks pass.

- [ ] **Step 12.2: Commit the edits**

Run:
```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "$(cat <<'EOF'
feat(orchestrate): auto-commit verification for Step 5/6 transitions

Adds the Auto-Commit Verification subsection documenting the
git-status-porcelain algorithm, commit message templates, and the
commit-failure "prepend warning, still emit breadcrumb" behavior
(warning rendered as a bare top-line followed by bare command
lines — no decorative separators). Wires Auto-Commit Verification
into Step 5 post-implement (alongside the existing early-exit
marker bypass) before emitting the phase-boundary breadcrumb to
review-code. Rewrites Step 6 Case A (criticals/highs remaining) to
run auto-commit then emit a 2-option breadcrumb: re-run review, or
escape to Step 8. Writes step: 8 to the hint file before emission
so Fast-Path Detection honors the escape hatch.
EOF
)"
```

Expected: commit succeeds.

- [ ] **Step 12.3: Verify the commit**

Run: `git log --oneline -2 && git diff HEAD~1 HEAD --stat`

Expected: two new commits total ahead of plan 04's pre-implementation state; most recent commit touches only `ai-dev-tools/skills/orchestrate/SKILL.md`.

---

## Task 13: Add Quality-Gate Pool subsection

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (add subsection after `### Auto-Commit Verification` from Task 9, still before the `**Step-to-command mapping:**` header)

- [ ] **Step 13.1: Insert Quality-Gate Pool subsection**

Use Edit with this anchor (inserts directly after the Auto-Commit Verification commit-failure block and before the mapping header):

`old_string`:
```
- Do NOT exit. The user is trusted to read the warning and choose commit-and-continue, override, or manually resolve.

**Step-to-command mapping:**
```

`new_string`:
```
- Do NOT exit. The user is trusted to read the warning and choose commit-and-continue, override, or manually resolve.

### Quality-Gate Pool

A hardcoded pool of three quality-gate skills surfaced as additional breadcrumb options at designated success points:

1. `/api-contract-guard`
2. `/test-audit`
3. `/convention-enforcer`

**Success points that surface quality gates:**

- Step 6 Case B (review-code returned with 0 criticals, 0 highs).
- Step 8 finalize post-confirmation (post-auto-commit, at the success breadcrumb).

**Selection algorithm:**

- Use timestamp-based randomness (no seed persistence — different invocations get different picks; reproducibility is not required).
- Pick **2 distinct** entries from the pool of 3.
- Render each as a single-line option `/clear → /<gate-name>` (phase-boundary form, since quality gates clear context and run independently).
- The recommended next-step option is always rendered **first** (top line of the stacked breadcrumb). Quality-gate options are rendered on the lines below the recommended option. This positions state-machine progression as the default while keeping the gates discoverable.
- Re-randomize at every emission (no caching across steps or across invocations of the same step).

**Why random instead of round-robin or fixed:** randomness encourages users to try different gates over time. No state persistence is required. The user retains full control and can always ignore the gate options and paste the first (recommended) line.

**Defensive edge case:** if the pool ever shrinks below 2 entries (not applicable in v1 — pool is hardcoded to exactly 3), render whatever options exist without erroring out.

**Step-to-command mapping:**
```

- [ ] **Step 13.2: Manual verification**

Run: Read `ai-dev-tools/skills/orchestrate/SKILL.md` and grep for `### Quality-Gate Pool`.

Expected: you see the hardcoded 3-item pool list, the two success-point triggers, the 5-bullet selection algorithm, the rationale paragraph, and the defensive edge case note. Grep for `[1]` or `[2]` or `[3]` in the subsection — MUST return zero matches (no numbering prescription; the algorithm describes ordering as "first line" / "lines below", not `[1]`/`[2]`).

---

## Task 14: Rewrite Step 8 Phase 2 inline description for post-finalize success point

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (Step 8 Phase 2 sub-bullet — the one cleaned up in Task 7)

- [ ] **Step 14.1: Update the Step 8 Phase 2 sub-bullet**

Use Edit with this anchor (this replaces the Task 7 `new_string` — that was the interim clean state for commit 1, this is the full quality-gate wiring for commit 3):

`old_string`:
```
- **Phase 2 (post-confirmation):** Update hint to `finalized` -> Read references/quality-gates.md -> compute baselines -> update roadmap -> print recommendations -> emit the breadcrumb (`/orchestrate` or `/orchestrate --strict` per mode) as the literal last line per the Exit Output Format subsection. Recommendations appear BEFORE the breadcrumb; no trailing "What's next?" prose follows the breadcrumb.
```

`new_string`:
```
- **Phase 2 (post-confirmation):** Update hint to `finalized` -> Read references/quality-gates.md -> compute baselines -> update roadmap -> print recommendations. After all Phase 2 work completes, run the **Auto-Commit Verification** sequence with the `chore: post-finalize checkpoint for <spec-filename>` template, then emit a 3-option multi-line breadcrumb: option 1 is plain `/orchestrate` (start the next cycle — recommended; Step 1 detection invokes `superpowers:brainstorming` internally because `/brainstorming` is not a registered top-level slash command; `/orchestrate --strict` in strict mode). Options 2 and 3 are two randomly-selected quality gates from the **Quality-Gate Pool** in the form `/clear → /<gate-name>`, re-randomized on every invocation. Render all three options as bare commands stacked one per line per the Multi-Line Breadcrumb Format subsection. Recommendations appear BEFORE the breadcrumb; no trailing "What's next?" prose follows the breadcrumb.
```

- [ ] **Step 14.2: Manual verification**

Run: Read SKILL.md and grep for `**Phase 2 (post-confirmation):**`.

Expected: the Phase 2 bullet now ends with the Auto-Commit Verification invocation, the 3-option breadcrumb description, and the explicit "no trailing 'What's next?' prose" guarantee. Both "Quality-Gate Pool" and "Auto-Commit Verification" are named by their exact subsection titles.

---

## Task 15: Rewrite Step 6 Case B and Step 8 mapping table rows to include quality gates

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (two mapping table rows: Step 6 Case B and Step 8)

- [ ] **Step 15.1: Update the Step 6 Case B mapping row**

Use Edit with this anchor:

`old_string`:
```
| 6 (Code Review — clean, phase boundary advancing to Step 8) | `/clear → /orchestrate` | `/clear → /orchestrate --strict` |
```

`new_string`:
```
| 6 (Code Review — clean, phase boundary advancing to Step 8) | `/clear → /orchestrate`<br>`/clear → /<random-quality-gate-1>`<br>`/clear → /<random-quality-gate-2>` | `/clear → /orchestrate --strict`<br>`/clear → /<random-quality-gate-1>`<br>`/clear → /<random-quality-gate-2>` |
```

- [ ] **Step 15.2: Update the Step 8 mapping row**

Use Edit with this anchor:

`old_string`:
```
| 8 (Complete) | `/orchestrate` | `/orchestrate --strict` |
```

`new_string`:
```
| 8 (Complete — post-finalize success) | `/orchestrate`<br>`/clear → /<random-quality-gate-1>`<br>`/clear → /<random-quality-gate-2>` | `/orchestrate --strict`<br>`/clear → /<random-quality-gate-1>`<br>`/clear → /<random-quality-gate-2>` |
```

- [ ] **Step 15.3: Manual verification**

Run: Read SKILL.md mapping table. Grep for `<random-quality-gate-1>` — MUST return 2 matches in standard cells + 2 matches in strict cells (Step 6 Case B + Step 8) = 4 total. Grep for `<random-quality-gate-2>` — same expectation: 4 matches.

Expected: Step 6 Case B row has 3 stacked commands in each cell (recommended advance + 2 gates). Step 8 row has 3 stacked commands in each cell (recommended next-cycle + 2 gates). `/orchestrate` in Step 8 is plain (no `/clear →` prefix) — distinct from Step 6 Case B's `/clear → /orchestrate` because Step 8 explicitly notes Step 1 detection handles brainstorming internally.

---

## Task 16: Commit 3 — Quality-Gate Pool + Step 6 Case B + Step 8 finalize

- [ ] **Step 16.1: Confirm Task 13–15 edits applied cleanly**

Run: Grep `ai-dev-tools/skills/orchestrate/SKILL.md` for:

- `### Quality-Gate Pool` — MUST return 1 match
- `/api-contract-guard` — MUST return ≥1 match (pool list)
- `/test-audit` — MUST return ≥1 match
- `/convention-enforcer` — MUST return ≥1 match
- `timestamp-based randomness` — MUST return 1 match
- `chore: post-finalize checkpoint for <spec-filename>` — MUST return ≥2 matches (template table + Step 8 Phase 2 inline)
- `3-option multi-line breadcrumb` — MUST return 1 match (Step 8 Phase 2 inline)
- `<random-quality-gate-1>` — MUST return 4 matches (2 mapping rows × 2 cells = 4)

Expected: all eight checks pass.

- [ ] **Step 16.2: Commit the edits**

Run:
```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "$(cat <<'EOF'
feat(orchestrate): randomized quality-gate suggestions at success points

Adds the Quality-Gate Pool subsection documenting the hardcoded
3-entry pool (/api-contract-guard, /test-audit, /convention-enforcer),
timestamp-based random-pick-2 algorithm, and emission-time
re-randomization. Wires two random quality gates into Step 6 Case B
(clean review-code) and the Step 8 Phase 2 post-finalize success
point as additional lines stacked below the recommended
state-machine option. Step 8 Phase 2 also runs Auto-Commit
Verification with the post-finalize checkpoint template. All
breadcrumbs render as bare commands stacked one per line per the
Multi-Line Breadcrumb Format subsection — no numbering, no
descriptions.
EOF
)"
```

Expected: commit succeeds.

- [ ] **Step 16.3: Verify the commit**

Run: `git log --oneline -3 && git diff HEAD~1 HEAD --stat`

Expected: three new commits ahead of plan 04's pre-implementation state; most recent commit touches only `ai-dev-tools/skills/orchestrate/SKILL.md`.

---

## Task 17: Full-file sanity pass and mapping table audit

**Files:**
- Read only: `ai-dev-tools/skills/orchestrate/SKILL.md`

- [ ] **Step 17.1: Re-read the full Wrapped Next-Command Output section**

Run: Read `ai-dev-tools/skills/orchestrate/SKILL.md` — locate `## Wrapped Next-Command Output` and read through to the end of the mapping table.

Expected checks (all must pass):

1. `### Multi-Line Breadcrumb Format` subsection exists with the Rules list and the single-line exception paragraph.
2. `### Auto-Commit Verification` subsection exists with the 4-step algorithm, commit message table, confirmation line, and commit-failure prepend rules.
3. `### Quality-Gate Pool` subsection exists with the hardcoded 3-entry pool and the selection algorithm.
4. `**Step-to-command mapping:**` table header uses 3 columns (`After Step | Standard | Strict`) and appears after all three subsections.
5. Every mapping row's Standard and Strict cells contain only literal command text — no `If`, no `Standard:`, no `Strict:`, no parenthetical prose.
6. Step 6 has two separate rows (Case A and Case B) per plan 04.
7. Step 8 has exactly one row labeled `8 (Complete — post-finalize success)` with 3 stacked commands per cell.
8. No `── Next ──` separator appears anywhere in the file (run Grep; MUST return 0 matches).
9. No `[N]` numbering (e.g., `[1]`, `[2]`, `[3]`) appears in the Multi-Line Breadcrumb Format, Auto-Commit Verification, Quality-Gate Pool, or mapping table sections.

- [ ] **Step 17.2: Re-read the inline Steps 1–8 descriptions**

Run: Grep `ai-dev-tools/skills/orchestrate/SKILL.md` for `**Step 2 — Spec Review:**`, `**Step 4 — Write Plan:**`, `**Step 5 — Implement:**`, `**Step 6 — Code Review:**`, `**Phase 2 (post-confirmation):**`.

Expected: all five updated descriptions are in sync with the mapping table from Step 17.1. Step 2 mentions "2-option multi-line breadcrumb regardless of the review's findings count" AND explicitly drops `/respond-to-review`. Step 4 mentions "2-option multi-line breadcrumb" with `/implement` as the recommendation. Step 5 names Auto-Commit Verification and the early-exit marker bypass. Step 6 describes Case A (pre-emission `step: 8` write) and cross-references Case B to the Quality-Gate Pool. Step 8 Phase 2 names Auto-Commit Verification and the 3-option breadcrumb. No conflicting wording across the five.

- [ ] **Step 17.3: Manually invoke `/orchestrate` at Step 2 boundary (optional but recommended)**

On a small spec with a clean `/review-doc` result:

1. Run `/orchestrate (/review-doc <spec>)` on a spec with no criticals.
2. Visually confirm the emitted breadcrumb is 2 bare command lines (no numbering, no descriptions, no separators):
   - Line 1: `/orchestrate (/review-doc <spec> --max-iterations 2)` (review more)
   - Line 2: `/orchestrate (/implement <spec>)` (skip ahead)
3. Confirm the last line of the response is the `/orchestrate (/implement <spec>)` line.
4. Confirm `/respond-to-review` is nowhere in the breadcrumb.
5. Confirm there is no `── Next ──` wrapper, no `[1]` / `[2]` numbering, and no "Next steps (pick one):" header.

- [ ] **Step 17.4: Manually invoke `/orchestrate` at Step 5 boundary with uncommitted changes (optional but recommended)**

1. After `/implement` returns control, ensure the working tree has modified files (edit a scratch file if necessary).
2. Let orchestrate run Auto-Commit Verification.
3. Visually confirm: (a) `git add -A && git commit -m "chore: post-implement checkpoint for <plan-filename>"` runs, (b) confirmation line `[git status: N files modified, auto-committed as "..."]` prints, (c) single-line phase-boundary breadcrumb `/clear → /orchestrate (/review-code N --against spec --max-iterations 3)` follows as the last line — bare, no `── Next ──` wrapper.
4. Repeat with an untracked-only tree — confirm the `warning: untracked files present, not auto-committing` line prints and no commit is made.
5. Repeat with a clean tree — confirm `[git status: clean]` prints and no commit is made.

- [ ] **Step 17.5: Manually invoke `/orchestrate` at Step 6 Case B boundary (optional but recommended)**

1. On a feature with `/review-code` returning 0 criticals and 0 highs, let Step 6 emit its success-path breadcrumb.
2. Visually confirm the emitted breadcrumb is 3 bare command lines:
   - Line 1: `/clear → /orchestrate` (recommended advance)
   - Line 2: `/clear → /<random-gate-A>` (one of api-contract-guard, test-audit, convention-enforcer)
   - Line 3: `/clear → /<random-gate-B>` (a different one of the three)
3. Run the same scenario twice and confirm different gate pairs are surfaced across invocations (randomness verification).
4. Confirm no numbering, no descriptions, no `── Next ──` wrapper.

- [ ] **Step 17.6: Manually invoke `/orchestrate` at Step 8 finalize boundary (optional but recommended)**

1. Complete a cycle to Step 8 and confirm finalize.
2. Visually confirm the Phase 2 breadcrumb is 3 bare command lines:
   - Line 1: plain `/orchestrate` (NOT `/clear → /orchestrate` — Step 1 detection handles brainstorming internally)
   - Lines 2 and 3: two random `/clear → /<gate-name>` lines
3. Confirm Auto-Commit Verification ran (a checkpoint commit with the `chore: post-finalize checkpoint for <spec-filename>` message is visible in `git log`, assuming Phase 2 modified files).
4. Confirm there is no trailing "What's next?" prose after the breadcrumb — the last line is the last gate line.

- [ ] **Step 17.7: Manual invocation of commit-failure handling (optional, sensitive)**

Only do this step if you have a test feature branch — it temporarily breaks the pre-commit hook.

1. Temporarily edit `.git/hooks/pre-commit` to always `exit 1`.
2. Trigger a transition that runs Auto-Commit Verification with a dirty tree.
3. Visually confirm: (a) the git error prints verbatim, (b) the breadcrumb output begins with `**IMPORTANT** COMMIT FIRST, LAST COMMIT FAILED.` as its first line, (c) a blank line, (d) the bare command lines of the breadcrumb, (e) the last line of the response is still the last command line of the breadcrumb.
4. Restore the pre-commit hook.

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task(s) that implement it |
|---|---|
| Problem pain-point 1 (no user choice at branch points) | Task 3 (format), Task 5 (Step 2), Task 6 (Step 4), Task 11 (Step 6 Case A), Task 14 (Step 8 finalize) |
| Problem pain-point 2 (no skip-ahead at Step 2) | Task 5 |
| Problem pain-point 3 (Step 2 has only one path regardless of findings) | Task 5 (always 2 options regardless of findings count) |
| Problem pain-point 4 (no quality-gate suggestions at success points) | Task 13 (pool subsection), Task 14 (Step 8 Phase 2 inline), Task 15 (Step 6 Case B mapping + Step 8 mapping) |
| Problem pain-point 5 (no auto-commit verification across transitions) | Task 9 (subsection), Task 10 (Step 5 wiring), Task 11 (Step 6 wiring), Task 14 (Step 8 wiring) |
| Problem pain-point 6 (Step 8 bare /orchestrate + trailing prose) | Task 7 (interim trailing-prose strip), Task 14 (final Phase 2 rewrite with quality gates) |
| Scope item: Multi-line breadcrumb format (commands only, no labels) | Task 3 |
| Scope item: Auto-commit verification at 3 transitions | Task 9 (subsection) + Tasks 10, 11, 14 (wiring) |
| Scope item: Quality-gate pool (hardcoded 3, pick 2) | Task 13 |
| Scope item: Per-step rewrites for Steps 2, 4, 5 post-implement, 6 (both paths), 8 | Tasks 5, 6, 10, 11, 14, 15 |
| Scope item: Step 8 next-cycle exit trailing-prose removal | Task 7 (interim) + Task 14 (final) |
| Format cleanup: strip `── Next ──` from Exit Output Format | Task 1 |
| Format cleanup: strip `── Next ──` from Wrapped Next-Command Output examples | Task 2 |
| Format cleanup: restructure mapping table from 2 cols to 3 cols, commands-only cells | Task 4 |
| Files Modified table: only `ai-dev-tools/skills/orchestrate/SKILL.md` | All tasks modify only this file |
| Commit message templates (3 literal templates) | Task 9 (templates table) |
| Commit-failure prepend warning behavior (bare commands, no separators) | Task 9 (subsection) |
| `--strict` propagation per option | Task 3 (format rules mention strict propagation applies to every line) |
| Implementer note: table sync for Steps 2, 4, 5, 6, 8 | Tasks 5.2, 6.2, 11.2, 15.1, 15.2 (mapping row updates paired with inline description updates) |
| Step 5 early-exit marker check (spec 02 Return Contract) | Task 10 (preserves the existing marker check) |
| Step 6 Case A pre-emission `step: 8` hint-file write | Task 11 (explicit in inline description) |
| `/respond-to-review` dropped from Step 2 breadcrumb | Task 5 (explicitly stated in description and table row) |
| Untracked-only skip behavior | Task 9 (algorithm step 3) |
| Single-line quality-gate exception inside multi-line blocks | Task 3 (single-line exception paragraph) |
| Step 3 mapping row preserved (spec 04 does not rewrite Step 3 behavior) | Task 4 (reformats from conditional-prose cell into two case-per-row entries without changing emitted commands) |
| Step 7 mapping row preserved | Task 4 (reformats into 3-column without changing emitted command) |

No gaps. Every pain point, scope item, format cleanup, and implementer note has a task.

**2. Placeholder scan:** No "TBD", "TODO", "implement later", "similar to Task N", "add appropriate error handling", or "fill in details" in any task. Every Edit step has a concrete `old_string` and `new_string`. Every commit step has a literal commit message. Every verification step has a literal expected outcome.

**3. Type / naming consistency:**

- The subsection heading `### Multi-Line Breadcrumb Format` is consistent across Task 3 (insertion), Tasks 9/13 (cross-references via positional inserts after it), Tasks 5/6/11/14 (inline-description cross-references), Task 17 (audit).
- The subsection heading `### Auto-Commit Verification` is consistent across Task 9 (insertion), Tasks 10/11/14 (cross-references), Task 17 (audit).
- The subsection heading `### Quality-Gate Pool` is consistent across Task 13 (insertion), Task 14 (cross-reference), Task 17 (audit).
- The three commit message templates are literal across Task 9 (definition), Tasks 10/11/14 (invocations), Task 17 (verification): `chore: post-implement checkpoint for <plan-filename>`, `chore: post-review-code checkpoint for <spec-filename>`, `chore: post-finalize checkpoint for <spec-filename>`.
- The three quality-gate skills are named consistently: `/api-contract-guard`, `/test-audit`, `/convention-enforcer`.
- The warning literal is consistent: `**IMPORTANT** COMMIT FIRST, LAST COMMIT FAILED.` (with two asterisks on each side of IMPORTANT, uppercase, trailing period).
- The commit confirmation line format `[git status: N files modified, auto-committed as "<commit message>"]` is consistent.
- The mapping table uses the 3-column `| After Step | Standard | Strict |` header consistently across all row edits.
- All multi-option breadcrumb descriptions in inline step bodies use the phrasing "N-option multi-line breadcrumb" + "bare commands stacked one per line per the Multi-Line Breadcrumb Format subsection" + "in strict mode, [...] the `--strict` token per Strict Mode Breadcrumbs".
- All Edit steps use anchor strings (concrete `old_string` values taken from the current post-02/03 SKILL.md state) rather than line numbers.

**4. Breadcrumb-format rule enforcement:**

- Every rendered-breadcrumb example in SKILL.md (Task 1, Task 2, Task 3, Task 9 commit-failure example) uses bare commands, no decorative separators, no `[N]` labels, no conditional prose. Verified by the zero-match grep in Task 17 Step 17.1 check 8 and Step 17.1 check 9.
- Every mapping-table output cell contains only backtick-wrapped literal command text. Verified by the zero-match grep in Task 4 Step 4.2 and Task 17 Step 17.1 check 5.
- Conditional decision logic (criticals vs clean, Case A vs Case B, phase boundary vs loop) lives in Claude-facing step body prose and in the mapping table's "After Step" label column — never in rendered output. Verified by Task 17 Step 17.2.

No inconsistencies found. Plan is ready for execution.
