using System.Globalization;
using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Models;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.Constants;

namespace Fin.Service.Finance.Services
{
    // Etsy has no advertising API: ad spend is read from the Etsy Payments ledger, where Etsy Ads and
    // Offsite Ads are charged as their own ledger types.
    public static class EtsyAdsCalculator
    {
        private static readonly string[] AdTypeMarkers = ["prolist", "offsite_ads", "etsy_ads", "ads_fee", "advertis", "marketing"];
        // Only exact phrases are checked in the description: a sale line carries the product title.
        private static readonly string[] AdDescriptionMarkers = ["etsy ads", "offsite ads"];

        public static bool IsAds(EtsyLedgerEntry entry, IReadOnlyCollection<string> extraTypes)
        {
            var type = entry.LedgerType.ToLowerInvariant();
            var description = entry.Description.ToLowerInvariant();
            return extraTypes.Contains(entry.LedgerType, StringComparer.OrdinalIgnoreCase)
                || AdTypeMarkers.Any(type.Contains)
                || AdDescriptionMarkers.Any(description.Contains);
        }

        // One row per month from `from` to `to`, including months without any ad charge.
        public static List<EtsyAdsMonthDto> Months(
            IReadOnlyCollection<EtsyLedgerEntry> entries, DateOnly from, DateOnly to, DateOnly today,
            FxRateBook rates, IReadOnlyCollection<string> extraTypes)
        {
            var ads = entries.Where(e => IsAds(e, extraTypes)).ToList();
            var fallbackCurrency = entries.GroupBy(e => e.Currency).OrderByDescending(g => g.Count()).Select(g => g.Key).FirstOrDefault() ?? "USD";
            var months = new List<EtsyAdsMonthDto>();
            for (var month = new DateOnly(from.Year, from.Month, 1); month <= to; month = month.AddMonths(1))
            {
                var key = MonthKey.Of(month);
                var inMonth = ads.Where(e => e.Created.Year == month.Year && e.Created.Month == month.Month).ToList();
                // A charge is negative and a credit (refunded ad fee) positive, so the spend is the negated sum.
                var spent = -inMonth.Sum(e => e.Amount);
                var charges = inMonth.Where(e => e.Amount < 0).ToList();
                var currency = inMonth.FirstOrDefault()?.Currency ?? fallbackCurrency;
                months.Add(new EtsyAdsMonthDto
                {
                    Month = key,
                    Ads = spent,
                    EtsyAds = -charges.Where(e => !IsOffsite(e)).Sum(e => e.Amount),
                    OffsiteAds = -charges.Where(IsOffsite).Sum(e => e.Amount),
                    Refunds = inMonth.Where(e => e.Amount > 0).Sum(e => e.Amount),
                    Currency = currency,
                    // Each charge converts at the rate of its own day (a typed daily rate, else the month's).
                    AdsUsd = decimal.Round(-inMonth.Sum(e => e.Amount * rates.ToUsdRate(e.Currency, e.Created)), 2, MidpointRounding.AwayFromZero),
                    Complete = month.AddMonths(1) <= today,
                });
            }
            return months;
        }

        // Ad spend of the days from..to (credits deducted), in the ledger currency and in USD (each charge at its day's rate).
        public static (decimal Ads, decimal AdsUsd, string Currency) Range(
            IReadOnlyCollection<EtsyLedgerEntry> entries, DateOnly from, DateOnly to, FxRateBook rates, IReadOnlyCollection<string> extraTypes)
        {
            var ads = entries.Where(e => e.Created >= from && e.Created <= to && IsAds(e, extraTypes)).ToList();
            var currency = ads.FirstOrDefault()?.Currency
                ?? entries.GroupBy(e => e.Currency).OrderByDescending(g => g.Count()).Select(g => g.Key).FirstOrDefault() ?? "USD";
            return (-ads.Sum(e => e.Amount),
                decimal.Round(-ads.Sum(e => e.Amount * rates.ToUsdRate(e.Currency, e.Created)), 2, MidpointRounding.AwayFromZero),
                currency);
        }

        // Offsite Ads are paid per order they bring in; everything else counted as ads is Etsy Ads (on-site).
        public static bool IsOffsite(EtsyLedgerEntry entry) =>
            entry.LedgerType.Contains("offsite", StringComparison.OrdinalIgnoreCase)
            || entry.Description.Contains("offsite", StringComparison.OrdinalIgnoreCase);

        public static List<EtsyFeeTypeDto> Types(IReadOnlyCollection<EtsyLedgerEntry> entries, IReadOnlyCollection<string> extraTypes) =>
            entries
                .GroupBy(e => (e.LedgerType, e.Currency))
                .Select(g => new EtsyFeeTypeDto
                {
                    LedgerType = g.Key.LedgerType,
                    Currency = g.Key.Currency,
                    Description = g.First().Description,
                    Count = g.Count(),
                    Amount = g.Sum(e => e.Amount),
                    IsAds = IsAds(g.First(), extraTypes),
                })
                .OrderByDescending(t => t.IsAds)
                .ThenBy(t => t.Amount)
                .ToList();

        public static string OrderCode(string month) => LedgerEntry.EtsyAdsCodePrefix + month;

        public static DateOnly LastDay(string month)
        {
            var first = DateOnly.ParseExact(month + "-01", FinanceConstants.IsoDateFormat, CultureInfo.InvariantCulture);
            return first.AddMonths(1).AddDays(-1);
        }
    }
}
