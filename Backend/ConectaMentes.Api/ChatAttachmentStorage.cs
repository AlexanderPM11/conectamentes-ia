using System.IO.Compression;

namespace ConectaMentes.Api;

public sealed record StoredChatFile(string FileName, string StoredName, string ContentType, long SizeBytes);

public sealed class ChatAttachmentStorage
{
    public const long DefaultMaxBytes = 10 * 1024 * 1024;

    private static readonly IReadOnlyDictionary<string, string> AllowedTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".png"] = "image/png",
        [".webp"] = "image/webp",
        [".gif"] = "image/gif",
        [".pdf"] = "application/pdf",
        [".docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        [".xlsx"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        [".pptx"] = "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        [".txt"] = "text/plain"
    };

    private readonly string root;

    public ChatAttachmentStorage(IConfiguration configuration, IWebHostEnvironment environment)
    {
        MaxBytes = configuration.GetValue<long?>("ChatUploads:MaxBytes") ?? DefaultMaxBytes;
        var configured = configuration["ChatUploads:Path"];
        root = Path.GetFullPath(string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(environment.ContentRootPath, "data", "chat-uploads")
            : configured);
        Directory.CreateDirectory(root);
    }

    public long MaxBytes { get; }

    public async Task<StoredChatFile> SaveAsync(IFormFile file, Guid connectionId, Guid attachmentId, CancellationToken cancellationToken)
    {
        if (file.Length is <= 0 || file.Length > MaxBytes)
            throw new ChatFileValidationException($"El archivo debe pesar menos de {MaxBytes / 1024 / 1024} MB.");

        var originalName = CleanFileName(file.FileName);
        var extension = Path.GetExtension(originalName).ToLowerInvariant();
        if (!AllowedTypes.TryGetValue(extension, out var contentType))
            throw new ChatFileValidationException("Formato no permitido. Usa imágenes, PDF, Word, Excel, PowerPoint o texto.");

        await using var memory = new MemoryStream((int)file.Length);
        await file.CopyToAsync(memory, cancellationToken);
        if (!HasExpectedSignature(memory, extension))
            throw new ChatFileValidationException("El contenido del archivo no coincide con su formato.");

        var relativeDirectory = connectionId.ToString("N");
        var storedName = Path.Combine(relativeDirectory, $"{attachmentId:N}{extension}");
        var directory = Path.Combine(root, relativeDirectory);
        Directory.CreateDirectory(directory);
        memory.Position = 0;
        await using var destination = File.Create(Path.Combine(root, storedName));
        await memory.CopyToAsync(destination, cancellationToken);

        return new StoredChatFile(originalName, storedName.Replace('\\', '/'), contentType, file.Length);
    }

    public string Resolve(string storedName)
    {
        var fullPath = Path.GetFullPath(Path.Combine(root, storedName.Replace('/', Path.DirectorySeparatorChar)));
        if (!fullPath.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Ruta de adjunto inválida.");
        return fullPath;
    }

    public void Delete(string storedName)
    {
        var path = Resolve(storedName);
        if (File.Exists(path)) File.Delete(path);
    }

    private static string CleanFileName(string value)
    {
        var name = Path.GetFileName(value).Trim();
        foreach (var invalid in Path.GetInvalidFileNameChars()) name = name.Replace(invalid, '_');
        if (name.Length > 180)
        {
            var extension = Path.GetExtension(name);
            name = name[..Math.Max(1, 180 - extension.Length)] + extension;
        }
        return string.IsNullOrWhiteSpace(name) ? "archivo" : name;
    }

    private static bool HasExpectedSignature(MemoryStream stream, string extension)
    {
        var bytes = stream.ToArray();
        bool Starts(params byte[] signature) => bytes.Length >= signature.Length && signature.SequenceEqual(bytes.Take(signature.Length));
        if (extension is ".jpg" or ".jpeg") return Starts(0xFF, 0xD8, 0xFF);
        if (extension == ".png") return Starts(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
        if (extension == ".gif") return bytes.Length >= 6 && (System.Text.Encoding.ASCII.GetString(bytes, 0, 6) is "GIF87a" or "GIF89a");
        if (extension == ".webp") return bytes.Length >= 12 && System.Text.Encoding.ASCII.GetString(bytes, 0, 4) == "RIFF" && System.Text.Encoding.ASCII.GetString(bytes, 8, 4) == "WEBP";
        if (extension == ".pdf") return Starts(0x25, 0x50, 0x44, 0x46, 0x2D);
        if (extension == ".txt") return !bytes.Take(Math.Min(bytes.Length, 4096)).Contains((byte)0);
        if (!Starts(0x50, 0x4B, 0x03, 0x04)) return false;

        stream.Position = 0;
        try
        {
            using var archive = new ZipArchive(stream, ZipArchiveMode.Read, leaveOpen: true);
            var requiredPrefix = extension switch { ".docx" => "word/", ".xlsx" => "xl/", ".pptx" => "ppt/", _ => "" };
            return archive.Entries.Any(entry => entry.FullName == "[Content_Types].xml") && archive.Entries.Any(entry => entry.FullName.StartsWith(requiredPrefix, StringComparison.OrdinalIgnoreCase));
        }
        catch (InvalidDataException) { return false; }
    }
}

public sealed class ChatFileValidationException(string message) : Exception(message);
