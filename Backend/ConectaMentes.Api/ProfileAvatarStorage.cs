using System.Text;

namespace ConectaMentes.Api;

public sealed record StoredAvatar(string StoredName, string ContentType, long SizeBytes);

public sealed class ProfileAvatarStorage
{
    public const long DefaultMaxBytes = 5 * 1024 * 1024;
    private static readonly IReadOnlyDictionary<string, string> AllowedTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".png"] = "image/png",
        [".webp"] = "image/webp"
    };

    private readonly string root;

    public ProfileAvatarStorage(IConfiguration configuration, IWebHostEnvironment environment)
    {
        var configured = configuration["ProfileAvatars:Path"];
        root = Path.GetFullPath(string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(environment.ContentRootPath, "data", "profile-avatars")
            : configured);
        Directory.CreateDirectory(root);
    }

    public async Task<StoredAvatar> SaveAsync(IFormFile file, Guid userId, CancellationToken cancellationToken)
    {
        if (file.Length is <= 0 or > DefaultMaxBytes)
            throw new AvatarValidationException("La foto debe pesar menos de 5 MB.");

        var extension = Path.GetExtension(Path.GetFileName(file.FileName)).ToLowerInvariant();
        if (!AllowedTypes.TryGetValue(extension, out var contentType))
            throw new AvatarValidationException("Usa una imagen JPG, PNG o WebP.");

        await using var memory = new MemoryStream((int)file.Length);
        await file.CopyToAsync(memory, cancellationToken);
        if (!HasExpectedSignature(memory, extension))
            throw new AvatarValidationException("El contenido no coincide con el formato de imagen seleccionado.");

        var storedName = $"{userId:N}{extension}";
        memory.Position = 0;
        await using var destination = File.Create(Path.Combine(root, storedName));
        await memory.CopyToAsync(destination, cancellationToken);
        return new StoredAvatar(storedName, contentType, file.Length);
    }

    public string Resolve(string storedName)
    {
        var fullPath = Path.GetFullPath(Path.Combine(root, storedName.Replace('/', Path.DirectorySeparatorChar)));
        if (!fullPath.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Ruta de avatar inválida.");
        return fullPath;
    }

    public void Delete(string? storedName)
    {
        if (string.IsNullOrWhiteSpace(storedName)) return;
        var path = Resolve(storedName);
        if (File.Exists(path)) File.Delete(path);
    }

    private static bool HasExpectedSignature(MemoryStream stream, string extension)
    {
        var bytes = stream.ToArray();
        bool Starts(params byte[] signature) => bytes.Length >= signature.Length && signature.SequenceEqual(bytes.Take(signature.Length));
        if (extension is ".jpg" or ".jpeg") return Starts(0xFF, 0xD8, 0xFF);
        if (extension == ".png") return Starts(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
        return bytes.Length >= 12 && Encoding.ASCII.GetString(bytes, 0, 4) == "RIFF" && Encoding.ASCII.GetString(bytes, 8, 4) == "WEBP";
    }
}

public sealed class AvatarValidationException(string message) : Exception(message);
