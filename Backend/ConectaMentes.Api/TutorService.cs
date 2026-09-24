using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using ConectaMentes.Application.Tutor;

namespace ConectaMentes.Api;

public sealed class TutorService(IConfiguration configuration, IHttpClientFactory httpClientFactory, IModelRouter modelRouter) : ITutorService
{
    public async Task<(string Content, bool Redirected)> ReplyAsync(string subject, string mode, IReadOnlyList<(string Role, string Content)> history, CancellationToken cancellationToken)
    {
        var settings = TutorSettings.Load(configuration);
        var latest = history.LastOrDefault(x => x.Role == "user").Content ?? "";
        var unsafeRequest = settings.SafetyTerms.Any(term => latest.Contains(term, StringComparison.OrdinalIgnoreCase));
        if (unsafeRequest) return (settings.AiFallbackMessage.Replace("{subject}", subject, StringComparison.Ordinal).Replace("{mode}", mode, StringComparison.Ordinal), true);
        var key = settings.AiApiKey;
        var endpoint = settings.AiEndpoint;
        var route = await modelRouter.RouteAsync($"Materia: {subject}. Modo: {mode}. Petición del estudiante: {latest}", cancellationToken);
        var model = route.ModelId;
        if (!string.IsNullOrWhiteSpace(key))
        {
            try
            {
                var systemPrompt = settings.AiSystemPrompt.Replace("{subject}", subject, StringComparison.Ordinal).Replace("{mode}", mode, StringComparison.Ordinal);
                var messages = new List<object> { new { role = "system", content = systemPrompt } };
                messages.AddRange(history.TakeLast(12).Select(item => new { role = item.Role, content = item.Content }));
                var client = httpClientFactory.CreateClient(); client.Timeout = TimeSpan.FromSeconds(settings.AiTimeoutSeconds); client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", key);
                using var response = await client.PostAsync(endpoint, new StringContent(JsonSerializer.Serialize(new { model, messages, temperature = settings.AiTemperature, max_tokens = settings.AiMaxTokens }), Encoding.UTF8, "application/json"), cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
                    var content = json.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString();
                    if (!string.IsNullOrWhiteSpace(content)) return (content.Trim(), false);
                }
            }
            catch (Exception) { }
        }
        return (settings.AiFallbackMessage.Replace("{subject}", subject, StringComparison.Ordinal).Replace("{mode}", mode, StringComparison.Ordinal), false);
    }
}
