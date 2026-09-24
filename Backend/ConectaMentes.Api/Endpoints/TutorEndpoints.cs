using System.Security.Claims;
using ConectaMentes.Api.Auth;
using ConectaMentes.Application.Tutor;
using ConectaMentes.Domain.Entities;
using ConectaMentes.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace ConectaMentes.Api.Endpoints;

public static class TutorEndpoints
{
    private sealed record TutorUsageSummary(string Plan, string Status, int MessagesUsed, int MessageLimit, DateTimeOffset? ExpiresAt, bool TrialAvailable);

    public static IEndpointRouteBuilder MapTutorEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var tutor = endpoints.MapGroup("/api/tutor").RequireAuthorization().WithTags("Tutor IA");
        tutor.MapGet("/resumen", async (ClaimsPrincipal p, ConectaMentesDbContext db, IConfiguration configuration) => Results.Ok(await BuildSummary(ApiIdentity.UserId(p), db, configuration)));
        tutor.MapGet("/conversaciones", async (ClaimsPrincipal p, ConectaMentesDbContext db) => Results.Ok(await db.TutorConversations.Where(x => x.UserId == ApiIdentity.UserId(p)).OrderByDescending(x => x.LastActivityAt).ToListAsync()));
        tutor.MapPost("/conversaciones", async ([FromBody] TutorConversationInput input, ClaimsPrincipal p, ConectaMentesDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(input.Subject)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["subject"] = ["Indica la materia que quieres estudiar."] });
            var item = new TutorConversation { UserId = ApiIdentity.UserId(p), Subject = input.Subject.Trim(), Title = string.IsNullOrWhiteSpace(input.Title) ? $"Tutoría de {input.Subject.Trim()}" : input.Title.Trim() };
            db.TutorConversations.Add(item); await db.SaveChangesAsync(); return Results.Created($"/api/tutor/conversaciones/{item.Id}", item);
        });
        tutor.MapGet("/conversaciones/{id:guid}", async (Guid id, ClaimsPrincipal p, ConectaMentesDbContext db) =>
        {
            var userId = ApiIdentity.UserId(p); var conversation = await db.TutorConversations.SingleOrDefaultAsync(x => x.Id == id && x.UserId == userId);
            return conversation is null ? Results.NotFound() : Results.Ok(new { conversation, messages = await db.TutorMessages.Where(x => x.ConversationId == id).OrderBy(x => x.CreatedAt).ToListAsync() });
        });
        tutor.MapPost("/conversaciones/{id:guid}/mensajes", async (Guid id, [FromBody] TutorMessageInput input, ClaimsPrincipal p, ConectaMentesDbContext db, ITutorService service, IConfiguration configuration, CancellationToken ct) =>
        {
            var userId = ApiIdentity.UserId(p); var conversation = await db.TutorConversations.SingleOrDefaultAsync(x => x.Id == id && x.UserId == userId, ct);
            if (conversation is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(input.Content)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["content"] = ["Escribe una pregunta o idea para comenzar."] });
            var summary = await BuildSummary(userId, db, configuration, ct);
            if (summary.MessagesUsed >= summary.MessageLimit) return Results.Problem("Has alcanzado el límite de tu plan. Activa la prueba Premium para continuar aprendiendo.", statusCode: StatusCodes.Status429TooManyRequests);
            var history = await db.TutorMessages.Where(x => x.ConversationId == id).OrderBy(x => x.CreatedAt).Select(x => new { x.Role, x.Content }).ToListAsync(ct);
            var userMessage = new TutorMessage { ConversationId = id, Role = TutorMessageRole.User, Content = input.Content.Trim(), Mode = string.IsNullOrWhiteSpace(input.Mode) ? "explicar" : input.Mode.Trim() };
            var reply = await service.ReplyAsync(conversation.Subject, userMessage.Mode, history.Select(x => (x.Role == TutorMessageRole.User ? "user" : "assistant", x.Content)).Append(("user", userMessage.Content)).ToList(), ct);
            userMessage.SafetyStatus = reply.Redirected ? TutorSafetyStatus.Redirected : TutorSafetyStatus.Clear;
            var assistant = new TutorMessage { ConversationId = id, Role = TutorMessageRole.Assistant, Content = reply.Content, Mode = userMessage.Mode, SafetyStatus = userMessage.SafetyStatus };
            conversation.LastActivityAt = DateTimeOffset.UtcNow; db.TutorMessages.AddRange(userMessage, assistant); await IncrementUsage(userId, db, configuration, ct); await db.SaveChangesAsync(ct);
            return Results.Ok(new { userMessage, assistant, usage = await BuildSummary(userId, db, configuration, ct) });
        });

        var plans = endpoints.MapGroup("/api/suscripciones").RequireAuthorization().WithTags("Suscripciones");
        plans.MapPost("/prueba-premium", async (ClaimsPrincipal p, ConectaMentesDbContext db, IConfiguration configuration) =>
        {
            var userId = ApiIdentity.UserId(p); var current = await db.Subscriptions.SingleOrDefaultAsync(x => x.UserId == userId);
            if (current?.Plan == TutorPlan.Premium && current.ExpiresAt > DateTimeOffset.UtcNow) return Results.Conflict("Ya tienes Premium activo.");
            if (current is null) { current = new Subscription { UserId = userId }; db.Subscriptions.Add(current); }
            var settings = TutorSettings.Load(configuration); current.Plan = TutorPlan.Premium; current.Status = SubscriptionStatus.Trialing; current.StartedAt = DateTimeOffset.UtcNow; current.ExpiresAt = DateTimeOffset.UtcNow.AddDays(settings.TrialDays); current.Provider = configuration["TUTOR_TRIAL_PROVIDER"] ?? "trial"; await db.SaveChangesAsync(); return Results.Ok(await BuildSummary(userId, db, configuration));
        });
        plans.MapPost("/cancelar", async (ClaimsPrincipal p, ConectaMentesDbContext db, IConfiguration configuration) =>
        {
            var current = await db.Subscriptions.SingleOrDefaultAsync(x => x.UserId == ApiIdentity.UserId(p)); if (current is null) return Results.NotFound(); current.Plan = TutorPlan.Free; current.Status = SubscriptionStatus.Canceled; current.ExpiresAt = null; await db.SaveChangesAsync(); return Results.Ok(await BuildSummary(current.UserId, db, configuration));
        });
        return endpoints;
    }

    private static async Task IncrementUsage(Guid userId, ConectaMentesDbContext db, IConfiguration configuration, CancellationToken ct)
    {
        var period = PeriodStart(TutorSettings.Load(configuration));
        var usage = await db.TutorUsages.SingleOrDefaultAsync(x => x.UserId == userId && x.PeriodStart == period, ct);
        if (usage is null) db.TutorUsages.Add(new TutorUsage { UserId = userId, PeriodStart = period, MessagesUsed = 1 });
        else usage.MessagesUsed++;
    }

    private static async Task<TutorUsageSummary> BuildSummary(Guid userId, ConectaMentesDbContext db, IConfiguration configuration, CancellationToken ct = default)
    {
        var settings = TutorSettings.Load(configuration);
        var subscription = await db.Subscriptions.SingleOrDefaultAsync(x => x.UserId == userId, ct);
        var premium = subscription?.Plan == TutorPlan.Premium && (subscription.ExpiresAt is null || subscription.ExpiresAt > DateTimeOffset.UtcNow);
        var period = PeriodStart(settings);
        var usage = await db.TutorUsages.SingleOrDefaultAsync(x => x.UserId == userId && x.PeriodStart == period, ct);
        return new TutorUsageSummary(premium ? "Premium" : "Free", subscription?.Status.ToString() ?? "Active", usage?.MessagesUsed ?? 0, premium ? settings.PremiumMessageLimit : settings.FreeMessageLimit, premium ? subscription?.ExpiresAt : null, !premium && subscription is null);
    }

    private static DateTime PeriodStart(TutorSettings settings) => DateTime.UtcNow.Date.AddDays(-(Math.Max(1, settings.UsagePeriodDays) - 1));
}
