using System.Security.Claims;
using ConectaMentes.Api.Auth;
using ConectaMentes.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace ConectaMentes.Api.Endpoints;

public static class PushNotificationEndpoints
{
    public static IEndpointRouteBuilder MapPushNotificationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var pushEndpoints = endpoints.MapGroup("/api/push").RequireAuthorization().WithTags("Notificaciones push");

        pushEndpoints.MapGet("/public-key", ([FromServices] DevicePushService devicePush) => devicePush.PublicKey is { } key
            ? Results.Ok(new { publicKey = key })
            : Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "Notificaciones push no configuradas"));

        pushEndpoints.MapPost("/subscriptions", async ([FromBody] PushSubscriptionInput input, ClaimsPrincipal principal, [FromServices] DevicePushService devicePush, CancellationToken ct) =>
        {
            try
            {
                await devicePush.SaveSubscriptionAsync(ApiIdentity.UserId(principal), input.Endpoint, input.Keys.P256dh, input.Keys.Auth, ct);
                return Results.NoContent();
            }
            catch (ArgumentException exception)
            {
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["subscription"] = [exception.Message] });
            }
            catch (InvalidOperationException exception)
            {
                return Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "Notificaciones push no configuradas", detail: exception.Message);
            }
        });

        pushEndpoints.MapDelete("/subscriptions", async ([FromBody] PushUnsubscribeInput input, ClaimsPrincipal principal, [FromServices] DevicePushService devicePush, CancellationToken ct) =>
        {
            await devicePush.RemoveSubscriptionAsync(ApiIdentity.UserId(principal), input.Endpoint, ct);
            return Results.NoContent();
        });

        return endpoints;
    }
}
