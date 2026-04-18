# Auto Mode — Profiling Log

Single source of truth for the per-dispatch profiling log emitted by `/orchestrate --auto`. Stage files reference this document rather than duplicating the schema or write protocol.

---

## Location

`${XDG_DATA_HOME:-$HOME/.local/share}/ai-dev-tools/ai-dev-tools.log`

Honors the XDG Base Directory spec: if `XDG_DATA_HOME` is set (e.g., encrypted home, custom layout), the log lives under that root; otherwise it falls back to `~/.local/share`. No root required, persistent across reboots, standard Linux convention for user-level application logs. `/var/log` would need sudo; `/tmp` is ephemeral.

Throughout this document, the shorthand `$LOG` refers to this resolved path:

```bash
LOG_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/ai-dev-tools"
LOG="$LOG_DIR/ai-dev-tools.log"
```

---

## Format

JSON Lines (JSONL). One JSON object per line.

```json
{"schema_version":1,"ts":"2026-04-18T10:00:00Z","spec":"foo.md","action":"review-doc","round":1,"model":"sonnet","total_time_s":42.123}
{"schema_version":1,"ts":"2026-04-18T10:00:45Z","spec":"foo.md","action":"review-doc","round":2,"model":"opus","total_time_s":88.307}
{"schema_version":1,"ts":"2026-04-18T10:02:14Z","spec":"foo.md","action":"implement","round":1,"model":"opus","total_time_s":412.612}
{"schema_version":1,"ts":"2026-04-18T10:09:07Z","spec":"foo.md","action":"review-code","round":1,"model":"opus","total_time_s":95.204}
```

---

## Schema

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | integer | Log schema version. Current: `1`. Bump on any additive or breaking change to the field set or enum membership. Consumers SHOULD accept any `schema_version >= 1` whose required fields (`ts`, `spec`, `action`, `round`, `model`, `total_time_s`) remain present; newer schema_versions MUST only add fields or widen enums. Consumers MAY log and skip entries with unexpected `schema_version`. |
| `ts` | string (ISO-8601 UTC, `Z`-suffixed) | Timestamp captured at dispatch **end** |
| `spec` | string | Spec file basename (e.g. `"mobile-scaffold-integration-design.md"`) — basename, not full path |
| `action` | enum: `"review-doc"` \| `"implement"` \| `"review-code"` | Which pipeline stage. Consumers MUST treat unknown values as opaque (forward compatibility). |
| `round` | integer ≥ 1 | Phase/iteration ordinal within the action (see below) |
| `model` | enum: `"sonnet"` \| `"opus"` | Logical model used by the sub-command. ALWAYS the effective model, never a "default" sentinel: `review-doc` phase 1 → `"sonnet"`, `review-doc` phase 2 → `"opus"`, `implement` → `"opus"`, `review-code` → `"opus"`. **Operational invariant:** orchestrate emits `model="opus"` for implement entries; if `/implement` is ever dispatched with a non-opus `--model` override, the emitted `model` value MUST reflect the effective model used (not a hardcoded default). |
| `total_time_s` | float | Wall-clock seconds from dispatch start to dispatch return. **Precision: 3 decimal places (millisecond resolution).** Formatted with `printf '%.3f'`. |

### Round semantics

| Action | Round value |
|---|---|
| `review-doc` phase 1 | `1` |
| `review-doc` phase 2 | `2` |
| `implement` | `1` |
| `review-code` iter N | `N` (1 through 4) |

---

## Entries per spec run

**Retry rule (load-bearing):** Every dispatch that RETURNS CLEANLY emits exactly one entry. Crashed or hung dispatches emit zero. Therefore a validator-triggered retry of a cleanly-returned-but-rejected dispatch produces 2 entries (one for the rejected attempt, one for the successful retry); a crash-triggered retry produces 1 entry (only for the successful retry). If stage ii validators trigger a Q3 retry-once after a clean-return validator failure, that is a second `implement` dispatch and produces a second `implement` entry. The `round` field is **NOT** incremented on retry (implement always logs `round=1`); retries are distinguished by `ts` and, if correlation is needed, by external state. Phase-1 and phase-2 review-doc dispatches likewise each emit one entry per cleanly-returned attempt.

| Stage | Entries (no retry) | Entries (if retried) |
|---|---|---|
| i — spec review | 2 (phase 1 + phase 2) | 2 per successful attempt; +1 per retried phase |
| ii — implement | 1 | 2 if Q3 retry-once fires on a validator-rejected clean return; 1 if Q3 retry-once fires after a crash (only the successful retry logs) |
| iii — code review | 1 to 4 (one per iter; early-exit if 0 criticals) | same entry count as no-retry under normal completion; a crash-retry of any iter adds +1 entry for that iter's successful retry |
| iv — verification gate | 0 (no-op in current release) | 0 |

**Total (no retries): 4–7 entries per spec run.** With one stage-ii validator-rejected retry: 5–8. With one stage-ii crash retry: 4–7 (only the successful retry logs).

---

## Write protocol

All commands below are executed by orchestrate via the **Bash tool** (no other tool may be substituted). Commands are chained with `&&` on a single Bash invocation so that any failure short-circuits and is swallowed by the outer policy (step 6).

**Shell state across Bash tool calls.** Bash tool invocations do not share shell state between calls. Orchestrate holds `start_ts`, the dispatch metadata (`spec_basename`, `action`, `round`, `model`), and `LOG`/`LOG_DIR` in agent memory between Bash calls, and emits a SINGLE self-contained Bash command for the final append (step 5) with all values substituted as literals — no variable references to prior-call state. The bash snippets in steps 1, 3, and 4 below are illustrative shell-command templates; the `$start_ts`, `$end_ts`, `$ts`, `$total_time_s`, `$spec_basename`, `$action`, `$round`, `$model`, and `$LOG` tokens are placeholders for orchestrate-held values, not live shell variables carried across invocations. In practice: (a) orchestrate calls Bash to compute `start_ts`, parses stdout, stores it in agent memory; (b) dispatches the sub-agent via the Task/Agent mechanism; (c) on return, calls Bash to compute `end_ts`, `ts`, `total_time_s`, and emits the `printf` append — all in ONE Bash invocation with every prior-call value substituted as a literal.

### One-time setup

Runs once at the start of the auto run, before stage i:

```bash
LOG_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/ai-dev-tools"
LOG="$LOG_DIR/ai-dev-tools.log"
mkdir -p "$LOG_DIR" 2>/dev/null || echo "[auto] warning: could not create $LOG_DIR (profiling log disabled)" >&2
```

Rationale: `mkdir -p` runs once per auto run instead of once per dispatch. A failure prints a single stderr breadcrumb (non-blocking) so the user can diagnose an empty log.

### Per-dispatch

Runs around every sub-agent dispatch:

1. Capture start time:
   ```bash
   start_ts=$(date +%s.%N)
   ```
2. Dispatch the sub-agent via the existing Task/Agent mechanism; await return.
3. Compute `total_time_s` (float, 3 decimals, millisecond precision):
   ```bash
   end_ts=$(date +%s.%N)
   total_time_s=$(awk "BEGIN {printf \"%.3f\", $end_ts - $start_ts}")
   ```
4. Capture the dispatch end timestamp in ISO-8601 UTC:
   ```bash
   ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
   ```
5. Append exactly one JSONL line using `printf` (single `write(2)` on glibc for lines < PIPE_BUF; see Concurrency safety):
   ```bash
   spec_basename=$(basename "$spec_path")
   printf '{"schema_version":1,"ts":"%s","spec":"%s","action":"%s","round":%d,"model":"%s","total_time_s":%s}\n' \
     "$ts" "$spec_basename" "$action" "$round" "$model" "$total_time_s" \
     >> "$LOG" 2>/dev/null || true
   ```
   **Required tool:** `printf`. The Bash builtin `printf` (default when the Bash tool invokes `bash`) is required — do NOT use `command printf` or `/usr/bin/printf` (these exec a separate binary with its own stdio buffering and can split the line across multiple `write(2)` calls). Any alternative implementation (Python, Node, jq) MUST guarantee exactly one `write(2)` syscall per entry — buffered-I/O wrappers that split a line into multiple writes will break the concurrency-safety guarantee (see Concurrency safety). Do NOT use `echo` (non-portable escape handling) and do NOT construct the JSON with a heredoc (multiple writes).
6. **Failure policy:** The trailing `|| true` in step 5 swallows any append failure (disk full, permission denied, log file deleted and dir unwritable, etc.). Profiling I/O must never block or fail the pipeline.

### Worked example

For a phase-1 review-doc dispatch on spec `foo.md` that ran 42.123 seconds and ended at `2026-04-18T10:00:00Z`, the full append command issued is:

```bash
printf '{"schema_version":1,"ts":"%s","spec":"%s","action":"%s","round":%d,"model":"%s","total_time_s":%s}\n' \
  "2026-04-18T10:00:00Z" "foo.md" "review-doc" 1 "sonnet" "42.123" \
  >> "$LOG" 2>/dev/null || true
```

The `spec_basename` is JSON-safe because spec filenames in this project are constrained to `[A-Za-z0-9._-]` by upstream validation (pre-pipeline validation — `pipeline-overview.md` Pre-pipeline Validation section, step 1 sub-points (a) and (c) — requires an existing regular file ending in `.md` or `.markdown`). **Defensive invariant:** if that constraint is ever relaxed (e.g., spaces, quotes, or backslashes allowed in basenames), the writer MUST JSON-escape `spec_basename` before substitution into the `printf` format string; otherwise a single unescaped `"` or `\` in the basename will emit a syntactically invalid JSONL line. A regression test SHOULD fail loudly if any incoming basename contains a byte outside `[A-Za-z0-9._-]`.

---

## Concurrency safety

Single-line appends smaller than `PIPE_BUF` (4 KiB on Linux) are atomic under POSIX when opened with `O_APPEND` **AND** when the entry is written by exactly one `write(2)` syscall. Each JSONL entry is well under the 4 KiB limit, and the mandated `printf` in step 5 issues a single `write(2)` for short strings on glibc; concurrent `/orchestrate --auto` invocations therefore cannot interleave bytes. Entries from different runs may appear in any order; they are self-identifying via the `spec` and `ts` fields.

**Warning — buffered I/O breaks atomicity.** The atomicity guarantee is destroyed by any wrapper that splits a single logical line into multiple `write(2)` calls. Explicitly:

- Do NOT re-implement the writer in Python/Node/Ruby without setting the stream to unbuffered + line-complete semantics (e.g., Python's default `print()` flushes on newline only when stdout is a terminal; when redirected it block-buffers).
- Do NOT assemble the JSON via a multi-line heredoc — shells typically issue one write per line.
- Do NOT use `echo -e` or other escape-interpreting echo variants — portability issues aside, some implementations still buffer.
- If a non-`printf` writer is unavoidable, it MUST explicitly guarantee one `write(2)` per entry (e.g., Python: `os.write(fd, line.encode())` on a single pre-joined line).

---

## Failure & edge cases

| Case | Behavior |
|---|---|
| Sub-agent crashes before return | No entry written for that phase. Crash handled by existing Q3 failure-handling flow. |
| Sub-agent succeeds on retry (Q3 retry-once) | Depends on how the first attempt ended. Crash/hang first attempt: 0 entries for the crashed dispatch, 1 entry for the successful retry (net: 1). Clean-return-but-validator-rejected first attempt: 1 entry for the rejected dispatch, 1 entry for the successful retry (net: 2). See the Retry rule above. |
| Sub-agent hangs (orchestrate aborts) | No entry written. Wall time is only recorded on clean return. |
| Log dir creation fails (one-time setup) | Single stderr warning; per-dispatch append runs anyway, fails silently per step 6. |
| Log file deleted mid-run | Next append recreates it (`>>` behavior). |
| Disk full | Append fails; swallowed per step 6; pipeline continues. |

---

## Non-goals

- **Token capture.** Claude Code's Agent/Task dispatch does not surface token usage to the parent agent. Not included in the schema. Can be added later (as a new field + `schema_version` bump) if the harness exposes usage metadata.
- **Standard-mode logging.** This log is auto-mode-only. Standard mode remains unchanged.
- **Log rotation.** Append-only with no size/age cap. User can truncate manually. If growth becomes a problem, rotation is a follow-up.
- **Per-iteration granularity inside `/review-doc`.** Each review-doc dispatch internally iterates up to 2 times (reviewer + fixer + fact-checker loop). The profiling log emits exactly ONE entry per dispatch — one for phase 1 and one for phase 2 — NOT one per internal iteration.
