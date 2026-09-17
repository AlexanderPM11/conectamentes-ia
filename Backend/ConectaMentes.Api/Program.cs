using System.Security.Claims;
using System.Text;
using ConectaMentes.Api;
using ConectaMentes.Api.Auth;
using ConectaMentes.Application.Auth;
using ConectaMentes.Application.Reputation;
using ConectaMentes.Domain.Entities;
using ConectaMentes.Infrastructure;
using ConectaMentes.Infrastructure.Persistence;
using Google.Apis.Auth;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
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
builder.Services.AddSingleton<IUserTracker, InMemoryUserTracker>();
builder.Services.Configure<FormOptions>(options => options.MultipartBodyLengthLimit = ChatAttachmentStorage.DefaultMaxBytes + 512 * 1024);
builder.Services.AddSingleton<ChatAttachmentStorage>();
builder.Services.AddSingleton<ProfileAvatarStorage>();
builder.Services.AddHttpClient();
builder.Services.AddHttpClient("GoogleCalendar", client => client.BaseAddress = new Uri("https://www.googleapis.com/"));
builder.Services.AddScoped<GoogleCalendarService>();
builder.Services.AddScoped<DevicePushService>();
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
    options.AddPolicy("SuperAdmin", policy => policy.RequireRole("superadmin"));
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
    await db.Database.ExecuteSqlRawAsync("""
        CREATE TABLE IF NOT EXISTS `ChatAttachments` (
          `Id` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
          `MessageId` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
          `ConnectionId` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
          `SenderId` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
          `FileName` varchar(180) NOT NULL,
          `StoredName` varchar(260) NOT NULL,
          `ContentType` varchar(120) NOT NULL,
          `SizeBytes` bigint NOT NULL,
          `CreatedAt` datetime(6) NOT NULL,
          PRIMARY KEY (`Id`), UNIQUE INDEX `IX_ChatAttachments_MessageId` (`MessageId`), INDEX `IX_ChatAttachments_ConnectionId_CreatedAt` (`ConnectionId`,`CreatedAt`)
        );
        """);
    await db.Database.ExecuteSqlRawAsync("""
        CREATE TABLE IF NOT EXISTS `PushSubscriptions` (
          `Id` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
          `UserId` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
          `EndpointHash` varchar(64) NOT NULL,
          `Endpoint` varchar(2048) NOT NULL,
          `P256dh` varchar(256) NOT NULL,
          `Auth` varchar(128) NOT NULL,
          `CreatedAt` datetime(6) NOT NULL,
          `UpdatedAt` datetime(6) NOT NULL,
          PRIMARY KEY (`Id`), UNIQUE INDEX `IX_PushSubscriptions_EndpointHash` (`EndpointHash`), INDEX `IX_PushSubscriptions_UserId` (`UserId`)
        );
        """);
    await EnsureColumnAsync(db, "Sessions", "MeetUrl");
    await EnsureColumnAsync(db, "Sessions", "GoogleCalendarEventId");
    await EnsureColumnAsync(db, "Users", "AccessStatus");
    await EnsureColumnAsync(db, "Users", "AccessStatusReason");
    await EnsureColumnAsync(db, "Users", "AccessStatusChangedAt");
    await EnsureColumnAsync(db, "Users", "AvatarPath");
    await EnsureColumnAsync(db, "Users", "AvatarUpdatedAt");
    await EnsureIndexAsync(db, "Ratings", "UX_Ratings_SessionId_AuthorId", "CREATE UNIQUE INDEX `UX_Ratings_SessionId_AuthorId` ON `Ratings` (`SessionId`, `AuthorId`);");
    await EnsureAdminRootAsync(db, builder.Configuration);
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
    try
    {
        var result = await service.LoginAsync(new(request.Email, request.Password), ct);
        return result is null ? Results.Unauthorized() : Results.Ok(result);
    }
    catch (AccountAccessException ex) { return Results.Problem(statusCode: StatusCodes.Status403Forbidden, title: "Acceso restringido", detail: ex.Message, extensions: new Dictionary<string, object?> { ["code"] = $"account_{ex.Status}" }); }
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
        try { return Results.Ok(await service.LoginWithGoogleAsync(new(payload.Email, payload.Name ?? payload.Email), ct)); }
        catch (AccountAccessException ex) { return Results.Problem(statusCode: StatusCodes.Status403Forbidden, title: "Acceso restringido", detail: ex.Message, extensions: new Dictionary<string, object?> { ["code"] = $"account_{ex.Status}" }); }
    }
    catch (InvalidJwtException) { return Results.Unauthorized(); }
}).WithName("GoogleLogin").WithOpenApi();

app.MapGet("/api/usuarios/me", async (ClaimsPrincipal principal, IAuthService service, CancellationToken ct) =>
{
    var idValue = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? principal.FindFirstValue("sub");
    return Guid.TryParse(idValue, out var id) && await service.GetProfileAsync(id, ct) is { } profile ? Results.Ok(profile) : Results.NotFound();
}).RequireAuthorization().WithTags("Usuarios").WithName("GetCurrentUser").WithOpenApi();

app.MapGet("/api/usuarios/{id:guid}/avatar", async (Guid id, ClaimsPrincipal principal, ConectaMentesDbContext db, ProfileAvatarStorage avatars, CancellationToken ct) =>
{
    var user = await db.Users.SingleOrDefaultAsync(item => item.Id == id, ct);
    if (user?.AvatarPath is null) return Results.NotFound();
    var path = avatars.Resolve(user.AvatarPath);
    return File.Exists(path) ? Results.File(path, GetAvatarContentType(user.AvatarPath)) : Results.NotFound();
}).RequireAuthorization().WithTags("Usuarios").WithName("GetUserAvatar").WithOpenApi();

app.MapGet("/api/usuarios/conectados", (IUserTracker tracker) => Results.Ok(tracker.GetOnlineUsers())).RequireAuthorization().WithTags("Usuarios").WithName("GetOnlineUsers").WithOpenApi();

var secured = app.MapGroup("/api").RequireAuthorization();

var profile = secured.MapGroup("/perfil").WithTags("Perfil");
profile.MapGet("", async (ClaimsPrincipal p, ConectaMentesDbContext db) => Results.Ok(new { habilidades = await db.SkillProfiles.Where(x => x.UserId == ApiIdentity.UserId(p)).ToListAsync(), disponibilidad = await db.Availabilities.SingleOrDefaultAsync(x => x.UserId == ApiIdentity.UserId(p)) }));
profile.MapPut("/datos", async (ProfileUpdateRequest request, ClaimsPrincipal p, ConectaMentesDbContext db, CancellationToken ct) =>
{
    var user = await db.Users.SingleOrDefaultAsync(item => item.Id == ApiIdentity.UserId(p), ct);
    if (user is null) return Results.NotFound();
    try { user.UpdateProfile(request.DisplayName, request.Career, request.AcademicTerm); await db.SaveChangesAsync(ct); return Results.Ok(UserProfile.From(user)); }
    catch (ArgumentException ex) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["profile"] = [ex.Message] }); }
}).WithName("UpdateProfileData").WithOpenApi();
profile.MapPut("/avatar", async (IFormFile file, ClaimsPrincipal p, ConectaMentesDbContext db, ProfileAvatarStorage avatars, CancellationToken ct) =>
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

var pushEndpoints = secured.MapGroup("/push").WithTags("Notificaciones push");
pushEndpoints.MapGet("/public-key", (DevicePushService devicePush) => devicePush.PublicKey is { } key
    ? Results.Ok(new { publicKey = key })
    : Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "Notificaciones push no configuradas"));
pushEndpoints.MapPost("/subscriptions", async (PushSubscriptionInput input, ClaimsPrincipal principal, DevicePushService devicePush, CancellationToken ct) =>
{
    try
    {
        await devicePush.SaveSubscriptionAsync(ApiIdentity.UserId(principal), input.Endpoint, input.Keys.P256dh, input.Keys.Auth, ct);
        return Results.NoContent();
    }
    catch (ArgumentException exception)
    {
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["subscription"] = [exception.Message] });
    }
    catch (InvalidOperationException exception)
    {
        return Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "Notificaciones push no configuradas", detail: exception.Message);
    }
});
pushEndpoints.MapDelete("/subscriptions", async ([FromBody] PushUnsubscribeInput input, ClaimsPrincipal principal, DevicePushService devicePush, CancellationToken ct) =>
{
    await devicePush.RemoveSubscriptionAsync(ApiIdentity.UserId(principal), input.Endpoint, ct);
    return Results.NoContent();
});
profile.MapPost("/habilidades", async (SkillRequest request, ClaimsPrincipal p, ConectaMentesDbContext db) => { if (request.Confidence is < 1 or > 5) return Results.ValidationProblem(new Dictionary<string, string[]> { ["confidence"] = ["Debe estar entre 1 y 5."] }); var item = new SkillProfile { UserId = ApiIdentity.UserId(p), Topic = request.Topic.Trim(), Type = request.Type, Confidence = request.Confidence, Visible = request.Visible }; db.SkillProfiles.Add(item); await db.SaveChangesAsync(); return Results.Created($"/api/perfil/habilidades/{item.Id}", item); });
profile.MapPut("/habilidades/{id:guid}", async (Guid id, SkillRequest request, ClaimsPrincipal p, ConectaMentesDbContext db) => { if (string.IsNullOrWhiteSpace(request.Topic) || request.Confidence is < 1 or > 5) return Results.ValidationProblem(new Dictionary<string, string[]> { ["skill"] = ["Indica un tema y una confianza entre 1 y 5."] }); var item = await db.SkillProfiles.SingleOrDefaultAsync(x => x.Id == id && x.UserId == ApiIdentity.UserId(p)); if (item is null) return Results.NotFound(); item.Topic = request.Topic.Trim(); item.Type = request.Type; item.Confidence = request.Confidence; item.Visible = request.Visible; await db.SaveChangesAsync(); return Results.Ok(item); });
profile.MapDelete("/habilidades/{id:guid}", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) => { var item = await db.SkillProfiles.SingleOrDefaultAsync(x => x.Id == id && x.UserId == ApiIdentity.UserId(p)); if (item is null) return Results.NotFound(); db.Remove(item); await db.SaveChangesAsync(); return Results.NoContent(); });
profile.MapPut("/disponibilidad", async (AvailabilityRequest request, ClaimsPrincipal p, ConectaMentesDbContext db) => { var item = await db.Availabilities.SingleOrDefaultAsync(x => x.UserId == ApiIdentity.UserId(p)); if (item is null) { item = new Availability { UserId = ApiIdentity.UserId(p) }; db.Add(item); } item.TimeSlots = request.TimeSlots.Trim(); item.PreferredMode = request.PreferredMode; await db.SaveChangesAsync(); return Results.Ok(item); });

var requests = secured.MapGroup("/solicitudes").WithTags("Solicitudes");
requests.MapPost("", async (SupportRequestInput input, ClaimsPrincipal p, ConectaMentesDbContext db) => {
    if (string.IsNullOrWhiteSpace(input.Topic) || string.IsNullOrWhiteSpace(input.Description))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["request"] = ["Tema y descripción son obligatorios."] });
    var item = new SupportRequest {
        UserId = ApiIdentity.UserId(p),
        Topic = input.Topic.Trim(),
        Description = input.Description.Trim(),
        HelpType = string.IsNullOrWhiteSpace(input.HelpType) ? "comprender" : input.HelpType.Trim(),
        DesiredSchedule = string.IsNullOrWhiteSpace(input.DesiredSchedule) ? "" : input.DesiredSchedule.Trim()
    };
    db.Add(item);
    await db.SaveChangesAsync();
    return Results.Created($"/api/solicitudes/{item.Id}", item);
});
requests.MapGet("/mias", async (ClaimsPrincipal p, ConectaMentesDbContext db) => Results.Ok(await db.SupportRequests.Where(x => x.UserId == ApiIdentity.UserId(p)).OrderByDescending(x => x.CreatedAt).ToListAsync()));
requests.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) => await db.SupportRequests.SingleOrDefaultAsync(x => x.Id == id && x.UserId == ApiIdentity.UserId(p)) is { } item ? Results.Ok(item) : Results.NotFound());
requests.MapPut("/{id:guid}", async (Guid id, SupportRequestInput input, ClaimsPrincipal p, ConectaMentesDbContext db) => {
    var item = await db.SupportRequests.SingleOrDefaultAsync(x => x.Id == id && x.UserId == ApiIdentity.UserId(p));
    if (item is null || item.Status is RequestStatus.Cancelada or RequestStatus.Conectada) return Results.NotFound();
    item.Topic = input.Topic.Trim();
    item.Description = input.Description.Trim();
    item.HelpType = string.IsNullOrWhiteSpace(input.HelpType) ? item.HelpType : input.HelpType.Trim();
    item.DesiredSchedule = string.IsNullOrWhiteSpace(input.DesiredSchedule) ? item.DesiredSchedule : input.DesiredSchedule.Trim();
    await db.SaveChangesAsync();
    return Results.Ok(item);
});
requests.MapPost("/{id:guid}/cancelar", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) => { var item = await db.SupportRequests.SingleOrDefaultAsync(x => x.Id == id && x.UserId == ApiIdentity.UserId(p)); if (item is null) return Results.NotFound(); item.Status = RequestStatus.Cancelada; await db.SaveChangesAsync(); return Results.Ok(item); });
requests.MapPost("/asistente-ia", async (AiSupportRequestPrompt input, IConfiguration config, IHttpClientFactory httpClientFactory) =>
{
    if (string.IsNullOrWhiteSpace(input.Prompt))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["prompt"] = ["Por favor escribe lo que necesitas aprender."] });

    var rawPrompt = input.Prompt.Trim();
    string? suggestedTopic = null;
    string? suggestedDescription = null;

    var minimaxKey = config["MINIMAX_API_KEY"] ?? Environment.GetEnvironmentVariable("MINIMAX_API_KEY");
    var openaiKey = config["OPENAI_API_KEY"] ?? Environment.GetEnvironmentVariable("OPENAI_API_KEY");
    var groqKey = config["GROQ_API_KEY"] ?? Environment.GetEnvironmentVariable("GROQ_API_KEY");

    if (!string.IsNullOrWhiteSpace(minimaxKey) || !string.IsNullOrWhiteSpace(openaiKey) || !string.IsNullOrWhiteSpace(groqKey))
    {
        try
        {
            var httpClient = httpClientFactory.CreateClient();
            httpClient.Timeout = TimeSpan.FromSeconds(15);
            string endpoint;
            string model;
            string authKey;

            if (!string.IsNullOrWhiteSpace(minimaxKey))
            {
                endpoint = "https://api.minimax.chat/v1/text/chatcompletion_v2";
                model = "MiniMax-Text-01";
                authKey = minimaxKey;
            }
            else if (!string.IsNullOrWhiteSpace(groqKey))
            {
                endpoint = "https://api.groq.com/openai/v1/chat/completions";
                model = "llama-3.3-70b-versatile";
                authKey = groqKey;
            }
            else
            {
                endpoint = "https://api.openai.com/v1/chat/completions";
                model = "gpt-4o-mini";
                authKey = openaiKey!;
            }

            var requestBody = new
            {
                model = model,
                messages = new object[]
                {
                    new
                    {
                        role = "system",
                        content = "Eres el asistente pedagógico de ConectaMentes IA. Tu función es ayudar a un estudiante universitario a estructurar una solicitud de estudio entre pares a partir de lo que expresa con sus palabras.\nGenera ÚNICAMENTE un JSON válido con dos campos de texto:\n1. \"topic\": Título o materia académico preciso y conciso (máximo 50 caracteres, ej: \"Cálculo: Regla de la cadena\", \"Python: Funciones recursivas\").\n2. \"description\": Explicación orientada al aprendizaje colaborativo y comprensión (máximo 220 caracteres, ej: \"Quiero comprender los pasos de la regla de la cadena y practicar ejercicios paso a paso para prepararme bien.\").\nRegla crucial: La solicitud debe promover el aprendizaje y la colaboración, NUNCA pedir que alguien haga tareas o exámenes por el estudiante.\nDevuelve ÚNICAMENTE el objeto JSON sin formato markdown."
                    },
                    new
                    {
                        role = "user",
                        content = rawPrompt
                    }
                },
                temperature = 0.3
            };

            var httpRequest = new HttpRequestMessage(HttpMethod.Post, endpoint);
            httpRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", authKey);
            httpRequest.Content = new StringContent(System.Text.Json.JsonSerializer.Serialize(requestBody), System.Text.Encoding.UTF8, "application/json");

            var response = await httpClient.SendAsync(httpRequest);
            if (response.IsSuccessStatusCode)
            {
                var content = await response.Content.ReadAsStringAsync();
                using var doc = System.Text.Json.JsonDocument.Parse(content);
                var root = doc.RootElement;
                string? messageText = null;

                if (root.TryGetProperty("choices", out var choices) && choices.GetArrayLength() > 0)
                {
                    var firstChoice = choices[0];
                    if (firstChoice.TryGetProperty("message", out var message) && message.TryGetProperty("content", out var msgContent))
                    {
                        messageText = msgContent.GetString();
                    }
                }

                if (!string.IsNullOrWhiteSpace(messageText))
                {
                    var cleaned = messageText.Trim();
                    if (cleaned.StartsWith("```"))
                    {
                        var start = cleaned.IndexOf('\n');
                        var end = cleaned.LastIndexOf("```");
                        if (start >= 0 && end > start) cleaned = cleaned.Substring(start + 1, end - start - 1).Trim();
                    }

                    using var parsedDoc = System.Text.Json.JsonDocument.Parse(cleaned);
                    if (parsedDoc.RootElement.TryGetProperty("topic", out var t) && parsedDoc.RootElement.TryGetProperty("description", out var d))
                    {
                        suggestedTopic = t.GetString()?.Trim();
                        suggestedDescription = d.GetString()?.Trim();
                    }
                }
            }
        }
        catch
        {
            // Fall back to built-in semantic processor
        }
    }

    if (string.IsNullOrWhiteSpace(suggestedTopic) || string.IsNullOrWhiteSpace(suggestedDescription))
    {
        var (t, d) = GenerateAcademicFallback(rawPrompt);
        suggestedTopic = t;
        suggestedDescription = d;
    }

    return Results.Ok(new AiSupportRequestSuggestion(suggestedTopic, suggestedDescription));
});

var matches = secured.MapGroup("/solicitudes/{requestId:guid}").WithTags("Coincidencias");
matches.MapPost("/calcular-coincidencias", async (Guid requestId, ClaimsPrincipal p, ConectaMentesDbContext db) => { var request = await db.SupportRequests.SingleOrDefaultAsync(x => x.Id == requestId && x.UserId == ApiIdentity.UserId(p)); if (request is null) return Results.NotFound(); var topic = request.Topic.ToLower(); var blocked = await db.Blocks.Where(x => x.UserId == ApiIdentity.UserId(p)).Select(x => x.BlockedUserId).ToListAsync(); var candidates = await db.SkillProfiles.Where(x => x.Type == SkillType.Domina && x.UserId != ApiIdentity.UserId(p) && !blocked.Contains(x.UserId) && x.Topic.ToLower() == topic).ToListAsync(); var old = db.Matches.Where(x => x.RequestId == requestId); db.RemoveRange(old); foreach (var candidate in candidates.Take(10)) db.Matches.Add(new Match { RequestId = requestId, CandidateUserId = candidate.UserId, Score = Math.Round(candidate.Confidence * 20m, 2), Explanation = $"Domina {candidate.Topic} y puede apoyarte con tu objetivo." }); request.Status = candidates.Count > 0 ? RequestStatus.ConCoincidencias : RequestStatus.Abierta; await db.SaveChangesAsync(); return Results.Ok(candidates.Count); });
matches.MapGet("/coincidencias", async (Guid requestId, ClaimsPrincipal p, ConectaMentesDbContext db) =>
{
    if (!await db.SupportRequests.AnyAsync(x => x.Id == requestId && x.UserId == ApiIdentity.UserId(p))) return Results.NotFound();
    return Results.Ok(await (from m in db.Matches join u in db.Users on m.CandidateUserId equals u.Id where m.RequestId == requestId select new { m.Id, m.Score, m.Explanation, m.Status, candidate = u.DisplayName, m.CandidateUserId }).OrderByDescending(x => x.Score).ToListAsync());
});
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
matchActions.MapPost("/{id:guid}/aceptar", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db, IHubContext<RealtimeHub> hub, DevicePushService devicePush) =>
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
    await PushNotification(notification, hub, devicePush);
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
connections.MapGet("/{id:guid}/solicitante", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db, CancellationToken ct) =>
{
    var userId = ApiIdentity.UserId(p);
    var connection = await db.Connections.SingleOrDefaultAsync(item => item.Id == id && item.CollaboratorId == userId && item.Status == ConnectionStatus.PendienteColaborador, ct);
    if (connection is null) return Results.NotFound();
    var requester = await db.Users.SingleOrDefaultAsync(item => item.Id == connection.RequesterId, ct);
    var request = await db.SupportRequests.SingleOrDefaultAsync(item => item.Id == connection.RequestId, ct);
    if (requester is null || request is null) return Results.NotFound();
    var skills = await db.SkillProfiles.Where(item => item.UserId == requester.Id && item.Visible).OrderByDescending(item => item.Confidence).Take(12).Select(item => new { item.Topic, item.Type, item.Confidence }).ToListAsync(ct);
    var availability = await db.Availabilities.Where(item => item.UserId == requester.Id).Select(item => new { item.TimeSlots, item.PreferredMode }).SingleOrDefaultAsync(ct);
    var ratingRows = await db.Ratings.Where(item => item.EvaluatedUserId == requester.Id).Select(item => new { item.Usefulness, item.Clarity, item.Fulfillment, item.Respect }).ToListAsync(ct);
    var average = ratingRows.Count == 0 ? 0 : Math.Round(ratingRows.Average(item => (item.Usefulness + item.Clarity + item.Fulfillment + item.Respect) / 4d), 2);
    return Results.Ok(new
    {
        connectionId = connection.Id,
        request = new { request.Topic, request.Description, request.HelpType, request.DesiredSchedule, request.CreatedAt },
        person = new { requester.Id, requester.DisplayName, requester.Career, requester.AcademicTerm, requester.CreatedAt, requester.AvatarUpdatedAt },
        skills,
        availability,
        reputation = new { average, totalRatings = ratingRows.Count }
    });
});
connections.MapPost("/{id:guid}/responder", async (Guid id, ConnectionResponse input, ClaimsPrincipal p, ConectaMentesDbContext db, IHubContext<RealtimeHub> hub, DevicePushService devicePush) =>
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
    await PushNotification(notification, hub, devicePush);
    return Results.Ok(item);
});
connections.MapPost("/{id:guid}/sesiones", async (Guid id, SessionInput input, ClaimsPrincipal p, ConectaMentesDbContext db, IHubContext<RealtimeHub> hub, DevicePushService devicePush) =>
{
    if (ValidateSessionInput(input) is { } validationError) return validationError;
    var userId = ApiIdentity.UserId(p);
    var connection = await db.Connections.SingleOrDefaultAsync(x => x.Id == id && (x.RequesterId == userId || x.CollaboratorId == userId) && x.Status == ConnectionStatus.Activa);
    if (connection is null) return Results.NotFound();
    var session = new LearningSession { ConnectionId = id, Date = input.Date, DurationMinutes = input.DurationMinutes, Mode = input.Mode, Objective = input.Objective, Guide = $"Objetivo: {input.Objective}.\nEjercicio inicial: identificar la duda principal.\nComprobación final: explicar el concepto con tus palabras." };
    var senderName = await db.Users.Where(x => x.Id == userId).Select(x => x.DisplayName).SingleAsync();
    var recipientId = connection.RequesterId == userId ? connection.CollaboratorId : connection.RequesterId;
    var notification = NewNotification(recipientId, "session", "Nueva sesión propuesta", $"{senderName} propuso una sesión para el {FormatDominicanDateTime(input.Date)}: {input.Objective}.", connection.Id);
    db.AddRange(session, notification);
    await db.SaveChangesAsync();
    await PushNotification(notification, hub, devicePush);
    return Results.Created($"/api/sesiones/{session.Id}", session);
});

connections.MapGet("/{id:guid}/mensajes", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) =>
{
    var userId = ApiIdentity.UserId(p);
    if (!await db.Connections.AnyAsync(x => x.Id == id && (x.RequesterId == userId || x.CollaboratorId == userId))) return Results.NotFound();
    var rows = await (from message in db.ChatMessages join sender in db.Users on message.SenderId equals sender.Id where message.ConnectionId == id orderby message.CreatedAt descending select new { Message = message, Sender = sender.DisplayName }).Take(100).ToListAsync();
    rows.Reverse();
    var messageIds = rows.Select(row => row.Message.Id).ToList();
    var attachments = await db.ChatAttachments.Where(item => messageIds.Contains(item.MessageId)).ToDictionaryAsync(item => item.MessageId);
    return Results.Ok(rows.Select(row => ChatMessageView(row.Message, row.Sender, row.Message.SenderId == userId, attachments.GetValueOrDefault(row.Message.Id))));
});
connections.MapPost("/{id:guid}/mensajes", async (Guid id, ChatMessageInput input, ClaimsPrincipal p, ConectaMentesDbContext db, IHubContext<RealtimeHub> hub, DevicePushService devicePush) =>
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
    var messageView = ChatMessageView(message, senderName, false, null);
    await hub.Clients.Groups(RealtimeHub.UserGroup(connection.RequesterId), RealtimeHub.UserGroup(connection.CollaboratorId)).SendAsync("ChatMessageReceived", messageView);
    await PushNotification(notification, hub, devicePush);
    return Results.Created($"/api/conexiones/{id}/mensajes/{message.Id}", ChatMessageView(message, senderName, true, null));
});
connections.MapPost("/{id:guid}/adjuntos", async (Guid id, HttpRequest request, ClaimsPrincipal p, ConectaMentesDbContext db, ChatAttachmentStorage storage, IHubContext<RealtimeHub> hub, DevicePushService devicePush, CancellationToken ct) =>
{
    var userId = ApiIdentity.UserId(p);
    var connection = await db.Connections.SingleOrDefaultAsync(x => x.Id == id && (x.RequesterId == userId || x.CollaboratorId == userId) && x.Status == ConnectionStatus.Activa, ct);
    if (connection is null) return Results.NotFound();
    if (!request.HasFormContentType) return Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = ["Selecciona un archivo válido."] });
    var form = await request.ReadFormAsync(ct);
    var file = form.Files.GetFile("file");
    if (file is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = ["Selecciona un archivo válido."] });
    var caption = form["caption"].ToString().Trim();
    if (caption.Length > 1500) return Results.ValidationProblem(new Dictionary<string, string[]> { ["caption"] = ["El mensaje debe tener hasta 1500 caracteres."] });

    var message = new ChatMessage { ConnectionId = id, SenderId = userId, Text = caption };
    var attachment = new ChatAttachment { MessageId = message.Id, ConnectionId = id, SenderId = userId };
    StoredChatFile stored;
    try { stored = await storage.SaveAsync(file, id, attachment.Id, ct); }
    catch (ChatFileValidationException ex) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = [ex.Message] }); }

    attachment.FileName = stored.FileName;
    attachment.StoredName = stored.StoredName;
    attachment.ContentType = stored.ContentType;
    attachment.SizeBytes = stored.SizeBytes;
    var senderName = await db.Users.Where(x => x.Id == userId).Select(x => x.DisplayName).SingleAsync(ct);
    var recipientId = connection.RequesterId == userId ? connection.CollaboratorId : connection.RequesterId;
    var notification = NewNotification(recipientId, "message", $"Nuevo archivo de {senderName}", string.IsNullOrWhiteSpace(caption) ? $"Compartió {stored.FileName}." : caption, id);
    db.AddRange(message, attachment, notification);
    try { await db.SaveChangesAsync(ct); }
    catch { storage.Delete(stored.StoredName); throw; }
    var messageView = ChatMessageView(message, senderName, false, attachment);
    await hub.Clients.Groups(RealtimeHub.UserGroup(connection.RequesterId), RealtimeHub.UserGroup(connection.CollaboratorId)).SendAsync("ChatMessageReceived", messageView, ct);
    await PushNotification(notification, hub, devicePush, ct);
    return Results.Created($"/api/conexiones/{id}/mensajes/{message.Id}", ChatMessageView(message, senderName, true, attachment));
}).WithMetadata(new RequestSizeLimitAttribute(ChatAttachmentStorage.DefaultMaxBytes + 512 * 1024)).DisableAntiforgery();

secured.MapGet("/adjuntos/{id:guid}", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db, ChatAttachmentStorage storage, CancellationToken ct) =>
{
    var userId = ApiIdentity.UserId(p);
    var attachment = await (from item in db.ChatAttachments join connection in db.Connections on item.ConnectionId equals connection.Id where item.Id == id && (connection.RequesterId == userId || connection.CollaboratorId == userId) select item).SingleOrDefaultAsync(ct);
    if (attachment is null) return Results.NotFound();
    var path = storage.Resolve(attachment.StoredName);
    return File.Exists(path) ? Results.File(File.OpenRead(path), attachment.ContentType, enableRangeProcessing: true) : Results.NotFound();
}).WithTags("Chat");

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
sessions.MapPut("/{id:guid}", async (Guid id, SessionInput input, ClaimsPrincipal p, ConectaMentesDbContext db) => await UpdateSession(id, input, p, db));
sessions.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) => await DeleteSession(id, p, db));
sessions.MapPost("/{id:guid}/cancelar", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) => await SetSessionStatus(id, SessionStatus.Cancelada, p, db));
sessions.MapPost("/{id:guid}/completar", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) => await SetSessionStatus(id, SessionStatus.Completada, p, db));
sessions.MapPost("/{id:guid}/google-meet", async (Guid id, GoogleMeetRequest input, ClaimsPrincipal p, ConectaMentesDbContext db, GoogleCalendarService calendar, IHubContext<RealtimeHub> hub, DevicePushService devicePush, CancellationToken ct) =>
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
    var notification = NewNotification(recipientId, "meeting", "Google Meet listo", $"{creator.DisplayName} creó el enlace para la sesión sobre {item.Topic}.", item.Connection.Id);
    db.AddRange(chatMessage, notification);
    await db.SaveChangesAsync(ct);
    await hub.Clients.Groups(RealtimeHub.UserGroup(item.Connection.RequesterId), RealtimeHub.UserGroup(item.Connection.CollaboratorId)).SendAsync("ChatMessageReceived", ChatMessageView(chatMessage, creator.DisplayName, false, null), ct);
    await PushNotification(notification, hub, devicePush, ct);
    return Results.Ok(new { meetUrl = meeting.MeetUrl, calendarUrl = meeting.CalendarUrl, pending = false });
});

var ratings = secured.MapGroup("/sesiones/{sessionId:guid}/valoraciones").WithTags("Valoraciones");
ratings.MapPost("", async (Guid sessionId, RatingInput input, ClaimsPrincipal p, ConectaMentesDbContext db, IHubContext<RealtimeHub> hub, DevicePushService devicePush) =>
{
    var authorId = ApiIdentity.UserId(p);
    if (input.Usefulness is < 1 or > 5 || input.Respect is < 1 or > 5 || input.Fulfillment is < 1 or > 5 || input.Clarity is < 1 or > 5)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["rating"] = ["Cada calificación debe estar entre 1 y 5."] });
    if ((input.Comment?.Trim().Length ?? 0) > 500)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["comment"] = ["El comentario puede tener hasta 500 caracteres."] });
    var session = await db.Sessions.SingleOrDefaultAsync(x => x.Id == sessionId && x.Status == SessionStatus.Completada);
    if (session is null) return Results.NotFound();
    var connection = await db.Connections.SingleAsync(x => x.Id == session.ConnectionId);
    if (connection.RequesterId != authorId) return Results.Forbid();
    if (await db.Ratings.AnyAsync(x => x.SessionId == sessionId && x.AuthorId == authorId))
        return Results.Conflict(new { message = "Ya calificaste esta orientación." });
    var evaluated = connection.CollaboratorId;
    var rating = new Rating { SessionId = sessionId, AuthorId = authorId, EvaluatedUserId = evaluated, Usefulness = input.Usefulness, Respect = input.Respect, Fulfillment = input.Fulfillment, Clarity = input.Clarity, Comment = input.Comment?.Trim() ?? "" };
    var authorName = await db.Users.Where(x => x.Id == authorId).Select(x => x.DisplayName).SingleAsync();
    var notification = NewNotification(evaluated, "comment", "Nueva valoración recibida", string.IsNullOrWhiteSpace(rating.Comment) ? $"{authorName} valoró la sesión compartida." : $"{authorName}: {rating.Comment}", connection.Id);
    db.AddRange(rating, notification);
    await db.SaveChangesAsync();
    await PushNotification(notification, hub, devicePush);
    var count = await db.Ratings.CountAsync(x => x.EvaluatedUserId == evaluated);
    var avg = await db.Ratings.Where(x => x.EvaluatedUserId == evaluated).AverageAsync(x => (double)(x.Usefulness + x.Respect + x.Fulfillment + x.Clarity) / 4);
    if (count >= 3 && avg >= 4 && !await db.Recognitions.AnyAsync(x => x.UserId == evaluated)) { db.Add(new Recognition { UserId = evaluated, CriterionOrigin = "3 sesiones valoradas positivamente" }); await db.SaveChangesAsync(); }
    return Results.Created($"/api/sesiones/{sessionId}/valoraciones", rating);
});
app.MapGet("/api/usuarios/{id:guid}/reconocimientos", async (Guid id, ConectaMentesDbContext db) => Results.Ok(await db.Recognitions.Where(x => x.UserId == id).ToListAsync())).RequireAuthorization().WithTags("Valoraciones");
app.MapGet("/api/usuarios/{id:guid}/reputacion", async (Guid id, ConectaMentesDbContext db) =>
{
    if (!await db.Users.AnyAsync(user => user.Id == id)) return Results.NotFound();
    var rows = (await ReputationRows(db).ToListAsync()).Where(row => row.EvaluatedUserId == id).ToList();
    var overall = rows.Count == 0 ? 0 : Math.Round(rows.Average(row => row.Score), 2);
    var topics = rows.GroupBy(row => row.Topic, StringComparer.OrdinalIgnoreCase).Select(group => new
    {
        topic = group.Key,
        total = group.Count(),
        average = Math.Round(group.Average(row => row.Score), 2),
        usefulness = Math.Round(group.Average(row => row.Usefulness), 2),
        respect = Math.Round(group.Average(row => row.Respect), 2),
        fulfillment = Math.Round(group.Average(row => row.Fulfillment), 2),
        clarity = Math.Round(group.Average(row => row.Clarity), 2)
    }).OrderByDescending(topic => topic.total).ThenByDescending(topic => topic.average).ToList();
    return Results.Ok(new
    {
        total = rows.Count,
        average = overall,
        usefulness = rows.Count == 0 ? 0 : Math.Round(rows.Average(row => row.Usefulness), 2),
        respect = rows.Count == 0 ? 0 : Math.Round(rows.Average(row => row.Respect), 2),
        fulfillment = rows.Count == 0 ? 0 : Math.Round(rows.Average(row => row.Fulfillment), 2),
        clarity = rows.Count == 0 ? 0 : Math.Round(rows.Average(row => row.Clarity), 2),
        topics,
        comments = rows.Where(row => !string.IsNullOrWhiteSpace(row.Comment)).OrderByDescending(row => row.CreatedAt).Take(20).Select(row => new { row.Topic, row.Comment, row.CreatedAt }).ToList()
    });
}).RequireAuthorization().WithTags("Valoraciones");

app.MapGet("/api/ranking", async (string? topic, ConectaMentesDbContext db) =>
{
    var normalizedTopic = topic?.Trim().ToLowerInvariant();
    var rows = await ReputationRows(db).ToListAsync();
    if (!string.IsNullOrWhiteSpace(normalizedTopic)) rows = rows.Where(row => row.Topic.Contains(normalizedTopic, StringComparison.OrdinalIgnoreCase)).ToList();
    if (rows.Count == 0) return Results.Ok(Array.Empty<ReputationRankingItem>());
    var communityMean = rows.Average(row => row.Score);
    var ranking = rows.GroupBy(row => new { row.EvaluatedUserId, row.DisplayName, row.Career, row.Topic }).Select(group =>
    {
        var average = Math.Round(group.Average(row => row.Score), 2);
        return new ReputationRankingItem(group.Key.EvaluatedUserId, group.Key.DisplayName, group.Key.Career, group.Key.Topic, group.Count(), average, ReputationCalculator.RankingScore(average, group.Count(), communityMean), Math.Round(group.Average(row => row.Clarity), 2), Math.Round(group.Average(row => row.Fulfillment), 2), 0);
    }).OrderByDescending(item => item.RankingScore).ThenByDescending(item => item.TotalRatings).ThenBy(item => item.DisplayName).Take(50).ToList();
    return Results.Ok(ranking.Select((item, index) => item with { Position = index + 1 }));
}).RequireAuthorization().WithTags("Valoraciones");

var panel = app.MapGroup("/api/panel").RequireAuthorization("Institutional").WithTags("Panel institucional");
panel.MapGet("/temas-mas-solicitados", async (ConectaMentesDbContext db) => Results.Ok(await db.SupportRequests.GroupBy(x => x.Topic).Where(g => g.Count() >= 5).OrderByDescending(g => g.Count()).Select(g => new { tema = g.Key, solicitudes = g.Count() }).ToListAsync()));
panel.MapGet("/demanda-no-atendida", async (ConectaMentesDbContext db) => Results.Ok(await db.SupportRequests.Where(x => x.Status == RequestStatus.Abierta).GroupBy(x => x.Topic).Where(g => g.Count() >= 5).Select(g => new { tema = g.Key, noAtendidas = g.Count() }).ToListAsync()));
panel.MapGet("/participacion-general", async (ConectaMentesDbContext db) => Results.Ok(new { estudiantes = await db.Users.CountAsync(), colaboradores = await db.SkillProfiles.Where(x => x.Type == SkillType.Domina).Select(x => x.UserId).Distinct().CountAsync(), aprendices = await db.SkillProfiles.Where(x => x.Type == SkillType.NecesitaApoyo).Select(x => x.UserId).Distinct().CountAsync() }));

var admin = app.MapGroup("/api/admin").RequireAuthorization("SuperAdmin").WithTags("Administración");
admin.MapGet("/resumen", async (ConectaMentesDbContext db) => Results.Ok(new
{
    total = await db.Users.CountAsync(),
    activos = await db.Users.CountAsync(user => user.AccessStatus == "active"),
    suspendidos = await db.Users.CountAsync(user => user.AccessStatus == "suspended"),
    bloqueados = await db.Users.CountAsync(user => user.AccessStatus == "blocked"),
    nuevosUltimos30Dias = await db.Users.CountAsync(user => user.CreatedAt >= DateTimeOffset.UtcNow.AddDays(-30))
}));
admin.MapGet("/usuarios", async (string? search, string? status, ConectaMentesDbContext db) =>
{
    var query = db.Users.AsNoTracking();
    if (!string.IsNullOrWhiteSpace(search)) { var term = search.Trim(); query = query.Where(user => user.Email.Contains(term) || user.DisplayName.Contains(term) || user.Career.Contains(term)); }
    if (!string.IsNullOrWhiteSpace(status) && status.Trim().ToLowerInvariant() is var normalizedStatus && normalizedStatus is ("active" or "suspended" or "blocked")) query = query.Where(user => user.AccessStatus == normalizedStatus);
    var users = await query.OrderByDescending(user => user.CreatedAt).Take(200).Select(user => new { user.Id, user.Email, user.DisplayName, user.Career, user.AcademicTerm, user.Roles, user.AccessStatus, user.AccessStatusReason, user.AccessStatusChangedAt, user.CreatedAt }).ToListAsync();
    return Results.Ok(users);
});
admin.MapPost("/usuarios/{id:guid}/estado", async (Guid id, AdminAccessStatusInput input, ClaimsPrincipal principal, ConectaMentesDbContext db) =>
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

var security = secured.MapGroup("").WithTags("Seguridad");
security.MapPost("/usuarios/{id:guid}/bloquear", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) => { if (id == ApiIdentity.UserId(p)) return Results.BadRequest(); if (!await db.Blocks.AnyAsync(x => x.UserId == ApiIdentity.UserId(p) && x.BlockedUserId == id)) db.Add(new Block { UserId = ApiIdentity.UserId(p), BlockedUserId = id }); await db.SaveChangesAsync(); return Results.NoContent(); });
security.MapDelete("/usuarios/{id:guid}/bloquear", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) => { var item = await db.Blocks.SingleOrDefaultAsync(x => x.UserId == ApiIdentity.UserId(p) && x.BlockedUserId == id); if (item is null) return Results.NotFound(); db.Remove(item); await db.SaveChangesAsync(); return Results.NoContent(); });
security.MapPost("/reportes", async (ReportInput input, ClaimsPrincipal p, ConectaMentesDbContext db) => { var report = new Report { AuthorId = ApiIdentity.UserId(p), ReportedUserId = input.ReportedUserId, ReferenceId = input.ReferenceId, Reason = input.Reason.Trim(), Description = input.Description.Trim() }; db.Add(report); await db.SaveChangesAsync(); return Results.Created($"/api/reportes/{report.Id}", new { report.Id, message = "Reporte recibido para revisión humana." }); });
var moderation = app.MapGroup("/api/moderacion").RequireAuthorization("Moderator").WithTags("Moderación");
moderation.MapGet("/reportes", async (ConectaMentesDbContext db) => Results.Ok(await db.Reports.OrderBy(x => x.CreatedAt).ToListAsync()));
moderation.MapPut("/reportes/{id:guid}", async (Guid id, ModerationInput input, ClaimsPrincipal p, ConectaMentesDbContext db) => { var report = await db.Reports.FindAsync(id); if (report is null) return Results.NotFound(); report.Status = input.Status; report.ResolutionNote = input.ResolutionNote.Trim(); report.ModeratorId = ApiIdentity.UserId(p); await db.SaveChangesAsync(); return Results.Ok(report); });

async Task<IResult> RejectMatch(Match item, ClaimsPrincipal p, ConectaMentesDbContext db) { var request = await db.SupportRequests.SingleOrDefaultAsync(x => x.Id == item.RequestId && x.UserId == ApiIdentity.UserId(p)); if (request is null) return Results.Forbid(); item.Status = MatchStatus.Rechazada; await db.SaveChangesAsync(); return Results.NoContent(); }
async Task<IResult> UpdateSession(Guid id, SessionInput input, ClaimsPrincipal p, ConectaMentesDbContext db) { if (ValidateSessionInput(input) is { } validationError) return validationError; var userId = ApiIdentity.UserId(p); var match = await (from session in db.Sessions join connection in db.Connections on session.ConnectionId equals connection.Id where session.Id == id select new { Session = session, Connection = connection }).SingleOrDefaultAsync(); if (match is null) return Results.NotFound(); if (match.Connection.RequesterId != userId && match.Connection.CollaboratorId != userId) return Results.Forbid(); if (match.Session.Status != SessionStatus.Agendada) return Results.Conflict(new { message = "Solo puedes editar sesiones agendadas." }); var mode = input.Mode.Trim().ToLowerInvariant(); var objective = input.Objective.Trim(); var detailsChanged = match.Session.Date != input.Date || match.Session.DurationMinutes != input.DurationMinutes || match.Session.Mode != mode || match.Session.Objective != objective; if (detailsChanged) { match.Session.MeetUrl = null; match.Session.GoogleCalendarEventId = null; } match.Session.Date = input.Date; match.Session.DurationMinutes = input.DurationMinutes; match.Session.Mode = mode; match.Session.Objective = objective; await db.SaveChangesAsync(); return Results.Ok(match.Session); }
async Task<IResult> DeleteSession(Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) { var userId = ApiIdentity.UserId(p); var match = await (from session in db.Sessions join connection in db.Connections on session.ConnectionId equals connection.Id where session.Id == id select new { Session = session, Connection = connection }).SingleOrDefaultAsync(); if (match is null) return Results.NotFound(); if (match.Connection.RequesterId != userId && match.Connection.CollaboratorId != userId) return Results.Forbid(); if (match.Session.Status != SessionStatus.Agendada) return Results.Conflict(new { message = "Solo puedes eliminar sesiones agendadas." }); db.Remove(match.Session); await db.SaveChangesAsync(); return Results.NoContent(); }
async Task<IResult> SetSessionStatus(Guid id, SessionStatus status, ClaimsPrincipal p, ConectaMentesDbContext db) { var userId = ApiIdentity.UserId(p); var match = await (from session in db.Sessions join connection in db.Connections on session.ConnectionId equals connection.Id where session.Id == id select new { Session = session, Connection = connection }).SingleOrDefaultAsync(); if (match is null) return Results.NotFound(); if (match.Connection.RequesterId != userId && match.Connection.CollaboratorId != userId) return Results.Forbid(); if (match.Session.Status != SessionStatus.Agendada) return Results.Conflict(new { message = "La sesión ya no está agendada." }); match.Session.Status = status; await db.SaveChangesAsync(); return Results.Ok(match.Session); }
IResult? ValidateSessionInput(SessionInput input) { var errors = new Dictionary<string, string[]>(); if (input.Date <= DateTimeOffset.UtcNow) errors["date"] = ["La fecha debe estar en el futuro."]; if (input.DurationMinutes is not (30 or 45 or 60)) errors["durationMinutes"] = ["La duración debe ser de 30, 45 o 60 minutos."]; if (string.IsNullOrWhiteSpace(input.Objective) || input.Objective.Trim().Length > 300) errors["objective"] = ["El objetivo es obligatorio y debe tener hasta 300 caracteres."]; if (input.Mode.Trim().ToLowerInvariant() is not ("virtual" or "presencial")) errors["mode"] = ["La modalidad debe ser virtual o presencial."]; return errors.Count > 0 ? Results.ValidationProblem(errors) : null; }
Notification NewNotification(Guid userId, string type, string title, string body, Guid? referenceId = null) => new() { UserId = userId, Type = type, Title = title, Body = body, ReferenceId = referenceId };
object NotificationView(Notification item) => new { item.Id, item.Type, item.Title, item.Body, item.ReferenceId, item.IsRead, item.CreatedAt };
object ChatMessageView(ChatMessage message, string sender, bool isMine, ChatAttachment? attachment) => new
{
    message.Id,
    message.ConnectionId,
    message.SenderId,
    sender,
    message.Text,
    message.CreatedAt,
    isMine,
    attachment = attachment is null ? null : new { attachment.Id, attachment.FileName, attachment.ContentType, attachment.SizeBytes }
};
async Task PushNotification(Notification item, IHubContext<RealtimeHub> hub, DevicePushService devicePush, CancellationToken cancellationToken = default)
{
    await hub.Clients.Group(RealtimeHub.UserGroup(item.UserId)).SendAsync("NotificationReceived", NotificationView(item), cancellationToken);
    await devicePush.SendAsync(item, cancellationToken);
}
IQueryable<ReputationRow> ReputationRows(ConectaMentesDbContext db) =>
    from rating in db.Ratings
    join session in db.Sessions on rating.SessionId equals session.Id
    join connection in db.Connections on session.ConnectionId equals connection.Id
    join request in db.SupportRequests on connection.RequestId equals request.Id
    join user in db.Users on rating.EvaluatedUserId equals user.Id
    select new ReputationRow(rating.EvaluatedUserId, user.DisplayName, user.Career, request.Topic, rating.Usefulness, rating.Respect, rating.Fulfillment, rating.Clarity, (rating.Usefulness + rating.Respect + rating.Fulfillment + rating.Clarity) / 4d, rating.Comment, rating.CreatedAt);
string FormatDominicanDateTime(DateTimeOffset value)
{
    var local = value.ToOffset(TimeSpan.FromHours(-4));
    var hour = local.Hour % 12 is 0 ? 12 : local.Hour % 12;
    var period = local.Hour < 12 ? "a. m." : "p. m.";
    return $"{local:dd/MM/yyyy} a las {hour}:{local:mm} {period}";
}
async Task EnsureColumnAsync(ConectaMentesDbContext db, string tableName, string columnName)
{
    var connection = db.Database.GetDbConnection();
    if (connection.State != System.Data.ConnectionState.Open) await connection.OpenAsync();
    await using var check = connection.CreateCommand();
    check.CommandText = "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = @table AND column_name = @column";
    var tableParameter = check.CreateParameter(); tableParameter.ParameterName = "@table"; tableParameter.Value = tableName; check.Parameters.Add(tableParameter);
    var columnParameter = check.CreateParameter(); columnParameter.ParameterName = "@column"; columnParameter.Value = columnName; check.Parameters.Add(columnParameter);
    if (Convert.ToInt32(await check.ExecuteScalarAsync()) > 0) return;
    var statement = (tableName, columnName) switch
    {
        ("Sessions", "MeetUrl") => "ALTER TABLE `Sessions` ADD COLUMN `MeetUrl` varchar(500) NULL;",
        ("Sessions", "GoogleCalendarEventId") => "ALTER TABLE `Sessions` ADD COLUMN `GoogleCalendarEventId` varchar(200) NULL;",
        ("Users", "AccessStatus") => "ALTER TABLE `Users` ADD COLUMN `AccessStatus` varchar(20) NOT NULL DEFAULT 'active';",
        ("Users", "AccessStatusReason") => "ALTER TABLE `Users` ADD COLUMN `AccessStatusReason` varchar(500) NULL;",
        ("Users", "AccessStatusChangedAt") => "ALTER TABLE `Users` ADD COLUMN `AccessStatusChangedAt` datetime(6) NULL;",
        ("Users", "AvatarPath") => "ALTER TABLE `Users` ADD COLUMN `AvatarPath` varchar(260) NULL;",
        ("Users", "AvatarUpdatedAt") => "ALTER TABLE `Users` ADD COLUMN `AvatarUpdatedAt` datetime(6) NULL;",
        _ => throw new InvalidOperationException("Cambio de esquema no permitido.")
    };
    await db.Database.ExecuteSqlRawAsync(statement);
}

string GetAvatarContentType(string path) => Path.GetExtension(path).ToLowerInvariant() switch
{
    ".jpg" or ".jpeg" => "image/jpeg",
    ".webp" => "image/webp",
    _ => "image/png"
};

async Task EnsureAdminRootAsync(ConectaMentesDbContext db, IConfiguration configuration)
{
    var email = configuration["Admin:Email"]?.Trim().ToLowerInvariant();
    var password = configuration["Admin:Password"];
    if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password)) return;
    if (password.Length < 12) throw new InvalidOperationException("Admin:Password debe tener al menos 12 caracteres.");
    var displayName = configuration["Admin:DisplayName"]?.Trim();
    var root = await db.Users.SingleOrDefaultAsync(user => user.Email == email);
    if (root is null)
    {
        root = new User(email, PasswordService.Hash(password), string.IsNullOrWhiteSpace(displayName) ? "Superadministrador" : displayName, "Administración del sistema", "Root");
        root.SetRoles("superadmin");
        db.Users.Add(root);
    }
    else if (!root.Roles.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Contains("superadmin", StringComparer.OrdinalIgnoreCase)) root.SetRoles("superadmin");
    await db.SaveChangesAsync();
}

async Task EnsureIndexAsync(ConectaMentesDbContext db, string tableName, string indexName, string statement)
{
    var connection = db.Database.GetDbConnection();
    if (connection.State != System.Data.ConnectionState.Open) await connection.OpenAsync();
    await using var check = connection.CreateCommand();
    check.CommandText = "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = @table AND index_name = @index";
    var tableParameter = check.CreateParameter(); tableParameter.ParameterName = "@table"; tableParameter.Value = tableName; check.Parameters.Add(tableParameter);
    var indexParameter = check.CreateParameter(); indexParameter.ParameterName = "@index"; indexParameter.Value = indexName; check.Parameters.Add(indexParameter);
    if (Convert.ToInt32(await check.ExecuteScalarAsync()) > 0) return;
    if (tableName != "Ratings" || indexName != "UX_Ratings_SessionId_AuthorId") throw new InvalidOperationException("Índice no permitido.");
    await db.Database.ExecuteSqlRawAsync(statement);
}

static (string Topic, string Description) GenerateAcademicFallback(string prompt)
{
    var lower = prompt.ToLowerInvariant();
    string subject = "Estudio académico";

    if (lower.Contains("calculo") || lower.Contains("cálculo") || lower.Contains("integral") || lower.Contains("derivada") || lower.Contains("limite") || lower.Contains("límite"))
        subject = "Cálculo";
    else if (lower.Contains("algebra") || lower.Contains("álgebra") || lower.Contains("matriz") || lower.Contains("vectores"))
        subject = "Álgebra lineal";
    else if (lower.Contains("programaci") || lower.Contains("python") || lower.Contains("java") || lower.Contains("c#") || lower.Contains("c++") || lower.Contains("javascript") || lower.Contains("codigo") || lower.Contains("código") || lower.Contains("algoritmo") || lower.Contains("react"))
        subject = "Programación";
    else if (lower.Contains("base de datos") || lower.Contains("sql") || lower.Contains("mysql") || lower.Contains("postgres"))
        subject = "Bases de datos";
    else if (lower.Contains("fisica") || lower.Contains("física") || lower.Contains("newton") || lower.Contains("cinematica") || lower.Contains("cinemática") || lower.Contains("termodinamica"))
        subject = "Física";
    else if (lower.Contains("quimica") || lower.Contains("química") || lower.Contains("estequiometria") || lower.Contains("molar"))
        subject = "Química";
    else if (lower.Contains("estadistica") || lower.Contains("estadística") || lower.Contains("probabilidad") || lower.Contains("regresion"))
        subject = "Estadística";
    else if (lower.Contains("ingles") || lower.Contains("inglés") || lower.Contains("grammar") || lower.Contains("speaking") || lower.Contains("listening"))
        subject = "Inglés";
    else if (lower.Contains("economia") || lower.Contains("economía") || lower.Contains("contabilidad") || lower.Contains("finanzas"))
        subject = "Economía y Finanzas";

    var clean = prompt
        .Replace("no entiendo nada de", "", StringComparison.OrdinalIgnoreCase)
        .Replace("no entiendo", "", StringComparison.OrdinalIgnoreCase)
        .Replace("tengo problemas con", "", StringComparison.OrdinalIgnoreCase)
        .Replace("ayuda con", "", StringComparison.OrdinalIgnoreCase)
        .Replace("necesito ayuda en", "", StringComparison.OrdinalIgnoreCase)
        .Replace("necesito ayuda con", "", StringComparison.OrdinalIgnoreCase)
        .Replace("quiero aprender", "", StringComparison.OrdinalIgnoreCase)
        .Replace("tengo examen de", "", StringComparison.OrdinalIgnoreCase)
        .Trim(' ', '.', ',', '!', '?', ';', ':');

    if (clean.Length > 0)
    {
        clean = char.ToUpper(clean[0]) + clean.Substring(1);
    }
    else
    {
        clean = prompt.Trim();
    }

    string topic;
    if (clean.Length > 35)
    {
        var words = clean.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var shortConcept = string.Join(" ", words.Take(4));
        topic = subject != "Estudio académico" ? $"{subject}: {shortConcept}" : shortConcept;
    }
    else if (!string.IsNullOrWhiteSpace(clean))
    {
        topic = subject != "Estudio académico" && !clean.Contains(subject, StringComparison.OrdinalIgnoreCase)
            ? $"{subject}: {clean}"
            : clean;
    }
    else
    {
        topic = subject;
    }

    if (topic.Length > 50) topic = topic.Substring(0, 47) + "...";

    string description;
    if (!string.IsNullOrWhiteSpace(clean))
    {
        description = $"Busco orientación para comprender {clean.ToLowerInvariant()}, reforzar conceptos clave y resolver ejercicios de práctica colaborativa.";
    }
    else
    {
        description = "Quiero comprender los conceptos fundamentales de este tema y resolver dudas con el apoyo de un compañero.";
    }

    return (topic, description);
}

app.Run();

public partial class Program;

public sealed record RegisterRequest(string Email, string Password, string DisplayName, string Career, string AcademicTerm);
public sealed record ProfileUpdateRequest(string DisplayName, string Career, string AcademicTerm);
public sealed record LoginRequest(string Email, string Password);
public sealed record GoogleLoginRequest(string Credential);
public sealed record SkillRequest(string Topic, SkillType Type, int Confidence, bool Visible = true);
public sealed record AvailabilityRequest(string TimeSlots, string PreferredMode);
public sealed record SupportRequestInput(string Topic, string Description, string? HelpType = "comprender", string? DesiredSchedule = "");
public sealed record AiSupportRequestPrompt(string Prompt);
public sealed record AiSupportRequestSuggestion(string Topic, string Description);
public sealed record ConnectionResponse(bool Accept);
public sealed record ChatMessageInput(string Text);
public sealed record SessionInput(DateTimeOffset Date, int DurationMinutes, string Mode, string Objective);
public sealed record GoogleMeetRequest(string AccessToken);
public sealed record PushSubscriptionInput(string Endpoint, PushSubscriptionKeys Keys);
public sealed record PushSubscriptionKeys(string P256dh, string Auth);
public sealed record PushUnsubscribeInput(string Endpoint);
public sealed record AdminAccessStatusInput(string Status, string? Reason);
public sealed record RatingInput(int Usefulness, int Respect, int Fulfillment, int Clarity, string? Comment);
public sealed record ReportInput(Guid ReportedUserId, Guid ReferenceId, string Reason, string Description);
public sealed record ModerationInput(ReportStatus Status, string ResolutionNote);
public sealed record ReputationRow(Guid EvaluatedUserId, string DisplayName, string Career, string Topic, int Usefulness, int Respect, int Fulfillment, int Clarity, double Score, string Comment, DateTimeOffset CreatedAt);
public sealed record ReputationRankingItem(Guid UserId, string DisplayName, string Career, string Topic, int TotalRatings, double Average, double RankingScore, double Clarity, double Fulfillment, int Position);
