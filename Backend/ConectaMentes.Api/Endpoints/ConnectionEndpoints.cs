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
                    topic = x.RequestId != null ? db.SupportRequests.Where(r => r.Id == x.RequestId).Select(r => r.Topic).FirstOrDefault() : "Conexión Directa",
                    counterpartId = x.RequesterId == userId ? x.CollaboratorId : x.RequesterId,
                    counterpart = db.Users.Where(u => u.Id == (x.RequesterId == userId ? x.CollaboratorId : x.RequesterId)).Select(u => u.DisplayName).FirstOrDefault(),
                    counterpartAvatarUpdatedAt = db.Users.Where(u => u.Id == (x.RequesterId == userId ? x.CollaboratorId : x.RequesterId)).Select(u => u.AvatarUpdatedAt).FirstOrDefault(),
                    requiresMyResponse = x.CollaboratorId == userId && x.Status == ConnectionStatus.PendienteColaborador
                })
                .ToListAsync());
        });

        connections.MapPost("/ofrecer-apoyo/{requestId:guid}", async (Guid requestId, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db, [FromServices] IHubContext<RealtimeHub> hub, [FromServices] DevicePushService devicePush) => {
            var userId = ApiIdentity.UserId(p);
            var request = await db.SupportRequests.SingleOrDefaultAsync(x => x.Id == requestId);
            if (request is null) return Results.NotFound();
            if (request.UserId == userId) return Results.BadRequest("No puedes ofrecer apoyo a tu propia solicitud.");
            var existing = await db.Connections.SingleOrDefaultAsync(x => x.RequestId == requestId && x.RequesterId == request.UserId && x.CollaboratorId == userId);
            if (existing is not null) return Results.Ok(existing);
            
            var connection = new Connection { RequestId = requestId, RequesterId = request.UserId, CollaboratorId = userId, Status = ConnectionStatus.PendienteColaborador };
            var collaboratorName = await db.Users.Where(x => x.Id == userId).Select(x => x.DisplayName).SingleAsync();
            var notification = NotificationHelpers.NewNotification(request.UserId, "connection_request", "Alguien ofreció ayudarte", $"{collaboratorName} ofreció apoyo para tu solicitud de {request.Topic}.", connection.Id);
            
            db.AddRange(connection, notification);
            await db.SaveChangesAsync();
            await NotificationHelpers.PushNotification(notification, hub, devicePush);
            return Results.Ok(connection);
        });

        connections.MapPost("/directa/{targetUserId:guid}", async (Guid targetUserId, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db, [FromServices] IHubContext<RealtimeHub> hub, [FromServices] DevicePushService devicePush) => {
            var userId = ApiIdentity.UserId(p);
            if (userId == targetUserId) return Results.BadRequest("No puedes conectar contigo mismo.");
            var target = await db.Users.SingleOrDefaultAsync(x => x.Id == targetUserId);
            if (target is null) return Results.NotFound();
            
            var existing = await db.Connections.SingleOrDefaultAsync(x => x.RequestId == null && ((x.RequesterId == userId && x.CollaboratorId == targetUserId) || (x.RequesterId == targetUserId && x.CollaboratorId == userId)));
            if (existing is not null) return Results.Ok(existing);
            
            var connection = new Connection { RequestId = null, RequesterId = userId, CollaboratorId = targetUserId, Status = ConnectionStatus.PendienteColaborador };
            var requesterName = await db.Users.Where(x => x.Id == userId).Select(x => x.DisplayName).SingleAsync();
            var notification = NotificationHelpers.NewNotification(targetUserId, "connection_request", "Nueva solicitud de conexión", $"{requesterName} quiere conectar contigo para aprender juntos.", connection.Id);
            
            db.AddRange(connection, notification);
            await db.SaveChangesAsync();
            await NotificationHelpers.PushNotification(notification, hub, devicePush);
            return Results.Ok(connection);
        });

        connections.MapGet("/{id:guid}/solicitante", async (Guid id, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db, CancellationToken ct) =>
        {
            var userId = ApiIdentity.UserId(p);
            var connection = await db.Connections.SingleOrDefaultAsync(item => item.Id == id && item.CollaboratorId == userId && item.Status == ConnectionStatus.PendienteColaborador, ct);
            if (connection is null) return Results.NotFound();
            var requester = await db.Users.SingleOrDefaultAsync(item => item.Id == connection.RequesterId, ct);
            var request = connection.RequestId != null ? await db.SupportRequests.SingleOrDefaultAsync(item => item.Id == connection.RequestId, ct) : null;
            if (requester is null) return Results.NotFound();
            var skills = await db.SkillProfiles.Where(item => item.UserId == requester.Id && item.Visible).OrderByDescending(item => item.Confidence).Take(12).Select(item => new { item.Topic, item.Type, item.Confidence }).ToListAsync(ct);
            var availability = await db.Availabilities.Where(item => item.UserId == requester.Id).Select(item => new { item.TimeSlots, item.PreferredMode }).SingleOrDefaultAsync(ct);
            var ratingRows = await db.Ratings.Where(item => item.EvaluatedUserId == requester.Id).Select(item => new { item.Usefulness, item.Clarity, item.Fulfillment, item.Respect }).ToListAsync(ct);
            var average = ratingRows.Count == 0 ? 0 : Math.Round(ratingRows.Average(item => (item.Usefulness + item.Clarity + item.Fulfillment + item.Respect) / 4d), 2);
            return Results.Ok(new
            {
                connectionId = connection.Id,
                request = request != null ? new { request.Topic, request.Description, request.HelpType, request.DesiredSchedule, request.CreatedAt } : null,
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
            var topic = item.RequestId != null ? await db.SupportRequests.Where(x => x.Id == item.RequestId).Select(x => x.Topic).FirstOrDefaultAsync() : "aprender juntos";
            var notification = NotificationHelpers.NewNotification(item.RequesterId, input.Accept ? "connection_accepted" : "connection_rejected", input.Accept ? "Conexión aceptada" : "Solicitud no aceptada", input.Accept ? $"{collaboratorName} aceptó conectar contigo sobre {topic}. Ya pueden conversar." : $"{collaboratorName} no pudo aceptar la conexión sobre {topic}.", item.Id);
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
