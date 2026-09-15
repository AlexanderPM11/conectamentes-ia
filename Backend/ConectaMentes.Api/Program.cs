using System.Security.Claims;
using System.Text;
using ConectaMentes.Api;
using ConectaMentes.Api.Auth;
using ConectaMentes.Application.Auth;
using ConectaMentes.Domain.Entities;
using ConectaMentes.Infrastructure;
using ConectaMentes.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);
var jwtKey = builder.Configuration["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key must be configured.");

builder.Services.AddProblemDetails(options => options.CustomizeProblemDetails = context =>
{
    context.ProblemDetails.Instance = context.HttpContext.Request.Path;
    context.ProblemDetails.Extensions["traceId"] = context.HttpContext.TraceIdentifier;
});
builder.Services.AddHealthChecks();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddSingleton<ITokenService, JwtTokenService>();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        ValidateIssuer = true, ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "ConectaMentes.Api",
        ValidateAudience = true, ValidAudience = builder.Configuration["Jwt:Audience"] ?? "ConectaMentes.Frontend",
        ValidateLifetime = true, ClockSkew = TimeSpan.FromMinutes(1)
    };
});
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("Institutional", policy => policy.RequireRole("coordinator", "moderator"));
    options.AddPolicy("Moderator", policy => policy.RequireRole("moderator"));
});
builder.Services.AddCors(options => options.AddPolicy("Frontend", policy => policy.WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:5173"]).AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
using (var scope = app.Services.CreateScope())
    await scope.ServiceProvider.GetRequiredService<ConectaMentesDbContext>().Database.EnsureCreatedAsync();

app.UseExceptionHandler();
if (!builder.Configuration.GetValue("DisableHttpsRedirection", false))
    app.UseHttpsRedirection();
app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();
if (app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(); }

app.MapHealthChecks("/health").WithTags("System");
app.MapGet("/api/v1", () => Results.Ok(new { name = "ConectaMentes IA API", version = "v1", status = "ready" })).WithTags("System").WithOpenApi();

var auth = app.MapGroup("/api/auth").WithTags("Autenticación");
auth.MapPost("/registro", async (RegisterRequest request, IAuthService service, CancellationToken ct) =>
{
    try { return Results.Created("/api/usuarios/me", await service.RegisterAsync(new(request.Email, request.Password, request.DisplayName, request.Career, request.AcademicTerm), ct)); }
    catch (ArgumentException ex) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["request"] = [ex.Message] }); }
    catch (InvalidOperationException ex) { return Results.Problem(statusCode: 409, title: "No se pudo completar el registro", detail: ex.Message); }
}).WithName("Register").WithOpenApi();

auth.MapPost("/login", async (LoginRequest request, IAuthService service, CancellationToken ct) =>
{
    var result = await service.LoginAsync(new(request.Email, request.Password), ct);
    return result is null ? Results.Unauthorized() : Results.Ok(result);
}).WithName("Login").WithOpenApi();

auth.MapPost("/logout", () => Results.NoContent()).RequireAuthorization().WithName("Logout").WithOpenApi();
auth.MapPost("/recuperar-contrasena", () => Results.Accepted(value: new { message = "Si los datos son válidos, recibirás instrucciones para continuar." })).WithName("RecoverPassword").WithOpenApi();

app.MapGet("/api/usuarios/me", async (ClaimsPrincipal principal, IAuthService service, CancellationToken ct) =>
{
    var idValue = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? principal.FindFirstValue("sub");
    return Guid.TryParse(idValue, out var id) && await service.GetProfileAsync(id, ct) is { } profile ? Results.Ok(profile) : Results.NotFound();
}).RequireAuthorization().WithTags("Usuarios").WithName("GetCurrentUser").WithOpenApi();

var secured = app.MapGroup("/api").RequireAuthorization();

var profile = secured.MapGroup("/perfil").WithTags("Perfil");
profile.MapGet("", async (ClaimsPrincipal p, ConectaMentesDbContext db) => Results.Ok(new { habilidades = await db.SkillProfiles.Where(x => x.UserId == ApiIdentity.UserId(p)).ToListAsync(), disponibilidad = await db.Availabilities.SingleOrDefaultAsync(x => x.UserId == ApiIdentity.UserId(p)) }));
profile.MapPost("/habilidades", async (SkillRequest request, ClaimsPrincipal p, ConectaMentesDbContext db) => { if (request.Confidence is < 1 or > 5) return Results.ValidationProblem(new Dictionary<string, string[]> { ["confidence"] = ["Debe estar entre 1 y 5."] }); var item = new SkillProfile { UserId = ApiIdentity.UserId(p), Topic = request.Topic.Trim(), Type = request.Type, Confidence = request.Confidence, Visible = request.Visible }; db.SkillProfiles.Add(item); await db.SaveChangesAsync(); return Results.Created($"/api/perfil/habilidades/{item.Id}", item); });
profile.MapPut("/habilidades/{id:guid}", async (Guid id, SkillRequest request, ClaimsPrincipal p, ConectaMentesDbContext db) => { var item = await db.SkillProfiles.SingleOrDefaultAsync(x => x.Id == id && x.UserId == ApiIdentity.UserId(p)); if (item is null) return Results.NotFound(); item.Topic = request.Topic.Trim(); item.Type = request.Type; item.Confidence = request.Confidence; item.Visible = request.Visible; await db.SaveChangesAsync(); return Results.Ok(item); });
profile.MapDelete("/habilidades/{id:guid}", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) => { var item = await db.SkillProfiles.SingleOrDefaultAsync(x => x.Id == id && x.UserId == ApiIdentity.UserId(p)); if (item is null) return Results.NotFound(); db.Remove(item); await db.SaveChangesAsync(); return Results.NoContent(); });
profile.MapPut("/disponibilidad", async (AvailabilityRequest request, ClaimsPrincipal p, ConectaMentesDbContext db) => { var item = await db.Availabilities.SingleOrDefaultAsync(x => x.UserId == ApiIdentity.UserId(p)); if (item is null) { item = new Availability { UserId = ApiIdentity.UserId(p) }; db.Add(item); } item.TimeSlots = request.TimeSlots.Trim(); item.PreferredMode = request.PreferredMode; await db.SaveChangesAsync(); return Results.Ok(item); });

var requests = secured.MapGroup("/solicitudes").WithTags("Solicitudes");
requests.MapPost("", async (SupportRequestInput input, ClaimsPrincipal p, ConectaMentesDbContext db) => { if (string.IsNullOrWhiteSpace(input.Topic) || string.IsNullOrWhiteSpace(input.Description)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["request"] = ["Tema y descripción son obligatorios."] }); var item = new SupportRequest { UserId = ApiIdentity.UserId(p), Topic = input.Topic.Trim(), Description = input.Description.Trim(), HelpType = input.HelpType.Trim(), DesiredSchedule = input.DesiredSchedule.Trim() }; db.Add(item); await db.SaveChangesAsync(); return Results.Created($"/api/solicitudes/{item.Id}", item); });
requests.MapGet("/mias", async (ClaimsPrincipal p, ConectaMentesDbContext db) => Results.Ok(await db.SupportRequests.Where(x => x.UserId == ApiIdentity.UserId(p)).OrderByDescending(x => x.CreatedAt).ToListAsync()));
requests.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) => await db.SupportRequests.SingleOrDefaultAsync(x => x.Id == id && x.UserId == ApiIdentity.UserId(p)) is { } item ? Results.Ok(item) : Results.NotFound());
requests.MapPut("/{id:guid}", async (Guid id, SupportRequestInput input, ClaimsPrincipal p, ConectaMentesDbContext db) => { var item = await db.SupportRequests.SingleOrDefaultAsync(x => x.Id == id && x.UserId == ApiIdentity.UserId(p)); if (item is null || item.Status is RequestStatus.Cancelada or RequestStatus.Conectada) return Results.NotFound(); item.Topic = input.Topic.Trim(); item.Description = input.Description.Trim(); item.HelpType = input.HelpType.Trim(); item.DesiredSchedule = input.DesiredSchedule.Trim(); await db.SaveChangesAsync(); return Results.Ok(item); });
requests.MapPost("/{id:guid}/cancelar", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) => { var item = await db.SupportRequests.SingleOrDefaultAsync(x => x.Id == id && x.UserId == ApiIdentity.UserId(p)); if (item is null) return Results.NotFound(); item.Status = RequestStatus.Cancelada; await db.SaveChangesAsync(); return Results.Ok(item); });

var matches = secured.MapGroup("/solicitudes/{requestId:guid}").WithTags("Coincidencias");
matches.MapPost("/calcular-coincidencias", async (Guid requestId, ClaimsPrincipal p, ConectaMentesDbContext db) => { var request = await db.SupportRequests.SingleOrDefaultAsync(x => x.Id == requestId && x.UserId == ApiIdentity.UserId(p)); if (request is null) return Results.NotFound(); var topic = request.Topic.ToLower(); var blocked = await db.Blocks.Where(x => x.UserId == ApiIdentity.UserId(p)).Select(x => x.BlockedUserId).ToListAsync(); var candidates = await db.SkillProfiles.Where(x => x.Type == SkillType.Domina && x.UserId != ApiIdentity.UserId(p) && !blocked.Contains(x.UserId) && x.Topic.ToLower() == topic).ToListAsync(); var old = db.Matches.Where(x => x.RequestId == requestId); db.RemoveRange(old); foreach (var candidate in candidates.Take(10)) db.Matches.Add(new Match { RequestId = requestId, CandidateUserId = candidate.UserId, Score = Math.Round(candidate.Confidence * 20m, 2), Explanation = $"Domina {candidate.Topic} y puede apoyarte con tu objetivo." }); request.Status = candidates.Count > 0 ? RequestStatus.ConCoincidencias : RequestStatus.Abierta; await db.SaveChangesAsync(); return Results.Ok(candidates.Count); });
matches.MapGet("/coincidencias", async (Guid requestId, ClaimsPrincipal p, ConectaMentesDbContext db) => Results.Ok(await (from m in db.Matches join u in db.Users on m.CandidateUserId equals u.Id where m.RequestId == requestId select new { m.Id, m.Score, m.Explanation, m.Status, candidate = u.DisplayName, m.CandidateUserId }).OrderByDescending(x => x.Score).ToListAsync()));
var matchActions = secured.MapGroup("/coincidencias").WithTags("Coincidencias");
matchActions.MapPost("/{id:guid}/rechazar", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) => await db.Matches.SingleOrDefaultAsync(x => x.Id == id) is { } item ? await RejectMatch(item, p, db) : Results.NotFound());
matchActions.MapPost("/{id:guid}/aceptar", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) => { var item = await db.Matches.SingleOrDefaultAsync(x => x.Id == id); if (item is null) return Results.NotFound(); var request = await db.SupportRequests.SingleOrDefaultAsync(x => x.Id == item.RequestId && x.UserId == ApiIdentity.UserId(p)); if (request is null) return Results.Forbid(); item.Status = MatchStatus.Aceptada; var connection = new Connection { RequestId = request.Id, MatchId = item.Id, RequesterId = request.UserId, CollaboratorId = item.CandidateUserId }; db.Connections.Add(connection); await db.SaveChangesAsync(); return Results.Ok(connection); });

var connections = secured.MapGroup("/conexiones").WithTags("Agenda");
connections.MapPost("/{id:guid}/responder", async (Guid id, ConnectionResponse input, ClaimsPrincipal p, ConectaMentesDbContext db) => { var item = await db.Connections.SingleOrDefaultAsync(x => x.Id == id && x.CollaboratorId == ApiIdentity.UserId(p)); if (item is null) return Results.NotFound(); item.Status = input.Accept ? ConnectionStatus.Activa : ConnectionStatus.Rechazada; await db.SaveChangesAsync(); return Results.Ok(item); });
connections.MapPost("/{id:guid}/sesiones", async (Guid id, SessionInput input, ClaimsPrincipal p, ConectaMentesDbContext db) => { var connection = await db.Connections.SingleOrDefaultAsync(x => x.Id == id && (x.RequesterId == ApiIdentity.UserId(p) || x.CollaboratorId == ApiIdentity.UserId(p)) && x.Status == ConnectionStatus.Activa); if (connection is null) return Results.NotFound(); var session = new LearningSession { ConnectionId = id, Date = input.Date, DurationMinutes = input.DurationMinutes, Mode = input.Mode, Objective = input.Objective, Guide = $"Objetivo: {input.Objective}.\nEjercicio inicial: identificar la duda principal.\nComprobación final: explicar el concepto con tus palabras." }; db.Add(session); await db.SaveChangesAsync(); return Results.Created($"/api/sesiones/{session.Id}", session); });
var sessions = secured.MapGroup("/sesiones").WithTags("Agenda");
sessions.MapPut("/{id:guid}", async (Guid id, SessionInput input, ClaimsPrincipal p, ConectaMentesDbContext db) => await UpdateSession(id, input, p, db));
sessions.MapPost("/{id:guid}/cancelar", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) => await SetSessionStatus(id, SessionStatus.Cancelada, p, db));
sessions.MapPost("/{id:guid}/completar", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) => await SetSessionStatus(id, SessionStatus.Completada, p, db));

var ratings = secured.MapGroup("/sesiones/{sessionId:guid}/valoraciones").WithTags("Valoraciones");
ratings.MapPost("", async (Guid sessionId, RatingInput input, ClaimsPrincipal p, ConectaMentesDbContext db) => { var session = await db.Sessions.SingleOrDefaultAsync(x => x.Id == sessionId && x.Status == SessionStatus.Completada); if (session is null) return Results.NotFound(); var connection = await db.Connections.SingleAsync(x => x.Id == session.ConnectionId); var evaluated = connection.RequesterId == ApiIdentity.UserId(p) ? connection.CollaboratorId : connection.RequesterId; var rating = new Rating { SessionId = sessionId, AuthorId = ApiIdentity.UserId(p), EvaluatedUserId = evaluated, Usefulness = input.Usefulness, Respect = input.Respect, Fulfillment = input.Fulfillment, Clarity = input.Clarity, Comment = input.Comment?.Trim() ?? "" }; db.Add(rating); await db.SaveChangesAsync(); var count = await db.Ratings.CountAsync(x => x.EvaluatedUserId == evaluated); var avg = await db.Ratings.Where(x => x.EvaluatedUserId == evaluated).AverageAsync(x => (double)(x.Usefulness + x.Respect + x.Fulfillment + x.Clarity) / 4); if (count >= 3 && avg >= 4 && !await db.Recognitions.AnyAsync(x => x.UserId == evaluated)) { db.Add(new Recognition { UserId = evaluated, CriterionOrigin = "3 sesiones valoradas positivamente" }); await db.SaveChangesAsync(); } return Results.Created($"/api/sesiones/{sessionId}/valoraciones", rating); });
app.MapGet("/api/usuarios/{id:guid}/reconocimientos", async (Guid id, ConectaMentesDbContext db) => Results.Ok(await db.Recognitions.Where(x => x.UserId == id).ToListAsync())).RequireAuthorization().WithTags("Valoraciones");
app.MapGet("/api/usuarios/{id:guid}/reputacion", async (Guid id, ConectaMentesDbContext db) => { var scores = await db.Ratings.Where(x => x.EvaluatedUserId == id).Select(x => new { x.Usefulness, x.Respect, x.Fulfillment, x.Clarity }).ToListAsync(); return Results.Ok(new { total = scores.Count, promedioUtilidad = scores.Count == 0 ? 0 : scores.Average(x => x.Usefulness), promedioRespeto = scores.Count == 0 ? 0 : scores.Average(x => x.Respect), promedioCumplimiento = scores.Count == 0 ? 0 : scores.Average(x => x.Fulfillment), promedioClaridad = scores.Count == 0 ? 0 : scores.Average(x => x.Clarity) }); }).WithTags("Valoraciones");

var panel = app.MapGroup("/api/panel").RequireAuthorization("Institutional").WithTags("Panel institucional");
panel.MapGet("/temas-mas-solicitados", async (ConectaMentesDbContext db) => Results.Ok(await db.SupportRequests.GroupBy(x => x.Topic).Where(g => g.Count() >= 5).OrderByDescending(g => g.Count()).Select(g => new { tema = g.Key, solicitudes = g.Count() }).ToListAsync()));
panel.MapGet("/demanda-no-atendida", async (ConectaMentesDbContext db) => Results.Ok(await db.SupportRequests.Where(x => x.Status == RequestStatus.Abierta).GroupBy(x => x.Topic).Where(g => g.Count() >= 5).Select(g => new { tema = g.Key, noAtendidas = g.Count() }).ToListAsync()));
panel.MapGet("/participacion-general", async (ConectaMentesDbContext db) => Results.Ok(new { estudiantes = await db.Users.CountAsync(), colaboradores = await db.SkillProfiles.Where(x => x.Type == SkillType.Domina).Select(x => x.UserId).Distinct().CountAsync(), aprendices = await db.SkillProfiles.Where(x => x.Type == SkillType.NecesitaApoyo).Select(x => x.UserId).Distinct().CountAsync() }));

var security = secured.MapGroup("").WithTags("Seguridad");
security.MapPost("/usuarios/{id:guid}/bloquear", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) => { if (id == ApiIdentity.UserId(p)) return Results.BadRequest(); if (!await db.Blocks.AnyAsync(x => x.UserId == ApiIdentity.UserId(p) && x.BlockedUserId == id)) db.Add(new Block { UserId = ApiIdentity.UserId(p), BlockedUserId = id }); await db.SaveChangesAsync(); return Results.NoContent(); });
security.MapDelete("/usuarios/{id:guid}/bloquear", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) => { var item = await db.Blocks.SingleOrDefaultAsync(x => x.UserId == ApiIdentity.UserId(p) && x.BlockedUserId == id); if (item is null) return Results.NotFound(); db.Remove(item); await db.SaveChangesAsync(); return Results.NoContent(); });
security.MapPost("/reportes", async (ReportInput input, ClaimsPrincipal p, ConectaMentesDbContext db) => { var report = new Report { AuthorId = ApiIdentity.UserId(p), ReportedUserId = input.ReportedUserId, ReferenceId = input.ReferenceId, Reason = input.Reason.Trim(), Description = input.Description.Trim() }; db.Add(report); await db.SaveChangesAsync(); return Results.Created($"/api/reportes/{report.Id}", new { report.Id, message = "Reporte recibido para revisión humana." }); });
var moderation = app.MapGroup("/api/moderacion").RequireAuthorization("Moderator").WithTags("Moderación");
moderation.MapGet("/reportes", async (ConectaMentesDbContext db) => Results.Ok(await db.Reports.OrderBy(x => x.CreatedAt).ToListAsync()));
moderation.MapPut("/reportes/{id:guid}", async (Guid id, ModerationInput input, ClaimsPrincipal p, ConectaMentesDbContext db) => { var report = await db.Reports.FindAsync(id); if (report is null) return Results.NotFound(); report.Status = input.Status; report.ResolutionNote = input.ResolutionNote.Trim(); report.ModeratorId = ApiIdentity.UserId(p); await db.SaveChangesAsync(); return Results.Ok(report); });

async Task<IResult> RejectMatch(Match item, ClaimsPrincipal p, ConectaMentesDbContext db) { var request = await db.SupportRequests.SingleOrDefaultAsync(x => x.Id == item.RequestId && x.UserId == ApiIdentity.UserId(p)); if (request is null) return Results.Forbid(); item.Status = MatchStatus.Rechazada; await db.SaveChangesAsync(); return Results.NoContent(); }
async Task<IResult> UpdateSession(Guid id, SessionInput input, ClaimsPrincipal p, ConectaMentesDbContext db) { var item = await db.Sessions.SingleOrDefaultAsync(x => x.Id == id); if (item is null) return Results.NotFound(); item.Date = input.Date; item.DurationMinutes = input.DurationMinutes; item.Mode = input.Mode; item.Objective = input.Objective; await db.SaveChangesAsync(); return Results.Ok(item); }
async Task<IResult> SetSessionStatus(Guid id, SessionStatus status, ClaimsPrincipal p, ConectaMentesDbContext db) { var item = await db.Sessions.FindAsync(id); if (item is null) return Results.NotFound(); item.Status = status; await db.SaveChangesAsync(); return Results.Ok(item); }

app.Run();

public partial class Program;

public sealed record RegisterRequest(string Email, string Password, string DisplayName, string Career, string AcademicTerm);
public sealed record LoginRequest(string Email, string Password);
public sealed record SkillRequest(string Topic, SkillType Type, int Confidence, bool Visible = true);
public sealed record AvailabilityRequest(string TimeSlots, string PreferredMode);
public sealed record SupportRequestInput(string Topic, string Description, string HelpType, string DesiredSchedule);
public sealed record ConnectionResponse(bool Accept);
public sealed record SessionInput(DateTimeOffset Date, int DurationMinutes, string Mode, string Objective);
public sealed record RatingInput(int Usefulness, int Respect, int Fulfillment, int Clarity, string? Comment);
public sealed record ReportInput(Guid ReportedUserId, Guid ReferenceId, string Reason, string Description);
public sealed record ModerationInput(ReportStatus Status, string ResolutionNote);
