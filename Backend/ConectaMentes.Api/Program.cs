using System.Security.Claims;
using System.Text;
using ConectaMentes.Api;
using ConectaMentes.Api.Auth;
using ConectaMentes.Api.Endpoints;
using ConectaMentes.Application.Auth;
using ConectaMentes.Application.Reputation;
using ConectaMentes.Domain.Entities;
using ConectaMentes.Infrastructure;
using ConectaMentes.Infrastructure.Persistence;
using Google.Apis.Auth;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);
var jwtKey = builder.Configuration["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key must be configured.");

builder.Services.AddProblemDetails(options => options.CustomizeProblemDetails = context =>
{
    context.ProblemDetails.Instance = context.HttpContext.Request.Path;
    context.ProblemDetails.Extensions["traceId"] = context.HttpContext.TraceIdentifier;
});
builder.Services.AddHealthChecks();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSignalR();
builder.Services.AddSingleton<IUserTracker, InMemoryUserTracker>();
builder.Services.Configure<FormOptions>(options => options.MultipartBodyLengthLimit = ChatAttachmentStorage.DefaultMaxBytes + 512 * 1024);
builder.Services.AddSingleton<ChatAttachmentStorage>();
builder.Services.AddSingleton<ProfileAvatarStorage>();
builder.Services.AddHttpClient();
builder.Services.AddHttpClient("GoogleCalendar", client => client.BaseAddress = new Uri("https://www.googleapis.com/"));
builder.Services.AddScoped<GoogleCalendarService>();
builder.Services.AddScoped<DevicePushService>();
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddSingleton<ITokenService, JwtTokenService>();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        ValidateIssuer = true, ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "ConectaMentes.Api",
        ValidateAudience = true, ValidAudience = builder.Configuration["Jwt:Audience"] ?? "ConectaMentes.Frontend",
        ValidateLifetime = true, ClockSkew = TimeSpan.FromMinutes(1)
    };
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var token = context.Request.Query["access_token"];
            if (!string.IsNullOrWhiteSpace(token) && context.HttpContext.Request.Path.StartsWithSegments("/hubs/realtime"))
                context.Token = token;
            return Task.CompletedTask;
        }
    };
});
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("Institutional", policy => policy.RequireRole("coordinator", "moderator"));
    options.AddPolicy("Moderator", policy => policy.RequireRole("moderator"));
    options.AddPolicy("SuperAdmin", policy => policy.RequireRole("superadmin"));
});
builder.Services.AddCors(options => options.AddPolicy("Frontend", policy => policy.WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:5173"]).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

var app = builder.Build();

await app.SetupDatabaseAsync();

app.UseExceptionHandler();
if (!builder.Configuration.GetValue("DisableHttpsRedirection", false))
    app.UseHttpsRedirection();
app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();
if (app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(); }

app.MapSystemEndpoints();
app.MapApiEndpoints();

app.Run();

public partial class Program;
