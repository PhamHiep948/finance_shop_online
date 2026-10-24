using Fin.Infrastructure.Finance.Models;

namespace Fin.Infrastructure.Finance.Interfaces
{
    public interface IEcbRateProvider
    {
        Task<EcbRate> GetLatestAsync(CancellationToken cancellationToken);

        Task<Dictionary<string, decimal>> GetMonthlyAveragesAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken);

        // Published ECB rates of the range; weekends and holidays have no entry.
        Task<Dictionary<DateOnly, decimal>> GetDailyAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken);
    }
}
