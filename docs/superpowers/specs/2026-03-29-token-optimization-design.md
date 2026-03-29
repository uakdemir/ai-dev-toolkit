# Token Optimization Design

**Date:** 2026-03-29
**Problem:** Running review-doc with default settings (4 iterations, parallel multi-agent architecture) consumed 20% of weekly Pro Max quota in 5 hours. The parallel agent dispatch pattern duplicates document context across every agent, and each agent's tool-turn conversations compound the cost further.

**Goal:** Reduce token usage across review-doc, review-code, refactor-to-monorepo, and refactor-to-layers without sacrificing review quality. Only clear wins — no speculative optimization.

---

## Root Cause Analysis

### Context Duplication in Parallel Agents

Each agent dispatched via the Agent tool is an independent API call. Parallel agents do NOT share context — the orchestrator constructs a full prompt for each, including the document, spec, CLAUDE.md, and agent instructions. When review-doc dispatches 3 parallel Opus agents for the final gate, the document is sent 3 times.

### Tool-Turn Accumulation

Within each agent's execution, every tool call (Read, Grep, Write) is a new API round-trip that re-sends the full conversation history. An agent making 10 tool calls sends its initial context ~10 times (partially mitigated by API-level prompt caching of identical prefixes, but output tokens still accumulate). The fact-checker (15-20+ tool calls) is the most expensive single agent.

### Iteration Multiplier

With `--max-iterations 4` plus a final gate, review-doc dispatches up to 20 agents per run: (2 reviewers + 1 synthesis + 1 fixer) x 4 iterations + (3 reviewers + 1 synthesis) for the final gate. In practice the maximum is 19 (the round that triggers the final gate skips its fixer). Most runs don't need this depth.

---

## Changes

### 1. review-doc — Architecture Overhaul

#### 1.1 Merge Parallel Reviewers into Single Agent

**Before:** 2-3 specialist agents (completeness-reviewer, implementability-auditor, optionally codebase-fact-checker) dispatched in parallel, each reading the document independently. A synthesis agent deduplicates and merges their findings.

**After:** 1 merged reviewer agent with a combined checklist covering completeness, consistency, scope, structure, implementability, vague actions, dependency gaps, ordering, agent pitfalls, and acceptance criteria. The reviewer writes `tmp/review.json` directly (same pattern review-code already uses). This means `prompts/reviewer.md` is a full REWRITE, not just a checklist merge. The new reviewer must absorb all synthesis logic previously in `agents/synthesis.md`: deduplication (same location + same deficiency), confidence filtering (drop < 40), confidence-to-severity mapping (>=80 critical, 60-79 high, 40-59 medium), 20-item cap (critical+high first, then medium by descending confidence; raise cap if critical+high exceed 20), and write output conforming to the JSON schema. On non-final rounds, set `fact_check_claims: []` and `fact_check_accuracy: 100`.

**Removed components:**
- `agents/synthesis.md` — deleted. Nothing to deduplicate with a single reviewer.
- `agents/completeness-reviewer.md` — content merged into `prompts/reviewer.md`.
- `agents/implementability-auditor.md` — content merged into `prompts/reviewer.md`.
- `--min-model` flag repurposed (see 1.3).

**Preserved:** `agents/codebase-fact-checker.md` stays as a separate agent (see 1.5).

**Clarification:** The new `prompts/reviewer.md` is a direct-dispatch agent prompt, not an orchestration prompt. The orchestrator (SKILL.md) dispatches it as a single Agent call. The reviewer reads the document, applies the combined checklist, and writes `tmp/review.json`. There is no orchestration logic inside the reviewer prompt — dispatch sequencing, model selection, and iteration control remain in SKILL.md. The dispatch construction instructions currently in `prompts/reviewer.md` (placeholder variables like `{{DOC_PATH}}`, `{{AGAINST_PATH}}`, `{{EFFORT}}`) move into SKILL.md's Agent Dispatch sections directly.

**20-item cap:** The cap applies on every round (not just the final round). This ensures the fixer receives a manageable workload. If an early round produces more than 20 issues, extra medium-severity items are dropped from `tmp/review.json` but may reappear in the next round's review.

#### 1.2 Default `--max-iterations` from 4 to 1

Single-pass becomes the default. Users opt into iterations with `--max-iterations 3` when the document warrants deeper review. The iterative loop remains fully functional — just not the default path.

#### 1.3 Remove `--min-model` (synthesis), Rename `--mid-model` to `--min-model`

The old `--min-model` (for the now-deleted synthesis agent) is removed. The old `--mid-model` (for early review rounds) is renamed to `--min-model`. Two clean tiers: `--max-model` for the final round, `--min-model` for early rounds.

Updated flag table:

| Flag | Default | Purpose |
|---|---|---|
| `--max-model` | opus | Final round: reviewer + fixer + fact-checker |
| `--min-model` | sonnet | Early rounds: reviewer + fixer |
| `--max-iterations` | 1 | Single-pass default |
| `--effort` | high | Thoroughness level |

**Implementation note:** The `--help` output block in SKILL.md must be updated to match this new flag table. Specifically: remove `--mid-model`, update `--min-model` description from "Synthesis agent" to "Early rounds", and change `--max-iterations` default from 4 to 1. The `--help` text is hardcoded in the SKILL.md `### --help Output` section.

#### 1.4 Model Tiering for Fixer

**Before:** Fixer always runs at `--max-model` (Opus).

**After:**
- Early rounds (1 to N-1): fixer runs at `--min-model` (Sonnet). Document fixes are guided by explicit reviewer suggestions — straightforward edits that Sonnet handles well. If a fix is imperfect, the next review round catches it.
- Final round (N): fixer runs at `--max-model` (Opus). The final round catches subtle issues that require holding the full document in mind. No next round to catch mistakes.

#### 1.5 Fact-Checker as Sequential Terminal Step

**Before:** Fact-checker runs in parallel with other reviewers during the final gate. No fix phase after the final gate.

**After:** Fact-checker runs sequentially AFTER the final round's fixer completes. This means it verifies claims against the cleanest version of the document. The fact-checker is always terminal — no fix phase after it. Findings go into the final report for human review.

Rationale for keeping the fact-checker separate:
- Fundamentally different workflow (15-20+ tool calls vs. single-read review)
- Merging would bloat the reviewer's context with code verification tool turns
- Token efficiency: fact-checker's growing conversation only compounds against its own lean initial context, not the reviewer's findings

#### 1.6 Serena Integration for Fact-Checker

Add Serena's semantic tools as preferred alternatives in the fact-checker prompt:

| Verification task | Without Serena | With Serena |
|---|---|---|
| Check function signature | Read full file, find line | `find_symbol` returns signature directly |
| Verify class has method X | Read full file | `get_symbols_overview` returns method list |
| Verify import relationship | Grep across files | `find_referencing_symbols` returns importers |
| Check file existence | Glob | Glob (unchanged) |
| Verify non-code content | Read | Read (unchanged) |

Prompt addition for fact-checker:
> "For function/class/type verification, prefer `find_symbol` and `get_symbols_overview` over Read. For import relationship verification, prefer `find_referencing_symbols` over Grep. Fall back to Read/Grep when verifying non-code claims (config files, markdown, line numbers)."

No other agent prompts change. Reviewer and fixer don't do heavy code navigation.

Estimated fact-checker token savings: 20-30% from smaller tool-turn payloads.

#### 1.6.1 Fact-Checker Output Contract Change

**Before:** The fact-checker writes markdown (claim/verdict blocks + summary table) returned as agent output text to the orchestrator. The synthesis agent converts verdicts to issue objects.

**After:** With synthesis deleted, the fact-checker must write JSON directly. New output contract:

1. Read `tmp/review.json` (written by the reviewer in the same round).
2. For each INACCURATE, STALE, or PARTIALLY ACCURATE verdict, append an issue object to the `issues` array with `category: "fact-check"`. Set both `confidence` and `severity` on each appended issue: INACCURATE → confidence 85 (critical), STALE → confidence 70 (high), PARTIALLY ACCURATE → confidence 50 (medium). Use the same mapping as the reviewer: confidence >= 80 → critical, 60-79 → high, 40-59 → medium.
3. Populate the `fact_check_claims` array with all checked claims (including ACCURATE ones).
4. Compute and set `fact_check_accuracy`.
5. Recompute `critical_count` and `high_count` from the full issues array (including appended fact-check issues). Rewrite `tmp/review.json` with the updated content.

The markdown output format (claim/verdict blocks, summary table) is removed entirely.

#### 1.7 New Iteration Flow

**Single-pass (default, `--max-iterations 1`):**

```
1 Opus reviewer (merged checklist) → writes tmp/review.json
1 Opus fact-checker → reads tmp/review.json, appends fact-check issues to the
  issues array, sets fact_check_claims and fact_check_accuracy, rewrites the file
Final report
```

No fixer in single-pass (same as old single-pass behavior).

**Iterative (`--max-iterations >= 2`):**

```
Rounds 1 to N-1:
  1 Sonnet reviewer (merged) → Sonnet fixer

Round N (final):
  1 Opus reviewer (merged) → Opus fixer → Opus fact-checker
  Final report
```

**Final gate redesign:** The final gate is no longer "review-only." In the current SKILL.md, the final gate skips the fix phase (`FIX PHASE (skipped when is_final_gate)`). In the new design, the final round includes a fixer and a sequential fact-checker. The "review-only final gate" concept is removed for iterative runs. Single-pass (`--max-iterations 1`) remains fixer-free.

Stop-check condition unchanged: 0 criticals triggers the final round. Final gate still exempt from `--max-iterations` cap (can run as N+1). However, the triggered behavior is redefined: the final round now dispatches 1 merged reviewer + 1 fixer + 1 sequential fact-checker (instead of 3 parallel agents + synthesis).

#### 1.8 Token Impact

| Scenario | Old dispatches | New dispatches | Reduction |
|---|---|---|---|
| Single-pass (new default) | 3 Opus + 1 Haiku = 4 | 1 Opus reviewer + 1 Opus fact-checker = 2 | 50% fewer dispatches |
| 3 iterations | 12 (Sonnet/Haiku/Opus mix) | 7 (Sonnet + Opus) | 42% fewer dispatches |
| Context duplication per review round | 2-3x document | 1x (2x in final with fact-checker) | 50-66% less duplication |

### 2. review-code — Default Iteration Change Only

**Change:** Default `--max-iterations` from 4 to 1.

No structural changes. review-code already follows the single-agent pattern (1 reviewer writes JSON directly, 1 fixer commits fixes). No parallel agent duplication. The 3000-line diff budget with stat-only fallback is well-calibrated.

### 3. refactor-to-monorepo — Section-Only Reference Loading

**Change:** Update the progressive disclosure instructions in SKILL.md to enforce section-only extraction from reference files.

Current progressive disclosure instruction (1 place — the "Progressive disclosure" paragraph in the Tech Stack Selection section):
> "Read `references/tech-stacks.md` and locate the section matching the selected stack."

Additionally, the Progressive Disclosure Schedule table has 2 rows that reference loading `references/tech-stacks.md` (after tech stack selection, and during artifact generation for tooling). These table rows describe WHEN to load, not HOW — but they should also be updated to include the section-only extraction instruction.

New instruction:
> "Read `references/tech-stacks.md`. Extract ONLY the section matching the selected stack (from its `##` heading through the next `##` heading or end of file). Discard all other stack sections from context. Do not retain unrelated stack information."

**Note:** `references/analysis-framework.md` is organized by Phase (1-4), not by stack. Phase 3 contains per-stack subsections under "Static Analysis Approach by Stack" (Node.js, .NET, Python), but these are small subsections (~5 lines each), not full top-level sections. Section-only extraction does not apply to this file — it should be loaded in full when needed (total ~150 lines, already lean).

Estimated savings: ~50-75 lines of wasted context per run (loading 1 stack section instead of all 3 sections from tech-stacks.md, which cover the 6 user-facing stack options).

### 4. refactor-to-layers — Split Templates + Section Loading

#### 4.1 Section-Only Reference Loading

Same change as refactor-to-monorepo for `references/tech-stacks.md`. The progressive disclosure instruction is at 1 place (the "Progressive disclosure" paragraph in the Tech Stack Selection section, line ~72). The Progressive Disclosure Schedule table has 1 row referencing `references/tech-stacks.md` (after tech stack selection) that should also be updated.

#### 4.2 Split structural-test-templates.md by Stack

**Before:** Single 621-line file containing templates for all 3 backend platforms (covering the 6 user-facing stack options). Selected stack uses ~100-120 lines; remaining ~500 lines are wasted context.

**After:** Split by backend platform (templates are backend-only — no frontend-specific content):

```
references/structural-test-templates/
  node.md        (Tier 1 Jest/Vitest + Tier 2 ESLint flat/legacy)
  dotnet.md      (Tier 1 xUnit + Tier 2 ArchUnitNET)
  python.md      (Tier 1 pytest + Tier 2 import-linter)
  shared.md      (Allowlist Format, Conflict Resolution, Import Resolution Strategy)
```

Progressive disclosure instruction changes from:
> "Read `references/structural-test-templates.md`"

To:
> "Read `references/structural-test-templates/<backend>.md` and `references/structural-test-templates/shared.md`"

Where `<backend>` is `node`, `dotnet`, or `python` based on the selected stack's backend. The "Other" tech stack path skips this file entirely (unchanged behavior).

Only the relevant ~100-120 lines of backend templates load, plus ~60 lines of shared content. The Tier 3 instruction ("Structural tests must run in CI before merge") is a single line included in each backend file.

Estimated savings: ~500 lines of wasted context per run.

---

## What Does NOT Change

- **review-code agent prompts** — already efficient, single-agent pattern
- **review-code reviewer.md / coder.md** — no modifications
- **review-doc JSON schema** — identical output format, all categories preserved
- **review-doc `--against` flag** — unchanged behavior
- **review-doc `--effort` flag** — unchanged behavior, high remains correct for complex specs
- **review-doc backlog writing** — review-doc still does not write to past-issues-backlog.md
- **refactor-to-monorepo workflow** — 4-phase pipeline unchanged
- **refactor-to-layers workflow** — ANALYZE/SCAFFOLD modes unchanged
- **Any agent's tool usage rules** — all tool constraints preserved

---

## Files Modified

All paths are relative to `ai-dev-tools/` (the plugin root).

| File | Action |
|---|---|
| `skills/review-doc/SKILL.md` | Section-by-section edits (see table below) |
| `skills/review-doc/prompts/reviewer.md` | Rewrite: merge completeness + implementability checklists, absorb synthesis logic (dedup, confidence filtering, severity mapping, 20-item cap, JSON schema output) |
| `skills/review-doc/prompts/coder.md` | No changes needed (model tiering is handled by the orchestrator's dispatch, not the coder prompt itself) |
| `skills/review-doc/agents/codebase-fact-checker.md` | Rewrite output format: replace markdown verdicts with JSON-append behavior (read tmp/review.json, append fact-check issues, set fact_check_claims/accuracy, rewrite file). Add Serena tool preferences. |
| `skills/review-doc/agents/synthesis.md` | Delete |
| `skills/review-doc/agents/completeness-reviewer.md` | Delete (merged into reviewer.md) |
| `skills/review-doc/agents/implementability-auditor.md` | Delete (merged into reviewer.md) |
| `skills/review-code/SKILL.md` | Change default --max-iterations to 1 |
| `skills/refactor-to-monorepo/SKILL.md` | Update progressive disclosure to section-only |
| `skills/refactor-to-layers/SKILL.md` | Update progressive disclosure to section-only |
| `skills/refactor-to-layers/references/structural-test-templates.md` | Delete (split into per-backend files) |
| `skills/refactor-to-layers/references/structural-test-templates/` | New directory: `node.md`, `dotnet.md`, `python.md`, `shared.md` |

### SKILL.md Section Edit Table (review-doc)

| SKILL.md Section | Action |
|---|---|
| Frontmatter (`description`) | Update if "parallel" or "synthesizes" appears; currently may not contain these terms |
| `# Review Doc` (intro paragraph, line ~8) | Rewrite: remove "parallel agents" and "synthesizes" language (these terms are in the intro paragraph, not the frontmatter). Describe single merged reviewer, no synthesis, sequential fact-checker |
| `## Argument Parsing` (flag table + usage line) | Remove `--mid-model` row. Update `--min-model` default to sonnet, purpose to "Early rounds: reviewer + fixer". Change `--max-iterations` default to 1. Update usage line to remove `--mid-model`. |
| `### --help Output` | Rewrite help block: remove `--mid-model`, update `--min-model` line, change `--max-iterations` default to 1 |
| `## Edge Case: --max-iterations 1` | Rewrite (supersedes existing section): single Opus reviewer writes JSON directly, then Opus fact-checker appends. No parallel agents, no synthesis. The old 3-agent parallel + synthesis flow is fully replaced. |
| `## Iteration Flow` | Rewrite: replace pseudocode with new flow (single reviewer per round, no synthesis, sequential fact-checker in final round). Remove `FIX PHASE (skipped when is_final_gate)` — the final round now includes a fixer. Add sequential fact-checker dispatch after fixer in final round. |
| `## Agent Dispatch (Early Rounds)` | Rewrite: 1 Sonnet reviewer (merged checklist), no parallel agents, no completeness-reviewer/implementability-auditor references. Change "Read prompts/reviewer.md for complete dispatch instructions" to "Read prompts/reviewer.md and dispatch it as the reviewer agent prompt." |
| `## Agent Dispatch (Final Gate)` | Rewrite: 1 Opus reviewer, then Opus fixer, then Opus fact-checker sequentially. Remove parallel 3-agent dispatch. Change "Read prompts/reviewer.md for complete dispatch instructions" to "Read prompts/reviewer.md and dispatch it as the reviewer agent prompt." |
| `## Synthesis` | Delete entire section (synthesis.md is deleted) |
| `## Fixer` | Update: change dispatch from `Agent(prompt: <prompt>, model: "opus")` to conditional: early rounds `Agent(prompt: prompts/coder.md, model: <min-model>)`, final round `Agent(prompt: prompts/coder.md, model: <max-model>)`. Add sequential fact-checker dispatch after fixer in final round (fixer completes, then fact-checker runs). |
| (New section or merge into Fixer) `## Fact-Checker Dispatch` | Add: sequential dispatch logic — fact-checker runs AFTER fixer completes in final round. Include Serena tool preference instructions. |
| `## Iteration Log Format` | Update: agent count and model references to match new architecture |
| `## Progressive Disclosure Schedule` (if exists) | No change |
| `## JSON Schema` | Keep unchanged (schema itself doesn't change) |

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Merged reviewer misses issues that a specialist would catch | The combined checklist preserves all categories. Effort=high ensures thorough coverage. User can increase iterations for critical docs. |
| Sonnet fixer makes imperfect early-round fixes | Next review round catches them. Only used when iterations >= 2. |
| Serena MCP overhead adds latency | ~100-200ms per call x 15-20 calls = 1.5-4s total. Negligible vs LLM inference time saved. |
| Fact-checker running after fixer adds wall time | Sequential by design — ensures cleanest document. The time cost is offset by eliminating parallel duplication overhead. |
| Fact-checker read-modify-write corrupts review.json | Orchestrator captures `tmp/review.json` backup before fact-checker runs. If fact-checker fails, fall back to reviewer-only JSON with warning that fact-checking was incomplete. |

---

## Verification

After implementation, verify with these concrete test cases:

1. **review-doc single-pass (default):** Run `/review-doc docs/any-spec.md`. Confirm: exactly 2 agent dispatches (1 reviewer + 1 fact-checker), both at Opus. `tmp/review.json` is valid against the JSON schema. No synthesis agent dispatched. Fact-checker appends to the reviewer's JSON (not separate output).

2. **review-doc iterative:** Run `/review-doc docs/any-spec.md --max-iterations 3`. Confirm: early rounds dispatch 1 Sonnet reviewer + 1 Sonnet fixer. Final round dispatches 1 Opus reviewer + 1 Opus fixer + 1 Opus fact-checker sequentially. No parallel agent dispatch at any point.

3. **review-doc flag changes:** Run `/review-doc --help`. Confirm: no `--mid-model` flag, `--min-model` default is sonnet (not haiku), `--max-iterations` default is 1 (not 4).

4. **review-code default change:** Run `/review-code --help`. Confirm: `--max-iterations` default is 1.

5. **refactor-to-monorepo section loading:** Run `/refactor-to-monorepo` on a Node.js project. Confirm: only the Node.js section of `tech-stacks.md` is retained in context after progressive disclosure.

6. **refactor-to-layers template split:** Run `/refactor-to-layers` on a Python project. Confirm: loads `references/structural-test-templates/python.md` + `shared.md`, not the full 621-line monolith.

7. **Deleted files:** Confirm `agents/synthesis.md`, `agents/completeness-reviewer.md`, and `agents/implementability-auditor.md` no longer exist under `skills/review-doc/`.
