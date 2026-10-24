using Fin.Infrastructure.Finance.Models;
using Fin.Service.Finance.Services;

namespace Fin.Tests.Unit.Services
{
    public sealed class EtsyAdsCalculatorTests
    {
        private static readonly FxRateBook NoRates = new(new Dictionary<string, decimal>());

        private static EtsyLedgerEntry Entry(string type, decimal amount, DateOnly date, string description = "", string currency = "USD") =>
            new(Random.Shared.NextInt64(), date, type, description, amount, currency);

        [Theory]
        [InlineData("PROLIST", "")]
        [InlineData("offsite_ads_fee", "")]
        [InlineData("Fee", "Etsy Ads")]
        [InlineData("fee", "Offsite Ads fee for order #123")]
        public void Recognises_etsy_ads_and_offsite_ads(string type, string description)
        {
            Assert.True(EtsyAdsCalculator.IsAds(Entry(type, -1m, new DateOnly(2026, 9, 1), description), []));
        }

        [Theory]
        [InlineData("listing", "Listing fee")]
        [InlineData("transaction", "Transaction fee: Bead ads pattern")]
        [InlineData("PAYMENT_PROCESSING_FEE", "")]
        public void Does_not_count_other_fees_as_ads(string type, string description)
        {
            Assert.False(EtsyAdsCalculator.IsAds(Entry(type, -1m, new DateOnly(2026, 9, 1), description), []));
        }

        [Fact]
        public void Extra_types_from_settings_count_as_ads()
        {
            Assert.True(EtsyAdsCalculator.IsAds(Entry("promo_boost", -1m, new DateOnly(2026, 9, 1)), ["PROMO_BOOST"]));
        }

        [Fact]
        public void Month_total_deducts_ad_credits_and_ignores_other_fees()
        {
            var entries = new[]
            {
                Entry("PROLIST", -5.20m, new DateOnly(2026, 9, 3)),
                Entry("PROLIST", -2.80m, new DateOnly(2026, 9, 20)),
                Entry("offsite_ads_fee_refund", 1.00m, new DateOnly(2026, 9, 21)),
                Entry("listing", -0.20m, new DateOnly(2026, 9, 5)),
                Entry("PROLIST", -9m, new DateOnly(2026, 10, 2)),
            };

            var months = EtsyAdsCalculator.Months(entries, new DateOnly(2026, 9, 1), new DateOnly(2026, 10, 31), new DateOnly(2026, 10, 24), NoRates, []);

            Assert.Equal(2, months.Count);
            Assert.Equal("2026-09", months[0].Month);
            Assert.Equal(7m, months[0].Ads);
            Assert.True(months[0].Complete);
            Assert.Equal(9m, months[1].Ads);
            Assert.False(months[1].Complete);
        }

        [Fact]
        public void Months_without_ads_are_listed_with_zero()
        {
            var months = EtsyAdsCalculator.Months([], new DateOnly(2026, 7, 1), new DateOnly(2026, 9, 30), new DateOnly(2026, 10, 24), NoRates, []);

            Assert.Equal(["2026-07", "2026-08", "2026-09"], months.Select(m => m.Month));
            Assert.All(months, m => Assert.Equal(0m, m.Ads));
        }

        [Fact]
        public void Eur_ads_convert_at_the_typed_monthly_rate()
        {
            var rates = new FxRateBook(new Dictionary<string, decimal> { ["2026-09"] = 1.1593m });
            var entries = new[] { Entry("PROLIST", -10m, new DateOnly(2026, 9, 3), currency: "EUR") };

            var month = EtsyAdsCalculator.Months(entries, new DateOnly(2026, 9, 1), new DateOnly(2026, 9, 30), new DateOnly(2026, 10, 24), rates, []).Single();

            Assert.Equal("EUR", month.Currency);
            Assert.Equal(10m, month.Ads);
            Assert.Equal(11.59m, month.AdsUsd);
        }

        [Fact]
        public void Types_put_ads_first_and_sum_each_type()
        {
            var entries = new[]
            {
                Entry("listing", -0.20m, new DateOnly(2026, 9, 5)),
                Entry("listing", -0.20m, new DateOnly(2026, 9, 6)),
                Entry("PROLIST", -3m, new DateOnly(2026, 9, 3)),
            };

            var types = EtsyAdsCalculator.Types(entries, []);

            Assert.Equal("PROLIST", types[0].LedgerType);
            Assert.True(types[0].IsAds);
            Assert.Equal(-0.40m, types[1].Amount);
            Assert.Equal(2, types[1].Count);
        }

        [Fact]
        public void Last_day_of_month()
        {
            Assert.Equal(new DateOnly(2026, 2, 28), EtsyAdsCalculator.LastDay("2026-02"));
        }
    }
}
