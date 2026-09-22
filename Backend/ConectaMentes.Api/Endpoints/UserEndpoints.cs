using System.Security.Claims;
using ConectaMentes.Api.Auth;
using ConectaMentes.Application.Auth;
using ConectaMentes.Domain.Entities;
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

        users.MapGet("/{id:guid}/perfil", async (Guid id, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db, CancellationToken ct) =>
        {
            var user = await db.Users.SingleOrDefaultAsync(item => item.Id == id, ct);
            if (user is null) return Results.NotFound();

            var skills = await db.SkillProfiles.Where(s => s.UserId == id && s.Visible).ToListAsync(ct);
            var availability = await db.Availabilities.SingleOrDefaultAsync(a => a.UserId == id, ct);
            var badges = await db.Recognitions.Where(r => r.UserId == id).Select(r => r.Type).ToListAsync(ct);
            
            var ratings = await db.Ratings.Where(r => r.EvaluatedUserId == id).ToListAsync(ct);
            var ratingAverage = ratings.Count > 0 
                ? ratings.Average(r => (r.Usefulness + r.Respect + r.Fulfillment + r.Clarity) / 4.0) 
                : 0.0;
            var viewerId = ApiIdentity.UserId(p);
            var activeConnection = await db.Connections
                .Where(connection => connection.Status == ConnectionStatus.Activa &&
                    ((connection.RequesterId == viewerId && connection.CollaboratorId == id) ||
                     (connection.CollaboratorId == viewerId && connection.RequesterId == id)))
                .OrderByDescending(connection => connection.RequestId != null)
                .FirstOrDefaultAsync(ct);
            var myRating = activeConnection is null
                ? null
                : await db.Ratings.SingleOrDefaultAsync(rating => rating.ConnectionId == activeConnection.Id && rating.AuthorId == viewerId, ct);

            return Results.Ok(new {
                userId = user.Id,
                displayName = user.DisplayName,
                career = user.Career,
                academicTerm = user.AcademicTerm,
                ratingAverage,
                totalRatings = ratings.Count,
                badges,
                skills,
                availability,
                canRate = activeConnection is not null,
                isConnected = activeConnection is not null,
                activeConnectionId = activeConnection?.Id,
                myRating = myRating is null ? null : new { myRating.Id, myRating.Usefulness, myRating.Respect, myRating.Fulfillment, myRating.Clarity, myRating.Comment, myRating.CreatedAt }
            });
        }).RequireAuthorization().WithName("GetUserProfile").WithOpenApi();

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
