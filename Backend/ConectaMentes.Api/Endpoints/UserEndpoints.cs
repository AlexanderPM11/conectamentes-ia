using System.Security.Claims;
using ConectaMentes.Api.Auth;
using ConectaMentes.Application.Auth;
using ConectaMentes.Infrastructure;
using ConectaMentes.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;

namespace ConectaMentes.Api.Endpoints;

public static class UserEndpoints
{
    public static IEndpointRouteBuilder MapUserEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var users = endpoints.MapGroup("/api/usuarios").WithTags("Usuarios");

        users.MapGet("/me", async (ClaimsPrincipal principal, [FromServices] IAuthService service, CancellationToken ct) =>
        {
            var idValue = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? principal.FindFirstValue("sub");
            return Guid.TryParse(idValue, out var id) && await service.GetProfileAsync(id, ct) is { } profile ? Results.Ok(profile) : Results.NotFound();
        }).RequireAuthorization().WithName("GetCurrentUser").WithOpenApi();

        users.MapGet("/{id:guid}/avatar", async (Guid id, ClaimsPrincipal principal, [FromServices] ConectaMentesDbContext db, [FromServices] ProfileAvatarStorage avatars, CancellationToken ct) =>
        {
            var user = await db.Users.SingleOrDefaultAsync(item => item.Id == id, ct);
            if (user?.AvatarPath is null) return Results.NotFound();
            var path = avatars.Resolve(user.AvatarPath);
            return File.Exists(path) ? Results.File(path, GetAvatarContentType(user.AvatarPath)) : Results.NotFound();
        }).RequireAuthorization().WithName("GetUserAvatar").WithOpenApi();

        users.MapGet("/conectados", ([FromServices] IUserTracker tracker) => Results.Ok(tracker.GetOnlineUsers())).RequireAuthorization().WithName("GetOnlineUsers").WithOpenApi();

        return endpoints;
    }

    private static string GetAvatarContentType(string path)
    {
        if (path.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase) || path.EndsWith(".jpeg", StringComparison.OrdinalIgnoreCase)) return "image/jpeg";
        if (path.EndsWith(".png", StringComparison.OrdinalIgnoreCase)) return "image/png";
        if (path.EndsWith(".webp", StringComparison.OrdinalIgnoreCase)) return "image/webp";
        return "application/octet-stream";
    }
}
