# Structural Test Templates — .NET

## Tier 1: Import-Scanning Tests

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

## Tier 2: Framework-Specific Enforcement

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

## Tier 3

Structural tests must run in CI before merge.
