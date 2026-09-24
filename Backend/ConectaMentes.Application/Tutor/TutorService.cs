namespace ConectaMentes.Application.Tutor;

public interface ITutorService
{
    Task<(string Content, bool Redirected)> ReplyAsync(string subject, string mode, IReadOnlyList<(string Role, string Content)> history, CancellationToken cancellationToken);
}
