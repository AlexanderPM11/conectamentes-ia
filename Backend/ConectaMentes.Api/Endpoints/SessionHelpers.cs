using Microsoft.AspNetCore.Http;
using ConectaMentes.Domain.Entities;

namespace ConectaMentes.Api.Endpoints;

public static class SessionHelpers
{
    public static IResult? ValidateSessionInput(SessionInput input) 
    { 
        var errors = new Dictionary<string, string[]>(); 
        if (input.Date <= DateTimeOffset.UtcNow) errors["date"] = ["La fecha debe estar en el futuro."]; 
        if (input.DurationMinutes is not (30 or 45 or 60)) errors["durationMinutes"] = ["La duración debe ser de 30, 45 o 60 minutos."]; 
        if (string.IsNullOrWhiteSpace(input.Objective) || input.Objective.Trim().Length > 300) errors["objective"] = ["El objetivo es obligatorio y debe tener hasta 300 caracteres."]; 
        if (input.Mode.Trim().ToLowerInvariant() is not ("virtual" or "presencial")) errors["mode"] = ["La modalidad debe ser virtual o presencial."]; 
        return errors.Count > 0 ? Results.ValidationProblem(errors) : null; 
    }

    public static string FormatDominicanDateTime(DateTimeOffset value)
    {
        var local = value.ToOffset(TimeSpan.FromHours(-4));
        var hour = local.Hour % 12 is 0 ? 12 : local.Hour % 12;
        var period = local.Hour < 12 ? "a. m." : "p. m.";
        return $"{local:dd/MM/yyyy} a las {hour}:{local:mm} {period}";
    }
}
