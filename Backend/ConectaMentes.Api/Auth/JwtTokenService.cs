using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using ConectaMentes.Application.Auth;
using ConectaMentes.Domain.Entities;
using Microsoft.IdentityModel.Tokens;

namespace ConectaMentes.Api.Auth;

public sealed class JwtTokenService(IConfiguration configuration) : ITokenService
{
    public string CreateToken(User user)
    {
        var key = configuration["Jwt:Key"] ?? throw new InvalidOperationException("JWT key is not configured.");
        var credentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256);
        var roles = user.Roles
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(ClaimTypes.Name, user.DisplayName)
        };
        claims.AddRange(roles.Select(role => new Claim(ClaimTypes.Role, role)));
        var token = new JwtSecurityToken(configuration["Jwt:Issuer"] ?? "ConectaMentes.Api", configuration["Jwt:Audience"] ?? "ConectaMentes.Frontend", claims, expires: DateTime.UtcNow.AddHours(8), signingCredentials: credentials);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
