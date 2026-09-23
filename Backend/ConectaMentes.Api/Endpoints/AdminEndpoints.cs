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
        
        security.MapPost("/reportes", async (HttpRequest request, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db, [FromServices] ReportEvidenceStorage storage, CancellationToken ct) =>
        {
            var form = await request.ReadFormAsync(ct);
            if (!Guid.TryParse(form["reportedUserId"], out var reportedUserId) || !Guid.TryParse(form["referenceId"], out var referenceId)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["connection"] = ["Selecciona una conexión válida."] });
            var reason = form["reason"].ToString().Trim();
            var description = form["description"].ToString().Trim();
            if (string.IsNullOrWhiteSpace(reason) || string.IsNullOrWhiteSpace(description)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["report"] = ["Indica el motivo y describe lo ocurrido."] });
            if (reason.Length > 80 || description.Length > 4000) return Results.ValidationProblem(new Dictionary<string, string[]> { ["report"] = ["El motivo o la descripción superan el límite permitido."] });
            var authorId = ApiIdentity.UserId(p);
            var validConnection = await db.Connections.AnyAsync(connection => connection.Id == referenceId && connection.Status == ConnectionStatus.Activa && (connection.RequesterId == authorId && connection.CollaboratorId == reportedUserId || connection.CollaboratorId == authorId && connection.RequesterId == reportedUserId), ct);
            if (!validConnection) return Results.BadRequest(new { message = "Solo puedes reportar a una persona con la que tienes una conexión activa." });
            var report = new Report { AuthorId = authorId, ReportedUserId = reportedUserId, ReferenceId = referenceId, Reason = reason, Description = description };
            db.Add(report);
            var evidenceFile = form.Files.GetFile("evidence");
            StoredReportEvidence? stored = null;
            try
            {
                if (evidenceFile is not null) { stored = await storage.SaveAsync(evidenceFile, report.Id, ct); db.Add(new ReportEvidence { ReportId = report.Id, FileName = stored.FileName, StoredName = stored.StoredName, ContentType = stored.ContentType, SizeBytes = stored.SizeBytes }); }
                db.Add(new Notification { UserId = authorId, Type = "report_received", Title = "Reporte recibido", Body = "Tu reporte quedó abierto para revisión humana.", ReferenceId = report.Id });
                await db.SaveChangesAsync(ct);
            }
            catch (ReportFileValidationException error) { return Results.BadRequest(new { message = error.Message }); }
            return Results.Created($"/api/reportes/{report.Id}", new { report.Id, message = "Reporte recibido para revisión humana." });
        }).DisableAntiforgery();
        
        var moderation = endpoints.MapGroup("/api/moderacion").RequireAuthorization("ModeratorOrSuperAdmin").WithTags("Moderación");
        
        moderation.MapGet("/reportes", async ([FromServices] ConectaMentesDbContext db) =>
        {
            var reports = await (from report in db.Reports.AsNoTracking()
                                 join author in db.Users.AsNoTracking() on report.AuthorId equals author.Id
                                 join reported in db.Users.AsNoTracking() on report.ReportedUserId equals reported.Id
                                 orderby report.Status == ReportStatus.Abierto descending, report.CreatedAt descending
                                 select new { report.Id, report.AuthorId, authorName = author.DisplayName, report.ReportedUserId, reportedName = reported.DisplayName, report.ReferenceId, report.Reason, report.Description, report.Status, report.ResolutionNote, report.ModeratorId, report.CreatedAt, evidences = db.ReportEvidences.Where(evidence => evidence.ReportId == report.Id).Select(evidence => new { evidence.Id, evidence.FileName, evidence.ContentType, evidence.SizeBytes, evidence.CreatedAt }).ToList() }).ToListAsync();
            return Results.Ok(reports);
        });

        moderation.MapGet("/reportes/{reportId:guid}/evidencias/{evidenceId:guid}", async (Guid reportId, Guid evidenceId, [FromServices] ConectaMentesDbContext db, [FromServices] ReportEvidenceStorage storage) =>
        {
            var evidence = await db.ReportEvidences.AsNoTracking().SingleOrDefaultAsync(item => item.Id == evidenceId && item.ReportId == reportId);
            if (evidence is null) return Results.NotFound();
            var path = storage.Resolve(evidence.StoredName);
            return File.Exists(path) ? Results.File(File.OpenRead(path), evidence.ContentType, evidence.FileName, enableRangeProcessing: true) : Results.NotFound();
        });
        
        moderation.MapPut("/reportes/{id:guid}", async (Guid id, [FromBody] ModerationInput input, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => { 
            var report = await db.Reports.FindAsync(id); 
            if (report is null) return Results.NotFound(); 
            if (input.Status is not (ReportStatus.Abierto or ReportStatus.EnRevision or ReportStatus.Resuelto)) return Results.BadRequest(new { message = "Estado de reporte no válido." });
            if (input.Status == ReportStatus.Resuelto && string.IsNullOrWhiteSpace(input.ResolutionNote)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["resolutionNote"] = ["Añade una nota de resolución antes de cerrar el reporte."] });
            report.Status = input.Status; 
            report.ResolutionNote = input.ResolutionNote.Trim(); 
            report.ModeratorId = ApiIdentity.UserId(p); 
            await db.SaveChangesAsync(); 
            return Results.Ok(new { report.Id, report.Status, report.ResolutionNote, report.ModeratorId }); 
        });

        return endpoints;
    }
}
