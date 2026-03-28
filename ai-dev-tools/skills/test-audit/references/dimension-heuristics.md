# Dimension Heuristics Reference

Per-dimension detection patterns for the 4 analysis agents. Each agent loads only its own
section. All findings must conform to the schema in `references/finding-schema.md`.

---

## Coverage Gaps

Agent 1 reads source files and the test-to-source map. It does NOT read test file contents.

### Module-Level Coverage

For each source file, check the test-to-source map. If a source file has zero mapped tests,
emit an `untested-module` finding.

Risk scoring for untested modules:
- Files in `services/`, `handlers/`, `controllers/`, `routers/` → risk 4-5
- Files in `utils/`, `helpers/`, `lib/` → risk 2-3
- Files in `types/`, `constants/`, `config/` → risk 1

### Function-Level Coverage

For each source file that HAS a mapped test, scan the source file for exported functions,
classes, and methods:

**Node.js:** `export function`, `export const`, `export class`, `export default`
**Python:** Top-level `def` and `class` definitions (not prefixed with `_`)
**.NET:** `public` methods and classes

Then check whether the mapped test file(s) reference each exported symbol by name (as a call
expression, not just an import). A test "references" a function if the function name appears
as a call: `functionName(`, `instance.methodName(`, `ClassName.methodName(`.

Import-only does not count as coverage. Emit `untested-function` for unreferenced exports.

### Endpoint Coverage

Detect API endpoints:

**Node.js (Fastify):** `fastify.get(`, `fastify.post(`, `app.get(`, `app.post(`, route
definitions in `*.route.ts` / `*.routes.ts`
**Python (FastAPI):** `@app.get(`, `@router.get(`, `@app.post(`, `@router.post(`
**.NET:** `[HttpGet]`, `[HttpPost]`, `app.MapGet(`, `app.MapPost(`

For each endpoint, check if any test file contains a reference to that route path or uses
`fastify.inject()` / `TestClient` / `WebApplicationFactory` to hit it.

Emit `untested-endpoint` for endpoints with no test. Default risk: 4.

### Fix Patterns

- **untested-module:** Generate a test file skeleton with describe/it blocks (Node.js), test class (`.NET`), or test functions (Python) for each exported function/class.
- **untested-function:** Add a test case in the existing mapped test file targeting the untested export. Include `TODO: verify` on assertions requiring domain knowledge.
- **untested-endpoint:** Generate an API test using the stack's test client: `fastify.inject()` (Node.js), `TestClient` (Python/FastAPI), `WebApplicationFactory` (.NET). Cover success + one error case.

---

## Assertion Quality

Agent 2 reads test files only. This is a composite agent covering 3 sub-concerns.

### Weak Assertions

Scan test files for assertion patterns that check existence/type but not value:

**Node.js (Jest/Vitest):**
- `expect(…).toBeDefined()` — weak, should check actual value
- `expect(…).toBeTruthy()` — weak unless checking a boolean
- `expect(…).not.toBeNull()` — weak, should check actual value
- `expect(…).toBeInstanceOf(…)` without subsequent value check — weak

**Python (pytest):**
- `assert result is not None` — weak
- `assert isinstance(result, …)` without value check — weak
- `assert result` (truthy check only) — weak unless checking boolean
- `assert len(result) > 0` without checking contents — weak

**.NET (xUnit):**
- `Assert.NotNull(…)` without subsequent value assertion — weak
- `Assert.IsType<…>(…)` without value check — weak
- `Assert.True(result != null)` — weak

Risk: 2-3 depending on what's being tested. Effort: 1.

### Zero Assertions

Tests with a body that calls production code but contains no assertion statement.

Detection: a test function/method body that contains zero occurrences of:
- `expect(`, `assert`, `Assert.`, `Should.`, `.should`, `pytest.raises`

Risk: 3. Effort: 2.

### Excessive Mocking

Tests with >3 mock/stub/spy declarations in a single test function:

**Node.js:** `jest.mock(`, `vi.mock(`, `jest.spyOn(`, `vi.spyOn(`, `jest.fn(`, `vi.fn(`
**Python:** `@patch(`, `mock.patch(`, `MagicMock(`, `Mock(`
**.NET:** `Mock<`, `Substitute.For<`, `A.Fake<`

Count per test function. If >3, emit `excessive-mocking`. Risk: 3. Effort: 3.

### Implementation Coupling

Tests that assert on internal behavior rather than outcomes:

- `toHaveBeenCalledTimes(` / `assert_called_once_with(` / `Received(N)` — coupling to call count
- Assertions on exact log messages (`console.log`, `logger.info`)
- Assertions on internal state variables (private fields, internal counters)

Risk: 2. Effort: 2.

### Duplicate Coverage

Multiple tests in the same file asserting the exact same expression on the same function call.
Detection: if two or more test functions contain identical assertion lines (excluding setup),
emit `duplicate-coverage`.

Risk: 1. Effort: 1.

### Duplicate Setup

Identical setup code appearing in 3+ test functions within the same file without a shared
fixture, factory, or `beforeEach`/`setUp` block.

Detection: extract the pre-assertion lines from each test function. If 3+ tests share 3+
identical lines of setup code, emit `duplicate-setup`.

Risk: 2. Effort: 3.

### Oversized Test File

Test files exceeding 500 lines.

Detection: `wc -l` on each test file. If >500, emit `oversized-test-file`.

Risk: 1. Effort: 4. (Informational-only — no auto-fix offered.)

### Missing Fixtures

The same entity/object is constructed with identical parameters in 3+ test functions without
a shared factory or fixture.

Detection: if the same constructor call (e.g., `new User({...})`, `User(name="...")`,
`new UserBuilder().Build()`) appears in 3+ tests, emit `missing-fixtures`.

Risk: 1. Effort: 3. (Informational-only — no auto-fix offered.)

### Inconsistent Naming

Mixed test naming conventions within the same test directory:

- Mix of `*.test.ts` and `*.spec.ts`
- Mix of `test_*.py` and `*_test.py`
- Mix of `*Tests.cs` and `*Test.cs`

Detection: count files matching each convention pattern. If both patterns are used,
emit `inconsistent-naming`.

Risk: 1. Effort: 3. (Informational-only — no auto-fix offered. Requires renaming files and potentially updating imports.)

### Fix Patterns

- **weak-assertion:** Replace existence checks with value checks. E.g., `expect(result).toBeDefined()` → `expect(result).toEqual(expectedValue)`.
- **zero-assertions:** Add meaningful assertions based on the function being called. Include `TODO: verify` comment.
- **excessive-mocking:** Flag for manual review — reducing mocks requires architectural understanding.
- **implementation-coupling:** Replace call-count assertions with outcome assertions. E.g., replace `toHaveBeenCalledTimes(1)` with an assertion on the visible effect.
- **duplicate-coverage:** Flag for manual removal — agent cannot determine which duplicate to keep.
- **duplicate-setup:** Extract common setup into a shared fixture: pytest `conftest.py` fixtures, Jest `beforeEach` with shared helper, xUnit `IClassFixture<T>`.
- **oversized-test-file / missing-fixtures / inconsistent-naming:** Informational-only, no auto-fix.

---

## Flakiness Signals

Agent 3 reads test files only. All detection is static — no test execution.

### Timing Dependencies

Patterns per stack:

**Node.js:** `setTimeout(`, `setInterval(`, `Date.now()`, `new Date()` in assertions,
`performance.now()`, hardcoded `await new Promise(resolve => setTimeout(resolve, N))`

**Python:** `time.sleep(`, `time.time()`, `datetime.now()`, `datetime.utcnow()`,
`asyncio.sleep(` with hardcoded values

**.NET:** `Thread.Sleep(`, `Task.Delay(`, `DateTime.Now`, `DateTime.UtcNow`,
`Stopwatch` in assertions

Risk: 3. Effort: 2.

### Shared Mutable State

Module-level or class-level variables that are mutated inside test functions without
being reset between tests.

Detection:
1. Find variables declared at module/class level (outside test functions)
2. Check if any test function writes to them (assignment, `.append(`, `.push(`, etc.)
3. Check if there is a `beforeEach`/`setUp`/constructor that resets the variable

If mutated without reset, emit `shared-mutable-state`. Risk: 4. Effort: 2.

### Missing Cleanup

Tests that modify state in setup but have no corresponding teardown:

- `beforeEach` without `afterEach` (Node.js)
- `setUp` without `tearDown` (Python unittest)
- `IAsyncLifetime.InitializeAsync` without `DisposeAsync` (.NET)
- File creation in tests without cleanup
- Database writes in tests without rollback/cleanup

Risk: 3. Effort: 2.

### Non-Deterministic Inputs

Random or time-based values used in test assertions:

**Node.js:** `Math.random()`, `crypto.randomUUID()`, `Date.now()` used as test input
**Python:** `random.randint(`, `random.choice(`, `uuid.uuid4()`, `datetime.now()`
**.NET:** `Guid.NewGuid()`, `Random().Next(`, `DateTime.Now`

Only flag when these appear in assertion comparisons or as expected values, not when used
in setup with the value captured for later comparison.

Risk: 3. Effort: 2.

### Order Dependency

Tests that reference other test names, depend on execution order, or use shared state
without isolation:

- Test names referencing other tests (e.g., `test_after_create`)
- `@pytest.mark.order` or similar ordering decorators
- Tests that only pass when run together but fail in isolation

Static detection: look for ordering markers and cross-test name references.

Risk: 4. Effort: 3.

### Uncontrolled I/O

Tests performing file system or network operations without isolation:

- File writes to absolute paths (not temp directories)
- `fs.writeFileSync(`, `open(path, 'w')`, `File.WriteAllText(` outside temp dirs
- HTTP calls (`fetch(`, `requests.get(`, `HttpClient`) without mocking
- Database calls without test transaction or in-memory DB

Risk: 3. Effort: 3.

### Fix Patterns

- **timing-dependency:** Replace hardcoded waits with deterministic alternatives: fake timers (`jest.useFakeTimers()`, `freezegun`), event-based waiting, or dependency injection of clock.
- **shared-mutable-state:** Add reset in `beforeEach`/`setUp` or move state to per-test scope.
- **missing-cleanup:** Add corresponding `afterEach`/`tearDown`/`Dispose` that reverses the setup.
- **non-deterministic-input:** Replace random values with fixed seeds or inject deterministic values.
- **order-dependency / uncontrolled-io:** Flag for manual review — requires understanding test intent.

---

## Edge Cases

Agent 4 reads source files AND their corresponding test files (via test-to-source map).
This agent uses heuristic text matching, not AST analysis. Findings are advisory — false
positives are acceptable. The goal is surfacing likely gaps, not precision.

### Untested Branches

Scan source files for conditional patterns:

- `if (...) { ... } else { ... }` — check test file for both paths
- `switch (...) { case ... }` / `match` — check for tests covering multiple cases
- Ternary operators: `condition ? a : b`

For each branch, check whether the test file contains assertions that reference the branch
condition's variable or the else/error path. If the test file only exercises the happy path
(positive condition), emit `untested-branch`.

Risk: 3. Effort: 2-3.

### Missing Boundary Tests

Scan source files for comparison operators:

- `> 0`, `< 0`, `>= limit`, `<= max`, `== threshold`
- Array length checks: `.length > 0`, `len(x) == 0`

For each comparison, check whether the test file contains assertions at the boundary value
(at, one below, one above). If only one side is tested, emit `missing-boundary-test`.

Risk: 3. Effort: 2.

### Untested Error Paths

Scan source files for error handling patterns:

**Node.js:** `try { ... } catch (`, `.catch(`, `throw new Error(`
**Python:** `try: ... except`, `raise`, `pytest.raises` (check if tests use it)
**.NET:** `try { ... } catch (`, `throw new`, `Assert.Throws<`

For each error path in source, check if the corresponding test file contains an error-case
test (e.g., `pytest.raises`, `expect(...).toThrow()`, `Assert.Throws<>`).

If no error-case test exists, emit `untested-error-path`. Risk: 4. Effort: 2-3.

### Missing Null/Empty Tests

Scan source files for null/empty checks:

- `if (x == null)`, `if x is None`, `if (x == null)`
- `if (!x)`, `if not x`
- `if (list.length === 0)`, `if len(items) == 0`
- Optional parameters with defaults

For each check, verify the test file exercises the null/empty case.

Risk: 3. Effort: 2.

### Untested Guard Clauses

Scan source files for early returns:

- `if (condition) return;` / `if (condition) throw`
- `if not condition: raise` / `if not condition: return`
- Guard clauses at the top of functions

For each guard clause, check if any test triggers the early return path.

Risk: 3. Effort: 2.

### Fix Patterns

- **untested-branch:** Generate a test case that exercises the else/negative path. Include `TODO: verify` on the expected outcome.
- **missing-boundary-test:** Generate tests at the boundary value, one below, and one above. E.g., for `if (age >= 18)` → test with 17, 18, 19.
- **untested-error-path:** Generate a test using `expect(...).toThrow()` / `pytest.raises()` / `Assert.Throws<>()` for the error case.
- **missing-null-test:** Generate a test passing null/None/empty to the function and asserting the expected behavior.
- **untested-guard-clause:** Generate a test that triggers the guard condition and asserts the early return/throw behavior.
