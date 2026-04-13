# Phase 2 Triggers

Phase 2 runs only when a trigger is detected by Phase 1. Each trigger maps to a specific template section that gets generated. Multiple triggers can fire for the same subsystem — each produces its own section.

---

## Trigger table

| Trigger | Template section generated | Source of trigger |
|---|---|---|
| Same field name in ≥ 2 exported signatures with numeric type | **Unit-sensitive values** table | Phase 1 symbol index |
| Symbols imported from other subsystems (package-internal paths) | **Cross-subsystem pointers** section | Phase 1 import graph |
| Exported function with `cache_control` / `cache_key` / `ephemeral` pattern in body | **Caching pattern** cross-cutting entry | Phase 1 grep pass |
| Exported async function with `try { ... } catch { /* skip */ }` around IO | **Silent fallback** cross-cutting entry | Phase 1 grep pass |
| Mutable state object (e.g., `session.*`) written from ≥ 2 exported functions — **TS/JS only in v1** | **In-place mutation** cross-cutting entry | Phase 1 grep pass |
| Enum / union type with ≥ 3 switch-case consumers | **Union state-machine** cross-cutting entry | Phase 1 grep pass |

---

## Numeric type detection (non-TS stacks)

For `SerenaExtractor` and `TscDeclarationExtractor`, type information is available directly from the extractor output.

For `GrepExtractor`, detect numeric types by matching language-specific patterns in signatures:

| Language | Numeric type patterns |
|---|---|
| TypeScript / JavaScript | `number`, `bigint` (inferred from usage context) |
| Python | `int`, `float`, `Decimal` |
| Go | `int`, `int8`, `int16`, `int32`, `int64`, `uint`, `uint8`, `uint16`, `uint32`, `uint64`, `float32`, `float64` |
| Rust | `i8`, `i16`, `i32`, `i64`, `i128`, `isize`, `u8`, `u16`, `u32`, `u64`, `u128`, `usize`, `f32`, `f64` |

If the type cannot be determined from the signature, skip the unit-sensitive trigger for that field.

---

## Unit-sensitive values template

Generated when Phase 2 detects the trigger (same field name in ≥ 2 exported signatures with numeric type). One table per field:

```markdown
### `<fieldName>`

| File / Symbol | Role | Assumed unit | Evidence |
|---|---|---|---|
| <canonical producer> | **Producer (canonical)** | <unit from JSDoc or "Unknown — audit <parent data structure>"> | <JSDoc quote or "Not documented"> |
| <consumer 1> | Consumer / Passthrough / Producer (derived) | <unit> | <evidence from JSDoc or comparison constant> |
| ... |
```

**Canonical producer heuristic:** the canonical producer is the exported function whose return type first introduces the field. If ambiguous (multiple functions independently produce the same field), mark all as `Producer` and note the ambiguity in the Evidence column.

**Mandatory footer:** "Drift surface: <producer → consumer pairs with unit mismatches>, and where the conversion must happen (NOT in exported signatures → grep required)."

**Grep pattern for unit conversions** (run during Phase 2 evidence gathering): search for numeric literals applied to the field across all non-test files using:
- `<fieldName>\s*[*/]\s*[0-9]+` (field on left)
- `[0-9]+\s*[*/]\s*<fieldName>` (numeric literal on left)

Example: `grep -rn "nullRate\s*[*/]\s*[0-9]+" src/` surfaces sites where the value is scaled.

---

## Cross-subsystem pointers template

Generated when Phase 2 detects the trigger (symbols imported from other subsystems via package-internal paths).

```markdown
## Cross-subsystem pointers

When changing <this subsystem>, you will almost always need to touch or verify symbols in these siblings.

### Types and schema contracts
| Symbol | Where it lives | Why <this subsystem> cares |
|---|---|---|
| <each externally-imported type> | <resolved import path> | <inferred from usage sites in this subsystem> |

### Siblings that <this subsystem> dispatches into or relies on
| Symbol | Where it lives | Why <this subsystem> cares |
|---|---|---|
| <each externally-imported function> | <resolved import path> | <inferred from usage sites> |

### When changing X inside <this subsystem>, also check
- <bullet list from union types with external switch-cases>
- <bullet list from interfaces with external implementers>
- <bullet list from shared mutable-state objects>
```

**Scan scope (v1):** follow only package-internal imports (e.g., `@titansigma/calibration/*` paths within the same package). Cross-package imports (e.g., `@titansigma/shared`) are not followed in v1.

**"Also check" bullet population:**
- In **batch mode**, the shared cross-subsystem import graph provides reverse-dependency data for full population.
- In **single-subsystem mode**, populate via reverse grep: `grep -rn "<symbol_name>" <package_src_root> --include="*.ts"` (or language-appropriate globs). Mark results as `"approximate — run batch mode for complete coverage"`.

**Important:** this section names external symbols and files but does NOT document their signatures. Signatures live in the sibling's own L1 doc. The goal is "prevent missed edits," not "eliminate external reads."

---

## Cross-cutting pattern entries

The remaining triggers (Caching pattern, Silent fallback, In-place mutation, Union state-machine) generate entries in the **Cross-cutting patterns** section of the L1/L2 template. Each entry:

```markdown
#### <Pattern name>

**Files:** <list of files exhibiting the pattern>
**Description:** <brief description of the pattern and its implications>
```

Examples:
- **Caching pattern**: "Functions `getCompletion`, `getCachedResponse` in `llm-client.ts`, `cache-manager.ts` use `cache_key` / `ephemeral` to control LLM response caching. Cache invalidation is caller-controlled."
- **Silent fallback**: "`fetchExternalRating` in `rating-service.ts` catches IO errors and returns a default value. Failures are invisible to callers."
- **In-place mutation**: "`updateSessionState`, `resetSession` in `session.ts`, `session-manager.ts` write to shared `session.*` object."
- **Union state-machine**: "`ConversationStatus` enum in `types.ts` consumed by switch-cases in `handler.ts`, `processor.ts`, `validator.ts`."
