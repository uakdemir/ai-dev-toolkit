---
**Date:** 2026-03-28
**Status:** Approved (R7 revisions applied)
**Plugin:** ai-dev-tools
**Skills modified:** document-for-ai, orchestrate, review-code
---

# ADR Lifecycle — Design Spec

## Problem Statement

Architectural decisions made during brainstorming are captured as prose in spec documents but never formalized into enforceable records. review-code expects `docs/architecture/adrs.md` for constraint enforcement, but this file does not exist. Decisions made in one feature cycle are invisible to future code reviews, leading to architectural drift that no current skill detects.

Meanwhile, orchestrate's 8-step loop never invokes document-for-ai. Documentation goes stale silently as features are implemented. The system recommends code quality gates (convention-enforcer, api-contract-guard, test-audit) but has a documentation blind spot.

## Enhancement Summary

Three enhancements to existing skills — no new skill created:

1. **document-for-ai** gains ADR as a 6th doc type with extraction, scoring, filtering, and lifecycle management.
2. **orchestrate** integrates document-for-ai at two points: Step 4 (ADR extraction before plan writing) and Step 8 (doc staleness quality gate).
3. **review-code** updated to read ADR directory with scope-based filtering instead of a single file.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| ADR ownership | document-for-ai, not a new skill | ADRs are structured documentation — same templates, frontmatter, AI_INDEX, AUDIT/UPDATE lifecycle. Keeps orchestrate as a thin dispatcher. |
| Integration point | Automatic in orchestrate Step 4 | Decisions are stable after spec approval. ADRs must exist before implementation so review-code can enforce them in Step 6. |
| Filtering mechanism | Reversibility x Blast radius scoring, top 3 cap | Prevents ADR bloat. Low-value decisions (naming, file organization) already enforced by convention-enforcer and refactor-to-layers. |
| review-code reads directory, not single file | Scope-filtered directory read | Full decision context (rationale, alternatives, consequences) needed for meaningful violation detection. Scope filtering keeps context constant regardless of total ADR count. |
| Growth management | Scope filtering + archival (consolidation deferred) | Filtering keeps review-code fast, archival removes superseded decisions. Consolidation deferred to v2 (see Section 5.5). |

---

## 1. ADR Doc Type in document-for-ai

### 1.1 Template

Added to `references/doc-templates.md` as the 6th template:

```
### adr

- Title
- Status (Proposed | Accepted | Superseded | Deprecated)
- Context (why this decision was needed)
- Decision (what was chosen)
- Alternatives Considered (what was rejected and why)
- Consequences (trade-offs accepted)
```

### 1.2 Frontmatter

Update `references/frontmatter-schema.md`:
- Add `adr` as the 6th allowed value for the `purpose` field: "One of: `architecture`, `api`, `data-model`, `guide`, `troubleshooting`, `adr`."
- Add `spec_source` field definition (see below).

```yaml
---
scope: "{feature-name}"
purpose: adr
status: "Accepted"
ai_keywords: ["{decision-domain}", "{technology}", "{pattern}"]
last_verified: "YYYY-MM-DD"
code_paths:
  - "src/auth/"
  - "src/middleware/"
spec_source: "docs/superpowers/specs/YYYY-MM-DD-feature-design.md"
---
```

- `status` (required for ADRs, not applicable to other doc types): one of `Proposed`, `Accepted`, `Superseded`, `Deprecated`. **This is the single authoritative source for ADR status.** The body's Status line and the index table's Status column are display copies derived from this field. review-code reads `status` from frontmatter during scope-filtering (Section 6.2-6.3) — it does not parse the body or the index for status. When status changes (Section 5.4), update frontmatter first; body and index are updated to match.
- `spec_source` (required for ADRs, not applicable to other doc types): links the ADR back to the spec it was extracted from. Enables UPDATE mode to detect when a spec changes and re-check the ADR.
- **Validation:** AUDIT mode treats `status` and `spec_source` as required when `purpose: adr` and ignores them for all other purpose values. Presence of these fields on a non-ADR doc is not an error.
- All other fields follow existing frontmatter-schema.md rules.

### 1.3 Template Selection Rule

The ADR template is NOT added to the numbered content-based fallback chain (rules 1-5) in `references/doc-templates.md`. Those rules are content-classification fallbacks used during MIGRATE mode. Instead, the ADR command is added to the "Explicit command overrides" section of `document-for-ai/SKILL.md`, alongside the existing humanize override:

```
**Explicit command overrides:**

- `/document-for-ai humanize [optional-path]` — triggers HUMANIZE mode directly, skipping mode detection.
- `/document-for-ai adr {spec_path}` — extracts ADR doc type from the spec's Design Decisions content (see Section 2).
```

ADRs are never auto-detected from code analysis. They are only produced via explicit `adr` command invocation with a spec path. The ADR template definition (Section 1.1) is added to `references/doc-templates.md` as the 6th template structure, but no selection rule for it exists in the numbered chain.

### 1.4 File Location

- Individual ADRs: `docs/architecture/adrs/NNNN-{title}.md` (NNNN = zero-padded sequential number)
- Index file: `docs/architecture/adrs.md` (consolidated table of all ADRs)
- Archive: `docs/architecture/adrs/archive/NNNN-{title}.md` (superseded/deprecated ADRs)

### 1.5 Index File Format

```markdown
# Architecture Decision Records

| # | Title | Status | Date | Scope | Link |
|---|-------|--------|------|-------|------|
| 0001 | Redis for encrypted session storage | Accepted | 2026-03-28 | auth | [ADR](adrs/0001-redis-encrypted-session-storage.md) |
| 0002 | Event-driven notification dispatch | Accepted | 2026-03-28 | notifications | [ADR](adrs/0002-event-driven-notification-dispatch.md) |
```

Regenerated whenever ADRs are created, archived, or consolidated.

### 1.6 AI_INDEX.md Integration

ADR entries appear in AI_INDEX.md like any other doc:

| Doc | Purpose | Keywords | Path |
|-----|---------|----------|------|
| Redis session storage | adr | Redis, sessions, encryption, auth | docs/architecture/adrs/0001-redis-encrypted-session-storage.md |

---

## 2. ADR Extraction Command

### 2.1 Invocation

```
/document-for-ai adr {spec_path}
```

Follows the same pattern as `/document-for-ai humanize [optional-path]` — an explicit command override. Add to the "Explicit command overrides" section of document-for-ai SKILL.md.

**Skipped steps:** The `adr` command bypasses the standard workflow entirely (Steps 1 through 4). It proceeds directly to the extraction algorithm (Section 2.2). Index and AI_INDEX.md updates (extraction steps 6-7) correspond to the standard workflow's Step 5 (Output).

**Scan root:** The `code_paths` inference in Section 2.2 step 5 scans the project tree to find matching directories. The scan root is determined by context:
- **Standalone invocation** (`/document-for-ai adr`): uses CWD. In a monorepo, invoke from the relevant package directory to scope correctly.
- **Orchestrate Step 4**: uses the git repository root (the project root where orchestrate operates). This ensures consistent `code_paths` regardless of where the user's shell is positioned.

No tech-stack or monorepo detection is needed — the extraction algorithm operates on the spec's explicit Decision table content, not on code analysis patterns.

### 2.2 Extraction Algorithm

1. Read the spec at `{spec_path}`.
2. Scan for candidate decisions:
   - **Explicit:** Sections with "Decision" in header + markdown tables with Choice/Rationale columns. Each table row = one candidate.
   - **Implicit (v2 — deferred):** Prose containing choice language ("chose X over Y", "decided to", "trade-off", "instead of"). Deferred because boundary rules for what constitutes a "distinct choice" in prose are ambiguous. v1 extracts only from explicit Decision tables.
3. Score each candidate on two dimensions:

| Dimension | 3 (High) | 2 (Medium) | 1 (Low) |
|-----------|----------|------------|---------|
| **Reversibility cost** | Requires migration, data rewrite, or API breaking change to undo | Significant refactor but no data/API impact | Localized change, easy to swap |
| **Blast radius** | Crosses module boundaries, affects multiple consumers | Affects full module/feature | Affects single file or function |

   **Score = Reversibility x Blast radius** (range 1-9).

   **Calibration examples:**
   - "Use Redis for encrypted session storage" -> Reversibility 3 (data migration to switch stores), Blast radius 2 (auth module only) -> Score 6, qualifies.
   - "Event-driven notification dispatch" -> Reversibility 3 (rewrite publishers and consumers), Blast radius 3 (crosses notification, email, SMS modules) -> Score 9, qualifies.
   - "Name controllers with -Controller suffix" -> Reversibility 1 (rename refactor), Blast radius 1 (single file each) -> Score 1, filtered.

4. Filter: keep top 3 candidates with score >= 4. If fewer than 3 qualify, keep only those that do. If zero qualify, return empty — no ADRs generated.
5. For each qualifying decision:
   - **Deduplication check:** Before allocating a number, scan existing ADRs in `docs/architecture/adrs/` (including `archive/`) for any file whose frontmatter `spec_source` matches `{spec_path}` AND whose frontmatter `scope` matches the candidate's derived scope AND whose filename stem matches the candidate's title slug (lowercase, hyphenated). All three fields must match — this allows multiple distinct decisions from the same spec and scope (e.g., "Use Redis for sessions" and "Use JWT for auth tokens" both scoped to `auth`). If a match is found, skip this candidate — the ADR already exists. This makes extraction idempotent: retries after partial failures, re-invocations, and orchestrate re-runs do not create duplicates.
   - Determine next NNNN from the highest existing number across both `docs/architecture/adrs/` and `docs/architecture/adrs/archive/`. ADR numbers are monotonic and never reused — archived ADRs retain their original numbers. If the target file already exists in either directory, increment NNNN until an unused number is found.
   - Write ADR file using the `adr` template + frontmatter schema.
   - **Frontmatter derivation rules:**
     - `scope` -> The module or feature name from the decision's context. Derive from: (1) the spec's scope if stated, (2) the Decision table's row context (e.g., "Auth" from "Use Redis for auth sessions"), or (3) the nearest section header above the Decision table. Use lowercase, hyphenated form (e.g., `auth`, `notification-dispatch`).
     - `purpose` -> Always `adr`.
     - `ai_keywords` -> 3-5 terms extracted from the decision: the technology/pattern chosen, the domain, and any alternatives named. E.g., for "Use Redis for encrypted session storage": `[Redis, sessions, encryption, auth]`.
     - `last_verified` -> Today's date (extraction date), in `YYYY-MM-DD` format.
     - `status` -> `Accepted` (extracted from an approved spec). For manually created ADRs, set to `Proposed`.
     - `code_paths` -> Inferred from spec's scope/module references: scan the project tree (see Section 2.1 Scan root) for directories matching the decision's scope/module name (case-insensitive). If a matching directory exists, use it. If the spec references specific file paths, use those. If multiple directories match, prefer the most specific (deepest) path. If no matching directory exists yet (new module), use the expected path from the spec and note in the ADR that the path is planned — UPDATE mode will verify when the module is created.
     - `spec_source` -> Set to `{spec_path}`.
   - **Map spec content to ADR body sections:**
     - **Title** -> Decision column value or synthesized from context.
     - **Status** -> Accepted (extracted from an approved spec).
     - **Context** -> Surrounding section prose that motivated the decision.
     - **Decision** -> Choice column value or the selected option from prose.
     - **Alternatives Considered** -> Rationale column's rejected options, or "Not documented in spec."
     - **Consequences** -> Rationale column's trade-off language, or "See spec for full context."
   - **Overlap check:** Before writing, compare the new ADR's `code_paths` against existing Accepted ADRs. If an existing ADR has overlapping `code_paths` AND its Decision section addresses the same domain (e.g., both are about session storage), include a warning in the extraction summary: "Note: New ADR '{title}' overlaps with existing ADR {NNNN} '{old_title}'. Review for potential supersession after implementation." This is informational only — the new ADR is still written as Accepted. Resolution is deferred to the next UPDATE/AUDIT pass (Section 5.4).
6. Update `docs/architecture/adrs.md` index. If the file does not exist, create it with the format from Section 1.5. If `docs/architecture/adrs/` directory does not exist, create it.
7. Update AI_INDEX.md with new entries. If AI_INDEX.md does not exist, create it with the format from document-for-ai's AI_INDEX.md Format section.
8. Return summary: list of created ADRs with scores, count of filtered candidates.

### 2.3 Error Handling

**Partial failure:** If extraction fails after writing some ADR files but before completing index/AI_INDEX updates:
- Leave written ADR files in place. Report which files were written and which steps failed.
- The deduplication check (step 5) makes retries safe — the next run skips already-created ADRs and only creates missing ones.
- To manually undo: delete the reported files. Do not rely on `git checkout` — newly created ADR files are untracked.

**Orchestrate Step 4 failure:** If extraction fails, do not auto-proceed to writing-plans. Report the failure and offer three options:
1. **Retry extraction** — deduplication prevents duplicates, safe to re-run.
2. **Skip ADRs and write plan** — user explicitly chooses to proceed without ADRs. writing-plans is invoked normally.
3. **Exit** — no further action. The next `/orchestrate` invocation will re-attempt extraction.

**Index/AI_INDEX out of sync:** If ADR files exist but the index is stale (e.g., from a partial failure), the next extraction run or UPDATE/AUDIT pass regenerates the index from the files on disk.

### 2.4 Zero-ADR Case

If the spec contains no architectural decisions scoring >= 4, skip ADR generation silently. No empty files, no warning. Return summary with zero created ADRs and the count of filtered candidates (all scored below threshold), so orchestrate can present "No architectural decisions met the threshold ({N} candidates scored below 4)."

### 2.5 Scoring Criteria Location

Added to `references/audit-checklist.md` alongside existing accuracy/completeness/format dimensions. This keeps all quality heuristics in one reference file.

---

## 3. Orchestrate Step 4 Integration

### 3.1 Enhanced Step 4

Orchestrate's execution model is one skill takeover per invocation. ADR extraction is NOT a skill invocation — it is an inline pre-processing action, analogous to how Step 2 updates the spec's status header inline. The only skill takeover in Step 4 remains `superpowers:writing-plans`.

**Single algorithm definition:** The extraction algorithm is defined once in Section 2.2 and implemented as a new reference file: `ai-dev-tools/skills/document-for-ai/references/adr-extraction.md`. This file contains the complete extraction algorithm (scoring, filtering, frontmatter derivation, deduplication, overlap check, file writing, index updates). Both the standalone `/document-for-ai adr` command and orchestrate Step 4 read this same reference file — one source of truth, not two implementations. This follows the existing pattern where document-for-ai's references (`doc-templates.md`, `frontmatter-schema.md`, `audit-checklist.md`) are standalone reference files read at specific workflow steps.

```
Trigger: Spec status contains "Approved" (per orchestrate's existing status detection),
         no matching plan file exists.

Behavior:
  1. Present: "Spec approved. I'll extract architectural decisions as ADRs,
     then write the implementation plan. Proceed?"
  2. On confirm:
     a. Follow the extraction algorithm (Section 2.2) as a pre-processing step:
        - Read the spec, score candidates, filter, write ADR files
        - This is the same algorithm that `/document-for-ai adr` uses
        - Not a skill invocation — no conversation takeover
     b. Report result (including any overlap warnings — see Section 2.2 step 5):

        If qualifying decisions found:
          "Extracted {N} architectural decisions:
            1. [{score}] {title}
            2. [{score}] {title}
            Filtered: {M} low-impact decisions"

        If zero qualifying decisions:
          "No architectural decisions met the threshold for ADRs."

     c. Invoke superpowers:writing-plans (single skill takeover for this invocation)
  3. On decline: skip to next /orchestrate invocation. No files written.
```

### 3.2 Design Constraints Preserved

- **One skill takeover per invocation maintained.** ADR extraction is an inline pre-processing action, not a `/document-for-ai` skill invocation. The extraction algorithm is defined once (Section 2.2, owned by document-for-ai) and consumed by both the standalone command and orchestrate. One source of truth, two execution contexts. The only skill takeover in Step 4 is `superpowers:writing-plans`.
- Orchestrate stays a thin dispatcher. It follows the extraction algorithm but does not define or extend it.
- Single user confirmation covers both ADR extraction and plan writing. No files are written before confirmation.
- ADR files and the plan file are both written to disk during Step 4 but not auto-committed. They are committed by the user or during Step 5 (implementation). When committed, the commit message should include `document-for-ai` (e.g., `docs(document-for-ai): extract ADRs from feature-X spec`) so the Step 8 quality gate baseline detection works. **Fallback:** If no commit message contains `document-for-ai`, the quality gate checks `git log -- docs/architecture/adrs/ docs/architecture/adrs.md AI_INDEX.md` for the most recent commit touching any ADR-related artifact as an alternative baseline signal (see Section 4.2).

---

## 4. Orchestrate Step 8 Quality Gate

### 4.1 New Gate Entry

Insert this row after the test-audit row and before the consolidate row in orchestrate's Quality Gate Triggers table:

| Gate | Trigger | Detection | Recommendation |
|---|---|---|---|
| document-for-ai | >15 files changed since last run | `git diff --name-only {baseline}..HEAD` where baseline = last commit with `document-for-ai` in message | "Warning: {N} files changed since last doc update. Run `/document-for-ai`" |

Note: api-contract-guard already triggers on new module directories. document-for-ai only triggers on file count to avoid duplicate recommendations.

### 4.2 Detection

Primary: same pattern as all other gates — scan `git log --oneline` for commits containing `document-for-ai` in the message. Most recent such commit = baseline.

**Fallback:** If no commit message contains `document-for-ai`, check `git log -- docs/architecture/adrs/ docs/architecture/adrs.md AI_INDEX.md` for the most recent commit touching any ADR-related artifact. This covers ADR creation, UPDATE/AUDIT edits, index regeneration, and commits bundled without the skill name in the message.

No baseline from either method = "never run," always recommend.

### 4.3 Priority Ordering

```
convention-enforcer > api-contract-guard > test-audit > document-for-ai > consolidate > refactor-to-layers > session-handoff
```

The existing max-3 recommendation cap is unchanged. If higher-priority gates crowd out document-for-ai, it will appear on the next cycle completion when those gates have been addressed.

### 4.4 What This Triggers

document-for-ai in UPDATE mode (existing mode). UPDATE already finds affected docs via `code_paths`, analyzes git commits since `last_verified`, and regenerates stale sections.

---

## 5. ADR Lifecycle Management

### 5.1 UPDATE Mode Extension

When UPDATE mode encounters ADR files, it checks for decision-code drift: does the code still reflect the decision?

**Detection algorithm:** Read the ADR's `code_paths` files. Analyze git commits since `last_verified`. Flag as potential drift if:
- A dependency or technology named in the Decision section was removed or replaced (e.g., ADR says "Use Redis for sessions" but code adds a Postgres session store).
- New code introduces patterns that contradict the Decision section. **Calibration:** Flag: new `SessionRepo.saveToPostgres()` in `src/auth/` when ADR says "Use Redis for session storage." Do not flag: synchronous utility functions for configuration loading in the same directory — these do not contradict the architectural decision.
- Files in `code_paths` were deleted or moved.

Present the specific commit hashes and diff hunks as evidence.

**Spec-ADR drift:** If the spec at `spec_source` has been modified since the ADR's `last_verified` date, flag as potential spec-ADR drift — the original decision context may have changed. Present to user for review.

**Resolution:**
- If code matches decision: update `last_verified`, no changes needed.
- If code or spec contradicts decision: flag as conflict, do NOT auto-fix. Present to user: "ADR {NNNN} says '{decision}' but code at {path} shows '{reality}'. Update the ADR (decision changed) or flag as code drift?"

ADRs are decisions, not descriptions. Auto-fixing would silently change architectural intent.

### 5.2 AUDIT Mode Extension

ADR files scored on the same 3 dimensions as other docs:

- **Accuracy:** Does the decision still match the code?
- **Completeness:** Are all ADR template sections filled?
- **Format compliance:** Correct frontmatter, correct template?

Plus one ADR-specific check: **Status validity.** An ADR marked "Accepted" whose `code_paths` show contradicting patterns gets flagged as "potential drift or supersession." The follow-up prompt must distinguish implementation drift (code diverged from the decision) from true supersession (a newer decision replaced this one) before changing status or archiving.

### 5.3 Status Lifecycle

```
Proposed -> Accepted -> Superseded | Deprecated
```

- **Proposed:** Decision not yet confirmed. Not produced by the extraction algorithm — reserved for manually created ADRs. Manual workflow: create an ADR file following the template and frontmatter schema, set frontmatter `status: Proposed` (the body's Status line is a display copy — always derive from frontmatter), place in `docs/architecture/adrs/`. Transition to Accepted by changing the frontmatter `status` field after team review. No automated tooling for the Proposed→Accepted transition in v1.
- **Accepted:** Active constraint. Enforced by review-code.
- **Superseded:** Replaced by a newer ADR. The superseding ADR's body references the old one. Moved to `archive/`.
- **Deprecated:** No longer relevant (module removed, technology abandoned). Moved to `archive/`.

### 5.4 Archival

**Trigger:** Status transitions to Superseded/Deprecated are user-confirmed actions. When UPDATE mode flags decision-code drift or AUDIT flags "potentially superseded," the user is presented with the option to change the ADR's status. document-for-ai updates the status field and executes archival steps only after the user confirms.

**During extraction (Step 4):** The extraction algorithm does NOT check for supersession conflicts. It creates new ADRs only. If a new ADR conflicts with an existing one, the next UPDATE or AUDIT pass will detect it and prompt the user. This keeps Step 4's single-confirmation flow uninterrupted.

When an ADR status changes to Superseded or Deprecated:
- Move file from `docs/architecture/adrs/NNNN-{title}.md` to `docs/architecture/adrs/archive/NNNN-{title}.md`
- Update `docs/architecture/adrs.md` index (remove from active table, optionally list in archive section)
- Update AI_INDEX.md (remove entry)
- review-code never reads `archive/`

### 5.5 Consolidation (Future Enhancement — deferred from v1)

With top-3 filtering per spec, reaching 20 ADRs requires 7+ feature cycles. Consolidation complexity (merge algorithm, grouping logic, conflict resolution) is not justified until real ADR counts warrant it. The scoring/filtering mechanism is the primary growth control for v1.

**Planned behavior (when implemented):** When document-for-ai AUDIT counts >20 accepted ADRs, recommend consolidation by grouping ADRs with overlapping `code_paths`. Groups of 3+ ADRs targeting the same scope would be candidates for merging into a single consolidated ADR.

---

## 6. review-code Integration

### 6.1 Path Change

Current:
```
Read context:
   - CLAUDE.md (hard constraints)
   - docs/architecture/adrs.md (accepted architecture decisions)
   - [ANALYSIS_DOC] (spec contract for the milestone)
```

Updated:
```
Read context:
   - CLAUDE.md (hard constraints)
   - docs/architecture/adrs.md (ADR index for discovery) +
     docs/architecture/adrs/*.md (individual ADRs, scope-filtered — see Section 6.2)
   - [ANALYSIS_DOC] (spec contract for the milestone)
```

Both the index file and the individual ADR files are needed. The index provides the list of active ADRs; scope filtering determines which individual ADRs to load in full.

### 6.2 Scope-Based Filtering

This filtering algorithm expands review-code's existing workflow Step 2 ("Read context"), replacing the single-line `docs/architecture/adrs.md` entry with a multi-step sub-procedure. The sub-procedure starts with a lightweight diff enumeration before loading any ADR files.

review-code does NOT read all ADR files. It filters by relevance:

1. **Enumerate diff file paths first.** Run `git diff --name-only HEAD~{COMMIT_COUNT}..HEAD` to collect the list of changed file paths. This is a lightweight operation that precedes ADR loading — it does not depend on the full commit analysis in review-code's Step 4.
2. **Discover ADR files.** Build the candidate list by unioning two sources:
   - Read `docs/architecture/adrs.md` index to get linked ADR paths.
   - Enumerate `docs/architecture/adrs/*.md` directly (excluding `archive/`).
   Union both sets by file path. This ensures review-code finds ADRs even when the index is stale, missing, or out of sync after a partial extraction.
3. For each discovered ADR, read only its frontmatter (up to the closing `---` of the YAML block). Extract `code_paths` and `status`.
4. **Status filter:** Skip any ADR where `status` is not `Accepted`. This is the authoritative status check — frontmatter is the single source of truth (Section 1.2). Archived ADRs in `archive/` are also excluded by directory structure.
5. Match each `code_paths` entry against the diff file paths from step 1. Matching depends on path type:
   - **Directory entries** (ending in `/`): prefix match. E.g., ADR's `src/auth/` matches diff file `src/auth/middleware.ts`.
   - **File entries** (no trailing `/`): exact match only. E.g., ADR's `src/auth.ts` matches only `src/auth.ts`, not `src/auth.tsx`.
   If any entry matches, load the full ADR.
6. Only loaded ADRs are used as constraints during review.

If `docs/architecture/adrs/` directory does not exist, skip silently.

### 6.3 Context Scaling

| Total ADRs | Files in diff | ADRs loaded by review-code |
|------------|---------------|---------------------------|
| 10 | 5 files in src/auth/ | 2-3 ADRs touching auth |
| 30 | 5 files in src/auth/ | 2-3 ADRs touching auth |
| 60 | 5 files in src/auth/ | 2-3 ADRs touching auth |

Context consumption stays roughly constant regardless of total ADR count.

---

## Scope Boundaries

**In scope:**
- ADR doc type (template, frontmatter, selection rule) in document-for-ai
- ADR extraction command (`/document-for-ai adr {spec_path}`)
- Scoring criteria (Reversibility x Blast radius) in audit-checklist.md
- Orchestrate Step 4 enhancement (invoke document-for-ai before writing-plans)
- Orchestrate Step 8 quality gate (document-for-ai UPDATE recommendation)
- UPDATE mode extension for ADR decision-code drift detection
- AUDIT mode extension for ADR status validity
- ADR status lifecycle (Proposed, Accepted, Superseded, Deprecated) + archival
- review-code path change + scope-based filtering
- Index file generation and AI_INDEX.md integration

**Out of scope:**
- New skills (everything is an enhancement to existing skills)
- Changes to brainstorming, writing-plans, or subagent-driven-development
- ADR consolidation (deferred to v2 — see Section 5.5)
- ADR enforcement in skills other than review-code
- Changes to respond-to-review (user-level skill at `~/.claude/skills/respond-to-review/` — its pushback template already instructs citing ADR references in rationale, no changes needed)

## Success Criteria

1. After a spec is approved, `/orchestrate` automatically extracts qualifying ADRs before plan writing — no extra command.
2. review-code flags violations against accepted ADRs during code review (Step 6).
3. ADR context loaded by review-code is bounded by the scope-filtering algorithm (Section 6.2): only ADRs whose `code_paths` match the diff files (directory prefix match or file exact match) are loaded, keeping context proportional to the review scope, not the total ADR count.
4. document-for-ai AUDIT scores ADR files using the same quality dimensions as other docs.
5. document-for-ai UPDATE detects decision-code drift and presents it as a conflict, not an auto-fix.
6. Superseded/deprecated ADRs are archived and invisible to review-code.
7. Re-running extraction after a partial failure does not create duplicate ADRs (deduplication by `spec_source` + `scope` + title slug).
8. ADR numbering remains monotonic after archival — archived numbers are never reused.
9. review-code discovers ADRs even when the index file is stale or missing (fallback to directory enumeration).
