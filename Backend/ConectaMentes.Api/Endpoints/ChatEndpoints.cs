using System.Security.Claims;
using ConectaMentes.Api.Auth;
using ConectaMentes.Domain.Entities;
using ConectaMentes.Infrastructure;
using ConectaMentes.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace ConectaMentes.Api.Endpoints;

public static class ChatEndpoints
{
    public static IEndpointRouteBuilder MapChatEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var chat = endpoints.MapGroup("/api/conexiones/{id:guid}").RequireAuthorization().WithTags("Chat");

        chat.MapGet("/mensajes", async (Guid id, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db) =>
        {
            var userId = ApiIdentity.UserId(p);
            if (!await db.Connections.AnyAsync(x => x.Id == id && (x.RequesterId == userId || x.CollaboratorId == userId))) return Results.NotFound();
            var rows = await (from message in db.ChatMessages join sender in db.Users on message.SenderId equals sender.Id where message.ConnectionId == id orderby message.CreatedAt descending select new { Message = message, Sender = sender.DisplayName }).Take(100).ToListAsync();
            rows.Reverse();
            var messageIds = rows.Select(row => row.Message.Id).ToList();
            var attachments = await db.ChatAttachments.Where(item => messageIds.Contains(item.MessageId)).ToDictionaryAsync(item => item.MessageId);
            return Results.Ok(rows.Select(row => ChatHelpers.ChatMessageView(row.Message, row.Sender, row.Message.SenderId == userId, attachments.GetValueOrDefault(row.Message.Id))));
        });

        chat.MapPost("/mensajes", async (Guid id, [FromBody] ChatMessageInput input, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db, [FromServices] IHubContext<RealtimeHub> hub, [FromServices] DevicePushService devicePush) =>
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
            var notification = NotificationHelpers.NewNotification(recipientId, "message", $"Nuevo mensaje de {senderName}", preview, id);
            db.AddRange(message, notification);
            await db.SaveChangesAsync();
            var messageView = ChatHelpers.ChatMessageView(message, senderName, false, null);
            await hub.Clients.Groups(RealtimeHub.UserGroup(connection.RequesterId), RealtimeHub.UserGroup(connection.CollaboratorId)).SendAsync("ChatMessageReceived", messageView);
            await NotificationHelpers.PushNotification(notification, hub, devicePush);
            return Results.Created($"/api/conexiones/{id}/mensajes/{message.Id}", ChatHelpers.ChatMessageView(message, senderName, true, null));
        });

        chat.MapDelete("/mensajes/{messageId:guid}", async (Guid id, Guid messageId, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db, [FromServices] ChatAttachmentStorage storage, [FromServices] IHubContext<RealtimeHub> hub, CancellationToken ct) =>
        {
            var userId = ApiIdentity.UserId(p);
            var message = await (from item in db.ChatMessages
                                 join connection in db.Connections on item.ConnectionId equals connection.Id
                                 where item.Id == messageId && item.ConnectionId == id && item.SenderId == userId
                                       && (connection.RequesterId == userId || connection.CollaboratorId == userId)
                                 select item).SingleOrDefaultAsync(ct);
            if (message is null) return Results.NotFound();

            var attachment = await db.ChatAttachments.SingleOrDefaultAsync(item => item.MessageId == messageId, ct);
            db.ChatMessages.Remove(message);
            if (attachment is not null) db.ChatAttachments.Remove(attachment);
            await db.SaveChangesAsync(ct);
            if (attachment is not null) storage.Delete(attachment.StoredName);

            await hub.Clients.Group(RealtimeHub.UserGroup(userId)).SendAsync("ChatMessageDeleted", new { connectionId = id, messageId }, ct);
            var otherUserId = await db.Connections.Where(item => item.Id == id).Select(item => item.RequesterId == userId ? item.CollaboratorId : item.RequesterId).SingleAsync(ct);
            await hub.Clients.Group(RealtimeHub.UserGroup(otherUserId)).SendAsync("ChatMessageDeleted", new { connectionId = id, messageId }, ct);
            return Results.NoContent();
        });

        chat.MapPost("/adjuntos", async (Guid id, HttpRequest request, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db, [FromServices] ChatAttachmentStorage storage, [FromServices] IHubContext<RealtimeHub> hub, [FromServices] DevicePushService devicePush, CancellationToken ct) =>
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
            var notification = NotificationHelpers.NewNotification(recipientId, "message", $"Nuevo archivo de {senderName}", string.IsNullOrWhiteSpace(caption) ? $"Compartió {stored.FileName}." : caption, id);
            db.AddRange(message, attachment, notification);
            try { await db.SaveChangesAsync(ct); }
            catch { storage.Delete(stored.StoredName); throw; }
            var messageView = ChatHelpers.ChatMessageView(message, senderName, false, attachment);
            await hub.Clients.Groups(RealtimeHub.UserGroup(connection.RequesterId), RealtimeHub.UserGroup(connection.CollaboratorId)).SendAsync("ChatMessageReceived", messageView, ct);
            await NotificationHelpers.PushNotification(notification, hub, devicePush, ct);
            return Results.Created($"/api/conexiones/{id}/mensajes/{message.Id}", ChatHelpers.ChatMessageView(message, senderName, true, attachment));
        }).WithMetadata(new RequestSizeLimitAttribute(ChatAttachmentStorage.DefaultMaxBytes + 512 * 1024)).DisableAntiforgery();

        endpoints.MapGet("/api/adjuntos/{id:guid}", async (Guid id, ClaimsPrincipal p, [FromServices] ConectaMentesDbContext db, [FromServices] ChatAttachmentStorage storage, CancellationToken ct) =>
        {
            var userId = ApiIdentity.UserId(p);
            var attachment = await (from item in db.ChatAttachments join connection in db.Connections on item.ConnectionId equals connection.Id where item.Id == id && (connection.RequesterId == userId || connection.CollaboratorId == userId) select item).SingleOrDefaultAsync(ct);
            if (attachment is null) return Results.NotFound();
            var path = storage.Resolve(attachment.StoredName);
            return File.Exists(path) ? Results.File(File.OpenRead(path), attachment.ContentType, enableRangeProcessing: true) : Results.NotFound();
        }).RequireAuthorization().WithTags("Chat");

        return endpoints;
    }
}
