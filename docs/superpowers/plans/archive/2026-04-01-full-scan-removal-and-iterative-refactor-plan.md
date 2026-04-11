# Full Scan Removal & Iterative Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove full-scan fallback from orchestrate/session-handoff, delete implement-plan skill, and make refactor skills produce iterative unit-at-a-time roadmaps driven by orchestrate.

**Architecture:** Two-part change. Part 1 replaces all "full scan fallback" paths with a unified User Prompt and makes session-handoff ask before running git history commands. Part 2 deletes implement-plan, creates a distilled `refactor-execution.md` reference, rewires both refactor skills to produce roadmap + single-unit spec output, and adds iteration awareness to orchestrate Steps 1/5/8.

**Tech Stack:** Markdown skill files (no code compilation). All files under `ai-dev-tools/skills/`.

---

### Task 1: Delete full-scan.md and Remove All Full-Scan References from Orchestrate

**Files:**
- Delete: `ai-dev-tools/skills/orchestrate/references/full-scan.md`
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md`

This task covers spec sections 1.1 (Fast-Path Detection Algorithm, First-Run User Prompt, Step 2 feature name resolution, Conditional Loading, Step 6 N derivation, Step 6 step-specific validation, Step 6 inline validation, Error Handling table, Inline Cross-Check Rules).

- [ ] **Step 1: Delete full-scan.md**

```bash
rm ai-dev-tools/skills/orchestrate/references/full-scan.md
```

- [ ] **Step 2: Replace the Fast-Path Detection Algorithm (SKILL.md lines 111-133)**

Replace the entire code block inside the `## Fast-Path Detection Algorithm` section with:

````markdown
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
        Write hint after resolution. This replaces the existing spec-filename scanning at
        SKILL.md lines 126-132 (docs/superpowers/specs/ filename scan and full scan fallback).
```
````

- [ ] **Step 3: Update the step-specific validation inline sentence (SKILL.md line 135)**

Find:
```
6: commits since plan_hash (`git log <plan_hash>..HEAD`; if plan_hash empty, populate via `git log --format=%H -1 -- {plan_path}`; if still empty, full scan fallback).
```

Replace with:
```
6: commits since plan_hash (`git log <plan_hash>..HEAD`; if plan_hash empty, populate via `git log --format=%H -1 -- {plan_path}`; if still empty, show `Commits since plan: unknown (plan hash not found)` in the confirmation prompt. The user can override with a specific count or command).
```

- [ ] **Step 4: Replace the First-Run User Prompt section header and trigger (lines 143-145)**

Find:
```markdown
## First-Run User Prompt (--strict only)

**Trigger:** No valid cycle state in hint file (missing file, malformed YAML, or empty/missing `feature` field) AND strict mode is active.
```

Replace with:
```markdown
## User Prompt

**Trigger:** No valid cycle state in hint file (missing file, malformed YAML, or empty/missing `feature` field), OR fast-path detection cannot resolve state.
```

- [ ] **Step 5: Update User Prompt step 2 — feature name resolution (lines 152-155)**

Find:
```
   - Feature name: case-insensitive substring match against
     docs/superpowers/specs/ filenames (strip YYYY-MM-DD- prefix
     and -design suffix). Exactly one match → resolved.
     Zero or multiple matches → ambiguous (go to step 4).
```

Replace with:
```
   - Feature name: extract from user response directly.
     If the user names a feature, accept it as-is.
     If ambiguous, ask for clarification (step 4).
```

Add the following paragraph after the closing ``` of the User Prompt code block (after existing step 5):

```markdown
**Spec field population (hint write):** After accepting the feature name from the user, do a lightweight filename scan of `docs/superpowers/specs/` to find files containing the feature name as a case-insensitive substring in the filename. This is filename matching only — no file content is read. If exactly one file matches, set `spec` to that file path in the written hint. If zero or multiple files match, set `spec` to `''`. This scan is limited to step 3 hint-write and does not affect state resolution or the feature name itself. Downstream step 3 validation (Reviewed vs hint spec) is skipped when `spec` is `''`.
```

- [ ] **Step 6: Update User Prompt step 3 — validation contradiction (lines 173-176)**

Find:
```
   → If validation contradicts the stated step: print
     "The project state doesn't match step <N> — let me scan
     to determine the correct step." Fall back to full scan.
```

Replace with:
```
   → If validation contradicts the stated step: print
     "That doesn't match what I see — can you clarify?"
     Continue within the 2-3 round limit.
```

- [ ] **Step 7: Update User Prompt step 5 — max rounds exceeded (lines 184-186)**

Find:
```
5. If still unclear after 2-3 rounds:
   → Print: "Let me scan the project to figure it out."
   → Fall back to full scan (read references/full-scan.md).
```

Replace with:
```
5. If still unclear after 2-3 rounds:
   → Print: "I can't determine the state automatically.
     Please describe your current step more specifically,
     or check tmp/orchestrate-state.md and update it manually."
   → Write hint with whatever was resolved (feature if known,
     step 1 as default). Proceed to the resolved or default step.
```

- [ ] **Step 8: Replace the Conditional Loading section (lines 192-206)**

Find:
```markdown
If hint file is missing or validation fails:
  -> Strict mode active: First-Run User Prompt (see above), then full scan only if unresolved.
  -> Standard mode: Read references/full-scan.md, execute Full Scan Fallback.
```

Replace with:
```markdown
If hint file is missing or validation fails:
  → User Prompt (both modes). Write hint after resolution.
```

- [ ] **Step 9: Update N derivation in Review Confirmation Prompts (line 258)**

Find:
```
**N derivation (Step 6):** Computed via `git log {plan_hash}..HEAD --oneline | wc -l`. If plan_hash is empty, attempt to populate via `git log --format=%H -1 -- {plan_path}`; if still empty, fall back to full scan per existing Step 6 behavior and show `Commits since plan: unknown (plan hash not found)`.
```

Replace with:
```
**N derivation (Step 6):** Computed via `git log {plan_hash}..HEAD --oneline | wc -l`. If plan_hash is empty, attempt to populate via `git log --format=%H -1 -- {plan_path}`; if still empty, show `Commits since plan: unknown (plan hash not found)` in the confirmation prompt. The user can override with a specific count or command.
```

- [ ] **Step 10: Update Error Handling table (lines 266-279)**

Replace these 4 rows in the Error Handling table:

| Row to find | Replace with |
|---|---|
| `Hint file missing or YAML malformed \| Strict: First-Run User Prompt → fallback to full scan if unresolved. Standard: Full scan fallback. Write hint after detection.` | `Hint file missing or YAML malformed \| User Prompt (both modes). Write hint after resolution.` |
| `Unknown step/feature or head not in history \| Full scan fallback. Overwrite hint.` | `Unknown step/feature or head not in history \| User Prompt. Write hint after resolution.` |
| `Hint says finalized but spec deleted \| Full scan -> clean slate -> Step 1.` | `Hint says finalized but spec deleted \| Write hint (step: 1, clear fields) → route to Step 1.` |
| `No valid cycle state + strict mode \| First-Run User Prompt → targeted validation → hint write. Fallback to full scan after 2-3 rounds.` | `No valid cycle state + strict mode \| User Prompt → targeted validation → hint write. If unresolved after 2-3 rounds, default to step 1 with whatever was resolved.` |

- [ ] **Step 11: Remove the full cross-check reference line (line 289)**

Find and delete this line:
```
Full cross-check algorithm (scope header overlap, response_analysis.md counting, clean-review attribution) is in references/full-scan.md.
```

The two inline rules above it (doc review and code review stale detection) remain.

- [ ] **Step 12: Verify zero full-scan references remain**

```bash
grep -i "full.scan\|full scan\|Full Scan" ai-dev-tools/skills/orchestrate/SKILL.md
```

Expected: zero matches.

- [ ] **Step 13: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/references/full-scan.md ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "refactor(orchestrate): remove full-scan fallback, unify User Prompt for both modes"
```

---

### Task 2: Update Session-Handoff — Ask-First Git + Remove implement-plan Block

**Files:**
- Modify: `ai-dev-tools/skills/session-handoff/SKILL.md`

This task covers spec sections 1.2 (session-handoff ask-first git, remove implement-plan conversation analysis block).

- [ ] **Step 1: Replace the full git fallback section (lines 61-78)**

Find the entire block from `**If \`gitStatus\` is absent (non-standard invocation):**` through the end of `**Session commit detection (fallback only):**` section (lines 61-78).

Replace the content starting at line 61 (`**If \`gitStatus\` is absent...`) through line 78 (`3. Note "session boundary estimated"...`) with:

```markdown
**If `gitStatus` is absent (non-standard invocation):**

1. Run `git rev-parse --is-inside-work-tree`. If fails, skip all git and proceed
   conversation-only. Warn: "No git repo — handoff will be conversation-based only."
2. Run `git rev-parse --verify HEAD`. If fails (empty repo with no commits), skip
   all git history commands. Set `session_commits: 0` and note
   "Empty repo (no commits) — handoff will be conversation-based only." Proceed to
   conversation-only path.
3. Run `git branch --show-current` and `git status --short` (always — lightweight).
4. Ask: "I don't have the session start point. Want me to check recent git history
   to find session commits?"
   - If yes: run `git log --oneline --since="midnight" -20`.
     If the result is zero commits, set `session_commits: 0` and note
     "No commits found since midnight — handoff will be conversation-based only."
     If commits found, note "session boundary estimated" in the handoff.
   - If no: conversation-only for commits. Set `session_commits: 0`. Branch name and uncommitted file state (from steps 2-3) are still written to the handoff frontmatter. Only session commit history is omitted.
```

- [ ] **Step 2: Remove the "Unfinished implement-plan tasks" block from Conversation Analysis (lines 91-92)**

Find and delete these lines from the Pending items scan list:

```markdown
- Unfinished implement-plan tasks: if the conversation references a strategy spec path, read the spec and count `[DONE]` vs remaining steps. Include the spec path and remaining count. If `tmp/execution-report.md` exists, reference it in the Done section but do not attempt to derive the strategy spec path from it — require the path from conversation context. This `[DONE]` parsing is specific to implement-plan artifacts.
```

The bullet for "Unfinished plan tasks (generic)" remains unchanged.

- [ ] **Step 3: Verify session-handoff changes**

```bash
grep -i "implement-plan\|full git analysis\|git log --oneline -20\|git diff --stat HEAD" ai-dev-tools/skills/session-handoff/SKILL.md
```

Expected: zero matches for `full git analysis`, `git log --oneline -20`, and `git diff --stat HEAD`. The `implement-plan` reference should also be gone from the Conversation Analysis section.

- [ ] **Step 4: Commit**

```bash
git add ai-dev-tools/skills/session-handoff/SKILL.md
git commit -m "refactor(session-handoff): ask-first git fallback, remove implement-plan references"
```

---

### Task 3: Create refactor-execution.md in Orchestrate

**Files:**
- Create: `ai-dev-tools/skills/orchestrate/references/refactor-execution.md`

This task covers spec section 2.5. **Must complete before Task 4 (deleting implement-plan).**

Content distilled from `implement-plan/references/execution-patterns.md` and `implement-plan/references/verification-patterns.md`.

- [ ] **Step 1: Create refactor-execution.md**

Write the following to `ai-dev-tools/skills/orchestrate/references/refactor-execution.md`:

```markdown
# Refactor Execution Patterns

Loaded at Step 5 only when a refactor roadmap exists (`docs/monorepo-strategy/roadmap.md` or `docs/layer-architecture/roadmap.md`) and the current feature name appears in that roadmap.

---

## File Operations

- `mkdir -p` for folder creation (idempotent)
- `git mv` for file moves (preserves history)
- Move dependency ordering: if B imports file A and both move, move A first
- Import rewrite: grep old paths, replace with new package paths

### Per-stack patterns

**Node.js:**
- `import ... from '...'`, `require('...')` — match and replace the module path string
- Read `tsconfig.json` paths section to resolve path aliases before applying regex
- Flag any unresolved aliases as: `# regex-based — verify manually`

**.NET:**
- `using` directives, namespace prefix matching, `<ProjectReference>` in `.csproj`
- Update both the `using` directive and the corresponding `.csproj` `<ProjectReference>` path

**Python:**
- `import ...`, `from ... import ...` — match and replace the module path
- Resolve barrel exports via `__init__.py` — ensure the new package's `__init__.py` re-exports moved symbols
- Check for relative imports (`from . import ...`) that need conversion to absolute paths

---

## Pre-flight

- **Source existence check:** verify every source path exists. Report all missing before starting — do not fail on the first one.
- **Target collision check:** warn on existing targets for moves. Prompt: overwrite or stop.
- **Clean git state required:** uncommitted changes must be committed or stashed before proceeding.

---

## Verification

- **After file moves:** assert source gone + target present. Do NOT build (imports still point to old paths).
- **After import rewrites:** run full build/type-check (first point where compilation should succeed).

### Per-stack commands

| Stack | Type-check / build | Import smoke-test |
|---|---|---|
| Node.js | `npx tsc --noEmit` | `npx eslint .` |
| .NET | `dotnet build` | N/A (build covers it) |
| Python | `python -m py_compile <file>` | `python -c "import <package>"` |
```

- [ ] **Step 2: Verify the file has all required sections**

```bash
grep -c "## File Operations\|## Pre-flight\|## Verification\|### Per-stack patterns" ai-dev-tools/skills/orchestrate/references/refactor-execution.md
```

Expected: 4

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/references/refactor-execution.md
git commit -m "feat(orchestrate): add refactor-execution.md with distilled file-op/verification patterns"
```

---

### Task 4: Delete implement-plan Skill

**Files:**
- Delete: `ai-dev-tools/skills/implement-plan/SKILL.md`
- Delete: `ai-dev-tools/skills/implement-plan/references/execution-patterns.md`
- Delete: `ai-dev-tools/skills/implement-plan/references/verification-patterns.md`

**Prerequisite:** Task 3 must be complete (refactor-execution.md created).

- [ ] **Step 1: Verify refactor-execution.md exists**

```bash
test -f ai-dev-tools/skills/orchestrate/references/refactor-execution.md && echo "OK" || echo "MISSING — do Task 3 first"
```

- [ ] **Step 2: Delete implement-plan directory**

```bash
rm ai-dev-tools/skills/implement-plan/SKILL.md
rm ai-dev-tools/skills/implement-plan/references/execution-patterns.md
rm ai-dev-tools/skills/implement-plan/references/verification-patterns.md
rmdir ai-dev-tools/skills/implement-plan/references
rmdir ai-dev-tools/skills/implement-plan
```

- [ ] **Step 3: Commit**

```bash
git add -A ai-dev-tools/skills/implement-plan/
git commit -m "refactor: delete implement-plan skill (patterns extracted to orchestrate/references/refactor-execution.md)"
```

---

### Task 5: Update refactor-to-monorepo — Roadmap + Single-Unit Spec + --next-unit

**Files:**
- Modify: `ai-dev-tools/skills/refactor-to-monorepo/SKILL.md`

This task covers spec sections 2.3 (checklist template updates), 2.4 (refactor-to-monorepo changes).

- [ ] **Step 1: Verify zero Serena references**

```bash
grep -i "serena\|find_referencing_symbols\|rename_symbol\|replace_content" ai-dev-tools/skills/refactor-to-monorepo/SKILL.md
```

Expected: zero matches (per spec section 2.3, Serena was only in implement-plan).

- [ ] **Step 2: Add --next-unit to help-text block**

Find the help-text block:
```
<help-text>
refactor-to-monorepo — Analyze monolith for monorepo extraction strategy

USAGE
  /refactor-to-monorepo

EXAMPLES
  /refactor-to-monorepo              Analyze and produce extraction plan
</help-text>
```

Replace with:
```
<help-text>
refactor-to-monorepo — Analyze monolith, produce unit extraction roadmap

USAGE
  /refactor-to-monorepo [--next-unit]

FLAGS
  --next-unit   Generate spec for next unchecked unit in roadmap

EXAMPLES
  /refactor-to-monorepo              Analyze and produce extraction plan
  /refactor-to-monorepo --next-unit  Produce spec for next extraction unit
</help-text>
```

- [ ] **Step 3: Add argument-parsing instruction after the help-text routing**

Find:
```
If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.
```

Replace with:
```
If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic. If user's arguments contain `--next-unit`, skip the main workflow and execute `--next-unit` behavior (see below).
```

- [ ] **Step 4: Update checklist crystallization template — index.md example row**

Find in the `index.md` format code block:
```
| [monorepo-extraction.md](monorepo-extraction.md) | Universal extraction pitfalls | both | refactor-to-monorepo, implement-plan |
```

Replace with:
```
| [monorepo-extraction.md](monorepo-extraction.md) | Universal extraction pitfalls | both | refactor-to-monorepo |
```

- [ ] **Step 5: Update checklist Phase column definition**

Find:
```
| Phase | `analysis`, `coding`, or `both` | `analysis` = refactor-to-monorepo phases 1-4, `coding` = implement-plan phases 1-N, `both` = both contexts |
```

Replace with:
```
| Phase | `analysis`, `coding`, or `both` | `analysis` = refactor-to-monorepo phases 1-4, `coding` = orchestrate Step 5 implementation, `both` = both contexts |
```

- [ ] **Step 6: Update checklist Write protocol note**

Find:
```
**Write protocol (for append operations by `implement-plan` — NOT used during crystallization):**
```

Replace with:
```
**Write protocol (for append operations by external skills — NOT used during crystallization):**
```

- [ ] **Step 7: Update Phase 4 user checkpoint message**

Find:
```
6. **User checkpoint:** "Here is the full analysis with proposed module boundaries and conflict resolutions. Please review before I generate the output artifacts."
```

Replace with:
```
6. **User checkpoint:** "Here is the full analysis with proposed module boundaries and conflict resolutions. Please review before I generate the output artifacts: roadmap.md (ordered extraction list) and a single-unit spec for the first module."
```

- [ ] **Step 8: Remove the `### 6. migration-plan.md` artifact section from Step 4 Output Artifacts**

Find the entire `### 6. \`migration-plan.md\` — Phased Migration Plan` section (from its heading through the end of its content including the embedded `## Checklists` block) and delete it. This is the section that starts with `### 6.` and contains Phase 0, Phases 1-N descriptions, and the Checklists subsection.

- [ ] **Step 9: Remove the Progressive Disclosure Schedule row for migration plan**

Find and delete this row from the Progressive Disclosure Schedule table:
```
| Artifact generation: migration plan | `references/migration-patterns.md` | Extraction ordering and phasing patterns |
```

- [ ] **Step 10: Add roadmap.md artifact to Step 4 Output Artifacts**

After the `### 5. \`monorepo-tooling.md\`` section, add:

```markdown
### 6. `roadmap.md` — Unit Extraction Roadmap

```markdown
# Monorepo Extraction Roadmap

Ordered by extraction priority (dependency depth, coupling score, risk).

- [ ] **module-a** — lowest coupling, no dependents, good first extraction
- [ ] **module-b** — depends on module-a interface only
- [ ] **module-c** — shared data layer, extract after module-b
- [ ] **module-d** — core services, highest coupling, extract last
```

Checkbox format so orchestrate can track completion. Module names and descriptions are populated from the Phase 4 synthesis results.

### 7. Single-Unit Spec — First Extraction Unit

Detailed analysis for the first unchecked module only. Contains: module boundary, files to extract, dependencies to sever, interface to expose, expected import rewrites.

Written as a normal spec at `docs/superpowers/specs/YYYY-MM-DD-extract-<module>-design.md` with **Status: Draft** that enters the orchestrate cycle at Step 2.

The full Phase 4 run always produces both the roadmap and the first-unit spec directly — `--next-unit` is only used for subsequent units (units 2+).
```

- [ ] **Step 11: Add --next-unit mode section**

Add the following section after the Error Handling section (before Progressive Disclosure Schedule):

```markdown
---

## --next-unit Mode

Trigger: invoked when a unit roadmap exists (`docs/monorepo-strategy/roadmap.md`) with unchecked items and the previous unit is finalized.

**Behavior:**

1. Read the roadmap, identify next unchecked unit
2. Read the immediately prior extraction spec only (the most recently completed unit's spec — not all prior specs) for context on what was learned. The prior spec is the last checked item (`[x]`) immediately before the next unchecked item (`[ ]`) in roadmap checkbox order. Match to `docs/superpowers/specs/` by unit name substring in filename.
3. Run a lightweight dependency scan limited to the next unit's file set and its direct imports. Re-read `docs/monorepo-strategy/dependency-matrix.md`: read the row and column corresponding to the next unit to identify its direct dependencies and dependents. Do NOT re-run the full 4-phase analysis.
4. Produce a single-unit spec for the next module at `docs/superpowers/specs/YYYY-MM-DD-extract-<module>-design.md` with **Status: Draft**.

Skips the full 4-phase analysis — uses existing strategy docs as context.

**Error handling:**

| Scenario | Behavior |
|---|---|
| No unchecked items in roadmap | Print "All units in the roadmap are complete. Nothing to extract." and exit. |
| Missing roadmap file | Print "No roadmap found at the expected path. Run the full analysis first to generate a roadmap." and exit. |
| Missing prior unit's spec/plan artifacts | Warn "Prior unit artifacts not found — proceeding without prior context." Continue with step 2 skipped. |
| Spec already exists for next unit AND Status is not `finalized` | Print "A spec for `<next-unit>` already exists. Resume the orchestrate cycle for that unit instead of regenerating." and exit. |
| Spec already exists for next unit AND Status IS `finalized` | Proceed normally (treat as not yet started for --next-unit purposes). |
```

- [ ] **Step 12: Commit**

```bash
git add ai-dev-tools/skills/refactor-to-monorepo/SKILL.md
git commit -m "refactor(refactor-to-monorepo): roadmap + single-unit spec output, add --next-unit mode, remove implement-plan refs"
```

---

### Task 6: Update refactor-to-layers — Roadmap + Single-Unit Spec + --next-unit

**Files:**
- Modify: `ai-dev-tools/skills/refactor-to-layers/SKILL.md`

This task covers spec sections 2.3 (Serena verification) and 2.4 (refactor-to-layers changes).

- [ ] **Step 1: Verify zero Serena references**

```bash
grep -i "serena\|find_referencing_symbols\|rename_symbol\|replace_content" ai-dev-tools/skills/refactor-to-layers/SKILL.md
```

Expected: zero matches.

- [ ] **Step 2: Add --next-unit to help-text block**

Find:
```
<help-text>
refactor-to-layers — Enforce layered architecture within modules

USAGE
  /refactor-to-layers

EXAMPLES
  /refactor-to-layers                Analyze or scaffold layer structure
</help-text>
```

Replace with:
```
<help-text>
refactor-to-layers — Enforce layered architecture, produce unit roadmap

USAGE
  /refactor-to-layers [--next-unit]

FLAGS
  --next-unit   Generate spec for next unchecked unit in roadmap

EXAMPLES
  /refactor-to-layers                Analyze or scaffold layer structure
  /refactor-to-layers --next-unit    Produce spec for next layer extraction unit
</help-text>
```

- [ ] **Step 3: Add argument-parsing instruction after the help-text routing**

Find:
```
If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.
```

Replace with:
```
If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic. If user's arguments contain `--next-unit`, skip the main workflow and execute `--next-unit` behavior (see below).
```

- [ ] **Step 4: Update Phase 3 Scaffolding output to include roadmap + single-unit spec**

In the ANALYZE Mode → Phase 3: Scaffolding section, after the existing numbered items (1. Strategy spec, 2. Structural tests, 3. Provider interfaces, 4. Composition root), add:

```markdown
5. **Roadmap** — write to `docs/layer-architecture/roadmap.md`. Checkbox-formatted ordered list of layers (bottom-up: Types, Config, Data, Service, Providers, API, UI), each entry listing the layer name and a one-line rationale.

   ```markdown
   # Layer Architecture Roadmap

   Ordered bottom-up by layer hierarchy (extract lowest layers first).

   - [ ] **types** — foundational type definitions, no dependencies
   - [ ] **config** — configuration loading, depends only on types
   - [ ] **data** — data access layer, depends on types + config
   - [ ] **service** — business logic, depends on types + config + data
   - [ ] **providers** — cross-cutting concern interfaces
   - [ ] **api** — API endpoints, depends on service + providers
   - [ ] **ui** — UI components, depends on api + providers
   ```

6. **Single-unit spec** — detailed analysis for the first unchecked layer. Contains: layer boundary definition, files belonging to this layer, dependency violations to resolve (imports that cross layer boundaries downward), provider interfaces to introduce, expected import rewrites. Written at `docs/superpowers/specs/YYYY-MM-DD-layer-<layer-name>-design.md` with **Status: Draft**.

Note: Roadmap and single-unit spec are only produced in ANALYZE mode Phase 3. SCAFFOLD mode is unchanged.
```

- [ ] **Step 5: Update Phase 4 checkpoint message**

Find:
```
2. Checkpoint prompt: "I've generated the layer architecture spec, structural tests, and provider interfaces. Review the summary at `docs/tmp/layer-summary.md`. Want to adjust anything before finalizing?"
```

Replace with:
```
2. Checkpoint prompt: "I've generated the layer architecture spec, structural tests, provider interfaces, roadmap.md (ordered layer extraction list), and a single-unit spec for the first layer. Review the summary at `docs/tmp/layer-summary.md`. Want to adjust anything before finalizing?"
```

- [ ] **Step 6: Add --next-unit mode section**

Add the following section after the Error Handling section (before Progressive Disclosure Schedule):

```markdown
---

## --next-unit Mode

Trigger: invoked when a layer roadmap exists (`docs/layer-architecture/roadmap.md`) with unchecked items and the previous layer is finalized.

**Behavior:**

1. Read `docs/layer-architecture/roadmap.md`, identify next unchecked layer
2. Read the immediately prior layer spec only (the most recently completed layer's spec — not all prior specs) for context. The prior spec is the last checked item (`[x]`) immediately before the next unchecked item (`[ ]`) in roadmap checkbox order. Match to `docs/superpowers/specs/` by layer name substring in filename.
3. Run a lightweight dependency scan limited to the next layer's file set and its direct cross-layer imports. Re-read the file-to-layer mapping section of `docs/layer-architecture/strategy.md` to identify which files belong to the next layer, and read the violation allowlist section of that file for any permitted cross-boundary imports. Do NOT re-run the full analysis.
4. Produce a single-unit spec at `docs/superpowers/specs/YYYY-MM-DD-layer-<layer-name>-design.md` for the next layer with **Status: Draft**.

The layer hierarchy (Types > Config > Data > Service > Providers > API > UI) provides natural ordering — extract bottom-up. The roadmap is pre-ordered bottom-up at initial generation time. `--next-unit` always picks the next unchecked item in roadmap checkbox order; it does not re-derive order from the layer hierarchy at invocation time.

**Error handling:**

| Scenario | Behavior |
|---|---|
| No unchecked items in roadmap | Print "All units in the roadmap are complete. Nothing to extract." and exit. |
| Missing roadmap file | Print "No roadmap found at the expected path. Run the full analysis first to generate a roadmap." and exit. |
| Missing prior unit's spec/plan artifacts | Warn "Prior unit artifacts not found — proceeding without prior context." Continue with step 2 skipped. |
| Spec already exists for next unit AND Status is not `finalized` | Print "A spec for `<next-unit>` already exists. Resume the orchestrate cycle for that unit instead of regenerating." and exit. |
| Spec already exists for next unit AND Status IS `finalized` | Proceed normally (treat as not yet started for --next-unit purposes). |
```

- [ ] **Step 7: Commit**

```bash
git add ai-dev-tools/skills/refactor-to-layers/SKILL.md
git commit -m "refactor(refactor-to-layers): add roadmap + single-unit spec output, add --next-unit mode"
```

---

### Task 7: Update Orchestrate — Iteration Awareness (Steps 1/5/8 + Conditional Loading)

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md`

This task covers spec section 2.6 (orchestrate iteration awareness).

- [ ] **Step 1: Add refactor roadmap check to Step 1 — Brainstorm**

Find the Step 1 line:
```
**Step 1 — Brainstorm:** No spec in `docs/superpowers/specs/` for current feature. Check `tmp/current-roadmap.md` for next item. Invoke `superpowers:brainstorming`. Edge: superpowers plugin missing -> warn, offer manual spec creation.
```

Append after it:

```markdown

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
```

- [ ] **Step 2: Add refactor conditional branch to Step 5 — Implement**

Find the Step 5 line:
```
**Step 5 — Implement:** Plan exists, not all checkboxes `[x]`. Read references/implementation-step.md: generate task graph, execution model recommendation, dispatch with overrides. Edge: all `[x]` -> skip to Step 6.
```

Replace with:
```
**Step 5 — Implement:** Plan exists, not all checkboxes `[x]`. If the current feature is a refactor unit (matched via roadmap check): skip execution model selection, execute directly using `references/refactor-execution.md` following Pre-flight → File Operations → Verification. Otherwise: Read references/implementation-step.md: generate task graph, execution model recommendation, dispatch with overrides. Edge: all `[x]` -> skip to Step 6.
```

- [ ] **Step 3: Add refactor roadmap marking to Step 8 — Complete**

Find the line that ends the Step 8 description (the one ending with `"What's next?"`):
```
- **Phase 2 (post-confirmation):** Update hint to `finalized` -> Read references/quality-gates.md -> compute baselines -> update roadmap -> recommendations -> "What's next?"
```

Append after that line:

```markdown

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
```

- [ ] **Step 4: Add refactor-execution.md to Conditional Loading section**

Find the Conditional Loading section. After the existing entries, add:

```markdown
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
```

- [ ] **Step 5: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "feat(orchestrate): add refactor iteration awareness to Steps 1/5/8 and conditional loading"
```

---

### Task 8: Update Help Skill

**Files:**
- Modify: `ai-dev-tools/skills/help/SKILL.md`

This task covers spec section 2.7.

- [ ] **Step 1: Remove implement-plan and update refactor descriptions**

Find:
```
  /refactor-to-monorepo     Analyze monolith for monorepo extraction
  /refactor-to-layers       Enforce layered architecture within modules
  /implement-plan           Execute a restructuring plan
```

Replace with:
```
  /refactor-to-monorepo     Analyze monolith, produce unit extraction roadmap
  /refactor-to-layers       Enforce layered architecture, produce unit roadmap
```

- [ ] **Step 2: Commit**

```bash
git add ai-dev-tools/skills/help/SKILL.md
git commit -m "docs(help): remove implement-plan, update refactor skill descriptions"
```

---

### Task 9: Final Verification Against Success Criteria

- [ ] **Step 1: Verify Part 1 success criteria**

```bash
# full-scan.md deleted
test ! -f ai-dev-tools/skills/orchestrate/references/full-scan.md && echo "PASS: full-scan.md deleted" || echo "FAIL"

# Zero full-scan references in orchestrate
count=$(grep -ci "full.scan\|full scan\|Full Scan Fallback" ai-dev-tools/skills/orchestrate/SKILL.md 2>/dev/null || echo "0")
echo "full-scan refs in orchestrate: $count (expected 0)"

# Session-handoff asks before git log
grep -c "Want me to check recent git history" ai-dev-tools/skills/session-handoff/SKILL.md

# Session-handoff never runs git diff --stat or git log -20
grep -c "git diff --stat\|git log --oneline -20" ai-dev-tools/skills/session-handoff/SKILL.md
```

- [ ] **Step 2: Verify Part 2 success criteria**

```bash
# implement-plan deleted
test ! -d ai-dev-tools/skills/implement-plan && echo "PASS: implement-plan deleted" || echo "FAIL"

# refactor-execution.md exists with required sections
grep -c "## File Operations\|## Pre-flight\|## Verification\|### Per-stack patterns" ai-dev-tools/skills/orchestrate/references/refactor-execution.md

# Zero Serena in refactor skills
grep -ci "serena" ai-dev-tools/skills/refactor-to-monorepo/SKILL.md ai-dev-tools/skills/refactor-to-layers/SKILL.md 2>/dev/null || echo "0"

# Roadmap + single-unit in refactor-to-monorepo
grep -c "roadmap.md\|single-unit\|--next-unit" ai-dev-tools/skills/refactor-to-monorepo/SKILL.md

# Roadmap + single-unit in refactor-to-layers
grep -c "roadmap.md\|single-unit\|--next-unit" ai-dev-tools/skills/refactor-to-layers/SKILL.md

# Orchestrate Step 1 suggests next unit
grep -c "Next unit:" ai-dev-tools/skills/orchestrate/SKILL.md

# Orchestrate Step 5 loads refactor-execution.md
grep -c "refactor-execution.md" ai-dev-tools/skills/orchestrate/SKILL.md

# Orchestrate Step 8 marks completed units
grep -c "Mark the completed unit" ai-dev-tools/skills/orchestrate/SKILL.md

# Help no longer lists implement-plan
grep -c "implement-plan" ai-dev-tools/skills/help/SKILL.md
```

Expected: implement-plan count in help = 0. All other counts > 0.
