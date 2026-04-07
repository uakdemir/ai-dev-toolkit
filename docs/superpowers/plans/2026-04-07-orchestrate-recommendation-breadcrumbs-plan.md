# Orchestrate Recommendation Breadcrumbs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite orchestrate's step-boundary breadcrumbs to surface labeled multi-option blocks, auto-commit uncommitted work before transitions, and randomly surface quality-gate options at success points.

**Architecture:** All changes land in a single file — `ai-dev-tools/skills/orchestrate/SKILL.md`. Sub-spec 03 (strict propagation + breadcrumb-as-last-line) is assumed already landed; this plan builds on those guarantees. The edits add (a) a new "Multi-Line Breadcrumb Format" subsection, (b) an "Auto-Commit Verification" subsection, (c) a "Quality-Gate Pool" subsection, (d) per-step rewrites for Steps 2, 4, 5, 6, 8, and the Step 8 next-cycle exit, and (e) synchronized updates to the Step-to-command mapping table. Work is sliced into three coherent commits so each commit is reviewable in isolation.

**Tech Stack:** Markdown (SKILL.md is a Claude Code skill file — no code compilation, rendered by the Claude Code harness). Plain `git` CLI for auto-commit. No external libraries, no tests — this project has no test suite, so all verification is manual.

---

## File Structure

**Single file modified:** `ai-dev-tools/skills/orchestrate/SKILL.md`

No files created, moved, or deleted. No new references/ files. The three subsystem changes (multi-line breadcrumbs, auto-commit, quality-gate pool) are all localized additions plus per-step rewrites inside the existing SKILL.md.

**Section-level change map (for reviewer orientation):**

| SKILL.md section | Change |
|---|---|
| `## Wrapped Next-Command Output` | Add subsection "Multi-Line Breadcrumb Format" after the existing phase-boundary block; update the Step-to-command mapping table rows for Steps 2, 4, 5, 6, 8. |
| New subsection `## Auto-Commit Verification` | Added after `## Wrapped Next-Command Output`, before `## Error Handling`. |
| New subsection `## Quality-Gate Pool` | Added directly after `## Auto-Commit Verification`. |
| Per-step inline descriptions (`**Step 2 — Spec Review:**` through `**Step 8 — Complete:**`) | Updated to reference the new breadcrumb format, auto-commit verification, and quality-gate pool where applicable. |

---

## Commit Plan

Three commits, roughly one per subsystem:

1. **Commit 1 — Multi-Line Breadcrumb Format + per-step rewrites for Steps 2, 4, 8 next-cycle exit.** These only need the format spec; they don't invoke auto-commit or quality gates.
2. **Commit 2 — Auto-Commit Verification subsection + Step 5/6/8 rewrites that invoke it.** Adds the auto-commit block and wires it into the three transitions that depend on it.
3. **Commit 3 — Quality-Gate Pool subsection + Step 6 success-path and Step 8 finalize randomization.** Layers the randomized gate suggestions on top of the auto-commit-aware Step 6/8 rewrites from commit 2.

Do not squash. Each commit should leave SKILL.md in a coherent, readable state.

---

## Task 1: Add Multi-Line Breadcrumb Format subsection

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (add subsection after the Phase boundaries paragraph, before the `**Step-to-command mapping:**` header)

- [ ] **Step 1.1: Re-read the Wrapped Next-Command Output section for context**

Run: Read `ai-dev-tools/skills/orchestrate/SKILL.md` offset 359 limit 45

Confirm you can see the Phase boundaries paragraph ending in `do NOT recommend /clear.` and the `**Step-to-command mapping:**` header directly after it.

- [ ] **Step 1.2: Insert Multi-Line Breadcrumb Format subsection**

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

When a step has ≥2 alternative next-commands, the breadcrumb is rendered as a labeled-options block instead of a single-line breadcrumb:

```
Next steps (pick one):

  [1] short description of option 1
      /command-1 args

  [2] short description of option 2
      /command-2 args

  [3] short description of option 3
      /command-3 args
```

**Rules:**
- Options are numbered top-to-bottom starting at `[1]`.
- The recommended option is always `[1]`. When there is no clear recommendation, order by likelihood of use.
- Each option is two lines: a short description, then the literal `/command args` indented four spaces.
- A blank line separates each option from the next.
- The entire labeled-options block is the absolute final block of the response. The very last line of the response is the last `/command args` line of the last option. This extends Item 03's breadcrumb-as-last-line guarantee: multi-line blocks count as the breadcrumb for position purposes.
- The `--strict` propagation rule applies to every `/command args` line in the block, not just the recommended one. In strict mode, every `/orchestrate` token in every option becomes `/orchestrate --strict`.

**When NOT to use the multi-line format:**
- Single-recommendation step boundaries (e.g., Step 1 → Step 2, Step 5 → Step 6 normal completion, Step 8 next-cycle exit) — keep these single-line.
- Mid-conversation prompts that are not step-boundary breadcrumbs.
- Error exits with only one valid retry path.

**Single-line exception inside multi-line blocks:** Randomly-selected quality-gate pool options (see Quality-Gate Pool subsection below) are rendered as a single line (`/clear → /<gate-name>`) because the gate name is self-describing. All other options in any labeled-options block must use the two-line format.

**Step-to-command mapping:**
```

- [ ] **Step 1.3: Manual verification — re-read the inserted subsection**

Run: Read `ai-dev-tools/skills/orchestrate/SKILL.md` offset 370 limit 60

Expected: you see the new `### Multi-Line Breadcrumb Format` header, the format code block, the Rules list, the "When NOT to use" list, the single-line exception paragraph, and the unchanged `**Step-to-command mapping:**` header below it.

---

## Task 2: Rewrite Step 2 inline description + mapping table row

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (Step 2 inline description around the `**Step 2 — Spec Review:**` line, and the "2 (Spec Review)" row of the Step-to-command mapping table)

- [ ] **Step 2.1: Update the Step 2 inline description**

Use Edit with this anchor:

`old_string`:
```
**Step 2 — Spec Review:** Spec exists, Status not "Approved"/"Approved with suggestions", or review not run. Present confirmation prompt with spec_path, then invoke `/review-doc {spec_path} --max-iterations 2` or user override. Edge: clean review (zero criticals) -> update spec Status to "Approved" immediately.
```

`new_string`:
```
**Step 2 — Spec Review:** Spec exists, Status not "Approved"/"Approved with suggestions", or review not run. Present confirmation prompt with spec_path, then invoke `/review-doc {spec_path} --max-iterations 2` or user override. After `/review-doc` completes, emit a 2-option multi-line breadcrumb regardless of the review's findings count: `[1]` Run additional review iterations via `/orchestrate (/review-doc <spec> --max-iterations 2)`, `[2]` Skip ahead — implement directly via `/orchestrate (/implement <spec>)`. `[1]` is the recommended state-machine-correct path; `[2]` is the escape hatch. `/respond-to-review` is intentionally NOT surfaced as a breadcrumb option — the review-doc loop's own fix phase already applies critical fixes during its iterations, so a separate respond-to-review step is redundant at this boundary. If the user picks `[2]` and the spec has plan-recommendation signals (see spec 02), `/implement` may still show its plan-recommendation prompt; the user can edit the breadcrumb to append `--skip-plan-recommendation` to bypass it. Edge: clean review (zero criticals) -> update spec Status to "Approved" immediately, then still emit the 2-option breadcrumb.
```

- [ ] **Step 2.2: Update the Step 2 row of the Step-to-command mapping table**

Use Edit with this anchor:

`old_string`:
```
| 2 (Spec Review) | `/orchestrate (/respond-to-review <round> <spec_path>)` if criticals >0, else `/clear` → `/orchestrate` (phase boundary — advancing to Step 4) |
```

`new_string`:
```
| 2 (Spec Review) | Multi-line block (always 2 options, regardless of critical count): `[1]` `/orchestrate (/review-doc <spec_path> --max-iterations 2)` (run more iterations), `[2]` `/orchestrate (/implement <spec_path>)` (skip ahead to implement). `/respond-to-review` is never surfaced at this boundary. |
```

- [ ] **Step 2.3: Manual verification — re-read Step 2 description and mapping row**

Run: Read `ai-dev-tools/skills/orchestrate/SKILL.md` and grep for `**Step 2 — Spec Review:**` and `| 2 (Spec Review) |`.

Expected: the inline description mentions the 2-option breadcrumb and explicitly says `/respond-to-review` is not surfaced. The mapping table row lists both options.

---

## Task 3: Rewrite Step 4 inline description + mapping table row

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (Step 4 inline description and mapping row)

- [ ] **Step 3.1: Update the Step 4 inline description**

Use Edit with this anchor:

`old_string`:
```
**Step 4 — Write Plan:** Spec Approved, no matching plan. ADR extraction inline per `ai-dev-tools/skills/document-for-ai/references/adr-extraction.md`, then invoke `superpowers:writing-plans`. When invoking superpowers:writing-plans, prepend to the dispatch prompt: "After saving the plan, do NOT present the Execution Handoff section. Return control to the caller. Orchestrate manages execution model selection at Step 5." If writing-plans still presents an Execution Handoff section, orchestrate ignores it and proceeds to Step 5. Edge: extraction failure -> do not auto-proceed, offer: retry/skip ADRs/exit.
```

`new_string`:
```
**Step 4 — Write Plan:** Spec Approved, no matching plan. ADR extraction inline per `ai-dev-tools/skills/document-for-ai/references/adr-extraction.md`, then invoke `superpowers:writing-plans`. When invoking superpowers:writing-plans, prepend to the dispatch prompt: "After saving the plan, do NOT present the Execution Handoff section. Return control to the caller. Orchestrate manages execution model selection at Step 5." If writing-plans still presents an Execution Handoff section, orchestrate ignores it and proceeds to Step 5. After the plan file is saved, emit a 2-option multi-line breadcrumb: `[1]` Implement the plan via `/orchestrate (/implement <plan>)` (recommended — `/writing-plans` is the dedicated plan-authoring skill and produces high-quality output by default), `[2]` Review the freshly-written plan first via `/orchestrate (/review-doc <plan>)` (optional extra layer). `<plan>` is the plan path from the hint file. Edge: extraction failure -> do not auto-proceed, offer: retry/skip ADRs/exit.
```

- [ ] **Step 3.2: Update the Step 4 row of the Step-to-command mapping table**

Use Edit with this anchor:

`old_string`:
```
| 4 (Write Plan) | `/orchestrate` (Step 5 requires its own analysis before recommending a specific command) |
```

`new_string`:
```
| 4 (Write Plan) | Multi-line block (always 2 options): `[1]` `/orchestrate (/implement <plan_path>)` (recommended — go straight to implementation), `[2]` `/orchestrate (/review-doc <plan_path>)` (review the freshly-written plan first). |
```

- [ ] **Step 3.3: Manual verification**

Run: Read the relevant sections of SKILL.md and confirm both edits landed cleanly.

Expected: Step 4 inline description mentions the 2-option breadcrumb; mapping row lists both options; `[1]` is explicitly flagged as the recommendation.

---

## Task 4: Rewrite Step 8 next-cycle exit (trailing prose removal)

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (Step 8 row of the mapping table — the inline Step 8 description already handles the post-finalize path that gets rewritten in Task 8 below)

- [ ] **Step 4.1: Update the Step 8 row of the Step-to-command mapping table for the next-cycle exit**

Use Edit with this anchor:

`old_string`:
```
| 8 (Complete) | `/orchestrate` for next feature or new cycle |
```

`new_string`:
```
| 8 (Complete) | Two distinct emission points: (a) **post-finalize success point** — multi-line 3-option block: `[1]` `/orchestrate` (cycle complete — start the next cycle; plain, because Step 1 detection invokes `superpowers:brainstorming` internally), `[2]` `/clear → /<random-quality-gate-1>`, `[3]` `/clear → /<random-quality-gate-2>` (gates randomly picked from the Quality-Gate Pool at emission time). (b) **next-cycle exit** — single-line breadcrumb, plain `/orchestrate` with no trailing prose; `/orchestrate --strict` in strict mode. |
```

- [ ] **Step 4.2: Manual verification**

Run: Read `ai-dev-tools/skills/orchestrate/SKILL.md` and grep for `| 8 (Complete) |`.

Expected: the row lists both emission points and the next-cycle exit explicitly says "no trailing prose" and uses plain `/orchestrate`.

---

## Task 5: Commit 1 — Multi-line format + Steps 2, 4, 8 next-cycle exit

- [ ] **Step 5.1: Confirm all Task 1–4 edits applied cleanly**

Run: Grep `ai-dev-tools/skills/orchestrate/SKILL.md` for these literal strings:
- `### Multi-Line Breadcrumb Format`
- `2-option multi-line breadcrumb regardless of the review's findings count`
- `(recommended — /writing-plans is the dedicated plan-authoring skill`
- `next-cycle exit** — single-line breadcrumb, plain /orchestrate with no trailing prose`

Expected: all four strings present.

- [ ] **Step 5.2: Commit the edits**

Run:
```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "$(cat <<'EOF'
feat(orchestrate): add multi-line breadcrumb format for Steps 2, 4, 8

Adds the Multi-Line Breadcrumb Format subsection to SKILL.md and
rewrites Steps 2, 4, and the Step 8 next-cycle exit to emit labeled
option blocks where ≥2 alternatives exist. Step 2 always offers
review-more vs skip-to-implement; Step 4 always offers
implement-plan vs review-plan-first; Step 8 next-cycle exit drops
trailing prose and emits plain /orchestrate as the last line.
/respond-to-review is intentionally dropped from the Step 2
breadcrumb.
EOF
)"
```

Expected: commit succeeds with message matching the above.

- [ ] **Step 5.3: Verify the commit**

Run: `git log --oneline -1 && git diff HEAD~1 HEAD --stat`

Expected: one commit ahead, one file changed (`ai-dev-tools/skills/orchestrate/SKILL.md`).

---

## Task 6: Add Auto-Commit Verification subsection

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (add subsection after the `### Multi-Line Breadcrumb Format` subsection from Task 1, still inside `## Wrapped Next-Command Output`)

- [ ] **Step 6.1: Insert Auto-Commit Verification subsection**

Use Edit with this anchor (inserts directly after the single-line exception paragraph from Task 1 and before the `**Step-to-command mapping:**` header):

`old_string`:
```
**Single-line exception inside multi-line blocks:** Randomly-selected quality-gate pool options (see Quality-Gate Pool subsection below) are rendered as a single line (`/clear → /<gate-name>`) because the gate name is self-describing. All other options in any labeled-options block must use the two-line format.

**Step-to-command mapping:**
```

`new_string`:
```
**Single-line exception inside multi-line blocks:** Randomly-selected quality-gate pool options (see Quality-Gate Pool subsection below) are rendered as a single line (`/clear → /<gate-name>`) because the gate name is self-describing. All other options in any labeled-options block must use the two-line format.

### Auto-Commit Verification

Run this sequence **before** emitting the next-step breadcrumb at the following three transitions:
- After `/implement` returns control to orchestrate (Step 5 post-implement).
- After `/review-code` returns control to orchestrate (Step 6 post-review-code).
- After Step 8 finalize logic completes inside orchestrate.

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
- **Still emit the next-step breadcrumb**, but prepend a prominent warning line at the top of the breadcrumb output:

```
**IMPORTANT** COMMIT FIRST, LAST COMMIT FAILED.

Next steps (pick one):

  [1] short description of option 1
      /command-1 args

  [2] short description of option 2
      /command-2 args
```

- The `**IMPORTANT** COMMIT FIRST, LAST COMMIT FAILED.` line is the first line of the breadcrumb output. A blank line separates it from the standard `Next steps (pick one):` header. The labeled-options block follows below.
- The breadcrumb-as-last-line guarantee still holds: the absolute last line of the response is the last `/command args` line of the last option. The warning is prepended at the top, not appended at the bottom.
- Do NOT exit. The user is trusted to read the warning and choose commit-and-continue, override, or manually resolve.

**Step-to-command mapping:**
```

- [ ] **Step 6.2: Manual verification — re-read the new subsection**

Run: Read `ai-dev-tools/skills/orchestrate/SKILL.md` and grep for `### Auto-Commit Verification`.

Expected: you see the 4-step algorithm, the three-row commit message template table, the confirmation line format, and the commit-failure prepend rules.

---

## Task 7: Rewrite Step 5 post-implement inline description

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (Step 5 inline description and mapping row)

- [ ] **Step 7.1: Update the Step 5 inline description**

Use Edit with this anchor:

`old_string`:
```
**Step 5 — Implement:** Plan exists, implementation not confirmed complete. If the current feature is a refactor unit (matched via roadmap check): skip execution model selection, execute directly using `references/refactor-execution.md` following Pre-flight → File Operations → Verification. Otherwise: Read references/implementation-step.md: generate task graph, execution model recommendation, dispatch with overrides. Edge: user explicitly states implementation is done -> advance to Step 6; 0 commits since plan_hash -> stay at Step 5 and present implementation dispatch. User explicit confirmation always overrides the commit signal. If the user states implementation is done with 0 commits, advance to Step 6 with warning: "No commits since plan_hash — proceeding to code review at your confirmation."
```

`new_string`:
```
**Step 5 — Implement:** Plan exists, implementation not confirmed complete. If the current feature is a refactor unit (matched via roadmap check): skip execution model selection, execute directly using `references/refactor-execution.md` following Pre-flight → File Operations → Verification. Otherwise: Read references/implementation-step.md: generate task graph, execution model recommendation, dispatch with overrides. After `/implement` returns control to orchestrate, run the following sequence **before** emitting the next-step breadcrumb: (1) **Early-exit marker check** — if `tmp/implement-exit-status.md` exists and contains `early_exit: clear_context`, skip auto-commit verification, do NOT write `step: 6` to the hint file (leave `step: 5`), do NOT emit any breadcrumb from orchestrate (`/implement` has already emitted its own `/clear → /implement <path> --model single` breadcrumb as the last line), delete `tmp/implement-exit-status.md` as cleanup, and return control to the user. The marker-file schema is defined in spec 02's Return Contract with Orchestrate. (2) Otherwise, run the **Auto-Commit Verification** sequence (see Wrapped Next-Command Output) with the `chore: post-implement checkpoint for <plan-filename>` template. (3) Emit the single-line phase-boundary breadcrumb `/clear → /orchestrate (/review-code N --against spec --max-iterations 3)`. This is single-line because Step 5 → Step 6 has a single recommended path. `--against spec` is pre-filled; `--max-iterations 3` is the recommended default. In strict mode: `/clear → /orchestrate --strict (/review-code N --against spec --max-iterations 3)`. Edge: user explicitly states implementation is done -> advance to Step 6; 0 commits since plan_hash -> stay at Step 5 and present implementation dispatch. User explicit confirmation always overrides the commit signal. If the user states implementation is done with 0 commits, advance to Step 6 with warning: "No commits since plan_hash — proceeding to code review at your confirmation."
```

- [ ] **Step 7.2: Update the Step 5 row of the Step-to-command mapping table**

Use Edit with this anchor:

`old_string`:
```
| 5 (Implement) | `/clear` → `/orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)` (phase boundary — implementation complete) |
```

`new_string`:
```
| 5 (Implement) | Single-line (only one natural next path). After running Auto-Commit Verification with the `chore: post-implement checkpoint for <plan-filename>` template: `/clear → /orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)`. If `tmp/implement-exit-status.md` contains `early_exit: clear_context`, skip auto-commit and emit no breadcrumb (handoff already printed by /implement). |
```

- [ ] **Step 7.3: Manual verification**

Run: Read SKILL.md and grep for `**Step 5 — Implement:**` and `| 5 (Implement) |`.

Expected: inline description now includes the early-exit marker check, the auto-commit invocation, and the single-line breadcrumb emission; mapping row matches.

---

## Task 8: Rewrite Step 6 inline description (Case A — criticals/highs remaining)

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (Step 6 inline description)

- [ ] **Step 8.1: Update the Step 6 inline description**

Note: Step 6's inline description currently does not describe breadcrumb emission at all — it just describes how review-code is invoked. We are **appending** a new sentence block to the existing line, replacing the full line so the anchor is exact.

Use Edit with this anchor:

`old_string`:
```
**Step 6 — Code Review:** Commits after plan hash (`git log {plan_hash}..HEAD`). Present confirmation prompt with N and spec_path, then invoke `/review-code {N} --against {spec_path} --max-iterations 3` or user override. Edge: >50% non-feature commits interleaved -> warn.
```

`new_string`:
```
**Step 6 — Code Review:** Commits after plan hash (`git log {plan_hash}..HEAD`). Present confirmation prompt with N and spec_path, then invoke `/review-code {N} --against {spec_path} --max-iterations 3` or user override. After `/review-code` returns control to orchestrate, run the **Auto-Commit Verification** sequence with the `chore: post-review-code checkpoint for <spec-filename>` template, then emit a next-steps breadcrumb. Two cases: **Case A (criticals or highs remaining)** — 2-option multi-line breadcrumb: `[1]` Run another `/review-code` iteration via `/clear → /orchestrate (/review-code N --against spec --max-iterations 3)` (recommended — fix remaining findings), `[2]` Advance to Step 8 anyway via `/clear → /orchestrate` (escape hatch, shown even when criticals remain — the user is trusted to know when to defer). When `[2]` is rendered, orchestrate writes `step: 8` to `tmp/orchestrate-state.md` **before** emitting the breadcrumb so that Fast-Path Detection's criticals check on the next invocation does not re-route bare `/clear → /orchestrate` back to Step 7; this write happens regardless of which option the user ultimately picks (if the user pastes the wrapped `/clear → /orchestrate (/review-code ...)` form from `[1]`, Fast-Path Detection honors the wrapped inner command via the Wrapped Next-Command Output rules and overrides the `step: 8` write). `/respond-to-review` is never rendered as an option here — review-code applies fixes during its own iterations. **Case B (0 criticals, 0 highs — success)** — see Step 8 description and the Quality-Gate Pool subsection for the 3-option success-path breadcrumb. Edge: >50% non-feature commits interleaved -> warn.
```

- [ ] **Step 8.2: Update the Step 6 row of the Step-to-command mapping table**

Use Edit with this anchor:

`old_string`:
```
| 6 (Code Review) | if findings (criticals or highs > 0): `/orchestrate` (plain — Fast-Path Detection routes to Step 7); if no findings: `/clear` → `/orchestrate` (phase boundary — advancing to Step 8) |
```

`new_string`:
```
| 6 (Code Review) | Multi-line block (after Auto-Commit Verification with `chore: post-review-code checkpoint for <spec-filename>`). **Case A (criticals or highs remaining)** — 2 options: `[1]` `/clear → /orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)` (fix remaining findings, recommended), `[2]` `/clear → /orchestrate` (escape hatch — advance to Step 8; orchestrate writes `step: 8` to hint file before emission). **Case B (0 criticals, 0 highs)** — 3 options: `[1]` `/clear → /orchestrate` (advance to Step 8, recommended), `[2]` `/clear → /<random-quality-gate-1>`, `[3]` `/clear → /<random-quality-gate-2>` (gates randomly picked from the Quality-Gate Pool). `/respond-to-review` is never surfaced at this boundary. |
```

- [ ] **Step 8.3: Manual verification**

Run: Read SKILL.md and grep for `**Step 6 — Code Review:**` and `| 6 (Code Review) |`.

Expected: inline description describes Case A fully including the pre-emission `step: 8` hint-file write; mapping row lists both cases.

---

## Task 9: Commit 2 — Auto-commit verification + Step 5/6 wiring

- [ ] **Step 9.1: Confirm Task 6–8 edits applied cleanly**

Run: Grep `ai-dev-tools/skills/orchestrate/SKILL.md` for:
- `### Auto-Commit Verification`
- `chore: post-implement checkpoint for <plan-filename>`
- `chore: post-review-code checkpoint for <spec-filename>`
- `**IMPORTANT** COMMIT FIRST, LAST COMMIT FAILED.`
- `Early-exit marker check`
- `orchestrate writes \`step: 8\` to \`tmp/orchestrate-state.md\``

Expected: all six strings present.

- [ ] **Step 9.2: Commit the edits**

Run:
```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "$(cat <<'EOF'
feat(orchestrate): auto-commit verification for Step 5/6 transitions

Adds the Auto-Commit Verification subsection documenting the
git-status-porcelain algorithm, commit message templates, and the
commit-failure "prepend warning, still emit breadcrumb" behavior.
Rewrites Step 5 post-implement to run auto-commit (with early-exit
marker bypass) before emitting the phase-boundary breadcrumb to
review-code. Rewrites Step 6 Case A (criticals/highs remaining) to
run auto-commit then emit a 2-option breadcrumb with a first-class
escape hatch to Step 8, writing step: 8 to the hint file before
emission so Fast-Path Detection honors the escape hatch.
EOF
)"
```

Expected: commit succeeds.

- [ ] **Step 9.3: Verify the commit**

Run: `git log --oneline -2 && git diff HEAD~1 HEAD --stat`

Expected: two new commits total ahead of master's previous state; most recent commit touches only `ai-dev-tools/skills/orchestrate/SKILL.md`.

---

## Task 10: Add Quality-Gate Pool subsection

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (add subsection after the Auto-Commit Verification subsection from Task 6, still before the `**Step-to-command mapping:**` header)

- [ ] **Step 10.1: Insert Quality-Gate Pool subsection**

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
- The recommended next-step option is **always `[1]`**. Quality-gate options take slots `[2]` and `[3]`. This positions state-machine progression as the default while keeping the gates discoverable.
- Re-randomize at every emission (no caching across steps or across invocations of the same step).

**Why random instead of round-robin or fixed:** randomness encourages users to try different gates over time. No state persistence is required. The user retains full control and can always ignore the gate options and pick `[1]`.

**Defensive edge case:** if the pool ever shrinks below 2 entries (not applicable in v1 — pool is hardcoded to exactly 3), render whatever options exist without erroring out.

**Step-to-command mapping:**
```

- [ ] **Step 10.2: Manual verification**

Run: Read `ai-dev-tools/skills/orchestrate/SKILL.md` and grep for `### Quality-Gate Pool`.

Expected: you see the hardcoded 3-item pool list, the two success-point triggers, the 5-bullet selection algorithm, the rationale paragraph, and the defensive edge case note.

---

## Task 11: Rewrite Step 8 inline description for post-finalize success point

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (Step 8 inline description — the Phase 2 post-confirmation sub-bullet)

- [ ] **Step 11.1: Update Step 8 Phase 2 post-confirmation sub-bullet**

Use Edit with this anchor:

`old_string`:
```
- **Phase 2 (post-confirmation):** Update hint to `finalized` -> Read references/quality-gates.md -> compute baselines -> update roadmap -> recommendations -> "What's next?"
```

`new_string`:
```
- **Phase 2 (post-confirmation):** Update hint to `finalized` -> Read references/quality-gates.md -> compute baselines -> update roadmap -> recommendations. After all Phase 2 work completes, run the **Auto-Commit Verification** sequence with the `chore: post-finalize checkpoint for <spec-filename>` template, then emit a 3-option multi-line breadcrumb: `[1]` Cycle complete — start the next cycle via plain `/orchestrate` (recommended — Step 1 detection invokes `superpowers:brainstorming` internally because `/brainstorming` is not a registered top-level slash command; `/orchestrate --strict` in strict mode), `[2]` `/clear → /<random-quality-gate-1>`, `[3]` `/clear → /<random-quality-gate-2>`. Gates are randomly picked from the **Quality-Gate Pool** at emission time and re-randomized on every invocation. The breadcrumb replaces the previous "What's next?" trailing prose — the breadcrumb is the absolute last block of the response, with nothing after it.
```

- [ ] **Step 11.2: Manual verification**

Run: Read SKILL.md and grep for `**Phase 2 (post-confirmation):**`.

Expected: the Phase 2 bullet ends with the Auto-Commit Verification invocation, the 3-option breadcrumb, and an explicit note that the trailing "What's next?" prose is replaced.

---

## Task 12: Commit 3 — Quality-gate pool + Step 6 Case B + Step 8 finalize

- [ ] **Step 12.1: Confirm Task 10–11 edits applied cleanly**

Run: Grep `ai-dev-tools/skills/orchestrate/SKILL.md` for:
- `### Quality-Gate Pool`
- `/api-contract-guard`
- `/test-audit`
- `/convention-enforcer`
- `timestamp-based randomness`
- `chore: post-finalize checkpoint for <spec-filename>`
- `3-option multi-line breadcrumb`

Expected: all seven strings present.

- [ ] **Step 12.2: Commit the edits**

Run:
```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "$(cat <<'EOF'
feat(orchestrate): randomized quality-gate suggestions at success points

Adds the Quality-Gate Pool subsection documenting the hardcoded
3-entry pool (/api-contract-guard, /test-audit, /convention-enforcer),
timestamp-based random-pick-2 algorithm, and emission-time
re-randomization. Wires quality gates into Step 6 Case B (clean
review-code) and Step 8 Phase 2 post-finalize as options [2] and [3]
in the multi-line breadcrumb. Step 8 Phase 2 also runs Auto-Commit
Verification with the post-finalize checkpoint template and replaces
the legacy "What's next?" trailing prose.
EOF
)"
```

Expected: commit succeeds.

- [ ] **Step 12.3: Verify the commit**

Run: `git log --oneline -3 && git diff HEAD~1 HEAD --stat`

Expected: three new commits ahead of master's previous state; most recent commit touches only `ai-dev-tools/skills/orchestrate/SKILL.md`.

---

## Task 13: Full-file sanity pass and mapping table audit

**Files:**
- Read only: `ai-dev-tools/skills/orchestrate/SKILL.md`

- [ ] **Step 13.1: Re-read the full Wrapped Next-Command Output section**

Run: Read `ai-dev-tools/skills/orchestrate/SKILL.md` offset 359 limit 200

Expected checks (all must pass):
1. `### Multi-Line Breadcrumb Format` subsection exists with the Rules list and the single-line exception paragraph.
2. `### Auto-Commit Verification` subsection exists with the 4-step algorithm, commit message table, confirmation line, and commit-failure prepend rules.
3. `### Quality-Gate Pool` subsection exists with the hardcoded 3-entry pool and the selection algorithm.
4. `**Step-to-command mapping:**` table appears after all three subsections.
5. Mapping rows 2, 4, 5, 6, 8 all reflect the new breadcrumb forms. Rows 1, 3, 7 are unchanged.
6. Row 3 (Respond to Review) should still exist unchanged — spec 04 does not rewrite it; Step 3 remains reachable for `/review-doc` runs that happen outside the orchestrate loop.
7. Row 7 (Fix Findings) should still exist unchanged — spec 04 does not rewrite it.

- [ ] **Step 13.2: Re-read the inline Steps 1–8 descriptions**

Run: Read `ai-dev-tools/skills/orchestrate/SKILL.md` and grep for `**Step 5 — Implement:**`, `**Step 6 — Code Review:**`, `**Phase 2 (post-confirmation):**`, `**Step 2 — Spec Review:**`, `**Step 4 — Write Plan:**`.

Expected: all five updated descriptions are in sync with the mapping table from Step 13.1. No conflicting wording.

- [ ] **Step 13.3: Manually invoke `/orchestrate` at Step 2 boundary (optional but recommended)**

On a small spec with a clean `/review-doc` result:
1. Run `/orchestrate (/review-doc <spec>)` on a spec with no criticals.
2. Visually confirm the emitted breadcrumb is the 2-option block:
   - `[1]` Run additional review iterations (with `/review-doc`)
   - `[2]` Skip ahead — implement directly (with `/implement`)
3. Confirm the last line of the response is the `/orchestrate (/implement <spec>)` line from option `[2]`.
4. Confirm `/respond-to-review` is nowhere in the breadcrumb.

- [ ] **Step 13.4: Manually invoke `/orchestrate` at Step 5 boundary with uncommitted changes (optional but recommended)**

1. After `/implement` returns control, ensure the working tree has modified files (edit a scratch file if necessary).
2. Let orchestrate run Auto-Commit Verification.
3. Visually confirm: (a) `git add -A && git commit -m "chore: post-implement checkpoint for <plan-filename>"` runs, (b) confirmation line `[git status: N files modified, auto-committed as "..."]` prints, (c) single-line phase-boundary breadcrumb `/clear → /orchestrate (/review-code N --against spec --max-iterations 3)` follows as the last line.
4. Repeat with an untracked-only tree — confirm the `warning: untracked files present, not auto-committing` line prints and no commit is made.
5. Repeat with a clean tree — confirm `[git status: clean]` prints and no commit is made.

- [ ] **Step 13.5: Manually invoke `/orchestrate` at Step 6 Case B boundary (optional but recommended)**

1. On a feature with `/review-code` returning 0 criticals and 0 highs, let Step 6 emit its success-path breadcrumb.
2. Visually confirm the emitted breadcrumb is the 3-option block with `[1]` = `/clear → /orchestrate`, `[2]` and `[3]` = two distinct random quality gates from `/api-contract-guard`, `/test-audit`, `/convention-enforcer`.
3. Run the same scenario twice and confirm different gate pairs are surfaced across invocations (randomness verification).

- [ ] **Step 13.6: Manually invoke `/orchestrate` at Step 8 finalize boundary (optional but recommended)**

1. Complete a cycle to Step 8 and confirm finalize.
2. Visually confirm the Phase 2 breadcrumb is the 3-option block: `[1]` = plain `/orchestrate`, `[2]` and `[3]` = two random quality gates.
3. Confirm Auto-Commit Verification ran (a checkpoint commit with the `chore: post-finalize checkpoint for <spec-filename>` message is visible in `git log`, assuming Phase 2 modified files).
4. Confirm there is no trailing "What's next?" prose after the breadcrumb — the last line is the last `/command args` line of option `[3]`.

- [ ] **Step 13.7: Manual invocation of commit-failure handling (optional, sensitive)**

Only do this step if you have a test feature branch — it temporarily breaks the pre-commit hook.

1. Temporarily edit `.git/hooks/pre-commit` to always `exit 1`.
2. Trigger a transition that runs Auto-Commit Verification with a dirty tree.
3. Visually confirm: (a) the git error prints verbatim, (b) the breadcrumb output begins with `**IMPORTANT** COMMIT FIRST, LAST COMMIT FAILED.` as its first line, (c) the labeled-options block follows below that warning, (d) the last line of the response is still the last option's `/command args` line.
4. Restore the pre-commit hook.

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task(s) that implement it |
|---|---|
| Problem pain-point 1 (no user choice at branch points) | Task 1 (format), Task 2 (Step 2), Task 3 (Step 4), Task 8 (Step 6 Case A), Task 11 (Step 8 finalize) |
| Problem pain-point 2 (no skip-ahead at Step 2) | Task 2 |
| Problem pain-point 3 (Step 2 has only one path regardless of findings) | Task 2 (always 2 options regardless of findings count) |
| Problem pain-point 4 (no quality-gate suggestions at success points) | Task 10 (pool subsection), Task 8 (Step 6 Case B mapping row), Task 11 (Step 8 finalize) |
| Problem pain-point 5 (no auto-commit verification across transitions) | Task 6 (subsection), Task 7 (Step 5 wiring), Task 8 (Step 6 wiring), Task 11 (Step 8 wiring) |
| Problem pain-point 6 (Step 8 bare /orchestrate + trailing prose) | Task 4 (mapping row), Task 11 (inline description — "replaces the previous 'What's next?' trailing prose") |
| Scope item: Multi-line breadcrumb format | Task 1 |
| Scope item: Auto-commit verification at 3 transitions | Task 6 (subsection) + Tasks 7, 8, 11 (wiring) |
| Scope item: Quality-gate pool (hardcoded 3, pick 2) | Task 10 |
| Scope item: Per-step rewrites for Steps 2, 4, 5 post-implement, 6 (both paths), 8 | Tasks 2, 3, 7, 8, 11 |
| Scope item: Step 8 next-cycle exit trailing-prose removal | Task 4 |
| Files Modified table: only `ai-dev-tools/skills/orchestrate/SKILL.md` | All tasks modify only this file |
| Commit message templates (3 literal templates) | Task 6 (templates table) |
| Commit-failure prepend warning behavior | Task 6 (subsection) |
| `--strict` propagation per option | Task 1 (format rules mention strict propagation) |
| Implementer note: table sync for Steps 2, 4, 5, 6, 8 | Tasks 2.2, 3.2, 4.1, 7.2, 8.2 (mapping row updates paired with inline description updates) |
| Step 5 early-exit marker check (spec 02 Return Contract) | Task 7 (Step 7.1 includes the marker check sequence) |
| Step 6 Case A pre-emission `step: 8` hint-file write | Task 8 (Step 8.1 explicitly documents this) |
| `/respond-to-review` dropped from Step 2 breadcrumb | Task 2 (explicitly stated in description and table row) |
| Untracked-only skip behavior | Task 6 (algorithm step 3) |
| Single-line quality-gate exception inside multi-line blocks | Task 1 (single-line exception paragraph) |
| Step 3 mapping row preserved (spec 04 does not rewrite Step 3) | Task 13 Step 13.1 checkpoint 6 (audit confirms row 3 unchanged) |
| Step 7 mapping row preserved | Task 13 Step 13.1 checkpoint 7 (audit confirms row 7 unchanged) |

No gaps. Every pain point, scope item, and implementer note has a task.

**2. Placeholder scan:** No "TBD", "TODO", "implement later", "similar to Task N", "add appropriate error handling", or "fill in details" in any task. Every Edit step has a concrete `old_string` and `new_string`. Every commit step has a literal commit message. Every verification step has a literal expected outcome.

**3. Type / naming consistency:**
- The subsection heading `### Multi-Line Breadcrumb Format` is consistent across Task 1 (insertion), Task 6 (cross-reference), Task 10 (cross-reference), Task 13 (audit).
- The subsection heading `### Auto-Commit Verification` is consistent across Task 6 (insertion), Tasks 7/8/11 (cross-references), Task 13 (audit).
- The subsection heading `### Quality-Gate Pool` is consistent across Task 10 (insertion), Tasks 8/11 (cross-references), Task 13 (audit).
- The three commit message templates are literal across Task 6 (definition), Tasks 7/8/11 (invocations), Task 13 (verification): `chore: post-implement checkpoint for <plan-filename>`, `chore: post-review-code checkpoint for <spec-filename>`, `chore: post-finalize checkpoint for <spec-filename>`.
- The three quality-gate skills are named consistently: `/api-contract-guard`, `/test-audit`, `/convention-enforcer`.
- The warning literal is consistent: `**IMPORTANT** COMMIT FIRST, LAST COMMIT FAILED.` (with two asterisks on each side of IMPORTANT, uppercase, trailing period).
- The commit confirmation line format `[git status: N files modified, auto-committed as "<commit message>"]` is consistent.
- All Edit steps use anchor strings (concrete `old_string` values taken from the current SKILL.md) rather than line numbers.

No inconsistencies found. Plan is ready for execution.
