using System.Security.Claims;

namespace ConectaMentes.Api;

public static class ApiIdentity
{
    public static Guid UserId(ClaimsPrincipal principal) => Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? principal.FindFirstValue("sub")!);
}
