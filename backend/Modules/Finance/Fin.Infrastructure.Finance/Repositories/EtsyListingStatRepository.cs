using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Contexts;
using Fin.Infrastructure.Finance.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Fin.Infrastructure.Finance.Repositories
{
    public sealed class EtsyListingStatRepository : IEtsyListingStatRepository
    {
        private readonly FinanceContext _dbContext;

        public EtsyListingStatRepository(FinanceContext dbContext)
        {
            _dbContext = dbContext;
        }

        public async Task<DateOnly?> GetFirstDateAsync(CancellationToken cancellationToken)
        {
            return await _dbContext.EtsyListingDailyStats.MinAsync(x => (DateOnly?)x.Date, cancellationToken);
        }

        public async Task<List<EtsyListingDailyStat>> GetLatestAsync(DateOnly onOrBefore, CancellationToken cancellationToken)
        {
            var latest = _dbContext.EtsyListingDailyStats
                .Where(x => x.Date <= onOrBefore)
                .GroupBy(x => x.ListingId)
                .Select(g => new { ListingId = g.Key, Date = g.Max(x => x.Date) });
            return await _dbContext.EtsyListingDailyStats.AsNoTracking()
                .Join(latest, x => new { x.ListingId, x.Date }, l => new { l.ListingId, l.Date }, (x, _) => x)
                .ToListAsync(cancellationToken);
        }

        public async Task<List<EtsyListingDailyStat>> GetByDateAsync(DateOnly date, CancellationToken cancellationToken)
        {
            return await _dbContext.EtsyListingDailyStats.Where(x => x.Date == date).ToListAsync(cancellationToken);
        }

        public void Add(EtsyListingDailyStat stat) => _dbContext.EtsyListingDailyStats.Add(stat);
    }
}
