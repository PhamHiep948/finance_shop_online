using Fin.Infrastructure.Finance.Models;
using Fin.Service.Finance.Services;

namespace Fin.Tests.Unit.Services
{
    public sealed class FxRateBookTests
    {
        private static readonly FxRateBook Book = new(
            new Dictionary<string, decimal> { ["2026-08"] = 1.16m },
            new Dictionary<DateOnly, decimal> { [new DateOnly(2026, 8, 6)] = 1.2m });

        [Fact]
        public void A_typed_day_wins_over_the_month()
        {
            Assert.Equal((1.2m, FxRateSource.Daily), Book.EurToUsd(new DateOnly(2026, 8, 6)));
        }

        [Fact]
        public void Other_days_of_the_month_use_the_monthly_rate()
        {
            Assert.Equal((1.16m, FxRateSource.Monthly), Book.EurToUsd(new DateOnly(2026, 8, 7)));
        }

        [Fact]
        public void A_month_without_any_rate_converts_one_to_one()
        {
            Assert.Equal((1m, FxRateSource.Default), Book.EurToUsd(new DateOnly(2026, 9, 1)));
        }

        [Fact]
        public void Usd_amounts_are_never_converted()
        {
            Assert.Equal(1m, Book.ToUsdRate("USD", new DateOnly(2026, 8, 6)));
        }

        [Fact]
        public void Etsy_order_of_a_typed_day_uses_the_daily_rate()
        {
            var receipt = new EtsyReceipt("1", new DateOnly(2026, 8, 6), "EUR", [new EtsyReceiptItem("Lilie", 1)], 10m, 0, 10m, 0, 0, "US", 0);

            var order = EtsyOrderMapper.Map(receipt, Book, 19m);

            Assert.Equal(12m, order.Amount);
            Assert.Contains("tỷ giá tự nhập ngày 06/08/2026", order.Note);
        }

        [Fact]
        public void Ads_convert_each_charge_at_the_rate_of_its_day()
        {
            var entries = new[]
            {
                new EtsyLedgerEntry(1, new DateOnly(2026, 8, 6), "PROLIST", "", -10m, "EUR"),
                new EtsyLedgerEntry(2, new DateOnly(2026, 8, 7), "PROLIST", "", -10m, "EUR"),
            };

            var month = EtsyAdsCalculator.Months(entries, new DateOnly(2026, 8, 1), new DateOnly(2026, 8, 31), new DateOnly(2026, 10, 24), Book, []).Single();

            Assert.Equal(20m, month.Ads);
            Assert.Equal(23.6m, month.AdsUsd);
        }
    }
}
