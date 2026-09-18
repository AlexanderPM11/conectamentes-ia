using System.Security.Claims;
using ConectaMentes.Api.Auth;
using ConectaMentes.Domain.Entities;
using ConectaMentes.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.AspNetCore.SignalR;

namespace ConectaMentes.Api.Endpoints;

public static class RequestEndpoints
{
    public static IEndpointRouteBuilder MapRequestEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var requests = endpoints.MapGroup("/api/solicitudes").RequireAuthorization().WithTags("Solicitudes");

        requests.MapPost("", async ([FromBody] SupportRequestInput input, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => {
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

        requests.MapGet("/mias", async (ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => Results.Ok(await db.SupportRequests.Where(x => x.UserId == ApiIdentity.UserId(p)).OrderByDescending(x => x.CreatedAt).ToListAsync()));

        requests.MapGet("/comunidad", async ([FromQuery] string? q, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => {
            var userId = ApiIdentity.UserId(p);
            var blocked = await db.Blocks.Where(x => x.UserId == userId || x.BlockedUserId == userId).Select(x => x.UserId == userId ? x.BlockedUserId : x.UserId).ToListAsync();
            var query = from req in db.SupportRequests
                        join user in db.Users on req.UserId equals user.Id
                        where req.UserId != userId && !blocked.Contains(req.UserId) && !user.Roles.Contains("admin") && (req.Status == RequestStatus.Abierta || req.Status == RequestStatus.ConCoincidencias)
                        orderby req.CreatedAt descending
                        select new {
                            req.Id,
                            req.Topic,
                            req.Description,
                            req.HelpType,
                            req.DesiredSchedule,
                            req.Status,
                            req.CreatedAt,
                            authorId = user.Id,
                            authorName = user.DisplayName,
                            authorCareer = user.Career,
                            authorBadge = db.Recognitions.Where(r => r.UserId == user.Id).Select(r => r.Type).FirstOrDefault(),
                            commentCount = db.SupportRequestComments.Count(c => c.RequestId == req.Id)
                        };
            
            if (!string.IsNullOrWhiteSpace(q))
            {
                var search = q.Trim().ToLower();
                query = query.Where(x => x.Topic.ToLower().Contains(search) || x.Description.ToLower().Contains(search));
            }
            
            return Results.Ok(await query.Take(50).ToListAsync());
        });

        requests.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => await db.SupportRequests.SingleOrDefaultAsync(x => x.Id == id && x.UserId == ApiIdentity.UserId(p)) is { } item ? Results.Ok(item) : Results.NotFound());

        requests.MapPut("/{id:guid}", async (Guid id, [FromBody] SupportRequestInput input, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => {
            var item = await db.SupportRequests.SingleOrDefaultAsync(x => x.Id == id && x.UserId == ApiIdentity.UserId(p));
            if (item is null || item.Status is RequestStatus.Cancelada or RequestStatus.Conectada) return Results.NotFound();
            item.Topic = input.Topic.Trim();
            item.Description = input.Description.Trim();
            item.HelpType = string.IsNullOrWhiteSpace(input.HelpType) ? item.HelpType : input.HelpType.Trim();
            item.DesiredSchedule = string.IsNullOrWhiteSpace(input.DesiredSchedule) ? item.DesiredSchedule : input.DesiredSchedule.Trim();
            await db.SaveChangesAsync();
            return Results.Ok(item);
        });

        requests.MapPost("/{id:guid}/cancelar", async (Guid id, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => { 
            var item = await db.SupportRequests.SingleOrDefaultAsync(x => x.Id == id && x.UserId == ApiIdentity.UserId(p)); 
            if (item is null) return Results.NotFound(); 
            item.Status = RequestStatus.Cancelada; 
            await db.SaveChangesAsync(); 
            return Results.Ok(item); 
        });

        requests.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) => {
            var item = await db.SupportRequests.SingleOrDefaultAsync(x => x.Id == id && x.UserId == ApiIdentity.UserId(p));
            if (item is null) return Results.NotFound();
            db.SupportRequests.Remove(item);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        requests.MapPost("/asistente-ia", async ([FromBody] AiSupportRequestPrompt input, [FromServices] IConfiguration config, [FromServices] IHttpClientFactory httpClientFactory) =>
        {
            if (string.IsNullOrWhiteSpace(input.Prompt))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["prompt"] = ["Por favor escribe lo que necesitas aprender."] });

            var rawPrompt = input.Prompt.Trim();
            string? suggestedTopic = null;
            string? suggestedDescription = null;

            var authKey = config["AI_API_KEY"]
                ?? Environment.GetEnvironmentVariable("AI_API_KEY")
                ?? config["OPENAI_API_KEY"]
                ?? Environment.GetEnvironmentVariable("OPENAI_API_KEY")
                ?? config["MINIMAX_API_KEY"]
                ?? Environment.GetEnvironmentVariable("MINIMAX_API_KEY")
                ?? config["GROQ_API_KEY"]
                ?? Environment.GetEnvironmentVariable("GROQ_API_KEY");

            var model = config["AI_MODEL"]
                ?? Environment.GetEnvironmentVariable("AI_MODEL");

            var endpoint = config["AI_ENDPOINT"]
                ?? Environment.GetEnvironmentVariable("AI_ENDPOINT");

            if (!string.IsNullOrWhiteSpace(authKey))
            {
                try
                {
                    var httpClient = httpClientFactory.CreateClient();
                    httpClient.Timeout = TimeSpan.FromSeconds(15);

                    var isMinimaxKey = !string.IsNullOrWhiteSpace(config["MINIMAX_API_KEY"] ?? Environment.GetEnvironmentVariable("MINIMAX_API_KEY"));
                    var isGroqKey = !string.IsNullOrWhiteSpace(config["GROQ_API_KEY"] ?? Environment.GetEnvironmentVariable("GROQ_API_KEY"));

                    if (string.IsNullOrWhiteSpace(endpoint))
                    {
                        if (isMinimaxKey || (model?.Contains("minimax", StringComparison.OrdinalIgnoreCase) == true))
                        {
                            endpoint = "https://api.minimax.chat/v1/text/chatcompletion_v2";
                        }
                        else if (isGroqKey || (model?.Contains("llama", StringComparison.OrdinalIgnoreCase) == true))
                        {
                            endpoint = "https://api.groq.com/openai/v1/chat/completions";
                        }
                        else
                        {
                            endpoint = "https://api.openai.com/v1/chat/completions";
                        }
                    }

                    if (string.IsNullOrWhiteSpace(model))
                    {
                        if (endpoint.Contains("minimax", StringComparison.OrdinalIgnoreCase))
                        {
                            model = "MiniMax-Text-01";
                        }
                        else if (endpoint.Contains("groq", StringComparison.OrdinalIgnoreCase))
                        {
                            model = "llama-3.3-70b-versatile";
                        }
                        else
                        {
                            model = "gpt-4o-mini";
                        }
                    }

                    var customSystemPrompt = config["AI_SYSTEM_PROMPT"] ?? Environment.GetEnvironmentVariable("AI_SYSTEM_PROMPT");
                    var systemContent = !string.IsNullOrWhiteSpace(customSystemPrompt)
                        ? customSystemPrompt
                        : "Eres un asistente pedagógico para la plataforma universitaria ConectaMentes.\n" +
                          "Tu tarea es ayudar a un estudiante a estructurar su solicitud de apoyo académico a partir de lo que expresa con sus palabras.\n\n" +
                          "Instrucciones:\n" +
                          "1. Genera un tema o materia claro y conciso para el campo 'topic'.\n" +
                          "2. Redacta una descripción clara y motivadora para el campo 'description', enfocada en aprender, comprender conceptos y practicar colaborativamente.\n" +
                          "3. Responde exclusivamente con un objeto JSON válido con los campos 'topic' y 'description'.";

                    var requestBody = new
                    {
                        model = model,
                        messages = new object[]
                        {
                            new
                            {
                                role = "system",
                                content = systemContent
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

                            var openBrace = cleaned.IndexOf('{');
                            var closeBrace = cleaned.LastIndexOf('}');
                            if (openBrace >= 0 && closeBrace > openBrace)
                            {
                                cleaned = cleaned.Substring(openBrace, closeBrace - openBrace + 1);
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

        requests.MapGet("/{id:guid}/comentarios", async (Guid id, [FromServices] ConectaMentesDbContext db) => {
            var comments = await (from c in db.SupportRequestComments
                                  join u in db.Users on c.AuthorId equals u.Id
                                  where c.RequestId == id
                                  orderby c.CreatedAt ascending
                                  select new {
                                      c.Id,
                                      c.Text,
                                      c.CreatedAt,
                                      authorId = u.Id,
                                      authorName = u.DisplayName
                                  }).ToListAsync();
            return Results.Ok(comments);
        });

        requests.MapPost("/{id:guid}/comentarios", async (Guid id, [FromBody] CommentInput input, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db, [FromServices] IHubContext<RealtimeHub> hub, [FromServices] DevicePushService devicePush) => {
            if (string.IsNullOrWhiteSpace(input.Text)) return Results.BadRequest("El comentario no puede estar vacío.");
            var userId = ApiIdentity.UserId(p);
            var request = await db.SupportRequests.SingleOrDefaultAsync(x => x.Id == id);
            if (request is null) return Results.NotFound();
            
            var comment = new SupportRequestComment { RequestId = id, AuthorId = userId, Text = input.Text.Trim() };
            db.SupportRequestComments.Add(comment);
            
            if (request.UserId != userId) {
                var authorName = await db.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstOrDefaultAsync();
                var notification = NotificationHelpers.NewNotification(request.UserId, "comment", "Nuevo comentario", $"{authorName} comentó en tu solicitud: '{comment.Text}'", request.Id);
                db.Notifications.Add(notification);
                await db.SaveChangesAsync();
                await NotificationHelpers.PushNotification(notification, hub, devicePush);
            } else {
                await db.SaveChangesAsync();
            }
            
            return Results.Ok(comment);
        });

        return endpoints;
    }

    private static (string Topic, string Description) GenerateAcademicFallback(string prompt)
    {
        var clean = prompt.Trim();
        var parts = clean.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var topic = parts.Length > 0 ? parts[0] : "Tema general";
        if (parts.Length > 1) topic += " " + parts[1];
        if (topic.Length > 40) topic = topic.Substring(0, 40);
        return (topic, $"Me gustaría comprender mejor esto: {clean}");
    }
}
