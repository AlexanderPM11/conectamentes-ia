using ConectaMentes.Domain.Entities;
using ConectaMentes.Infrastructure;
using Microsoft.AspNetCore.SignalR;

namespace ConectaMentes.Api.Endpoints;

public static class NotificationHelpers
{
    public static Notification NewNotification(Guid userId, string type, string title, string body, Guid? referenceId = null) => 
        new() { UserId = userId, Type = type, Title = title, Body = body, ReferenceId = referenceId };

    public static object NotificationView(Notification item) => 
        new { item.Id, item.Type, item.Title, item.Body, item.ReferenceId, item.IsRead, item.CreatedAt };

    public static async Task PushNotification(Notification item, IHubContext<RealtimeHub> hub, DevicePushService devicePush, CancellationToken cancellationToken = default)
    {
        await hub.Clients.Group(RealtimeHub.UserGroup(item.UserId)).SendAsync("NotificationReceived", NotificationView(item), cancellationToken);
        await devicePush.SendAsync(item, cancellationToken);
    }
}
