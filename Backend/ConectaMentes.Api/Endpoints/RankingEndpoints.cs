using ConectaMentes.Application.Reputation;
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
        var rows = await RatingHelpers.ReputationRows(db).ToListAsync();
        if (!string.IsNullOrWhiteSpace(normalizedTopic)) rows = rows.Where(row => row.Topic.Contains(normalizedTopic, StringComparison.OrdinalIgnoreCase)).ToList();
        if (rows.Count == 0) return [];

        var communityMean = rows.Average(row => row.Score);
        return rows.GroupBy(row => new { row.EvaluatedUserId, row.DisplayName, row.Career }).Select(group =>
        {
            var average = Math.Round(group.Average(row => row.Score), 2);
            var topTopic = group.GroupBy(row => row.Topic, StringComparer.OrdinalIgnoreCase)
                .OrderByDescending(topicGroup => topicGroup.Average(row => row.Score))
                .ThenByDescending(topicGroup => topicGroup.Count())
                .Select(topicGroup => topicGroup.Key)
                .FirstOrDefault() ?? "Reputación general";
            return new ReputationRankingItem(group.Key.EvaluatedUserId, group.Key.DisplayName, group.Key.Career, topTopic, group.Count(), average, ReputationCalculator.RankingScore(average, group.Count(), communityMean), Math.Round(group.Average(row => row.Clarity), 2), Math.Round(group.Average(row => row.Fulfillment), 2), 0);
        }).OrderByDescending(item => item.RankingScore).ThenByDescending(item => item.TotalRatings).ThenBy(item => item.DisplayName)
            .Select((item, index) => item with { Position = index + 1 })
            .ToList();
    }
}
