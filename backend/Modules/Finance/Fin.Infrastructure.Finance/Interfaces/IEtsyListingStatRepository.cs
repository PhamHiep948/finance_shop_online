using Fin.Domain.Finance.Entities;

namespace Fin.Infrastructure.Finance.Interfaces
{
    public interface IEtsyListingStatRepository
    {
        // The first day anything was recorded, or null before the first read of the listings.
        Task<DateOnly?> GetFirstDateAsync(CancellationToken cancellationToken);

        // For each listing, its most recent row dated on or before the given day.
        Task<List<EtsyListingDailyStat>> GetLatestAsync(DateOnly onOrBefore, CancellationToken cancellationToken);

        Task<List<EtsyListingDailyStat>> GetByDateAsync(DateOnly date, CancellationToken cancellationToken);

        void Add(EtsyListingDailyStat stat);
    }
}
