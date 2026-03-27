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

// Canonical folder mapping per tech-stacks.md (Node.js + Fastify)
const LAYER_FOLDERS: Record<string, string[]> = {
  types:    ['src/types'],
  config:   ['src/config'],
  data:     ['src/data', 'src/repositories', 'src/db'],
  service:  ['src/services'],
  provider: ['src/providers', 'src/plugins'],
  api:      ['src/api', 'src/routes', 'src/handlers'],
  ui:       ['src/ui'],
};

// Complete forbidden-crossing matrix from layer-definitions.md.
// Each entry lists the layers that the key layer must NOT import from.
const FORBIDDEN: Record<string, string[]> = {
  types:    ['config', 'data', 'service', 'provider', 'api', 'ui'],
  config:   ['data', 'service', 'provider', 'api', 'ui'],
  data:     ['service', 'provider', 'api', 'ui'],
  // Service must not import provider implementations, api, or ui.
  // Tier 1 cannot distinguish interface imports from implementation imports,
  // so providers is listed here; use the allowlist to exempt legitimate
  // provider interface usage (e.g., IAuthProvider).
  service:  ['provider', 'api', 'ui'],
  provider: ['config', 'data', 'service', 'api', 'ui'],
  api:      ['ui'],
  // ui: top of stack — no forbidden imports
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
      // Resolve files from all canonical folders for this layer
      const files = (LAYER_FOLDERS[layer] || []).flatMap(f => glob.sync(`${f}/**/*.ts`));
      for (const file of files) {
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
    // Canonical namespace mapping per tech-stacks.md (.NET MVC)
    static readonly Dictionary<string, string[]> LayerNS = new() {
        ["Types"]    = new[]{ "MyApp.Domain", "MyApp.Contracts", "MyApp.Models" },
        ["Config"]   = new[]{ "MyApp.Configuration" },
        ["Data"]     = new[]{ "MyApp.Data", "MyApp.Infrastructure" },
        ["Service"]  = new[]{ "MyApp.Services" },
        ["Provider"] = new[]{ "MyApp.Providers" },
        ["Api"]      = new[]{ "MyApp.Controllers", "MyApp.Endpoints", "MyApp.Api" },
        ["UI"]       = new[]{ "MyApp.Views", "MyApp.Pages" },
    };

    // Complete forbidden-crossing matrix from layer-definitions.md
    static readonly Dictionary<string, string[]> Forbidden = new() {
        ["Types"]    = new[]{ "Config", "Data", "Service", "Provider", "Api", "UI" },
        ["Config"]   = new[]{ "Data", "Service", "Provider", "Api", "UI" },
        ["Data"]     = new[]{ "Service", "Provider", "Api", "UI" },
        ["Service"]  = new[]{ "Provider", "Api", "UI" },
        ["Provider"] = new[]{ "Config", "Data", "Service", "Api", "UI" },
        ["Api"]      = new[]{ "UI" },
        // UI: top of stack — no forbidden imports
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

# Canonical folder mapping per tech-stacks.md (Python + FastAPI)
LAYER_FOLDERS = {
    "types":    ["src/types", "app/types"],
    "config":   ["src/config", "app/config"],
    "data":     ["src/data", "repositories", "db", "models"],
    "service":  ["src/services", "services"],
    "provider": ["src/providers", "dependencies", "core"],
    "api":      ["src/api", "routers", "api"],
    "ui":       ["static"],
}

# Complete forbidden-crossing matrix from layer-definitions.md
FORBIDDEN = {
    "types":    ["config", "data", "service", "provider", "api", "ui"],
    "config":   ["data", "service", "provider", "api", "ui"],
    "data":     ["service", "provider", "api", "ui"],
    "service":  ["provider", "api", "ui"],
    "provider": ["config", "data", "service", "api", "ui"],
    "api":      ["ui"],
    # ui: top of stack — no forbidden imports
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

Zone rules must cover EVERY forbidden crossing from the matrix. Each `{ target, from }` pair
maps one entry in the FORBIDDEN matrix to the canonical folders for those layers.

**Flat config** — `eslint-layers.config.js`:

```javascript
import importX from 'eslint-plugin-import-x';

// Complete forbidden-crossing zones derived from layer-definitions.md.
// target = the layer that must NOT import; from = the layer it must not import from.
// When a layer has multiple canonical folders, each folder needs its own zone entry.
const zones = [
  // Types must not import: config, data, service, provider, api, ui
  { target: './src/types',    from: './src/config',      message: 'types must not import config' },
  { target: './src/types',    from: './src/data',        message: 'types must not import data' },
  { target: './src/types',    from: './src/repositories', message: 'types must not import data' },
  { target: './src/types',    from: './src/db',          message: 'types must not import data' },
  { target: './src/types',    from: './src/services',    message: 'types must not import service' },
  { target: './src/types',    from: './src/providers',   message: 'types must not import provider' },
  { target: './src/types',    from: './src/plugins',     message: 'types must not import provider' },
  { target: './src/types',    from: './src/api',         message: 'types must not import api' },
  { target: './src/types',    from: './src/routes',      message: 'types must not import api' },
  { target: './src/types',    from: './src/handlers',    message: 'types must not import api' },
  { target: './src/types',    from: './src/ui',          message: 'types must not import ui' },

  // Config must not import: data, service, provider, api, ui
  { target: './src/config',   from: './src/data',        message: 'config must not import data' },
  { target: './src/config',   from: './src/repositories', message: 'config must not import data' },
  { target: './src/config',   from: './src/db',          message: 'config must not import data' },
  { target: './src/config',   from: './src/services',    message: 'config must not import service' },
  { target: './src/config',   from: './src/providers',   message: 'config must not import provider' },
  { target: './src/config',   from: './src/plugins',     message: 'config must not import provider' },
  { target: './src/config',   from: './src/api',         message: 'config must not import api' },
  { target: './src/config',   from: './src/routes',      message: 'config must not import api' },
  { target: './src/config',   from: './src/handlers',    message: 'config must not import api' },
  { target: './src/config',   from: './src/ui',          message: 'config must not import ui' },

  // Data must not import: service, provider, api, ui
  { target: './src/data',        from: './src/services',  message: 'data must not import service' },
  { target: './src/repositories', from: './src/services', message: 'data must not import service' },
  { target: './src/db',          from: './src/services',  message: 'data must not import service' },
  { target: './src/data',        from: './src/providers', message: 'data must not import provider' },
  { target: './src/repositories', from: './src/providers', message: 'data must not import provider' },
  { target: './src/db',          from: './src/providers', message: 'data must not import provider' },
  { target: './src/data',        from: './src/plugins',   message: 'data must not import provider' },
  { target: './src/repositories', from: './src/plugins',  message: 'data must not import provider' },
  { target: './src/db',          from: './src/plugins',   message: 'data must not import provider' },
  { target: './src/data',        from: './src/api',       message: 'data must not import api' },
  { target: './src/repositories', from: './src/api',      message: 'data must not import api' },
  { target: './src/db',          from: './src/api',       message: 'data must not import api' },
  { target: './src/data',        from: './src/routes',    message: 'data must not import api' },
  { target: './src/repositories', from: './src/routes',   message: 'data must not import api' },
  { target: './src/db',          from: './src/routes',    message: 'data must not import api' },
  { target: './src/data',        from: './src/handlers',  message: 'data must not import api' },
  { target: './src/repositories', from: './src/handlers', message: 'data must not import api' },
  { target: './src/db',          from: './src/handlers',  message: 'data must not import api' },
  { target: './src/data',        from: './src/ui',        message: 'data must not import ui' },
  { target: './src/repositories', from: './src/ui',       message: 'data must not import ui' },
  { target: './src/db',          from: './src/ui',        message: 'data must not import ui' },

  // Service must not import: provider, api, ui
  { target: './src/services', from: './src/providers',    message: 'service must not import provider' },
  { target: './src/services', from: './src/plugins',      message: 'service must not import provider' },
  { target: './src/services', from: './src/api',          message: 'service must not import api' },
  { target: './src/services', from: './src/routes',       message: 'service must not import api' },
  { target: './src/services', from: './src/handlers',     message: 'service must not import api' },
  { target: './src/services', from: './src/ui',           message: 'service must not import ui' },

  // Provider must not import: config, data, service, api, ui
  { target: './src/providers', from: './src/config',      message: 'provider must not import config' },
  { target: './src/plugins',   from: './src/config',      message: 'provider must not import config' },
  { target: './src/providers', from: './src/data',        message: 'provider must not import data' },
  { target: './src/plugins',   from: './src/data',        message: 'provider must not import data' },
  { target: './src/providers', from: './src/repositories', message: 'provider must not import data' },
  { target: './src/plugins',   from: './src/repositories', message: 'provider must not import data' },
  { target: './src/providers', from: './src/db',          message: 'provider must not import data' },
  { target: './src/plugins',   from: './src/db',          message: 'provider must not import data' },
  { target: './src/providers', from: './src/services',    message: 'provider must not import service' },
  { target: './src/plugins',   from: './src/services',    message: 'provider must not import service' },
  { target: './src/providers', from: './src/api',         message: 'provider must not import api' },
  { target: './src/plugins',   from: './src/api',         message: 'provider must not import api' },
  { target: './src/providers', from: './src/routes',      message: 'provider must not import api' },
  { target: './src/plugins',   from: './src/routes',      message: 'provider must not import api' },
  { target: './src/providers', from: './src/handlers',    message: 'provider must not import api' },
  { target: './src/plugins',   from: './src/handlers',    message: 'provider must not import api' },
  { target: './src/providers', from: './src/ui',          message: 'provider must not import ui' },
  { target: './src/plugins',   from: './src/ui',          message: 'provider must not import ui' },

  // API must not import: ui
  { target: './src/api',      from: './src/ui',           message: 'api must not import ui' },
  { target: './src/routes',   from: './src/ui',           message: 'api must not import ui' },
  { target: './src/handlers', from: './src/ui',           message: 'api must not import ui' },
];

export default [{
  plugins: { 'import-x': importX },
  rules: { 'import-x/no-restricted-paths': ['error', { zones }] },
}];
```

**Legacy config** — `.eslintrc.layers.js` (extend from root: `"extends": ["./.eslintrc.layers.js"]`):

```javascript
// Same complete forbidden-crossing zones as flat config (see matrix above).
const zones = [
  // Types must not import: config, data, service, provider, api, ui
  { target: './src/types',    from: './src/config' },
  { target: './src/types',    from: './src/data' },
  { target: './src/types',    from: './src/repositories' },
  { target: './src/types',    from: './src/db' },
  { target: './src/types',    from: './src/services' },
  { target: './src/types',    from: './src/providers' },
  { target: './src/types',    from: './src/plugins' },
  { target: './src/types',    from: './src/api' },
  { target: './src/types',    from: './src/routes' },
  { target: './src/types',    from: './src/handlers' },
  { target: './src/types',    from: './src/ui' },

  // Config must not import: data, service, provider, api, ui
  { target: './src/config',   from: './src/data' },
  { target: './src/config',   from: './src/repositories' },
  { target: './src/config',   from: './src/db' },
  { target: './src/config',   from: './src/services' },
  { target: './src/config',   from: './src/providers' },
  { target: './src/config',   from: './src/plugins' },
  { target: './src/config',   from: './src/api' },
  { target: './src/config',   from: './src/routes' },
  { target: './src/config',   from: './src/handlers' },
  { target: './src/config',   from: './src/ui' },

  // Data must not import: service, provider, api, ui
  { target: './src/data',        from: './src/services' },
  { target: './src/repositories', from: './src/services' },
  { target: './src/db',          from: './src/services' },
  { target: './src/data',        from: './src/providers' },
  { target: './src/repositories', from: './src/providers' },
  { target: './src/db',          from: './src/providers' },
  { target: './src/data',        from: './src/plugins' },
  { target: './src/repositories', from: './src/plugins' },
  { target: './src/db',          from: './src/plugins' },
  { target: './src/data',        from: './src/api' },
  { target: './src/repositories', from: './src/api' },
  { target: './src/db',          from: './src/api' },
  { target: './src/data',        from: './src/routes' },
  { target: './src/repositories', from: './src/routes' },
  { target: './src/db',          from: './src/routes' },
  { target: './src/data',        from: './src/handlers' },
  { target: './src/repositories', from: './src/handlers' },
  { target: './src/db',          from: './src/handlers' },
  { target: './src/data',        from: './src/ui' },
  { target: './src/repositories', from: './src/ui' },
  { target: './src/db',          from: './src/ui' },

  // Service must not import: provider, api, ui
  { target: './src/services', from: './src/providers' },
  { target: './src/services', from: './src/plugins' },
  { target: './src/services', from: './src/api' },
  { target: './src/services', from: './src/routes' },
  { target: './src/services', from: './src/handlers' },
  { target: './src/services', from: './src/ui' },

  // Provider must not import: config, data, service, api, ui
  { target: './src/providers', from: './src/config' },
  { target: './src/plugins',   from: './src/config' },
  { target: './src/providers', from: './src/data' },
  { target: './src/plugins',   from: './src/data' },
  { target: './src/providers', from: './src/repositories' },
  { target: './src/plugins',   from: './src/repositories' },
  { target: './src/providers', from: './src/db' },
  { target: './src/plugins',   from: './src/db' },
  { target: './src/providers', from: './src/services' },
  { target: './src/plugins',   from: './src/services' },
  { target: './src/providers', from: './src/api' },
  { target: './src/plugins',   from: './src/api' },
  { target: './src/providers', from: './src/routes' },
  { target: './src/plugins',   from: './src/routes' },
  { target: './src/providers', from: './src/handlers' },
  { target: './src/plugins',   from: './src/handlers' },
  { target: './src/providers', from: './src/ui' },
  { target: './src/plugins',   from: './src/ui' },

  // API must not import: ui
  { target: './src/api',      from: './src/ui' },
  { target: './src/routes',   from: './src/ui' },
  { target: './src/handlers', from: './src/ui' },
];

module.exports = { plugins: ['import'], rules: { 'import/no-restricted-paths': ['error', { zones }] } };
```

### .NET: ArchUnitNET

File: `Tests/Structural/ArchitectureTests.cs`

```csharp
using ArchUnitNET.Domain; using ArchUnitNET.Fluent; using ArchUnitNET.Loader;
using ArchUnitNET.xUnit; using Xunit;
using static ArchUnitNET.Fluent.ArchRuleDefinition;

public class ArchitectureTests {
    static readonly Architecture Arch = new ArchLoader().LoadAssemblies(
        typeof(MyApp.Domain.SomeEntity).Assembly,
        typeof(MyApp.Data.SomeRepo).Assembly,
        typeof(MyApp.Services.SomeService).Assembly,
        typeof(MyApp.Api.SomeController).Assembly).Build();

    // Complete forbidden-crossing tests from layer-definitions.md.
    // Each test method enforces one row of the forbidden-crossing matrix.

    // Types must not import: Config, Data, Service, Provider, Api, UI
    [Fact] public void TypesMustNotDependOnAnything() =>
        Types().That().ResideInNamespace("MyApp.Domain")
               .Should().NotDependOnAny(
                   Types().That().ResideInNamespace("MyApp.Configuration")
                       .Or().ResideInNamespace("MyApp.Data")
                       .Or().ResideInNamespace("MyApp.Infrastructure")
                       .Or().ResideInNamespace("MyApp.Services")
                       .Or().ResideInNamespace("MyApp.Providers")
                       .Or().ResideInNamespace("MyApp.Controllers")
                       .Or().ResideInNamespace("MyApp.Endpoints")
                       .Or().ResideInNamespace("MyApp.Api")
                       .Or().ResideInNamespace("MyApp.Views")
                       .Or().ResideInNamespace("MyApp.Pages")).Check(Arch);

    // Config must not import: Data, Service, Provider, Api, UI
    [Fact] public void ConfigMustNotDependOnUpperLayers() =>
        Types().That().ResideInNamespace("MyApp.Configuration")
               .Should().NotDependOnAny(
                   Types().That().ResideInNamespace("MyApp.Data")
                       .Or().ResideInNamespace("MyApp.Infrastructure")
                       .Or().ResideInNamespace("MyApp.Services")
                       .Or().ResideInNamespace("MyApp.Providers")
                       .Or().ResideInNamespace("MyApp.Controllers")
                       .Or().ResideInNamespace("MyApp.Endpoints")
                       .Or().ResideInNamespace("MyApp.Api")
                       .Or().ResideInNamespace("MyApp.Views")
                       .Or().ResideInNamespace("MyApp.Pages")).Check(Arch);

    // Data must not import: Service, Provider, Api, UI
    [Fact] public void DataMustNotDependOnUpperLayers() =>
        Types().That().ResideInNamespace("MyApp.Data")
               .Or().ResideInNamespace("MyApp.Infrastructure")
               .Should().NotDependOnAny(
                   Types().That().ResideInNamespace("MyApp.Services")
                       .Or().ResideInNamespace("MyApp.Providers")
                       .Or().ResideInNamespace("MyApp.Controllers")
                       .Or().ResideInNamespace("MyApp.Endpoints")
                       .Or().ResideInNamespace("MyApp.Api")
                       .Or().ResideInNamespace("MyApp.Views")
                       .Or().ResideInNamespace("MyApp.Pages")).Check(Arch);

    // Service must not import: Provider (implementations), Api, UI
    [Fact] public void ServiceMustNotDependOnUpperLayers() =>
        Types().That().ResideInNamespace("MyApp.Services")
               .Should().NotDependOnAny(
                   Types().That().ResideInNamespace("MyApp.Providers")
                       .Or().ResideInNamespace("MyApp.Controllers")
                       .Or().ResideInNamespace("MyApp.Endpoints")
                       .Or().ResideInNamespace("MyApp.Api")
                       .Or().ResideInNamespace("MyApp.Views")
                       .Or().ResideInNamespace("MyApp.Pages")).Check(Arch);

    // Provider must not import: Config, Data, Service, Api, UI
    [Fact] public void ProviderMustNotDependOnOtherLayers() =>
        Types().That().ResideInNamespace("MyApp.Providers")
               .Should().NotDependOnAny(
                   Types().That().ResideInNamespace("MyApp.Configuration")
                       .Or().ResideInNamespace("MyApp.Data")
                       .Or().ResideInNamespace("MyApp.Infrastructure")
                       .Or().ResideInNamespace("MyApp.Services")
                       .Or().ResideInNamespace("MyApp.Controllers")
                       .Or().ResideInNamespace("MyApp.Endpoints")
                       .Or().ResideInNamespace("MyApp.Api")
                       .Or().ResideInNamespace("MyApp.Views")
                       .Or().ResideInNamespace("MyApp.Pages")).Check(Arch);

    // Api must not import: UI
    [Fact] public void ApiMustNotDependOnUI() =>
        Types().That().ResideInNamespace("MyApp.Controllers")
               .Or().ResideInNamespace("MyApp.Endpoints")
               .Or().ResideInNamespace("MyApp.Api")
               .Should().NotDependOnAny(
                   Types().That().ResideInNamespace("MyApp.Views")
                       .Or().ResideInNamespace("MyApp.Pages")).Check(Arch);
}
```

### Python: import-linter

Add to `pyproject.toml`:

```toml
[tool.importlinter]
root_packages = ["app"]

# Sequential layer chain: types → config → data → service → api → ui
# The layers contract enforces that each layer only imports from layers below it.
# Providers are excluded here because they are lateral (not strictly hierarchical).
[[tool.importlinter.contracts]]
name = "layer hierarchy"
type = "layers"
layers = ["app.static", "app.routers", "app.services", "app.repositories", "app.config", "app.types"]

# Provider isolation: providers must only depend on types (interfaces)
[[tool.importlinter.contracts]]
name = "providers must not import config"
type = "forbidden"
source_modules = ["app.providers", "app.dependencies", "app.core"]
forbidden_modules = ["app.config"]

[[tool.importlinter.contracts]]
name = "providers must not import data"
type = "forbidden"
source_modules = ["app.providers", "app.dependencies", "app.core"]
forbidden_modules = ["app.repositories", "app.db", "app.models"]

[[tool.importlinter.contracts]]
name = "providers must not import service"
type = "forbidden"
source_modules = ["app.providers", "app.dependencies", "app.core"]
forbidden_modules = ["app.services"]

[[tool.importlinter.contracts]]
name = "providers must not import api"
type = "forbidden"
source_modules = ["app.providers", "app.dependencies", "app.core"]
forbidden_modules = ["app.routers", "app.api"]

[[tool.importlinter.contracts]]
name = "providers must not import ui"
type = "forbidden"
source_modules = ["app.providers", "app.dependencies", "app.core"]
forbidden_modules = ["app.static"]

# Other layers must not import provider implementations
# (provider interfaces are received via DI, not direct import)
[[tool.importlinter.contracts]]
name = "service must not import provider implementations"
type = "forbidden"
source_modules = ["app.services"]
forbidden_modules = ["app.providers", "app.dependencies", "app.core"]

[[tool.importlinter.contracts]]
name = "data must not import provider implementations"
type = "forbidden"
source_modules = ["app.repositories", "app.db", "app.models"]
forbidden_modules = ["app.providers", "app.dependencies", "app.core"]
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
