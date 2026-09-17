using System.Collections.Concurrent;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace ConectaMentes.Api;

public interface IUserTracker
{
    bool AddConnection(Guid userId, string connectionId);
    bool RemoveConnection(Guid userId, string connectionId);
    IReadOnlyCollection<Guid> GetOnlineUsers();
    bool IsUserOnline(Guid userId);
}

public sealed class InMemoryUserTracker : IUserTracker
{
    private readonly ConcurrentDictionary<Guid, HashSet<string>> users = new();
    private readonly object syncRoot = new();

    public bool AddConnection(Guid userId, string connectionId)
    {
        lock (syncRoot)
        {
            var connections = users.GetOrAdd(userId, _ => new HashSet<string>());
            var wasOffline = connections.Count == 0;
            connections.Add(connectionId);
            return wasOffline;
        }
    }

    public bool RemoveConnection(Guid userId, string connectionId)
    {
        lock (syncRoot)
        {
            if (users.TryGetValue(userId, out var connections))
            {
                connections.Remove(connectionId);
                if (connections.Count == 0)
                {
                    users.TryRemove(userId, out _);
                    return true;
                }
            }
            return false;
        }
    }

    public IReadOnlyCollection<Guid> GetOnlineUsers()
    {
        lock (syncRoot)
        {
            return users.Keys.ToArray();
        }
    }

    public bool IsUserOnline(Guid userId)
    {
        lock (syncRoot)
        {
            return users.ContainsKey(userId);
        }
    }
}

[Authorize]
public sealed class RealtimeHub(IUserTracker userTracker) : Hub
{
    public override async Task OnConnectedAsync()
    {
        if (TryGetUserId(out var userId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, UserGroup(userId));
            if (userTracker.AddConnection(userId, Context.ConnectionId))
            {
                await Clients.Others.SendAsync("UserPresenceChanged", userId, true);
            }
        }
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (TryGetUserId(out var userId))
        {
            if (userTracker.RemoveConnection(userId, Context.ConnectionId))
            {
                await Clients.Others.SendAsync("UserPresenceChanged", userId, false);
            }
        }
        await base.OnDisconnectedAsync(exception);
    }

    public Task<IReadOnlyCollection<Guid>> GetOnlineUsers()
    {
        return Task.FromResult(userTracker.GetOnlineUsers());
    }

    private bool TryGetUserId(out Guid userId)
    {
        var value = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier) ?? Context.User?.FindFirstValue("sub");
        return Guid.TryParse(value, out userId);
    }

    public static string UserGroup(Guid userId) => $"user:{userId:N}";
}
