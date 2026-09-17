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

public static class ConnectionEndpoints
{
    public static IEndpointRouteBuilder MapConnectionEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var connections = endpoints.MapGroup("/api/conexiones").RequireAuthorization().WithTags("Agenda");

        connections.MapGet("", async (ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) =>
        {
            var userId = ApiIdentity.UserId(p);
            return Results.Ok(await db.Connections
                .Where(x => x.RequesterId == userId || x.CollaboratorId == userId)
                .Select(x => new
                {
                    x.Id,
                    x.RequestId,
                    x.Status,
                    topic = db.SupportRequests.Where(r => r.Id == x.RequestId).Select(r => r.Topic).FirstOrDefault(),
                    counterpartId = x.RequesterId == userId ? x.CollaboratorId : x.RequesterId,
                    counterpart = db.Users.Where(u => u.Id == (x.RequesterId == userId ? x.CollaboratorId : x.RequesterId)).Select(u => u.DisplayName).FirstOrDefault(),
                    requiresMyResponse = x.CollaboratorId == userId && x.Status == ConnectionStatus.PendienteColaborador
                })
                .ToListAsync());
        });

        connections.MapGet("/{id:guid}/solicitante", async (Guid id, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db, CancellationToken ct) =>
        {
            var userId = ApiIdentity.UserId(p);
            var connection = await db.Connections.SingleOrDefaultAsync(item => item.Id == id && item.CollaboratorId == userId && item.Status == ConnectionStatus.PendienteColaborador, ct);
            if (connection is null) return Results.NotFound();
            var requester = await db.Users.SingleOrDefaultAsync(item => item.Id == connection.RequesterId, ct);
            var request = await db.SupportRequests.SingleOrDefaultAsync(item => item.Id == connection.RequestId, ct);
            if (requester is null || request is null) return Results.NotFound();
            var skills = await db.SkillProfiles.Where(item => item.UserId == requester.Id && item.Visible).OrderByDescending(item => item.Confidence).Take(12).Select(item => new { item.Topic, item.Type, item.Confidence }).ToListAsync(ct);
            var availability = await db.Availabilities.Where(item => item.UserId == requester.Id).Select(item => new { item.TimeSlots, item.PreferredMode }).SingleOrDefaultAsync(ct);
            var ratingRows = await db.Ratings.Where(item => item.EvaluatedUserId == requester.Id).Select(item => new { item.Usefulness, item.Clarity, item.Fulfillment, item.Respect }).ToListAsync(ct);
            var average = ratingRows.Count == 0 ? 0 : Math.Round(ratingRows.Average(item => (item.Usefulness + item.Clarity + item.Fulfillment + item.Respect) / 4d), 2);
            return Results.Ok(new
            {
                connectionId = connection.Id,
                request = new { request.Topic, request.Description, request.HelpType, request.DesiredSchedule, request.CreatedAt },
                person = new { requester.Id, requester.DisplayName, requester.Career, requester.AcademicTerm, requester.CreatedAt, requester.AvatarUpdatedAt },
                skills,
                availability,
                reputation = new { average, totalRatings = ratingRows.Count }
            });
        });

        connections.MapPost("/{id:guid}/responder", async (Guid id, [FromBody] ConnectionResponse input, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db, [FromServices] IHubContext<RealtimeHub> hub, [FromServices] DevicePushService devicePush) =>
        {
            var userId = ApiIdentity.UserId(p);
            var item = await db.Connections.SingleOrDefaultAsync(x => x.Id == id && x.CollaboratorId == userId);
            if (item is null) return Results.NotFound();
            item.Status = input.Accept ? ConnectionStatus.Activa : ConnectionStatus.Rechazada;
            var collaboratorName = await db.Users.Where(x => x.Id == userId).Select(x => x.DisplayName).SingleAsync();
            var topic = await db.SupportRequests.Where(x => x.Id == item.RequestId).Select(x => x.Topic).SingleAsync();
            var notification = NotificationHelpers.NewNotification(item.RequesterId, input.Accept ? "connection_accepted" : "connection_rejected", input.Accept ? "Conexión aceptada" : "Solicitud no aceptada", input.Accept ? $"{collaboratorName} aceptó ayudarte con {topic}. Ya pueden conversar." : $"{collaboratorName} no pudo aceptar la conexión sobre {topic}.", item.Id);
            db.Add(notification);
            await db.SaveChangesAsync();
            await NotificationHelpers.PushNotification(notification, hub, devicePush);
            return Results.Ok(item);
        });

        connections.MapPost("/{id:guid}/sesiones", async (Guid id, [FromBody] SessionInput input, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db, [FromServices] IHubContext<RealtimeHub> hub, [FromServices] DevicePushService devicePush) =>
        {
            if (SessionHelpers.ValidateSessionInput(input) is { } validationError) return validationError;
            var userId = ApiIdentity.UserId(p);
            var connection = await db.Connections.SingleOrDefaultAsync(x => x.Id == id && (x.RequesterId == userId || x.CollaboratorId == userId) && x.Status == ConnectionStatus.Activa);
            if (connection is null) return Results.NotFound();
            var session = new LearningSession { ConnectionId = id, Date = input.Date, DurationMinutes = input.DurationMinutes, Mode = input.Mode, Objective = input.Objective, Guide = $"Objetivo: {input.Objective}.\nEjercicio inicial: identificar la duda principal.\nComprobación final: explicar el concepto con tus palabras." };
            var senderName = await db.Users.Where(x => x.Id == userId).Select(x => x.DisplayName).SingleAsync();
            var recipientId = connection.RequesterId == userId ? connection.CollaboratorId : connection.RequesterId;
            var notification = NotificationHelpers.NewNotification(recipientId, "session", "Nueva sesión propuesta", $"{senderName} propuso una sesión para el {SessionHelpers.FormatDominicanDateTime(input.Date)}: {input.Objective}.", connection.Id);
            db.AddRange(session, notification);
            await db.SaveChangesAsync();
            await NotificationHelpers.PushNotification(notification, hub, devicePush);
            return Results.Created($"/api/sesiones/{session.Id}", session);
        });

        return endpoints;
    }
}
