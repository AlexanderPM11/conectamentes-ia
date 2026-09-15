using ConectaMentes.Application.Auth;
using ConectaMentes.Domain.Entities;
using ConectaMentes.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ConectaMentes.Infrastructure.Auth;

public sealed class EfUserRepository(ConectaMentesDbContext db) : IUserRepository
{
    public Task<User?> FindByEmailAsync(string normalizedEmail, CancellationToken cancellationToken) => db.Users.SingleOrDefaultAsync(user => user.Email == normalizedEmail, cancellationToken);
    public Task<User?> FindByIdAsync(Guid id, CancellationToken cancellationToken) => db.Users.SingleOrDefaultAsync(user => user.Id == id, cancellationToken);
    public async Task AddAsync(User user, CancellationToken cancellationToken) => await db.Users.AddAsync(user, cancellationToken);
    public Task SaveChangesAsync(CancellationToken cancellationToken) => db.SaveChangesAsync(cancellationToken);
}
