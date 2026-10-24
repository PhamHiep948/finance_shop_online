using Fin.Infrastructure.Finance.Interfaces;

namespace Fin.Service.Finance.Services
{
    public enum FxRateSource
    {
        Daily,
        Monthly,
        Default,
    }

    // The EUR → USD rate of a day: a rate typed for that day, else the month's typed rate, else 1 EUR = 1 USD.
    public sealed class FxRateBook
    {
        private readonly IReadOnlyDictionary<string, decimal> _monthly;
        private readonly IReadOnlyDictionary<DateOnly, decimal> _daily;

        public FxRateBook(IReadOnlyDictionary<string, decimal> monthly, IReadOnlyDictionary<DateOnly, decimal>? daily = null)
        {
            _monthly = monthly;
            _daily = daily ?? new Dictionary<DateOnly, decimal>();
        }

        public static async Task<FxRateBook> LoadAsync(IFinanceUnitOfWork unitOfWork, CancellationToken cancellationToken) =>
            new(await unitOfWork.FxMonthlyRateRepository.GetAllAsync(cancellationToken),
                await unitOfWork.FxDailyRateRepository.GetAllAsync(cancellationToken));

        public (decimal Rate, FxRateSource Source) EurToUsd(DateOnly date)
        {
            if (_daily.TryGetValue(date, out var daily) && daily > 0)
            {
                return (daily, FxRateSource.Daily);
            }
            if (_monthly.TryGetValue(MonthKey.Of(date), out var monthly) && monthly > 0)
            {
                return (monthly, FxRateSource.Monthly);
            }
            return (1m, FxRateSource.Default);
        }

        // Rate used to turn an amount of `currency` into USD on `date`; only EUR is converted.
        public decimal ToUsdRate(string currency, DateOnly date) =>
            currency.Equals("EUR", StringComparison.OrdinalIgnoreCase) ? EurToUsd(date).Rate : 1m;
    }
}
