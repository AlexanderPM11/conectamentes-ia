using ConectaMentes.Application.Reputation;
using ConectaMentes.Domain.Entities;
using ConectaMentes.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using ConectaMentes.Api.Auth;

namespace ConectaMentes.Api.Endpoints;

public static class RankingEndpoints
{
    public static IEndpointRouteBuilder MapRankingEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/ranking", async (string? topic, [FromServices] ConectaMentesDbContext db) =>
        {
            var ranking = await BuildRanking(db, topic);
            return Results.Ok(ranking.Take(10));
        }).RequireAuthorization().WithTags("Valoraciones");

        endpoints.MapGet("/api/ranking/me", async (string? topic, ClaimsPrincipal principal, [FromServices] ConectaMentesDbContext db) =>
        {
            var ranking = await BuildRanking(db, topic);
            var userId = ApiIdentity.UserId(principal);
            var current = ranking.FirstOrDefault(item => item.UserId == userId);
            return Results.Ok(new { position = current?.Position, totalParticipants = ranking.Count, item = current });
        }).RequireAuthorization().WithTags("Valoraciones");

        return endpoints;
    }

    private static async Task<List<ReputationRankingItem>> BuildRanking(ConectaMentesDbContext db, string? topic)
    {
        var normalizedTopic = topic?.Trim();
        var users = await db.Users.AsNoTracking()
            .Where(user => user.AccessStatus == "active")
            .Select(user => new { user.Id, user.DisplayName, user.Career, user.Roles })
            .ToListAsync();
        var students = users.Where(user => user.Roles.Split(',', StringSplitOptions.TrimEntries)
            .Contains("student", StringComparer.OrdinalIgnoreCase)).ToList();
        if (students.Count == 0) return [];

        var studentIds = students.Select(user => user.Id).ToHashSet();
        var skills = await db.SkillProfiles.AsNoTracking()
            .Where(skill => skill.Visible && skill.Type == SkillType.Domina)
            .Select(skill => new { skill.UserId, skill.Topic })
            .ToListAsync();
        var topicsByUser = skills.Where(skill => studentIds.Contains(skill.UserId))
            .GroupBy(skill => skill.UserId)
            .ToDictionary(group => group.Key, group => group.Select(skill => skill.Topic).OrderBy(value => value, StringComparer.OrdinalIgnoreCase).ToList());

        var rows = (await RatingHelpers.ReputationRows(db).AsNoTracking().ToListAsync())
            .Where(row => studentIds.Contains(row.EvaluatedUserId)).ToList();
        if (!string.IsNullOrWhiteSpace(normalizedTopic))
        {
            rows = rows.Where(row => row.Topic.Contains(normalizedTopic, StringComparison.OrdinalIgnoreCase)).ToList();
            var ratedUserIds = rows.Select(row => row.EvaluatedUserId).ToHashSet();
            students = students.Where(user => ratedUserIds.Contains(user.Id)
                || (topicsByUser.TryGetValue(user.Id, out var topics) && topics.Any(value => value.Contains(normalizedTopic, StringComparison.OrdinalIgnoreCase)))).ToList();
        }

        var communityMean = rows.Count > 0 ? rows.Average(row => row.Score) : 4d;
        var rowsByUser = rows.GroupBy(row => row.EvaluatedUserId).ToDictionary(group => group.Key, group => group.ToList());
        return students.Select(user =>
        {
            rowsByUser.TryGetValue(user.Id, out var userRows);
            if (userRows is null || userRows.Count == 0)
                return new ReputationRankingItem(user.Id, user.DisplayName, user.Career,
                    topicsByUser.GetValueOrDefault(user.Id)?.FirstOrDefault() ?? "Sin tema registrado",
                    0, 0, 0, 0, 0, 0);

            var group = userRows;
            var average = Math.Round(group.Average(row => row.Score), 2);
            var topTopic = group.GroupBy(row => row.Topic, StringComparer.OrdinalIgnoreCase)
                .OrderByDescending(topicGroup => topicGroup.Average(row => row.Score))
                .ThenByDescending(topicGroup => topicGroup.Count())
                .Select(topicGroup => topicGroup.Key)
                .FirstOrDefault() ?? "Reputación general";
            return new ReputationRankingItem(user.Id, user.DisplayName, user.Career, topTopic, group.Count(), average, ReputationCalculator.RankingScore(average, group.Count(), communityMean), Math.Round(group.Average(row => row.Clarity), 2), Math.Round(group.Average(row => row.Fulfillment), 2), 0);
        }).OrderByDescending(item => item.RankingScore).ThenByDescending(item => item.TotalRatings).ThenBy(item => item.DisplayName, StringComparer.OrdinalIgnoreCase)
            .Select((item, index) => item with { Position = index + 1 })
            .ToList();
    }
}
