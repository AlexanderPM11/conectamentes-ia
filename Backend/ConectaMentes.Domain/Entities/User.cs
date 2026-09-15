namespace ConectaMentes.Domain.Entities;

public sealed class User
{
    private User() { }

    public User(string email, string passwordHash, string displayName, string career, string academicTerm)
    {
        Id = Guid.NewGuid();
        Email = email;
        PasswordHash = passwordHash;
        DisplayName = displayName;
        Career = career;
        AcademicTerm = academicTerm;
        CreatedAt = DateTimeOffset.UtcNow;
        Roles = "student";
    }

    public Guid Id { get; private set; }
    public string Email { get; private set; } = string.Empty;
    public string PasswordHash { get; private set; } = string.Empty;
    public string DisplayName { get; private set; } = string.Empty;
    public string Career { get; private set; } = string.Empty;
    public string AcademicTerm { get; private set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; private set; }
    public string Roles { get; private set; } = "student";
}
