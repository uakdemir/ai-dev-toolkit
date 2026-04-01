# Full Scan Removal & Iterative Refactor

**Status:** Approved
**Created:** 2026-03-31

## Summary

Two bug fixes:

1. **Remove full scan from orchestrate and session-handoff** — When orchestrate can't determine state, ask the user instead of scanning specs/plans/git history. Session-handoff gathers from conversation context first; git only on request.

2. **Iterative refactor with implement-plan merged** — Refactor skills produce a roadmap + single-unit spec. Orchestrate drives the outer loop (brainstorm → spec → plan → implement per unit). implement-plan is removed as a standalone skill. Serena dropped entirely from refactor skills.

## Part 1: Full Scan Removal

### 1.1 Orchestrate — Remove full-scan.md and all references

**Delete:** `references/full-scan.md`

**File:** `SKILL.md`

#### Fast-Path Detection Algorithm

Replace the current algorithm (lines 109-133) with:

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

Every path that previously said "full scan fallback" or "Read references/full-scan.md" now routes to "User Prompt." The fast-path step 2 Different HEAD branch uses `git log --grep` to match commits against the feature name (not spec filename scanning); spec filename scanning is removed from all fast-path branches, including the non-finalized Different HEAD case.

#### First-Run User Prompt — Unified for Both Modes

Remove the `(--strict only)` guard from the section header. The prompt now triggers for both standard and strict modes when no valid cycle state exists.

Before (line 143):
```
## First-Run User Prompt (--strict only)

**Trigger:** No valid cycle state in hint file (missing file, malformed YAML, or empty/missing `feature` field) AND strict mode is active.
```

After:
```
## User Prompt

**Trigger:** No valid cycle state in hint file (missing file, malformed YAML, or empty/missing `feature` field), OR fast-path detection cannot resolve state.
```

The prompt body stays the same (ask "What are you working on?", parse response, 2-3 clarification rounds) with two changes:

1. **Step 3 validation contradiction:** Replace "Fall back to full scan" with: print "That doesn't match what I see — can you clarify?" and continue asking within the 2-3 round limit.

2. **Step 5 max rounds exceeded:** Replace "Fall back to full scan (read references/full-scan.md)" with: print "I can't determine the state automatically. Please describe your current step more specifically, or check `tmp/orchestrate-state.md` and update it manually."

Before (lines 173-175):
```
   → If validation contradicts the stated step: print
     "The project state doesn't match step <N> — let me scan
     to determine the correct step." Fall back to full scan.
```

After:
```
   → If validation contradicts the stated step: print
     "That doesn't match what I see — can you clarify?"
     Continue within the 2-3 round limit.
```

Before (lines 184-186):
```
5. If still unclear after 2-3 rounds:
   → Print: "Let me scan the project to figure it out."
   → Fall back to full scan (read references/full-scan.md).
```

After:
```
5. If still unclear after 2-3 rounds:
   → Print: "I can't determine the state automatically.
     Please describe your current step more specifically,
     or check tmp/orchestrate-state.md and update it manually."
   → Write hint with whatever was resolved (feature if known,
     step 1 as default). Proceed to the resolved or default step.
```

#### Step 2 feature name resolution

Remove the spec filename scanning from step 2 of the User Prompt. Currently (lines 152-155):

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

No file scanning. The user tells you the feature name.

#### Conditional Loading

Before (lines 191-195):
```
If hint file is missing or validation fails:
  -> Strict mode active: First-Run User Prompt (see above), then full scan only if unresolved.
  -> Standard mode: Read references/full-scan.md, execute Full Scan Fallback.
```

After:
```
If hint file is missing or validation fails:
  → User Prompt (both modes). Write hint after resolution.
```

#### Step 6 N derivation

Before (line 258, partial):
```
if still empty, fall back to full scan per existing Step 6 behavior and show `Commits since plan: unknown (plan hash not found)`
```

After:
```
if still empty, show `Commits since plan: unknown (plan hash not found)` in the confirmation prompt. The user can override with a specific count or command.
```

#### Step 6 step-specific validation table entry

In the step-specific validation table, the Step 6 entry currently ends with "if still empty, full scan fallback." Replace that trailing clause with the same resolution: show `Commits since plan: unknown (plan hash not found)` and allow user override. The full-scan fallback is removed from this table entry as well.

#### Step 6 inline validation sentence (SKILL.md line 135)

The compressed inline step-specific validation sentence at SKILL.md line 135 contains a separate "if still empty, full scan fallback" clause for Step 6. This is a third location that must be updated independently of the table entry and the N derivation text.

Before (partial, Step 6 clause within the inline sentence):
```
Step 6: ... if still empty, full scan fallback
```

After:
```
Step 6: ... if still empty, show `Commits since plan: unknown (plan hash not found)` in the confirmation prompt. The user can override with a specific count or command.
```

#### Error Handling table

| Row | Before | After |
|---|---|---|
| Hint file missing or YAML malformed | Strict: First-Run User Prompt → fallback to full scan if unresolved. Standard: Full scan fallback. Write hint after detection. | User Prompt (both modes). Write hint after resolution. |
| Unknown step/feature or head not in history | Full scan fallback. Overwrite hint. | User Prompt. Write hint after resolution. |
| Hint says finalized but spec deleted | Full scan -> clean slate -> Step 1. | Write hint (step: 1, clear fields) → route to Step 1. |
| No valid cycle state + strict mode | First-Run User Prompt → targeted validation → hint write. Fallback to full scan after 2-3 rounds. | User Prompt → targeted validation → hint write. If unresolved after 2-3 rounds, default to step 1 with whatever was resolved. |

#### Inline Cross-Check Rules

Remove the last line (line 289):
```
Full cross-check algorithm (scope header overlap, response_analysis.md counting, clean-review attribution) is in references/full-scan.md.
```

The two inline rules above it (doc review stale detection, code review stale detection) remain unchanged.

### 1.2 Session-Handoff — Ask-First Git

**File:** `SKILL.md`

#### Step 1: Gather — Git Analysis revised

The current "Full git analysis fallback" section (lines 65-77) is replaced with an ask-first pattern.

**Always available without asking (lightweight, fast):**
- `git status --short`
- `git branch --show-current`

**If `gitStatus` is present (typical case):** No changes. Extract starting HEAD, run `git log --oneline <start_head>..HEAD`. This is exact and fast.

**If `gitStatus` is absent (the change):**

Before (lines 61-77):
```
Fall back to the full git analysis below...

**Full git analysis fallback (when `gitStatus` is absent):**

1. git rev-parse --is-inside-work-tree...
2. git rev-parse --verify HEAD...
3. git branch --show-current...
4. git status --short...
5. git log --oneline -20...
6. git diff --stat HEAD...

**Session commit detection (fallback only):**
1. git log --oneline --since="midnight" -20...
2. If no commits found...
3. Note "session boundary estimated"...
```

After:
```
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

The `git log --oneline -20` (unbounded recent history) and `git diff --stat HEAD` commands are removed from the fallback. Only `--since="midnight"` is available, and only with user approval.

#### Conversation Analysis — Remove implement-plan block

In the Conversation Analysis section of `session-handoff/SKILL.md`, remove the entire "Unfinished implement-plan tasks" block. This block identifies unfinished tasks by parsing `[DONE]` markers from strategy specs and references `tmp/execution-report.md` — both are implement-plan artifacts that no longer exist after deletion. Remove the block entirely; no replacement text is needed.

## Part 2: Iterative Refactor

### 2.1 Concept

Refactor skills produce a **roadmap** (ordered unit list) and a **single-unit spec** (detailed analysis for one unit). Orchestrate drives the outer loop, cycling brainstorm → spec → plan → implement → review for each unit. Each unit gets fresh brainstorming — learnings from prior units inform the next.

### 2.2 implement-plan — Removed

**Delete entirely:**
- `ai-dev-tools/skills/implement-plan/SKILL.md`
- `ai-dev-tools/skills/implement-plan/references/execution-patterns.md`
- `ai-dev-tools/skills/implement-plan/references/verification-patterns.md`

**Useful domain knowledge extracted** into new orchestrate reference file (see 2.5).

### 2.3 Serena — Removed from refactor skills

**refactor-to-monorepo/SKILL.md** and **refactor-to-layers/SKILL.md:**
- Verify: grep each file for `Serena`, `find_referencing_symbols`, `rename_symbol`, `replace_content` — expect zero matches. No changes needed.

Note: Serena was only present in implement-plan, which is being deleted entirely. Neither refactor-to-monorepo nor refactor-to-layers contain Serena code paths. The useful patterns from implement-plan's execution-patterns.md are extracted into the new orchestrate reference file.

**Checklist template update:** The checklist crystallization template is embedded in `refactor-to-monorepo/SKILL.md` (not in `tmp/checklists/index.md`, which is generated output). Three lines in that template reference implement-plan and must be updated:

1. **Recommended Skill column value** (currently `refactor-to-monorepo, implement-plan`): remove `implement-plan` from the value, leaving only `refactor-to-monorepo`. Also update the example index.md row embedded in the template (currently `| [monorepo-extraction.md] | Universal extraction pitfalls | both | refactor-to-monorepo, implement-plan |`) to: `| [monorepo-extraction.md](monorepo-extraction.md) | Universal extraction pitfalls | both | refactor-to-monorepo |`.
2. **Phase column definition** (currently `coding = implement-plan phases 1-N`): the coding phase loses its only consumer after implement-plan deletion. Replace with: `coding = orchestrate Step 5 implementation`. Note: the `coding` phase value is reserved for future use — orchestrate's Step 5 conditional loading filters for Phase `coding` or `both`, so entries with Phase `coding` will surface at Step 5 onset once checklist rows are regenerated with updated Recommended Skill values. Also note: existing `tmp/checklists/index.md` files generated by previous refactor-to-monorepo runs are stale — they contain rows with `Recommended Skill=implement-plan` that will never match orchestrate's filter. These files must be regenerated by running refactor-to-monorepo again after the template update is applied.
3. **Write protocol note** (currently `Write protocol (for append operations by implement-plan — NOT used during crystallization)`): remove the implement-plan attribution. Replace with: `Write protocol (for append operations by external skills — NOT used during crystallization)`.

### 2.4 Refactor Skills — Roadmap + Single-Unit Output

#### refactor-to-monorepo

**Phase 4 (Synthesis) output changes.**

Before: produces a complete migration plan (`docs/monorepo-strategy/migration-plan.md`) with all modules, all phases (0-N), all file moves, all import rewrites.

After: produces two artifacts. `docs/monorepo-strategy/migration-plan.md` is no longer generated. The Step 4 Output Artifacts section of SKILL.md currently contains a `### 6. migration-plan.md — Phased Migration Plan` entry (with an embedded `## Checklists` template referencing `tmp/checklists/`); remove this entire artifact section. Any other SKILL.md references to migration-plan.md must also be removed or updated to reference the roadmap file. Also remove from the Progressive Disclosure Schedule table the row for `Artifact generation: migration plan` (the row referencing `references/migration-patterns.md`), since migration-plan.md is no longer generated. Removing the `### 6. migration-plan.md — Phased Migration Plan` artifact section also removes the embedded `## Checklists` block within it — this is intentional. The `## Checklists` content is not migrated to the new roadmap.md. The standalone checklist crystallization section elsewhere in refactor-to-monorepo/SKILL.md is unchanged except for the template updates specified in section 2.3. Additionally, update the Phase 4 user checkpoint message in SKILL.md to: "Here is the full analysis with proposed module boundaries and conflict resolutions. Please review before I generate the output artifacts: roadmap.md (ordered extraction list) and a single-unit spec for the first module." Any existing `docs/monorepo-strategy/migration-plan.md` files from previous runs should be left in place — they are not deleted by the implementation of this spec.

1. **Unit roadmap** at `docs/monorepo-strategy/roadmap.md`:
   ```markdown
   # Monorepo Extraction Roadmap

   Ordered by extraction priority (dependency depth, coupling score, risk).

   - [ ] **module-a** — lowest coupling, no dependents, good first extraction
   - [ ] **module-b** — depends on module-a interface only
   - [ ] **module-c** — shared data layer, extract after module-b
   - [ ] **module-d** — core services, highest coupling, extract last
   ```
   Checkbox format so orchestrate can track completion.

2. **Single-unit spec** — detailed analysis for the first unchecked module only. Contains: module boundary, files to extract, dependencies to sever, interface to expose, expected import rewrites. This is a normal spec (`docs/superpowers/specs/YYYY-MM-DD-extract-<module>-design.md`) with **Status: Draft** that enters the orchestrate cycle at Step 2.

The full Phase 4 run always produces both the roadmap and the first-unit spec directly — `--next-unit` is only used for subsequent units (units 2+). The default Phase 4 run (no flags) produces roadmap.md and the first-unit spec.

**New `--next-unit` mode:**

Trigger: invoked when a unit roadmap exists with unchecked items and the previous unit is finalized. Behavior:
1. Read the roadmap, identify next unchecked unit
2. Read the immediately prior extraction spec only (the most recently completed unit's spec — not all prior specs) for context on what was learned. The prior spec is the last checked item (`[x]`) immediately before the next unchecked item (`[ ]`) in roadmap checkbox order. Match to `docs/superpowers/specs/` by unit name substring in filename.
3. Run a lightweight dependency scan limited to the next unit's file set and its direct imports. Re-read `docs/monorepo-strategy/dependency-matrix.md`: read the row and column corresponding to the next unit to identify its direct dependencies and dependents. Do NOT re-run the full 4-phase analysis.
4. Produce a single-unit spec for the next module

**Roadmap-to-skill derivation rule:** The roadmap path determines which skill `--next-unit` invokes. `docs/monorepo-strategy/roadmap.md` → `refactor-to-monorepo`. `docs/layer-architecture/roadmap.md` → `refactor-to-layers`. Both roadmaps can coexist; orchestrate checks both and invokes each skill independently.

Skips the full 4-phase analysis — uses existing strategy docs as context. The user can brainstorm adjustments during the normal orchestrate cycle.

**Error handling for --next-unit mode:**
- No unchecked items in roadmap: print "All units in the roadmap are complete. Nothing to extract." and exit.
- Missing roadmap file: print "No roadmap found at the expected path. Run the full analysis first to generate a roadmap." and exit.
- Missing prior unit's spec/plan artifacts: warn "Prior unit artifacts not found — proceeding without prior context." Continue with step 2 skipped.
- A spec already exists for the next unit (docs/superpowers/specs/ contains a file matching the unit name) AND its Status is not `finalized`: print "A spec for `<next-unit>` already exists. Resume the orchestrate cycle for that unit instead of regenerating." and exit. If the existing spec's Status IS `finalized`, proceed normally (treat the unit as not yet started for --next-unit purposes).

#### refactor-to-layers

**Output path:** All refactor-to-layers artifacts are written to `docs/layer-architecture/` (matching the existing SKILL.md). The layer roadmap is at `docs/layer-architecture/roadmap.md`. The existing `docs/layer-architecture/strategy.md` is still generated. The path `docs/layer-strategy/` is not used; any reference to `docs/layer-strategy/roadmap.md` in this document means `docs/layer-architecture/roadmap.md`.

**Phase change:** The ANALYZE phase (Phase 3 Scaffolding) output changes from strategy.md alone to strategy.md + roadmap.md + single-unit spec. Specifically:
- `docs/layer-architecture/strategy.md` — still generated (unchanged)
- `docs/layer-architecture/roadmap.md` — new output. Checkbox-formatted ordered list of layers (bottom-up: Types, Config, Data, Service, Providers, API, UI), each entry listing the layer name and a one-line rationale.
- First layer single-unit spec at `docs/superpowers/specs/YYYY-MM-DD-layer-<layer-name>-design.md` with **Status: Draft**. Contains: layer boundary definition, files belonging to this layer, dependency violations to resolve (imports that cross layer boundaries downward), provider interfaces to introduce, expected import rewrites. After --next-unit completes, orchestrate (not refactor-to-layers) writes the hint (step: 2) and exits; this drives routing to Step 2 on the next invocation. No additional spec-scanning logic is added to orchestrate.

Note: SCAFFOLD mode output is unchanged — roadmap.md and single-unit spec are only produced in ANALYZE mode Phase 3. SCAFFOLD mode generates folder structure + structural tests + strategy spec only. Additionally, update the Phase 4 user checkpoint message in refactor-to-layers/SKILL.md to mention roadmap.md and the single-unit spec as outputs from Phase 3 Scaffolding.

Before (existing Phase 4 checkpoint text in refactor-to-layers/SKILL.md):
```
Here is the full layer analysis with proposed boundaries and dependency violations. Please review before I generate the output artifacts: strategy.md (layer definitions and migration guidance).
```

After:
```
Here is the full layer analysis with proposed boundaries and dependency violations. Please review before I generate the output artifacts: strategy.md (layer definitions and migration guidance), roadmap.md (ordered layer extraction list), and a single-unit spec for the first layer.
```

**`--next-unit` behavior:**
1. Read `docs/layer-architecture/roadmap.md`, identify next unchecked layer
2. Read the immediately prior layer spec only (the most recently completed layer's spec — not all prior specs) for context. The prior spec is the last checked item (`[x]`) immediately before the next unchecked item (`[ ]`) in roadmap checkbox order. Match to `docs/superpowers/specs/` by layer name substring in filename.
3. Run a lightweight dependency scan limited to the next layer's file set and its direct cross-layer imports. Re-read the file-to-layer mapping section of `docs/layer-architecture/strategy.md` to identify which files belong to the next layer, and read the violation allowlist section of that file for any permitted cross-boundary imports. Do NOT re-run the full analysis.
4. Produce a single-unit spec at `docs/superpowers/specs/YYYY-MM-DD-layer-<layer-name>-design.md` for the next layer

**Error handling for --next-unit mode:** Same as refactor-to-monorepo — no unchecked items, missing roadmap, missing prior spec, and existing spec for next unit all handled identically with the same print messages (substituting layer names and the `docs/layer-architecture/roadmap.md` path).

**`--next-unit` mode for subsequent layers:**
- The layer hierarchy (Types > Config > Data > Service > Providers > API > UI) provides natural ordering — extract bottom-up. The roadmap is pre-ordered bottom-up at initial generation time. `--next-unit` always picks the next unchecked item in roadmap checkbox order; it does not re-derive order from the layer hierarchy at invocation time.

### 2.5 New: `references/refactor-execution.md` (orchestrate)

Loaded at Step 5 only when a refactor roadmap exists (`docs/monorepo-strategy/roadmap.md` or `docs/layer-architecture/roadmap.md`) and the current feature name appears in that roadmap.

Content distilled from implement-plan's execution-patterns.md and verification-patterns.md (~100 lines):

**File Operations:**
- `mkdir -p` for folder creation (idempotent)
- `git mv` for file moves (preserves history)
- Move dependency ordering: if B imports A and both move, move A first
- Import rewrite: grep old paths, replace with new package paths
- Per-stack pattern descriptions (Node.js: `import`/`require` + tsconfig paths; .NET: `using` + csproj refs; Python: `import`/`from` + `__init__.py`). Note: `implement-plan/references/execution-patterns.md` contains human-readable pattern descriptions in prose and table cells — not regex literals. Copy these pattern descriptions verbatim from that file into the Per-stack patterns section of `refactor-execution.md` before that file is deleted.

**Pre-flight:**
- Source existence check (report all missing before starting)
- Target collision check (warn on existing targets for moves)
- Clean git state required

**Verification:**
- After file moves: assert source gone + target present. Do NOT build (imports still point to old paths)
- After import rewrites: run full build/type-check (first point where compilation should succeed)
- Per-stack commands: `tsc --noEmit` / `dotnet build` / `python -m py_compile`

No Serena. No `[CREATE]`/`[MOVE]`/`[REWRITE]`/`[EXTRACT]` syntax. Just execution guidance for the dispatch agent.

**Success criterion:** The created `references/refactor-execution.md` must contain all of the following sections: "File Operations", "Pre-flight", "Verification", and "Per-stack patterns" (with subsections for Node.js, .NET, and Python).

### 2.6 Orchestrate — Iteration Awareness

**Step 1 change:**

After current text, add:
```
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
```

Note: The existing Step 1 logic uses `tmp/current-roadmap.md` for general feature tracking. Refactor roadmaps (`docs/monorepo-strategy/roadmap.md`, `docs/layer-architecture/roadmap.md`) are separate files checked in addition to `tmp/current-roadmap.md`. Refactor roadmap checks take priority — if a refactor roadmap has unchecked items, surface that suggestion before general feature prompts.

**Step 5 change — Execution model for refactor features:**

When the current feature is a refactor unit (matched via the roadmap check below), orchestrate dispatches implementation tasks using the file operation and verification patterns from `references/refactor-execution.md`. There is no separate dispatch agent — orchestrate executes the steps directly, following the Pre-flight → File Operations → Verification sequence defined in that reference file. This replaces implement-plan's execution model for refactor features.

Update the Step 5 description in the Steps 1-8 section of orchestrate SKILL.md to add a conditional branch: "If the current feature is a refactor unit (matched via roadmap check): skip execution model selection, execute directly using `references/refactor-execution.md` following Pre-flight → File Operations → Verification. Otherwise: Read `references/implementation-step.md` and proceed with execution model recommendation and dispatch."

**Step 5 change — Conditional Loading:**

Add to the Conditional Loading section:
```
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
```

**Step 8 Phase 2 change:**

Locate the Step 8 description in SKILL.md that ends with `recommendations → "What's next?"`. Insert the following block immediately after that sentence (after the closing `"What's next?"` text):

Before (existing Step 8 text, identifying the insertion point):
```
... cross-step synthesis, retrospective, improvement recommendations → "What's next?"
```

After (same existing text, plus the new block appended):
```
... cross-step synthesis, retrospective, improvement recommendations → "What's next?"

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

### 2.7 help Skill

**File:** `ai-dev-tools/skills/help/SKILL.md`

Remove implement-plan from the help output:
```
  /implement-plan           Execute a restructuring plan
```

Update the refactor skill descriptions to mention iterative unit-at-a-time:
```
  /refactor-to-monorepo     Analyze monolith, produce unit extraction roadmap
  /refactor-to-layers       Enforce layered architecture, produce unit roadmap
```

## Success Criteria

**Part 1:**
- `references/full-scan.md` is deleted
- Zero references to "full scan", "full-scan", or "Full Scan Fallback" remain in orchestrate SKILL.md
- Both standard and strict modes use the User Prompt when hint is missing/invalid
- Session-handoff asks before running `git log` when `gitStatus` is absent
- Session-handoff never runs `git diff --stat` or `git log -20` in the fallback path

**Part 2:**
- `implement-plan` skill directory is deleted (SKILL.md + 2 reference files)
- `references/refactor-execution.md` exists in orchestrate with distilled file-op/verification patterns
- Zero Serena references in refactor-to-monorepo and refactor-to-layers
- refactor-to-monorepo Phase 4 produces a roadmap + single-unit spec (not a complete migration plan)
- refactor-to-layers produces a roadmap + single-unit spec
- Both refactor skills support `--next-unit` mode
- orchestrate Step 1 suggests next unit when a roadmap with unchecked items exists
- orchestrate Step 5 loads refactor-execution.md for refactor features
- orchestrate Step 5 checklist filter end-to-end: after running refactor-to-monorepo with a unit that has matching checklist entries (Phase `coding` or `both`, Recommended Skill `refactor-to-monorepo`), those entries are surfaced to the user before execution begins at Step 5
- orchestrate Step 8 marks completed units and suggests the next
- help skill no longer lists implement-plan

## Files Changed

**Ordering constraint:** Create `orchestrate/references/refactor-execution.md` (copying pattern descriptions from `implement-plan/references/execution-patterns.md` — see section 2.5 for content spec) before deleting any implement-plan files. The implement-plan Delete rows must come after the Create row in execution order.

| File | Action |
|---|---|
| `orchestrate/references/full-scan.md` | Delete |
| `orchestrate/SKILL.md` | Edit: remove all full-scan refs, unify User Prompt for both modes, update fast-path, error handling, conditional loading, step 6 N derivation, inline cross-check, add refactor iteration awareness (Steps 1/5/8) |
| `orchestrate/references/refactor-execution.md` | Create: distilled file-op + verification patterns from implement-plan — **do this before deleting implement-plan files** |
| `session-handoff/SKILL.md` | Edit: replace full git fallback with ask-first pattern, remove implement-plan artifact references (the "Unfinished implement-plan tasks" block that parses [DONE] markers from strategy specs and references tmp/execution-report.md — both are implement-plan artifacts that no longer exist after deletion) |
| `implement-plan/SKILL.md` | Delete — **only after refactor-execution.md is created** |
| `implement-plan/references/execution-patterns.md` | Delete — **only after refactor-execution.md is created** |
| `implement-plan/references/verification-patterns.md` | Delete |
| `refactor-to-monorepo/SKILL.md` | Edit: remove Serena, change Phase 4 output to roadmap + single-unit spec, add --next-unit mode, add --next-unit to help-text USAGE/EXAMPLES, remove migration-plan.md artifact section from Step 4 Output Artifacts, remove Progressive Disclosure Schedule row for `Artifact generation: migration plan`, update Phase 4 checkpoint message, update checklist crystallization template (remove implement-plan from Recommended Skill column, Phase definition, and Write protocol note) |
| `refactor-to-layers/SKILL.md` | Edit: remove Serena, change output to roadmap + single-unit spec, add --next-unit mode, add --next-unit to help-text USAGE/EXAMPLES |
| `help/SKILL.md` | Edit: remove implement-plan, update refactor descriptions |
