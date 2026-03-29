---
name: implement-plan
description: "Use when the user wants to execute a restructuring strategy from refactor-to-layers or a monorepo migration plan from refactor-to-monorepo, apply file moves and import rewrites from a layer strategy spec or monorepo migration plan, or restructure a codebase according to an approved plan — even if they don't use the exact skill name."
---

<help-text>
implement-plan — Execute a restructuring plan

USAGE
  /implement-plan

EXAMPLES
  /implement-plan                    Auto-detect and execute latest plan
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

# implement-plan

Execute restructuring plans produced by refactor-to-layers (layer strategy specs) or refactor-to-monorepo (monorepo migration plans). Auto-detects plan type by content. For layer specs: groups steps into phases (create → move → rewrite → extract) with dependency ordering. For monorepo plans: executes Phase 0 (workspace preparation) followed by Phase 1-N (module extraction) with per-phase checkpoints. Serena-aware for semantic refactoring, with regex fallback.

## Workflow Overview

Execute these steps in order. Each step feeds into the next:

1. **Detect Serena Availability** — determine if semantic refactoring tools are present.
2. **Locate Strategy Spec** — find or accept the strategy spec path.
3. **Parse and Validate** — extract frontmatter, restructuring steps, and action counts.
4. **Check Git State** — require a clean working tree.
5. **Pre-flight Validation** — verify sources exist and targets don't collide.
6. **Ask Verification Granularity** — choose per-step, per-phase, or end-only.
7. **Execute Phases** — group by action type and execute sequentially.

Reference files used throughout (do not inline their content — read them at the indicated step):

- `references/execution-patterns.md` — action-type execution procedures, Serena/fallback paths, dependency ordering
- `references/verification-patterns.md` — pre-flight checks, per-stack verification commands, failure analysis

---

## Step 1: Detect Serena Availability

Check whether the `get_symbols_overview` tool is available.

| Result | Action |
|--------|--------|
| Available | Proceed. Confirm Serena works by probing a file within strategy scope after Step 2. |
| Not available | Warn: "Serena is not available. Import rewrites will use regex matching, which may miss dynamic imports or aliased re-exports." Ask: "Are you sure you want to continue without Serena?" |

---

## Step 2: Locate Strategy Spec

Three detection paths, in order:

1. **Explicit path** — if the user provided a path, use it directly.
2. **Auto-detect** — look for both:
   - `docs/layer-architecture/strategy.md` (layer strategy spec)
   - `docs/monorepo-strategy/migration-plan.md` (monorepo migration plan)
   at the project root. Also search recursively in workspace package directories for the same relative paths.
3. **Selection** — one found → use it. Multiple found → present list and ask. None found → error: "No plan found. Run `/ai-dev-tools:refactor-to-layers` or `/ai-dev-tools:refactor-to-monorepo` first to generate one."

If Serena was detected in Step 1, probe a source file from the strategy scope to confirm Serena is functional.

### Format Detection

After the plan file is located, detect its format by content:

1. **Layer strategy spec** (check first — unambiguous): identified by YAML frontmatter containing `tech_stack`, `layers`, or `composition_root`, OR by structured step entries with `action: move-file` / `action: rewrite-import` / `action: extract-interface`.
2. **Monorepo migration plan**: identified by `## Phase N:` headings or `**Phase N:**` bold markers in the document body. Also match resume markers like `## [DONE] Phase N:`. The `## Phase N:` heading format is anticipated from AI formatting behavior; `**Phase N:**` is the contractual format from refactor-to-monorepo.
3. **Neither** → error: "Unrecognized plan format. Expected a refactor-to-layers strategy spec or a refactor-to-monorepo migration plan."

### Serena Warning for Monorepo Plans

Evaluated after format detection (plan type is only known after this point), before Step 3.

**Layer plans:** unchanged — existing warning and confirmation prompt from Step 1 applies.

**Monorepo plans:** if Serena is not available, present a stronger warning requiring explicit user choice:

```
WARNING: Serena is strongly recommended for monorepo migration.

Cross-package import rewrites are higher risk without semantic tools.
Regex fallback may miss aliased imports, re-exports, and dynamic
imports across package boundaries.

  > Install Serena and continue
  > Proceed without Serena (I accept the risk)
```

The user must explicitly choose before execution begins.

---

## Step 3: Parse and Validate

The parsing path depends on the format detected in Step 2.

### Layer Strategy Spec Parsing

Read the strategy spec and extract:

- **Frontmatter fields:**
  - `tech_stack` → determines verification commands.
  - `layers` → validate that target layers exist.
  - `composition_root` → exempt from import rewrites.
  - `scope` → used in commit messages.

- **Restructuring Steps:** parse the step list from the spec body. Every step must have five fields: `action`, `source`, `target`, `affected_imports`, `verify`. Field semantics vary by action type:

| Action | source | target | affected_imports | verify |
|--------|--------|--------|------------------|--------|
| `move-file` | Current file path | New file path | Files that import from source | Command to check move succeeded |
| `rewrite-import` | File containing the import | New import path | N/A (single file) | Build/type-check command |
| `extract-interface` | Concrete class file | New interface file path | Consumer files to update | Build/type-check command |
| `create-folder` | N/A | Directory path | N/A | Directory existence check |

- **Validation rules:**
  - Every step must have a valid action type and all required fields for that type (N/A fields may be empty).
  - Malformed steps → error with step number and missing field. Do not proceed.

- **Skip completed:** steps prefixed with `[DONE]` are skipped. Report: "Found N total steps: X remaining, Y already completed."

### Monorepo Migration Plan Parsing

When format detection identifies a monorepo migration plan, parse it into a structured internal model.

**Parsing algorithm:**

1. **Identify phases** — scan for `## Phase N:` headings, `**Phase N:**` bold markers, or resume markers (`## [DONE] Phase N:`, `[DONE] **Phase N:**`). Match using keyword matching (case-insensitive), not exact heading format.
2. **Phase 0 (Preparation)** — extract using keyword matching (case-insensitive, matching in any heading, bold marker, or numbered list item):
   - Workspace config details (keywords: `workspace`, `monorepo configuration`)
   - Shared library file list (keywords: `shared library`, `shared/ candidates`, `files to move`)
   - Import paths to update (keywords: `import paths`, `update all import`)
3. **Phases 1-N (Module Extraction)** — extract per phase using keyword matching:
   - Module name (from the phase text, e.g., "Phase 1: Extract auth module" → "auth")
   - Files to move (keyword: `files to move` — lines matching `- path/to/file` or `  path/to/file` under the matched keyword)
   - Imports to update (keyword: `imports to update`)
   - Config changes (keyword: `configuration changes`)
   - Verification commands (keywords: `tests to verify`, `verify`, `checkpoint`)

**Note:** The upstream refactor-to-monorepo uses numbered list items (`1. Files to move`, `2. Imports to update`) not sub-section headings. The parser matches on content keywords rather than requiring exact heading format.

**Internal data model (per phase):**

```
{
  phase_number: number,           // 0 for preparation, 1-N for modules
  phase_name: string,             // e.g., "Preparation", "Extract auth module"
  module_name: string | null,     // null for Phase 0, module name for 1-N
  target_package_path: string | null, // extracted from migration plan file-move targets if present; otherwise derived per-stack:
                                  //   Node.js = packages/{name}
                                  //   Python  = packages/{name}
                                  //   .NET    = {name}/
                                  // Phase 0 shared = shared/ or packages/shared
  files_to_move: [
    { source: string, target: string }
  ],
  imports_to_update: [
    { old_path: string, new_path: string }
  ],
  config_changes: [string],       // free-form instructions from migration plan
  verification: [string],         // test commands or descriptions
  status: "pending" | "done"      // for resume support
}
```

**Validation:**

- Phase 0 must exist.
- Each Phase 1-N must have at least one file to move. Phase 0 is valid with or without files to move (it may consist solely of workspace configuration).
- File paths must be valid relative paths.
- Unparseable phase → stop execution at that phase. Do not skip — later phases may depend on earlier ones.

---

## Step 4: Check Git State

Require a clean working tree. If uncommitted changes exist, stop: "Uncommitted changes detected. Commit or stash before proceeding — mixing plan changes with existing changes makes rollback unreliable."

---

## Step 5: Pre-flight Validation

Read `references/verification-patterns.md` for the full pre-flight procedure.

### Layer Plan Pre-flight

1. **Source existence** — check every remaining step's source path. Report all missing sources at once (do not fail on the first one).
2. **Target collisions** — for `move-file` and `extract-interface`, check if the target already exists. Prompt: overwrite or stop. No skip option — skipping invalidates downstream steps. `create-folder` targets are idempotent. `rewrite-import` has no collision concept.

### Monorepo Plan Pre-flight

In addition to source-file existence checks:

1. **Target package directories** — should NOT already exist (unless resuming). If they do: "Package `{name}` already exists at `{path}`. This looks like a partial previous run. Resume or abort?"
2. **Workspace root writable** — verify write access to the workspace root directory.
3. **Source files exist** — for each phase, all source files listed in "Files to move" must exist at their current paths. Report all missing sources at once.
4. **No cross-phase target collisions** — verify no two phases attempt to create the same target package or move files to the same target path.

On validation failure: "abort or adjust plan" (no skip option — later phases may depend on earlier ones).

---

## Step 6: Ask Verification Granularity

Present three options:

1. **Per-step** — verify after every action. Slowest, safest.
2. **Per-phase** (default) — verify after each phase completes. Recommended balance.
3. **End-only** — verify once after all phases. Fastest, riskiest.

**Monorepo plan mapping:**

| Option | Layer plan meaning | Monorepo plan meaning |
|--------|--------------------|-----------------------|
| Per-step | After each individual file move/rewrite | After each individual file move within a module extraction |
| Per-phase | After each action-type phase (all moves, all rewrites) | After each monorepo phase (Phase 0, Phase 1, Phase 2...) — default recommendation |
| End-only | After all phases complete | After all monorepo phases complete |

---

## Step 7: Execute Phases

Read `references/execution-patterns.md` for detailed procedures. The execution path forks based on the detected plan type.

## Layer Plan Execution Phases

Group remaining steps by action type and execute in phase order.

Phase execution order is fixed: 0 → 1 → 2 → 3. Each phase completes fully before the next begins. Verification runs per the granularity selected in Step 6.

### Phase 0: Preparation

Execute all `create-folder` actions.

- Dependency ordering: parent directories before children.
- Idempotent — existing directories are skipped silently.
- Verification: check directories exist. No build check needed.

Commit: `refactor: create folder structure (prepare phase)`

### Phase 1: Move

Execute all `move-file` actions.

- **Serena mode:** call `find_referencing_symbols` on each source file before moving. Store the reference graph — Phase 2 uses it for precise import rewrites.
- **Fallback mode:** move without capturing references. Phase 2 will rely on regex.
- Dependency ordering: if file B imports file A and both are moving, move A first.
- After all moves, run verification if granularity permits.

Commit: `refactor: move N files to target locations (move phase)`

### Phase 2: Rewrite

Execute all `rewrite-import` actions.

- **Serena mode:** use the reference graph captured in Phase 1 to rewrite each import precisely via `replace_content` or targeted find-and-replace. (Do not use `rename_symbol` — that renames symbols, not import paths.)
- **Fallback mode:** regex match on `import`/`require`/`from` statements. Flag ambiguous matches for user resolution.
- The composition root file (from frontmatter) is exempt from automatic rewrites.
- After all rewrites, run verification if granularity permits.

Commit: `refactor: rewrite imports for new structure (rewrite phase)`

### Phase 3: Extract

Execute all `extract-interface` actions.

- Before starting, run the circular dependency advisory (see below).
- **Serena mode:** use `get_symbols_overview` to identify the public API surface, then extract interface definitions.
- **Fallback mode:** regex-based extraction of exported function/class signatures.
- After all extractions, run verification if granularity permits.

Commit: `refactor: extract provider interfaces (extract phase)`

---

## Monorepo Plan Execution Phases

For monorepo plans, Step 7 forks into a parallel execution path. The monorepo path shares individual action implementations (file moves, import rewrites) with the layer path but has different phase orchestration.

All import rewrites in monorepo plans use `rewrite-cross-package-import` (not the existing `rewrite-import`). This applies to both Phase 0 and Phases 1-N — in both cases, the target is a workspace package name.

### Phase 0: Preparation

Action sequence:

1. **create-workspace-config** — generate or update workspace config per tech stack:
   - **New standalone files** (e.g., `pnpm-workspace.yaml`, `pants.toml`): create from template. If already exists, skip (idempotent).
   - **Existing root files** (e.g., `package.json`, `pyproject.toml`, `.sln`): parse existing content, merge workspace config entries (e.g., add `"workspaces"` field to existing `package.json`). Show diff to user: "Workspace config will modify `{file}`. Review changes?" User can approve or edit.
   - Node.js: create `pnpm-workspace.yaml` OR merge `workspaces` into root `package.json`
   - Python: merge workspace config into root `pyproject.toml` (hatch) or create `pants.toml` (pants). If using plain namespace packages, skip and note: "No workspace config needed."
   - .NET: update existing `.sln` to add new project entries
   - Templates in `references/execution-patterns.md`
2. **create-package** — create the shared library package (directory + manifest with placeholder dependencies)
3. **move-files** — move identified shared code to the shared package
4. **rewrite-cross-package-import** — update all import paths referencing moved shared code to use workspace package names (Serena or regex)
5. **verify** — run build + tests, checkpoint: "All tests pass after shared extraction?"

**CI setup:** Output instructions only, do not generate CI config files:
```
Manual step: Set up CI for multi-module builds.
  - Build affected modules on PR
  - Run affected tests
  - See docs/monorepo-strategy/monorepo-tooling.md for recommendations.
```

Commit: `refactor: prepare monorepo workspace — extract shared library (Phase 0)`

### Phases 1-N: Module Extraction

One phase per module, ordered by lowest coupling score first (as specified in migration-plan.md). Within each phase:

1. **create-package** — create package directory + manifest with placeholder dependencies
2. **move-files** — move source files from monolith to new package (paths from migration plan)
3. **rewrite-cross-package-import** — update cross-package import paths:
   - **Serena mode:** `find_referencing_symbols` to find all consumers, then update import paths to use the new package name/path
   - **Fallback mode:** regex scan for import statements targeting moved files, rewrite to new package path
   - Cross-package imports use workspace package names (e.g., `@myorg/auth`) instead of relative paths
4. **update-config** — build/test config changes listed in migration plan (AI-judgment action, no deterministic algorithm)
5. **verify** — checkpoint per migration plan: "Build passes, all tests pass, no runtime errors?"

Commit: `refactor: extract {module_name} to packages/{module_name} (Phase {N})`

Do not proceed to Phase N+1 until Phase N's checkpoint passes.

---

## Commit Strategy for Monorepo Plans

**Granularity:** one commit per monorepo phase.

| Phase | Commit message template |
|-------|-------------------------|
| Phase 0 | `refactor: prepare monorepo workspace — extract shared library (Phase 0)` |
| Phase 1-N | `refactor: extract {module_name} to packages/{module_name} (Phase {N})` |
| Partial (interrupted) | `refactor: extract {module_name} (Phase {N}, partial — {action_type} complete)` |

If execution is interrupted mid-phase, commit completed actions within the phase with a `(partial)` suffix. Resume reconciles remaining actions.

---

## Resume Strategy for Monorepo Plans

### Phase-Level Resume

Mark completed phases in the migration plan using a `[DONE]` prefix after the `##` marker:

```markdown
## [DONE] Phase 0: Preparation
...
## [DONE] Phase 1: Extract auth module
...
## Phase 2: Extract billing module    <-- resume from here
...
```

### Within-Phase Resume

If interrupted mid-phase (partial commit), mark completed action groups with inline `[DONE]`:

```markdown
## Phase 2: Extract billing module

[DONE] Files to move:
  - src/billing/service.ts -> packages/billing/src/service.ts
  ...

Imports to update:                    <-- resume from here
  - src/billing/ -> @myorg/billing
  ...
```

### Filesystem Reconciliation for Monorepo

On resume, check actual filesystem state before each action:

- **create-workspace-config:** for new standalone files (pnpm-workspace.yaml), skip if exists. For existing root files (package.json, .sln), check if workspace fields were already merged — skip if present. If workspace config was intentionally skipped (e.g., namespace packages), mark as "not applicable."
- **create-package:** if package directory + manifest already exist, skip.
- **move-file:** if source doesn't exist but target does, skip (already moved).
- **rewrite-cross-package-import:** re-scan — some imports may already be rewritten.

---

## Pre-Phase 3: Circular Dependency Advisory

Before executing Phase 3, scan for circular dependencies among files involved in extract-interface steps.

**Detection:** trace import chains looking for cycles (Serena: `find_referencing_symbols`; fallback: regex scanning). Classify each cycle into one of four patterns. Assign confidence (high/medium/low) per classification.

| Pattern | What's Happening | Heuristic | Recommended Fix |
|---------|------------------|-----------|-----------------|
| Callback/notification | A calls B, B calls back to A | B receives A's function as parameter, or calls single void method on A | Replace with callback parameter |
| Shared operation | Both A and B need the same operation | Both call the same function with similar arguments | Extract shared operation to lower layer |
| Bidirectional data flow | A reads from B, B reads from A | Property/field access in both directions | One side owns the data, other receives as parameter |
| Misplaced responsibility | Code in A belongs in B (or vice versa) | One direction has only 1 call | Move the code to the correct layer |

Cycles that do not match a known pattern are classified as **unclassified** — present without a proposed resolution.

**All resolutions are advisory only — not auto-executed.** The resolution patterns involve code edits outside the declared action model (create/move/rewrite/extract) and cannot be safely automated.

**Batch decision table:** present all detected cycles in a numbered table. Options per item:
- **(1) Acknowledge** — record the suggested resolution in the execution report's "Recommended Manual Steps" section
- **(2) Dismiss** — ignore this circular dependency (proceed with extract-interface, accept potential issues)

Respond in bulk: "1 for all", "2 for all", "1 for 1.1, 1.2 and 2 for the rest", etc.

Acknowledged items are recorded for the user to apply manually. Phase 3 proceeds regardless. If an extract-interface step fails due to an unresolved circular dep, the failure analysis references the pre-Phase 3 classification.

---

## Verification Flow

When verification runs depends on the granularity selected in Step 6:

| Granularity | Verification triggers |
|-------------|----------------------|
| Per-step | After every individual action |
| Per-phase | After each phase commit |
| End-only | After all phases complete |

Read `references/verification-patterns.md` for per-stack verification commands.

**On failure:**
1. Stop execution immediately.
2. Analyze the failure — identify which step caused it and why.
3. Propose a fix (e.g., missing import, wrong path, type error).
4. Present the fix to the user. User approves → apply and re-verify. User rejects → abort or manual intervention.

---

## Resume

Execution can be resumed after a mid-phase failure or an interrupted session.

**On failure mid-phase:**

1. **Partial commit** — commit completed steps within the current phase with a `(partial)` suffix in the commit message.
2. **Mark completed** — prepend `[DONE]` to each completed step in the strategy spec and save.

**On re-run:**

1. Parse the strategy spec again. All `[DONE]` steps are skipped automatically.
2. Reconcile the filesystem — for each remaining step, check if source is gone but target exists → auto-mark `[DONE]` (manual move detected). If source is gone and target is also gone → stop and suggest re-running the analysis skill.
3. Report: "Found N total steps, M already completed. Resuming from step M+1."
4. Re-validate dependency ordering among remaining steps only.
5. Ask verification granularity fresh (do not assume the previous session's choice).
6. Resume execution from the first incomplete step in the current phase.

**Fully executed:** if all steps are marked `[DONE]`, report: "All restructuring steps are already completed. Nothing to do."

---

## Output

Two artifacts are produced:

**1. Strategy spec (updated in place):**
- `[DONE]` markers on completed steps.
- File mapping table (old path → new path) appended.
- Violations section listing any allowlisted violations.
- Limitations section noting regex-only rewrites or unresolved cycles.
- Generated date timestamp.

**2. Execution report at `tmp/execution-report.md`:**

This is a throwaway review document, not a source of truth.

- Header: `Generated from implement-plan execution on [date] — this is a one-time report, not a source of truth.`
- Phase-by-phase summary with step counts and verification results.
- File mapping table (old path → new path) for quick reference.
- Recommended Manual Steps section listing deferred circular dependencies and unresolved items from the advisory.
- Warnings section noting any regex-only rewrites, Serena fallbacks, or skipped verifications.

**Post-execution next steps** (printed to user, not written to a file):
1. Review the execution report for any regex-based rewrites flagged for manual verification (fallback mode only).
2. Apply any circular dependency resolutions recorded in "Recommended Manual Steps."
3. Run the full test suite to confirm end-to-end correctness beyond structural verification.
4. Run `/ai-dev-tools:document-for-ai` to update documentation for the new structure.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No Restructuring Steps found | Error: "Strategy spec contains no restructuring steps. Regenerate with `/refactor-to-layers`." |
| Malformed step (missing fields) | Error with line number and missing field. Do not proceed. |
| Source file missing | Report all missing sources in pre-flight. Ask: abort or adjust plan. |
| Source gone, target exists | File was manually moved. Mark `[DONE]`, skip, note in report. |
| Source gone, target also gone | Stop, suggest re-running `/ai-dev-tools:refactor-to-layers` to generate updated strategy spec. |
| Target file already exists | Prompt: overwrite or stop. No skip. |
| Target directory missing during move | Create it automatically (defensive fallback for Phase 0 gaps). |
| Regex ambiguity (multiple matches) | Flag the file and matches. Ask user to select the correct replacement. |
| Build/test fails after phase | Stop. Analyze, propose fix, wait for user decision. |
| Circular deps detected (pre-Phase 3) | Advisory only. Classify pattern, present batch table (Acknowledge/Dismiss). Acknowledged → "Recommended Manual Steps." Phase 3 proceeds regardless. |
| Extract-interface fails due to circular dep | Reference the pre-Phase 3 classification in failure analysis. Suggest applying the recommended manual resolution before retrying. |
| Serena drops mid-execution | Pause, attempt reconnect. If fails: "Continue in fallback mode or stop?" Note mode switch in execution report. |
| Dirty working tree | Block execution. Require commit or stash first. |
| Tech stack mismatch | Warn if strategy spec tech_stack does not match detected project stack. Ask to continue. |
| All steps already `[DONE]` | Report: "All steps completed. Nothing to do." |
| Partial resume (re-run after failure) | Skip `[DONE]` steps, reconcile filesystem, re-validate remaining deps. |
| Unrecognized plan format | Error: "Unrecognized plan format. Expected a refactor-to-layers strategy spec or a refactor-to-monorepo migration plan." |
| Monorepo plan references missing sources | Same as existing: pre-flight validation flags all missing sources at once. User can abort or adjust plan. |
| Package directory already exists at target | Warn: "Package `{name}` already exists at `{path}`. Resume previous run or abort?" |
| Workspace config already exists | Warn: "Workspace config `{file}` already exists. Update or skip?" Present diff of proposed changes. |
| Cross-package import rewrite fails (regex ambiguity) | Flag the specific import, show what regex would do, let user confirm or manually fix. |
| Phase N verification fails | Same as existing: stop, report failures, do not proceed to Phase N+1. User can fix and resume. |
| CI setup needed | Output instructions only: "Manual step: Set up CI. See monorepo-tooling.md." |
| Migration plan phase cannot be parsed | Stop execution at the unparseable phase. Do not skip — later phases may depend on earlier ones. User can fix the migration plan and resume. |
| Config instruction ambiguous or target file not found | Present the instruction to user for manual execution. Continue with remaining actions in the phase. |

---

## Progressive Disclosure Schedule

Load reference files only when needed to minimize context window usage:

| Phase | Load | Section |
|-------|------|---------|
| After strategy spec parsed | `references/execution-patterns.md` | Full file |
| During verification / on failure | `references/verification-patterns.md` | Relevant stack + failure type |
