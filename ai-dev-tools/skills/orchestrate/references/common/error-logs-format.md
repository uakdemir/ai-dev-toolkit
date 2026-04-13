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
