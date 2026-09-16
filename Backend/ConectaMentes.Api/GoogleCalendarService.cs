using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace ConectaMentes.Api;

public sealed record GoogleMeetingResult(string EventId, string? MeetUrl, string? CalendarUrl);

public sealed class GoogleCalendarService(IHttpClientFactory httpClientFactory)
{
    public async Task<GoogleMeetingResult> CreateOrGetMeetingAsync(
        string accessToken,
        string? existingEventId,
        string topic,
        string objective,
        DateTimeOffset startsAt,
        int durationMinutes,
        IReadOnlyCollection<string> attendeeEmails,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(accessToken)) throw new GoogleCalendarException("Google no entregó autorización para Calendar.");

        if (!string.IsNullOrWhiteSpace(existingEventId))
        {
            var existing = await GetEventAsync(accessToken, existingEventId, cancellationToken);
            if (existing is not null) return existing;
        }

        var payload = new
        {
            summary = $"ConectaMentes · {topic}",
            description = $"Sesión de aprendizaje entre pares.\n\nObjetivo: {objective}\n\nCreada desde ConectaMentes IA.",
            start = new { dateTime = startsAt.ToString("O"), timeZone = "America/Santo_Domingo" },
            end = new { dateTime = startsAt.AddMinutes(durationMinutes).ToString("O"), timeZone = "America/Santo_Domingo" },
            attendees = attendeeEmails.Distinct(StringComparer.OrdinalIgnoreCase).Select(email => new { email }).ToArray(),
            conferenceData = new
            {
                createRequest = new
                {
                    requestId = Guid.NewGuid().ToString("N"),
                    conferenceSolutionKey = new { type = "hangoutsMeet" }
                }
            }
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, "calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all")
        {
            Content = JsonContent.Create(payload)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var response = await Client().SendAsync(request, cancellationToken);
        var document = await ReadResponseAsync(response, cancellationToken);
        var result = ParseEvent(document.RootElement);

        for (var attempt = 0; result.MeetUrl is null && attempt < 4; attempt++)
        {
            await Task.Delay(350, cancellationToken);
            result = await GetEventAsync(accessToken, result.EventId, cancellationToken) ?? result;
        }

        return result;
    }

    private async Task<GoogleMeetingResult?> GetEventAsync(string accessToken, string eventId, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"calendar/v3/calendars/primary/events/{Uri.EscapeDataString(eventId)}?conferenceDataVersion=1");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var response = await Client().SendAsync(request, cancellationToken);
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound) return null;
        var document = await ReadResponseAsync(response, cancellationToken);
        return ParseEvent(document.RootElement);
    }

    private HttpClient Client() => httpClientFactory.CreateClient("GoogleCalendar");

    private static async Task<JsonDocument> ReadResponseAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        if (response.IsSuccessStatusCode) return document;
        var message = document.RootElement.TryGetProperty("error", out var error) && error.TryGetProperty("message", out var detail)
            ? detail.GetString()
            : null;
        document.Dispose();
        throw new GoogleCalendarException(message ?? "Google Calendar no pudo crear la reunión.");
    }

    private static GoogleMeetingResult ParseEvent(JsonElement value)
    {
        var eventId = value.GetProperty("id").GetString() ?? throw new GoogleCalendarException("Google Calendar no devolvió el evento creado.");
        var calendarUrl = value.TryGetProperty("htmlLink", out var htmlLink) ? htmlLink.GetString() : null;
        var meetUrl = value.TryGetProperty("hangoutLink", out var hangoutLink) ? hangoutLink.GetString() : null;
        if (meetUrl is null && value.TryGetProperty("conferenceData", out var conferenceData) && conferenceData.TryGetProperty("entryPoints", out var entryPoints))
        {
            foreach (var entry in entryPoints.EnumerateArray())
            {
                if (entry.TryGetProperty("entryPointType", out var type) && type.GetString() == "video" && entry.TryGetProperty("uri", out var uri))
                {
                    meetUrl = uri.GetString();
                    break;
                }
            }
        }
        return new GoogleMeetingResult(eventId, meetUrl, calendarUrl);
    }
}

public sealed class GoogleCalendarException(string message) : Exception(message);
