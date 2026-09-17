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

public static class MatchEndpoints
{
    public static IEndpointRouteBuilder MapMatchEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var matches = endpoints.MapGroup("/api/solicitudes/{requestId:guid}").RequireAuthorization().WithTags("Coincidencias");

        matches.MapPost("/calcular-coincidencias", async (Guid requestId, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => { 
            var request = await db.SupportRequests.SingleOrDefaultAsync(x => x.Id == requestId && x.UserId == ApiIdentity.UserId(p)); 
            if (request is null) return Results.NotFound(); 
            var topic = request.Topic.ToLower(); 
            var blocked = await db.Blocks.Where(x => x.UserId == ApiIdentity.UserId(p)).Select(x => x.BlockedUserId).ToListAsync(); 
            var candidates = await db.SkillProfiles.Where(x => x.Type == SkillType.Domina && x.UserId != ApiIdentity.UserId(p) && !blocked.Contains(x.UserId) && x.Topic.ToLower() == topic).ToListAsync(); 
            var old = db.Matches.Where(x => x.RequestId == requestId); 
            db.RemoveRange(old); 
            foreach (var candidate in candidates.Take(10)) 
                db.Matches.Add(new Match { RequestId = requestId, CandidateUserId = candidate.UserId, Score = Math.Round(candidate.Confidence * 20m, 2), Explanation = $"Domina {candidate.Topic} y puede apoyarte con tu objetivo." }); 
            request.Status = candidates.Count > 0 ? RequestStatus.ConCoincidencias : RequestStatus.Abierta; 
            await db.SaveChangesAsync(); 
            return Results.Ok(candidates.Count); 
        });

        matches.MapGet("/coincidencias", async (Guid requestId, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) =>
        {
            if (!await db.SupportRequests.AnyAsync(x => x.Id == requestId && x.UserId == ApiIdentity.UserId(p))) return Results.NotFound();
            return Results.Ok(await (from m in db.Matches join u in db.Users on m.CandidateUserId equals u.Id where m.RequestId == requestId select new { m.Id, m.Score, m.Explanation, m.Status, candidate = u.DisplayName, m.CandidateUserId }).OrderByDescending(x => x.Score).ToListAsync());
        });

        var matchActions = endpoints.MapGroup("/api/coincidencias").RequireAuthorization().WithTags("Coincidencias");
        
        matchActions.MapPost("/{id:guid}/rechazar", async (Guid id, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => {
            var item = await db.Matches.SingleOrDefaultAsync(x => x.Id == id);
            return item is not null ? await RejectMatch(item, p, db) : Results.NotFound();
        });
        
        matchActions.MapPost("/{id:guid}/aceptar", async (Guid id, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db, [FromServices] IHubContext<RealtimeHub> hub, [FromServices] DevicePushService devicePush) =>
        {
            var item = await db.Matches.SingleOrDefaultAsync(x => x.Id == id);
            if (item is null) return Results.NotFound();
            var request = await db.SupportRequests.SingleOrDefaultAsync(x => x.Id == item.RequestId && x.UserId == ApiIdentity.UserId(p));
            if (request is null) return Results.Forbid();
            var existing = await db.Connections.SingleOrDefaultAsync(x => x.MatchId == item.Id);
            if (existing is not null) return Results.Ok(existing);
            item.Status = MatchStatus.Aceptada;
            var connection = new Connection { RequestId = request.Id, MatchId = item.Id, RequesterId = request.UserId, CollaboratorId = item.CandidateUserId };
            var requesterName = await db.Users.Where(x => x.Id == request.UserId).Select(x => x.DisplayName).SingleAsync();
            var notification = NotificationHelpers.NewNotification(item.CandidateUserId, "connection_request", "Nueva solicitud de conexión", $"{requesterName} quiere aprender contigo sobre {request.Topic}.", connection.Id);
            db.AddRange(connection, notification);
            await db.SaveChangesAsync();
            await NotificationHelpers.PushNotification(notification, hub, devicePush);
            return Results.Ok(connection);
        });

        return endpoints;
    }

    private static async Task<IResult> RejectMatch(Match item, ClaimsPrincipal p, ConectaMentesDbContext db) 
    { 
        var request = await db.SupportRequests.SingleOrDefaultAsync(x => x.Id == item.RequestId && x.UserId == ApiIdentity.UserId(p)); 
        if (request is null) return Results.Forbid(); 
        item.Status = MatchStatus.Rechazada; 
        await db.SaveChangesAsync(); 
        return Results.NoContent(); 
    }
}
