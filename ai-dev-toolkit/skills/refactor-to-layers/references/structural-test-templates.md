# Structural Test Templates

Three-tier enforcement model:
- **Tier 1 (Import-Scanning):** Language-native test files, zero extra deps beyond test runner. Regex-scan sources, resolve import paths to layers, fail on forbidden crossings.
- **Tier 2 (Framework-Specific):** ESLint (Node.js), ArchUnitNET (.NET), import-linter (Python). Enforce at lint/build time.
- **Tier 3 (CI):** Structural tests must run in CI before merge. Workflow instruction only — no code template.

Adapt all templates to the actual layer map and folder structure from the strategy spec.

---

## Tier 1: Import-Scanning Tests

### Node.js (Jest/Vitest)

File: `tests/structural/layer-boundaries.test.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

const LAYER_FOLDERS: Record<string, string[]> = {
  types:    ['src/types'],   config:   ['src/config'],
  data:     ['src/repositories', 'src/db'],
  service:  ['src/services'], provider: ['src/plugins', 'src/providers'],
  api:      ['src/routes', 'src/handlers'], ui: ['src/ui'],
};
const FORBIDDEN: Record<string, string[]> = {
  types:    ['config', 'data', 'service', 'provider', 'api', 'ui'],
  config:   ['data', 'service', 'provider', 'api', 'ui'],
  data:     ['service', 'provider', 'api', 'ui'],
  service:  ['api', 'ui'],
  provider: ['config', 'data', 'service', 'api', 'ui'],
  api:      ['ui'],
};

function extractImports(filePath: string): string[] {
  const src = fs.readFileSync(filePath, 'utf-8');
  const esm = [...src.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/gs)].map(m => m[1]);
  const cjs = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
  return [...esm, ...cjs];
}

function resolveToLayer(imp: string, sourceFile: string): string | null {
  let resolved = imp.startsWith('.')
    ? path.relative(process.cwd(), path.resolve(path.dirname(sourceFile), imp))
    : imp;
  // tsconfig paths aliases: read tsconfig.json `paths` to expand here.
  // Limitation: aliases unresolved if tsconfig.json is absent or has no `paths`.
  for (const [layer, folders] of Object.entries(LAYER_FOLDERS))
    if (folders.some(f => resolved.startsWith(f))) return layer;
  return null;
}

const ALLOWLIST: Array<{ source: string; target: string }> = (() => {
  try { return JSON.parse(fs.readFileSync('tests/structural/.layer-allowlist.json', 'utf-8')); }
  catch { return []; }
})();

describe('Layer boundary enforcement', () => {
  for (const [layer, forbidden] of Object.entries(FORBIDDEN)) {
    test(`${layer} layer must not import forbidden layers`, () => {
      const dataFiles = glob.sync(`src/${layer}/**/*.ts`);
      for (const file of dataFiles) {
        const imports = extractImports(file);
        for (const imp of imports) {
          if (ALLOWLIST.some(e => file.includes(e.source) && imp.includes(e.target))) continue;
          const targetLayer = resolveToLayer(imp, file);
          if (targetLayer) expect(forbidden).not.toContain(targetLayer);
        }
      }
    });
  }
});
```

### .NET (xUnit/NUnit)

File: `Tests/Structural/LayerBoundaryTests.cs`

```csharp
using System.IO; using System.Linq; using System.Text.RegularExpressions; using Xunit;

public class LayerBoundaryTests {
    static readonly Dictionary<string, string[]> LayerNS = new() {
        ["Types"]    = ["MyApp.Types"],
        ["Config"]   = ["MyApp.Config"],
        ["Data"]     = ["MyApp.Data", "MyApp.Infrastructure"],
        ["Service"]  = ["MyApp.Services"],
        ["Provider"] = ["MyApp.Providers"],
        ["Api"]      = ["MyApp.Api", "MyApp.Controllers"],
    };
    static readonly Dictionary<string, string[]> Forbidden = new() {
        ["Types"]    = ["Config", "Data", "Service", "Provider", "Api"],
        ["Config"]   = ["Data", "Service", "Provider", "Api"],
        ["Data"]     = ["Service", "Provider", "Api"],
        ["Service"]  = ["Api"],
        ["Provider"] = ["Config", "Data", "Service", "Api"],
    };

    static IEnumerable<string> ExtractUsings(string f) =>
        Regex.Matches(File.ReadAllText(f), @"^using\s+([\w.]+);", RegexOptions.Multiline)
             .Cast<Match>().Select(m => m.Groups[1].Value);

    static string? ToLayer(string ns) =>
        LayerNS.FirstOrDefault(kv => kv.Value.Any(p => ns.StartsWith(p))).Key;

    [Fact] public void NoBoundaryViolations() {
        foreach (var (layer, forbidden) in Forbidden)
        foreach (var file in Directory.EnumerateFiles(".", "*.cs", SearchOption.AllDirectories)
                     .Where(f => LayerNS[layer].Any(ns => f.Contains(ns.Replace("MyApp.", "")))))
        foreach (var usingNs in ExtractUsings(file)) {
            var target = ToLayer(usingNs);
            if (target != null) Assert.DoesNotContain(target, forbidden);
        }
    }

    // Also validate <ProjectReference> in .csproj files for project-level violations.
    [Fact] public void NoCsprojBoundaryViolations() {
        foreach (var f in Directory.EnumerateFiles(".", "*.csproj", SearchOption.AllDirectories)) {
            var refs = Regex.Matches(File.ReadAllText(f), @"<ProjectReference\s+Include=""([^""]+)""")
                            .Cast<Match>().Select(m => m.Groups[1].Value);
            // match ref filenames to layer names and assert no forbidden project dependencies
        }
    }
}
```

### Python (pytest)

File: `tests/structural/test_layer_boundaries.py`

```python
import ast, json
from pathlib import Path

LAYER_FOLDERS = {
    "types":    ["app/types"],   "config":   ["app/config"],
    "data":     ["app/repositories", "app/db", "app/models"],
    "service":  ["app/services"], "provider": ["app/dependencies", "app/core"],
    "api":      ["app/routers",  "app/api"],
}
FORBIDDEN = {
    "types":    ["config", "data", "service", "provider", "api"],
    "config":   ["data", "service", "provider", "api"],
    "data":     ["service", "provider", "api"],
    "service":  ["api"],
    "provider": ["config", "data", "service", "api"],
}
_aw = Path("tests/structural/.layer-allowlist.json")
ALLOWLIST = json.loads(_aw.read_text()) if _aw.exists() else []

def extract_imports(f: Path) -> list[str]:
    tree = ast.parse(f.read_text(encoding="utf-8"), filename=str(f))
    return [a.name for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names] + \
           [n.module for n in ast.walk(tree) if isinstance(n, ast.ImportFrom) and n.module]

def resolve_to_layer(imp: str) -> str | None:
    folder = imp.replace(".", "/")
    for layer, folders in LAYER_FOLDERS.items():
        if any(f.replace("/", ".") in imp or folder.startswith(f) for f in folders):
            return layer
    return None

def test_layer_boundaries() -> None:
    violations = []
    for layer, forbidden in FORBIDDEN.items():
        for folder in LAYER_FOLDERS.get(layer, []):
            for f in Path(folder).rglob("*.py") if Path(folder).exists() else []:
                for imp in extract_imports(f):
                    if any(e["source"] in str(f) and e["target"] in imp for e in ALLOWLIST):
                        continue
                    target = resolve_to_layer(imp)
                    if target and target in forbidden:
                        violations.append(f"{f}: {layer} → {target} ({imp})")
    assert not violations, "Layer boundary violations:\n" + "\n".join(violations)
```

---

## Tier 2: Framework-Specific Enforcement

### Node.js: ESLint

Detect format: `eslint.config.js` exists → flat config. `.eslintrc.*` exists → legacy. Default to flat for new projects.

**Flat config** — `eslint-layers.config.js`:

```javascript
import importX from 'eslint-plugin-import-x';
export default [{
  plugins: { 'import-x': importX },
  rules: { 'import-x/no-restricted-paths': ['error', { zones: [
    { target: './src/types',    from: './src/config',   message: 'types must not import config' },
    { target: './src/types',    from: './src/data',     message: 'types must not import data' },
    { target: './src/config',   from: './src/data',     message: 'config must not import data' },
    { target: './src/data',     from: './src/services', message: 'data must not import service' },
    { target: './src/services', from: './src/routes',   message: 'service must not import api' },
    { target: './src/providers',from: './src/services', message: 'provider must not import service' },
    { target: './src/routes',   from: './src/ui',       message: 'api must not import ui' },
  ]}]},
}];
```

**Legacy config** — `.eslintrc.layers.js` (extend from root: `"extends": ["./.eslintrc.layers.js"]`):

```javascript
module.exports = { plugins: ['import'], rules: { 'import/no-restricted-paths': ['error', { zones: [
  { target: './src/types',    from: './src/config' },
  { target: './src/config',   from: './src/data' },
  { target: './src/data',     from: './src/services' },
  { target: './src/services', from: './src/routes' },
  { target: './src/routes',   from: './src/ui' },
]}]}};
```

### .NET: ArchUnitNET

File: `Tests/Structural/ArchitectureTests.cs`

```csharp
using ArchUnitNET.Domain; using ArchUnitNET.Fluent; using ArchUnitNET.Loader;
using ArchUnitNET.xUnit; using Xunit;
using static ArchUnitNET.Fluent.ArchRuleDefinition;

public class ArchitectureTests {
    static readonly Architecture Arch = new ArchLoader().LoadAssemblies(
        typeof(MyApp.Data.SomeRepo).Assembly,
        typeof(MyApp.Services.SomeService).Assembly,
        typeof(MyApp.Api.SomeController).Assembly).Build();

    [Fact] public void DataMustNotDependOnService() =>
        Types().That().ResideInNamespace("MyApp.Data")
               .Should().NotDependOnAny(Types().That().ResideInNamespace("MyApp.Services")).Check(Arch);
    [Fact] public void ServiceMustNotDependOnApi() =>
        Types().That().ResideInNamespace("MyApp.Services")
               .Should().NotDependOnAny(Types().That().ResideInNamespace("MyApp.Api")).Check(Arch);
    [Fact] public void TypesMustHaveNoDependencies() =>
        Types().That().ResideInNamespace("MyApp.Types").Should()
               .NotDependOnAny(Types().That().ResideInNamespace("MyApp.Config")
                   .Or().ResideInNamespace("MyApp.Data")
                   .Or().ResideInNamespace("MyApp.Services")).Check(Arch);
}
```

### Python: import-linter

Add to `pyproject.toml`:

```toml
[tool.importlinter]
root_packages = ["app"]

[[tool.importlinter.contracts]]
name = "types layer has no upstream deps"
type = "forbidden"
source_modules = ["app.types"]
forbidden_modules = ["app.config", "app.data", "app.services", "app.routers"]

[[tool.importlinter.contracts]]
name = "data must not import service or api"
type = "forbidden"
source_modules = ["app.repositories", "app.db", "app.models"]
forbidden_modules = ["app.services", "app.routers"]

[[tool.importlinter.contracts]]
name = "layers follow dependency order"
type = "layers"
layers = ["app.routers", "app.services", "app.repositories", "app.config", "app.types"]
```

Run with: `lint-imports`

---

## Allowlist Format

File: `tests/structural/.layer-allowlist.json`

```json
[
  {"source": "src/data/userRepo.ts", "target": "src/services/authService.ts", "reason": "Legacy dependency, approved in Phase 2"}
]
```

Import-scanning tests load this at startup and skip import pairs matching `source` + `target` substrings. Pre-populate from Phase 2 approved exceptions (`strategy spec.approved_exceptions`). Each entry requires a `reason` field.

---

## Conflict Resolution

When existing structural test files are detected at target paths:

**Generate separately** — write to alternate filenames:

| Stack   | Alternate filename |
|---------|--------------------|
| Node.js | `layer-boundaries-generated.test.ts` |
| .NET    | `LayerBoundaryTests.Generated.cs` |
| Python  | `test_layer_boundaries_generated.py` |
| ESLint  | `eslint-layers-generated.config.js` |

**Merge mode** — append after marker in the existing file:
```
// --- Generated by refactor-to-layers ---
```
For `pyproject.toml`: add a new `[[tool.importlinter.contracts]]` block with `name = "generated-layers-<timestamp>"`.

Record chosen path (`separate` or `merge`) in strategy spec `conflict_resolution` field.

---

## Import Resolution Strategy

**Node.js:**
- ESM regex: `/import\s+.*?from\s+['"]([^'"]+)['"]/gs` — CJS regex: `/require\(['"]([^'"]+)['"]\)/g`
- Relative paths: `path.resolve(path.dirname(sourceFile), imp)` then `path.relative(cwd)`.
- Aliases: read `tsconfig.json` `compilerOptions.paths`. Limitation: unresolved if absent.
- `node_modules` imports: skip.

**.NET:**
- Using regex: `/^using\s+([\w.]+);/m` — ProjectReference regex: `/<ProjectReference\s+Include="([^"]+)"/`
- Match namespace prefix to `LayerNS` dict. For project-level: match `.csproj` filename to layer name.
- Limitation: global usings in `GlobalUsings.cs` are not scanned.

**Python:**
- Use `ast.parse` (preferred). Fallback regex: `import\s+([\w.]+)` and `from\s+([\w.]+)\s+import`.
- Convert dotted path to folder; confirm package with `__init__.py`.
- Relative imports: resolve against source file's package root. Limitation: ambiguous if no `src/` layout and no `pyproject.toml` package config.
