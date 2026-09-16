using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ConectaMentes.Domain.Entities;
using ConectaMentes.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using WebPush;

namespace ConectaMentes.Api;

public sealed class DevicePushService(
    ConectaMentesDbContext db,
    IConfiguration configuration,
    ILogger<DevicePushService> logger)
{
    private readonly string? publicKey = configuration["WebPush:PublicKey"];
    private readonly string? privateKey = configuration["WebPush:PrivateKey"];
    private readonly string subject = configuration["WebPush:Subject"] ?? "mailto:admin@conectamentes.app";

    public bool IsConfigured => !string.IsNullOrWhiteSpace(publicKey) && !string.IsNullOrWhiteSpace(privateKey);
    public string? PublicKey => IsConfigured ? publicKey : null;

    public async Task SaveSubscriptionAsync(Guid userId, string endpoint, string p256dh, string auth, CancellationToken cancellationToken)
    {
        if (!IsConfigured) throw new InvalidOperationException("Las notificaciones push no están configuradas.");
        endpoint = endpoint.Trim();
        p256dh = p256dh.Trim();
        auth = auth.Trim();
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var endpointUri) || endpointUri.Scheme != Uri.UriSchemeHttps || endpoint.Length > 2048)
            throw new ArgumentException("La suscripción del dispositivo no es válida.");
        if (string.IsNullOrWhiteSpace(p256dh) || p256dh.Length > 256 || string.IsNullOrWhiteSpace(auth) || auth.Length > 128)
            throw new ArgumentException("Las claves de la suscripción no son válidas.");

        var hash = EndpointHash(endpoint);
        var existing = await db.PushSubscriptions.SingleOrDefaultAsync(item => item.EndpointHash == hash, cancellationToken);
        if (existing is null)
        {
            db.PushSubscriptions.Add(new PushSubscriptionRecord { UserId = userId, EndpointHash = hash, Endpoint = endpoint, P256dh = p256dh, Auth = auth });
        }
        else
        {
            existing.UserId = userId;
            existing.Endpoint = endpoint;
            existing.P256dh = p256dh;
            existing.Auth = auth;
            existing.UpdatedAt = DateTimeOffset.UtcNow;
        }
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task RemoveSubscriptionAsync(Guid userId, string endpoint, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(endpoint)) return;
        var hash = EndpointHash(endpoint.Trim());
        var record = await db.PushSubscriptions.SingleOrDefaultAsync(item => item.UserId == userId && item.EndpointHash == hash, cancellationToken);
        if (record is null) return;
        db.PushSubscriptions.Remove(record);
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task SendAsync(Notification notification, CancellationToken cancellationToken = default)
    {
        if (!IsConfigured) return;
        var subscriptions = await db.PushSubscriptions.Where(item => item.UserId == notification.UserId).ToListAsync(cancellationToken);
        if (subscriptions.Count == 0) return;

        var payload = JsonSerializer.Serialize(new
        {
            notification.Id,
            notification.Type,
            notification.Title,
            notification.Body,
            notification.ReferenceId,
            notification.CreatedAt,
            url = NotificationUrl(notification),
            icon = "/icons/icon-192.png?v=20260916-2",
            badge = "/icons/icon-192.png?v=20260916-2"
        }, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var vapid = new VapidDetails(subject, publicKey!, privateKey!);
        using var client = new WebPushClient();
        var expired = new List<PushSubscriptionRecord>();

        foreach (var record in subscriptions)
        {
            try
            {
                await client.SendNotificationAsync(new PushSubscription(record.Endpoint, record.P256dh, record.Auth), payload, vapid, cancellationToken);
            }
            catch (WebPushException exception) when (exception.StatusCode is HttpStatusCode.Gone or HttpStatusCode.NotFound)
            {
                expired.Add(record);
            }
            catch (Exception exception)
            {
                logger.LogWarning(exception, "No se pudo enviar una notificación push al usuario {UserId}.", notification.UserId);
            }
        }

        if (expired.Count == 0) return;
        db.PushSubscriptions.RemoveRange(expired);
        await db.SaveChangesAsync(cancellationToken);
    }

    private static string EndpointHash(string endpoint) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(endpoint)));

    private static string NotificationUrl(Notification notification) => notification.Type switch
    {
        "message" or "meeting" or "connection_accepted" => $"/?push=mensajes&referenceId={notification.ReferenceId}",
        "connection_request" => "/?push=agenda",
        "session" => "/?push=agenda",
        "comment" => "/?push=ranking",
        _ => "/?push=inicio"
    };
}
