# Signature Patterns

Grep-based signature extraction patterns for the `GrepExtractor`. Used as the fallback backend when neither Serena MCP nor `tsc --declaration` is available.

These patterns are intentionally conservative (prefer false negatives over false positives). Files the extractor cannot parse are logged in the Open Questions section as `// parser-unknown: <reason>`.

---

## TypeScript / JavaScript

The `(export\s+)?` capture group's presence/absence maps to the `visibility` field: present → `exported`, absent → `internal`. Patterns match both forms; filter with `--exports-only` to drop the absent-export rows at write time.

**Function declarations (exported or internal):**
```
^(export\s+)?(async\s+)?function\s+(\w+)\s*(\([^)]*\))\s*(:\s*[^{]+)?
```
Captures: visibility prefix, function name, parameter list, return type annotation.

**Arrow functions / const (exported or internal):**
```
^(export\s+)?const\s+(\w+)\s*(:\s*[^=]+)?\s*=\s*(async\s+)?\(
```
Captures: visibility prefix, const name, type annotation.

**Class declarations (exported or internal):**
```
^(export\s+)?(abstract\s+)?class\s+(\w+)(\s+extends\s+\w+)?(\s+implements\s+[\w,\s]+)?
```
Captures: visibility prefix, class name, extends, implements.

**Interface / type (exported or internal):**
```
^(export\s+)?(interface|type)\s+(\w+)(<[^>]+>)?
```
Captures: visibility prefix, interface/type name, generic parameters.

**Re-exports (always exported):**
```
^export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]
```
Captures: exported names, source module. These are always `exported` — there is no non-exported form.

---

## Python

Python has no `export` keyword. Visibility is derived by convention: leading underscore = `internal`, no underscore = `exported`. When a module defines `__all__`, it overrides the convention — names in `__all__` are `exported`, names absent are `internal`. Extract ALL top-level `def` / `class` / module-level assignments; do NOT pre-filter underscored names. Emit the visibility field per the convention.

**Function definitions (all top-level):**
```
^def\s+(\w+)\s*\(([^)]*)\)\s*(->\s*[^:]+)?:
```
Captures: function name, parameters, return type hint. Visibility: `internal` if name starts with `_`, else `exported` (subject to `__all__` override).

**Class definitions (all top-level):**
```
^class\s+(\w+)(\([^)]*\))?:
```
Captures: class name, base classes. Visibility: same rule as functions.

**Module-level assignments (all):**
```
^(\w+)\s*(:\s*\w+)?\s*=
```
Captures: variable name. Visibility: same rule.

**`__all__` exports (visibility override):**
```
^__all__\s*=\s*\[([^\]]+)\]
```
Captures: explicitly exported names. When present, overrides the leading-underscore heuristic: names in `__all__` → `exported`; names absent from `__all__` → `internal` regardless of underscore.

---

## Go

Go has no `export` keyword. Visibility is determined by the first letter's case: uppercase first letter = `exported`, lowercase = `internal`. Extract ALL top-level `func` / `type` / `var` / `const` (both cases) and emit visibility per the case rule.

**Functions (all top-level):**
```
^func\s+(\([^)]+\)\s+)?(\w+)\s*\(([^)]*)\)\s*(\([^)]*\)|[\w*.\[\]]+)?
```
Captures: receiver (if method), function name, parameters, return type. Visibility: `exported` if first letter of name is uppercase, else `internal`.

**Types (all top-level):**
```
^type\s+(\w+)\s+(struct|interface|func|int|string|float64|bool|\w+)
```
Captures: type name, underlying type. Visibility: first-letter case rule.

**Constants / variables (all top-level):**
```
^(var|const)\s+(\w+)\s+
```
Captures: kind, name. Visibility: first-letter case rule.

---

## Rust

The `(pub(\(crate\))?\s+)?` capture group's presence/absence maps to visibility: `pub` or `pub(crate)` → `exported`, absent → `internal`. Extract all top-level declarations regardless of `pub`.

**Functions (exported or internal):**
```
^(pub(\(crate\))?\s+)?(async\s+)?fn\s+(\w+)(<[^>]+>)?\s*\(([^)]*)\)\s*(->\s*[^{]+)?
```
Captures: visibility prefix, async, function name, generics, parameters, return type.

**Structs / enums / traits (exported or internal):**
```
^(pub(\(crate\))?\s+)?(struct|enum|trait)\s+(\w+)(<[^>]+>)?
```
Captures: visibility prefix, kind, name, generics.

**Type aliases (exported or internal):**
```
^(pub(\(crate\))?\s+)?type\s+(\w+)(<[^>]+>)?\s*=
```
Captures: visibility prefix, type alias name.

**`mod` declarations (exported or internal):**
```
^(pub(\(crate\))?\s+)?mod\s+(\w+)
```
Captures: visibility prefix, module name.

---

## Extractor selection logic

See SKILL.md "Structural extractor selection" for the authoritative 3-step Serena probe (schema-load → activate → smoke-test), the `--extractor` / `--require-extractor` flags, and the full fallthrough policy. This file only covers the grep-pattern details the GrepExtractor uses.

**TscDeclarationExtractor notes:**
- Run `tsc --declaration --emitDeclarationOnly` in a temp directory.
- Parse generated `.d.ts` files for declared symbols. `.d.ts` files typically contain only exported declarations; mark all as `exported` in the visibility field unless the declaration is scoped `declare` without `export` (in which case mark `internal`).
- Extract function signatures, interface definitions, type aliases, class declarations.
- More accurate than grep for TS projects but requires a valid `tsconfig.json`.
