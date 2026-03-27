# Migration Patterns Reference

Extracted from spec Section 4.7. Use this as a decision aid during module extraction.

---

## Contested Table Patterns

When multiple domains share a database table, use this table to choose a resolution strategy.

| Pattern | When to Use | Example |
|---|---|---|
| Single owner + API contract | One domain writes, others read. Clear primary owner. | `users` table owned by `auth`; billing reads via `auth.getUserSubscriptionStatus()` |
| Split table with sync | Both domains write different columns. No clear owner. | Split `orders` into `billing_orders` + `fulfillment_orders`, sync via events |
| Shared table with column ownership | Table is genuinely shared but columns map to domains. | `products` table: `billing` owns `price`/`tax_rate`, `catalog` owns `name`/`description` |
| Promote to shared service | 3+ domains need read/write access. Core entity. | `users` table becomes a shared service with well-defined API |

**Default recommendation:** When in doubt, prefer "single owner + API contract" — simplest, most reversible.

---

## Circular Dependency Patterns

Circular imports between modules block clean extraction. Use this table to resolve them.

| Pattern | Resolution |
|---|---|
| A imports B, B imports A | Extract shared interface to `shared/`, both depend on `shared` |
| A→B→C→A cycle | Identify weakest link (fewest imports), break with event or callback |
| Tight mutual coupling | Modules may actually be one module — consider merging |

---

## Common Pitfalls

### 1. Big-Bang Migration

Moving everything at once creates a long-running branch that diverges from main, breaks
tests across the board, and makes rollback nearly impossible.

**Do instead:** Extract one module at a time. Each phase should produce a green CI state
before moving to the next.

### 2. Shared State Without Contracts

Modules that reach directly into another module's database bypass domain boundaries. This
re-creates the coupling you are trying to remove.

**Do instead:** All cross-module data access must go through an explicit API (function call,
event, or HTTP endpoint). No direct DB reads from a table owned by another module.

### 3. Breaking CI During Extraction

Leaving the codebase in a broken state mid-extraction blocks other contributors and hides
regressions.

**Do instead:** Maintain a green intermediate state at every commit. Use adapter shims or
re-exports to keep old import paths valid while the new structure is being wired up.

### 4. Skipping Dependency Audits Before Moving Files

Moving a file without knowing its full import graph causes unexpected breakage in unrelated
modules.

**Do instead:** Run a dependency audit (`madge --circular`, `depcruise`, or similar) before
starting each extraction phase. Map all consumers of the module being moved.

---

## Rollback Strategy

Each extraction phase must be independently reversible.

- **Phase isolation:** Complete and commit one phase fully before starting the next.
- **Shim layer:** Keep backward-compatible re-exports in the original location until the
  phase is confirmed stable in production.
- **Feature flags:** Gate new module boundaries behind a flag where runtime risk is high.
- **Independent rollback:** If Phase 2 fails, Phase 1's module should still work. Never
  create a dependency from Phase 1 artifacts on Phase 2 artifacts that have not yet been
  merged and verified.

---

## Quick-Reference Checklist

Before closing a migration phase:

- [ ] All contested tables resolved with one of the four patterns above
- [ ] No circular imports remain in the extracted module
- [ ] CI is green at this commit
- [ ] Rollback path documented and tested in staging
- [ ] Cross-module access goes through APIs, not direct DB queries
