# Step 7: Complete

**Trigger:** Review clean (zero critical/high) or user accepts remaining.

---

## Phase 1 (Pre-confirmation)

Present:
```
── Step 7: Complete ──────────────────────────────
Feature: <feature-name>
Status: <Approved | Approved with suggestions>

Ready to finalize?
```

## Phase 2 (Post-confirmation)

1. Update hint to `finalized`.
2. If `--use-roadmap` was active: load `references/standard/refactor-roadmap-check.md` for roadmap marking logic.

## Breadcrumb

```
/commit
/orchestrate
```

`/orchestrate` starts the next cycle — Step 1 detection invokes brainstorming internally.

## Roadmap Integration (only when `--use-roadmap` was passed)

Mark completed unit `[x]`. Print: "Unit `<completed>` done. Next: `<next-unit>`." Suggest brainstorming for next unit. If confirmed, write hint and invoke originating refactor skill with `--next-unit`.
