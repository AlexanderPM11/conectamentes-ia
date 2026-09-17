using ConectaMentes.Domain.Entities;

namespace ConectaMentes.Api.Endpoints;

public static class ChatHelpers
{
    public static object ChatMessageView(ChatMessage message, string sender, bool isMine, ChatAttachment? attachment) => new
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
}
