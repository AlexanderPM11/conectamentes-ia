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

public static class SessionEndpoints
{
    public static IEndpointRouteBuilder MapSessionEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var sessions = endpoints.MapGroup("/api/sesiones").RequireAuthorization().WithTags("Agenda");
        
        sessions.MapGet("", async (ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) =>
        {
            var userId = ApiIdentity.UserId(p);
            return Results.Ok(await (from session in db.Sessions
                join connection in db.Connections on session.ConnectionId equals connection.Id
                where connection.RequesterId == userId || connection.CollaboratorId == userId
                orderby session.Date
                select new
                {
                    session.Id,
                    session.ConnectionId,
                    session.Date,
                    session.DurationMinutes,
                    session.Mode,
                    session.Objective,
                    session.Guide,
                    session.MeetUrl,
                    session.Status,
                    topic = db.SupportRequests.Where(request => request.Id == connection.RequestId).Select(request => request.Topic).FirstOrDefault(),
                    counterpartId = connection.RequesterId == userId ? connection.CollaboratorId : connection.RequesterId,
                    counterpart = db.Users.Where(user => user.Id == (connection.RequesterId == userId ? connection.CollaboratorId : connection.RequesterId)).Select(user => user.DisplayName).FirstOrDefault(),
                    isRequester = connection.RequesterId == userId,
                    hasRated = db.Ratings.Any(rating => rating.SessionId == session.Id && rating.AuthorId == userId),
                    canRate = connection.RequesterId == userId && session.Status == SessionStatus.Completada && !db.Ratings.Any(rating => rating.SessionId == session.Id && rating.AuthorId == userId)
                }).ToListAsync());
        });
        
        sessions.MapPut("/{id:guid}", async (Guid id, [FromBody] SessionInput input, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => await UpdateSession(id, input, p, db));
        
        sessions.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => await DeleteSession(id, p, db));
        
        sessions.MapPost("/{id:guid}/cancelar", async (Guid id, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => await SetSessionStatus(id, SessionStatus.Cancelada, p, db));
        
        sessions.MapPost("/{id:guid}/completar", async (Guid id, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => await SetSessionStatus(id, SessionStatus.Completada, p, db));
        
        sessions.MapPost("/{id:guid}/google-meet", async (Guid id, [FromBody] GoogleMeetRequest input, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db, [FromServices] GoogleCalendarService calendar, [FromServices] IHubContext<RealtimeHub> hub, [FromServices] DevicePushService devicePush, CancellationToken ct) =>
        {
            var userId = ApiIdentity.UserId(p);
            var item = await (from session in db.Sessions
                              join connection in db.Connections on session.ConnectionId equals connection.Id
                              join request in db.SupportRequests on connection.RequestId equals request.Id
                              where session.Id == id
                              select new { Session = session, Connection = connection, Topic = request.Topic }).SingleOrDefaultAsync(ct);
            if (item is null) return Results.NotFound();
            if (item.Connection.RequesterId != userId && item.Connection.CollaboratorId != userId) return Results.Forbid();
            if (item.Session.Status != SessionStatus.Agendada || item.Session.Date <= DateTimeOffset.UtcNow) return Results.Conflict(new { message = "Solo puedes crear Meet para encuentros próximos." });
            if (!string.Equals(item.Session.Mode, "virtual", StringComparison.OrdinalIgnoreCase)) return Results.Conflict(new { message = "Google Meet está disponible para encuentros virtuales." });
            if (!string.IsNullOrWhiteSpace(item.Session.MeetUrl)) return Results.Ok(new { meetUrl = item.Session.MeetUrl, pending = false });

            var participants = await db.Users.Where(user => user.Id == item.Connection.RequesterId || user.Id == item.Connection.CollaboratorId).Select(user => new { user.Id, user.Email, user.DisplayName }).ToListAsync(ct);
            GoogleMeetingResult meeting;
            try
            {
                meeting = await calendar.CreateOrGetMeetingAsync(input.AccessToken, item.Session.GoogleCalendarEventId, item.Topic, item.Session.Objective, item.Session.Date, item.Session.DurationMinutes, participants.Select(user => user.Email).ToArray(), ct);
            }
            catch (GoogleCalendarException ex)
            {
                return Results.Problem(statusCode: 502, title: "No pudimos crear Google Meet", detail: ex.Message);
            }

            item.Session.GoogleCalendarEventId = meeting.EventId;
            item.Session.MeetUrl = meeting.MeetUrl;
            if (meeting.MeetUrl is null)
            {
                await db.SaveChangesAsync(ct);
                return Results.Accepted(value: new { pending = true, calendarUrl = meeting.CalendarUrl, message = "Google está preparando el enlace. Inténtalo de nuevo en unos segundos." });
            }

            var creator = participants.Single(user => user.Id == userId);
            var recipientId = item.Connection.RequesterId == userId ? item.Connection.CollaboratorId : item.Connection.RequesterId;
            var chatMessage = new ChatMessage { ConnectionId = item.Connection.Id, SenderId = userId, Text = $"Google Meet para nuestro encuentro: {meeting.MeetUrl}" };
            var notification = NotificationHelpers.NewNotification(recipientId, "meeting", "Google Meet listo", $"{creator.DisplayName} creó el enlace para la sesión sobre {item.Topic}.", item.Connection.Id);
            db.AddRange(chatMessage, notification);
            await db.SaveChangesAsync(ct);
            await hub.Clients.Groups(RealtimeHub.UserGroup(item.Connection.RequesterId), RealtimeHub.UserGroup(item.Connection.CollaboratorId)).SendAsync("ChatMessageReceived", ChatHelpers.ChatMessageView(chatMessage, creator.DisplayName, false, null), ct);
            await NotificationHelpers.PushNotification(notification, hub, devicePush, ct);
            return Results.Ok(new { meetUrl = meeting.MeetUrl, calendarUrl = meeting.CalendarUrl, pending = false });
        });

        return endpoints;
    }

    private static async Task<IResult> UpdateSession(Guid id, SessionInput input, ClaimsPrincipal p, ConectaMentesDbContext db) 
    { 
        if (SessionHelpers.ValidateSessionInput(input) is { } validationError) return validationError; 
        var userId = ApiIdentity.UserId(p); 
        var match = await (from session in db.Sessions join connection in db.Connections on session.ConnectionId equals connection.Id where session.Id == id select new { Session = session, Connection = connection }).SingleOrDefaultAsync(); 
        if (match is null) return Results.NotFound(); 
        if (match.Connection.RequesterId != userId && match.Connection.CollaboratorId != userId) return Results.Forbid(); 
        if (match.Session.Status != SessionStatus.Agendada) return Results.Conflict(new { message = "Solo puedes editar sesiones agendadas." }); 
        var mode = input.Mode.Trim().ToLowerInvariant(); 
        var objective = input.Objective.Trim(); 
        var detailsChanged = match.Session.Date != input.Date || match.Session.DurationMinutes != input.DurationMinutes || match.Session.Mode != mode || match.Session.Objective != objective; 
        if (detailsChanged) { match.Session.MeetUrl = null; match.Session.GoogleCalendarEventId = null; } 
        match.Session.Date = input.Date; 
        match.Session.DurationMinutes = input.DurationMinutes; 
        match.Session.Mode = mode; 
        match.Session.Objective = objective; 
        await db.SaveChangesAsync(); 
        return Results.Ok(match.Session); 
    }

    private static async Task<IResult> DeleteSession(Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) 
    { 
        var userId = ApiIdentity.UserId(p); 
        var match = await (from session in db.Sessions join connection in db.Connections on session.ConnectionId equals connection.Id where session.Id == id select new { Session = session, Connection = connection }).SingleOrDefaultAsync(); 
        if (match is null) return Results.NotFound(); 
        if (match.Connection.RequesterId != userId && match.Connection.CollaboratorId != userId) return Results.Forbid(); 
        if (match.Session.Status != SessionStatus.Agendada) return Results.Conflict(new { message = "Solo puedes eliminar sesiones agendadas." }); 
        db.Remove(match.Session); 
        await db.SaveChangesAsync(); 
        return Results.NoContent(); 
    }

    private static async Task<IResult> SetSessionStatus(Guid id, SessionStatus status, ClaimsPrincipal p, ConectaMentesDbContext db) 
    { 
        var userId = ApiIdentity.UserId(p); 
        var match = await (from session in db.Sessions join connection in db.Connections on session.ConnectionId equals connection.Id where session.Id == id select new { Session = session, Connection = connection }).SingleOrDefaultAsync(); 
        if (match is null) return Results.NotFound(); 
        if (match.Connection.RequesterId != userId && match.Connection.CollaboratorId != userId) return Results.Forbid(); 
        if (match.Session.Status != SessionStatus.Agendada) return Results.Conflict(new { message = "La sesión ya no está agendada." }); 
        match.Session.Status = status; 
        await db.SaveChangesAsync(); 
        return Results.Ok(match.Session); 
    }
}
