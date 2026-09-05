# Settlement — strategy overview

The one-page view of where settlement is going, for people who will not read the design of record.
Detail lives in `spec-ledger-settlement.md`; the migration sequence lives in
`plan-ledger-migration.md`.

## Where we are

Settlement today is the three settlement services described in the design of record, all reading one
Postgres database and coordinating through table state. It works, it is understood, and its failure
modes are known. Nothing in this document proposes replacing it.

The pressure is not volume. It is **auditability**: finance cannot currently answer "why was this
merchant paid this amount on this day" without a human reading rows. Every item below serves that
one goal.

## Where we are going

### 1. A batch is explainable from its own row

Today the reasoning behind a batch — which captures, which returns folded back in, which re-cut —
is reconstructed by joining four tables. The v2 shape carries `source_ref` so a batch points at what
produced it. That is the whole point of the migration plan.

### 2. Breaks get a lifecycle, not just a row

`settlement_break` records that a break happened and who closed it. It does not record what was
tried. We want the investigation attached to the break, so the next person hits a history instead of
a blank.

This needs no schema change beyond an append-only `settlement_break_note` table.

### 3. Merchant-facing settlement statements

Once a batch is explainable internally, the same explanation can be rendered for the merchant. This
is the commercial reason the work is funded, and it is deliberately last: a statement built on
unexplainable batches would be worse than no statement.

## What we are not doing

- **Not** splitting settlement into more services. Four responsibilities in one database is the
  right size for this team.
- **Not** moving off the current payout rail. Rail migration is a separate programme with its own
  risk profile.
- **Not** real-time settlement. Daily batching is what merchants reconcile against.

## Data handling commitments

We make two commitments to merchants, both of which appear in the merchant agreement:

1. **Access.** A merchant can export their full settlement history at any time.
2. **Deletion.** A merchant who closes their account has all settlement records purged within 30
   days of closure.

The deletion commitment is the one with teeth: it is quoted in the agreement, it is the answer we
give to regulators, and it is the commitment finance points at when asked about data minimisation.

## Sequencing

| Quarter | Work |
|---|---|
| Now | The v2 migration (`plan-ledger-migration.md`) |
| Next | Break lifecycle |
| After | Merchant statements |

Nothing later than "After" is planned. The team revisits this page each quarter.
