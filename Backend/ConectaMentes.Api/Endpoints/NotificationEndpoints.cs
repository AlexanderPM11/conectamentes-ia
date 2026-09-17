using System.Security.Claims;
using ConectaMentes.Api.Auth;
using ConectaMentes.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace ConectaMentes.Api.Endpoints;

public static class NotificationEndpoints
{
    public static IEndpointRouteBuilder MapNotificationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var notifications = endpoints.MapGroup("/api/notificaciones").RequireAuthorization().WithTags("Notificaciones");
        
        notifications.MapGet("", async (ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => 
            Results.Ok(await db.Notifications.Where(x => x.UserId == ApiIdentity.UserId(p)).OrderByDescending(x => x.CreatedAt).Take(60).Select(x => new { x.Id, x.Type, x.Title, x.Body, x.ReferenceId, x.IsRead, x.CreatedAt }).ToListAsync()));
            
        notifications.MapPost("/{id:guid}/leer", async (Guid id, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) =>
        {
            var item = await db.Notifications.SingleOrDefaultAsync(x => x.Id == id && x.UserId == ApiIdentity.UserId(p));
            if (item is null) return Results.NotFound();
            item.IsRead = true;
            await db.SaveChangesAsync();
            return Results.Ok(NotificationHelpers.NotificationView(item));
        });
        
        notifications.MapPost("/leer-todas", async (ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) =>
        {
            await db.Notifications.Where(x => x.UserId == ApiIdentity.UserId(p) && !x.IsRead).ExecuteUpdateAsync(setters => setters.SetProperty(x => x.IsRead, true));
            return Results.NoContent();
        });

        return endpoints;
    }
}
