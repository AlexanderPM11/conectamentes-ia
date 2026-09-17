using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;

namespace ConectaMentes.Api.Endpoints;

public static class ApiEndpointsExtensions
{
    public static IEndpointRouteBuilder MapApiEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapAuthEndpoints();
        endpoints.MapUserEndpoints();
        endpoints.MapProfileEndpoints();
        endpoints.MapPushNotificationEndpoints();
        endpoints.MapRequestEndpoints();
        endpoints.MapMatchEndpoints();
        endpoints.MapDiscoveryEndpoints();
        endpoints.MapConnectionEndpoints();
        endpoints.MapSessionEndpoints();
        endpoints.MapChatEndpoints();
        endpoints.MapNotificationEndpoints();
        endpoints.MapRatingEndpoints();
        endpoints.MapRankingEndpoints();
        endpoints.MapPanelEndpoints();
        endpoints.MapAdminEndpoints();

        return endpoints;
    }
}
