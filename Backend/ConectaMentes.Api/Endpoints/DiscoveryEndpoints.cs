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
            var requestedType = normalizedType switch
            {
                "Domina" => SkillType.Domina,
                "NecesitaApoyo" => SkillType.NecesitaApoyo,
                _ => (SkillType?)null
            };
            var query = from user in db.Users
                        where user.Id != userId && !blocked.Contains(user.Id) && !user.Roles.Contains("admin")
                        let topSkill = db.SkillProfiles.Where(s => s.UserId == user.Id && s.Visible && (requestedType == null || s.Type == requestedType)).OrderByDescending(s => s.Confidence).FirstOrDefault()
                        select new
                        {
                            Id = topSkill != null ? topSkill.Id : Guid.NewGuid(),
                            UserId = user.Id,
                            Topic = topSkill != null ? topSkill.Topic : "Estudiante de " + user.Career,
                            Type = topSkill != null ? topSkill.Type : SkillType.Domina,
                            Confidence = topSkill != null ? topSkill.Confidence : 3,
                            DisplayName = user.DisplayName,
                            Career = user.Career,
                            hasConnection = db.Connections.Any(connection => connection.Status != ConnectionStatus.Rechazada && ((connection.RequesterId == userId && connection.CollaboratorId == user.Id) || (connection.CollaboratorId == userId && connection.RequesterId == user.Id)))
                        };
            if (!string.IsNullOrWhiteSpace(normalizedTopic)) query = query.Where(item => item.Topic.ToLower().Contains(normalizedTopic) || item.DisplayName.ToLower().Contains(normalizedTopic));
            return Results.Ok(await query.OrderByDescending(item => item.Confidence).ThenBy(item => item.DisplayName).Take(60).ToListAsync());
        }).RequireAuthorization().WithTags("Descubrimiento");

        return endpoints;
    }
}
