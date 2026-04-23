# `document-for-ai` — resolve two spec ambiguities

**Date:** 2026-04-23
**Scope:** `ai-dev-tools/skills/document-for-ai/` (SKILL.md + 3 reference files)
**Source:** `tmp/ai-dev-tools-fix-prompt.md` (external maintainer report + repro on a calibration package)

## Problem

Two separate ambiguities in `document-for-ai/SKILL.md` cause an earnest agent to produce the wrong output in the most common invocation shape:

1. **Serena extractor silently falls through to grep.** The probe step (`mcp.list_tools()`) reads as free, but has two invisible prerequisites in Claude Code: the deferred-tool schemas must be materialized via `ToolSearch`, and `activate_project` must succeed before any other Serena call works. The spec names neither. An agent that sees Serena in the deferred-tool list but doesn't want the extra setup picks grep and is within-spec. There is also no hard-fail mode, so users have no way to verify their "Serena-powered" docs were actually produced by Serena.

2. **L1 scope is defined as "exported symbols" but the surrounding prose implies all-symbols.** Literal reading produces a public-facade doc: 30 exported ops for a 2,843-LoC file, hiding ~50 internal helpers (`resolveNextQuestion`, `pushUndoSnapshot`, `buildMetricFlowQuestion`, `validateFormulaInput`). This defeats the "precise map of the subsystem" purpose for the common case — an agent editing inside the package, which is what the skill is invoked for almost every time.

Both bugs are defensible readings of the current spec. Both produce docs that are wrong for the most common invocation. The fix removes the ambiguity and changes the default to match the common case.

## Decisions taken

- **D1. L1 default becomes all top-level symbols** (exported + internal). `--exports-only` opt-in restores exports-only behavior for the rare "publish our public surface" case. New `symbol_scope: all | exports-only` frontmatter field records the mode so AUDIT can tell a scope switch from a regression. *(Alternatives considered: keep exports-only default with `--include-internal` opt-in; scope-conditional default. Rejected because an earnest agent still produces the broken doc unless the invoker remembers the flag, and every real invocation is maintainer-view — there is no common consumer-view case.)*
- **D2. Add `--require-extractor <serena|tsc|grep>` as a separate flag**, mutually exclusive with `--extractor`. Aborts on any probe-step failure or mid-run tool error with a diagnostic naming which step failed. *(Alternatives: strict modifier on `--extractor`. Rejected because prefer vs. require are distinct verbs and conflating axes ages badly.)*
- **D3. L1 Symbol-index table gains a `Visibility` column; "Barrel surface" section unchanged.** *(Alternatives: two tables, or combined table replacing barrel surface. Rejected because barrel surface and symbol index answer different questions — "what does this package expose?" vs. "what lives in this package?" — and keeping them separate preserves that.)*
- **D4. Post-generation self-check + manual sanity run on calibration.** Self-check re-calls `get_symbols_overview` after writing each L1 doc (Serena-only), warns if doc indexes <70% of reported symbols. Manual run on calibration verifies the fix before declaring the work done. *(Alternatives: skip both, or one-only. Rejected because the self-check is cheap insurance against future silent failures and the manual run is the honest way to confirm the fix works for the original reported case.)*

---

## Change 1 — Extractor probe hardening (`SKILL.md`)

### Rewrite the "Structural extractor selection" block

Replace the current Serena bullet with an explicit 3-step probe that names its invisible prerequisites. Each step has a single named failure mode and a single named fall-through behavior.

```markdown
1. **SerenaExtractor** (preferred) — perform all three checks in order. Each
   step's failure mode falls through to the next extractor unless
   `--require-extractor serena` is set.

   a. **Schema load.** In harnesses that gate MCP tools behind deferred
      schemas (e.g. Claude Code), the agent must materialize Serena's tool
      schemas before invoking them. Without this step, Serena tools exist in
      the deferred-tool list but calls fail with InputValidationError.
      Claude Code: call `ToolSearch` with
      `"select:mcp__plugin_serena_serena__activate_project,mcp__plugin_serena_serena__get_symbols_overview,mcp__plugin_serena_serena__find_symbol"`
      before any Serena invocation. Harnesses with non-deferred MCP tools
      skip this step.

   b. **Project activate.** Call `activate_project` with the repository root
      path or a known project name. Serena returns "No active project" on
      every other call until activation succeeds. If activation fails, fall
      through.

   c. **Smoke test.** Call `get_symbols_overview` on a known file inside
      scope. This catches cases where schema-load and activation succeed but
      Serena is misconfigured for the repo. If the call errors, fall through.

   After all three steps succeed, Serena is the selected extractor. Mid-run
   tool errors fall through to the next extractor for remaining files (log
   the switch) unless `--require-extractor serena` is set.
```

Steps 2 and 3 (TscDeclarationExtractor, GrepExtractor) keep their current bullets.

### Update the "Failure modes" sub-block

Replace the current "Serena available but fails partway → fall through to next backend for remaining files, log the switch" line with an expanded version that distinguishes probe-time failure from mid-run failure:

```markdown
- **Probe-time failure** (schema-load / activate / smoke-test fails before any
  doc-generating call) → fall through to next extractor, log which probe step
  failed. If `--require-extractor serena` is set, abort the run with exit code
  ≠ 0 and a diagnostic naming the failed step.
- **Mid-run failure** (Serena call errors after the probe succeeds) → fall
  through to next extractor for remaining files, log the switch. If
  `--require-extractor serena` is set, abort the run with exit code ≠ 0 and a
  diagnostic naming the failing tool.
- **Grep fallback has false negatives** → Open Questions documents any file
  the extractor couldn't parse (`// parser-unknown: <reason>`).
- **All backends fail or return zero symbols** → abort doc generation for this
  subsystem, log to AI_INDEX.md with extraction-failed row format.
```

### Add the `--require-extractor` flag

In the Invocation flags block, add after the existing `--extractor` line:

```
--require-extractor <serena|tsc|grep>   Hard requirement — abort the run with
                                         exit code ≠ 0 if the named extractor
                                         cannot be initialized or errors
                                         mid-run. Mutually exclusive with
                                         --extractor. Use when you want
                                         evidence that the named extractor
                                         actually ran (CI gates, doc-quality
                                         audits).
```

Help text (`<help-text>` block at top of SKILL.md) adds the same flag.

Validation: if both `--extractor` and `--require-extractor` are passed, abort with a usage error before any probe runs.

### Extend the AI_INDEX.md extraction-failed row format

The HTML comment on the reason line now records which probe step failed (or whether it was mid-run). Current format:

```
<!-- extraction failed: Serena timeout after 30s, grep returned 0 symbols -->
```

New format records the named stage:

```
<!-- extraction failed [probe:smoke-test]: Serena get_symbols_overview returned error, grep returned 0 symbols -->
<!-- extraction failed [runtime:find_symbol]: Serena errored mid-run after 12 files, grep fallback returned 0 symbols -->
```

Stage tags: `probe:schema-load`, `probe:activate`, `probe:smoke-test`, `runtime:<tool-name>`.

---

## Change 2 — L1 symbol-scope flip (`SKILL.md`)

### Framework table row

Replace the "L1: Structural index" row's "What it captures" cell:

**From:** `Exported symbols, signatures, one-line purposes, cross-cutting patterns, file/dir map`

**To:**

```
All top-level symbols (functions, classes, interfaces, type aliases,
module-level constants) across scoped files — both exported and internal. Per
symbol: signature, visibility (exported | internal), one-line purpose inferred
from name/nearest JSDoc/docstring, file:line. Plus cross-cutting patterns and
file/dir map.
```

### "Key principle" paragraph — add a new sub-paragraph

After the current "L1 is not 'shallow L2'" sentences, append:

```markdown
**Scope — exported vs internal:** L1 indexes ALL top-level symbols by default,
not just exports. The purpose is to give a maintainer inside the package a
precise map of what lives where — internal helpers are where most bugs live,
and excluding them produces a public-facade doc that is wrong for the common
case (an agent editing inside the subsystem). Each symbol in the index is
marked `exported` or `internal` in the Visibility column. When you want an
exports-only index for a cross-package consumer view (e.g. publishing a
package's public surface), pass `--exports-only` — this narrows the symbol
index to symbols bearing the `export` keyword, and sets
`symbol_scope: exports-only` in frontmatter.
```

### Phase 1 extraction bullet (Mode: GENERATE → Phase 1)

Replace the first bullet:

**From:** `Extract exported symbols and their signatures per file (excluding test files unless --include-tests).`

**To:**

```markdown
- Extract ALL top-level symbols (functions, classes, interfaces, type aliases,
  module-level const/let) per file (excluding test files unless
  `--include-tests`). For each: name, `file:line`, signature, visibility
  (`exported` | `internal`), one-line purpose from the nearest JSDoc/docstring
  or inferred from the signature + file name. Exports-only mode: add
  `--exports-only` to filter to symbols bearing the `export` keyword; this
  sets `symbol_scope: exports-only` in frontmatter instead of the default
  `symbol_scope: all`.
```

Also update the `last_verified_symbol_count` bullet: replace "total exported symbols found" with "total top-level symbols found (subject to `symbol_scope`)."

### Add `--exports-only` flag

In the Invocation flags block, add:

```
--exports-only         Narrow the L1 symbol index to symbols bearing the
                        `export` keyword. Default is all top-level symbols
                        (exported + internal). Sets frontmatter
                        `symbol_scope: exports-only`.
```

Add the same flag to the `<help-text>` block at top of SKILL.md.

### Frontmatter population (Step 6 of the Generation pipeline)

Update the frontmatter-fields enumeration in step 6 to include `symbol_scope` in the list of fields to populate.

---

## Change 3 — L1 template update (`references/doc-templates.md`)

### Symbol index table — add Visibility column

Current L1 template (line 16):

```
- **Symbol index**: Table of all exported symbols with their signatures and
  one-line purposes. Columns: `Symbol | File | Signature | Purpose`. Grouped
  by file. Include parameter types and return types in signatures.
```

New:

```
- **Symbol index**: Table of all top-level symbols (exported + internal) with
  their signatures, visibility, and one-line purposes. Columns:
  `Symbol | File | Signature | Visibility | Purpose`. Grouped by file, sorted
  by line number within each file. `Visibility` is `exported` or `internal`.
  Include parameter types and return types in signatures. When
  `--exports-only` is passed, the table is filtered to symbols bearing the
  `export` keyword (Visibility column still present but all rows read
  `exported`).
```

### Barrel surface section — unchanged

The "Barrel surface" section stays as-is. It answers a different question (what the package's barrel file re-exports) than the Symbol index (what lives in the package).

### L2 template cross-reference

L2 template line 31 currently says "Symbol index: Same as L1." This reference remains correct — L2 inherits the updated L1 table shape automatically. No edit needed.

---

## Change 4 — Signature-patterns update (`references/signature-patterns.md`)

### Loosen `^export ` anchors

Current patterns (line 39 and line 69) anchor TS/JS extraction on `^export `. Replace with a pattern that matches both `export <decl>` and bare `<decl>`, and emit a `visibility` capture group so the `GrepExtractor` can populate the visibility field.

**TypeScript / JavaScript** (illustrative — exact regex in the reference file):

```
Current:  ^export\s+(function|class|interface|type|const|let|var)\s+(\w+)
New:      ^(export\s+)?(function|class|interface|type|const|let|var)\s+(\w+)
```

The `(export\s+)?` capture group presence/absence maps to visibility.

**Python:** top-level `def`/`class` is visibility-by-convention (leading underscore = internal). Extract all top-level `def`/`class`; set visibility to `internal` if the name starts with `_`, else `exported`. Module `__all__` (when present) overrides this heuristic — names in `__all__` are `exported`, names absent are `internal`.

**Go:** visibility is determined by first-letter case. Extract all top-level `func`/`type`/`var`/`const`; uppercase-first = `exported`, lowercase-first = `internal`. No `export` keyword to match.

**Rust:** `pub fn`/`pub struct`/etc. = `exported`; bare `fn`/`struct`/etc. = `internal`. Same anchor-loosening shape as TS.

### `.d.ts` note at line 130

Current comment: "parse .d.ts output for exported symbols."

New: "parse .d.ts output for declared symbols. `.d.ts` files typically only contain exported declarations; mark all as `exported` in the visibility field unless the declaration is scoped `declare` without `export`."

---

## Change 5 — Frontmatter schema (`references/frontmatter-schema.md`)

### New optional field: `symbol_scope`

Add to the schema:

```yaml
symbol_scope: all | exports-only   # Optional. Default: all.
                                     # Records the L1 symbol-scope mode used
                                     # during generation. AUDIT mode reads this
                                     # to distinguish a scope switch from a
                                     # symbol-count regression.
```

Freshly generated docs always populate this field. Docs generated before this change lack the field entirely; AUDIT infers `exports-only` for those legacy docs (matching the pre-change default), flags them under "Scope changes," and recommends regeneration to populate the field explicitly.

---

## Change 6 — Post-generation self-check (`SKILL.md`)

### New step in the GENERATE pipeline

Add a step 6.5 between current step 6 (Generate docs) and step 7 (Generate per-module CLAUDE.md):

```markdown
6.5 **Post-generation self-check (Serena-only).** For each L1 doc just
   written, re-call `get_symbols_overview` on the subsystem's files and count
   Serena's reported top-level symbols. Compare against the doc's symbol-index
   row count. If `doc_count / serena_count < 0.70`, emit a warning to the
   summary report:
   ```
   ⚠  <subsystem>: doc indexes <N>/<M> top-level symbols (<pct>%). Possible
      extractor underperformance — review before accepting.
   ```
   The warning is advisory and does NOT abort the run. The self-check runs
   only when Serena was the actual extractor (not when tsc or grep was used),
   because comparing a doc against the same extractor that produced it is
   circular.

   Threshold rationale: 70% is low enough to tolerate Serena's stricter
   definition of "top-level" (ambient declarations, re-exported type aliases)
   without tripping on boundary cases, and strict enough to catch the silent
   grep-fallback class of bug this change addresses.
```

### Summary report — new section

Add a "Self-check warnings" section to the summary report (step 10) listing any subsystems that tripped the <70% threshold, with the fraction and percent for each.

---

## Change 7 — AUDIT mode scope-change note (`SKILL.md`)

In the AUDIT mode section, add a note after the "Score each doc" step:

```markdown
**Symbol-scope change detection:** If a doc's `symbol_scope` frontmatter
differs from the current generation default (or the value the doc would
receive on regeneration), classify any symbol-count delta as a scope change,
not a regression. Log it in the audit report under a "Scope changes" header
and do NOT score down the Completeness dimension for the delta.

Docs generated before the `symbol_scope` field was introduced have no value
for this field. Treat missing field as `exports-only` on first audit (matching
pre-change semantics), and recommend regeneration to populate the field.
```

---

## Manual sanity run (post-implementation, not part of the spec)

After all spec edits land, run:

1. `/document-for-ai --scope calibration --subsystems all --mode generate --depth L1` in a session with Serena available.
   - Verify the generated L1 doc for the 2,843-LoC orchestrator file contains `resolveNextQuestion`, `pushUndoSnapshot`, `buildMetricFlowQuestion`, `validateFormulaInput`.
   - Verify each is marked `internal` in the Visibility column.
   - Verify the summary report's self-check warning does NOT trip (doc should cover ≥70% of Serena's top-level symbols).
   - Verify frontmatter has `symbol_scope: all`.
2. Same command + `--require-extractor serena`. Should succeed with identical output.
3. Same command + `--require-extractor serena` in a session where Serena is deliberately not loaded (no `ToolSearch` for serena selectors). Should abort with exit code ≠ 0 and a diagnostic naming `probe:schema-load`.
4. Same command + `--exports-only`. Should produce a doc filtered to exports, with `symbol_scope: exports-only` in frontmatter.

---

## Files changed

| File | Change |
|---|---|
| `ai-dev-tools/skills/document-for-ai/SKILL.md` | Extractor probe rewrite, `--require-extractor` flag, L1 framework row, Key principle sub-paragraph, Phase 1 bullet, `--exports-only` flag, self-check step, AUDIT symbol_scope note, AI_INDEX failure-row comment format, help-text flag additions |
| `ai-dev-tools/skills/document-for-ai/references/doc-templates.md` | L1 template — add `Visibility` column to Symbol index table |
| `ai-dev-tools/skills/document-for-ai/references/signature-patterns.md` | Loosen `^export ` anchors for TS/Rust; document Python/Go visibility rules; update `.d.ts` note |
| `ai-dev-tools/skills/document-for-ai/references/frontmatter-schema.md` | Add optional `symbol_scope: all \| exports-only` field |

No new files. No deletions.

---

## Summary

- **L1 default flips to all top-level symbols**; `--exports-only` becomes the narrow opt-in; `symbol_scope` frontmatter field records the mode.
- **Extractor probe is now a named 3-step sequence** (schema-load → activate → smoke-test); `--require-extractor` is a new strict counterpart to `--extractor`.
- **Post-generation self-check** catches silent extractor underperformance; a manual sanity run on calibration will verify the fix before declaring it done.
