# Help System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dynamic `/help` skill with pure static text and add `--help` guards to 11 skills for instant usage reference.

**Architecture:** Each SKILL.md gets a `<help-text>` block after the YAML frontmatter with a guard instruction. The help skill is a full rewrite — static text only.

**Tech Stack:** Markdown (SKILL.md files)

---

### Task 1: Add --help guard to orchestrate

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md`

- [ ] **Step 1: Insert help-text block after frontmatter**

After the closing `---` of the YAML frontmatter (line 4), insert the following block before the existing `# orchestrate` heading:

```markdown

<help-text>
orchestrate — Manage your full development cycle

USAGE
  /orchestrate

EXAMPLES
  /orchestrate                       Detect state and suggest next step
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

```

- [ ] **Step 2: Verify the file**

Run: `head -20 ai-dev-tools/skills/orchestrate/SKILL.md`
Expected: YAML frontmatter followed by the `<help-text>` block, then the guard instruction, then the original `# orchestrate` heading.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "feat(help): add --help guard to orchestrate"
```

---

### Task 2: Add --help guard to refactor-to-monorepo

**Files:**
- Modify: `ai-dev-tools/skills/refactor-to-monorepo/SKILL.md`

- [ ] **Step 1: Insert help-text block after frontmatter**

After the closing `---` of the YAML frontmatter, insert the following block before the existing heading:

```markdown

<help-text>
refactor-to-monorepo — Analyze monolith for monorepo extraction strategy

USAGE
  /refactor-to-monorepo

EXAMPLES
  /refactor-to-monorepo              Analyze and produce extraction plan
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

```

- [ ] **Step 2: Verify the file**

Run: `head -20 ai-dev-tools/skills/refactor-to-monorepo/SKILL.md`
Expected: YAML frontmatter followed by the `<help-text>` block, then the guard instruction, then the original heading.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/refactor-to-monorepo/SKILL.md
git commit -m "feat(help): add --help guard to refactor-to-monorepo"
```

---

### Task 3: Add --help guard to refactor-to-layers

**Files:**
- Modify: `ai-dev-tools/skills/refactor-to-layers/SKILL.md`

- [ ] **Step 1: Insert help-text block after frontmatter**

After the closing `---` of the YAML frontmatter, insert the following block before the existing heading:

```markdown

<help-text>
refactor-to-layers — Enforce layered architecture within modules

USAGE
  /refactor-to-layers

EXAMPLES
  /refactor-to-layers                Analyze or scaffold layer structure
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

```

- [ ] **Step 2: Verify the file**

Run: `head -20 ai-dev-tools/skills/refactor-to-layers/SKILL.md`
Expected: YAML frontmatter followed by the `<help-text>` block, then the guard instruction, then the original heading.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/refactor-to-layers/SKILL.md
git commit -m "feat(help): add --help guard to refactor-to-layers"
```

---

### Task 4: Add --help guard to implement-plan

**Files:**
- Modify: `ai-dev-tools/skills/implement-plan/SKILL.md`

- [ ] **Step 1: Insert help-text block after frontmatter**

After the closing `---` of the YAML frontmatter, insert the following block before the existing heading:

```markdown

<help-text>
implement-plan — Execute a restructuring plan

USAGE
  /implement-plan

EXAMPLES
  /implement-plan                    Auto-detect and execute latest plan
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

```

- [ ] **Step 2: Verify the file**

Run: `head -20 ai-dev-tools/skills/implement-plan/SKILL.md`
Expected: YAML frontmatter followed by the `<help-text>` block, then the guard instruction, then the original heading.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/implement-plan/SKILL.md
git commit -m "feat(help): add --help guard to implement-plan"
```

---

### Task 5: Add --help guard to convention-enforcer

**Files:**
- Modify: `ai-dev-tools/skills/convention-enforcer/SKILL.md`

- [ ] **Step 1: Insert help-text block after frontmatter**

After the closing `---` of the YAML frontmatter, insert the following block before the existing heading:

```markdown

<help-text>
convention-enforcer — Detect and enforce coding conventions

USAGE
  /convention-enforcer [flags]

PARAMETERS
  --re-analyze       Full run from scratch
  --skip-enforced    Skip already-enforced categories
  --start-fresh      Remove existing artifacts before re-analysis

EXAMPLES
  /convention-enforcer               Analyze conventions
  /convention-enforcer --re-analyze  Full re-analysis from scratch
  /convention-enforcer --start-fresh Clean slate analysis
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

```

- [ ] **Step 2: Verify the file**

Run: `head -25 ai-dev-tools/skills/convention-enforcer/SKILL.md`
Expected: YAML frontmatter followed by the `<help-text>` block with PARAMETERS section, then the guard instruction, then the original heading.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/convention-enforcer/SKILL.md
git commit -m "feat(help): add --help guard to convention-enforcer"
```

---

### Task 6: Add --help guard to api-contract-guard

**Files:**
- Modify: `ai-dev-tools/skills/api-contract-guard/SKILL.md`

- [ ] **Step 1: Insert help-text block after frontmatter**

After the closing `---` of the YAML frontmatter, insert the following block before the existing heading:

```markdown

<help-text>
api-contract-guard — Enforce module API boundaries via barrel files

USAGE
  /api-contract-guard

EXAMPLES
  /api-contract-guard                Analyze and enforce API contracts
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

```

- [ ] **Step 2: Verify the file**

Run: `head -20 ai-dev-tools/skills/api-contract-guard/SKILL.md`
Expected: YAML frontmatter followed by the `<help-text>` block, then the guard instruction, then the original heading.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/api-contract-guard/SKILL.md
git commit -m "feat(help): add --help guard to api-contract-guard"
```

---

### Task 7: Add --help guard to consolidate

**Files:**
- Modify: `ai-dev-tools/skills/consolidate/SKILL.md`

- [ ] **Step 1: Insert help-text block after frontmatter**

After the closing `---` of the YAML frontmatter, insert the following block before the existing heading:

```markdown

<help-text>
consolidate — Unify AI configs or linting rules across monorepo

USAGE
  /consolidate <subcommand>

PARAMETERS
  ai                 Consolidate AI configs only
  lint               Consolidate linting rules only
  all                Both AI configs and linting rules

EXAMPLES
  /consolidate ai                    Unify AI configs
  /consolidate lint                  Unify linting rules
  /consolidate all                   Unify everything
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

```

- [ ] **Step 2: Verify the file**

Run: `head -25 ai-dev-tools/skills/consolidate/SKILL.md`
Expected: YAML frontmatter followed by the `<help-text>` block with PARAMETERS section, then the guard instruction, then the original heading.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/consolidate/SKILL.md
git commit -m "feat(help): add --help guard to consolidate"
```

---

### Task 8: Add --help guard to document-for-ai

**Files:**
- Modify: `ai-dev-tools/skills/document-for-ai/SKILL.md`

- [ ] **Step 1: Insert help-text block after frontmatter**

After the closing `---` of the YAML frontmatter, insert the following block before the existing heading:

```markdown

<help-text>
document-for-ai — Generate AI-optimized documentation

USAGE
  /document-for-ai [command] [path]

PARAMETERS
  humanize [path]    Render AI docs for human readers
  adr <spec_path>    Extract architectural decisions from spec

EXAMPLES
  /document-for-ai                   Generate CLAUDE.md and AI_INDEX.md
  /document-for-ai humanize          Render docs for humans
  /document-for-ai adr docs/spec.md  Extract ADRs from spec
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

```

- [ ] **Step 2: Verify the file**

Run: `head -25 ai-dev-tools/skills/document-for-ai/SKILL.md`
Expected: YAML frontmatter followed by the `<help-text>` block with PARAMETERS section, then the guard instruction, then the original heading.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/document-for-ai/SKILL.md
git commit -m "feat(help): add --help guard to document-for-ai"
```

---

### Task 9: Add --help guard to changelog-from-commits

**Files:**
- Modify: `ai-dev-tools/skills/changelog-from-commits/SKILL.md`

- [ ] **Step 1: Insert help-text block after frontmatter**

After the closing `---` of the YAML frontmatter, insert the following block before the existing heading:

```markdown

<help-text>
changelog-from-commits — Generate release notes from git history

USAGE
  /changelog-from-commits [range] [options]

PARAMETERS
  range                Git range (e.g. v1.0..v2.0)
  --version <label>    Override version label
  --since <date>       Commits since date (YYYY-MM-DD)
  --last <N>           Last N commits

EXAMPLES
  /changelog-from-commits                     Auto-detect from tags
  /changelog-from-commits v1.0.0..v2.0.0      Specific range
  /changelog-from-commits --last 20           Last 20 commits
  /changelog-from-commits --since 2026-01-01  Since date
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

```

- [ ] **Step 2: Verify the file**

Run: `head -25 ai-dev-tools/skills/changelog-from-commits/SKILL.md`
Expected: YAML frontmatter followed by the `<help-text>` block with PARAMETERS section, then the guard instruction, then the original heading.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/changelog-from-commits/SKILL.md
git commit -m "feat(help): add --help guard to changelog-from-commits"
```

---

### Task 10: Add --help guard to session-handoff

**Files:**
- Modify: `ai-dev-tools/skills/session-handoff/SKILL.md`

- [ ] **Step 1: Insert help-text block after frontmatter**

After the closing `---` of the YAML frontmatter, insert the following block before the existing heading:

```markdown

<help-text>
session-handoff — Create handoff document for next session

USAGE
  /session-handoff

EXAMPLES
  /session-handoff                   Generate handoff from current session
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

```

- [ ] **Step 2: Verify the file**

Run: `head -20 ai-dev-tools/skills/session-handoff/SKILL.md`
Expected: YAML frontmatter followed by the `<help-text>` block, then the guard instruction, then the original heading.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/session-handoff/SKILL.md
git commit -m "feat(help): add --help guard to session-handoff"
```

---

### Task 11: Add --help guard to test-audit

**Files:**
- Modify: `ai-dev-tools/skills/test-audit/SKILL.md`

- [ ] **Step 1: Insert help-text block after frontmatter**

After the closing `---` of the YAML frontmatter, insert the following block before the existing heading:

```markdown

<help-text>
test-audit — Audit test quality and coverage gaps

USAGE
  /test-audit [path] [flags]

PARAMETERS
  path               Scope audit to a directory
  --changed           Audit only git-changed files
  --base <branch>    Merge base for --changed

EXAMPLES
  /test-audit                        Full codebase audit
  /test-audit src/services/          Path-scoped audit
  /test-audit --changed              Changed files only
  /test-audit --changed --base main  Explicit merge base
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

```

- [ ] **Step 2: Verify the file**

Run: `head -25 ai-dev-tools/skills/test-audit/SKILL.md`
Expected: YAML frontmatter followed by the `<help-text>` block with PARAMETERS section, then the guard instruction, then the original heading.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/test-audit/SKILL.md
git commit -m "feat(help): add --help guard to test-audit"
```

---

### Task 12: Replace help skill with static text

**Files:**
- Modify: `ai-dev-tools/skills/help/SKILL.md`

- [ ] **Step 1: Replace the entire SKILL.md content**

Replace the full contents of `ai-dev-tools/skills/help/SKILL.md` with the content below. The file has two parts: (1) YAML frontmatter, (2) an instruction line, (3) the static help text wrapped in `<help-output>` tags.

````markdown
---
name: help
description: Show available commands and usage for the ai-dev-tools plugin
---

Output the following text exactly, then stop:

<help-output>
ai-dev-tools — AI-native development automation

MAIN COMMAND
  /orchestrate              Manages your full development cycle automatically.
                            Detects where you are and suggests the next step.

  Orchestrate flow:
    brainstorm → review-doc → implement → review-code → complete
    ─────────   ──────────   ─────────   ───────────   ────────
    Design &    Validate     Execute     Audit code    Update
    spec the    the spec     the plan    for bugs &    roadmap &
    feature                              drift         quality gates

COMMANDS (ORCHESTRATE FLOW)
  /orchestrate              Development cycle manager (start here)
  /review-doc <path>        Review specs and design documents
  /document-for-ai          Generate AI-optimized docs (auto-invoked by orchestrate)
  /review-code <N> <spec>   Review last N commits against a spec

COMMANDS (INDEPENDENT QUALITY CHECKS)
  /changelog-from-commits   Generate release notes from git history
  /session-handoff          Create handoff document for next session
  /test-audit               Audit test quality and coverage gaps
  /convention-enforcer      Detect and enforce coding conventions
  /api-contract-guard       Enforce module API boundaries via barrel files
  /consolidate <ai|lint>    Unify AI configs or linting rules across monorepo
  /refactor-to-monorepo     Analyze monolith for monorepo extraction
  /refactor-to-layers       Enforce layered architecture within modules
  /implement-plan           Execute a restructuring plan

  Run any command with --help for usage details.

TIPS
  Start with /orchestrate — it handles the workflow for you.
  Re-invoke /orchestrate after each step completes to continue.
</help-output>
````

- [ ] **Step 2: Verify the file**

Run: `cat ai-dev-tools/skills/help/SKILL.md`
Expected: YAML frontmatter with `name: help`, followed by the instruction line, followed by the static help text.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/help/SKILL.md
git commit -m "feat(help): replace help skill with static text"
```
