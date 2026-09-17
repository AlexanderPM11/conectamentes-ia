using System.Security.Claims;
using ConectaMentes.Api.Auth;
using ConectaMentes.Domain.Entities;
using ConectaMentes.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;

namespace ConectaMentes.Api.Endpoints;

public static class DiscoveryEndpoints
{
    public static IEndpointRouteBuilder MapDiscoveryEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/descubrimiento", async (string? topic, string? type, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) =>
        {
            var userId = ApiIdentity.UserId(p);
            var blocked = await db.Blocks.Where(x => x.UserId == userId || x.BlockedUserId == userId).Select(x => x.UserId == userId ? x.BlockedUserId : x.UserId).ToListAsync();
            var normalizedTopic = topic?.Trim().ToLower();
            var normalizedType = type?.Trim();
            var query = from skill in db.SkillProfiles
                        join user in db.Users on skill.UserId equals user.Id
                        where skill.UserId != userId && skill.Visible && !blocked.Contains(skill.UserId)
                        select new
                        {
                            skill.Id,
                            skill.UserId,
                            skill.Topic,
                            skill.Type,
                            skill.Confidence,
                            user.DisplayName,
                            user.Career,
                            hasConnection = db.Connections.Any(connection => connection.Status != ConnectionStatus.Rechazada && (connection.RequesterId == userId && connection.CollaboratorId == skill.UserId || connection.CollaboratorId == userId && connection.RequesterId == skill.UserId))
                        };
            if (!string.IsNullOrWhiteSpace(normalizedTopic)) query = query.Where(item => item.Topic.ToLower().Contains(normalizedTopic) || item.DisplayName.ToLower().Contains(normalizedTopic));
            if (normalizedType is "Domina" or "NecesitaApoyo") query = query.Where(item => item.Type == Enum.Parse<SkillType>(normalizedType));
            return Results.Ok(await query.OrderByDescending(item => item.Confidence).ThenBy(item => item.DisplayName).Take(60).ToListAsync());
        }).RequireAuthorization().WithTags("Descubrimiento");

        return endpoints;
    }
}
