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
- `Error` — the run stopped on a crash after retry (`../auto/failure-handling/crash.md`)
- `Warning` — everything else worth recording: the run stopped with unresolved criticals and the wip commit holds the work (`../auto/failure-handling/unresolved-criticals.md`), or the run continued past something the reader needs to know — a stage-iii coverage hole, a waived schema check

**Examples:**

```
[2026-04-11 15:02:33] k3m9p2q7_a1b2c3d4 Warning  spec1.md: agent i phase 2 unresolved criticals at iter 2, 3 criticals remaining, committed wip, stopped
[2026-04-11 15:10:17] k3m9p2q7_e5f6g7h8 Error    spec1.md: agent ii implement crashed twice, wip committed at hash7f2a, stopped
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

**Propagation:** every agent dispatch passes the run-id via the `--run-id` CLI flag, which the receiving skill's argparse reads. Orchestrate's stage dispatches carry it nowhere else.

**File layout example:**

```
tmp/_reviews_errors/
├── error-logs.md                                    # global append-only log
├── k3m9p2q7_a1b2c3d4-phase1-review-doc.json         # spec1 agent i phase 1
├── k3m9p2q7_a1b2c3d4-phase1-review-doc-summary.md
├── k3m9p2q7_a1b2c3d4-phase2-review-doc.json         # spec1 agent i phase 2
├── k3m9p2q7_a1b2c3d4-review-code.json               # spec1 agent iii, one file for all iterations (overwritten each time)
├── k3m9p2q7_a1b2c3d4-review-code-iteration-1.md     # per-iteration log
├── k3m9p2q7_a1b2c3d4-review-code-iteration-2.md
├── b7n4x1y8_q7r8s9t0-phase1-review-doc.json         # spec2 agent i phase 1
└── ...
```

**The phase is part of the run-id, and there is no per-iteration JSON.** Stage i passes
`--run-id <run_id>-phase1` / `-phase2`, so the phase lands in the prefix — `<run_id>-phase1-review-doc.json`,
not `<run_id>-review-doc-phase<N>.json`. Stage iii passes a bare `--run-id <run_id>`, so `review-code`
writes **one** `<run_id>-review-code.json` and overwrites it each iteration; the per-iteration record
is the iteration log (`-review-code-iteration-N.md`), not a JSON. Any contract that expects a
`-iter<N>.json` or `-phase<N>.json` file is naming something no skill produces.

**Standalone usage (no `--run-id`):** skills write to un-prefixed filenames inside `tmp/_reviews_errors/` (e.g. `tmp/_reviews_errors/review-doc.json`). This moves the output path from the previous `tmp/review-doc.json` location.

---

## Gate Read Contract — critical count

The auto-pipeline gates (stage-iii early-exit, stage-i and stage-iii unresolved-criticals) read the critical count from each review JSON (`tmp/_reviews_errors/<run_id>-phase<N>-review-doc.json` for stage i, `tmp/_reviews_errors/<run_id>-review-code.json` for stage iii). The field is **`critical_count`**, recounted from the `issues[]` array by the review skill (a stale emitted value is never trusted). Read recipe:

```bash
jq '.critical_count' tmp/_reviews_errors/<run_id>-review-code.json
```

**The gates read this value in flight, not off disk.** Every consuming gate is specified against the
iteration's REVIEW output, before that iteration's fix phase, and the orchestrator holds that number
in its own state. What the file lacks is freshness, not correctness. Every write to the counts happens
*before* the fix phase — the reviewer's, the fact-checker's recount after appending its findings, and
at stage iii the stop check's synthetic-critical injection — and nothing after the fix phase
recomputes them: the fixer writes only its fix report, and both self-review passes are forbidden to
recount and instead append findings carrying `origin: "self-review"`. An iteration's end-of-iteration
`critical_count` is therefore that iteration's pre-fix number. But `review-code` overwrites the same
path on the next iteration, and the next run using the same path deletes it at Setup, so the file is
not a durable record: read once the iteration that wrote it has passed, or once a later run has
reused the path, it holds whatever happens to be there rather than the number a gate was specified
against.

The `jq` recipe above is for post-hoc inspection, and it returns the **last** iteration's numbers.
That is the number the two unresolved-criticals gates want — both are specified against the final
iteration, so reading `critical_count` off the finished artifact yields the same value the
orchestrator held in flight. It is not the number the stage-iii early exit wants: that gate is
evaluated at **every** iteration, and an earlier iteration's count is not recoverable from this file
at all. The per-iteration record is that iteration's log (`-review-code-iteration-N.md`).

**Counts measure the artefact under review, never the review loop's own edits.** **The recount excludes the review loop's own churn.** Every issue carries an `origin` — `"document"` or `"self-review"`. Findings raised by a round's own self-review pass, against text that same round's fixer had just written, carry `origin: "self-review"`, and the recount skips them:

```
critical_count = count(severity == "critical" AND origin != "self-review")
high_count     = count(severity == "high"     AND origin != "self-review")
```

An issue with no `origin` counts as `"document"`.

**The exclusion is round-local, and needs no boundary flip to stay that way.** It holds only within the round that wrote those lines — that round both authored and reviewed them, so counting them there reports the loop's own sloppiness as evidence against the authored artefact, and the unresolved-criticals gate (`any critical remaining`, `../auto/failure-handling/unresolved-criticals.md`) can stop the run over it. From the next round onward those lines are ordinary artefact text: the next reviewer re-reads the whole artefact and emits anything it finds in them as `origin: "document"`, counted normally. An implementation that suppresses self-review findings permanently is a different — and wrong — rule.

Excluded from the counts is never excluded from the output. Self-review findings print on their own line in the terminal output and appear in the summary; without that, the loop would have a sanctioned channel for silent degradation.

Enforced by `scripts/validate-review-json.cjs` (`--schema code` / `--schema doc`), which fails closed when a declared count contradicts this recount. Rule: `references/shared-rules/counts-exclude-self-review.md`.
