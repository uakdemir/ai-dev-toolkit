# Implement-Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `implement-plan` skill for the `ai-dev-tools` Claude Code plugin — the execution skill that takes strategy specs from refactor-to-layers and applies the restructuring steps.

**Architecture:** A Markdown-based Claude Code skill following the same conventions as the existing skills: `SKILL.md` (~250-300 lines) for workflow orchestration + `references/` directory for progressive disclosure. Two reference files: `execution-patterns.md` (per-action-type logic, Serena vs fallback) and `verification-patterns.md` (per-stack verification commands, failure analysis).

**Tech Stack:** Claude Code plugin system (Markdown SKILL.md files, YAML frontmatter)

**Spec:** `docs/superpowers/specs/2026-03-27-implement-plan-design.md`

---

## File Map

| File | Responsibility | Target Lines | Action |
|------|---------------|-------------|--------|
| `ai-dev-tools/skills/implement-plan/SKILL.md` | Workflow orchestration: invocation flow (7 steps), phase execution (4 phases), verification, resume, circular dep advisory | ~250-300 | Create |
| `ai-dev-tools/skills/implement-plan/references/execution-patterns.md` | Per-action-type execution logic (create/move/rewrite/extract), Serena vs fallback paths per stack, circular dependency classification heuristics and patterns | ~120-150 | Create |
| `ai-dev-tools/skills/implement-plan/references/verification-patterns.md` | Per-stack verification commands, failure analysis heuristics, fix proposal templates, pre-flight validation rules | ~80-100 | Create |
| `ai-dev-tools/.claude-plugin/plugin.json` | Update description to include implement-plan | — | Modify |

**Total: 3 new files + 1 modification**

---

## Task 1: Create Directory Structure

**Files:**
- Create: `ai-dev-tools/skills/implement-plan/references/` (directory)

- [ ] **Step 1: Create skill directory**

```bash
mkdir -p ai-dev-tools/skills/implement-plan/references
```

- [ ] **Step 2: Verify directory structure**

```bash
ls ai-dev-tools/skills/
```

Expected: Four directories — `document-for-ai/`, `refactor-to-monorepo/`, `refactor-to-layers/`, `implement-plan/`

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/implement-plan
git commit -m "feat(implement-plan): create skill directory structure"
```

---

## Task 2: Create `references/execution-patterns.md`

**Files:**
- Create: `ai-dev-tools/skills/implement-plan/references/execution-patterns.md`

- [ ] **Step 1: Write execution-patterns.md**

Extract from spec Sections 4.1-4.4, 5.1-5.4. This is the core reference for how each action type is executed.

Required content:
- H1: "Execution Patterns"
- Brief intro (1-2 lines) explaining the 4-phase execution model

- `## Action: create-folder` — execution logic: `mkdir -p` the target path. Dependency ordering: parent before child. Idempotent — skip if directory exists.

- `## Action: move-file` — two execution paths:
  - `### Serena Mode` — call `find_referencing_symbols` on the source file to capture all references before moving. Then move the file (git mv). Store the captured reference graph for Phase 2.
  - `### Fallback Mode` — `git mv` the source to the target. No reference graph captured — Phase 2 uses regex scanning.
  - Dependency ordering: if file B imports file A and both are being moved, move A first. Build dependency graph from `affected_imports` field. If cycles exist within move-file steps, batch them (file moves don't break imports — only Phase 2 rewrites do).

- `## Action: rewrite-import` — two execution paths:
  - `### Serena Mode` — use `find_referencing_symbols` to locate all files referencing the moved file's symbols. Update import paths in those files. Symbol names stay the same — only the module path changes. (Note: `rename_symbol` is for symbol renaming, not import path changes. The exact Serena tool for import path updates should be determined during implementation — `find_referencing_symbols` + manual path replacement in the referencing files is the recommended approach.)
  - `### Fallback Mode` — per-stack regex patterns:
    - **Node.js:** regex for `import ... from '...'` and `require('...')`. Resolve relative paths. Read `tsconfig.json` `paths` for aliases. Replace old path with new path.
    - **.NET:** regex for `using` directives. Match namespace prefix to old path, replace with new namespace. Check `<ProjectReference>` in `.csproj`.
    - **Python:** regex for `import` and `from ... import`. Resolve against `__init__.py` package structure.
  - Flag unresolved aliases as "regex-based — verify manually" in the execution report.
  - Dependency ordering: files with the most consumers first. Consumer count = length of `affected_imports` array. Ties broken alphabetically.

- `## Action: extract-interface` — two execution paths:
  - `### Serena Mode` — call `get_symbols_overview` on the source class file to read its public API. Create the interface file at the target path with method signatures extracted from the public API. Use `find_referencing_symbols` to locate all consumers. Update each consumer to import the interface instead of the concrete class.
  - `### Fallback Mode` — read the source file. Extract public method signatures (language-specific patterns: TypeScript `public` methods / exported functions, C# `public` methods, Python methods without `_` prefix). Create interface file. Regex-replace concrete class imports with interface imports in consumer files.
  - Field semantics: `source` = concrete class file, `target` = new interface file path, `affected_imports` = consumer files to update.
  - Dependency ordering: interfaces with fewer consumers first (length of `affected_imports`).

- `## Circular Dependency Classification` — from spec Section 5.2. The 4 pattern heuristics:
  - **Callback:** B receives A's function/method as parameter, or B calls a single void method on A with no return value used. Detection: scan for function parameters typed as A, or calls to A with no assignment of return value.
  - **Shared operation:** Both A and B call the same function/method with similar arguments. Detection: find common call targets.
  - **Bidirectional data flow:** A reads a property/field from B, and B reads a property/field from A. Detection: property access patterns.
  - **Misplaced responsibility:** One side has a single usage of the other that could be inlined or moved. Detection: count distinct usages — if one direction has only 1 call, it's likely misplaced.
  - **Unclassified:** If heuristics are ambiguous, present without proposed resolution.
  - All classifications include confidence level (high/medium/low).
  - All resolutions are **advisory only** — recorded in the execution report, not auto-executed.

- `## [DONE] Marker Format` — from spec Section 3.3: prepend `[DONE] ` to the step's action line. Example: `[DONE] action: move-file` means this step is complete. Parsing: any line starting with `[DONE] action:` is skipped during resume.

Target: ~120-150 lines.

- [ ] **Step 2: Verify line count and key sections**

```bash
wc -l ai-dev-tools/skills/implement-plan/references/execution-patterns.md
grep "^## " ai-dev-tools/skills/implement-plan/references/execution-patterns.md
```

Expected: 120-150 lines. Headers include `## Action: create-folder`, `## Action: move-file`, `## Action: rewrite-import`, `## Action: extract-interface`, `## Circular Dependency Classification`, `## [DONE] Marker Format`.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/implement-plan/references/execution-patterns.md
git commit -m "feat(implement-plan): add execution patterns reference"
```

---

## Task 3: Create `references/verification-patterns.md`

**Files:**
- Create: `ai-dev-tools/skills/implement-plan/references/verification-patterns.md`

- [ ] **Step 1: Write verification-patterns.md**

Extract from spec Sections 3.4, 3.5, 4.5, 8. Contains verification commands, failure analysis, and pre-flight validation rules.

Required content:
- H1: "Verification Patterns"
- Brief intro explaining 3 verification granularities (per-step, per-phase, end-only)

- `## Pre-flight Validation` — from spec Section 3.5:
  - Source existence check: scan all remaining step source paths, report missing
  - Target collision check per action type: move-file/extract-interface → overwrite or stop (no skip). create-folder → proceed silently.
  - Git state check: require clean working tree

- `## Per-Stack Verification Commands` — the commands to run after each phase:
  - `### Node.js` — `npx tsc --noEmit` (TypeScript type check), `npx eslint .` (lint check), file existence assertions
  - `### .NET` — `dotnet build` (compile check), file existence assertions
  - `### Python` — `python -c "import [package]"` (import check), `python -m py_compile [file]` (syntax check), file existence assertions
  - Phase 0 (create-folder): just verify directories exist — no build needed
  - Phase 1 (move): verify source gone + target present — no build (imports are broken until Phase 2)
  - Phase 2 (rewrite): full build/type-check — this is where import issues surface
  - Phase 3 (extract): full build/type-check — this is where interface issues surface

- `## Failure Analysis Heuristics` — from spec Section 4.5 and 8:
  - **Missing import:** error mentions "Cannot find module" / "Module not found" / "CS0246" / "ModuleNotFoundError" → likely a missed rewrite-import. Propose: find the old import path in the error file and replace with the new path.
  - **Type mismatch after extraction:** error mentions interface/type incompatibility → likely the extracted interface has wrong method signatures. Propose: compare interface methods with the concrete class's public API.
  - **Circular dependency failure:** if the failing file was flagged in pre-Phase 3 classification, reference that classification in the analysis.
  - **Namespace conflict (.NET):** multiple types with the same name in different namespaces → likely a rewrite created an ambiguous `using` directive. Propose: use fully qualified name.

- `## Target Collision Rules` — per action type:
  - `move-file` target exists: warn, offer overwrite or stop. No skip (downstream steps depend on the move).
  - `extract-interface` target exists: warn, offer overwrite or stop.
  - `create-folder` target exists: proceed silently (mkdir -p is idempotent).
  - `rewrite-import` has no target collision concept (it modifies an existing file's import line).

- `## Execution Report Template` — from spec Section 7.2. The structure of `tmp/execution-report.md`:
  - Header with generation date
  - Execution mode (Serena/fallback)
  - Verification granularity
  - Per-phase summary table
  - Circular dependencies classified
  - Files moved table
  - Imports rewritten count
  - Interfaces extracted
  - Failures and resolutions
  - Recommended manual steps

Target: ~80-100 lines.

- [ ] **Step 2: Verify line count and key sections**

```bash
wc -l ai-dev-tools/skills/implement-plan/references/verification-patterns.md
grep "^## " ai-dev-tools/skills/implement-plan/references/verification-patterns.md
```

Expected: 80-100 lines. Headers include `## Pre-flight Validation`, `## Per-Stack Verification Commands`, `## Failure Analysis Heuristics`, `## Target Collision Rules`, `## Execution Report Template`.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/implement-plan/references/verification-patterns.md
git commit -m "feat(implement-plan): add verification patterns reference"
```

---

## Task 4: Create `SKILL.md`

This is the main orchestration file. Depends on both reference files being defined.

**Files:**
- Create: `ai-dev-tools/skills/implement-plan/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

Follow the exact same structure as existing skills. Read `ai-dev-tools/skills/refactor-to-layers/SKILL.md` and `ai-dev-tools/skills/refactor-to-monorepo/SKILL.md` for format reference before writing.

Required structure and content:

**Frontmatter** (from spec Section 2):
```yaml
---
name: implement-plan
description: "Use when the user wants to execute a restructuring strategy from refactor-to-layers, apply file moves and import rewrites from a layer strategy spec, or restructure a codebase according to an approved layer plan — even if they don't use the exact skill name."
---
```

**H1:** `# implement-plan`

**Overview** (2-3 sentences): Execute restructuring strategy specs produced by refactor-to-layers. Groups steps into phases (create → move → rewrite → extract) with dependency ordering. Serena-aware with regex fallback.

**`## Workflow Overview`** — numbered pipeline steps. Reference files with progressive disclosure:
- `references/execution-patterns.md` — load after strategy spec parsed
- `references/verification-patterns.md` — load during verification / on failure
- "Do not inline their content — read them at the indicated step"

**`## Step 1: Detect Serena Availability`** — from spec Section 3.1:
- Check for `get_symbols_overview` tool in session
- Serena available → proceed
- Not available → warn with explicit message about regex limitations, ask user to confirm
- Confirm Serena by probing a file within strategy spec scope (after Step 2)

**`## Step 2: Locate Strategy Spec`** — from spec Section 3.2:
- Explicit path argument → use it
- Auto-detect: `docs/layer-architecture/strategy.md` at root, recursive search in workspace package dirs
- One found → use. Multiple → ask. None → error pointing to refactor-to-layers only

**`## Step 3: Parse and Validate`** — from spec Section 3.3:
- Read frontmatter fields and their uses (tech_stack, layers, composition_root, scope)
- Parse Restructuring Steps into step objects
- Validate required fields per action type (reference the field semantics table)
- Skip `[DONE]` steps, report counts
- `[DONE]` marker format: prepend `[DONE] ` to action line

**`## Step 4: Check Git State`** — from spec Section 3.4:
- Require clean working tree

**`## Step 5: Pre-flight Validation`** — from spec Section 3.5:
- Source existence, target collisions (overwrite or stop, no skip)
- Read `references/verification-patterns.md` "Pre-flight Validation" and "Target Collision Rules"

**`## Step 6: Ask Verification Granularity`** — from spec Section 3.6:
- Per-step / per-phase (default) / end-only

**`## Step 7: Execute Phases`** — from spec Section 3.7 + Section 4:
- Group by action type, execute sequentially
- Reference `references/execution-patterns.md` for per-action logic

**`## Execution Phases`** — from spec Section 4, with sub-sections:

`### Phase 0: Preparation` — create-folder actions
`### Phase 1: Move` — move-file actions, Serena/fallback paths
`### Phase 2: Rewrite` — rewrite-import actions, Serena/fallback paths
`### Phase 3: Extract` — extract-interface actions, pre-Phase 3 circular dep check

Keep phase descriptions concise — detail is in `references/execution-patterns.md`.

**`## Pre-Phase 3: Circular Dependency Advisory`** — from spec Section 5:
- Detection, classification (4 patterns + unclassified), batch decision table
- Advisory only — not auto-executed
- Acknowledged items → execution report "Recommended Manual Steps"

**`## Verification Flow`** — from spec Section 4.5:
- When verification runs per granularity choice
- On failure: stop, analyze, propose fix, user approves/rejects
- Reference `references/verification-patterns.md` for failure analysis

**`## Resume`** — from spec Section 6:
- Mid-phase failure → partial commit + `[DONE]` markers
- Skip completed steps, reconcile filesystem, re-validate deps
- Fully executed → nothing to do

**`## Output`** — from spec Section 7:
- Strategy spec updated in place (DONE markers, file mapping, violations, limitations, generated date)
- Execution report at `tmp/execution-report.md` (throwaway)

**`## Error Handling`** — from spec Section 8:
- Concise table with key scenarios (~12 rows)

**`## Progressive Disclosure Schedule`** — summary table:

| Phase | Load | Section |
|---|---|---|
| After strategy spec parsed | `references/execution-patterns.md` | Full file |
| During verification / on failure | `references/verification-patterns.md` | Relevant stack + failure type |

Target: ~250-300 lines. Be concise — orchestrate, don't duplicate reference content.

- [ ] **Step 2: Verify line count and structure**

```bash
wc -l ai-dev-tools/skills/implement-plan/SKILL.md
grep "^## \|^### " ai-dev-tools/skills/implement-plan/SKILL.md
head -5 ai-dev-tools/skills/implement-plan/SKILL.md
```

Expected: 250-300 lines. Starts with YAML frontmatter. All major sections present.

- [ ] **Step 3: Verify all reference paths are correct**

```bash
grep "references/" ai-dev-tools/skills/implement-plan/SKILL.md
ls ai-dev-tools/skills/implement-plan/references/
```

Expected: Every `references/` path in SKILL.md corresponds to an actual file.

- [ ] **Step 4: Commit**

```bash
git add ai-dev-tools/skills/implement-plan/SKILL.md
git commit -m "feat(implement-plan): add main SKILL.md with workflow orchestration"
```

---

## Task 5: Update `plugin.json` and Final Verification

**Files:**
- Modify: `ai-dev-tools/.claude-plugin/plugin.json`

- [ ] **Step 1: Update plugin.json description**

Update the `description` field from:
```
"AI-optimized documentation generation, monorepo refactoring strategy, and architectural layer enforcement"
```
to:
```
"AI-optimized documentation generation, monorepo refactoring strategy, architectural layer enforcement, and plan execution"
```

- [ ] **Step 2: Verify the full skill directory**

```bash
find ai-dev-tools/skills/implement-plan -type f | sort
```

Expected output:
```
ai-dev-tools/skills/implement-plan/SKILL.md
ai-dev-tools/skills/implement-plan/references/execution-patterns.md
ai-dev-tools/skills/implement-plan/references/verification-patterns.md
```

- [ ] **Step 3: Verify all files are within target line counts**

```bash
wc -l ai-dev-tools/skills/implement-plan/SKILL.md ai-dev-tools/skills/implement-plan/references/*.md
```

Expected ranges:
- `SKILL.md`: 250-300 lines
- `execution-patterns.md`: 120-150 lines
- `verification-patterns.md`: 80-100 lines

- [ ] **Step 4: Verify SKILL.md frontmatter matches plugin conventions**

```bash
head -4 ai-dev-tools/skills/implement-plan/SKILL.md
head -4 ai-dev-tools/skills/refactor-to-layers/SKILL.md
head -4 ai-dev-tools/skills/document-for-ai/SKILL.md
```

Expected: All use identical frontmatter structure (`---`, `name:`, `description:`, `---`).

- [ ] **Step 5: Cross-reference check — verify no broken internal references**

```bash
grep -o 'references/[a-z-]*\.md' ai-dev-tools/skills/implement-plan/SKILL.md | sort -u
ls ai-dev-tools/skills/implement-plan/references/
```

Expected: Every referenced file exists.

- [ ] **Step 6: Verify all 4 skills exist**

```bash
ls ai-dev-tools/skills/
```

Expected: `document-for-ai/`, `implement-plan/`, `refactor-to-layers/`, `refactor-to-monorepo/`

- [ ] **Step 7: Commit**

```bash
git add ai-dev-tools/.claude-plugin/plugin.json
git commit -m "feat: update plugin.json for implement-plan skill"
```
