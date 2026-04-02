---
name: orchestrate
description: "Use when the user wants to start a development cycle, continue where they left off, check what's next, automate their brainstorm-review-implement-review-commit workflow, or get recommendations for quality gates — even if they don't use the exact skill name."
---

<help-text>
orchestrate — Manage your full development cycle

USAGE
  /orchestrate [--strict]

FLAGS
  --strict    Enable quality discipline: TDD enforcement, verification
              gates, per-task spec compliance review, and structured
              completion options. Recommended for features where
              correctness matters more than speed.

EXAMPLES
  /orchestrate                       Detect state and suggest next step
  /orchestrate --strict              Detect state with quality discipline
</help-text>

Parse arguments: if `--help` is present, output ONLY the text inside <help-text> tags above verbatim and exit. If `--strict` is present, set strict mode active for this invocation. Both flags can coexist with `--help` taking priority.

## Mode Selection (before Step 0)

**Trigger:** `/orchestrate` invoked without `--strict` flag AND no persisted `mode` field in `tmp/orchestrate-state.md` (file missing, or file exists but has no `mode` key).

When triggered, present before anything else (before Step 0):

```
Orchestrate mode:
  [1] Standard — TDD, execution model selection, dispatch with overrides
  [2] Strict — TDD, verification gates, spec compliance, structured completion
      (recommended if you're experienced with orchestrate)

Proceed with?
```

**Behavior:**
- User picks `[1]` → create or update hint file with only `mode: standard` in YAML frontmatter (do not include `feature`, `step`, `spec`, `plan`, `plan_hash`, `head`, or `updated` — their absence signals no valid cycle state) → continue as standard. Never ask again.
- User picks `[2]` → create or update hint file with only `mode: strict` in YAML frontmatter → print the strict-mode banner immediately → continue with strict active. Future no-flag invocations auto-activate strict. Never ask again.
- `--strict` flag present → skip this prompt entirely, always strict.
- Any other input → re-present the prompt once. If the second response is also invalid, default to `[1]` (standard) and print: "Unrecognised input — defaulting to Standard mode."

**Mode resolution order:** (1) `--strict` flag → strict. (2) Hint file `mode` field → use persisted value. (3) Neither → show prompt.

**After mode resolved:** If strict is active (by any path), print the strict-mode banner, then proceed to Step 0. If standard, proceed to Step 0 directly.

**Strict mode banner:** When strict mode is active (via `--strict` flag, persisted `mode: strict`, or user selecting `[2]` at the mode prompt), print before Step 0:
```
Mode: strict (TDD + verification + spec compliance + structured completion)
```

## Session Bootstrap (before Step 0)

Runs on every invocation, after Mode Selection completes, before Step 0.

1. Check if `./tmp/session-handoff.md` exists.
2. If not found → skip, proceed to Step 0.
3. If found → read YAML frontmatter `generated` timestamp.
   - Compare the `generated` field to the currentDate provided in the system-reminder context. If currentDate is unavailable, run `date +%Y-%m-%d` via Bash. Note: currentDate is date-only (YYYY-MM-DD) while generated is datetime (YYYY-MM-DDTHH:MM). Use only the date portion of generated for comparison. If the date portion of generated differs from currentDate by more than 1 calendar day, treat as stale. Same day or previous day = recent.
   - If stale → print "Stale session handoff (>24h), ignoring." → proceed to Step 0.
   - If recent → parse content:
     a. Extract feature name from Done/Pending sections. Strategy: look for file paths matching spec filename patterns (arguments after /review-doc or /writing-plans), and also scan for spec file path patterns (`docs/superpowers/specs/*.md` or `docs/*/specs/*.md`) anywhere in the content — session-handoff may summarize commands rather than preserving them verbatim. If multiple candidates, prefer the one appearing in both Done and Pending. If no clear name, set feature to empty and let User Prompt fallback clarify.
     b. Determine step number by scanning Pending items for skill references and file paths:
        - Pending mentions spec review or /review-doc → step 2
        - Pending mentions respond to review → step 3
        - Pending mentions write plan or /writing-plans → step 4
        - Pending mentions implement or execution → step 5
        - Pending mentions code review or /review-code → step 6
        - Pending mentions fix findings → step 7
        - Pending mentions finalize or complete → step 8
        - No match: if Pending is empty, scan Done for highest step keyword. Done mentions finalize/complete → step finalized. Done mentions fix findings → step 8. Done mentions code review → step 7 or 8. Done mentions implementation/execution → step 6. Done mentions write plan → step 5. Done mentions respond to review → step 3 or 4. Done mentions spec review → step 3. Done also empty → step 1. Otherwise → step 1 (start fresh). Note: this fallback is intentionally conservative — the User Prompt acts as a safety net if the mapping is ambiguous.
        If Pending matches multiple step keywords, use the lowest-numbered
        unfinished step (the earliest pending work). Cross-reference with
        Done items: steps mentioned in Done are considered complete.
     c. Extract spec and plan paths from file path references in the content.
     d. Write `tmp/orchestrate-state.md` with extracted data. Preserve existing `mode` field
        if hint file already exists. Set `head` to current `git rev-parse HEAD`. Note: `head`
        reflects HEAD at orchestrate invocation time. Fast-Path Detection comparing this to
        current HEAD will correctly detect any commits made during this session.
     e. Print: "Resumed from session handoff: <feature>, step <N>"
4. Proceed to Step 0 (Fast-Path Detection finds the newly written or updated hint file).

**Integration:** Session Bootstrap runs after Mode Selection completes. Mode is already resolved when step 3d writes the hint file. If creating a new hint file, include the resolved mode value. If the hint file already has valid cycle state (non-empty `feature`), Session Bootstrap is a no-op — Fast-Path Detection handles it. This is intentional — Fast-Path Detection's git-based validation is more reliable than handoff file parsing for mid-cycle state. Session Bootstrap only fires when the hint file is missing or has no valid cycle state AND a recent session-handoff.md exists.

When session-handoff is auto-triggered by orchestrate RED, the hint file already contains valid cycle state. Session Bootstrap's no-op condition handles this — the hint file has a non-empty feature field, so Bootstrap exits immediately without reading session-handoff.md.

# orchestrate

Re-invocable state machine: detect cycle position, suggest next step, invoke skill on confirm. One step per invocation. State from artifacts + hint file, not session history.

### Step 0: Context Health Check

Runs on every invocation (both standard and `--strict`), before state detection.

**Estimation:**
```
estimated_used = number_of_user_messages_in_conversation × 5_000
estimated_used = max(estimated_used, 10_000)
usage_percent = estimated_used / 200_000 × 100
```

**Step-based floor:** If the hint file exists and `step >= 5`, the zone is at minimum YELLOW regardless of message count. This floor raises the minimum zone but cannot override RED (triggered by compression signal or >80% threshold).

**Compression signal boost:** If the conversation contains a system-generated summary of prior context (indicating the system has already compressed messages), override to RED regardless of message count. This is a strong signal that context is critically low.

**Zones:**

| Zone | Threshold | Immediate action |
|---|---|---|
| GREEN | < 60% | Proceed to state detection |
| YELLOW | 60–80% | Proceed to state detection, then evaluate at Step 2 (context-aware gate) |
| RED | > 80% or compression detected | Auto-handoff (see below) |

**RED behavior:** Print `⚠ Context critically low (~X% estimated). Generating session handoff...` Auto-run `/session-handoff`. Print `Session handoff saved. Start a new conversation and run /orchestrate to continue.` Exit.

---

## State Hint File Protocol

`tmp/orchestrate-state.md` — YAML frontmatter persisting detected state between invocations.

**Fields:** `mode` (`standard` or `strict`, persisted user preference; preserved across resets), `feature` (from spec filename), `step` (number or `finalized`), `spec` (path, `""` if none), `plan` (path, `""` if none), `plan_hash` (40-char SHA of plan commit, `""` if none; populate via `git log --format=%H -1 -- {plan_path}` when first writing hint at step 5+), `head` (40-char SHA of HEAD when written), `updated` (ISO timestamp).

**Write rules:** Written at end of every orchestrate invocation. Step-specific behavior:

| Event | `step` value written |
|---|---|
| Step 1-7 presented | The step number |
| Step 8 presented (awaiting confirmation) | `8` |
| Step 8 finalize confirmed | `finalized` |
| User overrides or exits | The detected step |

Write `step: finalized` immediately after user confirms finalize — before running quality gates. When routing to Step 1 from `finalized`, write hint with `feature: ""`, `spec: ""`, `plan: ""`, `plan_hash: ""`, `step: 1` — preserve the existing `mode` field unchanged. The hint file is never deleted. `finalized` is a valid state.

**Validation:** Read hint -> compare `head` to `git rev-parse HEAD` -> run step-specific check (Section below).

---

## Fast-Path Detection Algorithm

After Step 0 completes:

```
1. Read tmp/orchestrate-state.md
   ├── Not found or no valid cycle state (missing/empty `feature` field)
   │    → User Prompt (see below)
   └── Found → compare head field to current git rev-parse HEAD
        ├── Same HEAD → trust hint, skip to step-specific validation
        └── Different HEAD → lightweight validation:
             git log --oneline <hint_head>..HEAD
             ├── 0 commits or git log errors → User Prompt
             ├── Commits match feature name (git log --grep) → advance step
             └── Commits don't match feature → User Prompt

2. If step == "finalized":
   ├── Same HEAD → write hint (step: 1, clear all fields per write rules) → route to Step 1
   └── Different HEAD → User Prompt (same unified prompt as above — "What are you working on
        and where did you leave off?" naturally covers both new and continuing work).
        Write hint after resolution.
```

**Step-specific validation** (1 tool call each): 1: spec not exist (if exists → 2). 2: spec Status header. 3: check review-doc-summary Reviewed field matches hint spec AND read Critical/High counts — Critical>0: stay at 3; Critical=0 + High>0: advance to 4 (present info message first); Critical=0 + High=0: advance to 4; Reviewed mismatch: stale, route to 2. 4: plan exists. 5: commits since plan_hash (implementation started; hint step field determines stay-at-5 vs advance-to-6 interpretation). 6: commits since plan_hash (`git log <plan_hash>..HEAD`; if plan_hash empty, populate via `git log --format=%H -1 -- {plan_path}`; if still empty, show `Commits since plan: unknown (plan hash not found)` in the confirmation prompt. The user can override with a specific count or command). 7: review-code-summary criticals/highs. 8: review-code-summary clean. Finalized: none.

If validation contradicts hint, advance to next logical step (don't rescan).

**YELLOW gate:** After detection, if YELLOW and next step is heavy (5/6/7), auto-handoff. If moderate/light (1/2/3/4/8), warn and proceed.

---

## User Prompt

**Trigger:** No valid cycle state in hint file (missing file, malformed YAML, or empty/missing `feature` field), OR fast-path detection cannot resolve state.

```
1. Print: "No previous state found."
   Ask:  "What are you working on and where did you leave off?"

2. Parse response for:
   - Feature name: extract from user response directly.
     If the user names a feature, accept it as-is.
     If ambiguous, ask for clarification (step 4).
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
     For phrases not listed above, treat the step as ambiguous
     and proceed to step 4. Prefer the most-specific match when
     phrases overlap (e.g., "code review done" → step 8, not 7).

3. If BOTH resolved (exactly one spec match, exactly one step match):
   → Run one targeted step-specific validation check
     (same as fast-path validation table above).
   → If validation contradicts the stated step: print
     "That doesn't match what I see — can you clarify?"
     Continue within the 2-3 round limit.
   → Otherwise, write hint file (with mode, feature, step, spec,
     plan if exists, head, updated), proceed to detected step.

4. If EITHER is ambiguous:
   → Ask a follow-up question. Max 2-3 rounds total.
     "Did you mean `convention-enforcer` or `consolidate-learn`?"
     "You said review — spec review (step 2-3) or code review (step 6-7)?"

5. If still unclear after 2-3 rounds:
   → Print: "I can't determine the state automatically.
     Please describe your current step more specifically,
     or check tmp/orchestrate-state.md and update it manually."
   → Write hint with whatever was resolved (feature if known,
     step 1 as default). Proceed to the resolved or default step.
```

**Spec field population (hint write):** After accepting the feature name from the user, do a lightweight filename scan of `docs/superpowers/specs/` to find files containing the feature name as a case-insensitive substring in the filename. This is filename matching only — no file content is read. If exactly one file matches, set `spec` to that file path in the written hint. If zero or multiple files match, set `spec` to `''`. This scan is limited to step 3 hint-write and does not affect state resolution or the feature name itself. Downstream step 3 validation (Reviewed vs hint spec) is skipped when `spec` is `''`.

---

## Conditional Loading

If hint file is missing or validation fails:
  → User Prompt (both modes). Write hint after resolution.

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

If --strict is active at Step 8:
  -> Read references/strict-mode.md (if not already loaded) for
    verification gate and structured finishing.

At Step 8, after user confirms finalize:
  -> Read references/quality-gates.md, compute recommendations.

---

## Steps 1-8

Execute in order. First matching trigger wins.

**Step 1 — Brainstorm:** No spec in `docs/superpowers/specs/` for current feature. Check `tmp/current-roadmap.md` for next item. Invoke `superpowers:brainstorming`. Edge: superpowers plugin missing -> warn, offer manual spec creation.

If a refactor roadmap exists (`docs/monorepo-strategy/roadmap.md` or
`docs/layer-architecture/roadmap.md`) with unchecked items and no active spec
for the next unit (a file exists in `docs/superpowers/specs/` whose filename
contains the next unit name as a case-insensitive substring AND whose Status
header is not `finalized` — or has no Status header — counts as an active spec;
read only the first 10 lines of each matching spec file to determine Status),
suggest: "Next unit: `<name>`. Start brainstorming?"
If user confirms, invoke the originating refactor skill with --next-unit.
Derive which skill to invoke from roadmap path:
  docs/monorepo-strategy/roadmap.md → refactor-to-monorepo
  docs/layer-architecture/roadmap.md → refactor-to-layers
After --next-unit completes and produces a new single-unit spec, write hint
(feature: <next-unit-name>, step: 2) and exit. Orchestrate must be re-invoked
to continue — it does not automatically advance to Step 2 in the same session.

Note: The existing Step 1 logic uses `tmp/current-roadmap.md` for general feature tracking. Refactor roadmaps are separate files checked in addition to `tmp/current-roadmap.md`. Refactor roadmap checks take priority.
**Step 2 — Spec Review:** Spec exists, Status not "Approved"/"Approved with suggestions", or review not run. Present confirmation prompt with spec_path, then invoke `/review-doc {spec_path} --max-iterations 2` or user override. Edge: clean review (zero criticals) -> update spec Status to "Approved" immediately.
**Step 3 — Respond to Review:** review-doc-summary.md Reviewed matches spec AND Critical>0. Invoke `/respond-to-review {round} {spec_path}` (round = count `## Round N` sections in `tmp/response_analysis.md` matching current spec + 1; default 1). Loop 2-3 until zero criticals. Edge: High>0 only -> informational, advance to Step 4.
**Step 4 — Write Plan:** Spec Approved, no matching plan. ADR extraction inline per `ai-dev-tools/skills/document-for-ai/references/adr-extraction.md`, then invoke `superpowers:writing-plans`. When invoking superpowers:writing-plans, prepend to the dispatch prompt: "After saving the plan, do NOT present the Execution Handoff section. Return control to the caller. Orchestrate manages execution model selection at Step 5." If writing-plans still presents an Execution Handoff section, orchestrate ignores it and proceeds to Step 5. Edge: extraction failure -> do not auto-proceed, offer: retry/skip ADRs/exit.
**Step 5 — Implement:** Plan exists, implementation not confirmed complete. If the current feature is a refactor unit (matched via roadmap check): skip execution model selection, execute directly using `references/refactor-execution.md` following Pre-flight → File Operations → Verification. Otherwise: Read references/implementation-step.md: generate task graph, execution model recommendation, dispatch with overrides. Edge: user explicitly states implementation is done -> advance to Step 6; 0 commits since plan_hash -> stay at Step 5 and present implementation dispatch. User explicit confirmation always overrides the commit signal. If the user states implementation is done with 0 commits, advance to Step 6 with warning: "No commits since plan_hash — proceeding to code review at your confirmation."
**Step 6 — Code Review:** Commits after plan hash (`git log {plan_hash}..HEAD`). Present confirmation prompt with N and spec_path, then invoke `/review-code {N} --against {spec_path} --max-iterations 3` or user override. Edge: >50% non-feature commits interleaved -> warn.
**Step 7 — Fix Findings:** review-code-summary.md Critical or High >0, commits match feature. Apply fixes, re-run `/review-code`. Loop 6-7 until clean. Edge: NOT `/respond-to-review` -- that is for doc reviews only.
**Step 8 — Complete:** Review clean (zero critical/high) or user accepts remaining.
- **Phase 1 (pre-confirmation):** Present `── Step 8: Complete ──` with Feature name, Status (Approved/Approved with suggestions), and "Ready to finalize?" No git baselines.
- **Phase 2 (post-confirmation):** Update hint to `finalized` -> Read references/quality-gates.md -> compute baselines -> update roadmap -> recommendations -> "What's next?"

If a refactor roadmap exists with unchecked items:
  → Check roadmaps in this order: docs/monorepo-strategy/roadmap.md first,
    then docs/layer-architecture/roadmap.md. For each roadmap, attempt a
    case-insensitive substring match of the current feature name against
    roadmap item labels. Stop at the first roadmap where exactly one match
    is found — do not check the second roadmap if the first matches.
    If the first roadmap checked yields zero or multiple matches, check
    the second roadmap. If both roadmaps each yield exactly one match,
    use docs/monorepo-strategy/roadmap.md as the default and warn:
    "Feature matched entries in both roadmaps — defaulting to monorepo
    roadmap. Mark the layer roadmap entry manually if needed."
    The next-unit suggestion in this path refers only to the monorepo roadmap. Layer roadmap advancement is left to the user per the warning.
    If neither roadmap yields exactly one match,
    skip auto-mark and print: "Could not match feature to roadmap entry —
    mark it complete manually."
  → Mark the completed unit [x] in the matched roadmap file.
  → Print: "Unit `<completed>` done. Next on roadmap: `<next-unit>`."
  → Suggest: "Continue with brainstorming for `<next-unit>`?"
  → If user confirms, write hint (feature: <next-unit-name>, step: 2)
    where <next-unit-name> is the name of the next unchecked roadmap unit,
    and invoke the originating refactor skill with --next-unit.
    Derive which skill to invoke from roadmap path:
    docs/monorepo-strategy/roadmap.md → refactor-to-monorepo
    docs/layer-architecture/roadmap.md → refactor-to-layers
    After --next-unit completes and produces a new single-unit spec,
    write hint (feature: <next-unit-name>, step: 2) and exit.
    Orchestrate must be re-invoked to continue — it does not
    automatically advance to Step 2 in the same session.
- **--strict Phase 2:** Update hint to `finalized` -> Read references/strict-mode.md (verification gate) -> Read references/quality-gates.md (baselines) -> roadmap -> structured finishing.

---

## Review Confirmation Prompts

Steps 2 and 6 present a confirmation prompt before invoking the review skill. The prompt shows the full command with `--max-iterations 2` (review-doc) or `--max-iterations 3` (review-code) as default.

**Step 2 prompt:**
```
── Step 2: Spec Review ──────────────────────────
Feature: <feature-name>
Spec: <spec_path>

Will run:
  /review-doc <spec_path> --max-iterations 2

Continue? or specify a different command.
```

**Step 6 prompt:**
```
── Step 6: Code Review ──────────────────────────
Feature: <feature-name>
Commits since plan: <N>

Will run:
  /review-code <N> --against <spec_path> --max-iterations 3

Continue? or specify a different command.
```

**Input handling:** Any affirmative response (yes, y, continue, go, or pressing Enter) invokes the shown command. Any other non-empty input is treated as an alternative command to invoke verbatim.

**N derivation (Step 6):** Computed via `git log {plan_hash}..HEAD --oneline | wc -l`. If plan_hash is empty, attempt to populate via `git log --format=%H -1 -- {plan_path}`; if still empty, show `Commits since plan: unknown (plan hash not found)` in the confirmation prompt. The user can override with a specific count or command.

**Step 7 re-runs:** Step 7's internal re-run of `/review-code` within the same invocation skips the prompt. The Step 6 confirmation prompt appears on every orchestrate invocation that detects Step 6, including after Step 7 fixes.

---

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

**Parsing behavior:** When orchestrate receives `/orchestrate (/some-command args)`:

Note: The full initialization sequence still runs on receipt of a wrapped command (Mode Selection → Session Bootstrap → Step 0). If Step 0 detects RED, auto-handoff takes priority and the inner command is not dispatched. Mode Selection skips the prompt if mode is already persisted.

1. Extract the inner command from parentheses.
2. Do not update the step field on receipt of a wrapped command. Update only after the inner command completes and orchestrate resumes control, using normal step-detection logic.
3. Dispatch the inner command via the Skill tool.
4. After the inner command completes, orchestrate resumes control for state update + next-command output.

**Edge cases:**

- Plain `/orchestrate` (no parens) — normal flow, detect state from hint file.
- User modifies the inner command before pasting — orchestrate dispatches whatever is in the parens verbatim.
- Inner command fails — existing error handling (Retry/Skip/Exit).
- Receiving a wrapped command targeting a step beyond the current hint step is treated as implicit confirmation of all prior steps. This includes Step 5: receiving `/orchestrate (/review-code ...)` while at Step 5 satisfies the explicit-confirmation requirement from Step 5's completion condition. Update step appropriately after inner command completes.

---

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

---

## Inline Cross-Check Rules

For fast-path validation of tmp/ files:
- **Doc review:** Verify review-doc-summary.md `**Reviewed:**` field matches the hint's `spec` field. Mismatch = stale, ignore.
- **Code review:** Verify commit hashes in review findings appear in `git log --grep='{feature_name}'`. Mismatch = stale, ignore.
