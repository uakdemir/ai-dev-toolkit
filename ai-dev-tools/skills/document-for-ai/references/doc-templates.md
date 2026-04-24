# Doc Templates

Six purpose-specific templates, two depth-specific variants (L1, L2), and one tier-specific variant (Interface) are available. The six purpose templates define section structure for docs with a matching `purpose` frontmatter field. The L1 and L2 variants define section structure based on the `depth` frontmatter field — they are used by the GENERATE mode's two-phase scan architecture when `depth` is set via the volatility assessment. The Interface variant replaces the L1/L2 section set when `tier: interface` is set.

---

## L1 Template (depth: L1 — Structural Index)

Use when `depth: L1` is assigned by the volatility assessment. L1 docs are structural indexes — symbols, signatures, and relationships. No narrative prose. Best for high-churn subsystems.

Sections (all required — include section heading even if empty):

- **File map**: Table listing every file in the subsystem (excluding test files by default; included when `--include-tests` is set) with its one-line purpose. Columns: `File | Purpose | LoC`. Sorted by directory, then alphabetically.
- **Barrel surface**: All exported symbols from the subsystem's barrel/entry point file (e.g., `index.ts`, `mod.rs`, `__init__.py`). Table with columns: `Symbol | Type | Re-exported from`. If no barrel file exists, state "No barrel file — exports are per-file."
- **Internal dependency graph**: Which files import which within the subsystem. Format as a list: `file.ts → imports from: [a.ts, b.ts]`. Sorted by number of dependencies (most dependent first).
- **Symbol index**: Table of all top-level symbols (exported + internal) with their signatures, visibility, and one-line purposes. Columns: `Symbol | File | Signature | Visibility | Purpose`. Grouped by file, sorted by line number within each file. `Visibility` is `exported` or `internal`. Include parameter types and return types in signatures. When `--exports-only` is passed, the table is filtered to symbols bearing the `export` keyword (Visibility column still present but all rows read `exported`).
- **Cross-cutting patterns**: Patterns that appear across multiple files in the subsystem. Each entry: pattern name, files involved, brief description. Examples: caching patterns, error handling conventions, shared state mutations, enum/union switch-cases. May be empty — include the heading regardless.
- **Open Questions**: Items that Phase 1 or Phase 2 extraction flagged as ambiguous or contradictory. Each entry must include an evidence pointer (`file:line`). See §4.9 in the spec for the entry template.

---

## L2 Template (depth: L2 — Architecture)

Use when `depth: L2` is assigned by the volatility assessment. L2 docs are architecture docs — data flow, decisions, and integration points. Includes all L1 sections plus narrative prose sections. Best for stable subsystems.

Sections (includes all L1 sections plus these additional sections):

- **File map**: Same as L1.
- **Barrel surface**: Same as L1.
- **Internal dependency graph**: Same as L1.
- **Symbol index**: Same as L1.
- **Data flow**: How data moves through the subsystem. Numbered steps or a diagram. Include entry points, transformations, and exit points.
- **Key decisions**: Architectural choices that shaped the design. Include rationale and trade-offs. Cross-reference ADRs where they exist.
- **Integration points**: How this subsystem connects to others. List interfaces, events, or shared data exposed or consumed. Note dependency direction (inbound vs outbound).
- **Cross-cutting patterns**: Same as L1.
- **Open Questions**: Same as L1.

**Token cap:** L2 narrative sections (Data flow, Key decisions, Integration points) are capped at 1,500 tokens per section. Total generated narrative must not exceed 6,000 tokens per doc.

---

## Interface Template (tier: interface — Barrel Surface)

Use when `tier: interface` is set (via `--tier interface`). Interface docs live at `<repo-root>/docs/ai/<pkg>/<subsystem>.md` and index only the subsystem's root barrel, not the full subsystem. Depth is almost always L1; L2-interface is unusual.

The interface template **replaces** the L1/L2 section set — it does NOT extend it. Specifically, the File map, full Symbol index, Internal dependency graph, Cross-cutting patterns, and Open Questions-about-internals sections are omitted. Those belong in the internal tier doc.

Sections (all required unless marked optional — include section heading even if empty):

- **Narrative** (one paragraph, no heading): what this barrel exposes, who the consumers are, and the transport / boundary this interface represents. One paragraph, no headings.
- **Exports**: single table with columns `Symbol | Kind | Source | Purpose`. One row per re-exported symbol.
  - `Symbol`: the exported name as it appears to consumers (post-alias if any).
  - `Kind`: `function` | `class` | `interface` | `type` | `const` | `enum`.
  - `Source`: `file:line` of the definition site. For direct re-exports, cite the original definition file, not the barrel line. For `export * from './foo'` wildcards, resolve the wildcard by enumerating `./foo`'s top-level exports via the structural extractor (Serena preferred) and expand into individual rows — do NOT emit a single "wildcard re-export" row.
  - `Purpose`: one-line purpose from the source's JSDoc/docstring, or inferred from name + signature.
- **Consumers** (optional): which workspace packages import from this barrel, derived from the shared cross-package import graph built during Phase 1. Omit the section entirely when the import graph has not been populated (single-subsystem mode without batch context).
- **Regeneration triggers**: bullet list. For interface tier, the triggers are tighter than internal tier:
  - "A top-level export is added, removed, or renamed in `src/<subsystem>/index.ts`."
  - "A re-exported symbol's source file is renamed or its signature changes."

**Do NOT generate** under the interface template: File map, full Symbol index, Internal dependency graph, Cross-cutting patterns, Open Questions about internals. A reader who needs those should read the internal-tier doc under `<package-root>/docs/ai/`.

---

## Template: architecture

Use when documenting how a module or system is structured internally.

- **Overview**: What the module does and why it exists. One paragraph. State the primary responsibility.
- **Components**: List each major class, service, or sub-module. For each: name, role, and key behaviors.
- **Data Flow**: Describe how data moves through the module. Use numbered steps or a diagram.
- **Key Decisions**: Architectural choices that shaped the design. Include the rationale and trade-offs considered.
- **Constraints**: Hard limits — performance budgets, third-party contracts, platform restrictions, invariants that must hold.
- **Integration Points**: How this module connects to others. List the interfaces, events, or shared data it exposes or consumes. Note the direction of each dependency (inbound vs. outbound).

---

## Template: api

Use when documenting endpoints, exported functions, or inter-service contracts.

- **Overview**: What this API does. Who calls it and why. State the transport and versioning strategy.
- **Endpoints/Exports**: Each endpoint or export function. For each: signature, parameters, return type, side effects.
- **Authentication**: Required credentials or tokens. How they are obtained, passed, and validated.
- **Error Handling**: All error codes or exception types. Meaning of each and expected caller behavior on receipt.
- **Examples**: Concrete request/response or call/return pairs. Cover the happy path and at least one error case. Use realistic values, not placeholder strings.

---

## Template: data-model

Use when documenting database tables, collections, or structured schemas.

- **Overview**: What data this model stores and which feature or domain it belongs to.
- **Tables/Collections**: Each table or collection. For each: field names, types, nullability, and purpose.
- **Relationships**: Foreign keys, references, or join conditions between entities. State cardinality (one-to-one, one-to-many, many-to-many) for each.
- **Indexes**: Indexes defined on the model. For each: fields indexed, index type, and the query pattern it supports.
- **Migrations**: How schema changes are tracked and applied. Note any irreversible migrations, large table operations, or required data backfills.

---

## Template: guide

Use when documenting how to accomplish a task or set up a workflow.

- **Goal**: The outcome the reader will achieve. One sentence.
- **Prerequisites**: What must be true before starting — installed tools, permissions, prior steps completed.
- **Steps**: Numbered, imperative steps. Each step has one action. Include commands verbatim where applicable.
- **Verification**: How to confirm the goal was achieved. Provide a test command, observable output, or UI state that unambiguously signals success.
- **Troubleshooting**: Common failure modes for these specific steps. For each: symptom and corrective action. Link to the `troubleshooting` template doc if one exists for the same module.

---

## Template: troubleshooting

Use when documenting known issues, debugging procedures, or incident runbooks.

- **Symptoms**: Observable signs that the problem is occurring. Be specific — error messages, metrics, user reports.
- **Diagnosis**: Steps to confirm the root cause. Ordered from cheapest to most invasive.
- **Solutions**: Fixes for each confirmed cause. Mark each as temporary workaround or permanent fix. Include rollback steps where relevant.
- **Prevention**: Changes — code, config, monitoring, or process — that would prevent this class of issue from recurring. Reference the ticket or PR if the fix has been shipped.

---

## Template: adr

Use when documenting an architectural decision — a choice with significant reversibility cost or blast radius that future development must respect. ADRs are never auto-detected from code analysis. They are produced either via explicit `/document-for-ai adr {spec_path}` command or automatically by orchestrate Step 4 — both use the same extraction algorithm in `references/adr-extraction.md`.

- **Title**: The decision in imperative or declarative form.
- **Status**: One of: Proposed, Accepted, Superseded, Deprecated.
- **Context**: Why this decision was needed. What forces were in play.
- **Decision**: What was chosen. Be specific — name the technology, pattern, or approach.
- **Alternatives Considered**: What was rejected and why. List each alternative with the reason it was not chosen.
- **Consequences**: Trade-offs accepted. What becomes easier, what becomes harder.

---

## Template Selection Rules

When the correct template is ambiguous, apply these rules in order:

1. If the doc describes callable surface area (functions, endpoints, events) — use `api`.
2. If the doc describes stored data structure — use `data-model`.
3. If the doc describes how to perform a sequence of actions — use `guide`.
4. If the doc lists known failure modes or debugging steps — use `troubleshooting`.
5. Otherwise, default to `architecture`.

A single module may have multiple docs, one per template (e.g., `auth/architecture.md` and `auth/api.md`).

---

## Example Mapping

Use this table during MIGRATE mode to assign a template to existing documentation folders. Match on the folder name or its closest ancestor that appears in the table.

| Folder name / pattern       | Template          |
|-----------------------------|-------------------|
| `architecture/`             | `architecture`    |
| `design/`                   | `architecture`    |
| `system-design/`            | `architecture`    |
| `overview/`                 | `architecture`    |
| `api/`                      | `api`             |
| `endpoints/`                | `api`             |
| `contracts/`                | `api`             |
| `interfaces/`               | `api`             |
| `schema/`                   | `data-model`      |
| `models/`                   | `data-model`      |
| `database/`                 | `data-model`      |
| `data/`                     | `data-model`      |
| `guides/`                   | `guide`           |
| `how-to/`                   | `guide`           |
| `runbooks/`                 | `troubleshooting` |
| `debugging/`                | `troubleshooting` |

For folders not in this table, analyze each file's content to determine the best template fit.
