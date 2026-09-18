using ConectaMentes.Domain.Entities;
using ConectaMentes.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ConectaMentes.Application.Auth;

namespace ConectaMentes.Api.Endpoints;

public static class DatabaseSetupExtensions
{
    public static async Task SetupDatabaseAsync(this WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ConectaMentesDbContext>();
        await db.Database.EnsureCreatedAsync();

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS `SupportRequestComments` (
              `Id` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
              `RequestId` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
              `AuthorId` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
              `Text` varchar(1500) NOT NULL,
              `CreatedAt` datetime(6) NOT NULL,
              PRIMARY KEY (`Id`), INDEX `IX_SupportRequestComments_RequestId_CreatedAt` (`RequestId`,`CreatedAt`)
            );
            """);

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS `Notifications` (
              `Id` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
              `UserId` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
              `Type` varchar(40) NOT NULL,
              `Title` varchar(140) NOT NULL,
              `Body` varchar(500) NOT NULL,
              `ReferenceId` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NULL,
              `IsRead` tinyint(1) NOT NULL DEFAULT 0,
              `CreatedAt` datetime(6) NOT NULL,
              PRIMARY KEY (`Id`), INDEX `IX_Notifications_UserId_IsRead_CreatedAt` (`UserId`,`IsRead`,`CreatedAt`)
            );
            """);

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS `ChatMessages` (
              `Id` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
              `ConnectionId` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
              `SenderId` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
              `Text` varchar(1500) NOT NULL,
              `CreatedAt` datetime(6) NOT NULL,
              PRIMARY KEY (`Id`), INDEX `IX_ChatMessages_ConnectionId_CreatedAt` (`ConnectionId`,`CreatedAt`)
            );
            """);

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS `ChatAttachments` (
              `Id` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
              `MessageId` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
              `ConnectionId` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
              `SenderId` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
              `FileName` varchar(180) NOT NULL,
              `StoredName` varchar(260) NOT NULL,
              `ContentType` varchar(120) NOT NULL,
              `SizeBytes` bigint NOT NULL,
              `CreatedAt` datetime(6) NOT NULL,
              PRIMARY KEY (`Id`), UNIQUE INDEX `IX_ChatAttachments_MessageId` (`MessageId`), INDEX `IX_ChatAttachments_ConnectionId_CreatedAt` (`ConnectionId`,`CreatedAt`)
            );
            """);

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS `PushSubscriptions` (
              `Id` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
              `UserId` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
              `EndpointHash` varchar(64) NOT NULL,
              `Endpoint` varchar(2048) NOT NULL,
              `P256dh` varchar(256) NOT NULL,
              `Auth` varchar(128) NOT NULL,
              `CreatedAt` datetime(6) NOT NULL,
              `UpdatedAt` datetime(6) NOT NULL,
              PRIMARY KEY (`Id`), UNIQUE INDEX `IX_PushSubscriptions_EndpointHash` (`EndpointHash`), INDEX `IX_PushSubscriptions_UserId` (`UserId`)
            );
            """);

        await EnsureColumnAsync(db, "Sessions", "MeetUrl");
        await EnsureColumnAsync(db, "Sessions", "GoogleCalendarEventId");
        await EnsureColumnAsync(db, "Users", "AccessStatus");
        await EnsureColumnAsync(db, "Users", "AccessStatusReason");
        await EnsureColumnAsync(db, "Users", "AccessStatusChangedAt");
        await EnsureColumnAsync(db, "Users", "AvatarPath");
        await EnsureColumnAsync(db, "Users", "AvatarUpdatedAt");
        await EnsureNullableColumnAsync(db, "Connections", "RequestId");
        await EnsureNullableColumnAsync(db, "Connections", "MatchId");
        await EnsureIndexAsync(db, "Ratings", "UX_Ratings_SessionId_AuthorId", "CREATE UNIQUE INDEX `UX_Ratings_SessionId_AuthorId` ON `Ratings` (`SessionId`, `AuthorId`);");
        
        var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        await EnsureAdminRootAsync(db, config);
    }

    private static async Task EnsureColumnAsync(ConectaMentesDbContext db, string tableName, string columnName)
    {
        var connection = db.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open) await connection.OpenAsync();
        await using var check = connection.CreateCommand();
        check.CommandText = "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = @table AND column_name = @column";
        var tableParameter = check.CreateParameter(); tableParameter.ParameterName = "@table"; tableParameter.Value = tableName; check.Parameters.Add(tableParameter);
        var columnParameter = check.CreateParameter(); columnParameter.ParameterName = "@column"; columnParameter.Value = columnName; check.Parameters.Add(columnParameter);
        if (Convert.ToInt32(await check.ExecuteScalarAsync()) > 0) return;
        var statement = (tableName, columnName) switch
        {
            ("Sessions", "MeetUrl") => "ALTER TABLE `Sessions` ADD COLUMN `MeetUrl` varchar(500) NULL;",
            ("Sessions", "GoogleCalendarEventId") => "ALTER TABLE `Sessions` ADD COLUMN `GoogleCalendarEventId` varchar(200) NULL;",
            ("Users", "AccessStatus") => "ALTER TABLE `Users` ADD COLUMN `AccessStatus` varchar(20) NOT NULL DEFAULT 'active';",
            ("Users", "AccessStatusReason") => "ALTER TABLE `Users` ADD COLUMN `AccessStatusReason` varchar(500) NULL;",
            ("Users", "AccessStatusChangedAt") => "ALTER TABLE `Users` ADD COLUMN `AccessStatusChangedAt` datetime(6) NULL;",
            ("Users", "AvatarPath") => "ALTER TABLE `Users` ADD COLUMN `AvatarPath` varchar(260) NULL;",
            ("Users", "AvatarUpdatedAt") => "ALTER TABLE `Users` ADD COLUMN `AvatarUpdatedAt` datetime(6) NULL;",
            _ => throw new InvalidOperationException("Cambio de esquema no permitido.")
        };
        await db.Database.ExecuteSqlRawAsync(statement);
    }

    private static async Task EnsureAdminRootAsync(ConectaMentesDbContext db, IConfiguration configuration)
    {
        var email = configuration["Admin:Email"]?.Trim().ToLowerInvariant();
        var password = configuration["Admin:Password"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password)) return;
        if (password.Length < 12) throw new InvalidOperationException("Admin:Password debe tener al menos 12 caracteres.");
        var displayName = configuration["Admin:DisplayName"]?.Trim();
        var root = await db.Users.SingleOrDefaultAsync(user => user.Email == email);
        if (root is null)
        {
            root = new User(email, PasswordService.Hash(password), string.IsNullOrWhiteSpace(displayName) ? "Superadministrador" : displayName, "Administración del sistema", "Root");
            root.SetRoles("superadmin");
            db.Users.Add(root);
        }
        else if (!root.Roles.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Contains("superadmin", StringComparer.OrdinalIgnoreCase)) root.SetRoles("superadmin");
        await db.SaveChangesAsync();
    }

    private static async Task EnsureIndexAsync(ConectaMentesDbContext db, string tableName, string indexName, string statement)
    {
        var connection = db.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open) await connection.OpenAsync();
        await using var check = connection.CreateCommand();
        check.CommandText = "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = @table AND index_name = @index";
        var tableParameter = check.CreateParameter(); tableParameter.ParameterName = "@table"; tableParameter.Value = tableName; check.Parameters.Add(tableParameter);
        var indexParameter = check.CreateParameter(); indexParameter.ParameterName = "@index"; indexParameter.Value = indexName; check.Parameters.Add(indexParameter);
        if (Convert.ToInt32(await check.ExecuteScalarAsync()) > 0) return;
        if (tableName != "Ratings" || indexName != "UX_Ratings_SessionId_AuthorId") throw new InvalidOperationException("Índice no permitido.");
        await db.Database.ExecuteSqlRawAsync(statement);
    }

    private static async Task EnsureNullableColumnAsync(ConectaMentesDbContext db, string tableName, string columnName)
    {
        var connection = db.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open) await connection.OpenAsync();
        await using var check = connection.CreateCommand();
        check.CommandText = "SELECT IS_NULLABLE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = @table AND column_name = @column";
        var tableParameter = check.CreateParameter(); tableParameter.ParameterName = "@table"; tableParameter.Value = tableName; check.Parameters.Add(tableParameter);
        var columnParameter = check.CreateParameter(); columnParameter.ParameterName = "@column"; columnParameter.Value = columnName; check.Parameters.Add(columnParameter);
        var nullable = Convert.ToString(await check.ExecuteScalarAsync());
        if (nullable is null || string.Equals(nullable, "YES", StringComparison.OrdinalIgnoreCase)) return;

        var statement = (tableName, columnName) switch
        {
            ("Connections", "RequestId") => "ALTER TABLE `Connections` MODIFY COLUMN `RequestId` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NULL;",
            ("Connections", "MatchId") => "ALTER TABLE `Connections` MODIFY COLUMN `MatchId` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NULL;",
            _ => throw new InvalidOperationException("Cambio de esquema no permitido.")
        };
        await db.Database.ExecuteSqlRawAsync(statement);
    }
}
