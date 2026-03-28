# Doc Templates

Six purpose-specific templates are available. Each template defines the section structure for a doc with that `purpose` value. The `purpose` frontmatter field must match one of the six template names exactly (except for the special-case `adr` template, which is never auto-detected from code analysis). Use the section descriptions below to know what content belongs in each section when generating or migrating a doc.

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
