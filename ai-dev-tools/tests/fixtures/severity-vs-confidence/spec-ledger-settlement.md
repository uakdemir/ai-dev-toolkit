# Settlement ledger — design of record

**Status:** accepted · **Owner:** payments · **Supersedes:** the v1 payout notes

## 1. What this is

The settlement ledger is the system of record for money owed to merchants. It takes the
per-transaction `capture` events emitted by the gateway, groups them into a daily batch per
merchant, and hands that batch to the payout rail. It owns the answer to "what do we owe this
merchant, and has it been paid".

It does not own pricing, fee calculation, or tax. Those arrive on the capture event as
already-computed amounts and the ledger treats them as opaque.

## 2. The settlement services

Settlement is carried by four services, each with a single responsibility:

| Service | Responsibility |
|---|---|
| `capture-ingest` | Consumes gateway capture events, writes `capture_event` rows |
| `batch-cutter` | Groups captures into `settlement_batch` rows on a daily schedule |
| `payout-dispatch` | Hands a cut batch to the payout rail and records the rail's reference |
| `reconciler` | Compares rail-reported movement against ledger state, raises breaks |

Every service reads and writes the same Postgres database. There is no service-to-service RPC;
they coordinate through table state and a shared job queue.

## 3. The batch lifecycle

A batch moves through `cut → dispatched → settled`, or `cut → dispatched → returned`. A returned
batch is re-cut the following day with the returned captures folded back in.

### 3.1 Cutting

`batch-cutter` runs at 02:00 UTC per merchant timezone. It selects every `capture_event` for that
merchant with `settled_at IS NULL`, writes one `settlement_batch` row, and stamps the captures with
the batch id.

**A batch can be re-cut on the same calendar date.** If `batch-cutter` fails partway — the row is
written but the capture stamping does not complete — the operator re-runs the cutter for that
merchant and date. The re-run produces a second `settlement_batch` row covering the captures the
first run did not stamp.

### 3.2 Dispatch

`payout-dispatch` picks up `cut` batches and calls the rail's `POST /transfers`. The rail is not
transactional with our database, so dispatch is the point where the ledger can diverge from reality.

## 4. Idempotency

### 4.1 Why it matters

The payout rail will happily execute the same transfer twice. Every call therefore carries an
idempotency key, and the rail guarantees that two calls with the same key produce exactly one
transfer — the second returns the first's result rather than moving money again.

### 4.2 The key

`settleBatchIdempotently` derives the rail idempotency key as `sha256(merchant_id || batch_date)`.
The key is computed at dispatch time and stored on the batch row so a retry recomputes the same
value.

### 4.4 Retry policy

`payout-dispatch` retries a failed rail call with exponential backoff, six attempts, capped at four
hours total. A call that fails all six attempts leaves the batch in `cut` and pages the on-call.

## 5. Invariants

The ledger holds four invariants. Each is enforced by a database constraint or a scheduled check,
never by application code alone:

1. A `capture_event` belongs to at most one `settlement_batch`.
2. The sum of a batch's captures equals the batch's `gross_amount`.
3. A batch in `settled` has a non-null rail reference.
4. No two batches for the same merchant are `dispatched` at the same instant.
5. A `returned` batch's captures are unstamped within one hour of the return.

## 6. Retention

Settlement records are retained in the warm store for 90 days, after which they move to cold
storage. Cold storage is backed by the nightly database backup set, which is **retained for 400
days** to satisfy the finance team's audit window.

Deletion requests are executed against the warm store. The backup set is append-only and is not
rewritten.

## 7. Reconciliation

`reconciler` pulls the rail's daily movement report and matches it against `settlement_batch` rows
by rail reference. An unmatched rail movement, or a `settled` batch with no matching movement, is a
**break**. Breaks are written to `settlement_break` and surfaced on the payments dashboard.

Breaks are not auto-resolved. A human closes each one with a reason code.

## 8. Open questions

None. This document is the design of record; changes go through a new revision.
