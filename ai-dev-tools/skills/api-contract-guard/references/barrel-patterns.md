# Barrel Patterns Reference — api-contract-guard

Loaded at Step 6 (Barrel File Analysis). Contains barrel detection algorithms,
export analysis, incomplete barrel detection, cross-module
import scanning with path resolution rules, wildcard re-export resolution, barrel
generation rules, and `package.json` `exports` field handling.

---

## Barrel File Detection

### Node.js

Check barrel locations in priority order:

1. `index.ts` or `index.js` at module root
2. `src/index.ts` or `src/index.js` (if source lives under `src/`)
3. `package.json` `exports` field: the `"."` entry (or `main` field) points to the
   primary barrel

**Classification:**
- File exists and has at least one `export` statement → barrel present
- File exists but is empty or has no exports → treat as "no barrel" (missing)
- File does not exist → missing

### Python

Check `__init__.py` at the module root directory.

**Classification:**
- `__init__.py` exists and has `from .x import Y` or `__all__` → barrel present
- `__init__.py` exists but is empty (or only comments/docstrings) → treat as "no barrel"
- `__init__.py` does not exist → missing

### .NET

.NET does not use barrel files. It uses the `internal` access modifier and namespace
visibility instead.

**Analysis approach for .NET:**
- Scan source files for `public class`, `public interface`, `public enum`, `public struct`,
  `public record` declarations in root namespaces
- Types referenced by external projects = keep public
- Types with no external references = candidates for `internal`

---

## Export Analysis

Extract exports from barrel files using pattern matching.

### Node.js Patterns

Match these patterns in the barrel file:

```
Named re-export:     export { X } from './file'
                     export { X, Y, Z } from './file'
Renamed re-export:   export { X as Y } from './file'
Default re-export:   export { default as X } from './file'
Type re-export:      export type { X } from './file'
                     export type { X, Y } from './file'
Wildcard re-export:  export * from './file'
Named wildcard:      export * as X from './file'
Direct export:       export const X = ...
                     export function X(...
                     export class X ...
                     export default ...
                     export type X = ...
                     export interface X ...
```

**Extraction rules:**
- For `export { A, B } from './file'` → each symbol A, B is a named export from `./file`
- For `export { default as X } from './file'` → X is a default re-export from `./file`
- For `export type { X } from './file'` → X is a type export from `./file`
- For `export * from './file'` → wildcard, requires resolution (see Wildcard section)
- For direct exports (`export const/function/class`) → named export, source is barrel itself

### Python Patterns

Match these patterns in `__init__.py`:

```
Relative import:     from .file import X
                     from .file import X, Y, Z
                     from .file import X as Y
Subpackage import:   from .subpkg import X
                     from .subpkg.file import X
Wildcard import:     from .file import *
```

**`__all__` list extraction:**

```
__all__ = ['X', 'Y', 'Z']
__all__ = [
    'X',
    'Y',
    'Z',
]
```

- If `__all__` exists, it is the authoritative export set — symbols imported but not in
  `__all__` are internal to the package
- If `__all__` does not exist, all `from .x import Y` statements define the exports

### .NET Patterns

Scan source files in root namespace for public type declarations:

```
public class X
public interface IX
public enum X
public struct X
public record X
public abstract class X
public sealed class X
public static class X
```

- Match `public\s+(abstract\s+|sealed\s+|static\s+)?(class|interface|enum|struct|record)\s+(\w+)`
- Capture group 3 is the type name

---

## Incomplete Barrel Detection Algorithm

Detects barrels that exist but do not cover all externally-consumed symbols.

1. **Extract barrel exports:** Use regex patterns from the Export Analysis section above
   → export set (list of symbol names)
2. **Scan external files:** Scan all source files outside the module for import statements
   targeting paths inside the module (not the barrel path)
3. **Extract consumed symbols:** From matching import statements, extract the symbol names
   → consumed set
4. **Compute discrepancies:** consumed set minus export set = discrepancies
5. Each discrepancy records: `{ symbol, source_file (from import path), consumers: [files] }`

### Discrepancy Presentation

For each discrepancy, present two options to the user:

- **Add to barrel** — the symbol is intentionally public, add it to the barrel
- **Flag consumer** — the consumer is reaching into internals, report as violation

---

## Cross-Module Import Scanning

Full scan of all source files. Import path scanning reads import statements only,
not file contents, so it scales linearly with import count, not LOC.

Scan all source files for import/require/from statements and resolve paths.

**Node.js import patterns to match:**

```
import { X } from 'path'
import { X, Y } from 'path'
import X from 'path'
import * as X from 'path'
import type { X } from 'path'
const { X } = require('path')
const X = require('path')
require('path')
```

**Python import patterns to match:**

```
from package.module import X
from package.module import X, Y
from package import module
import package.module
import package.module as alias
```

**.NET using patterns to match:**

```
using Namespace;
using Namespace.SubNamespace;
using static Namespace.ClassName;
```

### Path Resolution Rules

**Relative imports:**
- Resolve `./` and `../` against `dirname(importing_file)`
- After resolution, check if the resulting path falls inside another module's directory
- Example: `import { X } from '../auth/service'` in `src/billing/index.ts` resolves to
  `src/auth/service` → inside the `auth` module → check if it goes through the barrel

**Monorepo bare specifiers:**
- Match against workspace package names from workspace config
- Example: `import { X } from '@myorg/auth'` → matches the `@myorg/auth` package →
  goes through barrel (OK)
- Example: `import { X } from '@myorg/auth/service'` → deeper path into package →
  check `exports` field

**`package.json` `exports` field:**
- `"."` entry = primary barrel (imports resolving here are OK)
- Subpath exports (e.g., `"./utils"`, `"./types"`) = additional public entry points
  — imports through these are NOT violations
- Imports targeting paths not listed in `exports` = violations
- See the dedicated `package.json exports Field Handling` section below

**Path aliases (tsconfig `paths`, webpack aliases, Python namespace packages):**
- These create alternative names for internal paths
- Warn: "Path alias detected (`{alias}`). Some internal imports via aliases may not be
  caught."

### Violation Determination

An import is a violation when ALL of these are true:
1. The import target resolves to a path inside another module's directory
2. The import path does NOT point to the barrel file
3. The import path does NOT match a subpath export in `package.json` `exports`

**Examples:**

```
# Node.js
import { AuthService } from '../auth/service'     # violation — bypasses barrel
import { AuthService } from '../auth'              # OK — goes through barrel
import { X } from '@myorg/auth/utils'              # check exports field
import { X } from '@myorg/auth'                    # OK — barrel import

# Python
from auth.service import AuthService               # violation — bypasses __init__.py
from auth import AuthService                       # OK — goes through __init__.py

# .NET
using App.Auth.Internal;                           # potential violation — internal namespace
using App.Auth;                                    # OK — public namespace
```

---

## Wildcard Re-Export Resolution

Wildcard re-exports (`export * from`) leak internal symbols and defeat explicit contracts.
Always warn when detected.

1. Read the target file of the wildcard export
2. Extract all `export` statements from the target file → one level of resolution
3. If the target itself has `export * from '...'`, warn:
   "Nested wildcard re-exports detected. Recommend replacing with named exports."
4. Present what was resolved (one level) and note the limitation

### Recommendation

Always recommend replacing wildcard re-exports with named exports:

```
# Before (wildcard — weak contract):
export * from './service';

# After (named — explicit contract):
export { AuthService, AuthError } from './service';
```

Present the resolved symbol list and let the user select which to keep.

---

## Barrel Generation Rules

When generating a new barrel file or updating an existing one, follow these rules.

### Determine Export Kind

Match patterns in the source file:
- `export default class/function/const X` → default export
- `export class/function/const X` → named export
- `export type X` / `export interface X` → type export
- No explicit `export` on the declaration → named (when re-exported by the barrel)

### Node.js Barrel Syntax

```ts
// Generated by api-contract-guard. Edit freely — this is now your module's public API.

// From ./service
export { AuthService } from './service';
export { default as createAuth } from './service';

// From ./errors
export { AuthError, TokenExpiredError } from './errors';

// From ./types
export type { AuthOptions, TokenPayload } from './types';
```

### Python Barrel Syntax

```python
# Generated by api-contract-guard. Edit freely — this is now your module's public API.

from .service import AuthService
from .errors import AuthError
from .jwt import verify_token

__all__ = ['AuthService', 'AuthError', 'verify_token']
```

**Circular import risk check:**
Before generating, scan the module's submodules for imports from the package's own
`__init__.py` (e.g., `from auth import X` inside `auth/service.py`). If found, warn:
"Circular import risk detected between `{submodule}` and `__init__.py`. Review the
generated barrel before committing."

### Ordering Rules

1. **Group by source file** — all exports from the same source file appear together
2. **Source file order** — files are listed in directory order (alphabetical by path)
3. **Within a group** — exports are listed alphabetically by symbol name
4. **Type exports last** — within each group, type exports come after value exports

### Header Comment

Every generated barrel file starts with:

```
{comment_char} Generated by api-contract-guard. Edit freely — this is now your module's public API.
```

Where `{comment_char}` is `//` for Node.js/TS or `#` for Python.

### Updating Existing Barrels

When adding symbols to an existing barrel (discrepancy resolution):
- Append new exports at the end of the file
- Add a comment marking the addition:
  ```
  {comment_char} Added by api-contract-guard — approved at {date}
  ```
- Preserve all existing content unchanged

---

## `package.json` `exports` Field Handling

The `exports` field in `package.json` defines the public entry points of a package.
It directly affects barrel detection and violation determination.

### Primary Barrel (`.` entry)

The `"."` entry (or the `main` field if `exports` is absent) points to the primary
barrel file:

```json
{
  "exports": {
    ".": "./src/index.ts"
  }
}
```

If `exports` is a string rather than an object, it is the `"."` entry:

```json
{
  "exports": "./src/index.ts"
}
```

If no `exports` field exists, fall back to the `main` field:

```json
{
  "main": "./src/index.js"
}
```

### Subpath Exports

Subpath entries define additional public entry points. Imports through these are NOT
violations:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./utils": "./src/utils/index.ts",
    "./types": "./src/types/index.ts"
  }
}
```

- `import { X } from '@myorg/auth'` → resolves to `"."` → OK (primary barrel)
- `import { X } from '@myorg/auth/utils'` → resolves to `"./utils"` → OK (listed)
- `import { X } from '@myorg/auth/internal/helper'` → no matching export → violation

Each subpath export target file is treated as an additional barrel for that sub-path.
The skill does NOT generate these — only the primary barrel is generated.

### Conditional Exports

Entries may use conditions for different environments:

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "default": "./src/index.ts"
    }
  }
}
```

**Resolution order:**
1. Use the `"default"` condition if present
2. If no `"default"`, use `"import"` for ESM or `"require"` for CJS
3. If ambiguous, warn: "Conditional exports detected — using `{condition}` condition
   for analysis."

### Wildcard Subpath Exports

Some packages use wildcard patterns:

```json
{
  "exports": {
    "./*": "./src/*.ts"
  }
}
```

- This makes all files under `src/` public entry points
- Warn: "Wildcard subpath export detected. All paths under `{pattern}` are public.
  This weakens module encapsulation — consider using explicit subpath exports."
