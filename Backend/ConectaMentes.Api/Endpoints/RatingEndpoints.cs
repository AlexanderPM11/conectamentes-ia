using System.Security.Claims;
using ConectaMentes.Api.Auth;
using ConectaMentes.Domain.Entities;
using ConectaMentes.Infrastructure;
using ConectaMentes.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace ConectaMentes.Api.Endpoints;

public static class RatingEndpoints
{
    public static IEndpointRouteBuilder MapRatingEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var ratings = endpoints.MapGroup("/api/sesiones/{sessionId:guid}/valoraciones").RequireAuthorization().WithTags("Valoraciones");
        
        ratings.MapPost("", async (Guid sessionId, [FromBody] RatingInput input, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db, [FromServices] IHubContext<RealtimeHub> hub, [FromServices] DevicePushService devicePush) =>
        {
            var authorId = ApiIdentity.UserId(p);
            if (input.Usefulness is < 1 or > 5 || input.Respect is < 1 or > 5 || input.Fulfillment is < 1 or > 5 || input.Clarity is < 1 or > 5)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["rating"] = ["Cada calificación debe estar entre 1 y 5."] });
            if ((input.Comment?.Trim().Length ?? 0) > 500)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["comment"] = ["El comentario puede tener hasta 500 caracteres."] });
            var session = await db.Sessions.SingleOrDefaultAsync(x => x.Id == sessionId && x.Status == SessionStatus.Completada);
            if (session is null) return Results.NotFound();
            var connection = await db.Connections.SingleAsync(x => x.Id == session.ConnectionId);
            if (connection.RequesterId != authorId) return Results.Forbid();
            if (await db.Ratings.AnyAsync(x => x.SessionId == sessionId && x.AuthorId == authorId))
                return Results.Conflict(new { message = "Ya calificaste esta orientación." });
            var evaluated = connection.CollaboratorId;
            var rating = new Rating { SessionId = sessionId, AuthorId = authorId, EvaluatedUserId = evaluated, Usefulness = input.Usefulness, Respect = input.Respect, Fulfillment = input.Fulfillment, Clarity = input.Clarity, Comment = input.Comment?.Trim() ?? "" };
            var authorName = await db.Users.Where(x => x.Id == authorId).Select(x => x.DisplayName).SingleAsync();
            var notification = NotificationHelpers.NewNotification(evaluated, "comment", "Nueva valoración recibida", string.IsNullOrWhiteSpace(rating.Comment) ? $"{authorName} valoró la sesión compartida." : $"{authorName}: {rating.Comment}", connection.Id);
            db.AddRange(rating, notification);
            await db.SaveChangesAsync();
            await NotificationHelpers.PushNotification(notification, hub, devicePush);
            var count = await db.Ratings.CountAsync(x => x.EvaluatedUserId == evaluated);
            var avg = await db.Ratings.Where(x => x.EvaluatedUserId == evaluated).AverageAsync(x => (double)(x.Usefulness + x.Respect + x.Fulfillment + x.Clarity) / 4);
            if (count >= 3 && avg >= 4 && !await db.Recognitions.AnyAsync(x => x.UserId == evaluated)) { db.Add(new Recognition { UserId = evaluated, CriterionOrigin = "3 sesiones valoradas positivamente" }); await db.SaveChangesAsync(); }
            return Results.Created($"/api/sesiones/{sessionId}/valoraciones", rating);
        });

        var userRatings = endpoints.MapGroup("/api/usuarios/{id:guid}").RequireAuthorization().WithTags("Valoraciones");
        
        userRatings.MapGet("/reconocimientos", async (Guid id, [FromServices] ConectaMentesDbContext db) => Results.Ok(await db.Recognitions.Where(x => x.UserId == id).ToListAsync()));

        userRatings.MapPut("/valoracion", async (Guid id, [FromBody] RatingInput input, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db, [FromServices] IHubContext<RealtimeHub> hub, [FromServices] DevicePushService devicePush) =>
        {
            var authorId = ApiIdentity.UserId(p);
            if (authorId == id) return Results.BadRequest(new { message = "No puedes calificarte a ti mismo." });
            if (input.Usefulness is < 1 or > 5 || input.Respect is < 1 or > 5 || input.Fulfillment is < 1 or > 5 || input.Clarity is < 1 or > 5)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["rating"] = ["Cada calificación debe estar entre 1 y 5."] });
            if ((input.Comment?.Trim().Length ?? 0) > 500)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["comment"] = ["El comentario puede tener hasta 500 caracteres."] });

            var connection = await db.Connections
                .Where(item => item.Status == ConnectionStatus.Activa &&
                    ((item.RequesterId == authorId && item.CollaboratorId == id) ||
                     (item.CollaboratorId == authorId && item.RequesterId == id)))
                .OrderByDescending(item => item.RequestId != null)
                .FirstOrDefaultAsync();
            if (connection is null) return Results.Forbid();

            var rating = await db.Ratings.SingleOrDefaultAsync(item => item.ConnectionId == connection.Id && item.AuthorId == authorId);
            var isNew = rating is null;
            if (rating is null)
            {
                rating = new Rating { ConnectionId = connection.Id, AuthorId = authorId, EvaluatedUserId = id };
                db.Ratings.Add(rating);
            }
            rating.Usefulness = input.Usefulness;
            rating.Respect = input.Respect;
            rating.Fulfillment = input.Fulfillment;
            rating.Clarity = input.Clarity;
            rating.Comment = input.Comment?.Trim() ?? "";

            Notification? notification = null;
            if (isNew)
            {
                var authorName = await db.Users.Where(user => user.Id == authorId).Select(user => user.DisplayName).SingleAsync();
                notification = NotificationHelpers.NewNotification(id, "comment", "Nueva valoración recibida", string.IsNullOrWhiteSpace(rating.Comment) ? $"{authorName} valoró tu colaboración." : $"{authorName}: {rating.Comment}", connection.Id);
                db.Notifications.Add(notification);
            }
            await db.SaveChangesAsync();
            if (notification is not null) await NotificationHelpers.PushNotification(notification, hub, devicePush);
            return Results.Ok(rating);
        });
        
        userRatings.MapGet("/reputacion", async (Guid id, [FromServices] ConectaMentesDbContext db) =>
        {
            if (!await db.Users.AnyAsync(user => user.Id == id)) return Results.NotFound();
            var rows = (await RatingHelpers.ReputationRows(db).ToListAsync()).Where(row => row.EvaluatedUserId == id).ToList();
            var overall = rows.Count == 0 ? 0 : Math.Round(rows.Average(row => row.Score), 2);
            var topics = rows.GroupBy(row => row.Topic, StringComparer.OrdinalIgnoreCase).Select(group => new
            {
                topic = group.Key,
                total = group.Count(),
                average = Math.Round(group.Average(row => row.Score), 2),
                usefulness = Math.Round(group.Average(row => row.Usefulness), 2),
                respect = Math.Round(group.Average(row => row.Respect), 2),
                fulfillment = Math.Round(group.Average(row => row.Fulfillment), 2),
                clarity = Math.Round(group.Average(row => row.Clarity), 2)
            }).OrderByDescending(topic => topic.total).ThenByDescending(topic => topic.average).ToList();
            return Results.Ok(new
            {
                total = rows.Count,
                average = overall,
                usefulness = rows.Count == 0 ? 0 : Math.Round(rows.Average(row => row.Usefulness), 2),
                respect = rows.Count == 0 ? 0 : Math.Round(rows.Average(row => row.Respect), 2),
                fulfillment = rows.Count == 0 ? 0 : Math.Round(rows.Average(row => row.Fulfillment), 2),
                clarity = rows.Count == 0 ? 0 : Math.Round(rows.Average(row => row.Clarity), 2),
                topics,
                comments = rows.Where(row => !string.IsNullOrWhiteSpace(row.Comment)).OrderByDescending(row => row.CreatedAt).Take(20).Select(row => new { row.Topic, row.Comment, row.CreatedAt }).ToList()
            });
        });

        return endpoints;
    }
}
