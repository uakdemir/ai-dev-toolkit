# Full Scan Removal & Iterative Refactor

**Status:** Draft
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
   └── Different HEAD → User Prompt
```

Every path that previously said "full scan fallback" or "Read references/full-scan.md" now routes to "User Prompt."

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
2. Run `git branch --show-current` and `git status --short` (always — lightweight).
3. Ask: "I don't have the session start point. Want me to check recent git history
   to find session commits?"
   - If yes: run `git log --oneline --since="midnight" -20`.
     Note "session boundary estimated" in the handoff.
   - If no: conversation-only for commits. Set `session_commits: 0`.
```

The `git log --oneline -20` (unbounded recent history) and `git diff --stat HEAD` commands are removed from the fallback. Only `--since="midnight"` is available, and only with user approval.

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

**refactor-to-monorepo/SKILL.md:**
- Remove all references to Serena, `find_referencing_symbols`, `rename_symbol`, `replace_content`
- Remove Serena detection step or dual code paths (Serena mode / fallback mode)
- Remove references to `references/execution-patterns.md` (implement-plan's file)

**refactor-to-layers/SKILL.md:**
- Same removals

**refactor-to-monorepo/references/execution-patterns.md** and any Serena-specific content in reference files: remove Serena paths, keep only the regex/grep-based approach as the sole approach.

Note: if refactor-to-monorepo references implement-plan's execution-patterns.md (not its own), those references are removed when implement-plan is deleted. The useful patterns are extracted into the new orchestrate reference file.

### 2.4 Refactor Skills — Roadmap + Single-Unit Output

#### refactor-to-monorepo

**Phase 4 (Synthesis) output changes.**

Before: produces a complete migration plan (`docs/monorepo-strategy/migration-plan.md`) with all modules, all phases (0-N), all file moves, all import rewrites.

After: produces two artifacts:
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

2. **Single-unit spec** — detailed analysis for the first unchecked module only. Contains: module boundary, files to extract, dependencies to sever, interface to expose, expected import rewrites. This is a normal spec (`docs/superpowers/specs/YYYY-MM-DD-extract-<module>-design.md`) that enters the orchestrate cycle at Step 2.

**New `--next-unit` mode:**

Trigger: invoked when a unit roadmap exists with unchecked items and the previous unit is finalized. Behavior:
1. Read the roadmap, identify next unchecked unit
2. Read prior extraction specs/plans for context (what was learned)
3. Read current codebase state (the monolith has changed since the last extraction)
4. Produce a single-unit spec for the next module

Skips the full 4-phase analysis — uses existing strategy docs as context. The user can brainstorm adjustments during the normal orchestrate cycle.

#### refactor-to-layers

**Same pattern:**
- Discovery produces a layer roadmap (`docs/layer-strategy/roadmap.md`) + first layer's spec
- `--next-unit` mode for subsequent layers
- The layer hierarchy (Types > Config > Data > Service > Providers > API > UI) provides natural ordering — extract bottom-up

### 2.5 New: `references/refactor-execution.md` (orchestrate)

Loaded at Step 5 only when a refactor roadmap exists (`docs/monorepo-strategy/roadmap.md` or `docs/layer-strategy/roadmap.md`) and the current feature name appears in that roadmap.

Content distilled from implement-plan's execution-patterns.md and verification-patterns.md (~100 lines):

**File Operations:**
- `mkdir -p` for folder creation (idempotent)
- `git mv` for file moves (preserves history)
- Move dependency ordering: if B imports A and both move, move A first
- Import rewrite: grep old paths, replace with new package paths
- Per-stack regex patterns (Node.js: `import`/`require` + tsconfig paths; .NET: `using` + csproj refs; Python: `import`/`from` + `__init__.py`)

**Pre-flight:**
- Source existence check (report all missing before starting)
- Target collision check (warn on existing targets for moves)
- Clean git state required

**Verification:**
- After file moves: assert source gone + target present. Do NOT build (imports still point to old paths)
- After import rewrites: run full build/type-check (first point where compilation should succeed)
- Per-stack commands: `tsc --noEmit` / `dotnet build` / `python -m py_compile`

No Serena. No `[CREATE]`/`[MOVE]`/`[REWRITE]`/`[EXTRACT]` syntax. Just execution guidance for the dispatch agent.

### 2.6 Orchestrate — Iteration Awareness

**Step 1 change:**

After current text, add:
```
If a refactor roadmap exists (`docs/monorepo-strategy/roadmap.md` or
`docs/layer-strategy/roadmap.md`) with unchecked items and no active spec
for the next unit, suggest: "Next unit: `<name>`. Start brainstorming?"
If user confirms, invoke the originating refactor skill with --next-unit.
```

**Step 5 change — Conditional Loading:**

Add to the Conditional Loading section:
```
At Step 5 onset, if a refactor roadmap exists and the current feature
name appears in that roadmap:
  → Read references/refactor-execution.md for file operation, import rewrite,
    and verification patterns.
```

**Step 8 Phase 2 change:**

After the current "What's next?" logic, add:
```
If a refactor roadmap exists with unchecked items:
  → Mark the completed unit [x] in the roadmap file.
  → Print: "Unit `<completed>` done. Next on roadmap: `<next-unit>`."
  → Suggest: "Continue with brainstorming for `<next-unit>`?"
  → If user confirms, write hint (feature: next-unit, step: 1) and
    invoke the originating refactor skill with --next-unit.
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
- orchestrate Step 8 marks completed units and suggests the next
- help skill no longer lists implement-plan

## Files Changed

| File | Action |
|---|---|
| `orchestrate/references/full-scan.md` | Delete |
| `orchestrate/SKILL.md` | Edit: remove all full-scan refs, unify User Prompt for both modes, update fast-path, error handling, conditional loading, step 6 N derivation, inline cross-check, add refactor iteration awareness (Steps 1/5/8) |
| `orchestrate/references/refactor-execution.md` | Create: distilled file-op + verification patterns from implement-plan |
| `session-handoff/SKILL.md` | Edit: replace full git fallback with ask-first pattern |
| `implement-plan/SKILL.md` | Delete |
| `implement-plan/references/execution-patterns.md` | Delete |
| `implement-plan/references/verification-patterns.md` | Delete |
| `refactor-to-monorepo/SKILL.md` | Edit: remove Serena, change Phase 4 output to roadmap + single-unit spec, add --next-unit mode |
| `refactor-to-layers/SKILL.md` | Edit: remove Serena, change output to roadmap + single-unit spec, add --next-unit mode |
| `help/SKILL.md` | Edit: remove implement-plan, update refactor descriptions |
