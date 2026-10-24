using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Contexts;
using Fin.Infrastructure.Finance.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Fin.Infrastructure.Finance.Repositories
{
    public sealed class FxDailyRateRepository : IFxDailyRateRepository
    {
        private readonly FinanceContext _dbContext;

        public FxDailyRateRepository(FinanceContext dbContext)
        {
            _dbContext = dbContext;
        }

        public async Task<Dictionary<DateOnly, decimal>> GetAllAsync(CancellationToken cancellationToken)
        {
            return await _dbContext.FxDailyRates.AsNoTracking()
                .ToDictionaryAsync(x => x.Date, x => x.EurToUsd, cancellationToken);
        }

        public async Task<FxDailyRate?> GetAsync(DateOnly date, CancellationToken cancellationToken)
        {
            return await _dbContext.FxDailyRates.FirstOrDefaultAsync(x => x.Date == date, cancellationToken);
        }

        public void Add(FxDailyRate rate) => _dbContext.FxDailyRates.Add(rate);

        public void Remove(FxDailyRate rate) => _dbContext.FxDailyRates.Remove(rate);
    }
}
