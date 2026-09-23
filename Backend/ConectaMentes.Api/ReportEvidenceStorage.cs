using System.IO.Compression;

namespace ConectaMentes.Api;

public sealed record StoredReportEvidence(string FileName, string StoredName, string ContentType, long SizeBytes);

public sealed class ReportEvidenceStorage
{
    private const long MaxBytes = 10 * 1024 * 1024;
    private static readonly IReadOnlyDictionary<string, string> AllowedTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        [".jpg"] = "image/jpeg", [".jpeg"] = "image/jpeg", [".png"] = "image/png", [".webp"] = "image/webp", [".gif"] = "image/gif",
        [".pdf"] = "application/pdf", [".docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document", [".xlsx"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", [".pptx"] = "application/vnd.openxmlformats-officedocument.presentationml.presentation", [".txt"] = "text/plain"
    };

    private readonly string root;

    public ReportEvidenceStorage(IConfiguration configuration, IWebHostEnvironment environment)
    {
        var configured = configuration["ReportUploads:Path"];
        root = Path.GetFullPath(string.IsNullOrWhiteSpace(configured) ? Path.Combine(environment.ContentRootPath, "data", "report-uploads") : configured);
        Directory.CreateDirectory(root);
    }

    public async Task<StoredReportEvidence> SaveAsync(IFormFile file, Guid reportId, CancellationToken cancellationToken)
    {
        if (file.Length is <= 0 or > MaxBytes) throw new ReportFileValidationException("La evidencia debe pesar menos de 10 MB.");
        var name = Path.GetFileName(file.FileName).Trim();
        foreach (var invalid in Path.GetInvalidFileNameChars()) name = name.Replace(invalid, '_');
        if (name.Length > 180) name = name[..180];
        var extension = Path.GetExtension(name).ToLowerInvariant();
        if (!AllowedTypes.TryGetValue(extension, out var contentType)) throw new ReportFileValidationException("Formato no permitido. Usa imágenes, PDF, Word, Excel, PowerPoint o texto.");

        await using var memory = new MemoryStream((int)file.Length);
        await file.CopyToAsync(memory, cancellationToken);
        if (!HasExpectedSignature(memory, extension)) throw new ReportFileValidationException("El contenido del archivo no coincide con su formato.");
        var directory = Path.Combine(root, reportId.ToString("N"));
        Directory.CreateDirectory(directory);
        var storedName = $"{reportId:N}/{Guid.NewGuid():N}{extension}";
        memory.Position = 0;
        await using var destination = File.Create(Path.Combine(root, storedName.Replace('/', Path.DirectorySeparatorChar)));
        await memory.CopyToAsync(destination, cancellationToken);
        return new StoredReportEvidence(string.IsNullOrWhiteSpace(name) ? "evidencia" : name, storedName, contentType, file.Length);
    }

    public string Resolve(string storedName)
    {
        var fullPath = Path.GetFullPath(Path.Combine(root, storedName.Replace('/', Path.DirectorySeparatorChar)));
        if (!fullPath.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Ruta de evidencia inválida.");
        return fullPath;
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
        try { using var archive = new ZipArchive(stream, ZipArchiveMode.Read, true); var prefix = extension switch { ".docx" => "word/", ".xlsx" => "xl/", ".pptx" => "ppt/", _ => "" }; return archive.Entries.Any(entry => entry.FullName == "[Content_Types].xml") && archive.Entries.Any(entry => entry.FullName.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)); }
        catch (InvalidDataException) { return false; }
    }
}

public sealed class ReportFileValidationException(string message) : Exception(message);
