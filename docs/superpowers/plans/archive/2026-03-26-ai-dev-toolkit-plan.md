# AI Dev Toolkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `ai-dev-toolkit` Claude Code plugin with two skills: `document-for-ai` and `refactor-to-monorepo`.

**Architecture:** A Claude Code plugin using `.claude-plugin/plugin.json` for manifest and `skills/` directory for auto-discovery. Each skill has a `SKILL.md` (~250-300 lines) for workflow orchestration and a `references/` directory for progressive disclosure of detailed specs. Skills are independent and can ship separately.

**Tech Stack:** Claude Code plugin system (Markdown-based SKILL.md files, YAML frontmatter, no compiled code)

**Spec:** `docs/superpowers/specs/2026-03-25-ai-dev-toolkit-design.md`

---

## File Map

### Plugin Root
| File | Responsibility | Action |
|------|---------------|--------|
| `ai-dev-toolkit/.claude-plugin/plugin.json` | Plugin manifest | Create |

### Phase 1: document-for-ai (Skill 1)
| File | Responsibility | Target Lines | Action |
|------|---------------|-------------|--------|
| `ai-dev-toolkit/skills/document-for-ai/SKILL.md` | Workflow orchestration: mode detection, invocation flow, progressive disclosure | ~250-300 | Create |
| `ai-dev-toolkit/skills/document-for-ai/references/tech-stacks.md` | Per-stack file patterns, entry points, conventions, monorepo detection heuristics | ~80-100 | Create |
| `ai-dev-toolkit/skills/document-for-ai/references/doc-templates.md` | 5 purpose templates + category mapping table | ~100-120 | Create |
| `ai-dev-toolkit/skills/document-for-ai/references/frontmatter-schema.md` | Frontmatter field definitions, validation, examples | ~40-60 | Create |
| `ai-dev-toolkit/skills/document-for-ai/references/audit-checklist.md` | Scoring methodology, scales, thresholds, priority formula | ~60-80 | Create |

### Phase 2: refactor-to-monorepo (Skill 2)
| File | Responsibility | Target Lines | Action |
|------|---------------|-------------|--------|
| `ai-dev-toolkit/skills/refactor-to-monorepo/SKILL.md` | Workflow orchestration: analysis pipeline, user checkpoints, artifact generation | ~250-300 | Create |
| `ai-dev-toolkit/skills/refactor-to-monorepo/references/tech-stacks.md` | Per-stack monorepo tooling, config scaffolding, detection heuristics | ~100-120 | Create |
| `ai-dev-toolkit/skills/refactor-to-monorepo/references/analysis-framework.md` | Domain/data/dependency methodology, coupling score formula, conflict taxonomy | ~120-150 | Create |
| `ai-dev-toolkit/skills/refactor-to-monorepo/references/module-spec-template.md` | Per-module spec sheet template with field descriptions | ~40-60 | Create |
| `ai-dev-toolkit/skills/refactor-to-monorepo/references/migration-patterns.md` | Contested table patterns, circular dep patterns, pitfalls, rollback | ~80-100 | Create |

**Total: 11 files**

---

## Phase 1: `document-for-ai` Skill

### Task 1: Plugin Scaffold + plugin.json

**Files:**
- Create: `ai-dev-toolkit/.claude-plugin/plugin.json`
- Create: `ai-dev-toolkit/skills/document-for-ai/references/` (directory)
- Create: `ai-dev-toolkit/skills/refactor-to-monorepo/references/` (directory)

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p ai-dev-toolkit/.claude-plugin
mkdir -p ai-dev-toolkit/skills/document-for-ai/references
mkdir -p ai-dev-toolkit/skills/refactor-to-monorepo/references
```

- [ ] **Step 2: Create plugin.json**

Write `ai-dev-toolkit/.claude-plugin/plugin.json`:

```json
{
  "name": "ai-dev-toolkit",
  "version": "1.0.0",
  "description": "AI-optimized documentation generation and monorepo refactoring strategy",
  "author": {
    "name": "ai-dev-toolkit"
  }
}
```

- [ ] **Step 3: Verify plugin structure**

```bash
find ai-dev-toolkit -type f -o -type d | sort
```

Expected output should show `.claude-plugin/plugin.json` and both `skills/` subdirectories.

- [ ] **Step 4: Commit**

```bash
git add ai-dev-toolkit/
git commit -m "feat: scaffold ai-dev-toolkit plugin structure"
```

---

### Task 2: frontmatter-schema.md Reference

**Files:**
- Create: `ai-dev-toolkit/skills/document-for-ai/references/frontmatter-schema.md`

**Why first:** The frontmatter schema is referenced by SKILL.md's mode detection logic and all other reference files. It's the smallest file and defines the foundation.

- [ ] **Step 1: Write frontmatter-schema.md**

Extract from spec Section 3.4. Content must include:
- The YAML frontmatter example block
- All 6 field definitions with types (required/optional), descriptions, and constraints
- The detection signal rule: `scope` + `purpose` = AI-optimized
- `code_paths` semantics: literal paths, directories with trailing `/` match recursively, no globs

Target: ~40-60 lines.

- [ ] **Step 2: Verify line count and required content**

```bash
wc -l ai-dev-toolkit/skills/document-for-ai/references/frontmatter-schema.md
grep -c "scope\|purpose\|ai_keywords\|dependencies\|last_verified\|code_paths" ai-dev-toolkit/skills/document-for-ai/references/frontmatter-schema.md
```

Expected: 40-60 lines, 6 field names found.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-toolkit/skills/document-for-ai/references/frontmatter-schema.md
git commit -m "feat(document-for-ai): add frontmatter schema reference"
```

---

### Task 3: doc-templates.md Reference

**Files:**
- Create: `ai-dev-toolkit/skills/document-for-ai/references/doc-templates.md`

- [ ] **Step 1: Write doc-templates.md**

Extract from spec Sections 3.5 + 3.6. Content must include:
- All 5 purpose-specific templates (`architecture`, `api`, `data-model`, `guide`, `troubleshooting`) with their section structures and per-section descriptions
- The example category mapping table (16 rows) labeled as "Example mapping"
- The fallback rule for unrecognized folders: analyze file content, classify by topic

Organize with `## Template: architecture`, `## Template: api`, etc. headers for progressive disclosure.

Target: ~100-120 lines.

- [ ] **Step 2: Verify all 5 templates present**

```bash
grep -c "^## Template:" ai-dev-toolkit/skills/document-for-ai/references/doc-templates.md
wc -l ai-dev-toolkit/skills/document-for-ai/references/doc-templates.md
```

Expected: 5 template headers, 100-120 lines.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-toolkit/skills/document-for-ai/references/doc-templates.md
git commit -m "feat(document-for-ai): add doc templates reference with 5 purpose templates"
```

---

### Task 4: audit-checklist.md Reference

**Files:**
- Create: `ai-dev-toolkit/skills/document-for-ai/references/audit-checklist.md`

- [ ] **Step 1: Write audit-checklist.md**

Extract from spec Section 3.11. Content must include:
- The 3-dimension scoring table (accuracy, completeness, format compliance) with all 5 score levels
- Priority score formula: `(5 - accuracy) x 3 + (5 - completeness) x 2 + (5 - format) x 1`
- Priority thresholds: 0-6 Healthy, 7-12 Needs attention, 13+ Urgent
- Overall quality score formula: average across dimensions as % of 15, passes at >= 80%
- Division-by-zero note: if no docs exist, quality score is 0%

Target: ~60-80 lines.

- [ ] **Step 2: Verify scoring formula present**

```bash
grep "Priority score" ai-dev-toolkit/skills/document-for-ai/references/audit-checklist.md
grep "80%" ai-dev-toolkit/skills/document-for-ai/references/audit-checklist.md
wc -l ai-dev-toolkit/skills/document-for-ai/references/audit-checklist.md
```

Expected: formula found, 80% threshold found, 60-80 lines.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-toolkit/skills/document-for-ai/references/audit-checklist.md
git commit -m "feat(document-for-ai): add audit checklist with scoring methodology"
```

---

### Task 5: tech-stacks.md Reference (document-for-ai)

**Files:**
- Create: `ai-dev-toolkit/skills/document-for-ai/references/tech-stacks.md`

- [ ] **Step 1: Write tech-stacks.md**

Extract from spec Section 6.1 (document-for-ai table) + Section 4.5 (monorepo detection heuristics). Content must include:

For each preset stack (Node.js+React, Node.js+Vue, .NET+React, .NET+Vue, Python+React), organized with `## Stack: Node.js + React` headers:
- Entry point patterns
- Route/page patterns
- Data model patterns
- Config files
- Dependency manifest
- Conventions
- Monorepo detection files (from Section 4.5)
- Tech stack validation file (what to check exists: `package.json`, `.csproj`, `pyproject.toml`)

Node.js+React and Node.js+Vue share most patterns (differ in frontend conventions). Same for .NET+React vs .NET+Vue.

Target: ~80-100 lines.

- [ ] **Step 2: Verify all stacks present + monorepo detection included**

```bash
grep -c "^## Stack:" ai-dev-toolkit/skills/document-for-ai/references/tech-stacks.md
grep "pnpm-workspace\|turbo.json\|\.sln\|pyproject.toml" ai-dev-toolkit/skills/document-for-ai/references/tech-stacks.md
wc -l ai-dev-toolkit/skills/document-for-ai/references/tech-stacks.md
```

Expected: 5 stack headers (or 3 if Node.js/React+Vue combined), monorepo detection files present, 80-100 lines.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-toolkit/skills/document-for-ai/references/tech-stacks.md
git commit -m "feat(document-for-ai): add tech-stacks reference with monorepo detection"
```

---

### Task 6: document-for-ai SKILL.md

**Files:**
- Create: `ai-dev-toolkit/skills/document-for-ai/SKILL.md`

This is the main skill file. It orchestrates the entire workflow. Write it last in Phase 1 because it references all 4 reference files.

- [ ] **Step 1: Write SKILL.md frontmatter + overview**

```yaml
---
name: document-for-ai
description: "Use when the user wants to create, migrate, audit, or maintain AI-optimized documentation, restructure existing docs for AI consumption, generate CLAUDE.md files, create doc indexes, or improve AI agent efficiency through better documentation — even if they don't use the exact skill name."
---
```

Followed by a concise overview section (what this skill does, when to use it).

- [ ] **Step 2: Write tech stack selection + validation flow**

Include:
- The 6-option preset list
- Validation step: scan for expected config files, warn on mismatch
- "Other" follow-up: 3 questions (backend framework, frontend framework, package manager)

- [ ] **Step 3: Write scope detection step (Step 1.5)**

Include:
- Monorepo detection: "Read `references/tech-stacks.md` monorepo detection section"
- Package traversal: walk up from CWD for package manifest
- Root vs. package: ask user if at root

- [ ] **Step 4: Write mode detection logic**

Include:
- The decision table (GENERATE / MIGRATE / ask for AUDIT or UPDATE)
- AI-optimized detection signal: `scope` + `purpose` frontmatter
- Sampling strategy: check up to 20 .md files
- Explicit commands: `/document-for-ai humanize [path]`

- [ ] **Step 5: Write mode behavior sections**

Concise steps for each mode (GENERATE, MIGRATE, AUDIT, UPDATE, HUMANIZE). Reference the detailed templates and schemas in reference files rather than inlining them:
- "Read `references/doc-templates.md` for template structures"
- "Read `references/frontmatter-schema.md` for field definitions"
- "Read `references/audit-checklist.md` for scoring methodology"

Include the GENERATE doc-type heuristics (always generate `architecture`, conditionally generate others).

- [ ] **Step 6: Write progressive disclosure instructions**

The explicit section telling the AI when to load which reference file:
- After tech stack selection → `references/tech-stacks.md`
- Before generating/migrating → `references/doc-templates.md` + `references/frontmatter-schema.md`
- During audit → `references/audit-checklist.md`
- If "Other" stack → skip `tech-stacks.md`, use follow-up answers

- [ ] **Step 7: Write error handling section**

Concise table covering: no git history, unclassifiable docs, non-Markdown docs, large codebase, small codebase, unmatched module, conflicting info, partial failure, pre-existing CLAUDE.md.

- [ ] **Step 8: Write CLAUDE.md and AI_INDEX.md generation sections**

Include:
- Root CLAUDE.md template (monorepo + single repo)
- Per-module CLAUDE.md template (monorepo only)
- AI_INDEX.md format (monorepo + single repo)
- Existing CLAUDE.md merge behavior: preserve existing, append generated sections
- CLAUDE.md/AI_INDEX.md relationship note

- [ ] **Step 9: Verify SKILL.md structure and line count**

```bash
wc -l ai-dev-toolkit/skills/document-for-ai/SKILL.md
head -5 ai-dev-toolkit/skills/document-for-ai/SKILL.md
grep -c "^## \|^### " ai-dev-toolkit/skills/document-for-ai/SKILL.md
```

Expected: 250-300 lines (max 500), correct frontmatter at top, 8+ section headers.

- [ ] **Step 10: Commit**

```bash
git add ai-dev-toolkit/skills/document-for-ai/SKILL.md
git commit -m "feat(document-for-ai): add main SKILL.md with workflow orchestration"
```

---

### Task 7: Phase 1 Integration Verification

**Files:** All Phase 1 files

- [ ] **Step 1: Verify complete file tree**

```bash
find ai-dev-toolkit/skills/document-for-ai -type f | sort
```

Expected:
```
ai-dev-toolkit/skills/document-for-ai/SKILL.md
ai-dev-toolkit/skills/document-for-ai/references/audit-checklist.md
ai-dev-toolkit/skills/document-for-ai/references/doc-templates.md
ai-dev-toolkit/skills/document-for-ai/references/frontmatter-schema.md
ai-dev-toolkit/skills/document-for-ai/references/tech-stacks.md
```

- [ ] **Step 2: Verify all cross-references resolve**

Check that every `references/` path mentioned in SKILL.md exists as an actual file:

```bash
grep "references/" ai-dev-toolkit/skills/document-for-ai/SKILL.md | grep -oP 'references/[a-z-]+\.md' | sort -u | while read ref; do
  if [ -f "ai-dev-toolkit/skills/document-for-ai/$ref" ]; then
    echo "OK: $ref"
  else
    echo "MISSING: $ref"
  fi
done
```

Expected: All OK, no MISSING.

- [ ] **Step 3: Verify SKILL.md frontmatter is valid**

```bash
head -4 ai-dev-toolkit/skills/document-for-ai/SKILL.md
```

Expected: Lines 1-3 should be `---`, `name: document-for-ai`, `description: "Use when..."`, `---`.

- [ ] **Step 4: Verify total line counts within targets**

```bash
echo "=== Line counts ===" && wc -l ai-dev-toolkit/skills/document-for-ai/SKILL.md ai-dev-toolkit/skills/document-for-ai/references/*.md
```

Expected:
- SKILL.md: 250-300 (max 500)
- tech-stacks.md: 80-100
- doc-templates.md: 100-120
- frontmatter-schema.md: 40-60
- audit-checklist.md: 60-80

- [ ] **Step 5: Commit phase 1 complete tag**

```bash
git add -A ai-dev-toolkit/
git commit -m "feat(document-for-ai): phase 1 complete - all skill files created"
```

---

## Phase 2: `refactor-to-monorepo` Skill

### Task 8: module-spec-template.md Reference

**Files:**
- Create: `ai-dev-toolkit/skills/refactor-to-monorepo/references/module-spec-template.md`

**Why first:** Smallest file, defines the per-module output format used by SKILL.md and other references.

- [ ] **Step 1: Write module-spec-template.md**

Extract from spec Section 4.3 artifact 4. Content must include:
- The 8-field template (Responsibility, Owned Files, Owned Database Tables, Shared Table Access, Exported Interface, Dependencies, Extraction Steps, Estimated Complexity)
- Per-field description explaining what to include
- Extraction Steps granularity guidance: list file paths to move, cross-module imports that break, config files to modify, verification command
- Estimated Complexity scale: simple / moderate / complex with criteria for each

Target: ~40-60 lines.

- [ ] **Step 2: Verify all 8 fields present**

```bash
grep -c "^## " ai-dev-toolkit/skills/refactor-to-monorepo/references/module-spec-template.md
wc -l ai-dev-toolkit/skills/refactor-to-monorepo/references/module-spec-template.md
```

Expected: 8 section headers, 40-60 lines.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-toolkit/skills/refactor-to-monorepo/references/module-spec-template.md
git commit -m "feat(refactor-to-monorepo): add module spec template reference"
```

---

### Task 9: migration-patterns.md Reference

**Files:**
- Create: `ai-dev-toolkit/skills/refactor-to-monorepo/references/migration-patterns.md`

- [ ] **Step 1: Write migration-patterns.md**

Extract from spec Section 4.7. Content must include:
- Contested table patterns table (4 patterns: single owner + API, split with sync, shared with column ownership, promote to shared service) with When to Use and Example columns
- Circular dependency patterns table (3 patterns) with Resolution column
- Default recommendation: prefer single owner + API contract
- Common pitfalls section (at least 3: big-bang migration, shared state without contracts, breaking CI during extraction)
- Rollback strategy: each extraction phase should be reversible independently

Target: ~80-100 lines.

- [ ] **Step 2: Verify pattern tables present**

```bash
grep -c "Single owner\|Split table\|Shared table\|Promote to shared" ai-dev-toolkit/skills/refactor-to-monorepo/references/migration-patterns.md
wc -l ai-dev-toolkit/skills/refactor-to-monorepo/references/migration-patterns.md
```

Expected: 4 contested table patterns, 80-100 lines.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-toolkit/skills/refactor-to-monorepo/references/migration-patterns.md
git commit -m "feat(refactor-to-monorepo): add migration patterns reference"
```

---

### Task 10: analysis-framework.md Reference

**Files:**
- Create: `ai-dev-toolkit/skills/refactor-to-monorepo/references/analysis-framework.md`

- [ ] **Step 1: Write analysis-framework.md**

Extract from spec Sections 4.2, 4.6, 4.7 (conflict taxonomy). Content must include:

**Domain Analysis (Phase 1):**
- What to scan (routes, folder structure, naming patterns)
- Output: domain list + draft file-to-domain mapping
- User checkpoint definition

**Data Ownership Analysis (Phase 2):**
- Table ownership matrix methodology
- Contested/orphaned table flagging rules

**Dependency Graph Analysis (Phase 3):**
- Per-stack static analysis approach (Node.js: import/require, .NET: ProjectReference primary + using secondary, Python: import/from)
- Counting rule: one import statement = one import, regardless of symbols

**Coupling Score:**
- Formula: `total_cross_module_imports / (internal_imports + total_cross_module_imports) * 100`
- Thresholds: 0-20% green, 21-50% yellow, 51%+ red
- Edge case: zero imports = 0%
- Shared/ exclusion rule
- Per-pair breakdown for dependency matrix

**Synthesis (Phase 4):**
- Overlay methodology: agree = high confidence, disagree = flag
- Conflict taxonomy: reference `migration-patterns.md` for resolution patterns

Target: ~120-150 lines.

- [ ] **Step 2: Verify all 4 phases + coupling formula present**

```bash
grep -c "Phase [1-4]\|coupling_score" ai-dev-toolkit/skills/refactor-to-monorepo/references/analysis-framework.md
wc -l ai-dev-toolkit/skills/refactor-to-monorepo/references/analysis-framework.md
```

Expected: 4 phase references + coupling formula, 120-150 lines.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-toolkit/skills/refactor-to-monorepo/references/analysis-framework.md
git commit -m "feat(refactor-to-monorepo): add analysis framework with coupling score formula"
```

---

### Task 11: tech-stacks.md Reference (refactor-to-monorepo)

**Files:**
- Create: `ai-dev-toolkit/skills/refactor-to-monorepo/references/tech-stacks.md`

- [ ] **Step 1: Write tech-stacks.md**

Extract from spec Sections 4.3 (tooling table), 4.5 (detection heuristics), 6.1 (refactor-to-monorepo schema). Per stack, with `## Stack: Node.js + React` headers:
- Import analysis approach
- Recommended monorepo tool + why
- Config scaffolding files to generate
- Workspace detection files (monorepo heuristics from Section 4.5)
- Stack-specific migration patterns/notes

Include the full monorepo detection heuristics table (all stacks including Go, Rust, General).

Include the "Other" stack handling: 5 follow-up questions.

Target: ~100-120 lines.

- [ ] **Step 2: Verify all stacks + detection heuristics present**

```bash
grep -c "^## Stack:" ai-dev-toolkit/skills/refactor-to-monorepo/references/tech-stacks.md
grep "pnpm-workspace\|\.sln\|go\.work\|Cargo.toml\|\.moon/workspace" ai-dev-toolkit/skills/refactor-to-monorepo/references/tech-stacks.md
wc -l ai-dev-toolkit/skills/refactor-to-monorepo/references/tech-stacks.md
```

Expected: 5+ stack headers, all detection files present, 100-120 lines.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-toolkit/skills/refactor-to-monorepo/references/tech-stacks.md
git commit -m "feat(refactor-to-monorepo): add tech-stacks reference with monorepo detection"
```

---

### Task 12: refactor-to-monorepo SKILL.md

**Files:**
- Create: `ai-dev-toolkit/skills/refactor-to-monorepo/SKILL.md`

- [ ] **Step 1: Write SKILL.md frontmatter + overview**

```yaml
---
name: refactor-to-monorepo
description: "Use when the user wants to split a monolith into modules, identify module boundaries, analyze code coupling, plan a monorepo migration, evaluate monorepo tooling, or reduce codebase size for better AI agent efficiency — even if they don't explicitly say monorepo."
---
```

Followed by overview section.

- [ ] **Step 2: Write tech stack selection + "Other" handling**

Include:
- Same 6-option preset list
- Validation step
- "Other" follow-up: 5 questions (backend, frontend, build system, dependency management, existing workspace structure)
- Note explaining why 5 questions vs. 3 for document-for-ai

- [ ] **Step 3: Write analysis pipeline section**

Concise description of 4 phases with user checkpoints. Reference `references/analysis-framework.md` for detailed methodology:
- Phase 1: Domain Analysis → user checkpoint
- Phase 2: Data Ownership → present findings
- Phase 3: Dependency Graph → present findings
- Phase 4: Synthesis → user checkpoint before artifact generation

Include: "Read `references/analysis-framework.md` for detailed methodology, coupling score formula, and conflict taxonomy"

- [ ] **Step 4: Write output artifacts section**

List all 6 artifacts with brief description. Reference `references/module-spec-template.md` for per-module spec format:
1. `strategy.md` — section outline
2. `module-map.md` — mermaid + color coding
3. `dependency-matrix.md` — coupling scores
4. `modules/<name>.md` — "Read `references/module-spec-template.md`"
5. `monorepo-tooling.md` — "Read `references/tech-stacks.md` for recommendations"
6. `migration-plan.md` — phased approach

- [ ] **Step 5: Write progressive disclosure instructions**

- After tech stack selection → `references/tech-stacks.md`
- During Phases 1-3 → `references/analysis-framework.md`
- During Phase 4 + artifacts → `references/module-spec-template.md` + `references/migration-patterns.md`
- If "Other" stack → skip `tech-stacks.md`

- [ ] **Step 6: Write error handling section**

Concise table: dynamic imports, ORM with dynamic queries, no clear domains, large codebase, no database, partial failure.

- [ ] **Step 7: Verify SKILL.md structure and line count**

```bash
wc -l ai-dev-toolkit/skills/refactor-to-monorepo/SKILL.md
head -5 ai-dev-toolkit/skills/refactor-to-monorepo/SKILL.md
grep -c "^## \|^### " ai-dev-toolkit/skills/refactor-to-monorepo/SKILL.md
```

Expected: 250-300 lines (max 500), correct frontmatter, 6+ section headers.

- [ ] **Step 8: Commit**

```bash
git add ai-dev-toolkit/skills/refactor-to-monorepo/SKILL.md
git commit -m "feat(refactor-to-monorepo): add main SKILL.md with analysis pipeline"
```

---

### Task 13: Phase 2 Integration Verification

**Files:** All Phase 2 files

- [ ] **Step 1: Verify complete file tree**

```bash
find ai-dev-toolkit/skills/refactor-to-monorepo -type f | sort
```

Expected:
```
ai-dev-toolkit/skills/refactor-to-monorepo/SKILL.md
ai-dev-toolkit/skills/refactor-to-monorepo/references/analysis-framework.md
ai-dev-toolkit/skills/refactor-to-monorepo/references/migration-patterns.md
ai-dev-toolkit/skills/refactor-to-monorepo/references/module-spec-template.md
ai-dev-toolkit/skills/refactor-to-monorepo/references/tech-stacks.md
```

- [ ] **Step 2: Verify all cross-references resolve**

```bash
grep "references/" ai-dev-toolkit/skills/refactor-to-monorepo/SKILL.md | grep -oP 'references/[a-z-]+\.md' | sort -u | while read ref; do
  if [ -f "ai-dev-toolkit/skills/refactor-to-monorepo/$ref" ]; then
    echo "OK: $ref"
  else
    echo "MISSING: $ref"
  fi
done
```

Expected: All OK, no MISSING.

- [ ] **Step 3: Verify SKILL.md frontmatter**

```bash
head -4 ai-dev-toolkit/skills/refactor-to-monorepo/SKILL.md
```

Expected: `---`, `name: refactor-to-monorepo`, `description: "Use when..."`, `---`.

- [ ] **Step 4: Verify total line counts**

```bash
echo "=== Line counts ===" && wc -l ai-dev-toolkit/skills/refactor-to-monorepo/SKILL.md ai-dev-toolkit/skills/refactor-to-monorepo/references/*.md
```

Expected:
- SKILL.md: 250-300 (max 500)
- tech-stacks.md: 100-120
- analysis-framework.md: 120-150
- module-spec-template.md: 40-60
- migration-patterns.md: 80-100

- [ ] **Step 5: Commit phase 2 complete**

```bash
git add -A ai-dev-toolkit/
git commit -m "feat(refactor-to-monorepo): phase 2 complete - all skill files created"
```

---

### Task 14: Full Plugin Verification

**Files:** All 11 files

- [ ] **Step 1: Verify complete plugin file tree**

```bash
find ai-dev-toolkit -type f | sort
```

Expected: 11 files total (1 plugin.json + 5 document-for-ai + 5 refactor-to-monorepo).

- [ ] **Step 2: Verify both skills have valid frontmatter**

```bash
for skill in document-for-ai refactor-to-monorepo; do
  echo "=== $skill ==="
  head -4 "ai-dev-toolkit/skills/$skill/SKILL.md"
  echo ""
done
```

Expected: Both show `---`, `name:`, `description:`, `---`.

- [ ] **Step 3: Verify total plugin size**

```bash
echo "=== Total line count ===" && find ai-dev-toolkit -name "*.md" -o -name "*.json" | xargs wc -l | tail -1
```

Expected: ~1000-1200 total lines across all files.

- [ ] **Step 4: Final commit**

```bash
git add -A ai-dev-toolkit/
git commit -m "feat: ai-dev-toolkit plugin complete - document-for-ai + refactor-to-monorepo skills"
```
