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
- `dispatch_hash`: generated once when auto mode begins a pipeline run for a spec, and shared by every stage, phase and iteration of that run. Dispatches within the run are told apart by the loop variable in the prefix — `-phase<N>` at stage i, `-iter<N>` at stage iii — not by a fresh hash. A **crash retry** under `../auto/failure-handling/retry-semantics.md` does mint a new one, which is what "retries get a fresh dispatch_hash for diffing" above means: the retry's artifacts sit beside the failed attempt's instead of overwriting them.

  Read as "fresh for every individual agent dispatch" this rule contradicts the layout above, where one `a1b2c3d4` spans stage i's two phases and stage iii's iterations, and it would make the loop-variable prefixes pointless — every dispatch would already be uniquely namespaced. It would also break the Gate Read Contract's recipe below, which forms a path from one `<run_id>` plus an iteration number.

**Propagation:** every agent dispatch passes the run-id via the `--run-id` CLI flag, which the receiving skill's argparse reads. Orchestrate's stage dispatches carry it nowhere else.

**File layout example:**

```
tmp/_reviews_errors/
├── error-logs.md                                    # global append-only log
├── k3m9p2q7_a1b2c3d4-phase1-review-doc.json         # spec1 agent i phase 1
├── k3m9p2q7_a1b2c3d4-phase1-review-doc-summary.md
├── k3m9p2q7_a1b2c3d4-phase2-review-doc.json         # spec1 agent i phase 2
├── k3m9p2q7_a1b2c3d4-iter1-review-code.json         # spec1 agent iii, iteration 1 — its own run-id, never overwritten
├── k3m9p2q7_a1b2c3d4-iter1-review-code-iteration-1.md          # that dispatch's single round log
├── k3m9p2q7_a1b2c3d4-iter1-review-code-iteration-1.json        # and its snapshot, redundant here, kept for uniformity
├── k3m9p2q7_a1b2c3d4-iter2-review-code.json         # iteration 2, a separate namespace
├── k3m9p2q7_a1b2c3d4-iter2-review-code-iteration-1.md
├── b7n4x1y8_q7r8s9t0-phase1-review-doc.json         # spec2 agent i phase 1
└── ...
```

**Both stages put their loop variable in the run-id prefix.** Stage i passes
`--run-id <run_id>-phase1` / `-phase2`, so the phase lands in the prefix — `<run_id>-phase1-review-doc.json`,
not `<run_id>-review-doc-phase<N>.json`. Stage iii passes `--run-id <run_id>-iter<N>`, one dispatch per
iteration, so each iteration gets its own `<run_id>-iter<N>-review-code.json` and no dispatch overwrites
another's. A contract expecting a `-phase<N>.json` or `-iter<N>.json` *suffix* is naming something no
skill produces — the loop variable is always a prefix.

**What each stage's file therefore covers differs, and the Gate Read Contract below turns on it.** A
stage-iii file spans exactly one iteration. A stage-i phase file spans that phase's inner
iterations — up to two, overwritten between them when the phase runs more than one — because stage i
dispatches per phase rather than per iteration.

**Per-round JSON does exist, and it is not what the gates read.** Both review skills snapshot each
round before the next overwrites it: `<prefix>-review-code-iteration-N.json` every round, and
`<prefix>-review-code-fix-report-iteration-N.json` whenever that round ran a fix phase (`review-doc`
writes the matching `-review-doc-` pair). Those are a durable post-hoc audit record, written after the
gate has already taken its number in flight — reading them would yield the same value one step later,
not a fresher one. The iteration log (`<prefix>-review-code-iteration-N.md`) is unchanged and stays the
human-readable per-round record.

`<prefix>` is the whole run-id the skill was given, loop variable included, and the `N` here counts
rounds **within that dispatch** — not the stage's iteration. At stage iii the two coincide at 1
(`<run_id>-iter2-review-code-iteration-1.json` is stage iteration 2's only round), which makes the
snapshot redundant there and load-bearing everywhere else: stage i's phases run two rounds each, and a
standalone run may run up to ten.

**Standalone usage (no `--run-id`):** skills write to un-prefixed filenames inside `tmp/_reviews_errors/` (e.g. `tmp/_reviews_errors/review-doc.json`). This moves the output path from the previous `tmp/review-doc.json` location.

---

## Gate Read Contract — critical count

The auto-pipeline gates (stage-iii early-exit, stage-i and stage-iii unresolved-criticals) read the critical count from each review JSON (`tmp/_reviews_errors/<run_id>-phase<N>-review-doc.json` for stage i, `tmp/_reviews_errors/<run_id>-iter<N>-review-code.json` for stage iii). The field is **`critical_count`**, recounted from the `issues[]` array by the review skill (a stale emitted value is never trusted). Read recipe:

```bash
jq '.critical_count' tmp/_reviews_errors/<run_id>-iter<N>-review-code.json
```

**The gates read this value in flight, not off disk.** Every consuming gate is specified against the
iteration's REVIEW output, before that iteration's fix phase, and the orchestrator holds that number
in its own state. What the file lacks is freshness, not correctness. Every write to the counts happens
*before* the fix phase — the reviewer's, and the fact-checker's recount after appending its findings —
and nothing after the fix phase recomputes them: the fixer writes only its fix report, and both
self-review passes are forbidden to recount and instead append findings carrying
`origin: "self-review"`. At stage iii there is no third writer: `review-code`'s stop check writes
nothing to the artifact, and a verification regression never enters these counts at all. An
iteration's end-of-iteration `critical_count` is therefore that iteration's pre-fix number.

**At stage iii that number also survives on disk**, because the iteration is in the run-id: every
gate the stage-iii early exit evaluates — one per iteration — is afterwards checkable at
`<run_id>-iter<N>-review-code.json`, which no later dispatch overwrites. The `jq` recipe reads
whichever iteration is named. Only a later *run* reusing the same `<run_id>` clears them, at Setup.

**At stage i it does not.** A phase file spans that phase's two inner iterations and is overwritten
between them, so the recipe returns the phase's **last** iteration. That is the number stage i's
unresolved-criticals gate wants — it is specified against the final iteration. A phase that early-exits
after one iteration never overwrites anything, so its file still holds that iteration directly; a phase
that runs both leaves the first recoverable only from `review-doc`'s own per-round snapshot,
`<run_id>-phase<N>-review-doc-iteration-1.json`, and only after the fact: the snapshot is written once
the gate has already taken its number, so it audits that gate rather than feeding it. The iteration
log (`-review-doc-iteration-N.md`) is the human-readable half of the same per-round record.

**Counts measure the artefact under review, never the review loop's own edits.** **The recount excludes the review loop's own churn.** Every issue carries an `origin` — `"document"` or `"self-review"`. Findings raised by a round's own self-review pass, against text that same round's fixer had just written, carry `origin: "self-review"`, and the recount skips them:

```
critical_count = count(severity == "critical" AND origin != "self-review")
high_count     = count(severity == "high"     AND origin != "self-review")
```

An issue with no `origin` counts as `"document"`.

**The exclusion is round-local, and needs no boundary flip to stay that way.** It holds only within the round that wrote those lines — that round both authored and reviewed them, so counting them there reports the loop's own sloppiness as evidence against the authored artefact, and the unresolved-criticals gate (`any critical remaining`, `../auto/failure-handling/unresolved-criticals.md`) can stop the run over it. From the next round onward those lines are ordinary artefact text: the next reviewer re-reads the whole artefact and emits anything it finds in them as `origin: "document"`, counted normally. An implementation that suppresses self-review findings permanently is a different — and wrong — rule.

Excluded from the counts is never excluded from the output. Self-review findings print on their own line in the terminal output and appear in the summary; without that, the loop would have a sanctioned channel for silent degradation.

Enforced by `scripts/validate-review-json.cjs` (`--schema code` / `--schema doc`), which fails closed when a declared count contradicts this recount. Rule: `references/shared-rules/counts-exclude-self-review.md`.
