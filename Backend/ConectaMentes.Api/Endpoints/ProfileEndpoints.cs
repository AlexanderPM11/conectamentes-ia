using System.Security.Claims;
using ConectaMentes.Api.Auth;
using ConectaMentes.Application.Auth;
using ConectaMentes.Domain.Entities;
using ConectaMentes.Infrastructure;
using ConectaMentes.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace ConectaMentes.Api.Endpoints;

public static class ProfileEndpoints
{
    public static IEndpointRouteBuilder MapProfileEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var profile = endpoints.MapGroup("/api/perfil").RequireAuthorization().WithTags("Perfil");

        profile.MapGet("", async (ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => 
            Results.Ok(new { 
                habilidades = await db.SkillProfiles.Where(x => x.UserId == ApiIdentity.UserId(p)).ToListAsync(), 
                disponibilidad = await db.Availabilities.SingleOrDefaultAsync(x => x.UserId == ApiIdentity.UserId(p)) 
            }));

        profile.MapPut("/datos", async ([FromBody] ProfileUpdateRequest request, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db, CancellationToken ct) =>
        {
            var user = await db.Users.SingleOrDefaultAsync(item => item.Id == ApiIdentity.UserId(p), ct);
            if (user is null) return Results.NotFound();
            try { user.UpdateProfile(request.DisplayName, request.Career, request.AcademicTerm); await db.SaveChangesAsync(ct); return Results.Ok(UserProfile.From(user)); }
            catch (ArgumentException ex) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["profile"] = [ex.Message] }); }
        }).WithName("UpdateProfileData").WithOpenApi();

        profile.MapPut("/avatar", async (IFormFile file, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db, [FromServices] ProfileAvatarStorage avatars, CancellationToken ct) =>
        {
            var user = await db.Users.SingleOrDefaultAsync(item => item.Id == ApiIdentity.UserId(p), ct);
            if (user is null) return Results.NotFound();
            try
            {
                var previous = user.AvatarPath;
                var stored = await avatars.SaveAsync(file, user.Id, ct);
                user.SetAvatarPath(stored.StoredName);
                await db.SaveChangesAsync(ct);
                avatars.Delete(previous);
                return Results.Ok(UserProfile.From(user));
            }
            catch (AvatarValidationException ex) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["avatar"] = [ex.Message] }); }
        }).DisableAntiforgery().WithName("UpdateProfileAvatar").WithOpenApi();

        profile.MapPost("/habilidades", async ([FromBody] SkillRequest request, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => { 
            if (request.Confidence is < 1 or > 5) return Results.ValidationProblem(new Dictionary<string, string[]> { ["confidence"] = ["Debe estar entre 1 y 5."] }); 
            var item = new SkillProfile { UserId = ApiIdentity.UserId(p), Topic = request.Topic.Trim(), Type = request.Type, Confidence = request.Confidence, Visible = request.Visible }; 
            db.SkillProfiles.Add(item); 
            await db.SaveChangesAsync(); 
            return Results.Created($"/api/perfil/habilidades/{item.Id}", item); 
        });

        profile.MapPut("/habilidades/{id:guid}", async (Guid id, [FromBody] SkillRequest request, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => { 
            if (string.IsNullOrWhiteSpace(request.Topic) || request.Confidence is < 1 or > 5) return Results.ValidationProblem(new Dictionary<string, string[]> { ["skill"] = ["Indica un tema y una confianza entre 1 y 5."] }); 
            var item = await db.SkillProfiles.SingleOrDefaultAsync(x => x.Id == id && x.UserId == ApiIdentity.UserId(p)); 
            if (item is null) return Results.NotFound(); 
            item.Topic = request.Topic.Trim(); 
            item.Type = request.Type; 
            item.Confidence = request.Confidence; 
            item.Visible = request.Visible; 
            await db.SaveChangesAsync(); 
            return Results.Ok(item); 
        });

        profile.MapDelete("/habilidades/{id:guid}", async (Guid id, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => { 
            var item = await db.SkillProfiles.SingleOrDefaultAsync(x => x.Id == id && x.UserId == ApiIdentity.UserId(p)); 
            if (item is null) return Results.NotFound(); 
            db.Remove(item); 
            await db.SaveChangesAsync(); 
            return Results.NoContent(); 
        });

        profile.MapPut("/disponibilidad", async ([FromBody] AvailabilityRequest request, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => { 
            var item = await db.Availabilities.SingleOrDefaultAsync(x => x.UserId == ApiIdentity.UserId(p)); 
            if (item is null) { item = new Availability { UserId = ApiIdentity.UserId(p) }; db.Add(item); } 
            item.TimeSlots = request.TimeSlots.Trim(); 
            item.PreferredMode = request.PreferredMode; 
            await db.SaveChangesAsync(); 
            return Results.Ok(item); 
        });

        return endpoints;
    }
}
