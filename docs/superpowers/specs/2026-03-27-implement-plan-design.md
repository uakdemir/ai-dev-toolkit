# Implement-Plan — Design Specification

**Date:** 2026-03-27
**Status:** Draft
**Scope:** A reusable Claude Code skill that executes restructuring strategy specs produced by refactor-to-layers — performing file moves, import rewrites, and interface extractions with verification support. Monorepo migration-plan support is a future enhancement (requires format alignment).

---

## 1. Overview

The `implement-plan` skill takes a strategy spec (produced by `/ai-dev-tools:refactor-to-layers`) and executes its restructuring steps against the actual codebase. Monorepo migration-plan support is planned as a future enhancement once the monorepo skill's output format is aligned with the structured step schema. It groups steps into natural phases (create → move → rewrite → extract), validates dependency ordering within each phase, and verifies results at the user's chosen granularity. It is Serena-aware: when the Serena MCP plugin is available, it uses semantic symbol operations for higher-confidence refactoring; otherwise it falls back to regex-based operations with explicit caveats.

### 1.1 Problem Statement

The existing analysis skills produce comprehensive strategy specs with detailed restructuring steps, but execution is manual. This creates a gap:

- **Tedious execution:** Moving files, rewriting imports, and extracting interfaces by hand is error-prone and slow
- **Ordering mistakes:** Humans may execute steps out of order, breaking imports mid-restructuring
- **Verification gaps:** Manual restructuring often skips intermediate verification, letting errors compound
- **Incomplete execution:** Large restructuring plans get partially applied and abandoned, leaving the codebase in a mixed state

### 1.2 Success Criteria

- Reads and parses strategy specs produced by refactor-to-layers (structured step format with action/source/target/affected_imports/verify fields). **Prerequisite:** refactor-to-layers must be updated to emit the structured step schema and frontmatter fields (`scope`, `layers`, `tech_stack`, `composition_root`) that implement-plan consumes. This update is part of the implementation plan for this skill.
- Groups steps into phases by action type and validates dependency ordering within each phase
- Executes all four action types: `create-folder`, `move-file`, `rewrite-import`, `extract-interface`
- In Serena mode: uses semantic symbol operations (`find_referencing_symbols`, `get_symbols_overview`) for rewrites and extractions
- In fallback mode: uses regex-based import scanning with caveats flagged in the execution report
- Verification runs at user-chosen granularity (per-step, per-phase, or end-only)
- On failure: stops, analyzes, proposes fix. User approves or rejects.
- Updates the strategy spec in place with `[DONE]` markers, enabling resume from partial execution
- Produces a throwaway execution report at `tmp/execution-report.md`

### 1.3 Scope Boundaries

**What this skill DOES:**
- Execute restructuring steps from strategy specs (file moves, import rewrites, interface extractions)
- Validate step ordering via dependency graph analysis
- Detect and classify circular dependencies, present pattern-specific resolution recommendations (advisory — resolutions are manual, not auto-executed)
- Commit per phase (batch commits, not per-file)
- Update the strategy spec to reflect execution progress
- Resume from partially-executed strategy specs

**What this skill DOES NOT do:**
- Generate strategy specs — that's refactor-to-layers and refactor-to-monorepo's job
- Modify CI/CD pipelines or deployment configs
- Execute database migrations — this is code restructuring only
- Make architectural decisions — it executes decisions already approved by the user

**Post-skill human steps:**
1. Review the execution report for any regex-based rewrites flagged for manual verification (fallback mode only)
2. Apply any circular dependency resolutions recorded in the execution report's "Recommended Manual Steps"
3. Run the full test suite to confirm end-to-end correctness beyond structural verification
4. Run `/ai-dev-tools:document-for-ai` to update documentation for the new structure

### 1.4 Relationship to Other Skills

`implement-plan` is the execution counterpart to the analysis skills:

1. `/ai-dev-tools:refactor-to-monorepo` → produces `docs/monorepo-strategy/migration-plan.md` (future implement-plan support)
2. `/ai-dev-tools:refactor-to-layers` → produces `docs/layer-architecture/strategy.md`
3. **`/ai-dev-tools:implement-plan`** → executes refactor-to-layers strategy specs (monorepo support planned)
4. `/ai-dev-tools:document-for-ai` → updates docs for the new structure

---

## 2. Plugin Structure

```
ai-dev-tools/skills/implement-plan/
├── SKILL.md                          # ~250-300 lines: workflow, phases, verification
└── references/
    ├── execution-patterns.md         # per-action-type logic, Serena vs fallback, circular dep patterns
    └── verification-patterns.md      # per-stack verification commands, failure analysis, fix proposals
```

### SKILL.md Frontmatter

```yaml
---
name: implement-plan
description: "Use when the user wants to execute a restructuring strategy from refactor-to-layers, apply file moves and import rewrites from a layer strategy spec, or restructure a codebase according to an approved layer plan — even if they don't use the exact skill name."
---
```

### File Map

| File | Target Lines | Content |
|---|---|---|
| `SKILL.md` | ~250-300 | Workflow orchestration, phase execution, verification flow, resume logic |
| `references/execution-patterns.md` | ~120-150 | Per-action-type execution logic (create/move/rewrite/extract), Serena vs fallback paths, circular dependency classification and resolution patterns |
| `references/verification-patterns.md` | ~80-100 | Per-stack verification commands, failure analysis heuristics, fix proposal patterns |

### Progressive Disclosure

- After strategy spec is parsed → read `references/execution-patterns.md`
- During verification / on failure → read `references/verification-patterns.md`

---

## 3. Invocation Flow

### 3.1 Step 1 — Detect Serena Availability

Check if Serena MCP tools are available. First check whether the `get_symbols_overview` tool exists in the current session's tool list. If it exists, confirm by probing a source file within the strategy spec's scope (after Step 2 identifies the target). If the tool is not found, proceed in fallback mode.

- **If available:** Report "Serena detected — using semantic refactoring." Proceed.
- **If not available:** Warn: "Serena not detected. Without Serena, refactoring uses regex-based import rewriting which is less reliable (path aliases, barrel re-exports, and namespace conflicts may be missed). Are you sure you want to continue without Serena?" If user declines, stop and suggest configuring Serena. If user confirms, proceed in fallback mode. Flag all subsequent import rewrites in the execution report as "regex-based — verify manually."

### 3.2 Step 2 — Locate Strategy Spec

1. If the user passed an explicit path → use it
2. Auto-detect: scan for `docs/layer-architecture/strategy.md` at root level. In monorepo projects, recursively search for `*/docs/layer-architecture/strategy.md` within detected workspace package directories (using the same workspace detection heuristics from refactor-to-layers' tech-stacks.md — not hardcoded to `packages/*`)
3. If one found → use it
4. If multiple found → ask: "Found strategy specs at [paths]. Which one to execute?"
5. If none found → error: "No strategy spec found. Run `/ai-dev-tools:refactor-to-layers` first to generate one."

### 3.3 Step 3 — Parse and Validate

- Read the strategy spec's frontmatter and use each field:
  - `tech_stack`: select verification commands and Serena operation mapping
  - `layers`: validate that move-file targets correspond to recognized layer folders
  - `composition_root`: exempt from import rewrite validation (legitimately imports from all layers); update its DI wiring when new interfaces are extracted
  - `scope`: used in commit messages and execution report
- Parse the Restructuring Steps section into structured step objects
- Validate: every step has required fields (`action`, `source`, `target`, `affected_imports`, `verify`). Field semantics vary by action type:
  - `move-file`: source = current file path, target = new file path, affected_imports = files that import from source
  - `rewrite-import`: source = file containing the import, target = new import path, affected_imports = N/A (single file)
  - `extract-interface`: source = concrete class file, target = new interface file path, affected_imports = consumer files to update to import interface
  - `create-folder`: source = N/A, target = directory path, affected_imports = N/A
- Skip any steps already marked `[DONE]` (from a previous partial run). The `[DONE]` marker is prepended to the step's action line: e.g., `[DONE] action: move-file` (before) vs `action: move-file` (after). This format is used consistently for both marking and parsing.
- Report: "Found N restructuring steps (M already completed). Resuming from step M+1." or "Found N restructuring steps across K action types."

### 3.4 Step 4 — Check Git State

- Run `git status` to check for uncommitted changes
- If dirty: "Uncommitted changes detected. Commit or stash before running implement-plan." Stop.
- If clean: proceed

### 3.5 Step 5 — Pre-flight Validation

Before execution, validate all paths referenced in remaining steps:

1. **Source existence:** confirm all source paths exist. Report missing: "N of M source files exist. 2 files not found: [paths]."
2. **Target collisions:** confirm no target paths already exist. For each collision:
   - `move-file` target exists → warn: "Target [path] already exists. Overwrite or stop?"
   - `extract-interface` target exists → warn: "Interface file [path] already exists. Overwrite or stop?"
   - `create-folder` target exists → proceed silently (idempotent)
   - Note: "skip" is not offered because skipping a move-file invalidates downstream rewrite-import steps that depend on the moved file's new location.
3. Report all discrepancies upfront. User decides: overwrite all, overwrite specific items, or stop.

### 3.6 Step 6 — Ask Verification Granularity

> "How often should I verify?"
> 1. After each step (safest, slowest)
> 2. After each phase (recommended)
> 3. At the end only (fastest, riskiest)

Default: option 2.

### 3.7 Step 7 — Execute Phases

Group steps by action type into four phases, execute sequentially. See Section 4.

---

## 4. Execution Phases

Steps are grouped by action type into phases. Within each phase, steps are dependency-ordered.

### 4.1 Phase 0: Preparation (`create-folder` actions)

- Create all target directories needed by subsequent phases
- Dependency ordering: parent directories before children (e.g., `src/data/` before `src/data/repositories/`)
- Verification: check directories exist
- Commit: `refactor: create folder structure (prepare phase)`

### 4.2 Phase 1: Move (`move-file` actions)

- Move files to their target layer/module folders
- Dependency ordering: if file B imports from file A and both are being moved, move A first
- **Serena mode:** use `find_referencing_symbols` before moving to capture the full reference graph. Move file. Phase 2 handles import rewrites using the captured graph.
- **Fallback mode:** `git mv` the file
- Verification: all source files gone from old locations, present in new locations
- Commit: `refactor: move N files to target locations (move phase)`

### 4.3 Phase 2: Rewrite (`rewrite-import` actions)

- Update import paths in all affected files to reflect new locations from Phase 1
- Dependency ordering: files with the most consumers first (fix the most-imported files early so files that depend on them can resolve their imports correctly)
- **Serena mode:** use `find_referencing_symbols` to locate all files that reference symbols from the moved file, then update the import paths in those files. Symbol names remain unchanged — only the module path is rewritten. Precise, handles aliases and re-exports correctly. (Note: `rename_symbol` is for renaming symbols, not import paths. Defer exact Serena operation mapping to `references/execution-patterns.md`.)
- **Fallback mode:** regex scan for old import paths, replace with new paths. Read `tsconfig.json` paths (Node.js), namespace mappings (.NET), or package structure (Python) to resolve aliases. Flag unresolved aliases in the execution report as "regex-based — verify manually."
- Verification: run the strategy spec's verify command (typically `tsc --noEmit`, `dotnet build`, or `python -c "import app"`)
- Commit: `refactor: rewrite imports for new structure (rewrite phase)`

### 4.4 Phase 3: Extract (`extract-interface` actions)

Before executing extractions, run pre-Phase 3 validation (see Section 5).

- Extract interfaces for provider patterns: create the interface file, update the concrete class to implement it, update consumers to depend on the interface
- Dependency ordering: interfaces with fewer consumers first (simpler extractions build confidence)
- **Serena mode:** use `get_symbols_overview` to read the class's public API, create the interface, use `find_referencing_symbols` to update all consumers to import the interface instead of the concrete class
- **Fallback mode:** read the source file, extract public method signatures, create interface file, regex-replace direct imports with interface imports in consumer files
- Verification: type-check / build passes
- Commit: `refactor: extract provider interfaces (extract phase)`

### 4.5 Verification Flow

| User's Choice | When Verification Runs |
|---|---|
| Per-step | After each individual step within each phase |
| Per-phase (default) | After all steps in a phase complete |
| End-only | After Phase 3 completes |

**On failure at any point:**
1. Stop execution
2. Analyze the failure output (build error, type error, missing import)
3. Propose a specific fix with the exact code change
4. User approves → apply fix, re-verify
5. User rejects → leave current state, report what was completed vs remaining

---

## 5. Pre-Phase 3: Circular Dependency Resolution

Before executing any `extract-interface` steps, scan the codebase (post-Phase 1 and 2) for circular dependencies among the files involved in extraction.

### 5.1 Detection

For each file involved in an `extract-interface` step, trace its import graph:
- **Serena mode:** `find_referencing_symbols` for precise cross-references
- **Fallback mode:** regex-based import scanning

Flag any circular references: A imports B and B imports A.

### 5.2 Classification

Classify each circular dependency by reading the code at both ends. Assign a confidence level (high/medium/low) to each classification. If the pattern is ambiguous, classify as "unclassified" and present without a proposed resolution — the user must decide.

**Classification heuristics:**
- **Callback:** B receives A's function/method as a parameter, or B calls a single void method on A with no return value used
- **Shared operation:** Both A and B call the same function/method with similar arguments
- **Bidirectional data flow:** A reads a property/field from B, and B reads a property/field from A
- **Misplaced responsibility:** One side has a single usage of the other that could be inlined or moved

| Pattern | What's Happening | Resolution |
|---|---|---|
| **Callback/notification** | A calls B, B calls back to A to notify of completion | Replace with callback parameter. B receives a function instead of importing A. No interface extraction needed. |
| **Shared operation** | Both A and B need the same operation | Extract the shared operation into a lower layer that both can depend on. Move actual code, not just an interface. |
| **Bidirectional data flow** | A reads from B, B reads from A | One side should own the data. The other receives it as a parameter. |
| **Misplaced responsibility** | Code in A actually belongs in B (or vice versa) | Move the code to the correct layer. The circular dep disappears. |

### 5.3 User Decision (Batch)

Present all circular dependencies as a numbered table with classified patterns and proposed resolutions:

```
Found N circular dependencies to resolve before extraction:

| # | Cycle | Pattern | Proposed Resolution |
|---|---|---|---|
| 1.1 | userRepo ↔ authService | Callback | Add onAuthComplete callback parameter to userRepo |
| 1.2 | orderRepo ↔ billingService | Shared operation | Extract calculateTotal() to shared utils in Data layer |
| 1.3 | notifyService ↔ emailService | Misplaced responsibility | Move template logic from notifyService to emailService |

All circular dependency resolutions are **advisory** — they are recorded in the execution report
as recommended manual steps, not auto-executed. The resolution patterns (callback, shared operation,
bidirectional data flow, misplaced responsibility) involve code edits outside the declared action
model (create/move/rewrite/extract) and cannot be safely automated.

Options per item:
  (1) Acknowledge — record the suggested resolution in the execution report's "Recommended Manual Steps" section
  (2) Dismiss — ignore this circular dependency (proceed with extract-interface and accept potential issues)

Respond in bulk: "1 for all", "2 for all", "1 for 1.1, 1.2 and 2 for the rest", etc.
```

- Items assigned option 1: recorded in execution report's "Recommended Manual Steps" with the classified pattern and proposed resolution. The user applies these resolutions manually before or after Phase 3.
- Items assigned option 2: dismissed, not recorded. Phase 3 proceeds with extract-interface steps as planned — any resulting issues surface during verification.

### 5.4 Post-Classification Flow

Circular dependency resolutions are advisory — they are **not auto-executed**. After classification and user acknowledgment:

1. Acknowledged resolutions are recorded in the execution report's "Recommended Manual Steps" section with the classified pattern, affected files, and proposed fix.
2. Phase 3 proceeds with the planned `extract-interface` steps regardless of unresolved circular dependencies.
3. If an `extract-interface` step fails verification due to an unresolved circular dependency, the failure analysis references the pre-Phase 3 classification: "This failure may be caused by the circular dependency between [A] and [B] identified earlier. Consider applying the recommended resolution ([pattern]: [fix]) before retrying."

---

## 6. Resume / Re-run Behavior

### 6.1 Partial Execution Resume

**Mid-phase failure handling:** If execution fails mid-phase, commit the steps completed so far within that phase (partial phase commit) and mark them `[DONE]`. This ensures resume can skip already-completed steps even within an interrupted phase.

When invoked on a strategy spec with `[DONE]` markers:
1. Skip completed steps
2. Detect filesystem state for remaining steps — if a step's source is gone but target exists, mark `[DONE]` automatically (reconcile with manual changes)
3. Report: "Found N total steps, M already completed. Resuming from step M+1."
4. Re-validate the dependency graph for remaining steps (codebase state may have changed)
5. Ask verification granularity fresh (don't assume previous choice)
6. Execute remaining phases

### 6.2 Fully Executed Spec

All steps marked `[DONE]`. Report: "All restructuring steps are complete. Nothing to execute." Stop.

### 6.3 Codebase Changed Between Runs

If a remaining step's `source` path doesn't exist:
- Check if the file already exists at the `target` path (manually moved) → mark `[DONE]`, skip
- If at neither path → stop: "Step N references [source] which no longer exists. Re-run the analysis skill to generate an updated strategy spec."

---

## 7. Output Artifacts

### 7.1 Updated Strategy Spec (in place)

The original strategy spec is updated:

| Section | Update |
|---|---|
| Restructuring Steps | Completed steps marked `[DONE]` |
| File Mapping | Updated to reflect new file paths |
| Violations | Resolved violations removed |
| Limitations | New limitations appended (regex caveats, unresolved circular deps noted) |
| Frontmatter `generated` | Updated to execution date (created if absent — this field is produced by refactor-to-layers but implement-plan ensures it exists) |

This enables resume: re-running `implement-plan` skips `[DONE]` steps.

### 7.2 Execution Report

Written to `tmp/execution-report.md`. Throwaway review document.

Header: "Generated from implement-plan execution on [date] — this is a one-time report, not a source of truth"

Contents:
- Execution mode (Serena or fallback)
- Verification granularity chosen
- Per-phase summary: steps attempted, completed, failed
- Circular dependencies classified (pattern, confidence, recommended resolution)
- Files moved (old path → new path table)
- Imports rewritten (count per file, Serena vs regex)
- Interfaces extracted (name, source class, consumers updated)
- Failures and how they were resolved
- Recommended manual steps (acknowledged circular dep resolutions, unverified regex rewrites)

---

## 8. Error Handling

| Scenario | Behavior |
|---|---|
| No Restructuring Steps section in spec | Error: "Strategy spec missing Restructuring Steps." Stop. |
| Step missing required fields | Error: "Step N is malformed — missing [field]." Stop. |
| Source gone, target exists | File was manually moved. Mark `[DONE]`, skip, note in report. |
| Source gone, target also gone | Stop, suggest re-running the analysis skill. |
| Target directory missing during move | Create it automatically (defensive fallback). |
| Regex matches multiple import candidates (fallback mode) | List candidates, ask user to confirm which to rewrite. |
| Build/type-check fails after Phase 2 | Analyze error output. If missed import, propose fix. If deeper issue, report and let user decide. |
| Circular dependencies in pre-Phase 3 | Classify pattern, propose resolution (advisory only — not auto-executed). User acknowledges or dismisses per-item. Acknowledged resolutions recorded in execution report's "Recommended Manual Steps." |
| Extract-interface fails due to circular dep | Reference the pre-Phase 3 classification in failure analysis. Suggest applying the recommended manual resolution before retrying. |
| Serena connection drops mid-execution | Pause, attempt reconnect. If fails: "Continue in fallback mode or stop?" |
| Git working tree dirty before start | "Uncommitted changes detected. Commit or stash first." Stop. |
| Tech stack mismatch between spec and project | Warn: "Spec says [stack] but project appears to be [other]. Continue?" |
| All steps already `[DONE]` | "All steps complete. Nothing to execute." Stop. |
| Partial execution from previous run | Skip `[DONE]` steps, re-validate dependency graph, resume. |

---

## 9. Design Decisions & Rationale

| Decision | Rationale |
|---|---|
| Phased execution (create → move → rewrite → extract) with dependency ordering within phases | Natural restructuring workflow. Creates meaningful batch commits. Prevents cross-phase dependency issues (e.g., moving files before creating target dirs). |
| Serena strongly recommended, not mandatory | Semantic operations are significantly more reliable than regex for import rewriting and interface extraction. But the skill should work everywhere — fallback mode with caveats is better than refusing to run. |
| User-chosen verification granularity | Monorepo restructuring is high-risk (verify often). Layer restructuring within a small module is lower risk (batch is fine). User knows their comfort level. |
| Stop + analyze + propose fix on failure | Auto-rollback is too aggressive (fix may be trivial). Stop without analysis wastes the AI's capability. Proposing a fix gives the user information and control. Per-phase commits enable manual rollback via `git revert` if needed, but the skill does not automate rollback. |
| Commit per phase, not per step | File moves are mechanical — per-file commits flood history with noise. Phase-level commits are meaningful ("moved 12 files to layer folders") and align with the user's preference for informative small commits without noise. |
| Strategy spec updated with `[DONE]` markers | Enables natural resume from partial execution. The spec becomes a living document that tracks progress. |
| Circular dependency classification (4 patterns, advisory-only) | Mechanical interface extraction often creates new violations. Pattern-specific resolutions (callback, shared operation, data flow, misplaced responsibility) address root causes rather than symptoms. Resolutions are advisory because they involve code edits outside the declared action model (create/move/rewrite/extract) and cannot be safely automated. |
| Batch decision for circular deps | Per-file back-and-forth is tedious. Presenting all conflicts in one table with bulk response syntax respects the user's time. |
| No dry-run mode | The user already reviewed and approved the strategy spec. Another preview pass is redundant ceremony. Verification-after-phase provides natural pause points. |
| Auto-detect strategy spec with override | Frictionless for the common case (one spec exists). Explicit path handles edge cases. |
| Dirty working tree check | Uncommitted changes mixed with restructuring makes rollback impossible. Clean state is a prerequisite. |
