# ADR Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ADR (Architecture Decision Record) lifecycle management to three existing skills — document-for-ai gains ADR extraction, orchestrate integrates it at Steps 4 and 8, and review-code gains scope-based ADR filtering.

**Architecture:** No new skills. Three reference files updated, one new reference file created (`adr-extraction.md`), and three SKILL.md files modified. The extraction algorithm lives in a single reference file consumed by both the standalone command and orchestrate — one source of truth.

**Tech Stack:** Markdown skill files and reference files. No runtime code.

**Spec:** `docs/superpowers/specs/2026-03-28-adr-lifecycle-design.md`

---

## File Structure

```
ai-dev-tools/skills/
├── document-for-ai/
│   ├── SKILL.md                          # Modify: ADR command, UPDATE/AUDIT extensions, lifecycle, archival
│   └── references/
│       ├── doc-templates.md              # Modify: add 6th template (adr)
│       ├── frontmatter-schema.md         # Modify: add adr purpose, status, spec_source fields
│       ├── audit-checklist.md            # Modify: add ADR scoring criteria
│       └── adr-extraction.md             # Create: complete extraction algorithm
├── orchestrate/
│   └── SKILL.md                          # Modify: Step 4 ADR pre-processing, Step 8 quality gate
└── review-code/
    └── SKILL.md                          # Modify: scope-based ADR filtering in Step 2
```

---

### Task 1: Add ADR Template to doc-templates.md

**Files:**
- Modify: `ai-dev-tools/skills/document-for-ai/references/doc-templates.md`

- [ ] **Step 1: Read the current file**

Read `ai-dev-tools/skills/document-for-ai/references/doc-templates.md` to understand the existing structure. Note the 5 existing templates (architecture, api, data-model, guide, troubleshooting) and the Template Selection Rules section that follows.

- [ ] **Step 2: Add the ADR template**

Insert the following section **after** the `## Template: troubleshooting` section and its content, and **before** the `## Template Selection Rules` section:

```markdown
---

## Template: adr

Use when documenting an architectural decision — a choice with significant reversibility cost or blast radius that future development must respect. ADRs are never auto-detected from code analysis. They are only produced via explicit `/document-for-ai adr {spec_path}` command invocation.

- **Title**: The decision in imperative or declarative form.
- **Status**: One of: Proposed, Accepted, Superseded, Deprecated.
- **Context**: Why this decision was needed. What forces were in play.
- **Decision**: What was chosen. Be specific — name the technology, pattern, or approach.
- **Alternatives Considered**: What was rejected and why. List each alternative with the reason it was not chosen.
- **Consequences**: Trade-offs accepted. What becomes easier, what becomes harder.
```

**Important:** Do NOT add `adr` to the numbered Template Selection Rules (rules 1-5). The ADR template is only used via explicit command, never auto-detected. Update the opening paragraph of doc-templates.md from "Five purpose-specific templates" to "Six purpose-specific templates".

- [ ] **Step 3: Verify the change**

Run: `grep -c "## Template:" ai-dev-tools/skills/document-for-ai/references/doc-templates.md`
Expected: `6` (architecture, api, data-model, guide, troubleshooting, adr)

Run: `grep "Six purpose-specific" ai-dev-tools/skills/document-for-ai/references/doc-templates.md`
Expected: matches the updated opening line

- [ ] **Step 4: Commit**

```bash
git add ai-dev-tools/skills/document-for-ai/references/doc-templates.md
git commit -m "feat(document-for-ai): add ADR template to doc-templates.md

Add the 6th template (adr) with sections: Title, Status, Context,
Decision, Alternatives Considered, Consequences. Not added to the
auto-detection selection rules — ADRs are only produced via explicit
command invocation."
```

---

### Task 2: Update frontmatter-schema.md with ADR Fields

**Files:**
- Modify: `ai-dev-tools/skills/document-for-ai/references/frontmatter-schema.md`

- [ ] **Step 1: Read the current file**

Read `ai-dev-tools/skills/document-for-ai/references/frontmatter-schema.md`. Note the existing field definitions and the `purpose` field's allowed values.

- [ ] **Step 2: Update the purpose field**

In the `## Field Definitions` section, change the `purpose` line from:

```
- `purpose` (required): One of: `architecture`, `api`, `data-model`, `guide`, `troubleshooting`. Determines which template was used.
```

to:

```
- `purpose` (required): One of: `architecture`, `api`, `data-model`, `guide`, `troubleshooting`, `adr`. Determines which template was used.
```

- [ ] **Step 3: Add status and spec_source field definitions**

After the `code_paths` field definition, add:

```markdown
- `status` (required when `purpose: adr`, not applicable to other doc types): One of: `Proposed`, `Accepted`, `Superseded`, `Deprecated`. **This is the single authoritative source for ADR status.** The body's Status line and the index table's Status column are display copies derived from this field. When status changes, update frontmatter first; body and index are updated to match.
- `spec_source` (required when `purpose: adr`, not applicable to other doc types): Path to the spec this ADR was extracted from. Enables UPDATE mode to detect when a spec changes and re-check the ADR. Example: `docs/superpowers/specs/2026-03-28-feature-design.md`.
```

- [ ] **Step 4: Add ADR frontmatter example**

After the existing `## Valid Example` section and its content, add:

```markdown
## ADR Example

```yaml
---
scope: auth
purpose: adr
status: Accepted
ai_keywords: [Redis, sessions, encryption, auth]
last_verified: 2026-03-28
code_paths: [src/auth/, src/middleware/]
spec_source: docs/superpowers/specs/2026-03-28-auth-design.md
---
```

**ADR validation:** AUDIT mode treats `status` and `spec_source` as required when `purpose: adr` and ignores them for all other purpose values. Presence of these fields on a non-ADR doc is not an error.
```

- [ ] **Step 5: Verify the changes**

Run: `grep "adr" ai-dev-tools/skills/document-for-ai/references/frontmatter-schema.md`
Expected: matches in purpose field, status definition, spec_source definition, and ADR example

Run: `grep "spec_source" ai-dev-tools/skills/document-for-ai/references/frontmatter-schema.md`
Expected: at least 2 matches (field definition + example)

- [ ] **Step 6: Commit**

```bash
git add ai-dev-tools/skills/document-for-ai/references/frontmatter-schema.md
git commit -m "feat(document-for-ai): add ADR fields to frontmatter-schema.md

Add adr as 6th purpose value. Add status (Proposed/Accepted/Superseded/
Deprecated) and spec_source fields, both required for ADRs only.
Include ADR-specific example and validation rules."
```

---

### Task 3: Add ADR Scoring Criteria to audit-checklist.md

**Files:**
- Modify: `ai-dev-tools/skills/document-for-ai/references/audit-checklist.md`

- [ ] **Step 1: Read the current file**

Read `ai-dev-tools/skills/document-for-ai/references/audit-checklist.md`. Note the existing 3-dimension scoring and the Accuracy Scoping Guidance section at the end.

- [ ] **Step 2: Add ADR scoring section**

Append the following after the `## Accuracy Scoping Guidance` section:

```markdown

---

## ADR Scoring: Reversibility × Blast Radius

Used during ADR extraction (see `references/adr-extraction.md`) to determine which architectural decisions qualify for formal ADRs. Score = Reversibility × Blast radius (range 1-9). Only candidates scoring >= 4 are extracted.

### Reversibility Cost

| Score | Description | Examples |
|-------|-------------|----------|
| 3 (High) | Requires migration, data rewrite, or API breaking change to undo | Database engine choice, auth protocol, public API contract |
| 2 (Medium) | Significant refactor but no data/API impact | Internal service boundaries, state management approach |
| 1 (Low) | Localized change, easy to swap | Naming conventions, file organization, utility library choice |

### Blast Radius

| Score | Description | Examples |
|-------|-------------|----------|
| 3 (High) | Crosses module boundaries, affects multiple consumers | Event bus architecture, shared middleware, data format |
| 2 (Medium) | Affects full module/feature | Module-internal storage, single-feature auth flow |
| 1 (Low) | Affects single file or function | Helper function implementation, single test fixture |

### Calibration Examples

| Decision | Reversibility | Blast Radius | Score | Qualifies? |
|----------|--------------|--------------|-------|------------|
| Use Redis for encrypted session storage | 3 (data migration) | 2 (auth module) | 6 | Yes |
| Event-driven notification dispatch | 3 (rewrite publishers/consumers) | 3 (crosses modules) | 9 | Yes |
| Name controllers with -Controller suffix | 1 (rename refactor) | 1 (single file each) | 1 | No |
| Use JWT for stateless auth tokens | 3 (token migration) | 2 (auth module) | 6 | Yes |
| Store config in YAML not JSON | 1 (file conversion) | 2 (all config consumers) | 2 | No |

### Filtering

- Keep top 3 candidates with score >= 4.
- If fewer than 3 qualify, keep only those that do.
- If zero qualify, return empty — no ADRs generated.
```

- [ ] **Step 3: Verify the change**

Run: `grep "Reversibility" ai-dev-tools/skills/document-for-ai/references/audit-checklist.md`
Expected: multiple matches from the new section

Run: `grep "Calibration Examples" ai-dev-tools/skills/document-for-ai/references/audit-checklist.md`
Expected: 1 match

- [ ] **Step 4: Commit**

```bash
git add ai-dev-tools/skills/document-for-ai/references/audit-checklist.md
git commit -m "feat(document-for-ai): add ADR scoring criteria to audit-checklist.md

Add Reversibility × Blast Radius scoring matrix with calibration examples.
Score range 1-9, threshold >= 4, top 3 cap. Used during ADR extraction
to filter low-value decisions."
```

---

### Task 4: Create adr-extraction.md Reference File

**Files:**
- Create: `ai-dev-tools/skills/document-for-ai/references/adr-extraction.md`

This is the single algorithm definition consumed by both the standalone `/document-for-ai adr` command and orchestrate Step 4.

- [ ] **Step 1: Create the file**

Create `ai-dev-tools/skills/document-for-ai/references/adr-extraction.md` with the content below. This file contains the complete extraction algorithm from spec Sections 2.1-2.4.

```markdown
# ADR Extraction Algorithm

Single source of truth for ADR extraction. Consumed by:
- `/document-for-ai adr {spec_path}` (standalone command)
- orchestrate Step 4 (inline pre-processing before writing-plans)

Both execution contexts follow this same algorithm. Neither defines or extends it.

---

## Invocation

```
/document-for-ai adr {spec_path}
```

Bypasses the standard document-for-ai workflow (Steps 1-4). Proceeds directly to the extraction algorithm below. Index and AI_INDEX.md updates correspond to the standard workflow's Step 5 (Output).

**Scan root** for `code_paths` inference (step 5c):
- **Standalone** (`/document-for-ai adr`): uses CWD.
- **Orchestrate Step 4**: uses the git repository root.

---

## Algorithm

### Step 1: Read Spec

Read the spec at `{spec_path}`.

### Step 2: Scan for Candidate Decisions

- **Explicit:** Sections with "Decision" in header + markdown tables with Choice/Rationale columns. Each table row = one candidate.
- **Implicit (v2 — deferred):** Prose containing choice language. Deferred because boundary rules for what constitutes a "distinct choice" in prose are ambiguous. v1 extracts only from explicit Decision tables.

### Step 3: Score Each Candidate

Use the Reversibility × Blast Radius matrix from `references/audit-checklist.md`.

Score = Reversibility × Blast radius (range 1-9).

### Step 4: Filter

Keep top 3 candidates with score >= 4. If fewer than 3 qualify, keep only those that do. If zero qualify, go to the Zero-ADR Case section below.

### Step 5: Write ADR Files

For each qualifying decision:

#### 5a. Deduplication Check

Before allocating a number, scan existing ADRs in `docs/architecture/adrs/` (including `archive/`) for any file whose frontmatter matches ALL THREE:
- `spec_source` matches `{spec_path}`
- `scope` matches the candidate's derived scope
- filename stem matches the candidate's title slug (lowercase, hyphenated)

All three must match. This allows multiple distinct decisions from the same spec and scope. If a match is found, skip this candidate — the ADR already exists. This makes extraction idempotent.

#### 5b. Allocate Number

Determine next NNNN from the highest existing number across both `docs/architecture/adrs/` and `docs/architecture/adrs/archive/`. ADR numbers are monotonic and never reused. If the target file already exists, increment until an unused number is found.

#### 5c. Derive Frontmatter

| Field | Rule |
|-------|------|
| `scope` | Module/feature name from decision context. Derive from: (1) spec's scope if stated, (2) Decision table row context, (3) nearest section header. Lowercase, hyphenated. |
| `purpose` | Always `adr`. |
| `status` | `Accepted` (extracted from approved spec). For manually created ADRs, use `Proposed`. |
| `ai_keywords` | 3-5 terms: technology/pattern chosen, domain, alternatives named. |
| `last_verified` | Today's date (`YYYY-MM-DD`). |
| `code_paths` | Inferred from scope/module references. Scan the project tree (see Scan root above) for directories matching the decision's scope (case-insensitive). Prefer most specific (deepest) match. If no directory exists yet, use expected path and note as planned. |
| `spec_source` | Set to `{spec_path}`. |

#### 5d. Map Spec Content to ADR Body

| ADR Section | Source |
|-------------|--------|
| **Title** | Decision column value or synthesized from context. |
| **Status** | Accepted (from approved spec). |
| **Context** | Surrounding section prose that motivated the decision. |
| **Decision** | Choice column value or selected option. |
| **Alternatives Considered** | Rationale column's rejected options, or "Not documented in spec." |
| **Consequences** | Rationale column's trade-off language, or "See spec for full context." |

#### 5e. Overlap Check

Before writing, compare the new ADR's `code_paths` against existing Accepted ADRs. If an existing ADR has overlapping `code_paths` AND its Decision section addresses the same domain, include a warning in the extraction summary:

> "Note: New ADR '{title}' overlaps with existing ADR {NNNN} '{old_title}'. Review for potential supersession after implementation."

Informational only — the new ADR is still written. Resolution is deferred to the next UPDATE/AUDIT pass.

#### 5f. Write File

Write to `docs/architecture/adrs/NNNN-{title}.md` using the `adr` template from `references/doc-templates.md` + frontmatter from `references/frontmatter-schema.md`. Create the `docs/architecture/adrs/` directory if it does not exist.

### Step 6: Update Index

Update `docs/architecture/adrs.md` index. If the file does not exist, create it with:

```markdown
# Architecture Decision Records

| # | Title | Status | Date | Scope | Link |
|---|-------|--------|------|-------|------|
| NNNN | {title} | Accepted | {date} | {scope} | [ADR](adrs/NNNN-{title}.md) |
```

Regenerated whenever ADRs are created, archived, or consolidated.

### Step 7: Update AI_INDEX.md

Add entries for new ADRs. If AI_INDEX.md does not exist, create it following document-for-ai's AI_INDEX.md Format section.

### Step 8: Return Summary

List created ADRs with scores, count of filtered candidates, and any overlap warnings.

---

## Zero-ADR Case

If the spec contains no architectural decisions scoring >= 4, skip ADR generation silently. No empty files, no warning. Return summary with zero created ADRs and the count of filtered candidates:

> "No architectural decisions met the threshold ({N} candidates scored below 4)."

---

## Error Handling

### Partial Failure

If extraction fails after writing some ADR files but before completing index/AI_INDEX updates:
- Leave written ADR files in place. Report which files were written and which steps failed.
- The deduplication check (step 5a) makes retries safe — the next run skips already-created ADRs.
- To manually undo: delete the reported files.

### Orchestrate Step 4 Failure

If extraction fails during orchestrate, do not auto-proceed to writing-plans. Report the failure and offer three options:
1. **Retry extraction** — deduplication prevents duplicates, safe to re-run.
2. **Skip ADRs and write plan** — user explicitly chooses to proceed without ADRs.
3. **Exit** — no further action. Next `/orchestrate` re-attempts.

### Index/AI_INDEX Out of Sync

If ADR files exist but the index is stale (e.g., from a partial failure), the next extraction run or UPDATE/AUDIT pass regenerates the index from the files on disk.
```

- [ ] **Step 2: Verify the file**

Run: `grep -c "^###" ai-dev-tools/skills/document-for-ai/references/adr-extraction.md`
Expected: at least 10 (multiple subsections)

Run: `grep "Deduplication" ai-dev-tools/skills/document-for-ai/references/adr-extraction.md`
Expected: matches in step 5a

Run: `grep "spec_source.*scope.*title slug" ai-dev-tools/skills/document-for-ai/references/adr-extraction.md`
Expected: matches confirming the 3-field dedup key

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/document-for-ai/references/adr-extraction.md
git commit -m "feat(document-for-ai): create adr-extraction.md reference

Single source of truth for the ADR extraction algorithm. Consumed by
both standalone /document-for-ai adr command and orchestrate Step 4.
Covers scoring, filtering, deduplication, frontmatter derivation,
overlap check, error handling, and zero-ADR case."
```

---

### Task 5: Update document-for-ai SKILL.md — ADR Command and Lifecycle

**Files:**
- Modify: `ai-dev-tools/skills/document-for-ai/SKILL.md`

This task adds the ADR command override, UPDATE/AUDIT mode extensions, status lifecycle, and archival to the main skill file.

- [ ] **Step 1: Read the current file**

Read `ai-dev-tools/skills/document-for-ai/SKILL.md`. Note:
- The "Explicit command overrides" section (currently has only humanize)
- Mode: UPDATE section
- Mode: AUDIT section
- The reference files listed in the workflow overview

- [ ] **Step 2: Add adr-extraction.md to the reference file list**

In the "Workflow Overview" section, after the line:
```
- `references/audit-checklist.md` — scoring dimensions and priority formula
```

Add:
```
- `references/adr-extraction.md` — ADR extraction algorithm (used by the `adr` command)
```

- [ ] **Step 3: Add the ADR command to Explicit command overrides**

In the "Explicit command overrides" section under Step 2: Mode Detection, after the existing humanize override line, add:

```markdown
- `/document-for-ai adr {spec_path}` — extracts architectural decisions from the spec as ADR documents. Bypasses the standard workflow (Steps 1-4) and follows the extraction algorithm in `references/adr-extraction.md`. See the ADR Extraction section below.
```

- [ ] **Step 4: Add the ADR Extraction section**

Insert a new section after "Mode: HUMANIZE" and before "CLAUDE.md Templates". This section is a thin dispatcher — it points to the reference file for the algorithm details:

```markdown
## ADR Extraction

Triggered by `/document-for-ai adr {spec_path}`. This is an explicit command override — it bypasses mode detection and the standard workflow entirely.

**Algorithm:** Read and follow `references/adr-extraction.md`. That file contains the complete extraction algorithm: candidate scanning, scoring, filtering, deduplication, file writing, index updates, and error handling.

**File locations:**
- Individual ADRs: `docs/architecture/adrs/NNNN-{title}.md`
- Index: `docs/architecture/adrs.md`
- Archive: `docs/architecture/adrs/archive/NNNN-{title}.md`

**AI_INDEX.md integration:** ADR entries appear like any other doc:

| Doc | Purpose | Keywords | Path |
|-----|---------|----------|------|
| Redis session storage | adr | Redis, sessions, encryption, auth | docs/architecture/adrs/0001-redis-encrypted-session-storage.md |

---

## ADR Status Lifecycle

```
Proposed → Accepted → Superseded | Deprecated
```

- **Proposed:** Decision not yet confirmed. Reserved for manually created ADRs. Create file following the `adr` template and frontmatter schema, set `status: Proposed`, place in `docs/architecture/adrs/`. Transition to Accepted by changing the frontmatter `status` field after team review.
- **Accepted:** Active constraint. Enforced by review-code.
- **Superseded:** Replaced by a newer ADR. The superseding ADR's body references the old one. Moved to `archive/`.
- **Deprecated:** No longer relevant (module removed, technology abandoned). Moved to `archive/`.

### Archival

Status transitions to Superseded/Deprecated are user-confirmed actions. When UPDATE mode flags decision-code drift or AUDIT flags "potentially superseded," the user is presented with the option. Archival steps execute only after user confirmation.

When an ADR status changes to Superseded or Deprecated:
1. Move file from `docs/architecture/adrs/NNNN-{title}.md` to `docs/architecture/adrs/archive/NNNN-{title}.md`
2. Update `docs/architecture/adrs.md` index (remove from active table)
3. Update AI_INDEX.md (remove entry)
4. review-code never reads `archive/`
```

- [ ] **Step 5: Extend the UPDATE mode section**

In the existing "Mode: UPDATE" section, after step 5 ("Finalize"), add:

```markdown

### UPDATE: ADR Extension

When UPDATE mode encounters ADR files (`purpose: adr` in frontmatter), apply these additional checks:

**Decision-code drift detection:**
1. Read the ADR's `code_paths` files.
2. Analyze git commits since `last_verified`.
3. Flag as potential drift if:
   - A dependency or technology named in the Decision section was removed or replaced.
   - New code introduces patterns that contradict the Decision section. **Calibration:** Flag `SessionRepo.saveToPostgres()` when ADR says "Use Redis." Do NOT flag unrelated utility functions in the same directory.
   - Files in `code_paths` were deleted or moved.
4. Present specific commit hashes and diff hunks as evidence.

**Spec-ADR drift detection:**
If the spec at `spec_source` has been modified since `last_verified`, flag as potential spec-ADR drift. Present to user for review.

**Resolution:**
- If code matches decision: update `last_verified`, no changes needed.
- If code or spec contradicts decision: flag as conflict, do NOT auto-fix. Present: "ADR {NNNN} says '{decision}' but code at {path} shows '{reality}'. Update the ADR (decision changed) or flag as code drift?"

ADRs are decisions, not descriptions. Auto-fixing would silently change architectural intent.
```

- [ ] **Step 6: Extend the AUDIT mode section**

In the existing "Mode: AUDIT" section, after step 6 ("Offer to fix"), add:

```markdown

### AUDIT: ADR Extension

ADR files are scored on the same 3 dimensions (Accuracy, Completeness, Format compliance) as other docs, plus one ADR-specific check:

**Status validity:** An ADR marked `Accepted` whose `code_paths` show contradicting patterns gets flagged as "potential drift or supersession." The follow-up prompt must distinguish:
- **Implementation drift** — code diverged from the decision (fix the code or update the ADR)
- **True supersession** — a newer decision replaced this one (archive the old ADR)

Do not change status or archive without this distinction.

**ADR field validation:** When `purpose: adr`, treat `status` and `spec_source` as required fields. Missing either = format compliance score of 1 for that doc.
```

- [ ] **Step 7: Verify the changes**

Run: `grep "adr-extraction.md" ai-dev-tools/skills/document-for-ai/SKILL.md`
Expected: at least 2 matches (reference list + ADR Extraction section)

Run: `grep "ADR Status Lifecycle" ai-dev-tools/skills/document-for-ai/SKILL.md`
Expected: 1 match

Run: `grep "UPDATE: ADR Extension" ai-dev-tools/skills/document-for-ai/SKILL.md`
Expected: 1 match

Run: `grep "AUDIT: ADR Extension" ai-dev-tools/skills/document-for-ai/SKILL.md`
Expected: 1 match

- [ ] **Step 8: Commit**

```bash
git add ai-dev-tools/skills/document-for-ai/SKILL.md
git commit -m "feat(document-for-ai): add ADR command, lifecycle, and mode extensions

Add /document-for-ai adr command override pointing to adr-extraction.md.
Add ADR Status Lifecycle (Proposed/Accepted/Superseded/Deprecated) with
archival. Extend UPDATE mode with decision-code and spec-ADR drift
detection. Extend AUDIT mode with status validity check."
```

---

### Task 6: Update orchestrate SKILL.md — Step 4 and Step 8

**Files:**
- Modify: `ai-dev-tools/skills/orchestrate/SKILL.md`

- [ ] **Step 1: Read the current file**

Read `ai-dev-tools/skills/orchestrate/SKILL.md`. Note:
- Step 4: WRITE PLAN section (trigger, behavior)
- Quality Gate Triggers table
- Priority ordering in Presentation Format

- [ ] **Step 2: Enhance Step 4 with ADR pre-processing**

Replace the current Step 4 section:

```markdown
### Step 4: WRITE PLAN

**Trigger:** Spec Approved (or Approved with suggestions), no matching plan file in `docs/superpowers/plans/`. Match plan files by extracting the feature name from the spec filename and looking for `*-{feature_name}-plan.md`.

**Behavior:**
- Present: "Spec approved. Ready to write the implementation plan?"
- On confirm: invoke `superpowers:writing-plans`
- The writing-plans skill produces a plan file in `docs/superpowers/plans/` with checkboxes for each task.
```

With this expanded version:

```markdown
### Step 4: WRITE PLAN

**Trigger:** Spec Approved (or Approved with suggestions), no matching plan file in `docs/superpowers/plans/`. Match plan files by extracting the feature name from the spec filename and looking for `*-{feature_name}-plan.md`.

**Behavior:**
- Present: "Spec approved. I'll extract architectural decisions as ADRs, then write the implementation plan. Proceed?"
- On confirm:
  1. **ADR extraction (inline pre-processing):** Follow the extraction algorithm in `ai-dev-tools/skills/document-for-ai/references/adr-extraction.md`. This is NOT a skill invocation — no conversation takeover. Read the reference file and execute the algorithm directly.
     - Report result (including any overlap warnings):

       If qualifying decisions found:
       > "Extracted {N} architectural decisions:
       >   1. [{score}] {title}
       >   2. [{score}] {title}
       >   Filtered: {M} low-impact decisions"

       If zero qualifying decisions:
       > "No architectural decisions met the threshold for ADRs."

     - **On extraction failure:** Do not auto-proceed. Report the failure and offer: (1) Retry extraction, (2) Skip ADRs and write plan, (3) Exit.

  2. **Invoke `superpowers:writing-plans`** (single skill takeover for this invocation).
- On decline: skip to next `/orchestrate` invocation. No files written.

**Design constraint:** One skill takeover per invocation maintained. ADR extraction is an inline pre-processing action, not a `/document-for-ai` skill invocation. The extraction algorithm is defined once in the reference file, consumed by both the standalone command and orchestrate. The only skill takeover in Step 4 is `superpowers:writing-plans`.

**Commit guidance:** ADR files and plan file are written to disk during Step 4 but not auto-committed. When committed, include `document-for-ai` in the commit message (e.g., `docs(document-for-ai): extract ADRs from feature-X spec`) so the Step 8 quality gate baseline detection works.
```

- [ ] **Step 3: Add document-for-ai quality gate to Step 8**

In the Quality Gate Triggers table, add a new row after the `test-audit` row and before the `consolidate` row:

```markdown
| document-for-ai | >15 files changed since last run | `git diff --name-only {baseline}..HEAD` where baseline = last commit with `document-for-ai` in message. **Fallback:** If no commit message contains `document-for-ai`, check `git log -- docs/architecture/adrs/ docs/architecture/adrs.md AI_INDEX.md` for the most recent commit touching any ADR artifact. No baseline from either = "never run," always recommend. | "Warning: {N} files changed since last doc update. Run `/document-for-ai`" |
```

- [ ] **Step 4: Update priority ordering**

In the Presentation Format section, update the priority order comment from:

```
- Priority order: convention-enforcer > api-contract-guard > test-audit > consolidate > refactor-to-layers > session-handoff.
```

to:

```
- Priority order: convention-enforcer > api-contract-guard > test-audit > document-for-ai > consolidate > refactor-to-layers > session-handoff.
```

- [ ] **Step 5: Add document-for-ai to quality gate skill tables**

In the "Quality gates" table under "Relationship to Other Skills", add a new row:

```markdown
| /document-for-ai | File count threshold |
```

Place it after the `/test-audit` row.

- [ ] **Step 6: Verify the changes**

Run: `grep "adr-extraction.md" ai-dev-tools/skills/orchestrate/SKILL.md`
Expected: 1 match (in Step 4)

Run: `grep "document-for-ai" ai-dev-tools/skills/orchestrate/SKILL.md | grep -c "quality\|gate\|threshold\|Warning\|baseline"`
Expected: at least 3 matches (quality gate table, priority order, detection)

Run: `grep "inline pre-processing" ai-dev-tools/skills/orchestrate/SKILL.md`
Expected: 1 match

- [ ] **Step 7: Commit**

```bash
git add ai-dev-tools/skills/orchestrate/SKILL.md
git commit -m "feat(orchestrate): add ADR extraction to Step 4 and doc quality gate to Step 8

Step 4 now extracts ADRs as inline pre-processing before invoking
writing-plans. One skill takeover per invocation preserved. Step 8
gains document-for-ai quality gate with dual-baseline detection
(commit message + ADR artifact git log)."
```

---

### Task 7: Update review-code SKILL.md — Scope-Based ADR Filtering

**Files:**
- Modify: `ai-dev-tools/skills/review-code/SKILL.md`

- [ ] **Step 1: Read the current file**

Read `ai-dev-tools/skills/review-code/SKILL.md`. Note:
- Step 2 "Read context" lists `docs/architecture/adrs.md`
- Step 4 "Collect target commits" and step 5 categories
- The Architecture category mentions "unresolved ADR constraints"

- [ ] **Step 2: Update Step 2 Read context**

In the Workflow section, replace the Step 2 entry:

```markdown
2. Read context:
   - CLAUDE.md (hard constraints)
   - docs/architecture/adrs.md (accepted architecture decisions)
   - [ANALYSIS_DOC] (spec contract for the milestone)
```

with:

```markdown
2. Read context:
   - CLAUDE.md (hard constraints)
   - ADRs via scope-based filtering (see ADR Discovery below)
   - [ANALYSIS_DOC] (spec contract for the milestone)
```

- [ ] **Step 3: Add ADR Discovery section**

Append a new top-level section at the end of the file, after the Output Template (which includes the Summary table). This section is referenced from Step 2 and replaces the single-line `adrs.md` read with a multi-step filtering procedure:

```markdown
## ADR Discovery

This procedure expands Step 2's ADR context loading. It runs before Step 4 (commit collection) — the diff enumeration in step 1 below is a lightweight pre-scan, not the full commit analysis.

If `docs/architecture/adrs/` directory does not exist, skip ADR loading silently.

### Filtering Algorithm

1. **Enumerate diff file paths.** Run `git diff --name-only HEAD~{COMMIT_COUNT}..HEAD` to collect changed file paths. This is lightweight and precedes ADR loading.

2. **Discover ADR files.** Build the candidate list by unioning two sources:
   - Read `docs/architecture/adrs.md` index to get linked ADR paths.
   - Enumerate `docs/architecture/adrs/*.md` directly (excluding `archive/`).

   Union both sets by file path. This ensures ADRs are found even when the index is stale, missing, or out of sync.

3. **Read frontmatter only.** For each discovered ADR, read only the YAML frontmatter (up to closing `---`). Extract `code_paths` and `status`.

4. **Status filter.** Skip any ADR where `status` is not `Accepted`. Frontmatter `status` is the single source of truth.

5. **Scope match.** Match each `code_paths` entry against the diff file paths from step 1:
   - **Directory entries** (ending in `/`): prefix match. `src/auth/` matches `src/auth/middleware.ts`.
   - **File entries** (no trailing `/`): exact match only. `src/auth.ts` matches only `src/auth.ts`.

   If any entry matches, load the full ADR file.

6. **Use as constraints.** Only loaded ADRs are used during the review (Step 5, Architecture category).

### Context Scaling

ADR context stays proportional to the review scope, not total ADR count:

| Total ADRs | Files in diff | ADRs loaded |
|------------|---------------|-------------|
| 10 | 5 files in src/auth/ | 2-3 (auth-scoped) |
| 30 | 5 files in src/auth/ | 2-3 (auth-scoped) |
| 60 | 5 files in src/auth/ | 2-3 (auth-scoped) |
```

- [ ] **Step 4: Verify the changes**

Run: `grep "ADR Discovery" ai-dev-tools/skills/review-code/SKILL.md`
Expected: 1 match

Run: `grep "scope-based filtering" ai-dev-tools/skills/review-code/SKILL.md`
Expected: 1 match (in Step 2)

Run: `grep "prefix match" ai-dev-tools/skills/review-code/SKILL.md`
Expected: 1 match (directory matching rule)

Run: `grep "exact match only" ai-dev-tools/skills/review-code/SKILL.md`
Expected: 1 match (file matching rule)

- [ ] **Step 5: Commit**

```bash
git add ai-dev-tools/skills/review-code/SKILL.md
git commit -m "feat(review-code): add scope-based ADR filtering

Replace single adrs.md read with multi-step discovery: union index +
directory enumeration, frontmatter-only read, status filter (Accepted
only), and code_paths scope matching (directory prefix / file exact).
Context scales with review scope, not total ADR count."
```

---

### Task 8: Cross-File Verification

**Files:**
- Read: all modified files

This task verifies internal consistency across all changes.

- [ ] **Step 1: Verify cross-references**

Check that all file references are consistent:

```bash
# adr-extraction.md references audit-checklist.md for scoring
grep "audit-checklist.md" ai-dev-tools/skills/document-for-ai/references/adr-extraction.md

# adr-extraction.md references doc-templates.md for template
grep "doc-templates.md" ai-dev-tools/skills/document-for-ai/references/adr-extraction.md

# adr-extraction.md references frontmatter-schema.md for fields
grep "frontmatter-schema.md" ai-dev-tools/skills/document-for-ai/references/adr-extraction.md

# document-for-ai SKILL.md references adr-extraction.md
grep "adr-extraction.md" ai-dev-tools/skills/document-for-ai/SKILL.md

# orchestrate references adr-extraction.md
grep "adr-extraction.md" ai-dev-tools/skills/orchestrate/SKILL.md

# review-code references frontmatter status field
grep "status" ai-dev-tools/skills/review-code/SKILL.md
```

Expected: all greps return matches.

- [ ] **Step 2: Verify naming consistency**

```bash
# NNNN-{title}.md naming is consistent
grep -r "NNNN-" ai-dev-tools/skills/document-for-ai/references/adr-extraction.md

# Status values are consistent (Proposed, Accepted, Superseded, Deprecated)
grep -c "Proposed\|Accepted\|Superseded\|Deprecated" ai-dev-tools/skills/document-for-ai/SKILL.md

# Dedup key is consistent (spec_source + scope + title slug)
grep "spec_source.*scope.*title slug\|spec_source.*scope.*filename stem" ai-dev-tools/skills/document-for-ai/references/adr-extraction.md
```

Expected: consistent naming across all files.

- [ ] **Step 3: Verify success criteria coverage**

Map each success criterion from the spec to the implementing task:

| Criterion | Task |
|-----------|------|
| 1. orchestrate auto-extracts ADRs before plan | Task 6 (Step 4 enhancement) |
| 2. review-code flags violations | Task 7 (ADR Discovery section) |
| 3. Scope-filtered context loading | Task 7 (Filtering Algorithm) |
| 4. AUDIT scores ADR files | Task 5 (AUDIT: ADR Extension) |
| 5. UPDATE detects drift | Task 5 (UPDATE: ADR Extension) |
| 6. Archived ADRs invisible to review-code | Task 7 (excludes `archive/`) + Task 5 (Archival) |
| 7. Idempotent extraction | Task 4 (step 5a dedup check) |
| 8. Monotonic numbering after archival | Task 4 (step 5b) |
| 9. Stale index fallback | Task 7 (union index + directory) |

Verify each criterion has a clear implementation location. If any is missing, add it before proceeding.
