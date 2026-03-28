# orchestrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `orchestrate` meta-skill — a re-invocable state machine that manages the developer's core loop (brainstorm → review → plan → implement → code review → commit) and advises on quality gates.

**Architecture:** Single SKILL.md file (~300-340 lines) that detects cycle state from artifacts + git, presents the next step with context, and invokes the appropriate skill on user confirmation. One step per `/orchestrate` invocation — the user re-invokes after each skill completes. Quality gate recommendations surface after cycle completion.

**Tech Stack:** Markdown skill file. No runtime code, no reference files.

**Spec:** `docs/superpowers/specs/2026-03-28-orchestrate-design.md`

---

## File Structure

```
ai-dev-tools/
├── .claude-plugin/
│   └── plugin.json                    # Modify: add orchestrate to description
└── skills/
    └── orchestrate/
        └── SKILL.md                   # Create: state machine orchestrator (~300-340 lines)
```

---

### Task 1: Create SKILL.md

**Files:**
- Create: `ai-dev-tools/skills/orchestrate/SKILL.md`

This is the entire skill — one file, no reference files. Read the spec thoroughly before writing.

- [ ] **Step 1: Create directory**

```bash
mkdir -p ai-dev-tools/skills/orchestrate
```

- [ ] **Step 2: Write SKILL.md**

Read the full spec at `docs/superpowers/specs/2026-03-28-orchestrate-design.md`. Also read an existing skill SKILL.md for structural reference (e.g., `ai-dev-tools/skills/convention-enforcer/SKILL.md`).

Create `ai-dev-tools/skills/orchestrate/SKILL.md` with these sections (all content from the spec):

**1. Frontmatter** (~5 lines)
```yaml
---
name: orchestrate
description: "Use when the user wants to start a development cycle, continue where they left off, check what's next, automate their brainstorm-review-implement-review-commit workflow, or get recommendations for quality gates — even if they don't use the exact skill name."
---
```

**2. Summary + Execution Model** (~15 lines)
- Meta-skill: re-invocable state machine, one step per invocation
- Detects state from artifacts + git, presents next step, invokes on confirmation
- User re-invokes `/orchestrate` after each skill completes
- Core loop: brainstorm → spec review → respond → plan → implement → code review → fix → complete

**3. On Each Invocation** (~15 lines)
- Detect current state
- Present status + next step with context
- User confirms/overrides/exits
- After skill completes, user re-invokes
- After cycle complete, check quality gates, present recommendations + "What's next?"

**4. Core Loop Steps** (~100 lines) — 8 steps from the spec:

Step 1 BRAINSTORM:
- Trigger: no spec for current feature
- Check roadmap (if exists) for next item, or ask user
- Invoke superpowers:brainstorming

Step 2 SPEC REVIEW:
- Trigger: spec exists, **Status:** doesn't contain "Approved" (check bold format on line 4)
- Invoke /review-doc {spec_path}

Step 3 RESPOND TO REVIEW:
- Trigger: review_analysis.md exists AND Reviewed: matches current spec AND Critical > 0
- If zero criticals but Important > 0: present as informational with proceed option
- Invoke /respond-to-review {round_number} {spec_path} (round = count ## Round N sections + 1)
- Loop Steps 2-3 until Approved/Approved with suggestions
- After approval: update spec **Status:** header to "Approved (R{N} revisions applied)"

Step 4 WRITE PLAN:
- Trigger: spec Approved, no matching plan
- Invoke superpowers:writing-plans

Step 5 IMPLEMENT:
- Trigger: plan exists, not all [x]
- Invoke superpowers:subagent-driven-development
- Assumes checkboxes updated in-place
- If all [x], state detection routes to Step 6 directly

Step 6 CODE REVIEW:
- Trigger: implementation commits after plan commit hash
- Find plan commit: git log --format=%H -1 -- {plan_path}
- Count: total commits plan_hash..HEAD (not feature-scoped — review-code uses "last N from HEAD")
- Invoke /review-code {N} {spec_path}

Step 7 FIX REVIEW FINDINGS:
- Trigger: review_code.md with Critical/High > 0 AND commit hashes match feature
- Apply fixes from suggested-fix, re-run /review-code with updated count
- Loop until 0 Critical + 0 High
- Re-reviews examine current code — fixed issues won't reproduce

Step 8 COMPLETE:
- Trigger: review clean or user accepts remaining
- Update roadmap (if exists) — mark feature Done
- Check quality gates
- Present recommendations + "What's next?"
- No new commit — implementation committed in Step 5

**5. State Detection** (~60 lines)
- State detection table (11 rows from spec — feature, spec, spec review lifecycle, plan, implementation, code review lifecycle)
- Feature detection algorithm: find all incomplete specs, check completion via (a) checkboxes, (b) roadmap Done, (c) unchecked + commits + clean review
- Matching logic: extract feature name from filenames
- Known limitation: substring collisions documented
- Implementation detection: git log --format=%H, then count with --grep
- Cross-checking tmp/ files: review_code.md commit hashes, review_analysis.md Reviewed: field
- Ambiguity handling: multiple features, no artifacts, stale artifacts

**6. Quality Gate Triggers** (~50 lines)
- 6 gates table: convention-enforcer (>20 files), api-contract-guard (new dir OR >15 files), test-audit (>10 commits), consolidate (>40 commits), refactor-to-layers (~30K lines), session-handoff (long conversation)
- Detection of "last run" via git log substring matching
- Presentation format with ⚠/ℹ, max 3, priority order
- "What's next?" with 3 options (next feature, recommendation, something else)

**7. Error Handling** (~25 lines)
- 11 rows from spec: no roadmap, can't determine feature, multiple specs, skill fails, no git, context pressure, something else, stale, partial plan, no roadmap at Step 8, stale review_code.md

**8. Relationship to Other Skills** (~20 lines)
- Dispatched skills table (7 skills with invocation syntax column)
- Quality gates: recommended not invoked (6 + refactor-to-monorepo manual only)

- [ ] **Step 3: Verify line count and structure**

```bash
wc -l ai-dev-tools/skills/orchestrate/SKILL.md
head -4 ai-dev-tools/skills/orchestrate/SKILL.md
grep "^## \|^### " ai-dev-tools/skills/orchestrate/SKILL.md
```

Expected: ~300-340 lines, frontmatter with `name: orchestrate`, section headings for all 8 areas.

- [ ] **Step 4: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "feat(orchestrate): add meta-skill for development cycle orchestration

Re-invocable state machine: detect cycle state from artifacts + git,
present next step, invoke on confirmation. 8-step core loop with
review loops. Quality gate recommendations via git counters.
Project-agnostic, resume-aware, one step per invocation."
```

---

### Task 2: Update plugin.json

**Files:**
- Modify: `ai-dev-tools/.claude-plugin/plugin.json`

- [ ] **Step 1: Update description**

Add "development cycle orchestration" to the description:

```json
{
  "name": "ai-dev-tools",
  "version": "1.0.0",
  "description": "AI-optimized documentation generation, monorepo refactoring strategy, architectural layer enforcement, plan execution, convention enforcement, API contract enforcement, and development cycle orchestration",
  "author": {
    "name": "ai-dev-tools"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add ai-dev-tools/.claude-plugin/plugin.json
git commit -m "chore: update plugin.json for orchestrate skill"
```

---

### Task 3: Final verification

- [ ] **Step 1: Verify skill directory**

```bash
find ai-dev-tools/skills/orchestrate -type f
```

Expected: `ai-dev-tools/skills/orchestrate/SKILL.md`

- [ ] **Step 2: Verify frontmatter**

```bash
head -4 ai-dev-tools/skills/orchestrate/SKILL.md
```

Expected: `name: orchestrate` in YAML frontmatter.

- [ ] **Step 3: Verify all 8 core loop steps**

```bash
grep -c "### Step" ai-dev-tools/skills/orchestrate/SKILL.md
```

Expected: 8 (Steps 1-8).

- [ ] **Step 4: Verify quality gate triggers**

```bash
grep "convention-enforcer\|api-contract-guard\|test-audit\|consolidate\|refactor-to-layers\|session-handoff" ai-dev-tools/skills/orchestrate/SKILL.md | wc -l
```

Expected: 10+ occurrences across triggers table and relationship section.

- [ ] **Step 5: Verify plugin.json**

```bash
grep "orchestrat" ai-dev-tools/.claude-plugin/plugin.json
```

Expected: "development cycle orchestration" in description.
