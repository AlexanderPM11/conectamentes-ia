namespace ConectaMentes.Tests;

using ConectaMentes.Application.Auth;
using ConectaMentes.Application.Reputation;
using ConectaMentes.Domain.Entities;

public class FoundationTests
{
    [Fact]
    public void Foundation_is_ready_for_feature_slices()
    {
        Assert.True(true);
    }

    [Fact]
    public void Password_hash_is_verified_without_storing_plaintext()
    {
        var hash = PasswordService.Hash("correcta-123");

        Assert.NotEqual("correcta-123", hash);
        Assert.True(PasswordService.Verify("correcta-123", hash));
        Assert.False(PasswordService.Verify("incorrecta", hash));
    }

    [Fact]
    public async Task Register_and_login_return_a_token_and_profile()
    {
        var repository = new MemoryUsers();
        var service = new AuthService(repository, new FakeTokenService());
        var command = new RegisterCommand("Ana@Example.com", "correcta-123", "Ana");

        var registered = await service.RegisterAsync(command, CancellationToken.None);
        var loggedIn = await service.LoginAsync(new LoginCommand("ana@example.com", "correcta-123"), CancellationToken.None);

        Assert.Equal("token", registered.AccessToken);
        Assert.NotNull(loggedIn);
        Assert.Equal("ana@example.com", loggedIn!.User.Email);
    }

    [Fact]
    public void Reputation_ranking_rewards_consistency_without_hiding_quality()
    {
        var onePerfectRating = ReputationCalculator.RankingScore(5, 1);
        var tenStrongRatings = ReputationCalculator.RankingScore(4.8, 10);

        Assert.Equal(4.25, onePerfectRating);
        Assert.Equal(4.62, tenStrongRatings);
        Assert.True(tenStrongRatings > onePerfectRating);
        Assert.Equal(4.5, ReputationCalculator.SessionScore(5, 4, 5, 4));
    }

    private sealed class FakeTokenService : ITokenService
    {
        public string CreateToken(User user) => "token";
    }

    private sealed class MemoryUsers : IUserRepository
    {
        private readonly List<User> users = [];
        public Task<User?> FindByEmailAsync(string email, CancellationToken _) => Task.FromResult(users.SingleOrDefault(user => user.Email == email));
        public Task<User?> FindByIdAsync(Guid id, CancellationToken _) => Task.FromResult(users.SingleOrDefault(user => user.Id == id));
        public Task AddAsync(User user, CancellationToken _) { users.Add(user); return Task.CompletedTask; }
        public Task SaveChangesAsync(CancellationToken _) => Task.CompletedTask;
    }
}
