# Linter Rule Mappings — convention-enforcer

Loaded at Step 9 (Generate Artifacts). Maps convention categories to specific
built-in linter rules per stack, with exact config insertion syntax.

Only built-in rules and rules from standard plugins (e.g., `eslint-plugin-import`,
`@typescript-eslint`) are listed here. No custom rules are generated.

---

## Marker Strategy

Every block inserted by convention-enforcer is tagged so it can be located,
updated, or removed without touching surrounding config.

| Config file type | Marker approach |
|---|---|
| JS/TS ESLint configs (`.eslintrc.js`, `.eslintrc.cjs`, `eslint.config.*`) | Inline comment `// convention-enforcer: {category}` immediately before the inserted rule block |
| JSON ESLint configs (`.eslintrc.json`) | Metadata key at the top level: `"_conventionEnforcer": { "{category}": ["rule1", "rule2"] }` — ESLint ignores unknown top-level keys |
| Ruff/TOML (`ruff.toml`, `pyproject.toml`) | Inline comment `# convention-enforcer: {category}` immediately before the inserted rule block |
| `.editorconfig` | Inline comment `# convention-enforcer: {category}` immediately before the inserted rule block |

---

## ESLint Config Format Detection

Determine the config format before generating insertion syntax.

| File pattern | Format | Rules location |
|---|---|---|
| `eslint.config.js`, `eslint.config.mjs`, `eslint.config.ts` | Flat config | `export default [{ rules: { ... } }]` |
| `.eslintrc.js`, `.eslintrc.cjs`, `.eslintrc.yml`, `.eslintrc.yaml`, `.eslintrc.json` | Legacy config | `"rules": { ... }` |

If both formats are detected in the same project, trigger the mismatch gate
before proceeding.

---

## Category → Rule Mappings

The following 4 categories route to `linter_rule` (fully or as part of a hybrid
routing). Each section shows the rules and the exact insertion syntax per stack.

---

### Error Handling (hybrid: linter portion)

#### ESLint rules

```
no-throw-literal
@typescript-eslint/no-throw-literal
no-empty  [with allowEmptyCatch: false]
```

**Legacy JSON (`.eslintrc.json`) insertion:**

```json
"_conventionEnforcer": { "error-handling": ["no-throw-literal", "@typescript-eslint/no-throw-literal", "no-empty"] },
"rules": {
  // convention-enforcer: error-handling
  "no-throw-literal": "error",
  "@typescript-eslint/no-throw-literal": "error",
  "no-empty": ["error", { "allowEmptyCatch": false }]
}
```

**Flat config (`eslint.config.js`) insertion:**

```js
// convention-enforcer: error-handling
{
  rules: {
    "no-throw-literal": "error",
    "@typescript-eslint/no-throw-literal": "error",
    "no-empty": ["error", { allowEmptyCatch: false }],
  },
},
```

#### Ruff rules

```
E722  bare-except
B904  raise-without-from-inside-except
TRY003  raise-vanilla-args (long messages outside exception class)
```

**`ruff.toml` insertion:**

```toml
# convention-enforcer: error-handling
[lint]
select = ["E722", "B904", "TRY003"]
```

**`pyproject.toml` insertion (under `[tool.ruff.lint]`):**

```toml
# convention-enforcer: error-handling
[tool.ruff.lint]
select = ["E722", "B904", "TRY003"]
```

#### Roslyn rules

```
CA2200  rethrow-to-preserve-stack-details
CA1031  do-not-catch-general-exception-types
```

**`.editorconfig` insertion:**

```ini
# convention-enforcer: error-handling
dotnet_diagnostic.CA2200.severity = warning
dotnet_diagnostic.CA1031.severity = warning
```

---

### Naming Conventions

#### ESLint rules

```
@typescript-eslint/naming-convention
```

Example config enforcing camelCase for functions and PascalCase for classes:

**Legacy JSON (`.eslintrc.json`) insertion:**

```json
"_conventionEnforcer": { "naming-conventions": ["@typescript-eslint/naming-convention"] },
"rules": {
  // convention-enforcer: naming-conventions
  "@typescript-eslint/naming-convention": [
    "error",
    { "selector": "function", "format": ["camelCase"] },
    { "selector": "class", "format": ["PascalCase"] }
  ]
}
```

**Flat config (`eslint.config.js`) insertion:**

```js
// convention-enforcer: naming-conventions
{
  rules: {
    "@typescript-eslint/naming-convention": [
      "error",
      { selector: "function", format: ["camelCase"] },
      { selector: "class", format: ["PascalCase"] },
    ],
  },
},
```

#### Ruff rules

```
N801  invalid-class-name
N802  invalid-function-name
N803  invalid-argument-name
N804  invalid-first-argument-name-for-class-method
N805  invalid-first-argument-name-for-method
N806  non-lowercase-variable-in-function
```

**`ruff.toml` insertion:**

```toml
# convention-enforcer: naming-conventions
[lint]
select = ["N801", "N802", "N803", "N804", "N805", "N806"]
```

**`pyproject.toml` insertion (under `[tool.ruff.lint]`):**

```toml
# convention-enforcer: naming-conventions
[tool.ruff.lint]
select = ["N801", "N802", "N803", "N804", "N805", "N806"]
```

#### Roslyn rules

Naming rules are enforced via `.editorconfig` naming rule triplets
(`dotnet_naming_rule`, `dotnet_naming_symbols`, `dotnet_naming_style`).

**`.editorconfig` insertion:**

```ini
# convention-enforcer: naming-conventions
dotnet_naming_rule.methods_should_be_pascal_case.severity = warning
dotnet_naming_rule.methods_should_be_pascal_case.symbols = method_symbols
dotnet_naming_rule.methods_should_be_pascal_case.style = pascal_case_style

dotnet_naming_symbols.method_symbols.applicable_kinds = method
dotnet_naming_symbols.method_symbols.applicable_accessibilities = *

dotnet_naming_style.pascal_case_style.capitalization = pascal_case

dotnet_naming_rule.private_fields_should_be_camel_case.severity = warning
dotnet_naming_rule.private_fields_should_be_camel_case.symbols = private_field_symbols
dotnet_naming_rule.private_fields_should_be_camel_case.style = camel_case_style

dotnet_naming_symbols.private_field_symbols.applicable_kinds = field
dotnet_naming_symbols.private_field_symbols.applicable_accessibilities = private

dotnet_naming_style.camel_case_style.capitalization = camel_case
```

---

### Import Ordering

#### ESLint rules

```
import/order  (requires eslint-plugin-import)
```

**Legacy JSON (`.eslintrc.json`) insertion:**

```json
"_conventionEnforcer": { "import-ordering": ["import/order"] },
"rules": {
  // convention-enforcer: import-ordering
  "import/order": [
    "error",
    {
      "groups": ["builtin", "external", "internal", "parent", "sibling", "index"],
      "newlines-between": "always",
      "alphabetize": { "order": "asc", "caseInsensitive": true }
    }
  ]
}
```

**Flat config (`eslint.config.js`) insertion:**

```js
// convention-enforcer: import-ordering
{
  rules: {
    "import/order": [
      "error",
      {
        groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
        "newlines-between": "always",
        alphabetize: { order: "asc", caseInsensitive: true },
      },
    ],
  },
},
```

#### Ruff rules

```
I001  unsorted-imports (isort)
```

**`ruff.toml` insertion:**

```toml
# convention-enforcer: import-ordering
[lint]
select = ["I001"]
```

**`pyproject.toml` insertion (under `[tool.ruff.lint]`):**

```toml
# convention-enforcer: import-ordering
[tool.ruff.lint]
select = ["I001"]
```

#### Roslyn rules

Import ordering in C# is controlled via `.editorconfig` directives.

**`.editorconfig` insertion:**

```ini
# convention-enforcer: import-ordering
dotnet_sort_system_directives_first = true
dotnet_separate_import_directive_groups = true
```

---

### Logging

#### ESLint rules

```
no-console  [with allow: ["warn", "error"]]
```

**Legacy JSON (`.eslintrc.json`) insertion:**

```json
"_conventionEnforcer": { "logging": ["no-console"] },
"rules": {
  // convention-enforcer: logging
  "no-console": ["warn", { "allow": ["warn", "error"] }]
}
```

**Flat config (`eslint.config.js`) insertion:**

```js
// convention-enforcer: logging
{
  rules: {
    "no-console": ["warn", { allow: ["warn", "error"] }],
  },
},
```

#### Ruff rules

```
T201  print  (print statement found)
T203  pprint  (pprint statement found)
```

**`ruff.toml` insertion:**

```toml
# convention-enforcer: logging
[lint]
select = ["T201", "T203"]
```

**`pyproject.toml` insertion (under `[tool.ruff.lint]`):**

```toml
# convention-enforcer: logging
[tool.ruff.lint]
select = ["T201", "T203"]
```

#### Roslyn rules

Roslyn does not ship a built-in logging rule equivalent. `CA2153` covers
catching `ThreadAbortException` (unrelated to logger usage). If the project
uses a custom analyzer (e.g., a Roslyn diagnostic for logger-only output),
insert its diagnostic ID using the same `.editorconfig` pattern:

```ini
# convention-enforcer: logging
dotnet_diagnostic.{DIAGNOSTIC_ID}.severity = warning
```

No built-in Roslyn rule is inserted by default for this category.

---

## Conflict Detection

Before inserting any rule block, perform these checks:

1. **Same rule already configured:** If the rule already appears in the config
   (with any severity), skip insertion and report it as pre-existing. Do not
   overwrite user-configured values.

2. **Contradicting rules present:** If a rule that directly contradicts the
   rule to be inserted is already configured (e.g., `no-console: "off"` when
   inserting `no-console: "warn"`), stop and ask the user how to resolve before
   modifying the file.

Report all skipped and conflicting rules in the artifact summary so the user
is aware of what was and was not changed.

---

## "Other" Stack

No linter rules are generated for unrecognized stacks. The rule mappings in
this file cover only the three supported stacks (Node.js/ESLint, Python/Ruff,
.NET/Roslyn). When the stack is "Other", the agent produces a violations report
only. The user is responsible for manually translating violations into rules for
their linter.

Explanation to surface to the user:
"Linter rules are only generated for supported stacks (Node.js + ESLint,
Python + Ruff, .NET + Roslyn). Add linter rules manually based on the
violations report."
