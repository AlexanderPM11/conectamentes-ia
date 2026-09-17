using ConectaMentes.Domain.Entities;

namespace ConectaMentes.Application.Auth;

public sealed class AuthService(IUserRepository users, ITokenService tokens) : IAuthService
{
    public async Task<AuthResult> RegisterAsync(RegisterCommand command, CancellationToken cancellationToken)
    {
        ValidateRegistration(command);
        var email = NormalizeEmail(command.Email);
        if (await users.FindByEmailAsync(email, cancellationToken) is not null)
            throw new InvalidOperationException("No se pudo completar el registro con esos datos.");

        var user = new User(email, PasswordService.Hash(command.Password), command.DisplayName.Trim(), "Por completar", "Por completar");
        await users.AddAsync(user, cancellationToken);
        await users.SaveChangesAsync(cancellationToken);
        return new AuthResult(tokens.CreateToken(user), UserProfile.From(user));
    }

    public async Task<AuthResult?> LoginAsync(LoginCommand command, CancellationToken cancellationToken)
    {
        var user = await users.FindByEmailAsync(NormalizeEmail(command.Email), cancellationToken);
        if (user is null || !PasswordService.Verify(command.Password, user.PasswordHash)) return null;
        EnsureAccess(user);
        return new AuthResult(tokens.CreateToken(user), UserProfile.From(user));
    }

    public async Task<AuthResult> LoginWithGoogleAsync(ExternalLoginCommand command, CancellationToken cancellationToken)
    {
        var email = NormalizeEmail(command.Email);
        var user = await users.FindByEmailAsync(email, cancellationToken);
        if (user is null)
        {
            user = new User(email, PasswordService.Hash(Guid.NewGuid().ToString("N")), command.DisplayName.Trim(), "Por completar", "Por completar");
            await users.AddAsync(user, cancellationToken);
            await users.SaveChangesAsync(cancellationToken);
        }
        EnsureAccess(user);
        return new AuthResult(tokens.CreateToken(user), UserProfile.From(user));
    }

    public async Task<UserProfile?> GetProfileAsync(Guid userId, CancellationToken cancellationToken)
        => (await users.FindByIdAsync(userId, cancellationToken)) is { } user ? UserProfile.From(user) : null;

    public static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

    private static void EnsureAccess(User user)
    {
        if (!user.IsAccessAllowed) throw new AccountAccessException(user.AccessStatus, user.AccessStatusReason);
    }

    private static void ValidateRegistration(RegisterCommand command)
    {
        if (string.IsNullOrWhiteSpace(command.Email) || !command.Email.Contains('@')) throw new ArgumentException("El email no es válido.");
        if (string.IsNullOrWhiteSpace(command.Password) || command.Password.Length < 8) throw new ArgumentException("La contraseña debe tener al menos 8 caracteres.");
        if (string.IsNullOrWhiteSpace(command.DisplayName)) throw new ArgumentException("El nombre es obligatorio.");
    }
}
