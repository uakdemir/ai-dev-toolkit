# Plan — migrate `settlement_batch` to the v2 shape

Executes the shape change described in the settlement ledger design of record. One migration, one
backfill, one cutover. Written to be run by an agent with no prior context on the ledger.

## Preconditions

- `spec-ledger-settlement.md` is the accepted design; this plan does not revisit its decisions.
- The batch cutter is paused for the duration (`batch-cutter` scaled to zero replicas).
- A verified backup of the `settlement` schema exists and its restore has been exercised this week.

## Steps

### Step 1 — create `settlement_batch_v2`

Create the new table alongside the old one. Columns are the v1 set plus `source_ref TEXT NOT NULL`
and `rail_reference TEXT`, minus the two columns step 3 retires.

`source_ref` is `NOT NULL` from the start; nothing writes to the table yet, so the constraint costs
nothing and cannot be forgotten later.

### Step 2 — dual-write from `payout-dispatch`

Ship `payout-dispatch` writing both tables in one transaction. The v2 write derives `source_ref`
from the in-memory batch, not from the v1 row, so it does not depend on the backfill having run.

Leave this running for one full settlement cycle (24h) before proceeding, so that a rollback at any
later step has a populated v2 table for the current day.

### Step 3 — drop the retired v1 columns

Run:

```sql
ALTER TABLE settlement_batch DROP COLUMN legacy_ref;
ALTER TABLE settlement_batch DROP COLUMN cutter_version;
```

These two columns are unread by the v2 code path and carry no constraints. Dropping them here keeps
the v1 table narrow for the copy in step 5.

### Step 4 — verify the dual-write

Assert that every `settlement_batch` row created in the last 24h has a matching
`settlement_batch_v2` row with an equal `gross_amount`. A mismatch stops the plan.

### Step 5 — backfill the historical rows

Copy every pre-cutover `settlement_batch` row into `settlement_batch_v2`:

```sql
INSERT INTO settlement_batch_v2 (id, merchant_id, batch_date, gross_amount, source_ref, rail_reference)
SELECT id, merchant_id, batch_date, gross_amount, legacy_ref, rail_reference
  FROM settlement_batch
 WHERE created_at < :cutover_at;
```

Run in batches of 10,000 ordered by `id` so the transaction stays short.

### Step 6 — cut reads over

Point `reconciler` and the payments dashboard at `settlement_batch_v2`. Keep `payout-dispatch`
dual-writing for one more cycle.

### Step 7 — retire the v1 table

Rename `settlement_batch` to `settlement_batch_retired` and stop the dual write. Drop the retired
table after 30 days.

## Worker placement

The backfill runs from a one-off job, not from the reconciliation worker. The reconciliation worker
should probably reuse the existing `payouts` queue rather than getting its own, since the volumes
are small and an extra queue is another thing to watch.

## Verification

- `SELECT count(*)` matches between v1 (pre-cutover slice) and v2 after step 5.
- The reconciler produces zero new breaks in the cycle following step 6.
- `payout-dispatch` error rate is flat across the cutover.

## Rollback

Before step 6, rollback is "stop the dual write and keep using v1". After step 6, rollback is
"point reads back at v1" — safe only while the dual write is still running, which is why step 7 is
gated on a full cycle.
