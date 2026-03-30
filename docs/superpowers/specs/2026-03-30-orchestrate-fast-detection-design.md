# Orchestrate & Session-Handoff Fast Detection — Design Spec

**Date:** 2026-03-30
**Status:** Approved
**Plugin:** ai-dev-tools
**Skills:** orchestrate (optimization), session-handoff (optimization)
**Type:** Performance optimization reducing redundant git work and token consumption across both skills

---

## Problem Statement

### Orchestrate

`/orchestrate` takes 1-2 minutes before presenting anything to the user. The state detection algorithm scans all spec files (~17), runs multiple git commands per spec to determine completion status, then computes 5-7 quality gate baselines — totaling 20-30 tool calls. For a project with 17 specs where 16 are complete, this means ~15 wasted checks every invocation. The 600-line SKILL.md is also fully loaded into context every time, even though a typical invocation only needs ~150 lines of it.

The context health check (Step 0) is fast and valuable — it stays untouched. Everything else in the detection layer needs optimization.

### Session-Handoff

`/session-handoff` runs 6-8 git commands (branch, status, log -20, diff --stat, session commit detection with midnight fallback) to reconstruct state that is already available in two places:

1. **`gitStatus` in conversation context** — injected at session start, contains branch name, working tree status, and recent commits including the starting HEAD SHA.
2. **Conversation history** — the agent witnessed every tool call, file write, and commit it made during the session. Done items, file paths, and decisions are all in-context.

The session commit detection fallback chain (`--since="midnight"` → last 10 commits) is particularly wasteful because the agent already knows its starting HEAD from `gitStatus` and can compute `git log <start_head>..HEAD` for exact session commits in a single command.

Current cost: 6-8 tool calls for git analysis. Optimized cost: 2 tool calls (final status + session commits).

## Enhancement Summary

### Orchestrate — Three complementary optimizations:

1. **State hint file** (`tmp/orchestrate-state.md`) — persist the detected state between invocations so the next invocation can validate rather than re-derive
2. **Lazy quality gates** — defer quality gate baseline computation from "before presenting Step 8" to "after user confirms finalize"
3. **Conditional file loading** — split SKILL.md into a slim core (~150 lines) plus reference files loaded only when needed

### Session-Handoff — Context-aware git minimization:

4. **Derive starting HEAD from `gitStatus`** — extract the starting HEAD SHA from the conversation's `gitStatus` block instead of running discovery commands
5. **Exact session commits** — replace the midnight fallback chain with a single `git log <start_head>..HEAD` for precise session commit detection
6. **Skip redundant state commands** — branch name, initial status, and recent commits are already in `gitStatus`; only run `git status --short` for final state

**Acceptance criteria:**

Orchestrate:
- Same-HEAD invocation: 2 tool calls. HEAD-advanced same-feature: 3-4 tool calls.
- Quality gate baselines are not computed until the user confirms finalize at Step 8
- SKILL.md core is ~150 lines; `full-scan.md`, `quality-gates.md`, and `strict-mode.md` are loaded conditionally
- Relocated `full-scan.md` content is a verbatim copy of the current full-scan sections with no behavioral changes
- Deleting `tmp/orchestrate-state.md` gracefully falls back to full scan (no error, no degradation)
- No changes to Steps 1-7 behavior, skill dispatch, or `--strict` override content

Session-Handoff:
- Git analysis uses at most 2 tool calls (down from 6-8): `git status --short` + `git log <start_head>..HEAD`
- Session commit detection is exact (no midnight heuristic, no fallback chain)
- Handoff frontmatter schema is unchanged. Git State section body format changes from `git diff --stat` line counts to `git status --short` status codes — this is an intentional format change. Only the gathering method changes for all other fields.
- When `gitStatus` is absent from context, fall back to the exact Step 1 algorithm in session-handoff/SKILL.md, and the resulting handoff document passes the same Step 3 self-check validation (all 6 frontmatter fields + 5 section headers present)

---

## Scope

### In scope

- `orchestrate/SKILL.md`: rewrite state detection, add hint file protocol, split Step 8 into pre/post-confirmation
- New `orchestrate/references/full-scan.md`: relocated full scan algorithm
- New `orchestrate/references/quality-gates.md`: relocated quality gate triggers
- New `orchestrate/references/strict-mode.md`: relocated strict mode overrides
- Runtime artifact `tmp/orchestrate-state.md`: written by orchestrate at end of each invocation
- `session-handoff/SKILL.md`: rewrite Step 1 Git Analysis to use context-aware minimal git

### Out of scope

- Changes to any other skill (implement-plan, review-code, etc.)
- Changes to orchestrate context health check (Step 0)
- Changes to orchestrate Steps 1-7 detailed behavior (only detection routing changes)
- Changes to quality gate trigger logic (same checks, just deferred)
- Changes to `--strict` override content (same overrides, just in a separate file); note: when `strict-mode.md` is loaded at Step 5 onset, the override dispatch logic it contains is available from that point forward
- Changes to session-handoff Step 2 (Compose) or Step 3 (Write) behavior
- Changes to session-handoff Conversation Analysis logic

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
plan_hash: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0
head: de46945a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e
updated: 2026-03-30T16:50
---
```

**Fields:**

| Field | Purpose | Example |
|---|---|---|
| `feature` | Feature name (extracted from spec filename) | `checklists-enhancement` |
| `step` | Current step number or `finalized` | `6`, `finalized` |
| `spec` | Path to the current feature's spec file. When at step 1 (no spec yet), write `spec: ""` (empty string). Readers treat empty string and missing field identically as no spec yet. | `docs/superpowers/specs/...` |
| `plan` | Path to the current feature's plan file (empty if no plan yet). When no plan exists, write `plan: ""` (empty string). Readers treat empty string and missing field identically as no plan. | `docs/superpowers/plans/...` |
| `plan_hash` | Full 40-character commit SHA of the commit in which the plan file was last written. Obtain via `git log --format=%H -1 -- {plan_path}` when first writing the hint at step 5. If the plan has not yet been committed, use empty string. Written when the hint is first set to step 5 or higher. Empty string when no plan exists yet. Used by step 6 validation to count implementation commits with a single `git log` command. | `a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0` |
| `head` | Full 40-character SHA of HEAD when hint was written. Use `--short` only for display; always store full SHA. | `de46945a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e` |
| `updated` | ISO timestamp of last write | `2026-03-30T16:50` |

#### 1.2 Write Rules

The hint file is written (overwritten) at the end of every orchestrate invocation, after presenting the step to the user. The write captures the detected state so the next invocation can shortcut detection.

**Step-specific write behavior:**

| Event | `step` value written |
|---|---|
| Step 1-7 presented | The step number (e.g., `5`) |
| Step 8 presented (awaiting confirmation) | `8` |
| Step 8 finalize confirmed | `finalized` |
| User overrides or exits | The detected step (state preserved) |

When the user exits at Phase 1 (Step 8 presented but not yet confirmed), write `step: 8` to the hint. The hint retains the value `8` until the user confirms finalize, at which point it is immediately updated to `finalized`.

Write `step: finalized` to hint immediately after the user confirms finalize — before running quality gates or structured finishing. This ensures the hint is correct even if the user exits mid-sequence.

When routing to Step 1 from `finalized`, write hint with `feature: ""` (or the new feature name if already determined), `spec: ""`, `plan: ""`, `plan_hash: ""`, `step: 1`. This clears stale fields from the previous feature cycle.

The hint file is **never deleted**. `finalized` is a valid state that routes to Step 1 on the next invocation.

#### 1.3 Lifecycle

| Event | Hint state |
|---|---|
| First invocation ever | No file → full scan → write hint |
| Mid-cycle invocation | Read → validate → update step |
| Step 8 finalize confirmed | Update to `step: finalized` |
| Next invocation after finalize | Read → see `finalized` + same HEAD → Step 1 |
| External commits after finalize | Read → see `finalized` + different HEAD → lightweight check → route per Section 2.1 finalized+different-HEAD logic |
| Hint file manually deleted | No file → full scan → write hint (graceful fallback) |

### 2. Fast-Path State Detection

Replaces the current "scan all specs" algorithm for the common case. The full scan (relocated to `references/full-scan.md`) becomes the fallback.

#### 2.1 Detection Flow

```
After context health check (Step 0):

1. Read tmp/orchestrate-state.md
   ├── Not found → Read references/full-scan.md → execute Full Scan Fallback
   └── Found → compare head field to current git rev-parse HEAD
        ├── Same HEAD → trust hint, skip to step-specific validation
        └── Different HEAD → lightweight validation:
             git log --oneline <hint_head>..HEAD
             ├── 0 commits → HEAD does not include hint_head in its ancestry (rebase, amend, force-push, or reset) → full scan fallback
             ├── Commits match feature name → advance step:
             │    step 5 → count checked checkboxes (lines matching `- [x]`) and unchecked (lines matching `- [ ]`) in the plan file using Read or Grep tool; if all checked, advance to step 6
             │    step 6 → count commits since plan hash (git log)
             │    step 7 → check for new commits after review
             │    other → proceed to step-specific validation (Section 2.2)
             └── Commits don't match feature → Read references/full-scan.md

Note: "Commits match feature name" uses `git log --grep='{feature_name}'` substring matching, same as the current algorithm. The known limitation (prefix collisions like `implement-plan` vs `implement-plan-monorepo`) is inherited and handled by the full scan fallback's ambiguity handler.

2. If step == "finalized" (only applies when hint was found in item 1; if item 1 triggered full scan, skip this):
   ├── Same HEAD → route to Step 1 (brainstorm)
   └── Different HEAD →
        Run git log --oneline <hint_head>..HEAD.
        For each commit message, check if it matches any feature name
        extracted from filenames in docs/superpowers/specs/.
        Feature name extraction rule (inline, no reference load needed):
        strip YYYY-MM-DD- prefix and -design suffix from spec filenames.
        ├── Exactly one feature matches all new commits →
        │    set that feature as current, run step-specific validation
        │    from step 2 forward (spec approval → plan existence →
        │    checkbox state) to determine the correct step. Set hint
        │    to the first step whose trigger condition is not yet met.
        │    Once the current step is determined, apply conditional
        │    loading rules per Section 4.4.
        └── Multiple features match or none match →
             Read references/full-scan.md → execute Full Scan Fallback
```

#### 2.2 Step-Specific Validation

When the hint is trusted (same HEAD) or advanced (HEAD changed, same feature), run exactly one targeted check to confirm the step is correct:

> **Tool calls column:** counts additional validation calls beyond the initial hint read. The hint read itself is not counted here (it appears in Section 2.3).

| Hinted step | Validation | Tool calls |
|---|---|---|
| 1 (brainstorm) | Confirm spec file does NOT exist (spec field is empty at step 1). If spec file now exists, advance to step 2. | 1 (glob or file check) |
| 2 (spec review) | Check spec `**Status:**` header | 1 (read first 5 lines) |
| 3 (respond to review) | Check `tmp/review_summary.md`: **Reviewed:** field matches `spec` field in hint AND Critical count > 0 | 1 (read) |
| 4 (write plan) | Check if plan file exists | 1 (glob) |
| 5 (implement) | Check plan checkboxes | 1 (grep) |
| 6 (code review) | Count commits since `plan_hash` (stored in hint) using `git log <plan_hash>..HEAD`. If `plan_hash` is empty, attempt to populate via `git log --format=%H -1 -- {plan_path}`; if still empty, full scan fallback. | 1 (git log) |
| 7 (fix findings) | Check review_summary.md for criticals/highs | 1 (read) |
| 8 (complete) | Check review_summary.md is clean | 1 (read) |
| finalized | None needed | 0 |

> **Step 3 sub-cases:**
> - Critical>0: remain at step 3 (respond to review findings).
> - Critical=0 AND High>0: advance directly to step 4 (no step 3 trigger). Before advancing, present an informational High-only message using the current Step 3 behavior.
> - Critical=0 AND High=0: advance to step 4.
> - Reviewed field does not match the `spec` field in hint: treat review as stale, route to step 2.

**If validation contradicts the hint** (e.g., hint says Step 5 but all checkboxes are `[x]`), advance to the next logical step rather than falling back to full scan. The hint was just slightly behind — no need to scan everything.

#### 2.3 Tool Call Budget

| Path | Tool calls | When |
|---|---|---|
| Same HEAD (back-to-back) | 2 (read hint + 1 validation) | Most common mid-cycle |
| HEAD advanced, same feature | 3-4 (read hint + git log + 1-2 validations) | After a skill completes |
| `finalized` + same HEAD | 1 (read hint) | Starting new feature |
| `finalized` + different HEAD, single feature | 5-7 | After finalize, new feature work detected |
| Full scan fallback (detection only) | 15-25 | First invocation, corrupt hint, ambiguous state |
| Full scan fallback (detection + quality gates) | 20-30 | Full invocation including Step 8 finalize (detection adds 15-25; quality gates add 5-7) |

### 3. Lazy Quality Gates

#### 3.1 Step 8 Split

Step 8 is split into two phases with a user confirmation boundary between them.

**Phase 1 — Pre-confirmation (no quality gate computation):**

Present the completion status only. No git baseline commands.

The Status field is populated from the step 8 validation read (`review_summary.md`); no additional file reads are needed at Phase 1.

```
── Step 8: Complete ──────────────────────────
Feature: <feature-name>
Status: <Approved | Approved with suggestions>

Ready to finalize?
```

Do NOT run quality gate baselines yet.

**Phase 2 — Post-confirmation (compute quality gates):**

After the user confirms finalize:

1. Update `tmp/orchestrate-state.md` with `step: finalized`
2. Read `references/quality-gates.md`
3. Compute quality gate baselines (5-7 git commands)
4. If `tmp/current-roadmap.md` exists: update it, mark feature as Done.
5. Present recommendations
6. Present "What's next?"

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
3. **Update hint** to `step: finalized`
4. **Verification gate:** Read `references/strict-mode.md`, discover and run test/build commands
5. **Quality gates:** Read `references/quality-gates.md`, compute baselines
6. **Roadmap update:** If `tmp/current-roadmap.md` exists, update it and mark feature as Done (same as Section 3.1 Phase 2 step 4)
7. **Structured finishing:** Present options (`[1] merge / [2] keep / [3] handoff`)

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

The always-loaded core contains, in this section order:

1. Help text + argument parsing (~25 lines)
2. Context health check / Step 0 (~15 lines)
3. State hint file protocol: format, read, validate, write rules (~30 lines)
4. Fast-path detection algorithm (~25 lines)
5. **Conditional Loading** — routing instructions for conditional reads (~10 lines). This section must appear before the Steps section so the agent reads loading rules before executing any step.
6. Steps 1-8 condensed behavior: 8 steps at ~5 lines each (~40 lines total). Per step, preserve: trigger condition, skill-invocation syntax, and one key edge case. Drop: output formatting examples, rationale paragraphs, and illustrative sample outputs.
7. Error handling table: core entries (~10 lines)
8. Minimal inline cross-check rules for fast-path validation: Reviewed field match + feature-name commit grep. The full cross-check algorithm (scope header overlap, response_analysis.md counting, stale-artifact cross-referencing, and tmp/ file cross-checking) lives in `references/full-scan.md` and is only loaded when the fast path fails.

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

If --strict is active at Step 5 onset:
  → Read references/strict-mode.md for execution model recommendation
    and override dispatch (single-agent + subagent blocks).

If --strict is active at Step 8:
  → Read references/strict-mode.md (if not already loaded) for
    verification gate and structured finishing.

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

### 5. Session-Handoff: Context-Aware Git Minimization

#### 5.1 Problem: Redundant Git Discovery

Current Step 1 Git Analysis runs these commands sequentially:

| # | Command | Purpose | Already available? |
|---|---|---|---|
| 1 | `git rev-parse --is-inside-work-tree` | Preflight check | Yes — `gitStatus` presence implies git repo |
| 2 | `git rev-parse --verify HEAD` | Check for commits | Yes — `gitStatus` shows recent commits |
| 3 | `git branch --show-current` | Branch name | Yes — `gitStatus` "Current branch:" field |
| 4 | `git status --short` | Uncommitted changes | **Stale** — `gitStatus` is from session start, need fresh |
| 5 | `git log --oneline -20` | Recent commits | Yes — `gitStatus` "Recent commits:" field |
| 6 | `git diff --stat HEAD` | Change summary | **Redundant** — `git status --short` covers file-level change information |
| 7 | `git log --oneline --since="midnight" -20` | Session commits | Replaceable — see 5.2 |
| 8 | (fallback) last 10 commits | Session boundary | Replaceable — see 5.2 |

7 of 8 commands are redundant or replaceable.

#### 5.2 Optimized Git Analysis

Replace the entire Git Analysis subsection in Step 1 with:

**Preflight:** Check if `gitStatus` is present in the conversation context (injected by Claude Code at session start).

**If `gitStatus` is present (typical case):**

Extract from `gitStatus`:
- **Branch name:** from "Current branch:" line
- **Starting HEAD:** the first commit SHA listed in the "Recent commits:" field (`gitStatus` lists commits most-recent-first) — this is HEAD at session start since `gitStatus` is injected before any work begins
- **Git repo:** confirmed by `gitStatus` presence

Run exactly 2 commands:
1. `git status --short` — current uncommitted state (may differ from session start)
2. `git log --oneline <start_head>..HEAD` — exact session commits (commits made between session start and now)

`git diff --stat HEAD` (command #6 from the legacy list) is dropped. `git status --short` is sufficient for the Git State section. The Git State section body uses `git status --short` output (file paths with status codes). This replaces the line-count format from `git diff --stat HEAD`. See Section 5.5 for frontmatter field mapping.

If `git log` returns nothing (no new commits this session), `session_commits: 0`.

If `git log` fails for any reason — including ambiguous SHA, rebase, or force-push — fall back to `git log --oneline --since="midnight" -20`.

**If `gitStatus` is absent (non-standard invocation):**

Fall back to the current full git analysis (commands 1-8 above). This covers edge cases like:
- Session started without `gitStatus` injection
- Skill invoked outside Claude Code (e.g., from a script)
- Context was compressed and `gitStatus` is no longer visible

#### 5.3 Tool Call Budget

| Path | Tool calls | When |
|---|---|---|
| `gitStatus` present (typical) | 2 | Normal session handoff |
| `gitStatus` absent (fallback) | 6-8 | Non-standard invocation |

Savings: 4-6 tool calls per typical invocation.

#### 5.4 Conversation-Derived Context

No changes to the Conversation Analysis subsection — it already scans conversation context, not git. However, add this guidance to the Git Analysis section:

> **Non-normative implementation note:** The agent has witnessed every commit it made during the session via tool call results. The `git log <start_head>..HEAD` output serves as the authoritative commit list, but the agent should cross-reference with its own memory of commits for richer Done item descriptions (commit messages alone may lack context the agent observed).

#### 5.5 Frontmatter Impact

No frontmatter schema changes. The same fields are populated from different sources:

| Field | Current source | Optimized source |
|---|---|---|
| `branch` | `git branch --show-current` | `gitStatus` "Current branch:" |
| `uncommitted_changes` | `git status --short` | `git status --short` (still needed fresh) |
| `uncommitted_files` | `git status --short` | `git status --short` (still needed fresh) |
| `session_commits` | midnight heuristic chain | `git log <start_head>..HEAD` count |

**Note on `git diff --stat HEAD` (command #6):** This command is dropped in the optimized path as redundant — `git status --short` covers file-level change information. The Git State section body is populated from `git status --short` output instead. No third command is needed.

---

## What Changes Where

| Component | Change | Lines (est.) |
|---|---|---|
| `orchestrate/SKILL.md` | Rewrite: slim core with hint protocol, fast-path detection, condensed steps, routing instructions | ~150 (replaces ~600) |
| New: `orchestrate/references/full-scan.md` | Relocated: Feature Detection Algorithm, Matching Logic, Cross-Checking, Ambiguity Handling | ~80 |
| New: `orchestrate/references/quality-gates.md` | Relocated: Quality Gate Triggers, baseline detection, presentation format | ~80 |
| New: `orchestrate/references/strict-mode.md` | Relocated: Execution model, override dispatch, verification gate, structured finishing | ~100 |
| Runtime artifact: `tmp/orchestrate-state.md` | New: written by orchestrate on each invocation | ~8 per write |
| `session-handoff/SKILL.md` | Rewrite Step 1 Git Analysis: context-aware fast path + fallback | ~same line count (replaces algorithm, not structure) |

**Orchestrate total:** ~410 lines across 4 files (replaces 1 file at ~600 lines). Net reduction of ~190 lines due to deduplication and trimming verbose examples during relocation.

**Session-handoff:** No line count change — the SKILL.md is rewritten in-place with a shorter, faster algorithm. The structure and remaining steps are untouched.

---

## Error Handling

### Orchestrate

| Scenario | Behavior |
|---|---|
| `tmp/orchestrate-state.md` missing | Full scan fallback. Write hint after detection. No warning. |
| Hint file YAML is malformed or required fields (`feature`, `step`, `head`) are missing | Full scan fallback. Overwrite hint with correct state. No warning needed. |
| Hint file has unknown `step` value | Full scan fallback. Overwrite hint with correct state. |
| Hint file has unknown `feature` name | Full scan fallback. Feature may have been renamed or spec deleted. |
| Hint `head` doesn't match any known commit | Full scan fallback. Git history may have been rewritten. |
| Hint says `finalized` but spec was deleted | Full scan → clean slate → Step 1. |
| Hint validation contradicts hint step | Advance to next logical step (don't full-scan). E.g., hint says Step 5, but all checkboxes [x] → advance to Step 6. |
| Quality gate git commands fail | Skip that gate, warn: "Could not compute baseline for {gate}." Continue with remaining gates. |
| `references/` file missing | Error: "orchestrate reference file missing: {path}. Re-install the ai-dev-tools plugin." |
| Multiple features in-progress (full scan detects >1) | Same as current: present list, ask user to pick. Update hint with selection. |

### Session-Handoff

| Scenario | Behavior |
|---|---|
| `gitStatus` not in conversation context | Fall back to current full git analysis (6-8 commands). No warning needed — the agent simply uses the available method. |
| `gitStatus` present but starting HEAD is missing | Parse what's available from `gitStatus` (branch name, etc.). For session commits, fall back to `git log --since="midnight" -20`. |
| `git log <start_head>..HEAD` fails (rebased/force-pushed) | Fall back to `git log --oneline --since="midnight" -20`. Warn: "Session commit boundary estimated — git history may have been rewritten." |
| No commits since session start | `session_commits: 0`. Git State section shows branch + uncommitted changes only. |
| Detached HEAD in `gitStatus` | Extract commit hash instead of branch name. Same as current behavior. |

---

## Non-Goals

- This spec does not change the behavior of any orchestrate step (1-8) — only how the current step is detected
- This spec does not change quality gate trigger logic — only when it runs
- This spec does not change `--strict` override content — only where it lives
- This spec does not add new quality gates or steps
- This spec does not persist state across git operations (the hint file is advisory, not authoritative)
- This spec does not change session-handoff output format, Compose logic, or Write logic — only the git gathering method in Step 1
