# Orchestrate Fast Detection — Design Spec

**Date:** 2026-03-30
**Status:** Draft
**Plugin:** ai-dev-tools
**Skill:** orchestrate (optimization)
**Type:** Performance optimization reducing state detection from ~20-30 tool calls to ~3-5 and token consumption by ~75%

---

## Problem Statement

`/orchestrate` takes 1-2 minutes before presenting anything to the user. The state detection algorithm scans all spec files (~17), runs multiple git commands per spec to determine completion status, then computes 5-7 quality gate baselines — totaling 20-30 tool calls. For a project with 17 specs where 16 are complete, this means ~15 wasted checks every invocation. The 600-line SKILL.md is also fully loaded into context every time, even though a typical invocation only needs ~150 lines of it.

The context health check (Step 0) is fast and valuable — it stays untouched. Everything else in the detection layer needs optimization.

## Enhancement Summary

Three complementary optimizations:

1. **State hint file** (`tmp/orchestrate-state.md`) — persist the detected state between invocations so the next invocation can validate rather than re-derive
2. **Lazy quality gates** — defer quality gate baseline computation from "before presenting Step 8" to "after user confirms finalize"
3. **Conditional file loading** — split SKILL.md into a slim core (~150 lines) plus reference files loaded only when needed

**Acceptance criteria:**

- Typical mid-cycle `/orchestrate` invocation completes in 3-5 tool calls
- Quality gate baselines are not computed until the user confirms finalize at Step 8
- SKILL.md core is ~150 lines; `full-scan.md`, `quality-gates.md`, and `strict-mode.md` are loaded conditionally
- Full scan fallback produces identical results to current behavior when triggered
- Deleting `tmp/orchestrate-state.md` gracefully falls back to full scan (no error, no degradation)
- No changes to Steps 1-7 behavior, skill dispatch, or `--strict` override content

---

## Scope

### In scope

- `orchestrate/SKILL.md`: rewrite state detection, add hint file protocol, split Step 8 into pre/post-confirmation
- New `orchestrate/references/full-scan.md`: relocated full scan algorithm
- New `orchestrate/references/quality-gates.md`: relocated quality gate triggers
- New `orchestrate/references/strict-mode.md`: relocated strict mode overrides
- Runtime artifact `tmp/orchestrate-state.md`: written by orchestrate at end of each invocation

### Out of scope

- Changes to any other skill (implement-plan, review-code, etc.)
- Changes to context health check (Step 0)
- Changes to Steps 1-7 detailed behavior (only detection routing changes)
- Changes to quality gate trigger logic (same checks, just deferred)
- Changes to `--strict` override content (same overrides, just in a separate file)

---

## Detailed Design

### 1. State Hint File

#### 1.1 Format

`tmp/orchestrate-state.md` uses YAML frontmatter:

```markdown
---
feature: checklists-enhancement
step: 8
spec: docs/superpowers/specs/2026-03-30-checklists-enhancement-design.md
plan: docs/superpowers/plans/2026-03-30-checklists-enhancement-plan.md
head: de46945
updated: 2026-03-30T16:50
---
```

**Fields:**

| Field | Purpose | Example |
|---|---|---|
| `feature` | Feature name (extracted from spec filename) | `checklists-enhancement` |
| `step` | Current step number or `finalized` | `6`, `finalized` |
| `spec` | Path to the current feature's spec file | `docs/superpowers/specs/...` |
| `plan` | Path to the current feature's plan file (empty if no plan yet) | `docs/superpowers/plans/...` |
| `head` | Short SHA of HEAD when hint was written | `de46945` |
| `updated` | ISO timestamp of last write | `2026-03-30T16:50` |

#### 1.2 Write Rules

The hint file is written (overwritten) at the end of every orchestrate invocation, after presenting the step to the user. The write captures the detected state so the next invocation can shortcut detection.

**Step-specific write behavior:**

| Event | `step` value written |
|---|---|
| Step 1-7 presented | The step number (e.g., `5`) |
| Step 8 finalize confirmed | `finalized` |
| User overrides or exits | The detected step (state preserved) |

The hint file is **never deleted**. `finalized` is a valid state that routes to Step 1 on the next invocation.

#### 1.3 Lifecycle

| Event | Hint state |
|---|---|
| First invocation ever | No file → full scan → write hint |
| Mid-cycle invocation | Read → validate → update step |
| Step 8 finalize confirmed | Update to `step: finalized` |
| Next invocation after finalize | Read → see `finalized` + same HEAD → Step 1 |
| External commits after finalize | Read → see `finalized` + different HEAD → lightweight check → likely still Step 1 |
| Hint file manually deleted | No file → full scan → write hint (graceful fallback) |

### 2. Fast-Path State Detection

Replaces the current "scan all specs" algorithm for the common case. The full scan (relocated to `references/full-scan.md`) becomes the fallback.

#### 2.1 Detection Flow

```
After context health check (Step 0):

1. Read tmp/orchestrate-state.md
   ├── Not found → Read references/full-scan.md → execute Full Scan Fallback
   └── Found → compare head field to current git rev-parse --short HEAD
        ├── Same HEAD → trust hint, skip to step-specific validation
        └── Different HEAD → lightweight validation:
             git log --oneline <hint_head>..HEAD
             ├── 0 commits → trust hint (edge case)
             ├── Commits match feature name → advance step:
             │    step 5 → check plan checkboxes (grep -c '- [x]' / '- [ ]')
             │    step 6 → check tmp/review_summary.md status
             │    step 7 → check for new commits after review
             │    other → trust hint
             └── Commits don't match feature → Read references/full-scan.md

Note: "Commits match feature name" uses `git log --grep='{feature_name}'` substring matching, same as the current algorithm. The known limitation (prefix collisions like `implement-plan` vs `implement-plan-monorepo`) is inherited and handled by the full scan fallback's ambiguity handler.

2. If step == "finalized":
   ├── Same HEAD → route to Step 1 (brainstorm)
   └── Different HEAD → check if new commits relate to any known feature
        ├── Yes → that feature is now in-progress, update hint
        └── No → route to Step 1 (brainstorm)
```

#### 2.2 Step-Specific Validation

When the hint is trusted (same HEAD) or advanced (HEAD changed, same feature), run exactly one targeted check to confirm the step is correct:

| Hinted step | Validation | Tool calls |
|---|---|---|
| 1 (brainstorm) | Check if spec file in `spec` field exists | 1 (glob or file check) |
| 2 (spec review) | Check spec `**Status:**` header | 1 (read first 5 lines) |
| 3 (respond to review) | Check `tmp/review_summary.md` for criticals | 1 (read) |
| 4 (write plan) | Check if plan file exists | 1 (glob) |
| 5 (implement) | Check plan checkboxes | 1 (grep) |
| 6 (code review) | Count commits since plan hash | 1 (git log) |
| 7 (fix findings) | Check review_summary.md for criticals/highs | 1 (read) |
| 8 (complete) | Check review_summary.md is clean | 1 (read) |
| finalized | None needed | 0 |

**If validation contradicts the hint** (e.g., hint says Step 5 but all checkboxes are `[x]`), advance to the next logical step rather than falling back to full scan. The hint was just slightly behind — no need to scan everything.

#### 2.3 Tool Call Budget

| Path | Tool calls | When |
|---|---|---|
| Same HEAD (back-to-back) | 2 (read hint + 1 validation) | Most common mid-cycle |
| HEAD advanced, same feature | 3-4 (read hint + git log + 1-2 validations) | After a skill completes |
| `finalized` + same HEAD | 1 (read hint) | Starting new feature |
| Full scan fallback | 15-25 (current behavior) | First invocation, corrupt hint, ambiguous state |

### 3. Lazy Quality Gates

#### 3.1 Step 8 Split

Step 8 is split into two phases with a user confirmation boundary between them.

**Phase 1 — Pre-confirmation (no quality gate computation):**

Present the completion status only. No git baseline commands.

```
── Step 8: Complete ──────────────────────────
Feature: <feature-name>
Status: <Approved | Approved with suggestions>

Ready to finalize?
```

With `--strict`, include verification status if already computed, but do NOT run quality gate baselines yet.

**Phase 2 — Post-confirmation (compute quality gates):**

After the user confirms finalize:

1. Read `references/quality-gates.md`
2. Compute quality gate baselines (5-7 git commands)
3. Present recommendations
4. Update `tmp/orchestrate-state.md` with `step: finalized`
5. Present "What's next?"

```
Feature "<name>" complete.

Recommendations:
  [Warning] 81 files changed since last convention-enforcer → run /convention-enforcer
  [Warning] 93 commits since last test-audit → run /test-audit

What's next?
  > Next feature (continue with /orchestrate)
  > Run a recommendation above
  > Something else
```

#### 3.2 `--strict` Interaction

With `--strict`, the full Step 8 flow becomes:

1. **Pre-confirmation:** Present status (no gates)
2. **User confirms**
3. **Verification gate:** Read `references/strict-mode.md`, discover and run test/build commands
4. **Quality gates:** Read `references/quality-gates.md`, compute baselines
5. **Structured finishing:** Present options (`[1] merge / [2] keep / [3] handoff`)
6. **Update hint** to `step: finalized`

### 4. Conditional File Loading

#### 4.1 File Structure

```
ai-dev-tools/skills/orchestrate/
├── SKILL.md                          (~150 lines, always loaded)
├── references/
│   ├── full-scan.md                  (~80 lines)
│   ├── quality-gates.md              (~80 lines)
│   └── strict-mode.md                (~100 lines)
```

#### 4.2 SKILL.md Core (~150 lines)

The always-loaded core contains:

- Help text + argument parsing (~25 lines)
- Context health check / Step 0 (~15 lines)
- State hint file protocol: format, read, validate, write rules (~30 lines)
- Fast-path detection algorithm (~25 lines)
- Steps 1-8 condensed behavior: each step as ~15 lines covering trigger, presentation, and skill dispatch (~40 lines total — trim verbose examples, keep essential behavior)
- Routing instructions for conditional reads (~10 lines)
- Error handling table: core entries (~10 lines)

#### 4.3 Conditional Reference Files

| File | Trigger | Contains |
|---|---|---|
| `references/full-scan.md` | Hint file missing or validation fails | Feature Detection Algorithm, Matching Logic, Cross-Checking tmp/ Files, Ambiguity Handling, Implementation Detection |
| `references/quality-gates.md` | Step 8 post-confirmation | Quality Gate Triggers table, Detection of "Last Run", Presentation Format, gate-specific error handling |
| `references/strict-mode.md` | `--strict` flag active | Execution Model Recommendation (algorithm + presentation), Override Dispatch blocks (single-agent + subagent), Verification Gate, Structured Finishing, strict-specific error handling |

#### 4.4 Routing Instructions

In SKILL.md core:

```
## Conditional Loading

If hint file is missing or validation fails:
  → Read references/full-scan.md, execute Full Scan Fallback.

If --strict is active:
  → Read references/strict-mode.md for execution model selection (Step 5),
    verification gate (Step 8), and structured finishing (Step 8).

At Step 8, after user confirms finalize:
  → Read references/quality-gates.md, compute recommendations.
```

#### 4.5 Token Budget

| Scenario | Lines loaded | vs. today (600) |
|---|---|---|
| Typical mid-cycle (fast path) | ~150 | 75% reduction |
| Step 8 finalize | ~150 + 80 = ~230 | 62% reduction |
| Step 8 finalize --strict | ~150 + 80 + 100 = ~330 | 45% reduction |
| First invocation (full scan) | ~150 + 80 = ~230 | 62% reduction |
| Worst case (full scan + strict + Step 8 gates) | ~150 + 80 + 80 + 100 = ~410 | 32% reduction |

---

## What Changes Where

| Component | Change | Lines (est.) |
|---|---|---|
| `orchestrate/SKILL.md` | Rewrite: slim core with hint protocol, fast-path detection, condensed steps, routing instructions | ~150 (replaces ~600) |
| New: `orchestrate/references/full-scan.md` | Relocated: Feature Detection Algorithm, Matching Logic, Cross-Checking, Ambiguity Handling | ~80 |
| New: `orchestrate/references/quality-gates.md` | Relocated: Quality Gate Triggers, baseline detection, presentation format | ~80 |
| New: `orchestrate/references/strict-mode.md` | Relocated: Execution model, override dispatch, verification gate, structured finishing | ~100 |
| Runtime artifact: `tmp/orchestrate-state.md` | New: written by orchestrate on each invocation | ~8 per write |

**Total:** ~410 lines across 4 files (replaces 1 file at ~600 lines). Net reduction of ~190 lines due to deduplication and trimming verbose examples during relocation.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `tmp/orchestrate-state.md` missing | Full scan fallback. Write hint after detection. No warning. |
| Hint file has unknown `step` value | Full scan fallback. Overwrite hint with correct state. |
| Hint file has unknown `feature` name | Full scan fallback. Feature may have been renamed or spec deleted. |
| Hint `head` doesn't match any known commit | Full scan fallback. Git history may have been rewritten. |
| Hint says `finalized` but spec was deleted | Full scan → clean slate → Step 1. |
| Hint validation contradicts hint step | Advance to next logical step (don't full-scan). E.g., hint says Step 5, but all checkboxes [x] → advance to Step 6. |
| Quality gate git commands fail | Skip that gate, warn: "Could not compute baseline for {gate}." Continue with remaining gates. |
| `references/` file missing | Error: "orchestrate reference file missing: {path}. Re-install the ai-dev-tools plugin." |
| Multiple features in-progress (full scan detects >1) | Same as current: present list, ask user to pick. Update hint with selection. |

---

## Non-Goals

- This spec does not change the behavior of any orchestrate step (1-8) — only how the current step is detected
- This spec does not change quality gate trigger logic — only when it runs
- This spec does not change `--strict` override content — only where it lives
- This spec does not add new quality gates or steps
- This spec does not persist state across git operations (the hint file is advisory, not authoritative)
