# Execution Patterns

Each step in the strategy spec maps to one of four action types executed in order: create folders, move files, rewrite imports, extract interfaces. This reference defines how each action is executed, with Serena-aware and regex-fallback paths.

---

## Action: create-folder

- Command: `mkdir -p <target-path>`
- Dependency ordering: create parent folders before child folders.
- Idempotent — skip if the directory already exists.

---

## Action: move-file

### Serena Mode

1. Call `find_referencing_symbols` on the source file to capture all symbols and their reference locations.
2. Store the reference graph for use in the Phase 2 `rewrite-import` steps.
3. Execute `git mv <source> <target>`.

### Fallback Mode

1. Execute `git mv <source> <target>`.
2. No reference graph is captured — import rewrites rely on regex in Phase 2.

### Dependency Ordering

- If file B imports file A and both are being moved, move A before B.
- Build ordering from the `affected_imports` field in each step.
- Cycles within `move-file` steps: batch them together — moves do not break imports by themselves.

---

## Action: rewrite-import

### Serena Mode

1. Use the reference graph captured during `move-file` (via `find_referencing_symbols`) to locate all files referencing the moved file's symbols.
2. For each referencing file, use `replace_content` (or targeted file edits) to update the import path from the old location to the new location. Symbol names remain unchanged — only the module path is rewritten.
3. Note: `rename_symbol` is for renaming symbols, NOT for updating import paths — do not use it here. The correct approach is `find_referencing_symbols` to identify references + targeted content replacement to update paths.

### Fallback Mode

Update imports using per-stack regex:

| Stack | Patterns to match |
|---|---|
| Node.js | `import ... from '...'`, `require('...')` |
| .NET | `using` directives, namespace prefix matching, `<ProjectReference>` in `.csproj` |
| Python | `import ...`, `from ... import ...`, resolve barrel exports via `__init__.py` |

- For Node.js: read `tsconfig.json` paths section to resolve path aliases before applying regex.
- Flag any unresolved aliases as: `# regex-based — verify manually`.

### Dependency Ordering

- Process files with the most consumers first. Consumer count = length of `affected_imports` for that step.
- Ties: alphabetical by file path.

---

## Action: extract-interface

### Serena Mode

1. Call `get_symbols_overview` on the source file to read its public API surface.
2. Create the interface file at the path specified in the `target` field.
3. Call `find_referencing_symbols` to identify consumer files.
4. Update consumer imports to point to the new interface file.

### Fallback Mode

1. Read the source file and extract public method signatures:
   - TypeScript: `public` or `export`ed members.
   - C#: `public` access modifier.
   - Python: methods without a `_` prefix.
2. Create the interface file at `target`.
3. Regex-replace imports in consumer files.

### Field Semantics

| Field | Meaning |
|---|---|
| `source` | Concrete class file being extracted from |
| `target` | Path where the interface file will be created |
| `affected_imports` | Consumer files that need to be updated |

### Dependency Ordering

- Extract interfaces with fewer consumers first (ascending by `affected_imports` length).

---

## Circular Dependency Classification

Advisory only — these patterns inform the proposed resolution in the strategy spec. They are NOT auto-executed.

| Pattern | Description | Detection Heuristic | Confidence |
|---|---|---|---|
| Callback | B receives A's function as a parameter, or calls a single void method on A | Function param typed as A, or call site has no return assignment | High if single void call; Medium otherwise |
| Shared operation | Both A and B call the same third function | Identify common call targets across both files | High if 2+ shared targets |
| Bidirectional data flow | A reads B's property, B reads A's property | Property access patterns in both directions | Medium |
| Misplaced responsibility | One side has only a single usage of the other | Count distinct usages per direction — flag if one direction has exactly 1 call | High if count = 1 |
| Unclassified | Pattern is ambiguous and does not fit the above | Fails all heuristics | — |

- All classifications include a confidence level (high / medium / low).
- Unclassified cycles get no proposed resolution in the strategy spec.

---

## [DONE] Marker Format

- When a step completes, prepend `[DONE] ` to the step's action line in the strategy spec.
- Example: `[DONE] action: move-file`
- Resume parsing rule: any line starting with `[DONE] action:` is skipped — do not re-execute it.
