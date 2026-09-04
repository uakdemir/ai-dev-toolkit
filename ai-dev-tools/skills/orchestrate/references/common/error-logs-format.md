# Error Logs Format

Shared infrastructure for auto mode error logging and review artifact storage.

---

## Directory: `tmp/_reviews_errors/`

Created lazily on first use. Contains:
- `error-logs.md` — append-only, human-readable incident log
- Intermediary review outputs (JSON) prefixed with run-id
- No automatic cleanup; user manages manually

---

## `error-logs.md` Entry Format

Append-only, one entry per incident:

```
[YYYY-MM-DD HH:MM:SS] <run_id> <Error|Warning>  <human-readable description>
```

**Severity levels:**
- `Error` — pipeline halted or spec skipped due to crash
- `Warning` — spec skipped due to endless loop (recoverable)

**Examples:**

```
[2026-04-11 15:02:33] k3m9p2q7_a1b2c3d4 Warning  spec1.md: agent i phase 2 endless loop at iter 2, 3 criticals remaining, committed wip, skipped spec
[2026-04-11 15:10:17] k3m9p2q7_e5f6g7h8 Error    spec1.md: agent ii implement crashed twice, halting pipeline, wip committed at hash7f2a
```

---

## Run-id Double-Hash Convention

**Format:** `{spec_hash}_{dispatch_hash}` — each 8-char base36.

**Why double hash:**
- `spec_hash` — per-spec grouping. `ls tmp/_reviews_errors/k3m9p2q7_*` shows all artifacts for that spec.
- `dispatch_hash` — per-dispatch uniqueness. Retries get a fresh dispatch_hash for diffing.

**Generation rules:**
- `spec_hash`: generated once when auto mode begins the pipeline for a spec. Shared across all stages and iterations.
- `dispatch_hash`: generated fresh for every individual agent dispatch. Retries get a new dispatch_hash.

**Propagation:** every agent dispatch includes the run-id in two places:
1. The `--run-id` CLI flag (canonical — parsed by argparse, always wins)
2. The override preamble (reinforcement for agent awareness)

If flag and preamble conflict, the flag value takes precedence.

**File layout example:**

```
tmp/_reviews_errors/
├── error-logs.md                                    # global append-only log
├── k3m9p2q7_a1b2c3d4-review-doc-phase1.json         # spec1 agent i phase 1
├── k3m9p2q7_e5f6g7h8-review-doc-phase2.json         # spec1 agent i phase 2
├── k3m9p2q7_i9j0k1l2-review-code-iter1.json         # spec1 agent iii iter 1
├── k3m9p2q7_m3n4o5p6-review-code-iter2.json         # spec1 agent iii iter 2
├── b7n4x1y8_q7r8s9t0-review-doc-phase1.json         # spec2 agent i phase 1
└── ...
```

**Standalone usage (no `--run-id`):** skills write to un-prefixed filenames inside `tmp/_reviews_errors/` (e.g. `tmp/_reviews_errors/review-doc.json`). This moves the output path from the previous `tmp/review-doc.json` location.

---

## Gate Read Contract — critical count

The auto-pipeline gates (stage-i / stage-iii early-exit, stage-i endless-loop, and the success check) read the critical count from each review JSON (`tmp/_reviews_errors/<run_id>-review-doc-phase<N>.json` or `-review-code-iter<N>.json`). The field is **`critical_count`**, recounted from the `issues[]` array by the review skill (a stale emitted value is never trusted). Read recipe:

```bash
jq '.critical_count' tmp/_reviews_errors/<run_id>-review-code-iter<N>.json
```

**Counts measure the artefact under review, never the review loop's own edits.** **The recount excludes the review loop's own churn.** Every issue carries an `origin` — `"document"` or `"self-review"`. Findings raised by a round's own self-review pass, against text that same round's fixer had just written, carry `origin: "self-review"`, and the recount skips them:

```
critical_count = count(severity == "critical" AND origin != "self-review")
high_count     = count(severity == "high"     AND origin != "self-review")
```

An issue with no `origin` counts as `"document"`.

**The exclusion is round-local, and it flips at the round boundary.** It holds only within the round that wrote those lines — that round both authored and reviewed them, so counting them there reports the loop's own sloppiness as evidence against the authored artefact, and the endless-loop gate (`>1 criticals remaining`, `../auto/failure-handling/endless-loop.md`) can skip a spec over it. From the next round onward those lines are ordinary artefact text: the next reviewer re-reads the whole artefact and emits anything it finds in them as `origin: "document"`, counted normally. An implementation that suppresses self-review findings permanently is a different — and wrong — rule.

Excluded from the counts is never excluded from the output. Self-review findings print on their own line in the terminal output and appear in the summary; without that, the loop would have a sanctioned channel for silent degradation.

Enforced by `scripts/validate-review-json.cjs` (`--schema code` / `--schema doc`), which fails closed when a declared count contradicts this recount. Rule: `references/shared-rules/counts-exclude-self-review.md`.
