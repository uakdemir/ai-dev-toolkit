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

## Field Definitions

- `scope` (required): Module or area name. Must match a module name used consistently across docs.
- `purpose` (required): One of: `architecture`, `api`, `data-model`, `guide`, `troubleshooting`, `adr`. Determines which template was used.
- `ai_keywords` (required): 3-8 terms for fast AI discovery. Should include key technologies, concepts, and domain terms.
- `dependencies` (optional): Other modules/areas this doc's subject depends on.
- `last_verified` (required): ISO date when this doc was last verified against the code it describes.
- `code_paths` (required): File paths or directories this doc covers. Entries are literal paths. Directories (trailing `/`) match all files recursively within. Glob patterns are not supported. Used by UPDATE mode to find affected docs.
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
purpose: reference       # invalid — not in the 5 allowed values
ai_keywords: [Stripe]    # invalid — fewer than 3 terms
last_verified: 2026-03-25
---
```

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
