# review-code `--effort ultracode` — Multi-Agent Review Design

**Date:** 2026-07-20
**Status:** Deferred (design only — not yet implemented)
**Scope:** `review-code` only. `review-doc` is explicitly excluded (document review caps at `max`).
**Prerequisite (done):** `--effort {high|xhigh|max}` re-added to both review skills, default `max`. This spec adds `ultracode` as the top tier on `review-code`.
**Provenance:** Synthesized from a 3-proposal design panel + adversarial critic (2026-07-20). This document is the durable record of that analysis.

---

## 1. Problem statement

The single-agent reviewer has two structural weaknesses that get worse exactly when a change touches **many files at once**:

1. **Truncation.** The reviewer works under a 3000-line git-diff budget; files over budget degrade to stat-only summaries, so large changes are only partially reviewed.
2. **Consistency blindness.** Cross-file divergence — inconsistent naming, error-handling idioms, API/return shapes, logging conventions, duplicated-but-divergent helpers — is invisible to an agent that skims a truncated diff and never holds all touched files at once.

`ultracode` is the opt-in tier that fixes both by replacing **only the REVIEW phase** with a multi-agent fan-out, while producing the byte-identical `review-code.json` contract so everything downstream is unchanged.

## 2. Goals / Non-goals

**Goals**
- Eliminate stat-only truncation on large multi-file changes (every touched file gets full-diff depth review).
- Make cross-file **consistency** a first-class, reliably-surfaced concern.
- Preserve the exact `review-code.json` contract and the entire downstream loop (validation, fix, verification, backlog).
- Deterministic, non-interactive, orchestrate-safe; strictly opt-in.

**Non-goals**
- No multi-agent **fixing** — the fixer stays single-agent (parallel edits would collide). `ultracode` changes only the review phase.
- No `ultracode` for `review-doc`.
- No schema change to `review-code.json` (no new `consistency` category).
- Not a general-purpose whole-repo consistency scanner — scope is the touched files of the change under review.

## 3. Design overview

```
ULTRACODE review phase (replaces only the REVIEW step of the existing loop):

  git --numstat ─► deterministic cohesion-first bin-pack (by file, ≤3000 lines/shard)
        │
        ├─► K DEPTH reviewers — prompts/reviewer.md VERBATIM, full diffs, never stat-only ──┐
        │      (waves ≤ min(16,cores-2)−1; flag only within assigned files)                 │
        └─► 1 CONSISTENCY agent — whole change, fixed checklist, confidence ≤79 ────────────┤
                                                                                            ▼
                          deterministic MERGE (read only this dispatch's shards;
                          dedup by dimension; recount from issues[])
                                                                                            ▼
                          same tmp/_reviews_errors/[<run_id>-]review-code.json
                                                                                            ▼
                          VALIDATION → STOP CHECK → FIX (single agent) → … all UNCHANGED
```

## 4. Detailed design

### 4.1 Triggers (decoupled — the keystone)

Depth-sharding and the consistency pass are triggered by **different** signals:

- **`ultracode` engages only via explicit `--effort ultracode`.** Never auto-selected, never a default, never auto-escalated by `orchestrate`.
- **Size gate.** `ultracode` requires `F ≥ 6` touched files **OR** `L > 3000` diff lines — the regime where single-agent truncation actually bites. Below the gate, print `ultracode: change too small (F files / L lines); running single-agent max` and **downgrade to the single `max` reviewer** (logged).
- **Depth-sharding triggers on truncation only:** `K = max(ceil(L / SHARD_BUDGET), ceil(F / MAX_FILES_PER_SHARD))`. For a many-small-files change with `L ≤ 3000`, this yields `K = 1` — a *single* depth reviewer. **Do not shard depth on file-count alone** (see §7, seam regression).
- **The consistency agent runs whenever `ultracode` is on** (i.e. above the size gate), independent of `K`.

### 4.2 Deterministic sharding

- Source: `git diff --numstat` over the review scope (count-mode or since-mode, unchanged).
- `SHARD_BUDGET = 3000` lines (== today's single-agent budget — replicate known-good density K times, never stretch it).
- `MAX_FILES_PER_SHARD = 12` (attention cap so a shard of many tiny files stays reviewable).
- Cohesion-first bin-pack: sort files by path (keeps same-dir/module files adjacent → real couplings land in one shard), first-fit-decreasing by size, lexicographic tie-break. Overflow starts a **new bin** — never a stat-only summary.
- A single file larger than `SHARD_BUDGET` gets its own shard with the budget raised to fit it whole (never split a file).

### 4.3 Depth reviewers (`K` agents)

- **Reuse `prompts/reviewer.md` VERBATIM** — parameterize only its output path as `{{OUTPUT_PATH}}`. Identical prompt ⇒ identical confidence rubric ⇒ minimal cross-agent calibration drift. (This also normalizes a pre-existing latent bug — see §9.)
- Each agent SEES: the full diffs of its assigned files (never stat-only), the **global manifest** (every touched file's path + numstat across all shards, for peripheral awareness), spec (`--against`), CLAUDE.md, ADRs (existing budgets).
- May **Read** anywhere (to inspect a caller/definition in another shard) but **flags findings only for locations inside its assigned files** — makes cross-shard location-dups impossible by construction.
- Writes `tmp/_reviews_errors/<shard-dir>/shard-<i>.json` in the exact per-issue schema.
- Run in waves of at most `min(16, cores-2) − 1` (one slot reserved for the consistency agent).

### 4.4 Consistency agent (exactly 1)

- New prompt `prompts/consistency.md`. Runs **concurrently** with the depth shards (reserved slot).
- **Fixed checklist** (the reliability lever — stable, thorough output): naming conventions · error-handling idiom · public-API/signature shape · logging format · duplicated-but-divergent helper **structure**.
- **Anchoring — declared beats majority:** if CLAUDE.md/ADRs declare a convention, it is the anchor; otherwise the `>50%` convention across the touched set. Every file that diverges from the anchor is a finding.
- **Confirm-by-Read before filing:** read the divergent file + one anchor/majority exemplar. When the touched set is small, also sample one **untouched** exemplar from the repo (guards against flagging the correct file when the touched sample is the lagging minority of a codebase-wide norm).
- **Anchor each finding at the divergent file's location** (the file that should change) — maximizes overlap with the owning depth shard for clean dedup.
- Category = `architecture` (no schema change). Carry a machine-readable `[consistency:<dim>]` tag in `problem` for traceability.
- **Emit `confidence ≤ 79`** — never 80+. (See §5 — this preserves the `≥80 ⇒ critical` invariant and keeps the stop-gate driven only by depth agents. Do **not** clamp *severity* after the fact — that desyncs confidence from severity.)
- **Lane rule:** the consistency agent never adjudicates logic correctness. Whether a diverged helper is actually *buggy* is a `bug` for the owning depth shard (which can be `critical`); the consistency lane only reports "these diverge" as `architecture`/≤high.
- Writes `tmp/_reviews_errors/<shard-dir>/consistency.json`.

### 4.5 Deterministic merge (orchestrator code, not an agent)

1. Read **only the shard indices this dispatch produced** (never a glob — see §6 stale-shard guard) plus `consistency.json`.
2. Concatenate `issues[]`. Dedup key = `(path, line bucketed ±3, category)`. Shards are file-disjoint, so the only real collision is shard-vs-consistency on a seam file: resolve by **dimension**, with the consistency finding authoritative for cross-file dimensions; otherwise keep higher confidence. Log every drop.
3. Recount `critical_count` / `high_count` from the merged `issues[]` (this is the existing VALIDATION recount — reused).
4. Sort deterministically: severity desc, confidence desc, `path:line` asc, category asc.
5. Write the single canonical `tmp/_reviews_errors/[<run_id>-]review-code.json`.

Everything from VALIDATION down (STOP CHECK, FIX, VERIFICATION, BACKLOG, summary, status logic, JSON schema) is byte-for-byte unchanged.

## 5. Contract & determinism (honest)

- The consistency lane's `confidence ≤ 79` guarantees all `critical`s come only from depth agents reviewing full diffs — exactly as authoritative as today's lone reviewer — so cross-file *style* divergence can never wedge the critical stop-gate open, and the `≥80 ⇒ critical` invariant (which VALIDATION assumes but never re-derives) stays intact.
- **Deterministic sharding/merge does NOT make `critical_count` point-stable.** Findings are LLM samples; fanning out to K agents replaces one "is this critical?" draw with K independent draws, which *amplifies* run-to-run count variance vs. the single reviewer. The loop still terminates (the `--max-iterations` cap guarantees it), but reproducibility regresses. This is inherent to multi-agent review and unfixable by orchestration — state it, don't hide it.

## 6. Mandatory hard guardrails (must live in SKILL.md, not prose)

1. **Stale-shard guard (highest-value).** Write shards into a **run-id-scoped, freshly-emptied directory**, and have merge read **only this dispatch's shard indices** — never a glob. Otherwise a `shard-*.json` left by a crashed prior run folds phantom criticals into this run and corrupts the stop-gate. Add the shard dir to Setup step-2 stale-cleanup.
2. **Per-shard retry-once-then-ABORT.** Reuse the existing "retry once, then abort" rule per shard. Never silently mark a failed shard's files "unreviewed and continue" — that yields false 0-criticals → premature stop.
3. **Opt-in only.** `--effort ultracode` explicit; default stays single-agent `max`; `orchestrate`/auto must never auto-escalate.
4. **Cost line, priced honestly.** Before dispatch, print `ultracode: K depth reviewers + 1 consistency agent over F files / L lines`. Note that in **since-mode** (orchestrate auto path) iteration 2+ re-reviews full scope, so cost is `(K+1) × iterations`, not one pass.
5. **Nothing silent.** Log every cluster→shard assignment, wave, oversized-file shard, clamp/budget-raise, downgrade, and dedup drop to `review-code-iteration-N.md`.
6. **No interactive stops.** If the change is so large that depth would exceed the concurrency cap, clamp-and-raise-budget (ship full diffs, log density-degraded) — never prompt the user (breaks non-interactive orchestrate). An absolute ceiling emits a logged status, not a question.

## 7. Known residual weakness — the mid-size seam bug

For a change a single `max` agent could hold **entirely** (no truncation), splitting depth into ≥2 shards *adds* a "caller-in-shard-A / callee-in-shard-B" seam-bug risk with **zero** coverage benefit. This is why the depth trigger is **truncation-based** (`L > SHARD_BUDGET` or `F > MAX_FILES_PER_SHARD`), never "many files." Mitigations for genuinely-large changes (where sharding is unavoidable): cohesion-first packing (keep caller+callee in one module/shard), the global manifest + cross-Read permission, and the consistency agent's interface-level view. Honest note: on changes big enough to *need* sharding, that seam bug would have been in the single reviewer's stat-only tail anyway — so `ultracode` is still ≥ single-agent there.

## 8. Cut list (unearned cleverness — explicitly rejected)

- **Agent-emitted "fingerprint census" + serialized reducer** (couples consistency to depth-agent compliance, adds a latency tail, modifies the vetted reviewer prompt). Keep the *census property* via the consistency agent's complete-file-list view instead.
- **Reducer dimension-sub-sharding.** One consistency agent suffices; if its input truly won't fit, that's the pathological-size ceiling, not a fan-out cue.
- **Elaborate dedup engine.** Disjoint shards make the collision space nearly empty — a simple bucketed key + dimension tie-break + logged drops is correct.
- **By-dimension depth fan-out** (bug/security/arch agents each over the whole diff): each still hits the budget, so it never removes truncation. Rejected.

## 9. SKILL.md / prompt edit surface (honest, larger than a one-liner)

- Effort table: register `ultracode` as the top tier (multi-agent, opt-in, multi-file only).
- Iteration Flow › REVIEW PHASE: one branch — `if effort == ultracode → Ultracode Review Phase (produces identical review-code.json); else single reviewer`.
- Reviewer Agent: pointer sentence to the new subsection.
- **New "Ultracode Review Phase" subsection** (all new logic: size gate, deterministic clustering, depth waves + per-shard budget, consistency dispatch + checklist + anchoring + confidence-≤79 + confirm-by-Read, merge/dedup, guardrails, logging).
- Context Budgets: note the 3000-line budget is **per shard** under ultracode; stat-only cannot occur.
- Output Artifacts + Setup step-2 stale-cleanup: the run-id-scoped shard directory (**do not omit** — guardrail 6.1).
- Error Handling: per-shard retry/abort semantics (**do not omit** — guardrail 6.2).
- Prompts: `{{OUTPUT_PATH}}` in `prompts/reviewer.md`; new `prompts/consistency.md`.
- **Pre-existing cleanup rolled in:** `prompts/reviewer.md` currently writes `tmp/review-code.json` while the skill reads `tmp/_reviews_errors/review-code.json` (same mismatch in `coder.md`). The `{{OUTPUT_PATH}}` parameterization normalizes this.

## 10. Open decisions (resolve during spec review)

1. **Consistency input: thin deterministic digest vs. checklist-only.** A thin orchestrator-side signature extractor (cheap language-agnostic token passes over changed hunks) gives the consistency agent a reproducible pre-correlated input — but it is the main new maintenance surface and the main residual false-negative risk (exotic languages). The alternative (checklist-only: hand the agent the file list and let it Grep) needs no extractor but is slightly less reproducible. **Recommendation:** start checklist-only (simplest, no parser to maintain); add the thin digest later only if consistency recall proves inadequate.
2. **Exact gate/threshold values** (`F ≥ 6`, `L > 3000`, `MAX_FILES_PER_SHARD = 12`) — tune with real changes.
3. **Downgrade vs. error below the size gate** — current design downgrades to single `max` (logged); confirm that's preferred over erroring.

## 11. Acceptance criteria

- `--effort ultracode` on a large multi-file change reviews every touched file at full diff (no stat-only) and produces a schema-valid `review-code.json` that flows through the unchanged loop.
- At least one genuine cross-file inconsistency in a seeded test change is reported as an `architecture` finding tagged `[consistency:<dim>]` at `confidence ≤ 79`.
- Below the size gate, `ultracode` downgrades to the single `max` reviewer (logged), producing output identical in shape to a normal `max` run.
- A stale `shard-*.json` from a prior run does **not** affect a subsequent run's counts.
- `orchestrate` auto (non-interactive) never blocks on a prompt and prices cost as `(K+1) × iterations`.
