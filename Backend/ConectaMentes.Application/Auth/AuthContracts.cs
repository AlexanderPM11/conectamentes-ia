using ConectaMentes.Domain.Entities;

namespace ConectaMentes.Application.Auth;

public sealed record RegisterCommand(string Email, string Password, string DisplayName, string Career, string AcademicTerm);
public sealed record LoginCommand(string Email, string Password);
public sealed record AuthResult(string AccessToken, UserProfile User);
public sealed record UserProfile(Guid Id, string Email, string DisplayName, string Career, string AcademicTerm, DateTimeOffset CreatedAt, IReadOnlyCollection<string> Roles)
{
    public static UserProfile From(User user) => new(user.Id, user.Email, user.DisplayName, user.Career, user.AcademicTerm, user.CreatedAt, user.Roles.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
}

public interface IUserRepository
{
    Task<User?> FindByEmailAsync(string normalizedEmail, CancellationToken cancellationToken);
    Task<User?> FindByIdAsync(Guid id, CancellationToken cancellationToken);
    Task AddAsync(User user, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}

public interface ITokenService
{
    string CreateToken(User user);
}

public interface IAuthService
{
    Task<AuthResult> RegisterAsync(RegisterCommand command, CancellationToken cancellationToken);
    Task<AuthResult?> LoginAsync(LoginCommand command, CancellationToken cancellationToken);
    Task<UserProfile?> GetProfileAsync(Guid userId, CancellationToken cancellationToken);
}
