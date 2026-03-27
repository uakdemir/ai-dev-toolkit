# Provider Patterns

A Provider is a lateral injection point: cross-cutting concerns enter a layer through a single interface, not scattered imports. Each Provider encapsulates one concern and is injected at the composition root.

## Interface Synthesis Rules

1. **Group by concern:** All call sites for the same cross-cutting concern are grouped together.
2. **Extract minimal operations:** Identify distinct operations performed (e.g., auth → `authenticate()`, `authorize()`, `getCurrentUser()`). Each becomes a method on the interface.
3. **Reuse existing types:** If the codebase already defines types used at call sites (e.g., `User`, `AuthToken`), reference them rather than inventing new types.
4. **Low-confidence fallback:** When call sites are too inconsistent, generate interface with `// TODO: consolidate — found N distinct patterns for [concern]. See strategy spec for details.` placeholder methods. List distinct patterns in strategy spec.
5. **Naming convention:** `I{ConcernName}Provider` (.NET), `{ConcernName}Provider` (TypeScript interface), `{ConcernName}Provider` (Python Protocol)

## Cross-Cutting Concern Detection

Scan for these patterns to identify Provider candidates:

- **Auth:** JWT verification, `[Authorize]` attributes, auth middleware, token checks
- **Logging:** `console.log`/`logger.*`/`ILogger` usage outside a centralized logger
- **Telemetry:** Metrics, tracing, span creation
- **Config access:** Direct `process.env` / `IConfiguration` reads outside Config layer
- **Error handling:** Try/catch patterns, error middleware

**Threshold:** A concern becomes a Provider candidate only if it appears in **3+ files across 2+ different layers**. Single-layer usage is local, not cross-cutting. Below-threshold concerns are noted in the strategy spec limitations section.

## Stack: Node.js + Fastify

TypeScript interface:

```typescript
export interface AuthProvider {
  authenticate(token: string): Promise<User>;
  authorize(user: User, permission: string): boolean;
  getCurrentUser(): Promise<User | null>;
}
```

Fastify plugin registration using `fastify-plugin`:

```typescript
import fp from 'fastify-plugin';

export default fp(async (fastify, opts) => {
  fastify.decorate('authProvider', opts.authProvider);
});
```

Alternative: awilix container registration:

```typescript
container.register({ authProvider: asClass(AuthProviderImpl).scoped() });
```

## Stack: .NET MVC

Interface:

```csharp
public interface IAuthProvider
{
    Task<User> AuthenticateAsync(string token);
    bool Authorize(User user, string permission);
    Task<User?> GetCurrentUserAsync();
}
```

DI registration extension:

```csharp
public static class AuthProviderExtensions
{
    public static IServiceCollection AddAuthProvider(this IServiceCollection services)
    {
        services.AddScoped<IAuthProvider, AuthProviderImpl>();
        return services;
    }
}
```

## Stack: Python + FastAPI

Protocol class:

```python
class AuthProvider(Protocol):
    def authenticate(self, token: str) -> User: ...
    def authorize(self, user: User, permission: str) -> bool: ...
    def get_current_user(self) -> User | None: ...
```

FastAPI Depends factory:

```python
def get_auth_provider() -> AuthProvider:
    return AuthProviderImpl()

@router.get("/protected")
async def protected(provider: AuthProvider = Depends(get_auth_provider)):
    ...
```

**Django and Flask:** Generate generic Protocol classes with a `# TODO: wire into [Django middleware / Flask extension]` comment.

## Naming Convention

| Stack | Pattern | Example |
|---|---|---|
| .NET | `I{ConcernName}Provider` | `IAuthProvider` |
| TypeScript | `{ConcernName}Provider` (interface) | `AuthProvider` |
| Python | `{ConcernName}Provider` (Protocol) | `AuthProvider` |
