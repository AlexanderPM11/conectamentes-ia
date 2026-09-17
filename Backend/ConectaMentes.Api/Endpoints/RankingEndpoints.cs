using ConectaMentes.Application.Reputation;
using ConectaMentes.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace ConectaMentes.Api.Endpoints;

public static class RankingEndpoints
{
    public static IEndpointRouteBuilder MapRankingEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/ranking", async (string? topic, [FromServices] ConectaMentesDbContext db) =>
        {
            var normalizedTopic = topic?.Trim().ToLowerInvariant();
            var rows = await RatingHelpers.ReputationRows(db).ToListAsync();
            if (!string.IsNullOrWhiteSpace(normalizedTopic)) rows = rows.Where(row => row.Topic.Contains(normalizedTopic, StringComparison.OrdinalIgnoreCase)).ToList();
            if (rows.Count == 0) return Results.Ok(Array.Empty<ReputationRankingItem>());
            var communityMean = rows.Average(row => row.Score);
            var ranking = rows.GroupBy(row => new { row.EvaluatedUserId, row.DisplayName, row.Career, row.Topic }).Select(group =>
            {
                var average = Math.Round(group.Average(row => row.Score), 2);
                return new ReputationRankingItem(group.Key.EvaluatedUserId, group.Key.DisplayName, group.Key.Career, group.Key.Topic, group.Count(), average, ReputationCalculator.RankingScore(average, group.Count(), communityMean), Math.Round(group.Average(row => row.Clarity), 2), Math.Round(group.Average(row => row.Fulfillment), 2), 0);
            }).OrderByDescending(item => item.RankingScore).ThenByDescending(item => item.TotalRatings).ThenBy(item => item.DisplayName).Take(50).ToList();
            return Results.Ok(ranking.Select((item, index) => item with { Position = index + 1 }));
        }).RequireAuthorization().WithTags("Valoraciones");

        return endpoints;
    }
}
