# orchestrate — Design Spec

**Date:** 2026-03-28
**Status:** Approved (R2 revisions applied)
**Plugin:** ai-dev-tools
**Skill:** orchestrate (new skill)
**Type:** Meta-skill — re-invocable state machine that dispatches other skills

---

## Problem Statement

The ai-dev-tools plugin has 10+ skills that work independently. The developer must remember the correct sequence (brainstorm → spec review → plan → implement → code review → commit), know when to run quality gates (convention-enforcer, api-contract-guard, test-audit), and manually invoke each skill with the right arguments. This cognitive overhead slows down the workflow and leads to skipped steps — especially quality gates that have no natural trigger.

## Enhancement Summary

A meta-skill that manages the developer's core development loop and advises on quality gates. Single entry point: `/orchestrate`. It detects where you are in the cycle by scanning artifacts + git, presents the next step with context, and invokes the appropriate skill on confirmation.

**Execution model:** Orchestrate is a **re-invocable state machine**, not a persistent execution loop. Each `/orchestrate` invocation detects state, suggests/invokes ONE step, and then the invoked skill takes over the conversation. After that skill completes, the user re-invokes `/orchestrate` to continue. This design avoids the unproven nested-skill-invocation problem — no SKILL.md has ever successfully invoked another skill in a persistent loop. The resume-aware state detection makes this seamless.

**It is NOT** a monolithic skill that replaces all others. It's a dispatcher — it detects state, suggests the next action, and hands off to the appropriate skill.

**Acceptance criteria:**
- `/orchestrate` detects current cycle state from artifacts + git history
- Presents next step with context, invokes on user confirmation
- Core loop: brainstorm → spec review → respond → plan → implement → code review → fix → commit
- Quality gate recommendations surface after each cycle completion
- User can override, skip, or do "something else" at any point
- Resumable: user can exit mid-cycle and `/orchestrate` picks up where they left off
- Project-agnostic: works on any codebase, not just the ai-dev-tools plugin
- Assumes implementation skill updates plan checkboxes in-place as tasks complete

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Core loop execution + advisory quality gates | Execute the repeatable cycle, advise on the occasional gates |
| Quality gate mode | Recommend commands, don't execute | Keeps skill focused; user decides when to run gates |
| State detection | File existence + content parsing + git | No separate state file; artifacts are the source of truth |
| Execution model | Re-invocable state machine (one step per invocation) | Avoids unproven nested skill invocation; resume-aware detection makes it seamless |
| Presentation | Show context + next action, user confirms | User sees what's about to happen before it runs |
| Feature selection | Suggest from roadmap, user can override | Roadmap is the default, but never forced |
| Quality triggers | Git-based counters with substring matching | Simple, reliable, no code reading needed |
| User freedom | Always offer "something else" | Never lock user into the loop |

---

## SKILL.md Workflow

### Frontmatter

```yaml
name: orchestrate
description: "Use when the user wants to start a development cycle, continue where they left off, check what's next, automate their brainstorm-review-implement-review-commit workflow, or get recommendations for quality gates — even if they don't use the exact skill name."
```

### On Each Invocation

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
3. User confirms → invoke skill (skill takes over conversation)
   User overrides → do what they want
   User exits → state persists in artifacts
    │
    ▼
4. After skill completes → user re-invokes /orchestrate
    │
    ▼
5. If cycle just completed → check quality gate triggers → present recommendations
    │
    ▼
6. "What's next?" → next feature / run recommendation / something else
```

**Note:** Each `/orchestrate` invocation handles ONE step. The user re-invokes after each skill completes. This is the natural Claude Code interaction model — skills don't nest.

---

## Core Loop Steps

### Step 1: BRAINSTORM
**Trigger:** No spec file in `docs/superpowers/specs/` for the current feature.

**Behavior:**
- Check `tmp/current-roadmap.md` for the next unimplemented item (if file exists)
- If no roadmap: ask "What feature would you like to work on?"
- Present: "Based on the roadmap, next up is `{skill_name}`. Start brainstorming? Or tell me what you'd like to work on."
- On confirm: invoke `superpowers:brainstorming`
- On override: user provides their own feature description, pass to brainstorming

### Step 2: SPEC REVIEW
**Trigger:** Spec file exists, `**Status:**` header does not contain "Approved".

**Behavior:**
- Present: "Spec written at `{path}`. Ready to review? I'll dispatch 3 parallel review agents."
- On confirm: invoke `/review-doc {spec_path}`

### Step 3: RESPOND TO REVIEW
**Trigger:** `tmp/review_analysis.md` exists AND its `**Reviewed:**` field matches the current spec path AND it has unresolved findings (Critical or Important count > 0). If `**Reviewed:**` doesn't match current spec, treat as stale and ignore.

**Behavior:**
- Present: "Review found {N} critical, {M} important findings. Ready to apply fixes?"
- On confirm: invoke `/respond-to-review {round_number} {spec_path}` where round_number = count existing `## Round N` sections in `tmp/response_analysis.md` + 1. No arch file argument for spec reviews.
- **Loop:** After responding, re-invoke `/review-doc` if critical findings existed. Repeat Steps 2-3 until spec status is "Approved" or "Approved with suggestions" (either = zero criticals, loop exits).

### Step 4: WRITE PLAN
**Trigger:** Spec Approved (or Approved with suggestions), no matching plan file in `docs/superpowers/plans/`.

**Behavior:**
- Present: "Spec approved. Ready to write the implementation plan?"
- On confirm: invoke `superpowers:writing-plans`

### Step 5: IMPLEMENT
**Trigger:** Plan file exists, not all checkboxes are `[x]`.

**Behavior:**
- Present: "Plan at `{path}` — {N} tasks, {M} completed. Continue implementation? I'll use subagent-driven-development."
- On confirm: invoke `superpowers:subagent-driven-development`
- **Dependency:** Assumes the implementation skill updates plan checkboxes `- [ ]` → `- [x]` in-place as tasks complete.
- **Note:** If all checkboxes are already `[x]`, Step 5 doesn't trigger — state detection routes directly to Step 6. State detection evaluates ALL step triggers to find the first applicable one.

### Step 6: CODE REVIEW
**Trigger:** Implementation commits exist after the plan's commit date (detected via `git log --format=%aI -1 -- {plan_path}` to find plan commit date, then count feature-scoped commits after that).

**Behavior:**
- Count implementation commits since plan was written
- Present: "Implementation has {N} commits. Ready for code review against the spec?"
- On confirm: invoke `/review-code {N} {spec_path}` (passes BOTH commit count AND spec as analysis doc)

### Step 7: FIX REVIEW FINDINGS
**Trigger:** `tmp/review_code.md` exists with findings (Critical or High count > 0) AND the review's commit hashes match the current feature's commits (cross-check to avoid stale review from a different feature).

**Behavior:**
- Present: "Code review found {N} issues ({C} critical, {H} high). Ready to fix?"
- On confirm: read `tmp/review_code.md` findings, apply fixes per the suggested-fix in each finding, then re-run `/review-code` to verify
- **Loop:** Repeat Steps 6-7 until zero critical + zero high in `tmp/review_code.md`
- **Note:** Does NOT use `/respond-to-review` for code fixes (that skill reads `tmp/review_analysis.md`, not `tmp/review_code.md`). Code fixes are applied directly based on the review's suggested fixes.

### Step 8: COMPLETE
**Trigger:** Code review clean (zero critical, zero high) or user accepts remaining findings.

**Behavior:**
- Present: "All critical/high issues resolved. {M} medium, {L} low remaining. Ready to finalize?" (No new commit — implementation was committed during Step 5. Step 8 updates roadmap and checks quality gates.)
- If `tmp/current-roadmap.md` exists: update it — mark feature as Done. If no roadmap file, skip this step.
- Check quality gate triggers
- Present recommendations + "What's next?"

---

## State Detection

Orchestrate detects the current cycle position by scanning artifacts and git:

| Check | Source | Status signal |
|---|---|---|
| Feature identified | `tmp/current-roadmap.md` | Next unimplemented item (if file exists) |
| Spec exists | `docs/superpowers/specs/*-design.md` | File exists for current feature |
| Spec reviewed | Spec file `**Status:**` header (line 4, match bold `**Status:**` format to avoid body content false matches) | Contains "Approved" (matches both "Approved" and "Approved with suggestions") |
| Spec review exists with findings | `tmp/review_analysis.md` `**Reviewed:**` field | Matches current spec path AND status is "Issues Found" |
| Spec review applied, re-review needed | `tmp/response_analysis.md` | Has entries for current round AND spec status still not "Approved" |
| Plan exists | `docs/superpowers/plans/*-plan.md` | File exists matching spec's feature name |
| Implementation in progress | Plan file checkboxes | Some `- [x]`, some `- [ ]` |
| Implementation complete | Plan file checkboxes + git | All `- [x]` OR commits after plan commit date |
| Code reviewed | `tmp/review_code.md` | File exists, commits in findings match current feature |
| Review resolved | `tmp/review_code.md` Summary table | 0 Critical, 0 High |
| Code fixes applied, re-review needed | Commits exist after `tmp/review_code.md`'s reviewed commits | New commits since last review = fixes applied, re-review needed |

### Matching Logic

Spec and plan filenames encode date + feature name (e.g., `2026-03-28-convention-enforcer-design.md` → feature = `convention-enforcer`). Extract feature name by stripping date prefix and `-design`/`-plan` suffix.

**Feature detection algorithm:**
1. Find ALL specs in `docs/superpowers/specs/` that don't have a completed cycle. A cycle is complete if: (a) all plan checkboxes are `[x]` AND review is clean, OR (b) plan exists with all unchecked boxes BUT feature-specific commits exist after plan date (fallback for plans where checkboxes were not tracked)
2. If exactly one → that's the current feature
3. If multiple → present list: "Found multiple in-progress features: {list}. Which one?"
4. If zero → clean slate, go to Step 1

This avoids the "most recent by date" problem — it tracks completion status, not creation date.

**Commit matching:** Search `git log` for commits containing the feature name as a substring (matches both `feat(convention-enforcer):` parenthetical scope and `convention-enforcer: ...` prefix style).

### Implementation Detection

To determine if implementation has started/completed:
- Find the plan's commit date: `git log --format=%aI -1 -- {plan_path}`
- Count feature-scoped commits after that date: `git log --oneline {plan_commit}..HEAD --grep='{feature_name}' -- . ':!docs/' ':!tmp/'` (scopes to feature by commit message, excludes doc/temp changes. Commits without the feature name in the message will be missed — acceptable trade-off for accuracy.)
- If count > 0: implementation has started

### Cross-Checking tmp/ Files

`tmp/review_code.md` and `tmp/response_code.md` are global singletons (no feature prefix). To avoid attributing a stale review to the wrong feature:
- Parse commit hashes from `tmp/review_code.md` findings (each finding includes a `**Commit:**` hash)
- Verify those commits appear in `git log --grep='{feature_name}'` output (feature-scoped, avoids "implementation window" boundary ambiguity)
- If commits don't match current feature: treat as stale, ignore the review file
- Same cross-check for `tmp/review_analysis.md`: verify its `**Reviewed:**` field matches the current spec path

### Ambiguity Handling

- **Multiple in-progress features:** Present list, ask user to pick
- **No artifacts:** Clean slate → Step 1 (suggest from roadmap or ask)
- **Stale artifacts:** If spec exists but is >30 days old with no plan, ask: "Found stale spec for `{name}` from {date}. Continue or start fresh?"

---

## Quality Gate Triggers

Checked after Step 8 (cycle completion) and presented as recommendations:

| Gate | Trigger | Detection | Recommendation |
|---|---|---|---|
| convention-enforcer | >20 files changed since last run | `git diff --name-only {baseline}..HEAD` where baseline = last commit with `convention-enforcer` in message (substring match) | "⚠ {N} files changed since last convention-enforcer → run `/convention-enforcer`" |
| api-contract-guard | New module/package directory created OR >15 files added to existing modules | `git log --diff-filter=A --name-only {baseline}..HEAD` for new top-level directories or bulk file additions | "⚠ New module `{name}` created → run `/api-contract-guard`" |
| test-audit | >10 commits since last run | `git log --oneline {baseline}..HEAD \| wc -l` where baseline = last commit with `test-audit` in message | "⚠ {N} commits since last test-audit → run `/test-audit`" |
| consolidate | >40 commits since last run | Same pattern with `consolidate` baseline | "ℹ {N} commits since last consolidate → run `/consolidate`" |
| refactor-to-layers | Module exceeds ~30K lines | `find` source files per top-level directory, `wc -l` (directory detection is project-dependent — scan for directories containing source files) | "⚠ Module `{name}` at {N}K lines → consider `/refactor-to-layers`" |
| session-handoff | Conversation is long (>50 exchanges) or user mentions context pressure | Heuristic based on conversation length (context window usage cannot be directly queried) | "ℹ Long conversation — consider `/session-handoff` before next feature" |

### Detection of "Last Run"

Scan `git log --oneline` for commits whose messages contain the skill name as a substring. This matches both `feat(convention-enforcer):` parenthetical format and `convention-enforcer: ...` prefix format. Most recent such commit = baseline. No such commit = "never run" → always recommend on first trigger check.

### Presentation Format

```
✓ Feature "{name}" committed.

Recommendations:
  ⚠ 23 files changed since last convention-enforcer → run /convention-enforcer
  ℹ Long conversation — consider /session-handoff before next feature

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
- `ai-dev-tools/skills/orchestrate/SKILL.md` (~300-340 lines) — the orchestrator workflow, state detection, quality gate triggers, core loop steps

**No reference files needed** — orchestrate dispatches to other skills; it doesn't have its own analysis or generation logic.

**Modified files:**
- `ai-dev-tools/.claude-plugin/plugin.json` — add orchestrate to description

**Not modified:**
- No existing skills are changed — orchestrate invokes them as-is

---

## Error Handling

| Scenario | Behavior |
|---|---|
| No roadmap file found | Ask: "What feature would you like to work on?" Skip roadmap suggestion. |
| Spec exists but can't determine feature name | Ask: "Which feature is this spec for?" |
| Multiple specs without plans | Present list, ask user to pick |
| Invoked skill fails | Report the failure, offer: "Retry / Skip to next step / Exit" |
| Git history unavailable | Skip quality gate trigger checks, warn: "Can't check quality gate triggers without git history." |
| Long conversation / context pressure | Recommend `/session-handoff` before proceeding. Context exhaustion is handled by the resume mechanism — the next `/orchestrate` invocation detects state from artifacts regardless of session history. |
| User says "something else" | Exit orchestrate, let user do whatever they want. `/orchestrate` will re-detect state next time. |
| Stale artifacts (>30 days) | Ask: "Found stale spec from {date}. Continue or start fresh?" |
| Plan partially completed | Present progress: "{N}/{M} tasks done. Resume?" |
| No roadmap to update at Step 8 | Skip roadmap update, proceed to quality gate check. |
| tmp/review_code.md has stale data from different feature | Cross-check commit hashes in findings against current feature's commits. If mismatch, ignore and treat as "no review yet." |

---

## Relationship to Other Skills

Orchestrate is a **dispatcher** — it invokes these skills (one per `/orchestrate` invocation) but does not modify or extend them:

| Skill | When orchestrate invokes it | Invocation syntax |
|---|---|---|
| superpowers:brainstorming | Step 1 (new feature) | `superpowers:` plugin skill |
| /review-doc | Step 2 (spec review) | User-level `/` skill |
| /respond-to-review | Step 3 (fix spec review findings) | User-level `/` skill |
| superpowers:writing-plans | Step 4 (write plan) | `superpowers:` plugin skill |
| superpowers:subagent-driven-development | Step 5 (implement) | `superpowers:` plugin skill |
| /review-code | Step 6 (code review) | User-level `/` skill |
| /session-handoff | Error handling (context pressure) | ai-dev-tools plugin skill |

**Note on invocation syntax:** Skills from the `superpowers` plugin use `superpowers:` prefix. User-level skills at `~/.claude/skills/` use `/` prefix. ai-dev-tools plugin skills use `/ai-dev-tools:` prefix or `/` if installed. Orchestrate uses whichever syntax the skill requires.

Quality gates are **recommended, not invoked:**
- /convention-enforcer, /api-contract-guard, /test-audit, /consolidate
- /refactor-to-layers, /session-handoff
- /refactor-to-monorepo is invoked manually (no automatic trigger — user decides when codebase needs monorepo extraction)

---

## Design Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Skill type | Meta-skill (re-invocable state machine) | Sequences existing skills without nesting; one step per invocation |
| Core loop | 8 steps with review loops | Matches the developer's actual workflow |
| Quality gates | Advisory only (recommend, don't execute) | Keeps scope focused; user owns the decision |
| State detection | Artifact + git scanning, no state file | Artifacts are already the source of truth |
| Resume | Auto-detect on each invocation | User just says `/orchestrate` — no tracking needed |
| Feature suggestion | Roadmap-based with user override | Smart default, never forced |
| Trigger thresholds | Git counters (doubled for AI commit frequency) | Simple, reliable, appropriately sized for AI-driven development |
| User freedom | Always offer "something else" exit | Orchestrate is a helper, not a cage |
| Project agnostic | Detects implementation via git + plan checkboxes | Works on any project, not just ai-dev-tools skills |
| Spec loop exit | "Approved" or "Approved with suggestions" | Both have zero criticals; difference is advisory |
| Code review fix | Direct fix from review findings, not /respond-to-review | respond-to-review reads review_analysis.md, not review_code.md |
| Context handling | Resume mechanism handles exhaustion naturally | Next /orchestrate re-detects from artifacts regardless of session |
| tmp/ file staleness | Cross-check commit hashes against current feature | Avoids false attribution when switching features |
