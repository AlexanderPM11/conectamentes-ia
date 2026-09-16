namespace ConectaMentes.Application.Reputation;

public static class ReputationCalculator
{
    public const double DefaultCommunityMean = 4.0;
    public const int ConfidenceWeight = 3;

    public static double SessionScore(int usefulness, int respect, int fulfillment, int clarity)
        => Math.Round((usefulness + respect + fulfillment + clarity) / 4d, 2);

    public static double RankingScore(double average, int totalRatings, double communityMean = DefaultCommunityMean)
    {
        if (totalRatings <= 0) return 0;
        return Math.Round(((average * totalRatings) + (communityMean * ConfidenceWeight)) / (totalRatings + ConfidenceWeight), 2);
    }
}
