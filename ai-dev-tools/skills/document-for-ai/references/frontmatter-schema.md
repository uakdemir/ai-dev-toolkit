# Frontmatter Schema

## Example

```yaml
---
scope: auth
purpose: architecture
ai_keywords: [JWT, session, OAuth, middleware]
dependencies: [shared, database]
last_verified: 2026-03-25
code_paths: [src/auth/, src/middleware/auth.ts]
---
```

## Extended Example (with volatility fields)

```yaml
---
scope: calibration
subsystem: conversation/llm
purpose: architecture
depth: L1
volatility: high
volatility_measured: 2026-04-08
churn_rate: 0.47
code_paths:
  - packages/calibration/src/server/conversation/llm/
ai_keywords: [LLM, conversation, prompt, completion]
last_verified: 2026-04-08
last_verified_symbol_count: 42
symbol_scope: all
regenerate_if:
  - code_paths_commits_since_last_verified > 10
  - symbol_count_diff > 0.15
  - volatility_class_changed
---
```

## Field Definitions

- `scope` (required): Module or area name. Must match a module name used consistently across docs.
- `purpose` (required): One of: `architecture`, `api`, `data-model`, `guide`, `troubleshooting`, `adr`. Determines which template was used.
- `ai_keywords` (required): 3-8 terms for fast AI discovery. Should include key technologies, concepts, and domain terms.
- `dependencies` (optional): Other modules/areas this doc's subject depends on.
- `last_verified` (required): ISO date when this doc was last verified against the code it describes.
- `code_paths` (required): File paths or directories this doc covers. Entries are literal paths. Directories (trailing `/`) match all files recursively within. Glob patterns are not supported. Used by UPDATE mode to find affected docs.
- `subsystem` (required when depth is set): Subsystem path from the package root. Identifies which subsystem this doc covers within the package scope.
- `depth` (optional): `L1` or `L2`. Documentation depth level assigned by the volatility assessment algorithm. See `references/volatility-assessment.md`. L1 = structural index (symbols, signatures), L2 = architecture (data flow, decisions). L3 is never auto-generated.
- `volatility` (optional): `high`, `medium`, `low`, `unknown`, or `user-override`. Derived from `churn_rate`, or set to `user-override` when the depth came from the `--depth` flag (classification was skipped). See `references/volatility-assessment.md` for the mapping.
- `volatility_measured` (optional): ISO date when volatility was last measured.
- `churn_rate` (optional): Raw `commits_90d / total_commits_ever` ratio. `null` for zero-history or thin-history subsystems, and `null` when depth came from the `--depth` flag (no measurement was performed). Stored for audit trail.
- `last_verified_symbol_count` (optional): Total top-level symbol count at `last_verified` time, subject to `symbol_scope` (all top-level symbols by default; exports-only when `symbol_scope: exports-only`). Used to compute `symbol_count_diff` for staleness detection. Formula: `symbol_count_diff = |current_symbol_count - last_verified_symbol_count| / last_verified_symbol_count`. The runtime computes `current_symbol_count` via Phase 1 extraction at audit time using the same `symbol_scope` the doc recorded.
- `symbol_scope` (optional): `all` or `exports-only`. Records which L1 symbol-scope mode was used during generation. Default is `all` (all top-level symbols, exported + internal). Set to `exports-only` when generation is invoked with `--exports-only` or with `--tier interface`. Freshly generated docs always populate this field. Docs generated before this field was introduced lack it entirely; AUDIT infers `exports-only` for those legacy docs (matching the pre-change default) and recommends regeneration.
- `tier` (optional): `internal` or `interface`. Records which tier this doc serves. Default is `internal` — doc lives at `<package-root>/docs/ai/<subsystem>.md` and indexes the full subsystem. `interface` — doc lives at `<repo-root>/docs/ai/<pkg>/<subsystem>.md` and indexes only the subsystem's root barrel (public API surface) for monorepo-root consumers. Set to `interface` when generation is invoked with `--tier interface`. When absent, consumers (AUDIT, UPDATE) should infer `tier: internal` for backward compatibility.
- `partial` (optional): Boolean. Set to `true` when this doc covers only a portion of a subsystem due to Phase 1 token cap overflow. Partial docs include a cross-reference note pointing to sibling parts. See SKILL.md Phase 1 token cap section.
- `regenerate_if` (optional): List of machine-readable staleness signals. Hints for audit mode and the runtime trust-but-verify rule. Not enforced by the skill itself. Common signals: `code_paths_commits_since_last_verified > 10`, `symbol_count_diff > 0.15`, `volatility_class_changed`.
- `status` (required when `purpose: adr`, not applicable to other doc types): One of: `Proposed`, `Accepted`, `Superseded`, `Deprecated`. **This is the single authoritative source for ADR status.** The body's Status line and the index table's Status column are display copies derived from this field. When status changes, update frontmatter first; body and index are updated to match.
- `spec_source` (required when `purpose: adr`, not applicable to other doc types): Path to the spec this ADR was extracted from. Enables UPDATE mode to detect when a spec changes and re-check the ADR. Example: `docs/superpowers/specs/2026-03-28-feature-design.md`.

## Detection Signal

The combination of `scope` + `purpose` fields is the detection signal for AI-optimized docs. Generic YAML frontmatter (from Hugo, Docusaurus, Notion exports, etc.) does not qualify.

## Valid Example

```yaml
---
scope: payments
purpose: api
ai_keywords: [Stripe, webhook, idempotency, refund, charge]
dependencies: [auth, database]
last_verified: 2026-03-25
code_paths: [src/payments/, src/webhooks/stripe.ts]
---
```

## Invalid Examples

Missing `scope` (not AI-optimized), wrong `purpose` value, or too few `ai_keywords`:
```yaml
---
title: Payments API      # missing scope — not AI-optimized
purpose: reference       # invalid — not in the 6 allowed values
ai_keywords: [Stripe]    # invalid — fewer than 3 terms
last_verified: 2026-03-25
---
```

## Interface-tier Example

```yaml
---
scope: admin
subsystem: server
purpose: api
tier: interface
depth: L1
symbol_scope: exports-only
code_paths:
  - packages/admin/src/server/index.ts
ai_keywords: [admin, server, barrel, public-api]
last_verified: 2026-04-24
last_verified_symbol_count: 8
regenerate_if:
  - barrel_export_added_removed_or_renamed
  - reexported_symbol_signature_changed
---
```

Interface-tier docs live at `<repo-root>/docs/ai/<pkg>/<subsystem>.md` and index only the subsystem's root barrel. `code_paths` contains a single entry — the barrel file. Narrative is limited to a one-paragraph summary, an Exports table, an optional Consumers section, and Regeneration triggers.

## ADR Example

```yaml
---
scope: auth
purpose: adr
status: Accepted
ai_keywords: [Redis, sessions, encryption, auth]
last_verified: 2026-03-28
code_paths: [src/auth/, src/middleware/]
spec_source: docs/superpowers/specs/2026-03-28-auth-design.md
---
```

**ADR validation:** AUDIT mode treats `status` and `spec_source` as required when `purpose: adr` and ignores them for all other purpose values. Presence of these fields on a non-ADR doc is not an error.
