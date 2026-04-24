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

Insert immediately after the existing **UPDATE: ADR Extension** subsection (which follows Mode: UPDATE; SKILL.md:447-467), before **Mode: HUMANIZE**. Rationale for placement: Mode: UPDATE owns its ADR Extension subsection; inserting INCREMENTAL between UPDATE and its own ADR Extension would break UPDATE's logical grouping. Placing INCREMENTAL after the ADR Extension keeps it adjacent to UPDATE while preserving UPDATE's internal structure.

Content (verbatim to include in SKILL.md):

```markdown
## Mode: INCREMENTAL

Triggered by `--incremental`. Non-interactive, diff-driven refresh of affected docs. This is a strict subset of Mode: UPDATE — same regeneration logic, same frontmatter updates, same tier-specific behavior — but scope and time window come from a git range, not from user prompts.

**Preconditions (argument-parsing aborts, before any probe or prompt):**

1. `--since <git-ref>` is present. Missing → abort with exit code ≠ 0 and message: `--incremental requires --since <git-ref>`.
2. `--mode` is either absent or `update`. Any other value → abort with: `--incremental is incompatible with --mode <value>` (naming the offending value).
3. The current working tree is inside a git repository (verified via `git rev-parse --is-inside-work-tree`). Not in a repo → abort with: `--incremental must be run inside a git repository`.
4. `<git-ref>` resolves via `git rev-parse --verify <ref>`. Unresolvable → abort with: `--since: unable to resolve git ref <ref>`.

Preconditions are evaluated in the listed order; evaluation stops at the first failure. Ordering rationale: the repo check (precondition 3) MUST run before the ref-resolution check (precondition 4) because `git rev-parse --verify` requires being inside a git repository — running it outside a repo emits git's own "not a git repository" stderr rather than the user-facing `--since: unable to resolve git ref` message, which is misleading. Precondition 4 is only reached if preconditions 1–3 passed (i.e., `--since <git-ref>` was supplied, `--mode` is compatible, and the cwd is a git repo).

Once all four pass, proceed.

**Flow:**

1. **Compute the changed-files set.** Run `git diff --name-only -M <ref>..HEAD` (rename detection ON). For each rename old→new that git surfaces, include BOTH paths in the changed-files set so docs whose `code_paths` still reference the old path are picked up by the intersection in step 4. Filter to files that exist in the working tree (deletions produce no doc to refresh; they are out of scope for this mode and are handled separately by AUDIT's orphan-detection) — this filter naturally drops the "old" side of a rename while retaining the "new" side, but the paired old-path entry is preserved BEFORE this filter is applied so intersection against stale `code_paths` still succeeds. When a rename causes an affected doc's `code_paths` to reference a path that no longer exists, do NOT auto-rewrite `code_paths` (that is AUDIT's orphan-detection job per D2); DO regenerate the doc's sections against the new path (treat the new path as current source of truth), and emit a one-line advisory `[incremental] warning: code_paths in <doc> references renamed/moved path <old> — run audit to refresh code_paths`. Submodule handling: `git diff --name-only` does not recurse into submodules; if the commit range touches submodule gitlinks, emit `[incremental] note: <ref>..HEAD touches submodule(s) <list>; submodule contents are not inspected` and proceed with the outer-repo diff only (submodule contents are a non-goal — see Non-goals below). Symlinks in `code_paths` are resolved via `readlink -f` before intersection; symlinks pointing outside the working tree are skipped with a one-line warning. If the filtered set is empty, log `[incremental] no changed files in <short-ref>..HEAD — nothing to refresh` and exit 0 with no commit.
2. **Infer scope and tech stack.** For each changed file, walk up to the nearest package root (first ancestor containing a stack-validation file per `references/tech-stacks.md`, or the repo root if none is found). Union of those roots is the effective scope. Stack is detected per package from the same validation files. Stack inference runs per-package; if stack cannot be inferred for a touched directory, skip that directory with a one-line warning `[incremental] skipping <path>: no stack inferred` and continue with the remaining packages. Only abort the whole run when ZERO touched packages have an inferable stack — in which case the changed-files set has no documentable content and the run exits with: `--incremental: no touched packages have an inferable tech stack`. Do NOT fall back to "Other" (that would require the interactive 3-question prompt, which is not permitted in this mode). Skip Step 1 (Tech Stack Selection) and Step 1.5 (Scope Detection) prompts entirely.
3. **Skip mode detection.** Mode is UPDATE. Do not sample existing docs, do not prompt "audit or update?".
4. **Discover affected docs.** Enumerate AI-optimized docs (files under each in-scope package's `docs/ai/` with both `scope` and `purpose` in frontmatter). For each doc, load `code_paths` and compute intersection with the changed-files set. Non-empty intersection → doc is affected. Track interface-tier docs separately: an interface-tier doc is affected only if a changed file is the barrel listed in its `code_paths` OR is a source file of a symbol currently re-exported from that barrel (interface-tier regeneration trigger per SKILL.md:445). To determine which source files are re-exported, use the same extractor selected for the regeneration run (Serena preferred, grep fallback) and resolve `export * from` wildcards the same way Mode: GENERATE's Phase 1 does. If the extractor cannot resolve a wildcard, treat the barrel as affected (conservative). Add a failure-mode row for 'barrel parse fails': exit non-zero with the extractor's error message. If the affected-doc set is empty after both tiers are considered, log `[incremental] 0 docs affected by <short-ref>..HEAD` and exit 0 with no commit.
5. **Regenerate affected sections.** Apply UPDATE step 4 logic per affected doc, with one override: the git window is fixed to `<ref>..HEAD` for every doc, replacing the per-doc `last_verified` lookup. This makes the refresh correspond 1:1 to the commit range the caller specified, regardless of each doc's `last_verified` date. **Pre-write buffering for step 7:** BEFORE overwriting each affected doc on disk, read the current on-disk content into an in-memory buffer keyed by doc path — this preserves the pre-regeneration text for step 7's line-diff comparison. The buffer MUST be populated before the overwrite; retrieving it after overwrite is not supported. INCREMENTAL always regenerates affected sections only; full-doc regeneration based on accuracy scoring is AUDIT/GENERATE's job and is out of scope for INCREMENTAL (per D2: strict subset of UPDATE, no audit scoring). INCREMENTAL does not read an accuracy field from frontmatter and does not compute accuracy at runtime — that would reintroduce interactive steps and duplicates AUDIT's role.
6. **Finalize frontmatter.** Set `last_verified` to today on every affected doc. Update `last_verified_symbol_count` when Phase 1 was rerun. Leave other frontmatter fields untouched unless the doc was fully regenerated.
7. **Refresh CLAUDE.md hierarchy and AI_INDEX.md** only if the affected-doc set includes a doc whose regeneration changed the module map, entry points, or dependency list. To detect this: compare the `## Entry Points` and `## Dependencies` sections of the old (from step 5's pre-write buffer) and new (freshly written) doc text using a line diff — if any line in those sections differs, treat this doc as having changed its module map. **Absent-section rule:** if either `## Entry Points` or `## Dependencies` is absent in both old and new, that section contributes no change. If a section is absent in old but present in new (or vice versa), treat that as a module-map change (section creation/removal is a structural delta). **Reordering rule:** reordered lines within a section count as a change — the line diff is order-sensitive by design, since entry-point/dependency ordering carries semantic weight in generated indexes. Skip the CLAUDE.md/AI_INDEX.md refresh otherwise — the index files are expensive to rewrite and unaffected by most UPDATE runs.
8. **Commit.** **Step ordering:** steps 5–7 produce the final on-disk state of all affected files (regenerated doc bodies written in step 5, frontmatter finalized in step 6, CLAUDE.md/AI_INDEX.md refresh in step 7). Step 8 MUST run only after steps 5–7 have completed their writes to disk for every affected doc; it stages ONLY files changed on disk during steps 5–7, detected via `git diff --name-only` scoped to each affected package's `docs/ai/` tree plus the repo-root `CLAUDE.md`/`AI_INDEX.md`. If step 7 produced an inconsistency between the root `CLAUDE.md` and any per-module `CLAUDE.md` (e.g., root updated but a per-module regen failed), abort BEFORE staging with a diagnostic `[incremental] abort: inconsistent CLAUDE.md hierarchy (<detail>)` and do NOT stage a half-updated index. Then construct the commit. Subject: `docs(<subject-prefix>): <subject-slug>: refresh docs for <short-ref>..HEAD` when both `--subject-prefix` and `--subject-slug` are passed; `docs(<subject-prefix>): refresh docs for <short-ref>..HEAD` when only `--subject-prefix` is passed (slug omitted); `docs(incremental): refresh for <short-ref>..HEAD` when neither is passed. `<short-ref>` is produced by `git rev-parse --short=12 <ref>` (fixed 12-character prefix — length is pinned rather than left to git's minimum-unambiguous heuristic, so commit subjects are deterministic and do not drift as the repo grows; length 12 is collision-safe up to very large repositories). Stage only files under the affected packages' `docs/ai/` subtrees plus any changed CLAUDE.md / AI_INDEX.md files — never stage source code changes.
9. **Output summary.** Print a human-readable breadcrumb: `[incremental] <N> docs refreshed (<ref>..HEAD): <comma-separated doc paths>`. Include a tier breakdown when both tiers were touched: `(<i> internal, <j> interface)`. **Machine-readable contract:** as the FINAL line of stdout (always, on every exit path including the empty-diff and empty-affected-set no-op exits), emit a single compact JSON object on its own line with the fixed shape `{"docs_refreshed": <N>, "paths": [<doc-path>, ...]}`. `<N>` is the integer count of refreshed docs (0 on no-op paths); `paths` is the exact list of doc paths refreshed (`[]` on no-op paths). This line is the sole machine-parseable contract — orchestrate reads the last non-empty line of captured stdout, parses it as JSON, and extracts `docs_refreshed` / `paths` for the profiling-log fields `docs_refreshed_count` / `affected_doc_paths` (see Change 2c and 2e). The human-readable breadcrumb line above is informational only and MUST NOT be parsed.

**Failure modes:**

| Scenario | Behavior |
|---|---|
| `--since` missing | Argparse abort, message in precondition 1 |
| `--mode` conflict | Argparse abort, message in precondition 2 |
| Not in a git repo | Abort, message in precondition 3 |
| Unresolvable ref | Abort, message in precondition 4 |
| Empty diff | Exit 0, no commit, one-line log |
| Empty affected-doc set after intersection | Exit 0, no commit, one-line log |
| Stack inference fails for a touched package | Skip that package with `[incremental] skipping <path>: no stack inferred`; abort the whole run only when no touched packages have an inferable stack |
| Barrel parse fails during interface-tier trigger detection | Exit non-zero with the extractor's error message |
| Mid-run extractor failure | Existing extractor fallthrough behavior (see "Failure modes" subsection of "Structural extractor selection" in Mode: GENERATE); self-check warnings still emitted |
| Commit fails (e.g. pre-commit hook) | Run `git reset HEAD -- <all-staged-paths>` followed by `git checkout -- <all-staged-paths>` over the complete staged set — `<affected-doc-paths>` PLUS every CLAUDE.md touched in step 7 PLUS `AI_INDEX.md` if touched in step 7. Capture the staged set by recording the exact argument list passed to `git add` in step 8 (or by reading `git diff --name-only --cached` immediately after staging), so the cleanup operates on the same paths that were staged. This discards both staged and on-disk doc/index changes so the working tree is clean on exit, then exit non-zero with the hook's error; do not amend or retry. This preserves auto-mode's clean-baseline invariant so the next pipeline run does not inherit uncommitted doc-refresh changes. |
| Step 8 abort: inconsistent CLAUDE.md hierarchy detected before staging | The step-5 on-disk doc writes and step-7 CLAUDE.md/AI_INDEX.md writes have already happened but nothing is staged yet. Run `git checkout --` over the same path set the commit-fail row would have staged (every affected doc under `docs/ai/`, every CLAUDE.md touched in step 7, and `AI_INDEX.md` if touched) to revert on-disk changes. No `git reset HEAD --` is required because nothing was staged. Then exit non-zero with the `[incremental] abort: inconsistent CLAUDE.md hierarchy (<detail>)` diagnostic. |

**Interaction with existing flags:**

- `--extractor`, `--require-extractor`, `--include-tests`, `--force-reclassify`, `--depth`, `--exports-only`, `--tier`: all honored as usual. `--tier interface --incremental` refreshes only interface-tier docs affected by the barrel-surface trigger. `--tier internal --incremental` refreshes only internal-tier docs.
- **Tier default when `--tier` is omitted under `--incremental`:** scope is INTERNAL-tier only. Interface-tier trigger detection (see step 4's barrel/re-export logic) runs only when `--tier interface` is explicitly passed. If `--incremental` runs without `--tier` and one or more interface-tier docs exist in scope, emit a one-line advisory: `[incremental] note: <N> interface-tier doc(s) in scope were not checked; rerun with --tier interface to refresh them.` This keeps the default cheap while surfacing the asymmetry. (Orchestrate's `--add-documentation` dispatch relies on this default — see Change 2g.)
- `--scope` is ignored when `--incremental` is set; scope is derived from the diff. If both are passed, log a one-line warning and use the diff-derived scope.
- `--subsystems` is ignored when `--incremental` is set for the same reason.

**Non-goals:**

- Does not handle deleted files. Deletions orphan docs; that's AUDIT's job (SKILL.md:408).
- Does not run ADR drift detection. ADR extensions (UPDATE ADR Extension, SKILL.md:447-467) are skipped under `--incremental` because they require interactive conflict resolution. Run `--mode update` interactively for ADR-sensitive refreshes.
- Does not create new docs for newly added modules. Detecting undocumented code is AUDIT's job; GENERATE creates the initial doc.
- Does not inspect submodule contents. Commits that touch submodule gitlinks are logged but the submodule's own diff is not expanded.
- Does not auto-update `code_paths` frontmatter when a documented file is moved/renamed. Sections are regenerated against the new path (treated as current source of truth), but `code_paths` drift from file moves is reconciled only by AUDIT's orphan-detection on the next audit run.

**Concurrency:** `--incremental` acquires a process-exclusive lock file at `.git/document-for-ai-incremental.lock` before step 1 and releases it on every exit path (success, abort, signal).

The **authoritative** locking mechanism is `flock(2)` (advisory, non-blocking `LOCK_EX | LOCK_NB`). Under `flock(2)` the lock file contains no PID payload; contention is observed purely via `flock`'s return status, and the kernel releases the lock automatically on process exit (including crashes and signals). Stale-lock detection is therefore unnecessary under `flock(2)` — a crashed prior run cannot leave the lock held. A second `--incremental` invocation while the lock is held aborts immediately with `[incremental] another incremental run is in progress (.git/document-for-ai-incremental.lock). Aborting.` and exit code ≠ 0.

The **portable fallback** (used ONLY when `flock(2)` is unavailable on the host platform — e.g. some non-Linux environments without a suitable `flock` binary) is `O_CREAT|O_EXCL` atomic file creation with the current PID written as the file's sole content. Under this fallback — and ONLY this fallback — a stale lock is detected by reading the PID from the lock file and checking `kill -0 <pid>`; if the PID is dead, the lock is reclaimed with a one-line log `[incremental] reclaimed stale lock (pid <pid> not running)`. The PID-file + `kill -0` stale-detection path MUST NOT run when the primary `flock(2)` path was used, because no PID was written and the file's content is undefined.

Implementations MUST select exactly one of the two mechanisms at startup and use it consistently for the duration of the run; mixing is prohibited. Concurrent `--add-documentation` auto dispatches for DIFFERENT specs serialize on this lock regardless of which mechanism is in use (orchestrate runs specs serially anyway per pipeline-overview invariants, so this is mostly a safeguard against manual `--incremental` runs racing an auto pipeline). The lock scope is a single git repository; submodule runs use their own lock file.
```

### 1c. Cross-references

Add a bullet to the **Workflow Overview** reference-files list (SKILL.md:65-74) if any new reference file is created. **None is needed for this change** — the spec above is self-contained and fits in SKILL.md.

Insert a cross-reference line immediately below the `## Mode: UPDATE` heading (currently SKILL.md:434), above the existing step-1 line (`1. **Identify scope.** Ask the user which area changed. ...`, currently SKILL.md:436). The heading today is followed directly by the numbered steps with no intervening description line. Insert an empty line plus the following exact text as a new paragraph between the heading and step 1 (i.e. between lines 434 and 436):

```
See also **Mode: INCREMENTAL** below for the non-interactive, diff-driven variant.
```

The insertion is mechanical: locate the literal line `## Mode: UPDATE` (first occurrence), and add the new paragraph as the first content after the heading's blank line, before `1. **Identify scope.** ...`. No other edits to the Mode: UPDATE section are made.

---

## Change 2 — `orchestrate`: add `--add-documentation` to auto mode

### 2a. Extend the auto-mode help/invocation surface

In `ai-dev-tools/skills/orchestrate/references/common/help.md`, update the USAGE line (currently line 7) to:

```
/orchestrate [--auto <spec...>] [--handoff] [--use-roadmap] [--add-documentation] [--help]
```

Then, in the same file's single unified FLAGS block (which documents all orchestrate flags — there is no separate auto-mode FLAGS block), add the following entry in alphabetical/logical position:

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
   5. `--add-documentation` → set add_documentation flag (auto mode only; warn-and-ignore if --auto is not present).
   ```

**Parse ordering with the variadic `--auto <spec...>` list.** When `--auto` is present, `--add-documentation` MAY appear before or after the spec list. The parser stops consuming spec args at the first token beginning with `--`; all `--`-prefixed tokens are parsed as flags, never as spec paths. `--add-documentation` is standalone (it does not "attach" to a particular `--auto` spec — it applies once per spec invocation to every spec in the list).

Examples of the parse rule:
- `/orchestrate --auto spec1.md spec2.md --add-documentation` → specs = [`spec1.md`, `spec2.md`], add_documentation = true (flag terminates the spec list).
- `/orchestrate --add-documentation --auto spec1.md spec2.md` → identical result; flag can appear before `--auto`.
- `/orchestrate --auto spec1.md --add-documentation spec2.md` → specs = [`spec1.md`], add_documentation = true, then `spec2.md` is an unexpected positional after the flag → hard error (`unexpected positional argument after --add-documentation: spec2.md`). Interleaving spec paths across flags is NOT supported.

When `--add-documentation` is passed without `--auto`, emit a one-line stderr warning `[orchestrate] --add-documentation has no effect without --auto; ignoring` and proceed — this matches the loudness of existing orchestrate flag validation (see rules for `--handoff` + `--auto`) and avoids introducing a new silent-drop idiom. Callers who build invocation strings ahead of time can still pass it unconditionally; the warning is informational, not a hard error.

### 2b. Amend Pipeline Overview (`references/auto/pipeline-overview.md`)

Add a new row to the **Pipeline (per spec)** table (pipeline-overview.md:21-26), after the stage iv row:

```
| iv.5 | Doc refresh (opt-in) | `/document-for-ai --incremental --since <spec_baseline> --subject-prefix auto --subject-slug <spec-slug>` | Yes — single dispatch, gated on `--add-documentation` |
```

Amend the **Commit Cadence** table (located under the `## Commit Cadence (auto mode — structurally required)` section heading in `pipeline-overview.md`; the table begins with a column-header row and ends at the final data row immediately before the explanatory prose paragraphs — use the section title as the anchor rather than line numbers, which drift as the file is edited) with one new row after the `Stage iv verification` row:

```
| After stage iv.5 doc refresh | if docs changed | `docs(auto): <spec-slug>: refresh docs for <short-ref>..HEAD` (owned by document-for-ai) | — |
```

Commit is owned by the sub-skill, not orchestrate — the table row documents the subject for cadence auditability, not a second commit.

### 2c. Amend Stage iv (`references/auto/stages/stage-iv-verification-gate.md`)

Replace the **Current Release (No-Op)** section (stage-iv-verification-gate.md:12-20, header on line 12) with:

```markdown
## Current Release

This project has no test suite. The historical test gate is a no-op:

1. **(No-op)** Test-suite detection deferred to future work.
2. If a future release introduces verification fixes, commit: `chore(auto): <spec-slug>: verification fixes`
3. **Doc refresh (opt-in).** If `--add-documentation` was passed to the auto invocation, dispatch:
   ```
   /document-for-ai --incremental --since <spec_baseline> --subject-prefix auto --subject-slug <spec-slug>
   ```
   Sub-step ordering: (a) log `[auto] <spec-filename> > stage iv — documentation refresh dispatched`; (b) dispatch the sub-call and capture BOTH stdout and stderr into in-memory buffers while the sub-call runs; (c) on return, compute the profiling-log fields (`exit_code` from the sub-call's exit status; `docs_refreshed_count` and `affected_doc_paths` parsed from the final non-empty line of captured stdout per the machine-readable JSON contract defined in Mode: INCREMENTAL step 9 — take the last non-empty line, `JSON.parse` it, and read `docs_refreshed` and `paths`; on `exit_code != 0` or on JSON-parse failure, default `docs_refreshed_count` to `0` and `affected_doc_paths` to `[]`; and `stderr_excerpt` — the first 500 characters of the captured stderr buffer, JSON-escaped, when `exit_code != 0` and stderr is non-empty; otherwise `null` — see Change 2e); (d) append the JSONL profiling entry via the single-printf protocol defined in `profiling-log.md`; (e) emit the human-readable breadcrumb: `[auto] <spec-filename> > stage iv — documentation refresh complete` on success or `[auto] <spec-filename> > stage iv — documentation refresh failed (continuing)` on non-zero exit. The JSONL entry (step d) MUST be written before the failure breadcrumb (step e) so the log's entry ordering is deterministic. Then continue to step 4. The doc-refresh sub-call owns its own commit; orchestrate does not commit after it.
4. Print completion log: `✓ <spec-slug> complete (spec_baseline..HEAD: N commits)`
5. Advance to next spec or exit.
```

### 2d. Amend auto-state schema (`references/auto/auto-state-schema.md`)

No new state values are added. The doc-refresh dispatch does NOT write an intermediate `docs-refreshed` or `docs-refresh-failed` state to `auto-state.md`; it transitions directly from `code-review-iter-{N}-complete` to `finalized` after the dispatch returns (success or failure). The doc-refresh outcome is recorded only in the profiling log (see Change 2e) — keeping `auto-state.md`'s state enum minimal and avoiding a stale-state edge case where a crash between an ephemeral intermediate write and the `finalized` write would trigger the Stale-State Policy warning even though the spec's code-review work completed successfully.

No change is required to the State Enum list in `auto-state-schema.md`. The Happy-Path Transitions diagram likewise does not need a new branch: `code-review-iter-{N}-complete` → `finalized` remains the terminal transition whether or not `--add-documentation` was passed.

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

Additive doc-refresh-specific fields (ALL always present to preserve single-printf atomicity — absent values are encoded as `null` or `[]`, never omitted):

| Field | Type | Value policy |
|---|---|---|
| `exit_code` | integer | Always present |
| `docs_refreshed_count` | integer | Always present; value `0` when no docs changed or when the sub-call failed before counting |
| `affected_doc_paths` | array of strings | Always present; use `[]` when no docs were refreshed |
| `stderr_excerpt` | string or null | Always present; use `null` when `exit_code` is `0` or stderr was empty; otherwise the first 500 characters of the sub-call's stderr, JSON-escaped |

**Outcome semantics (reconciliation with Change 2d):** No dedicated `outcome` field is emitted. Consumers infer success/failure from `exit_code` alone: `exit_code == 0` means the doc-refresh succeeded OR was a legitimate no-op (empty diff or empty affected-set); `exit_code != 0` means the sub-call failed. This is deliberate — `docs_refreshed_count` distinguishes the success-with-writes case (`> 0`) from the success-no-op case (`== 0`), and `stderr_excerpt` provides failure context on non-zero exits. Adding an explicit `outcome` string field would duplicate information already encoded in these three fields and expand the printf format string without adding consumer value.

**Rationale — one fixed printf format string:** profiling-log.md mandates a single `write(2)` per entry to preserve PIPE_BUF atomicity under concurrent appenders. Conditionally omitting fields would force the implementation to pick between multiple printf format strings at runtime, which either (a) breaks the one-format-string discipline or (b) forces heredoc/multi-write assembly — both forbidden by profiling-log.md. Encoding absent values as `null` / `[]` keeps the printf format string fixed across all invocations and all exit paths.

**Write ordering (reconciliation with Change 2c):** orchestrate (a) dispatches the sub-call and captures stderr in-memory; (b) on return, computes `exit_code`, `docs_refreshed_count`, `affected_doc_paths`, and `stderr_excerpt` in a local buffer; (c) appends the complete JSONL line via a single printf write per profiling-log.md's protocol; (d) emits the human-readable breadcrumb log line (success or failure). Steps (b) and (c) MUST complete before (d); the breadcrumb is user-facing and can be emitted freely, but the JSONL entry must be written as a single atomic line with all fields populated. This resolves the apparent contradiction between 2c (which describes capturing stderr verbatim up to 500 chars) and 2e (which scopes the excerpt to the profiling entry): 2c describes the CAPTURE (in-memory buffer, full stderr bounded to 500 chars for the excerpt field), 2e describes the EMISSION (single JSONL line with the excerpt embedded, or `null` on success).

The write protocol (timing, `printf` append, failure policy) follows `profiling-log.md` exactly. Orchestrate is responsible for emitting this entry — the `document-for-ai` sub-call does not write to the profiling log itself.

**Required update to `profiling-log.md`:** Add `"document-for-ai"` to the `action` enum and bump `schema_version` to `2`. Consumers MUST treat unknown `action` values as opaque per the existing forward-compatibility rule.

### 2f. Pre-pipeline validation (pipeline-overview.md:38-42)

No change needed. `--add-documentation` is a pipeline modifier, not a spec arg; existing spec-arg validation is unaffected.

### 2g. Document interface-tier limitation (`references/auto/pipeline-overview.md`)

Add a **Known Limitations** subsection under the Pipeline table (after the stage rows). Content:

```markdown
**Known Limitations**

- Interface-tier docs are not refreshed by `--add-documentation`. The orchestrate dispatch intentionally omits `--tier`, so the sub-call falls through to `document-for-ai`'s `--incremental` default (internal-tier only — see the "Interaction with existing flags" bullet on tier defaults in SKILL.md Mode: INCREMENTAL). This is deliberate: auto-mode specs rarely touch barrel files, and interface-tier docs have tight regeneration triggers with low churn. The sub-call will emit a one-line advisory when interface-tier docs exist in scope but were not checked; the advisory appears in the sub-call's stdout and is captured by orchestrate's normal breadcrumb logging. To refresh interface-tier docs, run `document-for-ai --incremental --since <ref> --tier interface` manually after the pipeline completes. A future `--tier auto-select` or per-package config may address this.
```

---

## Acceptance Criteria

1. `document-for-ai --incremental` without `--since` exits non-zero and prints `--incremental requires --since <git-ref>`.
2. `document-for-ai --incremental --since HEAD~5` on a repo with no AI docs (empty affected-doc set) exits 0 with no commit.
3. `document-for-ai --incremental --since HEAD~5 --subject-prefix auto --subject-slug myspec` on a repo where docs are affected produces a commit whose subject is exactly `docs(auto): myspec: refresh docs for <short>..HEAD` (where `<short>` is the output of `git rev-parse --short=12 HEAD~5`).
4. `document-for-ai --incremental --since HEAD~5 --mode generate` exits non-zero and prints `--incremental is incompatible with --mode generate`.
5. `document-for-ai --incremental --since nonexistent-ref` exits non-zero and prints `--since: unable to resolve git ref nonexistent-ref`.
6. `/orchestrate --auto <spec> --add-documentation` appends a JSONL entry with `action: "document-for-ai"` (per Change 2e's required-fields table) to the profiling log after stage iv completes. No `stage` field is written — stage correlation is performed by consumers via the ordering of entries sharing the same `spec` value.
7. If the `document-for-ai` sub-call exits non-zero, orchestrate logs the failure message and continues to the completion log without halting the pipeline.
8. `document-for-ai --incremental --since HEAD~5 --subject-prefix auto` (no `--subject-slug`) on a repo where docs are affected produces a commit whose subject is exactly `docs(auto): refresh docs for <short>..HEAD`.
9. `/orchestrate --auto <spec> --add-documentation` when no docs are affected still appends a JSONL profiling entry with `docs_refreshed_count: 0` and `exit_code: 0`.
10. `document-for-ai --incremental --since HEAD~5 --scope packages/foo` logs a one-line warning and proceeds using diff-derived scope.
11. **(D2 no-prompts)** `document-for-ai --incremental --since HEAD~5` run in a TTY with stdin closed (`</dev/null`) completes without reading stdin and emits zero interactive prompts (tech-stack, scope, mode-detection all skipped).
12. **(D3 commit-failure + auto-state)** After stage iv.5 completes on both success and failure paths, `tmp/auto-state.md` contains `state: finalized` (no intermediate `docs-refreshed`/`docs-refresh-failed` values are ever written — the doc-refresh outcome lives only in the profiling log). On commit-hook failure, the working tree is clean on exit (no staged or unstaged doc changes).
13. **(interface-tier trigger)** `document-for-ai --incremental --tier interface --since HEAD~5` where the only change is a non-exported symbol's source file in a barrel-exported module produces an empty affected set and exits 0 with no commit.
14. **(garbage-collected ref)** `document-for-ai --incremental --since HEAD~5` where the commit at `HEAD~5` has been garbage-collected reports the precondition-4 `--since: unable to resolve git ref` error with non-zero exit; it does not silently succeed with a partial range.
15. **(D5 standalone non-fatal from orchestrate's view)** `/orchestrate --auto <spec> --add-documentation` where the sub-call exits non-zero still advances to the `✓ <spec-slug> complete` log and terminal state `finalized` — no halt.
16. **(tier default advisory)** `document-for-ai --incremental --since HEAD~5` (no `--tier`) in a scope containing ≥1 interface-tier doc prints the `[incremental] note: <N> interface-tier doc(s) in scope were not checked; rerun with --tier interface to refresh them.` advisory and exits 0.
17. **(rename-paired-path)** `document-for-ai --incremental --since <ref>` run on a commit range that renames a file listed in some doc's `code_paths` (old path → new path) produces a refresh for that doc AND emits the one-line advisory `[incremental] warning: code_paths in <doc> references renamed/moved path <old> — run audit to refresh code_paths`. The doc's sections are regenerated against the new path; `code_paths` frontmatter is NOT auto-rewritten.
18. **(submodule-gitlink)** `document-for-ai --incremental --since <ref>` run on a commit range that touches a submodule gitlink emits the log line `[incremental] note: <ref>..HEAD touches submodule(s) <list>; submodule contents are not inspected` and proceeds with the outer-repo diff driving the refresh. The run does not recurse into the submodule and does not abort.
19. **(symlink-outside-tree)** `document-for-ai --incremental --since <ref>` where a `code_paths` entry in an affected doc is a symlink that `readlink -f` resolves to a path outside the working tree skips that entry with a one-line warning and continues. The run does not abort; other `code_paths` entries in the same doc are still processed normally.

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
