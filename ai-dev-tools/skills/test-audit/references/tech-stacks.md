# Tech Stacks Reference

Loaded after tech stack confirmation. Keyed by **backend** framework (like refactor-to-layers)
because test patterns, runner conventions, and assertion libraries are backend-specific.

---

## Stack: Node.js + Fastify

**Test runners:** Jest (default), Vitest, Mocha
**Assertion libraries:** `expect()` (Jest/Vitest built-in), `chai` (Mocha)

**Test file patterns:**
- `*.test.ts`, `*.spec.ts`
- `__tests__/**/*.ts`
- `*.test.js`, `*.spec.js`

**Test directory conventions:**
- `tests/` (project root)
- `__tests__/` (co-located)
- `src/**/__tests__/` (nested co-located)

**Test-to-source naming conventions:**
- `UserService.test.ts` → `UserService.ts`
- `user-service.spec.ts` → `user-service.ts`
- `__tests__/UserService.test.ts` → `../UserService.ts`

**Source file extensions:** `.ts`, `.js`, `.tsx`, `.jsx`

**Vendor/generated exclusions:** `node_modules/`, `dist/`, `build/`, `.next/`, `coverage/`

**Validation file:** `package.json`

**Fastify-specific test patterns:**
- Route tests often use `fastify.inject()` — these are API-level tests
- Plugin tests register via `fastify.register()` in test setup

**Express adaptation:** Same test file patterns and naming conventions. Route definitions use
`app.get()` / `router.get()` instead of `fastify.get()`. API tests use `supertest` instead
of `fastify.inject()`.

**NestJS adaptation:** Same patterns plus: `@nestjs/testing` module with `Test.createTestingModule()`.
Controller tests use `app.getHttpAdapter()`. E2e tests in `test/` directory by convention.

---

## Stack: .NET MVC

**Test runners:** xUnit (default), NUnit, MSTest
**Assertion libraries:** `Assert.*` (xUnit/NUnit/MSTest), `Should.*` (Shouldly), FluentAssertions

**Test file patterns:**
- `*Tests.cs`, `*Test.cs`
- Located in `*.Tests` or `*.UnitTests` projects

**Test directory conventions:**
- Separate test projects: `ProjectName.Tests/`, `ProjectName.UnitTests/`
- Mirror source project structure within test project

**Test-to-source naming conventions:**
- `UserServiceTests.cs` → `UserService.cs`
- `UserServiceTest.cs` → `UserService.cs`
- Test project `Foo.Tests/` mirrors source project `Foo/`

**Source file extensions:** `.cs`, `.razor`

**Vendor/generated exclusions:** `bin/`, `obj/`, `Migrations/`

**Validation files:** `.csproj`, `.sln`

**Minimal API adaptation:** When `app.MapGet()` / `app.MapPost()` patterns are detected instead
of controllers, test detection still applies — look for integration test files using
`WebApplicationFactory<T>`.

---

## Stack: Python + FastAPI

**Test runners:** pytest (default), unittest
**Assertion libraries:** `assert` (pytest built-in), `pytest.raises`, `unittest.mock`

**Test file patterns:**
- `test_*.py`
- `*_test.py`

**Test directory conventions:**
- `tests/` (project root)
- Co-located `test_*.py` alongside source files

**Test-to-source naming conventions:**
- `test_payment.py` → `payment.py`
- `test_payment_service.py` → `payment_service.py`
- `tests/test_payment.py` → `src/payment.py` or `app/payment.py`

**Source file extensions:** `.py`

**Vendor/generated exclusions:** `.venv/`, `__pycache__/`, `.mypy_cache/`, `*.egg-info/`

**Validation file:** `pyproject.toml`

**FastAPI-specific test patterns:**
- Tests using `TestClient` or `httpx.AsyncClient` are API-level tests
- Tests importing from `fastapi.testclient` indicate integration tests

**Django adaptation:** Same test file patterns. Tests use `django.test.TestCase` and
`django.test.Client` instead of `TestClient`. Test discovery via `python manage.py test`.
Fixtures use `fixtures = [...]` or `factory_boy`.

**Flask adaptation:** Same test file patterns. API tests use `app.test_client()`. Test
fixtures often use `@pytest.fixture` with `app.test_request_context()`.

---

## "Other" Stack Handling

When the user selects "Other," ask these **5** follow-up questions:

1. **Backend language/framework?** (e.g., Go/Gin, Java/Spring, Elixir/Phoenix, Rust/Axum)
2. **Frontend framework?** (e.g., React, Vue, Angular, HTMX, none)
3. **Test runner?** (e.g., go test, JUnit, ExUnit, cargo test)
4. **Assertion library?** (e.g., testify, AssertJ, built-in assert)
5. **Test file location?** (e.g., `*_test.go` co-located, `src/test/java/`, `test/`)

Do not load preset stack sections after "Other" is selected — derive test file patterns,
source extensions, and naming conventions from the answers directly.

For test-to-source mapping with "Other" stacks, rely on import analysis since naming
conventions may not match standard patterns.

---

## General Monorepo Detection

Walk from CWD toward the filesystem root; stop at the first matching signal.

| Stack   | Detection Files |
|---------|-----------------|
| Node.js | `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, or `package.json` with `"workspaces"` field |
| .NET    | `.sln` with multiple `.csproj` references, or `Directory.Build.props` |
| Python  | `pyproject.toml` with `[tool.uv.workspace]` section, or `uv.toml` with `[workspace]` section |
| Go      | `go.work` file |
| Rust    | `Cargo.toml` with `[workspace]` section |
| General | `rush.json`, `.moon/workspace.yml`, `pants.toml` |

If a workspace config is found in a parent directory, CWD is inside a monorepo package — scope
all test audit work to that package rather than the entire repo.
