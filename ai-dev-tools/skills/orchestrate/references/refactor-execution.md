# Refactor Execution Patterns

Loaded at Step 5 only when a refactor roadmap exists (`docs/monorepo-strategy/roadmap.md` or `docs/layer-architecture/roadmap.md`) and the current feature name appears in that roadmap.

---

## File Operations

- `mkdir -p` for folder creation (idempotent)
- `git mv` for file moves (preserves history)
- Move dependency ordering: if B imports file A and both move, move A first
- Import rewrite: grep old paths, replace with new package paths

### Per-stack patterns

**Node.js:**
- `import ... from '...'`, `require('...')` — match and replace the module path string
- Read `tsconfig.json` paths section to resolve path aliases before applying regex
- Flag any unresolved aliases as: `# regex-based — verify manually`

**.NET:**
- `using` directives, namespace prefix matching, `<ProjectReference>` in `.csproj`
- Update both the `using` directive and the corresponding `.csproj` `<ProjectReference>` path

**Python:**
- `import ...`, `from ... import ...` — match and replace the module path
- Resolve barrel exports via `__init__.py` — ensure the new package's `__init__.py` re-exports moved symbols
- Check for relative imports (`from . import ...`) that need conversion to absolute paths

---

## Pre-flight

- **Source existence check:** verify every source path exists. Report all missing before starting — do not fail on the first one.
- **Target collision check:** warn on existing targets for moves. Prompt: overwrite or stop.
- **Clean git state required:** uncommitted changes must be committed or stashed before proceeding.

---

## Verification

- **After file moves:** assert source gone + target present. Do NOT build (imports still point to old paths).
- **After import rewrites:** run full build/type-check (first point where compilation should succeed).

### Per-stack commands

| Stack | Type-check / build | Import smoke-test |
|---|---|---|
| Node.js | `npx tsc --noEmit` | `npx eslint .` |
| .NET | `dotnet build` | N/A (build covers it) |
| Python | `python -m py_compile <file>` | `python -c "import <package>"` |
