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
              gates, per-task spec compliance review, intelligent execution
              model selection, and structured completion options.
              Recommended for features where correctness matters more
              than speed.

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
  [1] Standard (relaxed)
  [2] Strict — full workflow orchestration, TDD, verification gates
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

# orchestrate

Re-invocable state machine: detect cycle position, suggest next step, invoke skill on confirm. One step per invocation. State from artifacts + hint file, not session history.

### Step 0: Context Health Check

Runs on every invocation (both standard and `--strict`), before state detection.

**Estimation:**
```
estimated_used = number_of_user_messages_in_conversation × 2_000
estimated_used = max(estimated_used, 10_000)
usage_percent = estimated_used / 200_000 × 100
```

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
   ├── Not found → Read references/full-scan.md → execute Full Scan Fallback
   └── Found → compare head field to current git rev-parse HEAD
        ├── Same HEAD → trust hint, skip to step-specific validation
        └── Different HEAD → lightweight validation:
             git log --oneline <hint_head>..HEAD
             ├── 0 commits or git log errors → full scan fallback (rebase/amend/force-push/reset/gc)
             ├── Commits match feature name (git log --grep='{feature_name}') → advance step (see validation table below)
             └── Commits don't match feature → Read references/full-scan.md

2. If step == "finalized" (skip if item 1 already triggered full scan):
   ├── Same HEAD → write hint (step: 1, clear all fields per write rules) → route to Step 1
   └── Different HEAD →
        git log --oneline <hint_head>..HEAD
        For each commit, check against feature names extracted from
        docs/superpowers/specs/ filenames (strip YYYY-MM-DD- prefix
        and -design suffix).
        ├── Exactly one feature matches all new commits → set as current, validate from step 2 forward
        └── Multiple or none match → Read references/full-scan.md
```

**Step-specific validation** (1 tool call each): 1: spec not exist (if exists → 2). 2: spec Status header. 3: check review_summary Reviewed field matches hint spec AND read Critical/High counts — Critical>0: stay at 3; Critical=0 + High>0: advance to 4 (present info message first); Critical=0 + High=0: advance to 4; Reviewed mismatch: stale, route to 2. 4: plan exists. 5: plan checkboxes. 6: commits since plan_hash (`git log <plan_hash>..HEAD`; if plan_hash empty, populate via `git log --format=%H -1 -- {plan_path}`; if still empty, full scan fallback). 7: review_summary criticals/highs. 8: review_summary clean. Finalized: none.

If validation contradicts hint, advance to next logical step (don't full-scan).

**YELLOW gate:** After detection, if YELLOW and next step is heavy (5/6/7), auto-handoff. If moderate/light (1/2/3/4/8), warn and proceed.

---

## Conditional Loading

If hint file is missing or validation fails:
  -> Read references/full-scan.md, execute Full Scan Fallback.

If --strict is active at Step 5 onset:
  -> Read references/strict-mode.md for execution model recommendation
    and override dispatch (single-agent + subagent blocks).

If --strict is active at Step 8:
  -> Read references/strict-mode.md (if not already loaded) for
    verification gate and structured finishing.

At Step 8, after user confirms finalize:
  -> Read references/quality-gates.md, compute recommendations.

---

## Steps 1-8

Execute in order. First matching trigger wins.

**Step 1 — Brainstorm:** No spec in `docs/superpowers/specs/` for current feature. Check `tmp/current-roadmap.md` for next item. Invoke `superpowers:brainstorming`. Edge: superpowers plugin missing -> warn, offer manual spec creation.
**Step 2 — Spec Review:** Spec exists, Status not "Approved"/"Approved with suggestions", or review not run. Invoke `/review-doc {spec_path}`. Edge: clean review (zero criticals) -> update spec Status to "Approved" immediately.
**Step 3 — Respond to Review:** review_summary.md Reviewed matches spec AND Critical>0. Invoke `/respond-to-review {round} {spec_path}` (round = count `## Round N` sections in `tmp/response_analysis.md` matching current spec + 1; default 1). Loop 2-3 until zero criticals. Edge: High>0 only -> informational, advance to Step 4.
**Step 4 — Write Plan:** Spec Approved, no matching plan. ADR extraction inline per `ai-dev-tools/skills/document-for-ai/references/adr-extraction.md`, then invoke `superpowers:writing-plans`. Edge: extraction failure -> do not auto-proceed, offer: retry/skip ADRs/exit.
**Step 5 — Implement:** Plan exists, not all checkboxes `[x]`. Default: invoke `superpowers:subagent-driven-development`. --strict: Read references/strict-mode.md, execution model recommendation, dispatch with overrides. Edge: all `[x]` -> skip to Step 6.
**Step 6 — Code Review:** Commits after plan hash (`git log {plan_hash}..HEAD`). Invoke `/review-code {N} {spec_path}`. Edge: >50% non-feature commits interleaved -> warn.
**Step 7 — Fix Findings:** review_summary.md Critical or High >0, commits match feature. Apply fixes, re-run `/review-code`. Loop 6-7 until clean. Edge: NOT `/respond-to-review` -- that is for doc reviews only.
**Step 8 — Complete:** Review clean (zero critical/high) or user accepts remaining.
- **Phase 1 (pre-confirmation):** Present `── Step 8: Complete ──` with Feature name, Status (Approved/Approved with suggestions), and "Ready to finalize?" No git baselines.
- **Phase 2 (post-confirmation):** Update hint to `finalized` -> Read references/quality-gates.md -> compute baselines -> update roadmap -> recommendations -> "What's next?"
- **--strict Phase 2:** Update hint to `finalized` -> Read references/strict-mode.md (verification gate) -> Read references/quality-gates.md (baselines) -> roadmap -> structured finishing.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Hint file missing or YAML malformed | Full scan fallback. Write hint after detection. |
| Unknown step/feature or head not in history | Full scan fallback. Overwrite hint. |
| Hint says finalized but spec deleted | Full scan -> clean slate -> Step 1. |
| Hint validation contradicts hint step | Advance to next logical step (don't full-scan). |
| Quality gate git commands fail | Skip that gate, warn. |
| references/ file missing | Error: "orchestrate reference file missing: {path}. Re-install the ai-dev-tools plugin." |
| Multiple features in-progress | Present list, ask user to pick. Update hint. |
| No roadmap file | Ask "What feature?" at Step 1. Skip roadmap update at Step 8. |
| Invoked skill fails | Report failure, offer: Retry / Skip / Exit. |
| Context pressure (YELLOW/RED) | Handled by Step 0 + YELLOW gate. Resume via artifacts on next invocation. |
| No test/build command discoverable (--strict) | Discovery: (1) check CLAUDE.md, (2) package.json scripts, (3) Makefile test target, (4) probe pytest/jest/cargo test. None found → skip verification gate: "No verification command found. Configure in CLAUDE.md." |

---

## Inline Cross-Check Rules

For fast-path validation of tmp/ files:
- **Doc review:** Verify review_summary.md `**Reviewed:**` field matches the hint's `spec` field. Mismatch = stale, ignore.
- **Code review:** Verify commit hashes in review findings appear in `git log --grep='{feature_name}'`. Mismatch = stale, ignore.

Full cross-check algorithm (scope header overlap, response_analysis.md counting, clean-review attribution) is in references/full-scan.md.
