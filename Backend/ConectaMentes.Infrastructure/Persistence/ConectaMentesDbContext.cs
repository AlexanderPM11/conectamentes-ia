using ConectaMentes.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ConectaMentes.Infrastructure.Persistence;

public sealed class ConectaMentesDbContext(DbContextOptions<ConectaMentesDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<SkillProfile> SkillProfiles => Set<SkillProfile>();
    public DbSet<Availability> Availabilities => Set<Availability>();
    public DbSet<SupportRequest> SupportRequests => Set<SupportRequest>();
    public DbSet<SupportRequestComment> SupportRequestComments => Set<SupportRequestComment>();
    public DbSet<Match> Matches => Set<Match>();
    public DbSet<Connection> Connections => Set<Connection>();
    public DbSet<LearningSession> Sessions => Set<LearningSession>();
    public DbSet<Rating> Ratings => Set<Rating>();
    public DbSet<Recognition> Recognitions => Set<Recognition>();
    public DbSet<Block> Blocks => Set<Block>();
    public DbSet<Report> Reports => Set<Report>();
    public DbSet<ReportEvidence> ReportEvidences => Set<ReportEvidence>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<PushSubscriptionRecord> PushSubscriptions => Set<PushSubscriptionRecord>();
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
    public DbSet<ChatAttachment> ChatAttachments => Set<ChatAttachment>();
    public DbSet<TutorConversation> TutorConversations => Set<TutorConversation>();
    public DbSet<TutorMessage> TutorMessages => Set<TutorMessage>();
    public DbSet<TutorUsage> TutorUsages => Set<TutorUsage>();
    public DbSet<Subscription> Subscriptions => Set<Subscription>();

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
            entity.Property(user => user.AvatarPath).HasMaxLength(260);
            entity.Property(user => user.Roles).HasMaxLength(200).IsRequired();
            entity.Property(user => user.AccessStatus).HasMaxLength(20).IsRequired();
            entity.Property(user => user.AccessStatusReason).HasMaxLength(500);
            entity.HasIndex(user => user.AccessStatus);
        });
        modelBuilder.Entity<Notification>(entity =>
        {
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => new { item.UserId, item.IsRead, item.CreatedAt });
            entity.Property(item => item.Type).HasMaxLength(40).IsRequired();
            entity.Property(item => item.Title).HasMaxLength(140).IsRequired();
            entity.Property(item => item.Body).HasMaxLength(500).IsRequired();
        });
        modelBuilder.Entity<PushSubscriptionRecord>(entity =>
        {
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.EndpointHash).IsUnique();
            entity.HasIndex(item => item.UserId);
            entity.Property(item => item.EndpointHash).HasMaxLength(64).IsRequired();
            entity.Property(item => item.Endpoint).HasMaxLength(2048).IsRequired();
            entity.Property(item => item.P256dh).HasMaxLength(256).IsRequired();
            entity.Property(item => item.Auth).HasMaxLength(128).IsRequired();
        });
        modelBuilder.Entity<ChatMessage>(entity =>
        {
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => new { item.ConnectionId, item.CreatedAt });
            entity.Property(item => item.Text).HasMaxLength(1500).IsRequired();
        });
        modelBuilder.Entity<ChatAttachment>(entity =>
        {
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.MessageId).IsUnique();
            entity.HasIndex(item => new { item.ConnectionId, item.CreatedAt });
            entity.Property(item => item.FileName).HasMaxLength(180).IsRequired();
            entity.Property(item => item.StoredName).HasMaxLength(260).IsRequired();
            entity.Property(item => item.ContentType).HasMaxLength(120).IsRequired();
        });
        modelBuilder.Entity<LearningSession>(entity =>
        {
            entity.Property(item => item.MeetUrl).HasMaxLength(500);
            entity.Property(item => item.GoogleCalendarEventId).HasMaxLength(200);
        });
        modelBuilder.Entity<Report>(entity =>
        {
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => new { item.Status, item.CreatedAt });
            entity.Property(item => item.Reason).HasMaxLength(80).IsRequired();
            entity.Property(item => item.Description).HasMaxLength(4000).IsRequired();
            entity.Property(item => item.ResolutionNote).HasMaxLength(2000).IsRequired();
        });
        modelBuilder.Entity<ReportEvidence>(entity =>
        {
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.ReportId);
            entity.Property(item => item.FileName).HasMaxLength(180).IsRequired();
            entity.Property(item => item.StoredName).HasMaxLength(260).IsRequired();
            entity.Property(item => item.ContentType).HasMaxLength(120).IsRequired();
        });
        modelBuilder.Entity<TutorConversation>(entity =>
        {
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => new { item.UserId, item.LastActivityAt });
            entity.Property(item => item.Subject).HasMaxLength(160).IsRequired();
            entity.Property(item => item.Title).HasMaxLength(180).IsRequired();
        });
        modelBuilder.Entity<TutorMessage>(entity =>
        {
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => new { item.ConversationId, item.CreatedAt });
            entity.Property(item => item.Content).HasMaxLength(8000).IsRequired();
            entity.Property(item => item.Mode).HasMaxLength(40).IsRequired();
        });
        modelBuilder.Entity<TutorUsage>(entity =>
        {
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => new { item.UserId, item.PeriodStart }).IsUnique();
        });
        modelBuilder.Entity<Subscription>(entity =>
        {
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.UserId).IsUnique();
            entity.Property(item => item.Provider).HasMaxLength(40).IsRequired();
            entity.Property(item => item.ExternalSubscriptionId).HasMaxLength(180);
        });
        modelBuilder.Entity<Rating>(entity =>
        {
            entity.HasIndex(item => new { item.SessionId, item.AuthorId }).IsUnique();
            entity.HasIndex(item => new { item.ConnectionId, item.AuthorId }).IsUnique();
            entity.HasIndex(item => new { item.EvaluatedUserId, item.CreatedAt });
            entity.Property(item => item.Comment).HasMaxLength(500);
        });
    }
}
