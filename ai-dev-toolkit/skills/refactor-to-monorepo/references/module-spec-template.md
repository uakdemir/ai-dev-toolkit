# Module Spec Template

Use this template for each proposed module in `docs/monorepo-strategy/modules/<name>.md`.

---

## Module: `<module-name>`

### 1. Responsibility

_Single sentence: what this module does._

### 2. Owned Files

<!-- Current file paths that belong to this module. -->
- `src/path/to/file.ts`

### 3. Owned Database Tables

<!-- Tables this module is the sole owner of (creates, migrates, writes). -->
- `table_name`

### 4. Shared Table Access

<!-- Tables read but not owned; access governed by inter-module contracts. -->
- `table_name` — reason for read access

### 5. Exported Interface

<!-- Functions, classes, events, or routes other modules may call/import. -->
- `exportedFunction(args): ReturnType` — brief description

### 6. Dependencies

<!-- What this module needs from other modules. -->
- `<other-module>` — what is needed and why

### 7. Extraction Steps

<!-- Specific enough for another AI or developer to execute without further clarification. -->

1. Move the following paths to `packages/<module-name>/src/`:
   - `src/path/to/file.ts`
2. Fix broken imports (cross-reference dependency matrix):
   - `src/other/consumer.ts` imports `../path/to/file` — update to `@scope/module-name`
3. Update config files:
   - Add `packages/<module-name>` to root `pnpm-workspace.yaml`
   - Create `packages/<module-name>/package.json` with correct name and deps
   - Update root `tsconfig.json` path aliases if applicable
4. Verify: `pnpm build && pnpm test`

### 8. Estimated Complexity

<!-- simple = clean seam | moderate = needs interface design | complex = heavy refactor required -->
**simple** | **moderate** | **complex** — _one-line rationale_
