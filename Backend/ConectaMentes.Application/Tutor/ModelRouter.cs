namespace ConectaMentes.Application.Tutor;

public sealed record ModelRouteCandidate(string Id, string Description, string Cost, string Latency, string Context);
public sealed record ModelRouteDecision(string ModelId, double Confidence, bool UsedJev);

public interface IModelRouter
{
    Task<ModelRouteDecision> RouteAsync(string task, CancellationToken cancellationToken = default);
}
