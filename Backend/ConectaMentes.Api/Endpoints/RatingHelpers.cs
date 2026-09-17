using ConectaMentes.Domain.Entities;
using ConectaMentes.Infrastructure.Persistence;

namespace ConectaMentes.Api.Endpoints;

public static class RatingHelpers
{
    public static IQueryable<ReputationRow> ReputationRows(ConectaMentesDbContext db) =>
        from rating in db.Ratings
        join session in db.Sessions on rating.SessionId equals session.Id
        join connection in db.Connections on session.ConnectionId equals connection.Id
        join request in db.SupportRequests on connection.RequestId equals request.Id
        join user in db.Users on rating.EvaluatedUserId equals user.Id
        select new ReputationRow(rating.EvaluatedUserId, user.DisplayName, user.Career, request.Topic, rating.Usefulness, rating.Respect, rating.Fulfillment, rating.Clarity, (rating.Usefulness + rating.Respect + rating.Fulfillment + rating.Clarity) / 4d, rating.Comment, rating.CreatedAt);
}
