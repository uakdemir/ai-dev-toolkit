# Orchestrate `--auto`: Iteration Count + Profiling Log — Design

**Date:** 2026-04-18
**Scope:** `ai-dev-tools/skills/orchestrate` (auto mode only)
**Status:** Design approved; pending implementation plan.

---

## Motivation

Two small, independent changes to `/orchestrate --auto`:

1. **Reduce stage-i phase 1 iterations** from 3 → 2. Phase 1 is cheap sonnet exploration; empirically 2 iters is sufficient before handing off to the rigorous opus+fact-check phase.
2. **Add per-dispatch profiling log** so the user can later analyze where wall time goes across the pipeline (spec review vs implement vs code review).

---

## Change 1 — Iteration Count

Stage i phase 1: `--max-iterations 3` → `--max-iterations 2`. Phase 2 unchanged at 2 opus+fact-check iters. Worst-case review dispatches per spec: 5 → 4.

### Files modified

| File | Edit |
|---|---|
| `references/auto/stages/stage-i-spec-review.md` line 10 | `--max-iterations 3` → `--max-iterations 2` |
| `references/auto/stages/stage-i-spec-review.md` line 15 | "Up to 3 iterations" → "Up to 2 iterations" |
| `references/auto/stages/stage-i-spec-review.md` line 53 | "**Bounded worst case:** 3 + 2 = 5 review dispatches per spec." → "**Bounded worst case:** 2 + 2 = 4 review dispatches per spec." |
| `references/auto/pipeline-overview.md` line 22 | `--max-iterations 3` → `--max-iterations 2` in stage i table row |
| `references/auto/pipeline-overview.md` line 31 | "(3 sonnet + 2 opus+fact-checker iters)" → "(2 sonnet + 2 opus+fact-checker iters)" |

### Semantics preserved

- Phase 2 always runs regardless of phase 1 outcome.
- Endless-loop check applies only to phase 2's final iteration (unchanged).
- Handoff between phases is still via the spec file on disk.

---

## Change 2 — Profiling Log

### Location

`~/.local/share/ai-dev-tools/ai-dev-tools.log`

Chosen as the XDG-compliant user-data directory — no root required, persistent across reboots, standard Linux convention for user-level application logs. `/var/log` would need sudo; `/tmp` is ephemeral.

### Format

JSON Lines (JSONL). One JSON object per line.

```json
{"ts":"2026-04-18T10:00:00Z","spec":"foo.md","action":"review-doc","round":1,"model":"sonnet","total_time_s":42.1}
{"ts":"2026-04-18T10:00:45Z","spec":"foo.md","action":"review-doc","round":2,"model":"opus","total_time_s":88.3}
{"ts":"2026-04-18T10:02:14Z","spec":"foo.md","action":"implement","round":1,"model":"default","total_time_s":412.6}
{"ts":"2026-04-18T10:09:07Z","spec":"foo.md","action":"review-code","round":1,"model":"opus","total_time_s":95.2}
```

### Schema

| Field | Type | Meaning |
|---|---|---|
| `ts` | string (ISO-8601 UTC, `Z`-suffixed) | Timestamp captured at dispatch **end** |
| `spec` | string | Spec file basename (e.g. `"mobile-scaffold-integration-design.md"`) — basename, not full path |
| `action` | enum: `"review-doc"` \| `"implement"` \| `"review-code"` | Which pipeline stage |
| `round` | integer ≥ 1 | Phase/iteration ordinal within the action (see below) |
| `model` | enum: `"sonnet"` \| `"opus"` \| `"default"` | Model passed to the sub-command; `"default"` = no explicit `--model` flag |
| `total_time_s` | float | Wall-clock seconds from dispatch start to dispatch return |

### Round semantics

| Action | Round value |
|---|---|
| `review-doc` phase 1 | `1` |
| `review-doc` phase 2 | `2` |
| `implement` | `1` |
| `review-code` iter N | `N` (1 through 4) |

### Entries per spec run

| Stage | Entries |
|---|---|
| i — spec review | 2 (phase 1 + phase 2) |
| ii — implement | 1 |
| iii — code review | 1 to 4 (one per iter; early-exit if 0 criticals) |
| iv — verification gate | 0 (no-op in current release) |

**Total: 4–7 entries per spec run.**

### Write protocol

Executed by orchestrate around every sub-agent dispatch in auto mode:

1. `start_ts = epoch-ms-now()` before dispatching.
2. Dispatch sub-agent; await return.
3. `total_time_s = (epoch-ms-now() - start_ts) / 1000`.
4. Ensure directory exists: `mkdir -p ~/.local/share/ai-dev-tools` (idempotent; no-op if present).
5. Append one JSONL line with `>>` redirect.
6. **Failure policy:** if the append fails (disk full, permission changed, etc.), swallow silently. Profiling I/O must never block or fail the pipeline.

### Concurrency safety

Single-line appends smaller than `PIPE_BUF` (4 KiB on Linux) are atomic under POSIX when opened with `O_APPEND`. Each entry is well under this limit, so concurrent `/orchestrate --auto` invocations writing to the same log file cannot interleave bytes. Entries from different runs may appear in any order; they are self-identifying via the `spec` and `ts` fields.

### Failure & edge cases

| Case | Behavior |
|---|---|
| Sub-agent crashes before return | No entry written for that phase. Crash handled by existing Q3 failure-handling flow. |
| Sub-agent hangs (orchestrate aborts) | No entry written. Wall time is only recorded on clean return. |
| Log dir creation fails | Attempt append anyway; catch failure per step 6. |
| Log file deleted mid-run | Next append recreates it (`>>` behavior). |
| Disk full | Append fails; swallowed per step 6; pipeline continues. |

---

## File-Change Surface

| File | Change |
|---|---|
| `ai-dev-tools/skills/orchestrate/references/auto/profiling-log.md` | **NEW** — single source of truth for path, schema, write protocol, failure policy |
| `ai-dev-tools/skills/orchestrate/references/auto/pipeline-overview.md` | Iter count edits (Change 1) + one-line invariant pointing to `profiling-log.md` |
| `ai-dev-tools/skills/orchestrate/references/auto/stages/stage-i-spec-review.md` | Iter count edits (Change 1) + "write profiling entry after each phase dispatch" instruction |
| `ai-dev-tools/skills/orchestrate/references/auto/stages/stage-ii-implement.md` | "Write profiling entry after implement returns (pre-validators)" instruction |
| `ai-dev-tools/skills/orchestrate/references/auto/stages/stage-iii-code-review.md` | "Write profiling entry after each iteration dispatch returns" instruction |

Each stage file references `profiling-log.md` rather than duplicating the schema.

---

## Explicit Non-Goals

- **Token capture.** Claude Code's Agent/Task dispatch does not surface token usage to the parent agent. Dropped from this design. Can be added later if the harness exposes usage metadata.
- **Standard-mode logging.** Log is auto-mode-only. Standard mode remains unchanged.
- **Log rotation.** Append-only with no size/age cap. User can truncate manually. If growth becomes a problem, rotation is a follow-up.
- **Failure-path logging.** Crashed / hung dispatches produce no entry. Correlating log with failures is done via existing error-logs (`references/common/error-logs-format.md`).
- **Per-iteration granularity inside `/review-doc`.** Phase 1 may run up to 2 internal sonnet iterations inside a single dispatch; we log the phase, not each internal iter. Per-iter granularity would require restructuring stage i or modifying `/review-doc`, out of scope.

---

## New Invariant (added to `pipeline-overview.md`)

> Auto mode appends one JSONL profiling entry per sub-agent dispatch to `~/.local/share/ai-dev-tools/ai-dev-tools.log`. Write failures are silently swallowed — profiling never blocks the pipeline.

---

## Acceptance Criteria

1. `/orchestrate --auto <spec>` runs stage i phase 1 with `--max-iterations 2`.
2. After a clean auto run on one spec with no code-review early-exit (all 4 iters run), the log contains exactly 7 entries for that spec (2 review-doc + 1 implement + 4 review-code).
3. After a clean auto run on one spec with code-review early-exit on iter 1, the log contains exactly 4 entries (2 review-doc + 1 implement + 1 review-code).
4. Each entry parses as valid JSON and contains all six fields.
5. A deliberately broken log path (e.g. `chmod 000 ~/.local/share/ai-dev-tools`) does not fail the pipeline.
6. Concurrent `/orchestrate --auto` invocations produce non-interleaved entries.
