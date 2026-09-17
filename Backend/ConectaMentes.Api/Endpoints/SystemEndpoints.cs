using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;

namespace ConectaMentes.Api.Endpoints;

public static class SystemEndpoints
{
    public static IEndpointRouteBuilder MapSystemEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapHealthChecks("/health").WithTags("System");
        endpoints.MapHub<RealtimeHub>("/hubs/realtime");
        endpoints.MapGet("/api/v1", () => Results.Ok(new
        {
            name = "ConectaMentes IA API",
            version = "v1",
            status = "ready"
        })).WithTags("System").WithOpenApi();

        return endpoints;
    }
}
