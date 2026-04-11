# orchestrate `--strict` Propagation + Breadcrumb-as-Last-Line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `--strict` mode visible in every breadcrumb form (bare, wrapped, phase-boundary) and guarantee the breadcrumb is the literal last line at every orchestrate step exit point.

**Architecture:** Pure documentation/specification edits to `ai-dev-tools/skills/orchestrate/SKILL.md`. Add a new "Strict Mode Breadcrumbs" subsection (rule + table) before the "Step-to-command mapping" table; update the mapping table itself to show standard/strict variants in one cell per row; rewrite Step 5's delegating-wrapper exit (assuming sub-spec 02 has landed and Step 5 now wraps `/implement`); audit all 15 exit points described in the spec to ensure the breadcrumb is the literal last line; add a "When NOT to emit a breadcrumb" subsection; rewrite the Step 0 RED auto-handoff path to keep prose, call `/session-handoff --light` (with fallback), and append a breadcrumb; add a Breadcrumb column to the Error Handling table.

**Tech Stack:** Markdown only. No code, no tests. Project has no test suite — verification is manual re-reads plus an optional live `/orchestrate --strict` smoke check.

**Pre-requisite:** Sub-spec 02 (Step 5 delegating wrapper for `/implement`) is assumed already merged. This plan describes the post-02 state of Step 5 and does not modify anything 02 owns.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `ai-dev-tools/skills/orchestrate/SKILL.md` | Orchestrate skill spec | Add Strict Mode Breadcrumbs subsection; update Step-to-command mapping table; audit/fix 15 exit-point breadcrumbs; add NOT-to-emit subsection; rewrite RED auto-handoff; add Breadcrumb column to Error Handling table |

No other files are touched. The `/session-handoff --light` flag itself is out of scope (separate follow-up); this plan only specifies that orchestrate calls it with that flag and falls back gracefully.

---

## Task 1: Add the "Strict Mode Breadcrumbs" subsection

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md`

**Goal:** Insert a new subsection immediately before `## Wrapped Next-Command Output` that defines the rule and the three breadcrumb forms in standard vs. strict mode. Future steps in this plan reference this subsection by name.

- [ ] **Step 1.1: Read the file region around the Wrapped Next-Command Output header**

Re-read lines 355–410 of `ai-dev-tools/skills/orchestrate/SKILL.md` to confirm the anchor string `## Wrapped Next-Command Output` is unique (it should be — there is only one such header). Note its surrounding context: it currently follows the "Step 7 re-runs" paragraph in the "Review Confirmation Prompts" section.

- [ ] **Step 1.2: Insert the Strict Mode Breadcrumbs subsection**

Use Edit on `ai-dev-tools/skills/orchestrate/SKILL.md`.

`old_string`:
```
## Wrapped Next-Command Output

Every step's exit point outputs a breadcrumb for the user's message history:
```

`new_string`:
```
## Strict Mode Breadcrumbs

Before emitting any breadcrumb, read the `mode:` field from `tmp/orchestrate-state.md`. If `mode: strict`, insert the literal token `--strict` immediately after `/orchestrate` and before any wrapped inner command. If `mode` is missing, malformed, or `standard`, emit the bare form (no flag).

| Form | Standard mode | Strict mode |
|---|---|---|
| Bare | `/orchestrate` | `/orchestrate --strict` |
| Wrapped | `/orchestrate (/inner-command args)` | `/orchestrate --strict (/inner-command args)` |
| Phase boundary | `/clear → /orchestrate (/inner-command args)` | `/clear → /orchestrate --strict (/inner-command args)` |

**Mode resolution for breadcrumb emission:** Always reread the hint file at exit-point time (do not cache from invocation start) — the user may have transitioned to strict via the mode prompt mid-invocation. If the hint file is missing at exit time (e.g., Step 0 RED before write), default to non-strict.

**Rule of thumb:** The `--strict` token attaches to the `/orchestrate` token, never inside the parentheses. For phase boundaries, the `/clear → ` prefix is unchanged; the flag still attaches to the orchestrate token.

## Wrapped Next-Command Output

Every step's exit point outputs a breadcrumb for the user's message history:
```

- [ ] **Step 1.3: Manual verification**

Re-read the inserted subsection. Confirm:
- Header is `## Strict Mode Breadcrumbs` (H2 to match siblings).
- The table has three rows (Bare, Wrapped, Phase boundary).
- The mode-resolution paragraph explicitly says to reread the hint file at exit-point time.
- The original `## Wrapped Next-Command Output` header still appears unchanged immediately after.

- [ ] **Step 1.4: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "docs(orchestrate): add Strict Mode Breadcrumbs subsection"
```

---

## Task 2: Update the Step-to-command mapping table to show strict variants

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md`

**Goal:** The existing "Step-to-command mapping" table (under `## Wrapped Next-Command Output`) lists only the standard-mode breadcrumb per step. Replace each `Next Command` cell with a two-line entry showing both the standard and strict forms, so the implementer at any step has the exact strings to copy. Step 5 already reflects post-02 state (wrapped `/implement`).

- [ ] **Step 2.1: Replace the Step-to-command mapping table**

Use Edit on `ai-dev-tools/skills/orchestrate/SKILL.md`.

`old_string`:
```
**Step-to-command mapping:**

| After Step | Next Command |
|---|---|
| 1 (Brainstorm) | `/orchestrate (/review-doc <spec_path> --max-iterations 2)` — `<spec_path>` is the path of the newly created spec. If brainstorming did not produce a file, output plain `/orchestrate` instead. |
| 2 (Spec Review) | `/orchestrate (/respond-to-review <round> <spec_path>)` if criticals >0, else `/clear` → `/orchestrate` (phase boundary — advancing to Step 4) |
| 3 (Respond to Review) | if criticals > 0 after respond-to-review: `/orchestrate (/review-doc <spec_path> --max-iterations 2)`; if criticals = 0: `/clear` → `/orchestrate` (phase boundary — advancing to Step 4) |
| 4 (Write Plan) | `/orchestrate` (Step 5 requires its own analysis before recommending a specific command) |
| 5 (Implement) | `/clear` → `/orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)` (phase boundary — implementation complete) |
| 6 (Code Review) | if findings (criticals or highs > 0): `/orchestrate` (plain — Fast-Path Detection routes to Step 7); if no findings: `/clear` → `/orchestrate` (phase boundary — advancing to Step 8) |
| 7 (Fix Findings) | `/orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)` |
| 8 (Complete) | `/orchestrate` for next feature or new cycle |
```

`new_string`:
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

- [ ] **Step 2.2: Manual verification**

Re-read the new table. Confirm every row has both a Standard and a Strict variant, the `--strict` token always sits between `/orchestrate` and the open paren (never inside parens), the `/clear → ` prefix is unchanged in both modes, and Step 5's row reflects the post-02 delegating-wrapper state (it exits with the `/clear → /orchestrate (/review-code …)` phase boundary, which is unchanged from pre-02 because Step 5's exit was already a phase boundary; the change is the wording "delegating wrapper to `/implement`" in the row label).

- [ ] **Step 2.3: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "docs(orchestrate): add strict variants to step-to-command mapping"
```

---

## Task 3: Audit and fix breadcrumb-as-last-line in Steps 0–4 prose

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md`

**Goal:** Walk through audit rows 1, 2, 4, 5, 6, 7 from the spec (Step 0 GREEN, Step 0 YELLOW, Step 1 brainstorm complete, Step 2 review complete, Step 3 respond-to-review complete, Step 4 write-plan complete) and confirm each step's prose either already ends with the breadcrumb as the literal last line or is rewritten so it does. Audit row 3 (Step 0 RED) is handled in Task 5; rows 8 (Step 5 wrapper exit), 9 (Step 6), 10 (Step 7), 11–12 (Step 8), 13 (fast-path success), 14 (User Prompt), 15 (Error Handling) are handled in Tasks 4–6.

The current SKILL.md describes step exits abstractly inside the `## Steps 1-8` block — the actual breadcrumb emission is centralized in `## Wrapped Next-Command Output`. Therefore the audit for Steps 1–4 mostly amounts to: confirm there is no inline trailing prose appended after the abstract step description that would survive as runtime output. Where needed, add an explicit "exit form: emit the breadcrumb as the literal final line" sentence so the runtime behavior is unambiguous.

- [ ] **Step 3.1: Re-read the `## Steps 1-8` section**

Re-read lines 259–321 of `ai-dev-tools/skills/orchestrate/SKILL.md` (covering `## Steps 1-8` through the end of Step 8). Look for any sentence that, in production runtime, would print after the breadcrumb. Catalog them in your scratch buffer.

- [ ] **Step 3.2: Add a centralized "Exit Output Format" subsection**

Use Edit to insert a new subsection between the Strict Mode Breadcrumbs subsection (added in Task 1) and the Wrapped Next-Command Output subsection. This subsection codifies the rule once so individual step prose can refer to it instead of repeating it.

`old_string`:
```
**Rule of thumb:** The `--strict` token attaches to the `/orchestrate` token, never inside the parentheses. For phase boundaries, the `/clear → ` prefix is unchanged; the flag still attaches to the orchestrate token.

## Wrapped Next-Command Output
```

`new_string`:
```
**Rule of thumb:** The `--strict` token attaches to the `/orchestrate` token, never inside the parentheses. For phase boundaries, the `/clear → ` prefix is unchanged; the flag still attaches to the orchestrate token.

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

## Wrapped Next-Command Output
```

- [ ] **Step 3.3: Audit Step 1 (Brainstorm) prose for trailing text after breadcrumb**

Re-read the Step 1 paragraph (currently starting `**Step 1 — Brainstorm:**` and continuing through the refactor-roadmap branch). Confirm the prose does not instruct the runtime to emit anything after the breadcrumb. If any sentence reads like "After dispatching, also tell the user X" without explicitly placing X before the breadcrumb, edit the sentence to clarify "before emitting the breadcrumb."

In the current file, the Step 1 prose ends with `Orchestrate must be re-invoked to continue — it does not automatically advance to Step 2 in the same session.` This is a specification statement, not runtime output, so no edit is required. Add a one-line confirmation comment at the end of Step 1's prose only if you change anything.

If no edit is required, proceed to Step 3.4. (Expected: no edit required.)

- [ ] **Step 3.4: Audit Step 2 (Spec Review) prose**

Re-read `**Step 2 — Spec Review:**`. Same check: no runtime output instructions after the breadcrumb. The current prose ends `clean review (zero criticals) -> update spec Status to "Approved" immediately.` That is a side-effect instruction, not trailing output. No edit required.

- [ ] **Step 3.5: Audit Step 3 (Respond to Review) prose**

Re-read `**Step 3 — Respond to Review:**`. Current ending: `Edge: High>0 only -> informational, advance to Step 4.` That is an edge-case routing instruction; the "informational" message is delivered before exit. Add a clarifying sentence to make this explicit:

Use Edit.

`old_string`:
```
**Step 3 — Respond to Review:** review-doc-summary.md Reviewed matches spec AND Critical>0. Invoke `/respond-to-review {round} {spec_path}` (round = count `## Round N` sections in `tmp/response_analysis.md` matching current spec + 1; default 1). Loop 2-3 until zero criticals. Edge: High>0 only -> informational, advance to Step 4.
```

`new_string`:
```
**Step 3 — Respond to Review:** review-doc-summary.md Reviewed matches spec AND Critical>0. Invoke `/respond-to-review {round} {spec_path}` (round = count `## Round N` sections in `tmp/response_analysis.md` matching current spec + 1; default 1). Loop 2-3 until zero criticals. Edge: High>0 only -> print the informational message BEFORE the breadcrumb, then advance to Step 4 with the breadcrumb as the literal last line per the Exit Output Format subsection.
```

- [ ] **Step 3.6: Audit Step 4 (Write Plan) prose**

Re-read `**Step 4 — Write Plan:**`. The current prose includes the dispatch-prompt instruction "After saving the plan, do NOT present the Execution Handoff section." That instruction is for the writing-plans subagent, not for orchestrate's own exit, so it does not affect breadcrumb position. The Step 4 prose is otherwise specification-only; no edit required.

- [ ] **Step 3.7: Manual verification**

Re-read Steps 1–4 in the modified file. Confirm:
- Only Step 3 received an inline edit in this task.
- The new "Exit Output Format" subsection is present between Strict Mode Breadcrumbs and Wrapped Next-Command Output.
- Every Step 1–4 paragraph either makes no claim about post-breadcrumb output, or explicitly says "before the breadcrumb."

- [ ] **Step 3.8: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "docs(orchestrate): add Exit Output Format rule and audit Steps 1-4"
```

---

## Task 4: Audit and fix breadcrumb-as-last-line in Steps 5–8 prose

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md`

**Goal:** Audit rows 8 (Step 5 delegating wrapper exit, post-02), 9 (Step 6 code-review complete), 10 (Step 7 fix-findings exit), 11 (Step 8 finalize), 12 (Step 8 brainstorm-next exit). The Step 5 row assumes sub-spec 02 has landed, so Step 5 is now a delegating wrapper that invokes `/implement` and exits with the standard phase-boundary breadcrumb.

- [ ] **Step 4.1: Audit Step 5 prose (post-02 state)**

Re-read `**Step 5 — Implement:**`. Sub-spec 02 has rewritten this paragraph so Step 5 is a delegating wrapper to `/implement`. The breadcrumb at exit is the phase-boundary form per row 5 of the Step-to-command mapping table. Confirm the post-02 prose does not append "After implementation completes, also do X" runtime instructions after the wrapper exits. If post-02 Step 5 prose includes such instructions, edit them to specify "before emitting the breadcrumb" — but the current pre-02 file does not, so the expected outcome of this step is no edit.

If sub-spec 02's Step 5 rewrite has not actually landed at the time this plan is executed, halt and surface this back to the orchestrate caller — Task 4 depends on the post-02 file shape.

- [ ] **Step 4.2: Audit Step 6 prose**

Re-read `**Step 6 — Code Review:**`. Current ending: `Edge: >50% non-feature commits interleaved -> warn.` The warning is delivered inside the confirmation prompt or before the breadcrumb. No edit required to the Step 6 paragraph itself. The "today: breadcrumb followed by next-step prose" issue from audit row 9 is resolved at runtime by the new Exit Output Format subsection from Task 3 — there is no inline prose to edit because Step 6's breadcrumb is generated centrally via the Step-to-command mapping.

- [ ] **Step 4.3: Audit Step 7 prose**

Re-read `**Step 7 — Fix Findings:**`. Current text: `Apply fixes, re-run /review-code. Loop 6-7 until clean. Edge: NOT /respond-to-review -- that is for doc reviews only.` The `/review-code` re-run happens within the same orchestrate invocation (per "Step 7 re-runs" paragraph in Review Confirmation Prompts). The exit breadcrumb is the wrapped `/orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)` form per row 7 of the mapping table. No inline trailing prose to edit. Confirm by re-reading.

- [ ] **Step 4.4: Audit Step 8 (Complete) prose**

Re-read `**Step 8 — Complete:**` through the end of the bullet list. Step 8 has two phases (pre-confirmation and post-confirmation) plus refactor-roadmap branching plus a `--strict Phase 2` variant. The post-confirmation phase ends with `recommendations -> "What's next?"` — the "What's next?" prompt is the runtime equivalent of celebration prose. Edit to clarify exit-output ordering:

Use Edit.

`old_string`:
```
- **Phase 2 (post-confirmation):** Update hint to `finalized` -> Read references/quality-gates.md -> compute baselines -> update roadmap -> recommendations -> "What's next?"
```

`new_string`:
```
- **Phase 2 (post-confirmation):** Update hint to `finalized` -> Read references/quality-gates.md -> compute baselines -> update roadmap -> print recommendations -> print "What's next?" prompt -> emit the breadcrumb (`/orchestrate` or `/orchestrate --strict` per mode) as the literal last line per the Exit Output Format subsection. The "What's next?" prompt and recommendations both appear BEFORE the breadcrumb.
```

- [ ] **Step 4.5: Audit Step 8 brainstorm-next exit**

Re-read the refactor-roadmap branch inside Step 8 that ends with `Orchestrate must be re-invoked to continue — it does not automatically advance to Step 2 in the same session.` This is the audit row 12 site (plain `/orchestrate` followed by prose). Edit to make exit ordering explicit:

Use Edit.

`old_string`:
```
    After --next-unit completes and produces a new single-unit spec,
    write hint (feature: <next-unit-name>, step: 2) and exit.
    Orchestrate must be re-invoked to continue — it does not
    automatically advance to Step 2 in the same session.
- **--strict Phase 2:** Update hint to `finalized` -> Read references/strict-mode.md (verification gate) -> Read references/quality-gates.md (baselines) -> roadmap -> structured finishing.
```

`new_string`:
```
    After --next-unit completes and produces a new single-unit spec,
    write hint (feature: <next-unit-name>, step: 2) and exit.
    Print the "Orchestrate must be re-invoked to continue — it does not
    automatically advance to Step 2 in the same session." advisory BEFORE
    the breadcrumb. Then emit the breadcrumb (`/orchestrate` or
    `/orchestrate --strict` per mode) as the literal last line per the
    Exit Output Format subsection.
- **--strict Phase 2:** Update hint to `finalized` -> Read references/strict-mode.md (verification gate) -> Read references/quality-gates.md (baselines) -> roadmap -> print structured-finishing output -> emit the breadcrumb (`/orchestrate --strict`) as the literal last line per the Exit Output Format subsection.
```

- [ ] **Step 4.6: Manual verification**

Re-read Steps 5–8 in the modified file. Confirm:
- Step 5 is unchanged (post-02 delegating wrapper, no edit needed in this task).
- Step 6 is unchanged.
- Step 7 is unchanged.
- Step 8 Phase 2 (post-confirmation) explicitly says the "What's next?" prompt and recommendations precede the breadcrumb.
- The refactor-roadmap branch and `--strict Phase 2` variant both explicitly say the breadcrumb is the literal last line.

- [ ] **Step 4.7: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "docs(orchestrate): clarify Step 8 exit ordering — breadcrumb last"
```

---

## Task 5: Rewrite Step 0 RED auto-handoff and fast-path / user-prompt exits

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md`

**Goal:** Cover audit row 3 (Step 0 RED auto-handoff: keep prose, call `/session-handoff --light` with fallback, append breadcrumb), row 13 (fast-path detection success exit), and row 14 (User Prompt fallback exit). Also cover the Step 0 GREEN/YELLOW exits referenced in audit rows 1 and 2 (these flow into the next step's normal exit, but the YELLOW auto-handoff branch shares the RED rewrite pattern so it gets the same treatment).

- [ ] **Step 5.1: Rewrite the RED behavior paragraph in Step 0**

Use Edit on `ai-dev-tools/skills/orchestrate/SKILL.md`.

`old_string`:
```
**RED behavior:** Print `⚠ Context critically low (~X% estimated). Generating session handoff...` Auto-run `/session-handoff`. Print `Session handoff saved. Start a new conversation and run /orchestrate to continue.` Exit.
```

`new_string`:
```
**RED behavior:** Print the prose block, then auto-run `/session-handoff --light`, then append the breadcrumb. The breadcrumb is the literal last line per the Exit Output Format subsection.

```
⚠ Context critically low (~X% estimated). Saving a light session handoff
before auto-compact triggers...

[/session-handoff --light is now running]

After the handoff doc is written, resume in a fresh session with the
breadcrumb below.

── Next ────────────────────────────────────────
/orchestrate            ← if mode: standard (or no mode field)
/orchestrate --strict   ← if mode: strict
────────────────────────────────────────────────
```

Pick exactly one of the two `/orchestrate` lines based on the hint file's `mode:` field (or the `--strict` flag from the current invocation if the hint file has not been written yet). Do NOT print both lines — the breadcrumb must be a single concrete command. The format above shows both options for documentation purposes only.

**Fallback for `--light` flag:** If `/session-handoff --light` errors with an unrecognized-flag response (the `--light` flag is a known follow-up to the session-handoff skill and may not yet be implemented), retry with plain `/session-handoff`. The prose and breadcrumb output are identical either way — only the handoff doc size differs. Wrap the `--light` invocation in a try/fallback so the RED path is never broken by a missing flag.
```

- [ ] **Step 5.2: Audit Step 0 GREEN/YELLOW exit prose**

Re-read the Step 0 zone table and the paragraphs immediately after it. GREEN proceeds to state detection (no exit, no breadcrumb). YELLOW proceeds to state detection then evaluates at the YELLOW gate (`**YELLOW gate:** After detection, if YELLOW and next step is heavy (5/6/7), auto-handoff. If moderate/light (1/2/3/4/8), warn and proceed.`). The auto-handoff branch shares the RED auto-handoff path; the warn-and-proceed branch defers to the normal step exit. No additional edits needed in this step beyond the RED rewrite — but extend the YELLOW gate paragraph to explicitly reference the RED behavior for its auto-handoff branch:

Use Edit.

`old_string`:
```
**YELLOW gate:** After detection, if YELLOW and next step is heavy (5/6/7), auto-handoff. If moderate/light (1/2/3/4/8), warn and proceed.
```

`new_string`:
```
**YELLOW gate:** After detection, if YELLOW and next step is heavy (5/6/7), auto-handoff using the same RED behavior path (prose + `/session-handoff --light` with fallback + breadcrumb as literal last line). If moderate/light (1/2/3/4/8), warn and proceed — the warning is printed BEFORE whatever breadcrumb the downstream step emits at its own exit, per the Exit Output Format subsection.
```

- [ ] **Step 5.3: Audit fast-path detection success exit**

Re-read the Fast-Path Detection Algorithm block. The success branch ends "advance step" or "trust hint, skip to step-specific validation" — neither prints output directly. Output happens at the next step's exit, which is already covered by Tasks 3 and 4. No edit required, but add a one-line confirmation footer to the algorithm block:

Use Edit.

`old_string`:
```
If validation contradicts hint, advance to next logical step (don't rescan).
```

`new_string`:
```
If validation contradicts hint, advance to next logical step (don't rescan).

**Exit:** Fast-path detection itself does not emit a breadcrumb. It hands off to the resolved step, whose own exit emits the breadcrumb per the Exit Output Format subsection.
```

- [ ] **Step 5.4: Audit User Prompt fallback exit**

Re-read the `## User Prompt` section. Step 5 of the User Prompt block ("If still unclear after 2-3 rounds:") ends `Proceed to the resolved or default step.` Same hand-off pattern: User Prompt does not emit its own breadcrumb. Add a clarifying footer:

Use Edit.

`old_string`:
```
5. If still unclear after 2-3 rounds:
   → Print: "I can't determine the state automatically.
     Please describe your current step more specifically,
     or check tmp/orchestrate-state.md and update it manually."
   → Write hint with whatever was resolved (feature if known,
     step 1 as default). Proceed to the resolved or default step.
```

`new_string`:
```
5. If still unclear after 2-3 rounds:
   → Print: "I can't determine the state automatically.
     Please describe your current step more specifically,
     or check tmp/orchestrate-state.md and update it manually."
   → Write hint with whatever was resolved (feature if known,
     step 1 as default). Proceed to the resolved or default step,
     whose own exit emits the breadcrumb per the Exit Output Format
     subsection. User Prompt itself does not emit a breadcrumb on
     mid-conversation clarifying questions (rounds 1-3) — those are
     inline prompts, not exits, per the When NOT to emit a breadcrumb
     subsection.
```

- [ ] **Step 5.5: Manual verification**

Re-read the modified Step 0 RED block, the YELLOW gate paragraph, the Fast-Path Detection footer, and the User Prompt footer. Confirm:
- RED prose, `/session-handoff --light` call, fallback to plain `/session-handoff`, and breadcrumb-as-last-line are all present.
- YELLOW gate explicitly references the RED auto-handoff behavior path.
- Fast-path detection and User Prompt explicitly say they do not emit their own breadcrumbs (control hands off to the resolved step).
- The User Prompt clarification rounds (1–3) are explicitly called out as inline prompts that do NOT emit breadcrumbs (forward reference to the When NOT to emit subsection added in Task 6).

- [ ] **Step 5.6: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "docs(orchestrate): rewrite RED auto-handoff and fast-path/user-prompt exits"
```

---

## Task 6: Add the "When NOT to emit a breadcrumb" subsection

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md`

**Goal:** Add the subsection from spec Change 3, listing the four cases where breadcrumbs are forbidden. Place it immediately after the Exit Output Format subsection (which references it by name in Task 3).

- [ ] **Step 6.1: Insert the When NOT to emit subsection**

Use Edit on `ai-dev-tools/skills/orchestrate/SKILL.md`.

`old_string`:
```
**When NOT to emit a breadcrumb:** see the "When NOT to emit a breadcrumb" subsection below.

## Wrapped Next-Command Output
```

`new_string`:
```
**When NOT to emit a breadcrumb:** see the "When NOT to emit a breadcrumb" subsection below.

## When NOT to emit a breadcrumb

Breadcrumbs are emitted ONLY at the moment the skill is exiting and handing control back to the user, signaling "here is what to run next." The following situations are NOT exits — do not emit a breadcrumb:

- **Mid-conversation clarifying questions** ("Which plan should I implement?" "Confirm spec path?") — these are inline prompts; the skill is awaiting user input before continuing.
- **Tool-output displays** ("Here's the task graph:" "Here's the diff preview:") — these are informational, not transitions.
- **Validation failures that loop back internally** ("Plan parse failed, retrying with relaxed mode") — internal retry, not a step boundary.
- **Any output that the user is expected to respond to before the skill continues.**

When in doubt: ask "is the skill returning control to the shell after this output?" If yes, emit a breadcrumb. If no (the user will type a reply that the skill processes inline), do not emit a breadcrumb.

## Wrapped Next-Command Output
```

- [ ] **Step 6.2: Manual verification**

Re-read the inserted subsection. Confirm it has all four bullets from the spec, the "When in doubt" guidance is present, and the original `## Wrapped Next-Command Output` header still appears unchanged immediately after.

- [ ] **Step 6.3: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "docs(orchestrate): add When NOT to emit a breadcrumb subsection"
```

---

## Task 7: Add Breadcrumb column to the Error Handling table

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md`

**Goal:** Per spec Change 5, add a third column to the Error Handling table showing the breadcrumb that should be emitted on each error path. Inline-prompt rows get `(no breadcrumb — inline prompt)` to make the absence explicit.

- [ ] **Step 7.1: Re-read the existing Error Handling table**

Re-read lines 411–425 of `ai-dev-tools/skills/orchestrate/SKILL.md` to confirm the row labels in the current file match what the spec assumed. Note: the table currently has 11 rows (one per scenario). Each row needs a breadcrumb cell.

- [ ] **Step 7.2: Replace the Error Handling table**

Use Edit on `ai-dev-tools/skills/orchestrate/SKILL.md`.

`old_string`:
```
## Error Handling

| Scenario | Behavior |
|---|---|
| Hint file missing or YAML malformed | User Prompt (both modes). Write hint after resolution. |
| Unknown step/feature or head not in history | User Prompt. Write hint after resolution. |
| Hint says finalized but spec deleted | Write hint (step: 1, clear fields) → route to Step 1. |
| Hint validation contradicts hint step | Advance to next logical step (don't rescan). |
| Quality gate git commands fail | Skip that gate, warn. |
| references/ file missing | Error: "orchestrate reference file missing: {path}. Re-install the ai-dev-tools plugin." |
| Multiple features in-progress | Present list, ask user to pick. Update hint. |
| No roadmap file | Ask "What feature?" at Step 1. Skip roadmap update at Step 8. |
| Invoked skill fails | Report failure, offer: Retry / Skip / Exit. |
| Context pressure (YELLOW/RED) | Handled by Step 0 + YELLOW gate. Resume via artifacts on next invocation. |
| No test/build command discoverable (--strict) | Discovery: (1) check CLAUDE.md, (2) package.json scripts, (3) Makefile test target, (4) probe pytest/jest/cargo test. None found → skip verification gate: "No verification command found. Configure in CLAUDE.md." |
| No valid cycle state + strict mode | User Prompt → targeted validation → hint write. If unresolved after 2-3 rounds, default to step 1 with whatever was resolved. |
```

`new_string`:
```
## Error Handling

The Breadcrumb column shows the literal last line of the response for each error path. Inline-prompt rows are explicitly marked `(no breadcrumb — inline prompt)` per the When NOT to emit a breadcrumb subsection. Strict-mode breadcrumbs replace `/orchestrate` with `/orchestrate --strict` per the Strict Mode Breadcrumbs subsection — both forms are shown for unambiguous rows.

| Scenario | Behavior | Breadcrumb (last line of output) |
|---|---|---|
| Hint file missing or YAML malformed | User Prompt (both modes). Write hint after resolution. | (no breadcrumb — inline prompt; clarification rounds are not exits. The downstream step's exit emits the breadcrumb in its own mode.) |
| Unknown step/feature or head not in history | User Prompt. Write hint after resolution. | (no breadcrumb — inline prompt; downstream step exit handles emission.) |
| Hint says finalized but spec deleted | Write hint (step: 1, clear fields) → route to Step 1. | Standard: `/orchestrate` / Strict: `/orchestrate --strict` (Step 1 routing exit, per row 1 of Step-to-command mapping if brainstorming did not produce a file). |
| Hint validation contradicts hint step | Advance to next logical step (don't rescan). | The next-logical-step's exit breadcrumb per the Step-to-command mapping (in standard or strict per mode). |
| Quality gate git commands fail | Skip that gate, warn. | The Step 8 exit breadcrumb (Standard: `/orchestrate` / Strict: `/orchestrate --strict`); the warning is printed BEFORE the breadcrumb. |
| references/ file missing | Error: "orchestrate reference file missing: {path}. Re-install the ai-dev-tools plugin." | (no breadcrumb — hard error; the user must reinstall before re-invoking.) |
| Multiple features in-progress | Present list, ask user to pick. Update hint. | (no breadcrumb — inline prompt; the resolved step's exit emits the breadcrumb in its own mode.) |
| No roadmap file | Ask "What feature?" at Step 1. Skip roadmap update at Step 8. | (no breadcrumb on the Step 1 question — inline prompt. Step 8 still emits its normal exit breadcrumb in Standard or Strict per mode.) |
| Invoked skill fails | Report failure, offer: Retry / Skip / Exit. | If user picks Retry: (no breadcrumb — inline retry). If user picks Skip: the next step's exit breadcrumb per Step-to-command mapping. If user picks Exit: Standard: `/orchestrate` / Strict: `/orchestrate --strict` (so the user can re-invoke after fixing the underlying issue). |
| Context pressure (YELLOW/RED) | Handled by Step 0 + YELLOW gate. Resume via artifacts on next invocation. | RED auto-handoff path: Standard: `/orchestrate` / Strict: `/orchestrate --strict` (per mode), as the literal last line after the prose + `/session-handoff --light` call (see Step 0 RED behavior). YELLOW warn-and-proceed: the downstream step's normal exit breadcrumb. |
| No test/build command discoverable (--strict) | Discovery: (1) check CLAUDE.md, (2) package.json scripts, (3) Makefile test target, (4) probe pytest/jest/cargo test. None found → skip verification gate: "No verification command found. Configure in CLAUDE.md." | The Step 8 exit breadcrumb (`/orchestrate --strict`, since this row only fires in strict mode); the skip-warning is printed BEFORE the breadcrumb. |
| No valid cycle state + strict mode | User Prompt → targeted validation → hint write. If unresolved after 2-3 rounds, default to step 1 with whatever was resolved. | (no breadcrumb during clarification rounds — inline prompts. After resolution, the resolved step's exit emits `/orchestrate --strict` per mode.) |
```

- [ ] **Step 7.3: Manual verification**

Re-read the modified Error Handling table. Confirm:
- Every row has a Breadcrumb column.
- Inline-prompt rows are explicitly marked with the parenthetical `(no breadcrumb — …)` form.
- Rows that do emit a breadcrumb show both Standard and Strict variants (or, where the row only fires in strict mode, show only the strict form with a parenthetical).
- The "Context pressure (YELLOW/RED)" row references the Step 0 RED behavior block from Task 5.

- [ ] **Step 7.4: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "docs(orchestrate): add Breadcrumb column to Error Handling table"
```

---

## Task 8: Cross-reference sweep and full-file re-read

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md` (only if cross-reference fixes are needed)

**Goal:** With all the new subsections and table edits in place, do a full-file re-read of `ai-dev-tools/skills/orchestrate/SKILL.md` and verify every cross-reference resolves and every audit-list site is covered.

- [ ] **Step 8.1: Full-file re-read**

Read the entire modified `ai-dev-tools/skills/orchestrate/SKILL.md` from top to bottom.

- [ ] **Step 8.2: Cross-reference checklist**

For each of the following, confirm the named subsection exists and is referenced from at least one other location:

- [ ] `## Strict Mode Breadcrumbs` exists; referenced from the Step-to-command mapping table intro and the Error Handling table intro.
- [ ] `## Exit Output Format` exists; referenced from Step 3, Step 8 (Phase 2 + refactor branch + --strict Phase 2), Step 0 RED behavior, YELLOW gate, fast-path detection footer, User Prompt footer, and the Error Handling table intro.
- [ ] `## When NOT to emit a breadcrumb` exists; referenced from the Exit Output Format subsection, the User Prompt footer, and the Error Handling table intro.
- [ ] `## Wrapped Next-Command Output` is unchanged in position (still follows the three new subsections) and its Step-to-command mapping table now has the Standard / Strict variants per row.

- [ ] **Step 8.3: Audit-list checklist**

Walk through all 15 audit rows from the spec and confirm each is covered by the modified file:

- [ ] Row 1 (Step 0 GREEN exit): GREEN proceeds to state detection — no direct exit, downstream step handles. Covered by Exit Output Format + Tasks 3/4.
- [ ] Row 2 (Step 0 YELLOW exit): YELLOW gate paragraph rewritten in Task 5.
- [ ] Row 3 (Step 0 RED auto-handoff): RED behavior block rewritten in Task 5.
- [ ] Row 4 (Step 1 brainstorm complete): Covered by Exit Output Format and Step 1 prose audit in Task 3.3.
- [ ] Row 5 (Step 2 review complete): Covered by Exit Output Format and Step 2 prose audit in Task 3.4.
- [ ] Row 6 (Step 3 respond-to-review complete): Step 3 prose edited in Task 3.5.
- [ ] Row 7 (Step 4 write-plan complete): Covered by Exit Output Format and Step 4 prose audit in Task 3.6.
- [ ] Row 8 (Step 5 delegating wrapper exit, post-02): Covered by Exit Output Format and Step 5 audit in Task 4.1, with Step-to-command mapping row 5 updated in Task 2.
- [ ] Row 9 (Step 6 code-review complete): Covered by Exit Output Format and Step 6 audit in Task 4.2, with mapping row 6 updated in Task 2.
- [ ] Row 10 (Step 7 fix-findings exit): Covered by Exit Output Format and Step 7 audit in Task 4.3, with mapping row 7 updated in Task 2.
- [ ] Row 11 (Step 8 finalize): Step 8 Phase 2 prose edited in Task 4.4.
- [ ] Row 12 (Step 8 brainstorm-next exit): Refactor-roadmap branch and --strict Phase 2 edited in Task 4.5.
- [ ] Row 13 (Fast-path detection success exit): Footer added in Task 5.3.
- [ ] Row 14 (User Prompt fallback exit): Footer added in Task 5.4.
- [ ] Row 15 (Error Handling exits): Breadcrumb column added in Task 7.

- [ ] **Step 8.4: Strict-mode propagation grep**

Use Grep to search for all `/orchestrate` mentions in the modified file. For each match that appears inside a `Next ────────`-style code block, a Step-to-command table cell, or an Error Handling table cell, confirm both the standard and strict forms are documented (or that the row is explicitly an inline-prompt row with no breadcrumb).

Run: Grep with pattern `/orchestrate` on `ai-dev-tools/skills/orchestrate/SKILL.md`, output_mode=`content`, -n=true.

Walk the results and check each occurrence against this rule. If any breadcrumb-emitting site is missing its strict variant, fix it inline using Edit.

- [ ] **Step 8.5: Optional live smoke check**

OPTIONAL. If the executing engineer wants extra confidence, invoke `/orchestrate --strict` from the master branch in a fresh shell. Walk through one full step transition (e.g., Step 4 → Step 5) and confirm the printed breadcrumb literally contains `--strict` and is the literal last line of the response. Skip if the engineer is short on context budget — the manual re-reads above are the primary verification gate.

- [ ] **Step 8.6: Commit (only if Task 8 made any fixes)**

If Step 8.4 surfaced any missing strict variants and you applied inline fixes, commit them:

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "docs(orchestrate): cross-reference sweep — strict variants completeness"
```

If Task 8 made no fixes, skip this commit.

---

## Self-Review

After completing all 8 tasks, walk this checklist before declaring done.

**1. Spec coverage:** Walk each section of the spec (`docs/superpowers/specs/2026-04-07-ai-dev-toolkit-improvements/03-orchestrate-strict-propagation.md`) and confirm a task implements it:

- [ ] Spec Change 1 (Strict Mode Breadcrumbs subsection + table) — Task 1.
- [ ] Spec Change 2 (breadcrumb-as-last-line audit, all 15 rows) — Tasks 3, 4, 5 (with Task 8 cross-check).
- [ ] Spec Change 3 (When NOT to emit subsection) — Task 6.
- [ ] Spec Change 4 (RED auto-handoff: prose + `/session-handoff --light` with fallback + appended breadcrumb) — Task 5.1.
- [ ] Spec Change 5 (Error Handling table: add Breadcrumb column) — Task 7.
- [ ] Spec edge cases 1–11 — covered by the Strict Mode Breadcrumbs rule (modes 1–7), Exit Output Format (mode 9), When NOT to emit subsection (modes 10–11), Step 0 RED rewrite (mode 8).
- [ ] Spec verification steps 1–6 — addressed by Task 8's manual re-read checklist and the optional live smoke check in Step 8.5.

**2. Placeholder scan:** Search the plan for any of the patterns from the No Placeholders section. None found — every Edit step has a complete `old_string` and `new_string`, every code block is concrete, and every audit footnote is explicit.

**3. Type / anchor consistency:** Anchor strings used across tasks are consistent — `## Wrapped Next-Command Output` is the canonical anchor for the new-subsection insertions in Tasks 1, 3, 6 (each task's edit consumes a different surrounding context so `old_string` is unique at the moment of edit). The `**Step N — …:**` anchors in Tasks 3 and 4 are unique within the Steps 1-8 block.

**4. Sub-spec 02 dependency:** Step 5 row in the Step-to-command mapping table (Task 2) and the Step 5 prose audit (Task 4.1) both assume sub-spec 02 has landed. If 02 has NOT landed at execution time, Task 4.1 explicitly halts and surfaces that back to the orchestrate caller — this is a deliberate guard rail rather than silent adaptation.

If any item above is unchecked at execution time, the executing engineer flags it back to the orchestrate caller rather than silently adapting.
