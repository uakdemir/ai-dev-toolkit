# Checklists Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-local checklist accumulation to `refactor-to-monorepo` (writes) and `implement-plan` (reads/appends) so non-obvious extraction hazards survive across sessions.

**Architecture:** Three existing files are modified: `refactor-to-monorepo/SKILL.md` gains observation accumulation + crystallization, `module-spec-template.md` gains a new section 9, and `implement-plan/SKILL.md` gains checklist pre-flight + post-phase append. All changes are skill-definition markdown — no runtime code. The `tmp/checklists/` convention is documented inline in both SKILL.md files (self-contained, no shared reference file).

**Tech Stack:** Markdown skill definitions (SKILL.md), no build/test infrastructure.

---

### Task 1: Add section 9 "Extraction Hazards" to module-spec-template.md

**Files:**
- Modify: `ai-dev-tools/skills/refactor-to-monorepo/references/module-spec-template.md`

- [x] **Step 1: Add section 9 after section 8**

Append after the existing section 8 (Estimated Complexity). Insert at the end of the file:

```markdown

### 9. Extraction Hazards

<!-- Non-obvious hazards specific to this module. Omit this section if none detected. -->

- **<hazard type>:** `<file or pattern>` — <what goes wrong and what to do>
```

- [x] **Step 2: Verify the template has 9 sections**

Run: `grep -c '^### ' ai-dev-tools/skills/refactor-to-monorepo/references/module-spec-template.md`
Expected: `9`

- [x] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/refactor-to-monorepo/references/module-spec-template.md
git commit -m "feat(refactor-to-monorepo): add Extraction Hazards section to module spec template"
```

---

### Task 2: Add observation accumulation to refactor-to-monorepo Step 3

**Files:**
- Modify: `ai-dev-tools/skills/refactor-to-monorepo/SKILL.md`

Observations are accumulated during analysis phases 1-3 and surfaced at checkpoints. This task adds the instruction block that tells the agent what to watch for, how to tag observations, and how to surface them.

- [x] **Step 1: Add "Observation Accumulation" subsection before Phase 1**

Insert a new subsection between the Step 3 introduction (line 107: "Four phases, each building on the previous...") and Phase 1's heading (`### Phase 1: Domain Analysis`). The new block is:

```markdown

### Observation Accumulation (All Phases)

While executing phases 1-3, the agent watches for non-obvious extraction hazards in parallel with the phase's primary analysis goal. These observations feed into checklist generation after Phase 4.

**What to watch for:**

| Category | What to look for | Example |
|----------|-----------------|---------|
| Singleton state | Module-level `let`/`var` with mutation | `let _env = null` in `env.ts` |
| Shared DB patterns | Same query pattern (lookup + transform) in 3+ modules | `findFirst(customers) + decrypt(apiKey)` |
| Circular dependencies | Import cycles between proposed modules | A → B → C → A |
| Phantom dependencies | Imports that resolve only via hoisting | `import pino from 'pino'` without it in `package.json` |
| Test mock fragility | Barrel re-export mocks that become tautological after extraction | `vi.mock('@scope/pkg')` on internal delegation |
| Conditional export gaps | Missing `types` or `import` conditions in `package.json` exports | Only `types` → runtime crash; only `import` → no TS resolution |
| Build/config traps | Blanket `.gitignore` patterns, `declare module` resolution | `config` pattern matching `src/config/env.ts` |

**Tagging:** Each observation is tagged with the file path(s) where it was detected (e.g., `src/config/env.ts`). This tagging is used during artifact generation to associate observations with specific modules.

**Quality bar:** Only record observations that are counter-intuitive, invisible at compile time, or cause silent runtime failures. If the accumulated list exceeds ~20 entries, keep only the most severe per category (prioritize silent runtime failures over build-time failures).

**Observations are NOT written to disk during phases 1-3.** They are held in conversation context only.

**Checkpoint one-liner:** At each phase checkpoint (the existing user confirmation prompt), append accumulated observation counts:

```
[Observations: 2 singleton candidates, 1 shared DB pattern, 3 phantom dep candidates]
```

Omit the line if no observations were found in the phase.

> **Phase 2 note:** Phase 2 (data ownership) has no explicit "Wait for user confirmation" step. Observations accumulated during Phase 2 are deferred to the Phase 3 checkpoint. Do not add a new confirmation prompt to Phase 2.
```

- [x] **Step 2: Verify insertion**

Run: `grep -n "Observation Accumulation" ai-dev-tools/skills/refactor-to-monorepo/SKILL.md`
Expected: one match, in the Step 3 section, before Phase 1.

- [x] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/refactor-to-monorepo/SKILL.md
git commit -m "feat(refactor-to-monorepo): add observation accumulation during analysis phases 1-3"
```

---

### Task 3: Add crystallization sequence to refactor-to-monorepo

**Files:**
- Modify: `ai-dev-tools/skills/refactor-to-monorepo/SKILL.md`

After Phase 4 approval and before Step 4 artifact generation, the agent crystallizes accumulated observations into `tmp/checklists/` files. This task adds the crystallization instructions, the `tmp/checklists/` convention definition, and the always-included canonical entries.

- [x] **Step 1: Add "Checklist Crystallization" subsection between Phase 4 and Step 4**

Insert after the Phase 4 checkpoint ("Wait for user approval before generating artifacts.") and before `## Step 4: Output Artifacts`. The new block:

```markdown

### Checklist Crystallization (After Phase 4 Approval)

After the user approves the Phase 4 synthesis and before generating output artifacts (Step 4), crystallize accumulated observations into project-local checklists.

#### Convention: `tmp/checklists/`

All checklists live in `tmp/checklists/`. The directory contains an `index.md` registry and one or more checklist files.

**`index.md` format:**

```markdown
# Project Checklists

| Checklist | Description | Phase | Recommended Skill |
|-----------|-------------|-------|-------------------|
| [monorepo-extraction.md](monorepo-extraction.md) | Universal extraction pitfalls | both | refactor-to-monorepo, implement-plan |
```

**Column definitions:**

| Column | Values | Purpose |
|--------|--------|---------|
| Phase | `analysis`, `coding`, or `both` | `analysis` = refactor-to-monorepo phases 1-4, `coding` = implement-plan phases 1-N, `both` = both contexts |
| Recommended Skill | Comma-separated skill names | Filter: split on comma, trim whitespace, exact-match each element |

**Entry format** (each entry in a checklist file):

```markdown
### <short title>

- **Trigger:** <when this hazard applies>
- **Rule:** <what to do>
- **Why:** <what goes wrong if ignored>
```

Entries are appended, never reordered.

**Write protocol (for append operations by `implement-plan` — NOT used during crystallization):**

1. Read `index.md` to check if a matching file already exists.
2. If matching file exists, append entries. Do not create duplicates.
3. After creating a new file, add a row to `index.md`.
4. If `tmp/checklists/` does not exist, create it and `index.md` together.

#### Crystallization Sequence

> **Note:** Crystallization is the initial population event and is exempt from the append-only write protocol above. On re-run, delete existing contents before proceeding.

1. If `tmp/checklists/` already exists (re-run), delete all contents (files and subdirectories), including any entries appended by `implement-plan` during a prior lifecycle. Create `tmp/checklists/` if it does not exist.
2. Generate a **universal checklist** (`tmp/checklists/monorepo-extraction.md`). Always emitted. Include:
   - Entries from accumulated observations matching universal categories: singleton state, shared DB patterns, circular dependencies, `.gitignore` blanket pattern traps
   - **Always-included entries** (regardless of observations):

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

   - Unused destructured variables after service extraction (always included — mechanical hazard)
   - **Fallback for unowned observations:** observations tagged to files not owned by any module (shared/, config files) are also added here.

3. If tech stack is options 1-5 (not "Other") AND at least one stack-specific observation was accumulated, generate a **stack-specific checklist**. Skip entirely if zero stack-specific observations. File name mapping:

   | Stack option | File name |
   |---|---|
   | 1 (Node.js + React) | `node-ts-extraction.md` |
   | 2 (Node.js + Vue) | `node-ts-extraction.md` |
   | 3 (.NET + React) | `dotnet-extraction.md` |
   | 4 (.NET + Vue) | `dotnet-extraction.md` |
   | 5 (Python + React) | `python-extraction.md` |

   Stack-specific categories by stack:
   - Node.js/TypeScript: conditional exports, pnpm phantom deps, `vi.mock` barrel behavior, `declare module` type resolution
   - .NET: assembly binding redirects, `InternalsVisibleTo` breaks, shared `appsettings.json` ownership
   - Python: relative import breakage, `sys.modules` singleton state, `conftest.py` fixture visibility

4. Create `index.md` with rows for each generated file. Use Phase = `both` for all rows.

**Empty checklist prevention:** If zero non-obvious findings beyond always-included entries, still emit the universal checklist with the always-included entries.
```

- [x] **Step 2: Verify insertion**

Run: `grep -n "Checklist Crystallization" ai-dev-tools/skills/refactor-to-monorepo/SKILL.md`
Expected: one match, between Phase 4 and Step 4.

- [x] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/refactor-to-monorepo/SKILL.md
git commit -m "feat(refactor-to-monorepo): add checklist crystallization after Phase 4 approval"
```

---

### Task 4: Add migration-plan "Checklists" section instruction

**Files:**
- Modify: `ai-dev-tools/skills/refactor-to-monorepo/SKILL.md`

This task adds a brief instruction to the migration-plan.md artifact section telling the agent to include a "Checklists" reference section.

- [x] **Step 1: Add Checklists instruction to the migration-plan.md section**

In Step 4: Output Artifacts, find the `### 6. migration-plan.md — Phased Migration Plan` section. At the end of that section's Structure block (after the description of Phase 1-N and the closing note), insert:

```markdown

- **Checklists** — reference section pointing to relevant checklist files. Placed after the phase listing:

  ```markdown
  ## Checklists

  Before each extraction phase, consult:
  - `tmp/checklists/monorepo-extraction.md` — universal extraction pitfalls
  - `tmp/checklists/<stack>-extraction.md` — stack-specific hazards

  Per-module hazards are noted in each module's spec under "Extraction Hazards".
  ```

  Omit the stack-specific line if "Other" was selected or if zero stack-specific observations were accumulated.
```

- [x] **Step 2: Add population rule to module spec section**

In Step 4: Output Artifacts, find the `### 4. modules/<name>.md — Per-Module Specifications` section. After the existing text, append:

```markdown

Each spec now includes a 9th section: "Extraction Hazards". During artifact generation, filter accumulated observations where the tagged file path(s) belong to that module's Owned Files list. Populate section 9 with matching entries. Omit the section entirely if no observations match. Observations tagged to files not owned by any module are added to the universal checklist instead (see Checklist Crystallization).
```

- [x] **Step 3: Verify both insertions**

Run: `grep -n "Checklists" ai-dev-tools/skills/refactor-to-monorepo/SKILL.md`
Expected: matches in the migration-plan.md section (new) and in the Checklist Crystallization section (from Task 3).

Run: `grep -n "Extraction Hazards" ai-dev-tools/skills/refactor-to-monorepo/SKILL.md`
Expected: matches in the module spec section (new) and in the Checklist Crystallization section (from Task 3).

- [x] **Step 4: Commit**

```bash
git add ai-dev-tools/skills/refactor-to-monorepo/SKILL.md
git commit -m "feat(refactor-to-monorepo): add Checklists section to migration-plan output"
```

---

### Task 5: Add checklist integration to implement-plan SKILL.md

**Files:**
- Modify: `ai-dev-tools/skills/implement-plan/SKILL.md`

This task adds checklist pre-flight reading, module-spec hazard reading, post-phase append behavior, and the no-checklist fallback to implement-plan's Monorepo Plan Execution Phases section.

- [x] **Step 1: Add "Checklist Integration" subsection**

Insert a new subsection at the beginning of the "Monorepo Plan Execution Phases" section — after the section intro paragraph (line 281: "For monorepo plans, Step 7 forks...") and the cross-package import note (line 283), but before `### Phase 0: Preparation`. The new block:

```markdown

### Checklist Pre-Flight (Phases 1-N)

Before each Phase 1-N, check for project-local checklists generated by `refactor-to-monorepo`:

**Convention summary:** Checklists live in `tmp/checklists/`. The directory contains an `index.md` registry (table with Checklist, Description, Phase, Recommended Skill columns) and one or more checklist files. Each checklist entry has a `### title` with Trigger / Rule / Why fields. The `Recommended Skill` column is comma-separated; match by splitting on comma, trimming whitespace, and exact-matching each element.

**Pre-flight steps:**

1. Check if `tmp/checklists/index.md` exists. If not, skip checklist pre-flight entirely (this is not an error — the analysis may predate this feature).
2. Read `index.md` and filter for rows where Phase = `coding` or `both` AND Recommended Skill includes `implement-plan`.
3. Load the filtered checklist files.
4. Locate the current phase's module spec at `docs/monorepo-strategy/modules/<module-name>.md`. If it exists and contains a "### 9. Extraction Hazards" section, read those hazards and keep them in context alongside checklist entries. If missing, proceed without module-specific hazards.
5. Evaluate each entry's trigger condition in two stages:
   - **Stage 1 (lightweight):** Evaluate using file names, migration plan notes, and module spec context only — no content reads.
   - **Stage 2 (content read):** Only for triggers that remain ambiguous after stage 1, read relevant file contents.
6. Keep flagged entries in context during the phase. Verify each flagged rule is satisfied before marking the phase complete.

**Phase 0 exception:** Phase 0 is excluded from checklist pre-flight on first execution (checklists are fresh in context from the just-completed analysis). Exception: when re-executing Phase 0 in a resumed session (after a session boundary), apply checklist pre-flight as for Phases 1-N.

### Checklist Append (After Each Phase)

After each phase's checkpoint passes, evaluate whether any new non-obvious hazards were discovered during execution:

1. **De-duplication check:** Read the target checklist file and check whether an entry with a substantively identical trigger already exists. If so, skip.
2. **Target file selection:** Stack-agnostic hazards → `monorepo-extraction.md`. Stack-dependent hazards → stack-specific file (e.g., `node-ts-extraction.md`). If the stack-specific file does not exist, fall back to `monorepo-extraction.md`. If the target file does not exist on disk, create it and add its row to `index.md`.
3. **Quality bar:** Only append hazards that are counter-intuitive, invisible at compile time, or cause silent runtime failures. Do not append mechanical steps already in the migration plan.
4. **Write protocol:** Read `index.md` first. If the target file already exists, append only. After creating a new file, add its row to `index.md`. After appending to an existing file, do not modify `index.md`.

**No-checklist path:** If `tmp/checklists/index.md` does not exist, proceed normally with no warning. Checklists are additive, not required.
```

- [x] **Step 2: Verify insertion**

Run: `grep -n "Checklist Pre-Flight" ai-dev-tools/skills/implement-plan/SKILL.md`
Expected: one match, before Phase 0 in the Monorepo section.

Run: `grep -n "Checklist Append" ai-dev-tools/skills/implement-plan/SKILL.md`
Expected: one match, after the Pre-Flight section.

- [x] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/implement-plan/SKILL.md
git commit -m "feat(implement-plan): add checklist pre-flight and post-phase append for monorepo migrations"
```

---

### Task 6: Self-review and final commit

**Files:**
- All three modified files

- [x] **Step 1: Cross-reference check**

Verify consistency across all three files:
1. The entry format (### title + Trigger/Rule/Why) is described identically in refactor-to-monorepo (crystallization convention) and implement-plan (convention summary).
2. The `index.md` column names and matching semantics (comma-split, trim, exact-match) are described identically.
3. The Phase column values (`analysis`/`coding`/`both`) and their mappings are consistent.
4. The Phase 0 exception wording in implement-plan matches the spec.
5. The module spec section 9 template in module-spec-template.md matches the examples in refactor-to-monorepo SKILL.md.

Run: `grep -c "Trigger.*Rule.*Why" ai-dev-tools/skills/refactor-to-monorepo/SKILL.md ai-dev-tools/skills/implement-plan/SKILL.md`
Expected: both files reference the format.

- [x] **Step 2: Verify no orphaned references**

Check that the migration-plan Checklists section references match the file names in the stack mapping table:
- `monorepo-extraction.md` — referenced in migration-plan template and in implement-plan append target
- `<stack>-extraction.md` — referenced in migration-plan template

Run: `grep "monorepo-extraction.md" ai-dev-tools/skills/refactor-to-monorepo/SKILL.md ai-dev-tools/skills/implement-plan/SKILL.md`
Expected: matches in both files.

- [x] **Step 3: Fix any inconsistencies found**

If cross-reference check finds mismatches, apply targeted edits to align wording.

- [x] **Step 4: Final commit (if fixes were needed)**

```bash
git add ai-dev-tools/skills/refactor-to-monorepo/SKILL.md ai-dev-tools/skills/refactor-to-monorepo/references/module-spec-template.md ai-dev-tools/skills/implement-plan/SKILL.md
git commit -m "fix(checklists): align cross-file references after self-review"
```

Skip this commit if no fixes were needed in Step 3.
