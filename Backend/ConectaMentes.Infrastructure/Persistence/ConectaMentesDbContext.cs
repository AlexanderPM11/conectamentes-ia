using ConectaMentes.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ConectaMentes.Infrastructure.Persistence;

public sealed class ConectaMentesDbContext(DbContextOptions<ConectaMentesDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<SkillProfile> SkillProfiles => Set<SkillProfile>();
    public DbSet<Availability> Availabilities => Set<Availability>();
    public DbSet<SupportRequest> SupportRequests => Set<SupportRequest>();
    public DbSet<Match> Matches => Set<Match>();
    public DbSet<Connection> Connections => Set<Connection>();
    public DbSet<LearningSession> Sessions => Set<LearningSession>();
    public DbSet<Rating> Ratings => Set<Rating>();
    public DbSet<Recognition> Recognitions => Set<Recognition>();
    public DbSet<Block> Blocks => Set<Block>();
    public DbSet<Report> Reports => Set<Report>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(user => user.Id);
            entity.HasIndex(user => user.Email).IsUnique();
            entity.Property(user => user.Email).HasMaxLength(320).IsRequired();
            entity.Property(user => user.PasswordHash).IsRequired();
            entity.Property(user => user.DisplayName).HasMaxLength(120).IsRequired();
            entity.Property(user => user.Career).HasMaxLength(160).IsRequired();
            entity.Property(user => user.AcademicTerm).HasMaxLength(80).IsRequired();
            entity.Property(user => user.Roles).HasMaxLength(200).IsRequired();
        });
        modelBuilder.Entity<Notification>(entity =>
        {
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => new { item.UserId, item.IsRead, item.CreatedAt });
            entity.Property(item => item.Type).HasMaxLength(40).IsRequired();
            entity.Property(item => item.Title).HasMaxLength(140).IsRequired();
            entity.Property(item => item.Body).HasMaxLength(500).IsRequired();
        });
        modelBuilder.Entity<ChatMessage>(entity =>
        {
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => new { item.ConnectionId, item.CreatedAt });
            entity.Property(item => item.Text).HasMaxLength(1500).IsRequired();
        });
    }
}
