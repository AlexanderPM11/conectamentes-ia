using System.Security.Claims;
using ConectaMentes.Api.Auth;
using ConectaMentes.Domain.Entities;
using ConectaMentes.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ConectaMentes.Api.Endpoints;

public static class AdminEndpoints
{
    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var admin = endpoints.MapGroup("/api/admin").RequireAuthorization("SuperAdmin").WithTags("Administración");
        
        admin.MapGet("/resumen", async ([FromServices] ConectaMentesDbContext db) => Results.Ok(new
        {
            total = await db.Users.CountAsync(),
            activos = await db.Users.CountAsync(user => user.AccessStatus == "active"),
            suspendidos = await db.Users.CountAsync(user => user.AccessStatus == "suspended"),
            bloqueados = await db.Users.CountAsync(user => user.AccessStatus == "blocked"),
            nuevosUltimos30Dias = await db.Users.CountAsync(user => user.CreatedAt >= DateTimeOffset.UtcNow.AddDays(-30))
        }));
        
        admin.MapGet("/usuarios", async (string? search, string? status, [FromServices] ConectaMentesDbContext db) =>
        {
            var query = db.Users.AsNoTracking();
            if (!string.IsNullOrWhiteSpace(search)) { var term = search.Trim(); query = query.Where(user => user.Email.Contains(term) || user.DisplayName.Contains(term) || user.Career.Contains(term)); }
            if (!string.IsNullOrWhiteSpace(status) && status.Trim().ToLowerInvariant() is var normalizedStatus && normalizedStatus is ("active" or "suspended" or "blocked")) query = query.Where(user => user.AccessStatus == normalizedStatus);
            var users = await query.OrderByDescending(user => user.CreatedAt).Take(200).Select(user => new { user.Id, user.Email, user.DisplayName, user.Career, user.AcademicTerm, user.Roles, user.AccessStatus, user.AccessStatusReason, user.AccessStatusChangedAt, user.CreatedAt }).ToListAsync();
            return Results.Ok(users);
        });
        
        admin.MapPost("/usuarios/{id:guid}/estado", async (Guid id, [FromBody] AdminAccessStatusInput input, ClaimsPrincipal principal, [FromServices] ConectaMentesDbContext db) =>
        {
            var actorId = ApiIdentity.UserId(principal);
            if (id == actorId) return Results.Conflict(new { message = "No puedes restringir tu propia cuenta de superadministrador." });
            var status = input.Status.Trim().ToLowerInvariant();
            var reason = input.Reason?.Trim();
            if (status is not ("active" or "suspended" or "blocked")) return Results.ValidationProblem(new Dictionary<string, string[]> { ["status"] = ["El estado debe ser active, suspended o blocked."] });
            if (status != "active" && string.IsNullOrWhiteSpace(reason)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["reason"] = ["Indica el motivo de la restricción."] });
            if (reason?.Length > 500) return Results.ValidationProblem(new Dictionary<string, string[]> { ["reason"] = ["El motivo debe tener hasta 500 caracteres."] });
            var user = await db.Users.SingleOrDefaultAsync(item => item.Id == id);
            if (user is null) return Results.NotFound();
            user.SetAccessStatus(status, reason);
            await db.SaveChangesAsync();
            return Results.Ok(new { user.Id, user.AccessStatus, user.AccessStatusReason, user.AccessStatusChangedAt });
        });

        var security = endpoints.MapGroup("/api").RequireAuthorization().WithTags("Seguridad");
        
        security.MapPost("/usuarios/{id:guid}/bloquear", async (Guid id, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => { 
            if (id == ApiIdentity.UserId(p)) return Results.BadRequest(); 
            if (!await db.Blocks.AnyAsync(x => x.UserId == ApiIdentity.UserId(p) && x.BlockedUserId == id)) db.Add(new Block { UserId = ApiIdentity.UserId(p), BlockedUserId = id }); 
            await db.SaveChangesAsync(); 
            return Results.NoContent(); 
        });
        
        security.MapDelete("/usuarios/{id:guid}/bloquear", async (Guid id, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => { 
            var item = await db.Blocks.SingleOrDefaultAsync(x => x.UserId == ApiIdentity.UserId(p) && x.BlockedUserId == id); 
            if (item is null) return Results.NotFound(); 
            db.Remove(item); 
            await db.SaveChangesAsync(); 
            return Results.NoContent(); 
        });
        
        security.MapPost("/reportes", async ([FromBody] ReportInput input, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => { 
            var report = new Report { AuthorId = ApiIdentity.UserId(p), ReportedUserId = input.ReportedUserId, ReferenceId = input.ReferenceId, Reason = input.Reason.Trim(), Description = input.Description.Trim() }; 
            db.Add(report); 
            await db.SaveChangesAsync(); 
            return Results.Created($"/api/reportes/{report.Id}", new { report.Id, message = "Reporte recibido para revisión humana." }); 
        });
        
        var moderation = endpoints.MapGroup("/api/moderacion").RequireAuthorization("Moderator").WithTags("Moderación");
        
        moderation.MapGet("/reportes", async ([FromServices] ConectaMentesDbContext db) => Results.Ok(await db.Reports.OrderBy(x => x.CreatedAt).ToListAsync()));
        
        moderation.MapPut("/reportes/{id:guid}", async (Guid id, [FromBody] ModerationInput input, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => { 
            var report = await db.Reports.FindAsync(id); 
            if (report is null) return Results.NotFound(); 
            report.Status = input.Status; 
            report.ResolutionNote = input.ResolutionNote.Trim(); 
            report.ModeratorId = ApiIdentity.UserId(p); 
            await db.SaveChangesAsync(); 
            return Results.Ok(report); 
        });

        return endpoints;
    }
}
