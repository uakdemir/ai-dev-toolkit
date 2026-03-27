---
name: implement-plan
description: "Use when the user wants to execute a restructuring strategy from refactor-to-layers, apply file moves and import rewrites from a layer strategy spec, or restructure a codebase according to an approved layer plan — even if they don't use the exact skill name."
---

# implement-plan

Execute restructuring strategy specs produced by refactor-to-layers. Groups steps into phases (create → move → rewrite → extract) with dependency ordering within each phase. Serena-aware for semantic refactoring, with regex fallback.

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
2. **Auto-detect** — look for `docs/layer-architecture/strategy.md` at the project root. Also search recursively in workspace package directories for the same relative path.
3. **Selection** — one found → use it. Multiple found → present list and ask. None found → error: "No strategy spec found. Run `/refactor-to-layers` first to generate one."

If Serena was detected in Step 1, probe a source file from the strategy scope to confirm Serena is functional.

---

## Step 3: Parse and Validate

Read the strategy spec and extract:

- **Frontmatter fields:**
  - `tech_stack` → determines verification commands.
  - `layers` → validate that target layers exist.
  - `composition_root` → exempt from import rewrites.
  - `scope` → used in commit messages.

- **Restructuring Steps:** parse the step list from the spec body. Each step has an action type (`create-folder`, `move-file`, `rewrite-import`, `extract-interface`), source, target, and optional metadata.

- **Validation rules:**
  - Every step must have a valid action type.
  - `move-file` and `extract-interface` require both source and target.
  - `rewrite-import` requires a file path and old/new import specifiers.
  - `create-folder` requires a target path.

- **Skip completed:** steps prefixed with `[DONE]` are skipped. Report: "Found N total steps: X remaining, Y already completed."

---

## Step 4: Check Git State

Require a clean working tree. If uncommitted changes exist, stop: "Uncommitted changes detected. Commit or stash before proceeding — mixing plan changes with existing changes makes rollback unreliable."

---

## Step 5: Pre-flight Validation

Read `references/verification-patterns.md` for the full pre-flight procedure.

1. **Source existence** — check every remaining step's source path. Report all missing sources at once (do not fail on the first one).
2. **Target collisions** — for `move-file` and `extract-interface`, check if the target already exists. Prompt: overwrite or stop. No skip option — skipping invalidates downstream steps. `create-folder` targets are idempotent. `rewrite-import` has no collision concept.

---

## Step 6: Ask Verification Granularity

Present three options:

1. **Per-step** — verify after every action. Slowest, safest.
2. **Per-phase** (default) — verify after each phase completes. Recommended balance.
3. **End-only** — verify once after all phases. Fastest, riskiest.

---

## Step 7: Execute Phases

Group remaining steps by action type and execute in phase order. Read `references/execution-patterns.md` for detailed procedures.

## Execution Phases

Phase execution order is fixed: 0 → 1 → 2 → 3. Each phase completes fully before the next begins. Verification runs per the granularity selected in Step 6.

### Phase 0: Preparation

Execute all `create-folder` actions.

- Dependency ordering: parent directories before children.
- Idempotent — existing directories are skipped silently.
- No verification needed — folder creation cannot break builds.

Commit: `refactor(<scope>): prepare — create target directories`

### Phase 1: Move

Execute all `move-file` actions.

- **Serena mode:** call `find_referencing_symbols` on each source file before moving. Store the reference graph — Phase 2 uses it for precise import rewrites.
- **Fallback mode:** move without capturing references. Phase 2 will rely on regex.
- Dependency ordering: if file B imports file A and both are moving, move A first.
- After all moves, run verification if granularity permits.

Commit: `refactor(<scope>): move — relocate files to target layers`

### Phase 2: Rewrite

Execute all `rewrite-import` actions.

- **Serena mode:** use the reference graph captured in Phase 1 to rewrite each import precisely via `rename_symbol` or targeted find-and-replace.
- **Fallback mode:** regex match on `import`/`require`/`from` statements. Flag ambiguous matches for user resolution.
- The composition root file (from frontmatter) is exempt from automatic rewrites.
- After all rewrites, run verification if granularity permits.

Commit: `refactor(<scope>): rewrite — update import paths`

### Phase 3: Extract

Execute all `extract-interface` actions.

- Before starting, run the circular dependency advisory (see below).
- **Serena mode:** use `get_symbols_overview` to identify the public API surface, then extract interface definitions.
- **Fallback mode:** regex-based extraction of exported function/class signatures.
- After all extractions, run verification if granularity permits.

Commit: `refactor(<scope>): extract — create provider interfaces`

---

## Pre-Phase 3: Circular Dependency Advisory

Before executing Phase 3, scan for circular dependencies among files involved in extract-interface steps.

**Detection:** trace import chains looking for cycles. Classify each cycle into one of four known patterns:

| Pattern | Description | Recommended Fix |
|---------|-------------|-----------------|
| Mutual service | Two services import each other | Extract shared interface |
| Hub cycle | Central file creates a dependency star | Inject dependencies instead |
| Layer violation | Upward import creates a cycle | Move shared type to lower layer |
| Barrel re-export | Index file re-exports create false cycles | Rewrite to direct imports |

Cycles that do not match a known pattern are classified as **unclassified** with a confidence note.

**Batch decision table:** present all detected cycles and ask the user to acknowledge each. Options per cycle: fix now (apply recommended fix), defer (add to execution report as "Recommended Manual Steps"), or ignore.

This step is advisory only — acknowledged and ignored items are recorded, but Phase 3 proceeds regardless.

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
2. Reconcile the filesystem — verify that source files for remaining steps still exist at expected paths (they may have been moved by a partial Phase 1).
3. Re-validate dependency ordering among remaining steps only.
4. Resume execution from the first incomplete step in the current phase.

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

**2. Execution report at `docs/tmp/execution-report.md`:**

This is a throwaway review document, not a source of truth.

- Header: `Generated on [date] — this is a one-time review document, not a source of truth.`
- Phase-by-phase summary with step counts and verification results.
- File mapping table (old path → new path) for quick reference.
- Recommended Manual Steps section listing deferred circular dependencies and unresolved items from the advisory.
- Warnings section noting any regex-only rewrites, Serena fallbacks, or skipped verifications.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No Restructuring Steps found | Error: "Strategy spec contains no restructuring steps. Regenerate with `/refactor-to-layers`." |
| Malformed step (missing fields) | Error with line number and missing field. Do not proceed. |
| Source file missing | Report all missing sources in pre-flight. Ask: abort or adjust plan. |
| Target file already exists | Prompt: overwrite or stop. No skip. |
| Target file gone (mid-rewrite) | Stop. Likely a prior step failed silently. Run resume flow. |
| Regex ambiguity (multiple matches) | Flag the file and matches. Ask user to select the correct replacement. |
| Build/test fails after phase | Stop. Analyze, propose fix, wait for user decision. |
| Circular deps detected (pre-Phase 3) | Advisory. Classify, present batch table, proceed regardless. |
| Serena drops mid-execution | Warn. Fall back to regex for remaining steps. Note in execution report. |
| Dirty working tree | Block execution. Require commit or stash first. |
| Tech stack mismatch | Warn if strategy spec tech_stack does not match detected project stack. Ask to continue. |
| All steps already `[DONE]` | Report: "All steps completed. Nothing to do." |
| Partial resume (re-run after failure) | Skip `[DONE]` steps, reconcile filesystem, re-validate remaining deps. |

---

## Progressive Disclosure Schedule

Load reference files only when needed to minimize context window usage:

| Phase | Load | Section |
|-------|------|---------|
| After strategy spec parsed | `references/execution-patterns.md` | Full file |
| During verification / on failure | `references/verification-patterns.md` | Relevant stack + failure type |
