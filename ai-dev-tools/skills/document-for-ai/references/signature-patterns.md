# Signature Patterns

Grep-based signature extraction patterns for the `GrepExtractor`. Used as the fallback backend when neither Serena MCP nor `tsc --declaration` is available.

These patterns are intentionally conservative (prefer false negatives over false positives). Files the extractor cannot parse are logged in the Open Questions section as `// parser-unknown: <reason>`.

---

## TypeScript / JavaScript

**Exported function declarations:**
```
^export\s+(async\s+)?function\s+(\w+)\s*(\([^)]*\))\s*(:\s*[^{]+)?
```
Captures: function name, parameter list, return type annotation.

**Exported arrow functions / const:**
```
^export\s+const\s+(\w+)\s*(:\s*[^=]+)?\s*=\s*(async\s+)?\(
```
Captures: const name, type annotation.

**Exported class declarations:**
```
^export\s+(abstract\s+)?class\s+(\w+)(\s+extends\s+\w+)?(\s+implements\s+[\w,\s]+)?
```
Captures: class name, extends, implements.

**Exported interface / type:**
```
^export\s+(interface|type)\s+(\w+)(<[^>]+>)?
```
Captures: interface/type name, generic parameters.

**Re-exports:**
```
^export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]
```
Captures: exported names, source module.

---

## Python

**Function definitions:**
```
^def\s+(\w+)\s*\(([^)]*)\)\s*(->\s*[^:]+)?:
```
Captures: function name, parameters, return type hint.

**Class definitions:**
```
^class\s+(\w+)(\([^)]*\))?:
```
Captures: class name, base classes.

**Module-level assignments (public):**
```
^(\w+)\s*(:\s*\w+)?\s*=
```
Filter: exclude names starting with `_`.

**`__all__` exports:**
```
^__all__\s*=\s*\[([^\]]+)\]
```
Captures: explicitly exported names.

---

## Go

**Exported functions (capitalized):**
```
^func\s+(\([^)]+\)\s+)?([A-Z]\w+)\s*\(([^)]*)\)\s*(\([^)]*\)|[\w*.\[\]]+)?
```
Captures: receiver (if method), function name, parameters, return type.

**Exported types:**
```
^type\s+([A-Z]\w+)\s+(struct|interface|func|int|string|float64|bool|\w+)
```
Captures: type name, underlying type.

**Exported constants / variables:**
```
^(var|const)\s+([A-Z]\w+)\s+
```
Captures: const/var name.

---

## Rust

**Public functions:**
```
^pub(\(crate\))?\s+(async\s+)?fn\s+(\w+)(<[^>]+>)?\s*\(([^)]*)\)\s*(->\s*[^{]+)?
```
Captures: visibility, async, function name, generics, parameters, return type.

**Public structs / enums / traits:**
```
^pub(\(crate\))?\s+(struct|enum|trait)\s+(\w+)(<[^>]+>)?
```
Captures: visibility, kind, name, generics.

**Public type aliases:**
```
^pub(\(crate\))?\s+type\s+(\w+)(<[^>]+>)?\s*=
```
Captures: type alias name.

**`mod` declarations:**
```
^pub(\(crate\))?\s+mod\s+(\w+)
```
Captures: module name.

---

## Extractor selection logic

```
1. Probe for Serena MCP (mcp.list_tools() → check for get_symbols_overview,
   find_symbol, find_referencing_symbols).
2. If Serena unavailable: check for tsc in PATH + tsconfig.json in scope.
   If found → TscDeclarationExtractor (run: tsc --declaration --emitDeclarationOnly,
   parse .d.ts output for exported symbols).
3. If neither → GrepExtractor with patterns above.
4. Override: --extractor <serena|tsc|grep>.
```

**TscDeclarationExtractor notes:**
- Run `tsc --declaration --emitDeclarationOnly` in a temp directory.
- Parse generated `.d.ts` files for `export` declarations.
- Extract function signatures, interface definitions, type aliases, class declarations.
- More accurate than grep for TS projects but requires a valid `tsconfig.json`.
