using ConectaMentes.Domain.Entities;
using ConectaMentes.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ConectaMentes.Api.Endpoints;

public static class PanelEndpoints
{
    public static IEndpointRouteBuilder MapPanelEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var panel = endpoints.MapGroup("/api/panel").RequireAuthorization("Institutional").WithTags("Panel institucional");
        
        panel.MapGet("/temas-mas-solicitados", async ([FromServices] ConectaMentesDbContext db) => Results.Ok(await db.SupportRequests.GroupBy(x => x.Topic).Where(g => g.Count() >= 5).OrderByDescending(g => g.Count()).Select(g => new { tema = g.Key, solicitudes = g.Count() }).ToListAsync()));
        
        panel.MapGet("/demanda-no-atendida", async ([FromServices] ConectaMentesDbContext db) => Results.Ok(await db.SupportRequests.Where(x => x.Status == RequestStatus.Abierta).GroupBy(x => x.Topic).Where(g => g.Count() >= 5).Select(g => new { tema = g.Key, noAtendidas = g.Count() }).ToListAsync()));
        
        panel.MapGet("/participacion-general", async ([FromServices] ConectaMentesDbContext db) => Results.Ok(new { estudiantes = await db.Users.CountAsync(), colaboradores = await db.SkillProfiles.Where(x => x.Type == SkillType.Domina).Select(x => x.UserId).Distinct().CountAsync(), aprendices = await db.SkillProfiles.Where(x => x.Type == SkillType.NecesitaApoyo).Select(x => x.UserId).Distinct().CountAsync() }));

        return endpoints;
    }
}
