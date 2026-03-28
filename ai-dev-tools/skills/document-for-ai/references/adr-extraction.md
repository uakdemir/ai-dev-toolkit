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
