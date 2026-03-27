# Layer Definitions

Canonical reference for the default layer architecture. Load during discovery to validate detected layers and build the dependency matrix.

---

## Default Layer Sequence

```
Types → Config → Data → Service → Providers (lateral) → API → UI
```

Dependencies flow left-to-right (forward). Each layer may only import from layers listed in its Allowed Dependencies column. Providers is a lateral injection point — any layer can receive a Provider through DI, but no layer directly imports Provider implementations.

---

## Layer Responsibility Table

| Layer | Responsibility | Contains | Allowed Dependencies |
|---|---|---|---|
| Types | Shared type definitions | Interfaces, enums, DTOs, domain models, value objects | None (leaf layer) |
| Config | Environment and feature configuration | Env parsing, feature flags, app settings | Types |
| Data | Data access and persistence | Repositories, ORM models, database clients, migrations | Types, Config |
| Service | Business logic and orchestration | Use cases, domain operations, business rules | Types, Config, Data |
| Providers | Cross-cutting concern interfaces | Auth, logging, telemetry, error handling interfaces | Types (interfaces only) |
| API | Request handling and routing | Route handlers, controllers, GraphQL resolvers, middleware | Types, Config, Service, Providers |
| UI | Presentation layer | Components, pages, views, client-side logic | Types, Config, API, Providers |

---

## Provider Injection Rules

- Provider interfaces live in the Providers layer and depend only on Types.
- Provider implementations live in the layer that owns the concern (e.g., auth implementation in Service or Data) but are registered at the composition root (e.g., `Program.cs`, root Fastify plugin).
- Layers receive providers through constructor injection (or Fastify decoration) — never through direct import of implementations.
- Example: a Service receives `IAuthProvider` and calls methods on it; it does not import the auth implementation.

---

## Dependency Rules for Structural Tests

Forbidden-crossing matrix derived from the Allowed Dependencies table. Structural tests enforce these rules.

| Layer | Must NOT import from |
|---|---|
| Types | Config, Data, Service, Providers, API, UI |
| Config | Data, Service, Providers, API, UI |
| Data | Service, Providers, API, UI |
| Service | Providers (implementations), API, UI |
| Providers | Config, Data, Service, API, UI |
| API | UI |
| UI | (none — top of stack) |

Note: "Providers (implementations)" means no direct import of concrete provider classes. Provider interfaces from the Providers layer are permitted in all layers via DI.

---

## Custom Layer Support

From spec Section 5.2. When the user rejects or modifies the default sequence, apply these propagation rules:

- **Added layers:** Insert at user-specified position. Define allowed dependencies (which existing layers it may import). Regenerate structural tests and folder paths for the new layer.
- **Removed layers:** Drop from sequence. Reassign files currently in that layer to adjacent layers. Remove all dependency references to the dropped layer.
- **Renamed layers:** Update all references — folder paths, structural test names, strategy spec. Dependency rules carry over under the new name.
- **Modified dependency rules:** Structural tests reflect the approved custom rules, not the defaults above.
- **Full rejection path:** If the user rejects the default architecture entirely, ask for custom layers in order, collecting for each: name, responsibility, and allowed dependencies. Use those definitions in place of this file's defaults for all subsequent steps.
