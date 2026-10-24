using Fin.Domain.Finance.Entities;

namespace Fin.Infrastructure.Finance.Interfaces
{
    public interface IFxDailyRateRepository
    {
        Task<Dictionary<DateOnly, decimal>> GetAllAsync(CancellationToken cancellationToken);

        Task<FxDailyRate?> GetAsync(DateOnly date, CancellationToken cancellationToken);

        void Add(FxDailyRate rate);

        void Remove(FxDailyRate rate);
    }
}
