# orchestrate — Design Spec

**Date:** 2026-03-28
**Status:** Approved
**Plugin:** ai-dev-tools
**Skill:** orchestrate (new skill)
**Type:** Meta-skill — dispatches and sequences other skills

---

## Problem Statement

The ai-dev-tools plugin has 10+ skills that work independently. The developer must remember the correct sequence (brainstorm → spec review → plan → implement → code review → commit), know when to run quality gates (convention-enforcer, api-contract-guard, test-audit), and manually invoke each skill with the right arguments. This cognitive overhead slows down the workflow and leads to skipped steps — especially quality gates that have no natural trigger.

## Enhancement Summary

A meta-skill that manages the developer's core development loop and advises on quality gates. Single entry point: `/orchestrate`. It detects where you are in the cycle by scanning artifacts, presents the next step with context, and invokes the appropriate skill on confirmation. Between steps, it checks quality gate triggers and presents recommendations (but doesn't execute them).

**It is NOT** a monolithic skill that replaces all others. It's a dispatcher — it invokes existing skills and tracks progress between them.

**Acceptance criteria:**
- `/orchestrate` detects current cycle state from artifacts + git history
- Presents next step with context, invokes on user confirmation
- Core loop runs: brainstorm → spec review → respond → plan → implement → code review → fix → commit
- Quality gate recommendations surface after each cycle completion
- User can override, skip, or do "something else" at any point
- Resumable: user can exit mid-cycle and `/orchestrate` picks up where they left off
- Project-agnostic: works on any codebase, not just the ai-dev-tools plugin

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Core loop execution + advisory quality gates | Execute the repeatable cycle, advise on the occasional gates |
| Quality gate mode | Recommend commands, don't execute | Keeps skill focused; user decides when to run gates |
| State detection | File existence + content parsing + git | No separate state file; artifacts are the source of truth |
| Invocation style | Resume-aware (auto-detect state) | User just says `/orchestrate` — no need to track position |
| Presentation | Show context + next action, user confirms | User sees what's about to happen before it runs |
| Feature selection | Suggest from roadmap, user can override | Roadmap is the default, but never forced |
| Quality triggers | Git-based counters | Simple, reliable, no code reading needed |
| User freedom | Always offer "something else" | Never lock user into the loop |

---

## SKILL.md Workflow

### Frontmatter

```yaml
name: orchestrate
description: "Use when the user wants to start a development cycle, continue where they left off, check what's next, automate their brainstorm-review-implement-review-commit workflow, or get recommendations for quality gates — even if they don't use the exact skill name."
```

### On Invocation

```
/orchestrate
    │
    ▼
1. Detect current state (scan artifacts + git)
    │
    ▼
2. Present status + next step with context
    │
    ▼
3. User confirms → invoke skill
   User overrides → do what they want
   User exits → state persists in artifacts
    │
    ▼
4. After skill completes → re-detect state → loop to step 2
    │
    ▼
5. After cycle completes → check quality gate triggers → present recommendations
    │
    ▼
6. "What's next?" → next feature / run recommendation / something else
```

---

## Core Loop Steps

### Step 1: BRAINSTORM
**Trigger:** No spec file in `docs/superpowers/specs/` for the current feature.

**Behavior:**
- Check `tmp/current-roadmap.md` for the next unimplemented item
- Present: "Based on the roadmap, next up is `{skill_name}`. Start brainstorming? Or tell me what you'd like to work on."
- On confirm: invoke `superpowers:brainstorming`
- On override: user provides their own feature description, pass to brainstorming

### Step 2: SPEC REVIEW
**Trigger:** Spec file exists, `**Status:**` header does not contain "Approved".

**Behavior:**
- Present: "Spec written at `{path}`. Ready to review? I'll dispatch 3 parallel review agents."
- On confirm: invoke `/review-doc {spec_path}`

### Step 3: RESPOND TO REVIEW
**Trigger:** `tmp/review_analysis.md` exists with unresolved findings (Critical or Important count > 0).

**Behavior:**
- Present: "Review found {N} critical, {M} important findings. Ready to apply fixes?"
- On confirm: invoke `/respond-to-review`
- **Loop:** After responding, re-invoke `/review-doc` if critical findings existed. Repeat Steps 2-3 until spec is Approved (zero criticals + fact-check ≥ 90%).

### Step 4: WRITE PLAN
**Trigger:** Spec Approved, no matching plan file in `docs/superpowers/plans/`.

**Behavior:**
- Present: "Spec approved. Ready to write the implementation plan?"
- On confirm: invoke `superpowers:writing-plans`

### Step 5: IMPLEMENT
**Trigger:** Plan file exists, not all checkboxes are `[x]`.

**Behavior:**
- Present: "Plan at `{path}` — {N} tasks, {M} completed. Continue implementation? I'll use subagent-driven-development."
- On confirm: invoke `superpowers:subagent-driven-development`
- If all tasks completed on prior run: skip to Step 6

### Step 6: CODE REVIEW
**Trigger:** Implementation commits exist after the plan's commit date.

**Behavior:**
- Count implementation commits since plan was written
- Present: "Implementation has {N} commits. Ready for code review?"
- On confirm: invoke `/review-code {N}`

### Step 7: FIX REVIEW FINDINGS
**Trigger:** `tmp/review_code.md` exists with findings (Critical or High count > 0).

**Behavior:**
- Present: "Code review found {N} issues ({C} critical, {H} high). Ready to fix?"
- On confirm: apply fixes (dispatch fix subagent or invoke `/respond-to-review`)
- **Loop:** After fixing, re-invoke `/review-code`. Repeat Steps 6-7 until zero critical + zero high.

### Step 8: COMMIT & COMPLETE
**Trigger:** Code review clean (zero critical, zero high) or user accepts remaining findings.

**Behavior:**
- Present: "All critical/high issues resolved. {M} medium, {L} low remaining. Ready to finalize?"
- Update `tmp/current-roadmap.md` — mark feature as Done
- Check quality gate triggers
- Present recommendations + "What's next?"

---

## State Detection

Orchestrate detects the current cycle position by scanning artifacts and git:

| Check | Source | Status signal |
|---|---|---|
| Feature identified | `tmp/current-roadmap.md` | Next unimplemented item in roadmap |
| Spec exists | `docs/superpowers/specs/*-design.md` | Most recent spec file by date prefix |
| Spec reviewed | Spec file `**Status:**` header | Contains "Approved" |
| Plan exists | `docs/superpowers/plans/*-plan.md` | File exists matching spec's feature name |
| Implementation in progress | Plan file checkboxes | Some `- [x]`, some `- [ ]` |
| Implementation complete | Plan file checkboxes + git | All `- [x]` OR commits after plan covering file list |
| Code reviewed | `tmp/review_code.md` | File exists, check Summary table severity counts |
| Review resolved | `tmp/response_code.md` | All findings Applied/Deferred |

### Matching Logic

Spec and plan filenames encode date + feature name (e.g., `2026-03-28-convention-enforcer-design.md` → feature = `convention-enforcer`). Orchestrate extracts the feature name and matches across spec/plan/commits.

### Ambiguity Handling

- **Multiple in-progress features:** Present list: "Found multiple in-progress features: {list}. Which one?"
- **No artifacts:** Clean slate → Step 1 (suggest from roadmap)
- **Stale artifacts:** If spec exists but is >30 days old with no plan, ask: "Found stale spec for `{name}` from {date}. Continue or start fresh?"

---

## Quality Gate Triggers

Checked after Step 8 (cycle completion) and presented as recommendations:

| Gate | Trigger | Detection | Recommendation |
|---|---|---|---|
| convention-enforcer | >20 files changed since last run | `git diff --name-only` from last commit with `convention-enforcer` in message | "⚠ {N} files changed since last convention-enforcer → run `/convention-enforcer`" |
| api-contract-guard | New module/package directory created | `git log --diff-filter=A` for new top-level directories | "⚠ New module `{name}` created → run `/api-contract-guard`" |
| test-audit | >10 commits since last run | Count commits since last `test-audit` in commit message | "⚠ {N} commits since last test-audit → run `/test-audit`" |
| consolidate | >40 commits since last run | Count commits since last `consolidate` in commit message | "ℹ {N} commits since last consolidate → run `/consolidate`" |
| refactor-to-layers | Module exceeds ~30K lines | `wc -l` on source files per top-level src/ directory | "⚠ Module `{name}` at {N}K lines → consider `/refactor-to-layers`" |
| session-handoff | Context usage >70% | Check context window usage | "ℹ Context at {N}% → consider `/session-handoff` before next feature" |

### Detection of "Last Run"

Scan git log for commits whose messages contain the skill name. Most recent such commit = baseline. No such commit = "never run" → always recommend on first trigger check.

### Presentation Format

```
✓ Feature "{name}" committed.

Recommendations:
  ⚠ 23 files changed since last convention-enforcer → run /convention-enforcer
  ℹ Context at 72% → consider /session-handoff before next feature

What's next?
  > Next feature (continue with /orchestrate)
  > Run a recommendation above
  > Something else (tell me what you need)
```

- Warnings (⚠) first, info (ℹ) second
- Max 3 recommendations at a time
- Priority order: convention-enforcer > api-contract-guard > test-audit > consolidate > refactor-to-layers > session-handoff
- User can always choose "something else" — never locked into recommendations

---

## Scope of Changes

**New files:**
- `ai-dev-tools/skills/orchestrate/SKILL.md` (~200-250 lines) — the orchestrator workflow, state detection, quality gate triggers, core loop steps

**No reference files needed** — orchestrate dispatches to other skills; it doesn't have its own analysis or generation logic.

**Modified files:**
- `ai-dev-tools/.claude-plugin/plugin.json` — add orchestrate to description

**Not modified:**
- No existing skills are changed — orchestrate invokes them as-is
- No reference files in other skills are affected

---

## Error Handling

| Scenario | Behavior |
|---|---|
| No roadmap file found | Ask: "What feature would you like to work on?" Skip roadmap suggestion. |
| Spec exists but can't determine feature name | Ask: "Which feature is this spec for?" |
| Multiple specs without plans | Present list, ask user to pick |
| Invoked skill fails | Report the failure, offer: "Retry / Skip to next step / Exit" |
| Git history unavailable | Skip quality gate trigger checks, warn: "Can't check quality gate triggers without git history." |
| Context window too small for next skill | Recommend `/session-handoff` before proceeding |
| User says "something else" | Exit orchestrate loop, let user do whatever they want. `/orchestrate` will re-detect state next time. |
| Stale artifacts (>30 days) | Ask: "Found stale spec from {date}. Continue or start fresh?" |
| Plan partially completed | Present progress: "{N}/{M} tasks done. Resume?" |

---

## Relationship to Other Skills

Orchestrate is a **dispatcher** — it invokes these skills but does not modify or extend them:

| Skill | When orchestrate invokes it |
|---|---|
| superpowers:brainstorming | Step 1 (new feature) |
| /review-doc | Step 2 (spec review) |
| /respond-to-review | Step 3 (fix review findings) |
| superpowers:writing-plans | Step 4 (write plan) |
| superpowers:subagent-driven-development | Step 5 (implement) |
| /review-code | Step 6 (code review) |

Quality gates are **recommended, not invoked:**
- /convention-enforcer, /api-contract-guard, /test-audit, /consolidate
- /refactor-to-layers, /refactor-to-monorepo, /session-handoff

---

## Design Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Skill type | Meta-skill (dispatcher) | Sequences existing skills, doesn't replace them |
| Core loop | 8 steps with review loops | Matches the developer's actual workflow |
| Quality gates | Advisory only (recommend, don't execute) | Keeps scope focused; user owns the decision |
| State detection | Artifact + git scanning, no state file | Artifacts are already the source of truth |
| Resume | Auto-detect on each invocation | User just says `/orchestrate` — no tracking needed |
| Feature suggestion | Roadmap-based with user override | Smart default, never forced |
| Trigger thresholds | Git counters (doubled for AI commit frequency) | Simple, reliable, appropriately sized for AI-driven development |
| User freedom | Always offer "something else" exit | Orchestrate is a helper, not a cage |
| Project agnostic | Detects implementation via git + plan checkboxes | Works on any project, not just ai-dev-tools skills |
