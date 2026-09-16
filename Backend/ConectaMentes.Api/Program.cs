using System.Security.Claims;
using System.Text;
using ConectaMentes.Api;
using ConectaMentes.Api.Auth;
using ConectaMentes.Application.Auth;
using ConectaMentes.Domain.Entities;
using ConectaMentes.Infrastructure;
using ConectaMentes.Infrastructure.Persistence;
using Google.Apis.Auth;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.SignalR;
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
builder.Services.AddSignalR();
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
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var token = context.Request.Query["access_token"];
            if (!string.IsNullOrWhiteSpace(token) && context.HttpContext.Request.Path.StartsWithSegments("/hubs/realtime"))
                context.Token = token;
            return Task.CompletedTask;
        }
    };
});
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("Institutional", policy => policy.RequireRole("coordinator", "moderator"));
    options.AddPolicy("Moderator", policy => policy.RequireRole("moderator"));
});
builder.Services.AddCors(options => options.AddPolicy("Frontend", policy => policy.WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:5173"]).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

var app = builder.Build();
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ConectaMentesDbContext>();
    await db.Database.EnsureCreatedAsync();
    await db.Database.ExecuteSqlRawAsync("""
        CREATE TABLE IF NOT EXISTS `Notifications` (
          `Id` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
          `UserId` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
          `Type` varchar(40) NOT NULL,
          `Title` varchar(140) NOT NULL,
          `Body` varchar(500) NOT NULL,
          `ReferenceId` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NULL,
          `IsRead` tinyint(1) NOT NULL DEFAULT 0,
          `CreatedAt` datetime(6) NOT NULL,
          PRIMARY KEY (`Id`), INDEX `IX_Notifications_UserId_IsRead_CreatedAt` (`UserId`,`IsRead`,`CreatedAt`)
        );
        """);
    await db.Database.ExecuteSqlRawAsync("""
        CREATE TABLE IF NOT EXISTS `ChatMessages` (
          `Id` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
          `ConnectionId` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
          `SenderId` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
          `Text` varchar(1500) NOT NULL,
          `CreatedAt` datetime(6) NOT NULL,
          PRIMARY KEY (`Id`), INDEX `IX_ChatMessages_ConnectionId_CreatedAt` (`ConnectionId`,`CreatedAt`)
        );
        """);
}

app.UseExceptionHandler();
if (!builder.Configuration.GetValue("DisableHttpsRedirection", false))
    app.UseHttpsRedirection();
app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();
if (app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(); }

app.MapHealthChecks("/health").WithTags("System");
app.MapHub<RealtimeHub>("/hubs/realtime");
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
auth.MapPost("/google", async (GoogleLoginRequest request, IAuthService service, IConfiguration configuration, CancellationToken ct) =>
{
    var clientId = configuration["Google:ClientId"];
    if (string.IsNullOrWhiteSpace(clientId)) return Results.Problem(statusCode: 503, title: "Inicio con Google no configurado");
    try
    {
        var payload = await GoogleJsonWebSignature.ValidateAsync(request.Credential, new GoogleJsonWebSignature.ValidationSettings { Audience = [clientId] });
        return Results.Ok(await service.LoginWithGoogleAsync(new(payload.Email, payload.Name ?? payload.Email), ct));
    }
    catch (InvalidJwtException) { return Results.Unauthorized(); }
}).WithName("GoogleLogin").WithOpenApi();

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
app.MapGet("/api/descubrimiento", async (string? topic, string? type, ClaimsPrincipal p, ConectaMentesDbContext db) =>
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
var matchActions = secured.MapGroup("/coincidencias").WithTags("Coincidencias");
matchActions.MapPost("/{id:guid}/rechazar", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) => await db.Matches.SingleOrDefaultAsync(x => x.Id == id) is { } item ? await RejectMatch(item, p, db) : Results.NotFound());
matchActions.MapPost("/{id:guid}/aceptar", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db, IHubContext<RealtimeHub> hub) =>
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
    var notification = NewNotification(item.CandidateUserId, "connection_request", "Nueva solicitud de conexión", $"{requesterName} quiere aprender contigo sobre {request.Topic}.", connection.Id);
    db.AddRange(connection, notification);
    await db.SaveChangesAsync();
    await PushNotification(notification, hub);
    return Results.Ok(connection);
});

var connections = secured.MapGroup("/conexiones").WithTags("Agenda");
connections.MapGet("", async (ClaimsPrincipal p, ConectaMentesDbContext db) =>
{
    var userId = ApiIdentity.UserId(p);
    return Results.Ok(await db.Connections
        .Where(x => x.RequesterId == userId || x.CollaboratorId == userId)
        .Select(x => new
        {
            x.Id,
            x.RequestId,
            x.Status,
            topic = db.SupportRequests.Where(r => r.Id == x.RequestId).Select(r => r.Topic).FirstOrDefault(),
            counterpartId = x.RequesterId == userId ? x.CollaboratorId : x.RequesterId,
            counterpart = db.Users.Where(u => u.Id == (x.RequesterId == userId ? x.CollaboratorId : x.RequesterId)).Select(u => u.DisplayName).FirstOrDefault(),
            requiresMyResponse = x.CollaboratorId == userId && x.Status == ConnectionStatus.PendienteColaborador
        })
        .ToListAsync());
});
connections.MapPost("/{id:guid}/responder", async (Guid id, ConnectionResponse input, ClaimsPrincipal p, ConectaMentesDbContext db, IHubContext<RealtimeHub> hub) =>
{
    var userId = ApiIdentity.UserId(p);
    var item = await db.Connections.SingleOrDefaultAsync(x => x.Id == id && x.CollaboratorId == userId);
    if (item is null) return Results.NotFound();
    item.Status = input.Accept ? ConnectionStatus.Activa : ConnectionStatus.Rechazada;
    var collaboratorName = await db.Users.Where(x => x.Id == userId).Select(x => x.DisplayName).SingleAsync();
    var topic = await db.SupportRequests.Where(x => x.Id == item.RequestId).Select(x => x.Topic).SingleAsync();
    var notification = NewNotification(item.RequesterId, input.Accept ? "connection_accepted" : "connection_rejected", input.Accept ? "Conexión aceptada" : "Solicitud no aceptada", input.Accept ? $"{collaboratorName} aceptó ayudarte con {topic}. Ya pueden conversar." : $"{collaboratorName} no pudo aceptar la conexión sobre {topic}.", item.Id);
    db.Add(notification);
    await db.SaveChangesAsync();
    await PushNotification(notification, hub);
    return Results.Ok(item);
});
connections.MapPost("/{id:guid}/sesiones", async (Guid id, SessionInput input, ClaimsPrincipal p, ConectaMentesDbContext db, IHubContext<RealtimeHub> hub) =>
{
    var userId = ApiIdentity.UserId(p);
    var connection = await db.Connections.SingleOrDefaultAsync(x => x.Id == id && (x.RequesterId == userId || x.CollaboratorId == userId) && x.Status == ConnectionStatus.Activa);
    if (connection is null) return Results.NotFound();
    var session = new LearningSession { ConnectionId = id, Date = input.Date, DurationMinutes = input.DurationMinutes, Mode = input.Mode, Objective = input.Objective, Guide = $"Objetivo: {input.Objective}.\nEjercicio inicial: identificar la duda principal.\nComprobación final: explicar el concepto con tus palabras." };
    var senderName = await db.Users.Where(x => x.Id == userId).Select(x => x.DisplayName).SingleAsync();
    var recipientId = connection.RequesterId == userId ? connection.CollaboratorId : connection.RequesterId;
    var notification = NewNotification(recipientId, "session", "Nueva sesión propuesta", $"{senderName} propuso una sesión para el {FormatDominicanDateTime(input.Date)}: {input.Objective}.", connection.Id);
    db.AddRange(session, notification);
    await db.SaveChangesAsync();
    await PushNotification(notification, hub);
    return Results.Created($"/api/sesiones/{session.Id}", session);
});

connections.MapGet("/{id:guid}/mensajes", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) =>
{
    var userId = ApiIdentity.UserId(p);
    if (!await db.Connections.AnyAsync(x => x.Id == id && (x.RequesterId == userId || x.CollaboratorId == userId))) return Results.NotFound();
    var messages = await (from message in db.ChatMessages join sender in db.Users on message.SenderId equals sender.Id where message.ConnectionId == id orderby message.CreatedAt select new { message.Id, message.ConnectionId, message.SenderId, sender = sender.DisplayName, message.Text, message.CreatedAt, isMine = message.SenderId == userId }).Take(100).ToListAsync();
    return Results.Ok(messages);
});
connections.MapPost("/{id:guid}/mensajes", async (Guid id, ChatMessageInput input, ClaimsPrincipal p, ConectaMentesDbContext db, IHubContext<RealtimeHub> hub) =>
{
    var userId = ApiIdentity.UserId(p);
    var connection = await db.Connections.SingleOrDefaultAsync(x => x.Id == id && (x.RequesterId == userId || x.CollaboratorId == userId) && x.Status == ConnectionStatus.Activa);
    if (connection is null) return Results.NotFound();
    var text = input.Text.Trim();
    if (text.Length is 0 or > 1500) return Results.ValidationProblem(new Dictionary<string, string[]> { ["text"] = ["El mensaje debe tener entre 1 y 1500 caracteres."] });
    var senderName = await db.Users.Where(x => x.Id == userId).Select(x => x.DisplayName).SingleAsync();
    var recipientId = connection.RequesterId == userId ? connection.CollaboratorId : connection.RequesterId;
    var message = new ChatMessage { ConnectionId = id, SenderId = userId, Text = text };
    var preview = text.Length > 150 ? $"{text[..147]}..." : text;
    var notification = NewNotification(recipientId, "message", $"Nuevo mensaje de {senderName}", preview, id);
    db.AddRange(message, notification);
    await db.SaveChangesAsync();
    var messageView = new { message.Id, message.ConnectionId, message.SenderId, sender = senderName, message.Text, message.CreatedAt };
    await hub.Clients.Groups(RealtimeHub.UserGroup(connection.RequesterId), RealtimeHub.UserGroup(connection.CollaboratorId)).SendAsync("ChatMessageReceived", messageView);
    await PushNotification(notification, hub);
    return Results.Created($"/api/conexiones/{id}/mensajes/{message.Id}", new { message.Id, message.ConnectionId, message.SenderId, sender = senderName, message.Text, message.CreatedAt, isMine = true });
});

var notifications = secured.MapGroup("/notificaciones").WithTags("Notificaciones");
notifications.MapGet("", async (ClaimsPrincipal p, ConectaMentesDbContext db) => Results.Ok(await db.Notifications.Where(x => x.UserId == ApiIdentity.UserId(p)).OrderByDescending(x => x.CreatedAt).Take(60).Select(x => new { x.Id, x.Type, x.Title, x.Body, x.ReferenceId, x.IsRead, x.CreatedAt }).ToListAsync()));
notifications.MapPost("/{id:guid}/leer", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) =>
{
    var item = await db.Notifications.SingleOrDefaultAsync(x => x.Id == id && x.UserId == ApiIdentity.UserId(p));
    if (item is null) return Results.NotFound();
    item.IsRead = true;
    await db.SaveChangesAsync();
    return Results.Ok(NotificationView(item));
});
notifications.MapPost("/leer-todas", async (ClaimsPrincipal p, ConectaMentesDbContext db) =>
{
    await db.Notifications.Where(x => x.UserId == ApiIdentity.UserId(p) && !x.IsRead).ExecuteUpdateAsync(setters => setters.SetProperty(x => x.IsRead, true));
    return Results.NoContent();
});
var sessions = secured.MapGroup("/sesiones").WithTags("Agenda");
sessions.MapGet("", async (ClaimsPrincipal p, ConectaMentesDbContext db) =>
{
    var userId = ApiIdentity.UserId(p);
    return Results.Ok(await (from session in db.Sessions
        join connection in db.Connections on session.ConnectionId equals connection.Id
        where connection.RequesterId == userId || connection.CollaboratorId == userId
        orderby session.Date
        select new { session.Id, session.ConnectionId, session.Date, session.DurationMinutes, session.Mode, session.Objective, session.Guide, session.Status }).ToListAsync());
});
sessions.MapPut("/{id:guid}", async (Guid id, SessionInput input, ClaimsPrincipal p, ConectaMentesDbContext db) => await UpdateSession(id, input, p, db));
sessions.MapPost("/{id:guid}/cancelar", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) => await SetSessionStatus(id, SessionStatus.Cancelada, p, db));
sessions.MapPost("/{id:guid}/completar", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) => await SetSessionStatus(id, SessionStatus.Completada, p, db));

var ratings = secured.MapGroup("/sesiones/{sessionId:guid}/valoraciones").WithTags("Valoraciones");
ratings.MapPost("", async (Guid sessionId, RatingInput input, ClaimsPrincipal p, ConectaMentesDbContext db, IHubContext<RealtimeHub> hub) =>
{
    var authorId = ApiIdentity.UserId(p);
    var session = await db.Sessions.SingleOrDefaultAsync(x => x.Id == sessionId && x.Status == SessionStatus.Completada);
    if (session is null) return Results.NotFound();
    var connection = await db.Connections.SingleAsync(x => x.Id == session.ConnectionId);
    if (connection.RequesterId != authorId && connection.CollaboratorId != authorId) return Results.Forbid();
    var evaluated = connection.RequesterId == authorId ? connection.CollaboratorId : connection.RequesterId;
    var rating = new Rating { SessionId = sessionId, AuthorId = authorId, EvaluatedUserId = evaluated, Usefulness = input.Usefulness, Respect = input.Respect, Fulfillment = input.Fulfillment, Clarity = input.Clarity, Comment = input.Comment?.Trim() ?? "" };
    var authorName = await db.Users.Where(x => x.Id == authorId).Select(x => x.DisplayName).SingleAsync();
    var notification = NewNotification(evaluated, "comment", "Nueva valoración recibida", string.IsNullOrWhiteSpace(rating.Comment) ? $"{authorName} valoró la sesión compartida." : $"{authorName}: {rating.Comment}", connection.Id);
    db.AddRange(rating, notification);
    await db.SaveChangesAsync();
    await PushNotification(notification, hub);
    var count = await db.Ratings.CountAsync(x => x.EvaluatedUserId == evaluated);
    var avg = await db.Ratings.Where(x => x.EvaluatedUserId == evaluated).AverageAsync(x => (double)(x.Usefulness + x.Respect + x.Fulfillment + x.Clarity) / 4);
    if (count >= 3 && avg >= 4 && !await db.Recognitions.AnyAsync(x => x.UserId == evaluated)) { db.Add(new Recognition { UserId = evaluated, CriterionOrigin = "3 sesiones valoradas positivamente" }); await db.SaveChangesAsync(); }
    return Results.Created($"/api/sesiones/{sessionId}/valoraciones", rating);
});
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
Notification NewNotification(Guid userId, string type, string title, string body, Guid? referenceId = null) => new() { UserId = userId, Type = type, Title = title, Body = body, ReferenceId = referenceId };
object NotificationView(Notification item) => new { item.Id, item.Type, item.Title, item.Body, item.ReferenceId, item.IsRead, item.CreatedAt };
async Task PushNotification(Notification item, IHubContext<RealtimeHub> hub) => await hub.Clients.Group(RealtimeHub.UserGroup(item.UserId)).SendAsync("NotificationReceived", NotificationView(item));
string FormatDominicanDateTime(DateTimeOffset value)
{
    var local = value.ToOffset(TimeSpan.FromHours(-4));
    var hour = local.Hour % 12 is 0 ? 12 : local.Hour % 12;
    var period = local.Hour < 12 ? "a. m." : "p. m.";
    return $"{local:dd/MM/yyyy} a las {hour}:{local:mm} {period}";
}

app.Run();

public partial class Program;

public sealed record RegisterRequest(string Email, string Password, string DisplayName, string Career, string AcademicTerm);
public sealed record LoginRequest(string Email, string Password);
public sealed record GoogleLoginRequest(string Credential);
public sealed record SkillRequest(string Topic, SkillType Type, int Confidence, bool Visible = true);
public sealed record AvailabilityRequest(string TimeSlots, string PreferredMode);
public sealed record SupportRequestInput(string Topic, string Description, string HelpType, string DesiredSchedule);
public sealed record ConnectionResponse(bool Accept);
public sealed record ChatMessageInput(string Text);
public sealed record SessionInput(DateTimeOffset Date, int DurationMinutes, string Mode, string Objective);
public sealed record RatingInput(int Usefulness, int Respect, int Fulfillment, int Clarity, string? Comment);
public sealed record ReportInput(Guid ReportedUserId, Guid ReferenceId, string Reason, string Description);
public sealed record ModerationInput(ReportStatus Status, string ResolutionNote);
