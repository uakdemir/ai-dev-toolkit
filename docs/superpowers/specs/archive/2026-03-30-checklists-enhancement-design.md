# Checklists Enhancement — Design Spec

**Date:** 2026-03-30
**Status:** Approved
**Plugin:** ai-dev-tools
**Skill:** refactor-to-monorepo (enhancement)
**Type:** Feature adding project-local checklist accumulation during monorepo analysis and migration

---

## Problem Statement

`refactor-to-monorepo` produces excellent analysis artifacts (strategy, module specs, migration plan), but the non-obvious extraction hazards discovered during analysis are lost in conversation context. When `implement-plan` executes the migration weeks later — often in a different session — the agent has no memory of pitfalls like singleton state requiring re-export shims, phantom dependencies exposed by pnpm strict mode, or `vi.mock` becoming tautological after barrel re-exports.

These hazards share two properties: they are invisible at compile time and they cause silent runtime failures. A migration plan that says "move files, update imports, run tests" will pass its own checkpoints while harboring bugs that surface only in production or in specific code paths.

The gap: analysis discovers hazards, but nothing persists them in a structured, machine-readable form that the migration executor can consult.

## Enhancement Summary

Add a project-local checklist system (`tmp/checklists/`) to `refactor-to-monorepo` that captures non-obvious extraction hazards discovered during analysis and grows during migration execution.

**Key design decisions:**

1. **Project-local, not skill-embedded** — Findings are project-specific, not generic wisdom. The skill instructs the agent to maintain checklists in `tmp/checklists/`, not in skill reference files.

2. **Two-tier: universal + module-specific** — Universal/stack-specific patterns go in `tmp/checklists/` files. Module-specific hazards go in per-module specs (`docs/monorepo-strategy/modules/<name>.md`) as a new "Extraction Hazards" section.

3. **Scoped to refactor-to-monorepo and implement-plan** — The `tmp/checklists/` convention is defined generically (so other skills can adopt later), but initially adopted by `refactor-to-monorepo` (writes checklists) and `implement-plan` (reads and appends) only.

4. **Seeded during analysis, grown during migration** — Checklists are crystallized after analysis Phase 4 (synthesis). During migration execution, `implement-plan` reads checklists before each Phase 1-N (Phase 0 excluded on first execution; see Section 5 for resume exception) and appends discoveries after each.

5. **Quality bar: non-obvious only** — Only hazards that are counter-intuitive, invisible at compile time, or cause silent runtime failures. Everyday mechanical steps stay in conversation context.

**Acceptance criteria:**

- After analysis Phase 4, `tmp/checklists/` contains an `index.md` and at least one checklist file
- Universal checklist is always emitted; stack-specific checklist emitted for stacks 1-5 if at least one stack-specific observation was accumulated; omitted if zero stack-specific observations found
- Each checklist entry has trigger / rule / why fields
- Per-module specs include an "Extraction Hazards" section when hazards are detected (omitted otherwise)
- `migration-plan.md` includes a "Checklists" section referencing the relevant files
- `implement-plan` SKILL.md contains explicit instructions to read `tmp/checklists/index.md` and the current phase's module spec "Extraction Hazards" section before each Phase 1-N migration phase (Phase 0 excluded on first execution; resumed Phase 0 applies pre-flight — implementation-review criterion, not runtime-testable)
- `implement-plan` can append new discoveries to existing checklist files during migration
- `index.md` includes a "Recommended Skill" column so future skills can be listed

---

## Scope

### In scope

- `tmp/checklists/` convention: index format, entry format, read/write protocols
- `refactor-to-monorepo` SKILL.md: observation accumulation in phases 1-3, crystallization after phase 4
- `references/module-spec-template.md`: new section 9 "Extraction Hazards"
- `migration-plan.md` output: new "Checklists" section
- `implement-plan` SKILL.md: read checklists before migration phases, append discoveries after

### Out of scope

- Checklists for skills other than `refactor-to-monorepo` / `implement-plan`
- Pre-populated checklist content (the skill instructs the agent to generate content from analysis; the spec does not hardcode findings)
- Changes to analysis phases 1-4 logic (only adding observation accumulation behavior)
- Changes to `orchestrate` (it dispatches to `refactor-to-monorepo` unchanged)

---

## Detailed Design

### 1. `tmp/checklists/` Convention

This section defines the generic convention. Any skill can adopt it. Only `refactor-to-monorepo` and `implement-plan` use it initially.

#### 1.1 Directory Structure

```
tmp/checklists/
├── index.md                    # Registry of all checklists
├── monorepo-extraction.md      # Universal extraction pitfalls (example)
└── node-ts-extraction.md       # Node.js/TypeScript-specific hazards (example)
```

#### 1.2 `index.md` Format

```markdown
# Project Checklists

| Checklist | Description | Phase | Recommended Skill |
|-----------|-------------|-------|-------------------|
| [monorepo-extraction.md](monorepo-extraction.md) | Universal extraction pitfalls | both | refactor-to-monorepo, implement-plan |
| [node-ts-extraction.md](node-ts-extraction.md) | Node.js/TypeScript-specific hazards | both | refactor-to-monorepo, implement-plan |
```

**Column definitions:**

| Column | Values | Purpose |
|--------|--------|---------|
| Checklist | Relative link to file | Navigation |
| Description | One-line summary | Quick scan without opening the file |
| Phase | `analysis`, `coding`, or `both` | Filter: which phase should consult this checklist |
| Recommended Skill | Comma-separated skill names | Which skills should read this checklist |

#### 1.3 Checklist Entry Format

Each entry in a checklist file uses this structure:

```markdown
### <short title>

- **Trigger:** <when this hazard applies — the condition that makes it relevant>
- **Rule:** <what to do — the action or constraint>
- **Why:** <what goes wrong if ignored — the failure mode>
```

Entries are appended, never reordered. New entries go at the bottom of the file. This preserves discovery order and avoids merge conflicts if multiple sessions append.

#### 1.4 Write Protocol

This protocol governs append operations during an ongoing analysis+migration lifecycle. It does not apply to crystallization (Section 2.2), which is the initial population event and uses overwrite mode (see note in Section 2.2).

1. Before creating a new checklist file, read `index.md` to check if a matching file already exists.
2. If a matching file exists, append entries to it. Do not create a duplicate file.
3. After creating a new file, add a row to `index.md`.
4. After appending to an existing file, do not modify `index.md` (the row already exists).
5. If `tmp/checklists/` does not exist, create it and `index.md` together.

#### 1.5 Read Protocol

1. Read `index.md`.
2. Filter rows by the **Phase** column (match current phase) and **Recommended Skill** column (match current skill). For the Recommended Skill column, split the value on comma, trim whitespace from each element, and exact-match each element against the current skill name; a row matches if any element matches. Phase column values map to execution contexts as follows:
   - `analysis` — applies during `refactor-to-monorepo` analysis phases 1-4
   - `coding` — applies during `implement-plan` migration phases 1-N
   - `both` — applies in both contexts
3. Load only the filtered files. Do not load checklists for unrelated phases or skills.

### 2. Analysis Phase Changes (refactor-to-monorepo SKILL.md)

#### 2.1 Observation Accumulation (Phases 1-3)

During each analysis phase, the agent watches for these categories of non-obvious hazards:

| Category | What to look for | Example |
|----------|-----------------|---------|
| Singleton state | Module-level `let`/`var` with mutation | `let _env = null` in `env.ts` |
| Shared DB patterns | Same query pattern (lookup + transform) in 3+ modules | `findFirst(customers) + decrypt(apiKey)` |
| Circular dependencies | Import cycles between proposed modules | A → B → C → A |
| Phantom dependencies | Imports that resolve only via hoisting | `import pino from 'pino'` without it in `package.json` |
| Test mock fragility | Barrel re-export mocks that become tautological after extraction | `vi.mock('@scope/pkg')` on internal delegation |
| Conditional export gaps | Missing `types` or `import` conditions in `package.json` exports | Only `types` → runtime crash; only `import` → no TS resolution |
| Build/config traps | Blanket `.gitignore` patterns, `declare module` resolution | `config` pattern matching `src/config/env.ts` |

These observations are held in conversation context during phases 1-3. They are **not** written to disk yet. Each observation is tagged with the file path(s) where it was detected (e.g., `src/config/env.ts`). This tagging is used during artifact generation to associate observations with specific modules (Section 3). For large codebases where observation volume is high, apply the quality bar strictly: only record observations that are counter-intuitive, invisible at compile time, or cause silent runtime failures. If the accumulated list still exceeds ~20 entries across all categories, keep only the most severe per category (prioritize hazards that cause silent runtime failures over build-time failures).

At each phase checkpoint (the existing user confirmation prompt), surface accumulated observations as a one-liner appended to the checkpoint output:

```
[Observations: 2 singleton candidates, 1 shared DB pattern, 3 phantom dep candidates]
```

If no observations were found in a phase, omit the line (do not print "[Observations: none]").

> **Phase 2 note:** The existing SKILL.md Phase 2 (data ownership) has no explicit "Wait for user confirmation" step. Observations accumulated during Phase 2 are deferred to the Phase 3 checkpoint one-liner. Do not add a new confirmation prompt to Phase 2; carry the observations forward and surface them at Phase 3.

#### 2.2 Crystallization (After Phase 4)

After the Phase 4 user checkpoint is approved and before generating output artifacts (Step 4), crystallize observations into checklists:

**Sequence:**

> **Note:** Crystallization is the initial population event and is exempt from the append-only write protocol in Section 1.4. On re-run, delete any existing files inside `tmp/checklists/` before executing the steps below. This ensures stale entries from a prior analysis do not persist. The write protocol (Section 1.4) applies only to subsequent append operations by `implement-plan` within the same analysis+migration lifecycle.

1. If `tmp/checklists/` already exists (re-run), delete all contents inside it (files and subdirectories), including any entries appended by `implement-plan` during a prior lifecycle. Create `tmp/checklists/` if it does not exist.
2. Generate a **universal checklist** (`tmp/checklists/monorepo-extraction.md`). This file is always emitted. It covers patterns that apply regardless of tech stack:
   - Singleton state → re-export shim rule
   - Shared DB patterns → extract-as-service rule (3+ modules threshold)
   - Circular dependencies → break-cycle rule (re-export or extract shared interface)
   - Commit strategy → structural-then-behavioral rule
   - Per-phase mechanical checklist → conversion steps per file
   - `.gitignore` blanket pattern traps
   - Unused destructured variables after service extraction (always included — this is a mechanical hazard that applies universally regardless of whether it was observed as a category during analysis)
3. If tech stack is options 1-5 (not "Other") AND at least one stack-specific observation was accumulated during phases 1-3, generate a **stack-specific checklist**. If the stack is 1-5 but zero stack-specific observations were found, skip this step entirely. Use the following mapping to determine the file name:

   | Stack option | Label | File name |
   |---|---|---|
   | 1 | Node.js + React | `node-ts-extraction.md` |
   | 2 | Node.js + Vue | `node-ts-extraction.md` |
   | 3 | .NET + React | `dotnet-extraction.md` |
   | 4 | .NET + Vue | `dotnet-extraction.md` |
   | 5 | Python + React | `python-extraction.md` |

   Stacks 1 and 2 share a file; if both were somehow selected, append to the same file. Contents are stack-specific hazards discovered during analysis:
   - Node.js/TypeScript (`node-ts-extraction.md`): conditional exports, pnpm phantom deps, `vi.mock` barrel behavior, `declare module` type resolution
   - .NET (`dotnet-extraction.md`): assembly binding redirects after project split, `InternalsVisibleTo` breaks across new project boundaries, shared `appsettings.json` config section ownership
   - Python (`python-extraction.md`): relative import breakage after package restructure, `sys.modules` singleton state across extracted packages, `conftest.py` fixture visibility after test directory split
4. Create `index.md` with rows for each generated file.

**Content generation rule:** Entries are generated from the observations accumulated in phases 1-3, not from a hardcoded list. The categories above are what the agent looks for; the actual entries reflect what was found in this specific codebase. If no singleton state was observed, the universal checklist omits the singleton entry. However, the commit strategy and per-phase mechanical checklist entries are always included (they apply universally regardless of what was observed). Their canonical form is:

```markdown
### Commit strategy

- **Trigger:** Always — applies to every extraction phase.
- **Rule:** One commit per migration phase, bundling all actions within that phase (file moves, import rewrites, config changes). Do not split a phase's actions across multiple commits.
- **Why:** Per-phase commits map directly to the migration plan, making resume and rollback predictable. A mid-phase partial commit uses a `(partial)` suffix and is the exception, not the norm.

### Per-phase mechanical checklist

- **Trigger:** Always — applies before marking any migration phase complete.
- **Rule:** For each file moved in this phase: (1) update all import paths that reference it, (2) verify the file is listed in the correct package's exports, (3) confirm the old location either re-exports or is deleted.
- **Why:** Skipping any of these steps causes silent import resolution failures that pass local compilation but break at runtime or in downstream packages.
```

**Empty checklist prevention:** If observation accumulation produces zero non-obvious findings beyond the always-included entries, still emit the universal checklist with the always-included entries. Do not skip checklist generation entirely.

### 3. Module Spec Template Change

Add a 9th section to `references/module-spec-template.md`:

```markdown
### 9. Extraction Hazards

<!-- Non-obvious hazards specific to this module. Omit this section if none detected. -->

- **<hazard type>:** `<file or pattern>` — <what goes wrong and what to do>
```

**Population rule:** During artifact generation (Step 4), for each module, filter accumulated observations where the tagged file path(s) belong to that module's Owned Files list. If any matching observations exist, populate section 9 with those entries. If none match, omit the section entirely (do not include an empty section). **Fallback:** Observations whose tagged file path(s) do not match any module's Owned Files list (e.g., files in `shared/`, top-level config files) are added as additional entries to the universal checklist (`monorepo-extraction.md`) instead of being dropped.

**Examples:**

```markdown
### 9. Extraction Hazards

- **Singleton state:** `src/config/env.ts` has module-level `let _env`. Old location must become re-export shim.
- **Service extraction candidate:** `findFirst + decrypt` pattern shared with `billing` and `notifications` modules.
```

### 4. Migration Plan Reference

Add a "Checklists" section to the `migration-plan.md` output, placed after the phase listing and before any closing notes:

```markdown
## Checklists

Before each extraction phase, consult:
- `tmp/checklists/monorepo-extraction.md` — universal extraction pitfalls
- `tmp/checklists/<stack>-extraction.md` — stack-specific hazards

Per-module hazards are noted in each module's spec under "Extraction Hazards".
```

The file names in this section must match the actual files generated in `tmp/checklists/`. If "Other" was selected (no stack-specific checklist), omit the stack-specific line. If a stack from options 1-5 was selected but zero stack-specific observations were accumulated during phases 1-3, omit the stack-specific checklist file entirely and omit its line from the migration plan reference.

### 5. implement-plan Integration

Add instructions to `implement-plan` SKILL.md for checklist consumption and growth. Insert these instructions within `implement-plan`'s existing Step 7 (Monorepo Plan Execution Phases section only), as a sub-step block at the start of each phase iteration. Checklist reading applies to Phases 1-N (all migration phases). Phase 0 is excluded on first execution. Exception: when re-executing Phase 0 in a resumed session, apply checklist pre-flight as for Phases 1-N.

#### 5.1 Before Each Migration Phase

Before executing any migration phase, the agent must:

1. Check if `tmp/checklists/index.md` exists.
2. If it exists, read it and filter for rows where Phase = `coding` or `both` and Recommended Skill includes `implement-plan`.
3. Load the filtered checklist files.
4. Locate the current phase's module spec at `docs/monorepo-strategy/modules/<module-name>.md`. If the spec exists and contains a section 9 "Extraction Hazards", read those hazards and keep them in context alongside the checklist entries. If the module spec or the section is missing, proceed without module-specific hazards (this is not an error — some modules may have no detected hazards).
5. For each entry (from both checklists and module-spec hazards), evaluate the trigger condition in two stages. **Stage 1 (lightweight):** evaluate using file names, migration plan notes, and module spec context only — no file content reads. If a trigger can be ruled out or confirmed from names and plan context alone, resolve it. **Stage 2 (content read):** only for triggers that remain ambiguous after stage 1, read the relevant file contents to resolve. Trigger evaluation is a judgment call: the agent reads each trigger's prose condition and decides whether it applies given what is known about the current phase's files. For example, if a trigger reads "when barrel re-exports are present" and the current phase includes a file named `index.ts` that re-exports other modules, the trigger matches and the entry is flagged. If the current phase's files contain no barrel exports, the trigger does not match and the entry is skipped.
6. Keep flagged entries in context during the phase. They serve as a pre-flight checklist — the agent must verify each flagged rule is satisfied before marking the phase complete.

#### 5.2 After Each Migration Phase

After completing a migration phase and confirming its checkpoint passes, the agent must:

1. Evaluate whether any new non-obvious hazards were discovered during execution that are not already in the checklists. Before appending, read the target checklist file and check whether an entry with a substantively identical trigger already exists. If a matching entry exists, skip the append (do not create a duplicate). For example: if the checklist already contains an entry with trigger "when a module-level `let` variable is mutated" and the new discovery has the same trigger, it is a duplicate and must be skipped.
2. If new non-duplicate hazards exist, append them to the appropriate checklist file following the write protocol (Section 1.4). Choose the target file as follows: if the hazard is stack-agnostic, append to the universal checklist (`monorepo-extraction.md`); if it is stack-dependent, append to the stack-specific checklist (e.g., `node-ts-extraction.md`); if the stack-specific file does not exist, fall back to the universal checklist. If the target checklist file does not exist on disk (e.g., `tmp/checklists/` was partially deleted), create it as a new file and add its row to `index.md` per the write protocol.
3. Quality bar for appending: same as the analysis-time bar — only hazards that are counter-intuitive, invisible at compile time, or cause silent runtime failures. Do not append mechanical steps that are already in the migration plan.

#### 5.3 No-Checklist Path

If `tmp/checklists/index.md` does not exist (e.g., the analysis was done before this enhancement), proceed normally. Do not fail or warn. Checklists are additive, not required.

---

## What Changes Where

| Component | Change | Lines (est.) |
|---|---|---|
| refactor-to-monorepo SKILL.md — Phase 1-3 | Add observation accumulation instructions and checkpoint one-liner | ~25 |
| refactor-to-monorepo SKILL.md — After Phase 4 | Add crystallization sequence (create `tmp/checklists/`, generate files) | ~40 |
| refactor-to-monorepo SKILL.md — Step 4 artifacts | Add `migration-plan.md` "Checklists" section instruction | ~10 |
| references/module-spec-template.md | Add section 9 "Extraction Hazards" | ~8 |
| implement-plan SKILL.md | Add pre-phase checklist read + post-phase append instructions | ~30 |
| **New convention doc (inline in SKILL.md)** | `tmp/checklists/` convention (index format, entry format, protocols) | ~35 |

**Total:** ~148 lines across 3 existing files (2 SKILL.md + 1 template). Zero new skill files. Zero new reference files (convention is documented inline in `refactor-to-monorepo` SKILL.md). `implement-plan` SKILL.md will include a self-contained summary of the `tmp/checklists/` convention (index format, entry format, read/write protocols) so it does not depend on reading `refactor-to-monorepo` SKILL.md to understand the convention.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `tmp/checklists/` already exists from a prior analysis run | Delete all existing files inside `tmp/checklists/` and regenerate from the new analysis (overwrite mode). Old entries from a stale analysis are not reliable. |
| "Other" tech stack selected | Skip stack-specific checklist generation. Universal checklist is still emitted. |
| Zero non-obvious findings in phases 1-3 | Emit universal checklist with always-included entries (commit strategy, per-phase mechanical checklist). Do not skip generation. |
| `implement-plan` runs without `tmp/checklists/` | Proceed normally. No warning. Checklists are additive. |
| Checklist file referenced in `index.md` is missing on disk | Skip that file with a one-line note: "Checklist `<file>` listed in index but not found. Skipping." |
| Phase 2 skipped (no database) | Observation accumulation still runs for phases 1 and 3. Fewer categories apply, but the mechanism is unchanged. |
| Analysis re-run on same project | Overwrite checklist files from the new analysis. Old entries from a stale analysis are not reliable. Append-only applies within a single analysis+migration lifecycle, not across re-runs. |

---

## Non-Goals

- This spec does not pre-populate checklists with hardcoded content — entries are generated from analysis observations
- This spec does not change the analysis phase logic (phases 1-4) — only adds observation accumulation as a parallel concern
- This spec does not add checklists to skills other than `refactor-to-monorepo` and `implement-plan`
- This spec does not create a UI for managing checklists — they are markdown files read/written by the agent
- This spec does not persist checklists beyond the project's `tmp/` directory — they are ephemeral project artifacts, not permanent documentation
