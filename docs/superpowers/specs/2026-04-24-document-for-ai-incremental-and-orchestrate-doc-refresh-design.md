# `document-for-ai` incremental refresh + `orchestrate` auto doc refresh

**Date:** 2026-04-24
**Scope:** `ai-dev-tools/skills/document-for-ai/` (SKILL.md) + `ai-dev-tools/skills/orchestrate/` (auto-mode pipeline and stage iv)
**Source:** conversation 2026-04-24 — goal is to close the doc-staleness loop by having each auto-mode spec pay for its own doc refresh at the end of its pipeline

## Problem

`document-for-ai` has an UPDATE mode (SKILL.md:434-445) but it is user-interactive: Step 1 asks "which area changed?", mode detection asks "audit or update?", scope detection asks "entire monorepo or specific package?". None of that is callable from another skill, and the git window is per-doc (`last_verified` or 30-day fallback) rather than a range the caller controls. Result: there is no way for `/orchestrate --auto <spec>` to refresh only the docs its own pipeline invalidated, so docs drift and must be manually audited later.

The orchestrate auto pipeline already records the exact commit range it produced: `spec_baseline = HEAD` is set before stage i (pipeline-overview.md:64), and every commit in the spec's pipeline lands in `spec_baseline..HEAD`. That range is the precise input a diff-driven doc-update flow would need. The anchor exists; there is no consumer.

The fix is two coupled changes: a non-interactive, diff-driven entry point in `document-for-ai`, and an opt-in flag in `/orchestrate --auto` that calls it with the pipeline's own commit range.

## Decisions taken

- **D1. New `--incremental` flag on `document-for-ai`, mandating `--since <git-ref>`.** `--incremental` implies `--mode update` strictly and silences all interactive prompts (tech-stack selection, monorepo scope prompt, mode-detection prompt). Passing `--incremental` without `--since`, or combining `--incremental` with `--mode {audit,generate,migrate}`, is a usage error — abort at argument parsing before any probe or prompt. *(Alternatives considered: overload `--mode update` with an optional `--since`. Rejected because keeping the interactive UPDATE path unchanged preserves the human-in-the-loop workflow; `--incremental` is the machine-callable subset and the naming advertises intent.)*
- **D2. Affected-doc discovery is diff-driven, not user-driven.** `git diff --name-only <ref>..HEAD` produces the changed-files set; it is intersected with every AI-optimized doc's `code_paths` frontmatter to produce the affected-doc set. Step 1 (user prompt) and Step 2 (keyword matching) in the existing UPDATE flow are skipped entirely when `--incremental` is set. *(Alternatives: keep the keyword prompt, use the diff only for the git window. Rejected because it re-introduces an interactive step that cannot run under orchestrate auto.)*
- **D3. `document-for-ai` commits its own refresh.** When affected-doc set is non-empty, regenerate per existing UPDATE step 4 logic, update `last_verified` to today, and commit with subject `docs(incremental): refresh for <short-ref>..HEAD` (or `docs(<subject-prefix>): <subject-slug>: refresh docs for <short-ref>..HEAD` when `--subject-slug <slug>` and `--subject-prefix <prefix>` are passed). When affected-doc set is empty, exit 0 with a one-line log and no commit. *(Alternatives: leave working tree dirty for the caller to commit. Rejected because it mirrors how `/implement` and code-review iters own their commits in the auto pipeline, and because it lets `/document-for-ai --incremental` stand alone as a user-invocable command outside orchestrate.)*
- **D4. New `--add-documentation` flag on `/orchestrate --auto`, end-of-spec cadence.** Stage iv dispatches `/document-for-ai --incremental --since <spec_baseline> --subject-prefix auto --subject-slug <spec-slug>` once per spec, after the existing no-op test gate and before the completion log. One call per spec, not per iteration — per-iter cost (N refresh runs per spec, some reverted by later iters) is not worth the marginal freshness. *(Alternatives: per-iteration refresh after each stage iii commit; unconditional default. Rejected: per-iter is expensive and churn-prone; unconditional default changes existing auto behavior and deserves explicit opt-in for at least one release.)*
- **D5. Doc-refresh failures are non-fatal for the auto pipeline.** If the dispatched `document-for-ai` sub-call fails (non-zero exit, extractor abort, unresolved git ref), orchestrate logs `[auto] <spec-filename> > stage iv — documentation refresh failed (continuing)` and advances to the completion log. A stale doc is strictly less bad than a halted pipeline that just produced working code. *(Alternatives: fail the pipeline. Rejected because auto mode's value proposition is "walk away and it finishes"; doc refresh is a nice-to-have that should never revoke that.)*

---

## Change 1 — `document-for-ai`: add `--incremental` + `--since` path (`SKILL.md`)

### 1a. Extend the help text (SKILL.md:6-46)

Add two flags to the `FLAGS` block, in alphabetical position:

```
  --incremental              Non-interactive UPDATE driven by a git diff.
                             Requires --since <git-ref>. Implies --mode update.
                             Mutually exclusive with --mode audit, --mode generate,
                             --mode migrate. Skips tech-stack, scope, and
                             mode-detection prompts — all three are inferred
                             from the diff and the affected packages. Commits
                             the doc refresh itself (see --subject-prefix,
                             --subject-slug).
  --since <git-ref>          Commit range lower bound for --incremental.
                             Mandatory under --incremental, ignored otherwise.
                             Produces the changed-files set via
                             `git diff --name-only <ref>..HEAD`.
  --subject-prefix <prefix>  Commit subject prefix for --incremental runs.
                             Default: `incremental`. Caller convention:
                             orchestrate passes `auto`.
  --subject-slug <slug>      Optional slug inserted into the commit subject
                             after the prefix. Caller convention: orchestrate
                             passes the spec-slug.
```

Add one example to the `EXAMPLES` block:

```
  /document-for-ai --incremental --since HEAD~12            Refresh docs affected by the last 12 commits
  /document-for-ai --incremental --since <spec_baseline> --subject-prefix auto --subject-slug <spec-slug>
                                                            Orchestrate auto invocation shape
```

### 1b. Add a new top-level section: "Mode: INCREMENTAL (flag-driven subset of UPDATE)"

Insert immediately after the existing **Mode: UPDATE** section (SKILL.md:434-445), before **Mode: HUMANIZE**. Rationale for placement: it is a strict subset of UPDATE's behavior and readers looking for update semantics should find it adjacent.

Content (verbatim to include in SKILL.md):

```markdown
## Mode: INCREMENTAL

Triggered by `--incremental`. Non-interactive, diff-driven refresh of affected docs. This is a strict subset of Mode: UPDATE — same regeneration logic, same frontmatter updates, same tier-specific behavior — but scope and time window come from a git range, not from user prompts.

**Preconditions (argument-parsing aborts, before any probe or prompt):**

1. `--since <git-ref>` is present. Missing → abort with exit code ≠ 0 and message: `--incremental requires --since <git-ref>`.
2. `--mode` is either absent or `update`. Any other value → abort with: `--incremental is incompatible with --mode <value>` (naming the offending value).
3. `<git-ref>` resolves via `git rev-parse --verify <ref>`. Unresolvable → abort with: `--since: unable to resolve git ref <ref>`.
4. The current working tree is inside a git repository. Not in a repo → abort.

Preconditions are evaluated in order; evaluation stops at the first failure. Precondition 3 is only reached if precondition 1 passed (i.e., `--since <git-ref>` was supplied).

Once all four pass, proceed.

**Flow:**

1. **Compute the changed-files set.** Run `git diff --name-only <ref>..HEAD`. Filter to files that exist in the working tree (deletions produce no doc to refresh; they are out of scope for this mode and are handled separately by AUDIT's orphan-detection). If the filtered set is empty, log `[incremental] no changed files in <short-ref>..HEAD — nothing to refresh` and exit 0 with no commit.
2. **Infer scope and tech stack.** For each changed file, walk up to the nearest package root (first ancestor containing a stack-validation file per `references/tech-stacks.md`, or the repo root if none is found). Union of those roots is the effective scope. Stack is detected per package from the same validation files. Stack inference runs per-package; if stack cannot be inferred for any single touched package, abort the entire run immediately with: `--incremental: unable to infer tech stack for <path>` — do not skip the failing package and continue, do not fall back to "Other" (that would require the interactive 3-question prompt, which is not permitted in this mode). Skip Step 1 (Tech Stack Selection) and Step 1.5 (Scope Detection) prompts entirely.
3. **Skip mode detection.** Mode is UPDATE. Do not sample existing docs, do not prompt "audit or update?".
4. **Discover affected docs.** Enumerate AI-optimized docs (files under each in-scope package's `docs/ai/` with both `scope` and `purpose` in frontmatter). For each doc, load `code_paths` and compute intersection with the changed-files set. Non-empty intersection → doc is affected. Track interface-tier docs separately: an interface-tier doc is affected only if a changed file is the barrel listed in its `code_paths` OR is a source file of a symbol currently re-exported from that barrel (interface-tier regeneration trigger per SKILL.md:445). To determine which source files are re-exported, use the same extractor selected for the regeneration run (Serena preferred, grep fallback) and resolve `export * from` wildcards the same way Mode: GENERATE's Phase 1 does. If the extractor cannot resolve a wildcard, treat the barrel as affected (conservative). Add a failure-mode row for 'barrel parse fails': exit non-zero with the extractor's error message. If the affected-doc set is empty after both tiers are considered, log `[incremental] 0 docs affected by <short-ref>..HEAD` and exit 0 with no commit.
5. **Regenerate affected sections.** Apply UPDATE step 4 logic per affected doc, with one override: the git window is fixed to `<ref>..HEAD` for every doc, replacing the per-doc `last_verified` lookup. This makes the refresh correspond 1:1 to the commit range the caller specified, regardless of each doc's `last_verified` date. If a doc's accuracy score is ≤ 2, regenerate the entire doc using its template per existing UPDATE logic. **Accuracy score source:** read the `accuracy` field from the doc's frontmatter if present (set by a prior AUDIT run). If absent, default to treating accuracy as sufficient (> 2) and regenerate only affected sections. Do not run a full AUDIT scoring pass in INCREMENTAL mode — that would reintroduce interactive steps.
6. **Finalize frontmatter.** Set `last_verified` to today on every affected doc. Update `last_verified_symbol_count` when Phase 1 was rerun. Leave other frontmatter fields untouched unless the doc was fully regenerated.
7. **Refresh CLAUDE.md hierarchy and AI_INDEX.md** only if the affected-doc set includes a doc whose regeneration changed the module map, entry points, or dependency list. To detect this: compare the `## Entry Points` and `## Dependencies` sections of the old and new doc text using a line diff — if any line in those sections differs, treat this doc as having changed its module map. Skip otherwise — the index files are expensive to rewrite and unaffected by most UPDATE runs.
8. **Commit.** Subject: `docs(<subject-prefix>): <subject-slug>: refresh docs for <short-ref>..HEAD` when both `--subject-prefix` and `--subject-slug` are passed; `docs(<subject-prefix>): refresh docs for <short-ref>..HEAD` when only `--subject-prefix` is passed (slug omitted); `docs(incremental): refresh for <short-ref>..HEAD` when neither is passed. `<short-ref>` is produced by `git rev-parse --short <ref>` (git picks the minimum unambiguous length). Stage only files under the affected packages' `docs/ai/` subtrees plus any changed CLAUDE.md / AI_INDEX.md files — never stage source code changes.
9. **Output summary.** Print: `[incremental] <N> docs refreshed (<ref>..HEAD): <comma-separated doc paths>`. Include a tier breakdown when both tiers were touched: `(<i> internal, <j> interface)`.

**Failure modes:**

| Scenario | Behavior |
|---|---|
| `--since` missing | Argparse abort, message in precondition 1 |
| `--mode` conflict | Argparse abort, message in precondition 2 |
| Unresolvable ref | Abort, message in precondition 3 |
| Not in a git repo | Abort, message in precondition 4 |
| Empty diff | Exit 0, no commit, one-line log |
| Empty affected-doc set after intersection | Exit 0, no commit, one-line log |
| Stack inference fails for a touched package | Abort with per-path diagnostic (no interactive fallback) |
| Barrel parse fails during interface-tier trigger detection | Exit non-zero with the extractor's error message |
| Mid-run extractor failure | Existing extractor fallthrough behavior (see "Failure modes" subsection of "Structural extractor selection" in Mode: GENERATE); self-check warnings still emitted |
| Commit fails (e.g. pre-commit hook) | Exit non-zero with the hook's error; do not amend or retry |

**Interaction with existing flags:**

- `--extractor`, `--require-extractor`, `--include-tests`, `--force-reclassify`, `--depth`, `--exports-only`, `--tier`: all honored as usual. `--tier interface --incremental` refreshes only interface-tier docs affected by the barrel-surface trigger.
- `--scope` is ignored when `--incremental` is set; scope is derived from the diff. If both are passed, log a one-line warning and use the diff-derived scope.
- `--subsystems` is ignored when `--incremental` is set for the same reason.

**Non-goals:**

- Does not handle deleted files. Deletions orphan docs; that's AUDIT's job (SKILL.md:408).
- Does not run ADR drift detection. ADR extensions (UPDATE ADR Extension, SKILL.md:447-467) are skipped under `--incremental` because they require interactive conflict resolution. Run `--mode update` interactively for ADR-sensitive refreshes.
- Does not create new docs for newly added modules. Detecting undocumented code is AUDIT's job; GENERATE creates the initial doc.
```

### 1c. Cross-references

Add a bullet to the **Workflow Overview** reference-files list (SKILL.md:65-74) if any new reference file is created. **None is needed for this change** — the spec above is self-contained and fits in SKILL.md. Update the one-line description at the top of the **Mode: UPDATE** heading to note: "See also **Mode: INCREMENTAL** below for the non-interactive, diff-driven variant."

---

## Change 2 — `orchestrate`: add `--add-documentation` to auto mode

### 2a. Extend the auto-mode help/invocation surface

In `ai-dev-tools/skills/orchestrate/references/common/help.md` (the FLAGS block that documents auto-mode flags), add:

```
--add-documentation        After stage iv completes, dispatch
                           /document-for-ai --incremental --since <spec_baseline>
                           --subject-prefix auto --subject-slug <spec-slug>
                           to refresh docs for files changed in this spec's
                           commit range. Opt-in. Failures are logged and the
                           pipeline continues (non-fatal).
```

Also update `ai-dev-tools/skills/orchestrate/SKILL.md` (the Argument Parsing section):

1. Add `--add-documentation` to the USAGE line so it reads:
   ```
   /orchestrate [--auto <spec...>] [--handoff] [--use-roadmap] [--add-documentation] [--help]
   ```
2. Add a parse rule after rule 4 (`--use-roadmap`):
   ```
   5. `--add-documentation` → set add_documentation flag (auto mode only; silently ignored if --auto is not present).
   ```

No hard error is raised when `--add-documentation` is passed without `--auto` — it is silently ignored so that callers who build invocation strings ahead of time do not need to conditionally strip the flag.

### 2b. Amend Pipeline Overview (`references/auto/pipeline-overview.md`)

Add a new row to the **Pipeline (per spec)** table (pipeline-overview.md:21-26), after the stage iv row:

```
| iv.5 | Doc refresh (opt-in) | `/document-for-ai --incremental --since <spec_baseline> --subject-prefix auto --subject-slug <spec-slug>` | Yes — single dispatch, gated on `--add-documentation` |
```

Amend the **Commit Cadence** table (pipeline-overview.md:62-73) with one new row after the stage iv row:

```
| After stage iv.5 doc refresh | if docs changed | `docs(auto): <spec-slug>: refresh docs for <short-ref>..HEAD` (owned by document-for-ai) | — |
```

Commit is owned by the sub-skill, not orchestrate — the table row documents the subject for cadence auditability, not a second commit.

### 2c. Amend Stage iv (`references/auto/stages/stage-iv-verification-gate.md`)

Replace the **Current Release (No-Op)** section (stage-iv-verification-gate.md:13-20) with:

```markdown
## Current Release

This project has no test suite. The historical test gate is a no-op:

1. **(No-op)** Test-suite detection deferred to future work.
2. If a future release introduces verification fixes, commit: `chore(auto): <spec-slug>: verification fixes`
3. **Doc refresh (opt-in).** If `--add-documentation` was passed to the auto invocation, dispatch:
   ```
   /document-for-ai --incremental --since <spec_baseline> --subject-prefix auto --subject-slug <spec-slug>
   ```
   Log `[auto] <spec-filename> > stage iv — documentation refresh dispatched` before the call and `[auto] <spec-filename> > stage iv — documentation refresh complete` on success. On non-zero exit from the sub-call, log `[auto] <spec-filename> > stage iv — documentation refresh failed (continuing)` with the first 500 characters of the sub-call's stderr appended to the `stderr_excerpt` field of the profiling log entry for this dispatch, then continue to step 4. The doc-refresh sub-call owns its own commit; orchestrate does not commit after it.
4. Print completion log: `✓ <spec-slug> complete (spec_baseline..HEAD: N commits)`
5. Advance to next spec or exit.
```

### 2d. Amend auto-state schema (`references/auto/auto-state-schema.md`)

Add one optional state transition:

- `docs-refreshed` — set after a successful doc-refresh dispatch; set to `docs-refresh-failed` with an `error` field on non-zero exit. Only present in state when `--add-documentation` was passed. Absent otherwise.

Transition order: `code-review-iter-{N}-complete` → (optional `docs-refreshed` | `docs-refresh-failed`) → `finalized`. The intermediate doc-refresh state is ephemeral: after writing `docs-refreshed` or `docs-refresh-failed`, immediately overwrite with `finalized` per the existing State Update section of stage-iv-verification-gate.md. `finalized` remains the terminal state in all cases; `docs-refreshed` and `docs-refresh-failed` are never the final value in auto-state.md.

In `auto-state-schema.md`, add `docs-refreshed` and `docs-refresh-failed` to the State Enum list, AND update the Happy-Path Transitions diagram by inserting an optional branch after `code-review-iter-{N}-complete`: → (if --add-documentation) `docs-refreshed` → `finalized` | (on failure) `docs-refresh-failed` → `finalized`.

### 2e. Profiling log entry

The doc-refresh dispatch appends one JSONL entry to the profiling log per the existing schema (`references/auto/profiling-log.md`). This entry conforms to the required fields defined there and adds doc-refresh-specific fields; the `action` enum in `profiling-log.md` must be extended to include `"document-for-ai"` and `schema_version` bumped to `2`.

Required fields (existing schema, `schema_version: 2`):

| Field | Value for doc-refresh dispatch |
|---|---|
| `schema_version` | `2` |
| `ts` | ISO-8601 UTC timestamp at dispatch end |
| `spec` | Spec file basename (e.g. `"myspec.md"`) |
| `action` | `"document-for-ai"` (new enum value; add to `profiling-log.md` action enum) |
| `round` | `1` |
| `model` | Effective model used by the sub-call |
| `total_time_s` | Wall-clock seconds from dispatch start to dispatch return, 3 decimal places |

Additive doc-refresh-specific fields (present alongside the required fields):

| Field | Type | Condition |
|---|---|---|
| `exit_code` | integer | Always present |
| `docs_refreshed_count` | integer | Always present when `exit_code` is `0`, including early-exit cases (value `0` when no docs changed) |
| `affected_doc_paths` | array of strings | Present only when `docs_refreshed_count > 0`; omit when empty |
| `stderr_excerpt` | string | Present only when `exit_code` is non-zero and stderr was non-empty; first 500 characters of the sub-call's stderr |

The write protocol (timing, `printf` append, failure policy) follows `profiling-log.md` exactly. Orchestrate is responsible for emitting this entry — the `document-for-ai` sub-call does not write to the profiling log itself.

**Required update to `profiling-log.md`:** Add `"document-for-ai"` to the `action` enum and bump `schema_version` to `2`. Consumers MUST treat unknown `action` values as opaque per the existing forward-compatibility rule.

### 2f. Pre-pipeline validation (pipeline-overview.md:38-42)

No change needed. `--add-documentation` is a pipeline modifier, not a spec arg; existing spec-arg validation is unaffected.

### 2g. Document interface-tier limitation (`references/auto/pipeline-overview.md`)

Add a **Known Limitations** subsection under the Pipeline table (after the stage rows). Content:

```markdown
**Known Limitations**

- Interface-tier docs are not refreshed by `--add-documentation`. The doc-refresh call does not pass `--tier interface`; auto-mode specs rarely touch barrel files, and interface-tier docs have tight regeneration triggers with low churn. To refresh interface-tier docs, run `document-for-ai --incremental --since <ref> --tier interface` manually after the pipeline completes. A future `--tier auto-select` or per-package config may address this.
```

---

## Acceptance Criteria

1. `document-for-ai --incremental` without `--since` exits non-zero and prints `--incremental requires --since <git-ref>`.
2. `document-for-ai --incremental --since HEAD~5` on a repo with no AI docs (empty affected-doc set) exits 0 with no commit.
3. `document-for-ai --incremental --since HEAD~5 --subject-prefix auto --subject-slug myspec` on a repo where docs are affected produces a commit whose subject is exactly `docs(auto): myspec: refresh docs for <short>..HEAD` (where `<short>` is the output of `git rev-parse --short HEAD~5`).
4. `document-for-ai --incremental --since HEAD~5 --mode generate` exits non-zero and prints `--incremental is incompatible with --mode generate`.
5. `document-for-ai --incremental --since nonexistent-ref` exits non-zero and prints `--since: unable to resolve git ref nonexistent-ref`.
6. `/orchestrate --auto <spec> --add-documentation` appends a JSONL entry with `stage: "iv.5"` to the profiling log after stage iv completes.
7. If the `document-for-ai` sub-call exits non-zero, orchestrate logs the failure message and continues to the completion log without halting the pipeline.
8. `document-for-ai --incremental --since HEAD~5 --subject-prefix auto` (no `--subject-slug`) on a repo where docs are affected produces a commit whose subject is exactly `docs(auto): refresh docs for <short>..HEAD`.
9. `/orchestrate --auto <spec> --add-documentation` when no docs are affected still appends a JSONL profiling entry with `docs_refreshed_count: 0` and `exit_code: 0`.
10. `document-for-ai --incremental --since HEAD~5 --scope packages/foo` logs a one-line warning and proceeds using diff-derived scope.

---

## Rollout

Opt-in for at least one release. After soak on 3-5 real auto-mode runs, consider flipping default to on. No migration needed — existing auto invocations keep current behavior when the flag is absent.

---

## Open questions

None — all open questions resolved. Q1 (short-ref length) resolved: `git rev-parse --short` adopted in step 8. Q2 (interface-tier gap) resolved: documented as a known limitation in Change 2g.

---

## Summary

- **New `--incremental --since <ref>` path on `document-for-ai`:** non-interactive, diff-driven subset of UPDATE mode; commits its own refresh; aborts fast on missing/conflicting flags.
- **New `--add-documentation` flag on `/orchestrate --auto`:** dispatches the above at stage iv using the pipeline's own `spec_baseline..HEAD` range; opt-in; failures are non-fatal.
- **Net effect:** auto-mode specs pay for their own doc refresh; docs stay in lockstep with spec execution; no timeline-ambiguity about "since when?"

**Decisions taken:** D1 (`--incremental` flag, mandates `--since`, aborts on mode conflicts), D2 (diff-driven discovery, no user prompts), D3 (sub-skill owns its commit), D4 (opt-in `--add-documentation`, end-of-spec cadence), D5 (doc-refresh failures are non-fatal).
