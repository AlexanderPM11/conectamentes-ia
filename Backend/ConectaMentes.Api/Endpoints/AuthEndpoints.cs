using ConectaMentes.Application.Auth;
using Google.Apis.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.AspNetCore.Mvc;

namespace ConectaMentes.Api.Endpoints;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var auth = endpoints.MapGroup("/api/auth").WithTags("Autenticación");

        auth.MapPost("/registro", async ([FromBody] RegisterRequest request, [FromServices] IAuthService service, CancellationToken ct) =>
        {
            try { return Results.Created("/api/usuarios/me", await service.RegisterAsync(new(request.Email, request.Password, request.DisplayName), ct)); }
            catch (ArgumentException ex) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["request"] = [ex.Message] }); }
            catch (InvalidOperationException ex) { return Results.Problem(statusCode: StatusCodes.Status409Conflict, title: "No se pudo completar el registro", detail: ex.Message); }
        }).WithName("Register").WithOpenApi();

        auth.MapPost("/login", async ([FromBody] LoginRequest request, [FromServices] IAuthService service, CancellationToken ct) =>
        {
            try
            {
                var result = await service.LoginAsync(new(request.Email, request.Password), ct);
                return result is null ? Results.Unauthorized() : Results.Ok(result);
            }
            catch (AccountAccessException ex) { return Results.Problem(statusCode: StatusCodes.Status403Forbidden, title: "Acceso restringido", detail: ex.Message, extensions: new Dictionary<string, object?> { ["code"] = $"account_{ex.Status}" }); }
        }).WithName("Login").WithOpenApi();

        auth.MapPost("/logout", () => Results.NoContent()).RequireAuthorization().WithName("Logout").WithOpenApi();

        auth.MapPost("/recuperar-contrasena", () => Results.Accepted(value: new { message = "Si los datos son válidos, recibirás instrucciones para continuar." })).WithName("RecoverPassword").WithOpenApi();

        auth.MapPost("/google", async ([FromBody] GoogleLoginRequest request, [FromServices] IAuthService service, [FromServices] IConfiguration configuration, CancellationToken ct) =>
        {
            var clientId = configuration["Google:ClientId"];
            if (string.IsNullOrWhiteSpace(clientId)) return Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "Inicio con Google no configurado");
            try
            {
                var payload = await GoogleJsonWebSignature.ValidateAsync(request.Credential, new GoogleJsonWebSignature.ValidationSettings { Audience = [clientId] });
                try { return Results.Ok(await service.LoginWithGoogleAsync(new(payload.Email, payload.Name ?? payload.Email), ct)); }
                catch (AccountAccessException ex) { return Results.Problem(statusCode: StatusCodes.Status403Forbidden, title: "Acceso restringido", detail: ex.Message, extensions: new Dictionary<string, object?> { ["code"] = $"account_{ex.Status}" }); }
            }
            catch (InvalidJwtException) { return Results.Unauthorized(); }
        }).WithName("GoogleLogin").WithOpenApi();

        return endpoints;
    }
}
