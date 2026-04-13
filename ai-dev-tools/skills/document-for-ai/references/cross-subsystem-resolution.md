# Cross-Subsystem Resolution

How to resolve external imports to sibling subsystems and identify the ones that matter for cross-subsystem pointers.

---

## Import resolution scope

**v1 scope:** package-internal only. Follow only imports that resolve within the same package (e.g., `@titansigma/calibration/*` paths that resolve to files in `packages/calibration/`). Cross-package imports (e.g., `@titansigma/shared`) are not followed.

---

## Resolution algorithm

For each import statement found during Phase 1:

1. **Classify import path:**
   - Relative path (`./`, `../`) → resolve relative to the importing file.
   - Package-scoped path (`@scope/package/...`) → check if the package matches the current scope. If yes, resolve within the package. If no, mark as cross-package and skip.
   - Bare module specifier (`lodash`, `express`) → external dependency, skip.

2. **Resolve to file:**
   - Follow the resolved path to a concrete file (applying TS module resolution, Python import mechanics, Go package resolution, or Rust module path resolution as appropriate).
   - If resolution fails, log the unresolvable import and skip.

3. **Classify subsystem:**
   - Determine which subsystem the resolved file belongs to (by checking if the file path falls within any detected subsystem's directory).
   - If the resolved file is in the same subsystem → internal import, skip for cross-subsystem purposes.
   - If the resolved file is in a different subsystem → cross-subsystem import, record it.

4. **Record for cross-subsystem pointers:**
   - For each cross-subsystem import: record the imported symbol name, the file it lives in, and the subsystem it belongs to.
   - This data feeds the Cross-subsystem pointers template (see `references/phase2-triggers.md`).

---

## Batch mode shared import graph

In batch mode (multiple subsystems processed in one run), the Phase 1 import graph is shared across subsystems. This enables:

1. **Forward references:** subsystem A imports from subsystem B, and both are being generated → the pointer in A's doc can reference B's doc path.
2. **Reverse references:** subsystem B's "When changing X, also check" bullets can be populated with consumers from A, C, etc.
3. **Deduplication:** each import is resolved once, even if multiple subsystems reference the same external symbol.

The shared graph is built incrementally as each subsystem completes Phase 1. Subsystems processed later in the batch benefit from earlier resolutions.

---

## Single-subsystem fallback

When only one subsystem is being generated (not batch mode), the shared import graph is not available. In this case:

1. Cross-subsystem pointers are still generated from forward imports (what this subsystem imports from others).
2. "When changing X, also check" bullets use a reverse grep fallback: `grep -rn "<symbol_name>" <package_src_root> --include="*.ts"` (or language-appropriate globs).
3. Results from the grep fallback are marked as `"approximate — run batch mode for complete coverage"`.

---

## Output path convention

Generated doc files are written to `<package-root>/docs/ai/<subsystem-name>.md`.

**Path derivation:** the subsystem name is derived from its path relative to its detected parent context directory (e.g., `src/server/` or `src/client/`), with path separators replaced by hyphens.

Examples:
- `packages/calibration/src/server/conversation/llm/` → `packages/calibration/docs/ai/conversation-llm.md`
- `packages/calibration/src/server/services/` → `packages/calibration/docs/ai/services.md`
- `packages/golden/src/client/components/` → `packages/golden/docs/ai/components.md`
