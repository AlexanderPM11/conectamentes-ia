using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using ConectaMentes.Application.Tutor;

namespace ConectaMentes.Api;

public sealed class JevModelRouter(IConfiguration configuration, IHttpClientFactory httpClientFactory, ILogger<JevModelRouter> logger) : IModelRouter
{
    public async Task<ModelRouteDecision> RouteAsync(string task, CancellationToken cancellationToken = default)
    {
        var settings = TutorSettings.Load(configuration);
        var candidates = GetCandidates();
        var fallback = Fallback(task, candidates, settings);
        var key = settings.JevApiKey;
        if (string.IsNullOrWhiteSpace(key) || candidates.Count < 2) return fallback;
        try
        {
            var body = new { task, candidates = candidates.Select(item => new { id = item.Id, description = item.Description, cost = item.Cost, latency = item.Latency, context = item.Context }), priorities = settings.JevPriorities, constraints = settings.JevConstraints, stakes = settings.JevStakes };
            var client = httpClientFactory.CreateClient(); client.Timeout = TimeSpan.FromSeconds(settings.JevTimeoutSeconds);
            using var request = new HttpRequestMessage(HttpMethod.Post, settings.JevEndpoint); request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key); request.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
            using var response = await client.SendAsync(request, cancellationToken); if (!response.IsSuccessStatusCode) return fallback;
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken)); if (!json.RootElement.TryGetProperty("data", out var data)) return fallback;
            var decision = data.TryGetProperty("decision", out var selected) ? selected.GetString() : null;
            var confidence = data.TryGetProperty("confidence", out var confidenceValue) && confidenceValue.TryGetDouble(out var value) ? value : 0.5;
            var selectedCandidate = candidates.FirstOrDefault(item => string.Equals(item.Id, decision, StringComparison.OrdinalIgnoreCase));
            return selectedCandidate is null ? fallback : new ModelRouteDecision(selectedCandidate.Id, Math.Clamp(confidence, 0, 1), true);
        }
        catch (Exception exception) { logger.LogWarning(exception, "JEV model routing failed; using local fallback."); return fallback; }
    }

    private List<ModelRouteCandidate> GetCandidates()
    {
        var settings = TutorSettings.Load(configuration);
        var candidates = new List<ModelRouteCandidate> { new(settings.ModelFast, settings.ModelFastDescription, settings.ModelFastCost, settings.ModelFastLatency, settings.ModelFastContext) };
        if (!string.Equals(settings.ModelReasoning, settings.ModelFast, StringComparison.OrdinalIgnoreCase)) candidates.Add(new(settings.ModelReasoning, settings.ModelReasoningDescription, settings.ModelReasoningCost, settings.ModelReasoningLatency, settings.ModelReasoningContext));
        if (!string.IsNullOrWhiteSpace(settings.ModelLongContext) && !candidates.Any(item => item.Id.Equals(settings.ModelLongContext, StringComparison.OrdinalIgnoreCase))) candidates.Add(new(settings.ModelLongContext, settings.ModelLongDescription, settings.ModelLongCost, settings.ModelLongLatency, settings.ModelLongContextWindow));
        return candidates;
    }

    private static ModelRouteDecision Fallback(string task, IReadOnlyList<ModelRouteCandidate> candidates, TutorSettings settings)
    {
        var selected = task.Length > settings.RouterLongTaskChars || settings.RouterComplexityTerms.Any(term => task.Contains(term, StringComparison.OrdinalIgnoreCase)) ? candidates.LastOrDefault(item => item.Context != settings.ModelFastContext) ?? candidates[0] : candidates[0];
        return new ModelRouteDecision(selected.Id, 0.55, false);
    }
}
