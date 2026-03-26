# Analysis Framework Reference

Extracted from spec Sections 4.2, 4.6, 4.7. Use this framework to drive the four analysis
phases before generating any migration artifacts.

---

## Phase 1: Domain Analysis

**Goal:** Identify logical domain boundaries from the existing codebase structure.

### What to Scan

- **Routes / pages / features:** Route prefixes (`/auth/`, `/billing/`) or page
  directories reveal user-facing domains.
- **Folder structure:** Top-level `src/` subdirectories often encode implicit domains.
- **Naming patterns:** Files matching `auth*`, `billing*`, `order*`, `catalog*`,
  `user*`, `notification*`, etc. are domain indicators.
- **Test directories:** `__tests__/auth/`, `spec/billing/`, etc. often mirror domain
  structure even when source folders are flat.

### Output

1. **Domain list** — candidate domain names with a one-line rationale each.
2. **Draft file-to-domain mapping** — every source file assigned to exactly one of:
   - A named domain (`auth`, `billing`, …)
   - `shared/` — utilities used by 3+ domains with no clear owner
   - `unassigned` — files that do not fit the current domain list

### User Checkpoint

> "I found these domain boundaries: [list]. Does this match your mental model? Are there
> domains I missed or boundaries that should be drawn differently?"

Do not proceed to Phase 2 until the user confirms or corrects the domain list.

---

## Phase 2: Data Ownership Analysis

**Goal:** Determine which domain owns each database table or model.

### Steps

1. For each domain, trace all database interactions: ORM model definitions, direct SQL
   queries, and migration files referencing specific tables.

2. Build a **table ownership matrix**:

   | Table | Domain(s) that write | Domain(s) that read | Verdict |
   |---|---|---|---|
   | `users` | `auth` | `billing`, `notifications` | `auth` owns; others read |
   | `orders` | `billing`, `fulfillment` | `reporting` | contested |
   | `audit_log` | (none found) | (none found) | orphaned |

3. **Flag contested tables** — written by more than one domain. Require a resolution
   pattern from `migration-patterns.md` before extraction proceeds.

4. **Flag orphaned tables** — no clear reader or writer. May be dead code or belong to
   an unassigned domain.

---

## Phase 3: Dependency Graph Analysis

**Goal:** Quantify coupling between domains by counting cross-module imports.

### Static Analysis Approach by Stack

**Node.js / TypeScript**
- Scan `import` and `require()` in `.ts`, `.tsx`, `.js`, `.jsx` files.
- Resolve paths via `tsconfig.json` path aliases and `package.json` `exports`.
- Barrel file (`index.ts`) re-exports count as a single import at the barrel.

**.NET (C#)**
- **Primary signal:** `<ProjectReference>` in `.csproj` files — authoritative and
  reliable, always prefer over secondary signals.
- **Secondary signal:** `using` directives matched by namespace convention.
- **Ignore:** `System.*`, `Microsoft.*`, and NuGet namespaces.

**Python**
- Scan `import` and `from...import` in `.py` files.
- Resolve against project package structure; exclude virtual environment packages.

### Counting Rule

One import statement = one import, regardless of how many symbols it imports.
Barrel file re-exports count as a single import at the barrel boundary.

---

## Coupling Score

**Formula:**

```
coupling_score = total_cross_module_imports / (internal_imports + total_cross_module_imports) * 100
```

**Definitions:**
- `total_cross_module_imports` — imports from module A to any other named module
  (excluding `shared/`).
- `internal_imports` — imports within module A itself.
- `shared/` imports excluded from both counts.

**Thresholds:**

| Score | Status | Meaning |
|---|---|---|
| 0–20% | Green (low) | Self-contained; extraction is straightforward |
| 21–50% | Yellow (moderate) | Some cross-cutting; review dependency matrix first |
| 51%+ | Red (high) | Highly coupled; likely needs interface design |

**Edge case:** Zero total imports = 0%.

**Per-pair breakdown:** Produce a dependency matrix with import count for each ordered
pair (A → B) to reveal directional coupling and identify high-score drivers.

---

## Phase 4: Synthesis and Conflict Resolution

**Goal:** Overlay all three views and produce a unified, conflict-free picture before
generating migration artifacts.

### Overlay Logic

- **All three agree** — high confidence; mark boundary as confirmed.
- **Two agree, one disagrees** — flag for review; note which phase diverges.
- **No consensus** — flag as contested boundary; do not generate artifacts until resolved.

### Conflict Taxonomy

| Conflict Type | Example | Resolution |
|---|---|---|
| Domain scope mismatch | Phase 1 groups `auth` + `users`; Phase 2 shows separate table ownership | Split or merge — decide before proceeding |
| Contested table with agreed domain | Phase 2 flags `orders`; Phase 3 shows heavy cross-domain imports | Refer to `migration-patterns.md` |
| High coupling contradicts folder split | Folders suggest two domains; coupling score is 65% | Reconsider boundary; may be one module |
| Orphaned files after mapping | `unassigned` files are heavily imported per Phase 3 | Re-examine domain list; often reveals a missing domain |

For contested tables, apply a resolution pattern from `migration-patterns.md` before
marking the conflict resolved.

### User Checkpoint

> "Here is the full analysis: [domain list with coupling scores, contested tables,
> conflict flags]. Please review before I generate the module specs and migration plan."

Do not generate migration artifacts until the user has reviewed and approved the
synthesis output.
