using ConectaMentes.Domain.Entities;

namespace ConectaMentes.Api.Endpoints;

public sealed record RegisterRequest(string Email, string Password, string DisplayName);
public sealed record ProfileUpdateRequest(string DisplayName, string Career, string AcademicTerm);
public sealed record LoginRequest(string Email, string Password);
public sealed record GoogleLoginRequest(string Credential);
public sealed record SkillRequest(string Topic, SkillType Type, int Confidence, bool Visible = true);
public sealed record AvailabilityRequest(string TimeSlots, string PreferredMode);
public sealed record SupportRequestInput(string Topic, string Description, string? HelpType = "comprender", string? DesiredSchedule = "");
public sealed record AiSupportRequestPrompt(string Prompt);
public sealed record AiSupportRequestSuggestion(string Topic, string Description);
public sealed record ConnectionResponse(bool Accept);
public sealed record ChatMessageInput(string Text);
public sealed record SessionInput(DateTimeOffset Date, int DurationMinutes, string Mode, string Objective);
public sealed record GoogleMeetRequest(string AccessToken);
public sealed record PushSubscriptionInput(string Endpoint, PushSubscriptionKeys Keys);
public sealed record PushSubscriptionKeys(string P256dh, string Auth);
public sealed record PushUnsubscribeInput(string Endpoint);
public sealed record AdminAccessStatusInput(string Status, string? Reason);
public sealed record RatingInput(int Usefulness, int Respect, int Fulfillment, int Clarity, string? Comment);
public sealed record ReportInput(Guid ReportedUserId, Guid ReferenceId, string Reason, string Description);
public sealed record ModerationInput(ReportStatus Status, string ResolutionNote);
public sealed record ReputationRow(Guid EvaluatedUserId, string DisplayName, string Career, string Topic, int Usefulness, int Respect, int Fulfillment, int Clarity, double Score, string Comment, DateTimeOffset CreatedAt);
public sealed record ReputationRankingItem(Guid UserId, string DisplayName, string Career, string Topic, int TotalRatings, double Average, double RankingScore, double Clarity, double Fulfillment, int Position);
public sealed record CommentInput(string Text);
