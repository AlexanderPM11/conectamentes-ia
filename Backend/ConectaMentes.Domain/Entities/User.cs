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
    public string? AvatarPath { get; private set; }
    public DateTimeOffset? AvatarUpdatedAt { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public string Roles { get; private set; } = "student";
    public string AccessStatus { get; private set; } = "active";
    public string? AccessStatusReason { get; private set; }
    public DateTimeOffset? AccessStatusChangedAt { get; private set; }

    public bool IsAccessAllowed => AccessStatus.Equals("active", StringComparison.OrdinalIgnoreCase);

    public void UpdateProfile(string displayName, string career, string academicTerm)
    {
        if (string.IsNullOrWhiteSpace(displayName)) throw new ArgumentException("El nombre es obligatorio.", nameof(displayName));
        if (displayName.Trim().Length > 120) throw new ArgumentException("El nombre no puede superar 120 caracteres.", nameof(displayName));
        if (string.IsNullOrWhiteSpace(career)) throw new ArgumentException("Indica tu carrera o área.", nameof(career));
        if (career.Trim().Length > 160) throw new ArgumentException("La carrera no puede superar 160 caracteres.", nameof(career));
        if (string.IsNullOrWhiteSpace(academicTerm)) throw new ArgumentException("Indica tu periodo académico.", nameof(academicTerm));
        if (academicTerm.Trim().Length > 80) throw new ArgumentException("El periodo académico no puede superar 80 caracteres.", nameof(academicTerm));
        DisplayName = displayName.Trim();
        Career = career.Trim();
        AcademicTerm = academicTerm.Trim();
    }

    public void SetAvatarPath(string? path)
    {
        AvatarPath = string.IsNullOrWhiteSpace(path) ? null : path.Trim();
        AvatarUpdatedAt = DateTimeOffset.UtcNow;
    }

    public void SetRoles(params string[] roles)
    {
        var normalized = roles.Select(role => role.Trim().ToLowerInvariant()).Where(role => role.Length > 0).Distinct().ToArray();
        Roles = normalized.Length == 0 ? "student" : string.Join(',', normalized);
    }

    public void SetAccessStatus(string status, string? reason)
    {
        var normalized = status.Trim().ToLowerInvariant();
        if (normalized is not ("active" or "suspended" or "blocked")) throw new ArgumentException("Estado de acceso no válido.", nameof(status));
        AccessStatus = normalized;
        AccessStatusReason = normalized == "active" ? null : reason?.Trim();
        AccessStatusChangedAt = DateTimeOffset.UtcNow;
    }
}
