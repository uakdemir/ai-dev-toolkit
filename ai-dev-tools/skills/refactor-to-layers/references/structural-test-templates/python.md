# Structural Test Templates — Python

## Tier 1: Import-Scanning Tests

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

## Tier 3

Structural tests must run in CI before merge.
