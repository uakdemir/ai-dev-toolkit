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
- `purpose` (required): One of: `architecture`, `api`, `data-model`, `guide`, `troubleshooting`. Determines which template was used.
- `ai_keywords` (required): 3-8 terms for fast AI discovery. Should include key technologies, concepts, and domain terms.
- `dependencies` (optional): Other modules/areas this doc's subject depends on.
- `last_verified` (required): ISO date when this doc was last verified against the code it describes.
- `code_paths` (required): File paths or directories this doc covers. Entries are literal paths. Directories (trailing `/`) match all files recursively within. Glob patterns are not supported. Used by UPDATE mode to find affected docs.

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
