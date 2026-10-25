using Fin.Domain.Finance.Constants;
using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Models;
using Fin.Service.Finance.Services;
using Fin.Service.Finance.UseCases.Etsy.Queries;
using Fin.Service.Finance.UseCases.Etsy.Queries.Handlers;
using Fin.Tests.Unit.Support;

namespace Fin.Tests.Unit.Services
{
    // Today is 24/10/2026: September is finished, October is not.
    public sealed class EtsyAdsImportTests
    {
        private readonly InMemoryFinanceUnitOfWork _unitOfWork = new InMemoryFinanceUnitOfWork()
            .WithCategory(CategoryKinds.Expense, "Vận chuyển")
            .WithCategory(CategoryKinds.Expense, "Quảng cáo")
            .WithCategory(CategoryKinds.Expense, "Chi khác");

        private readonly FakeEtsyClient _etsy = new();

        private static EtsyLedgerEntry Ad(int month, int day, decimal amount, string currency = "USD", string type = "PROLIST") =>
            new(Random.Shared.NextInt64(), new DateOnly(2026, month, day), type, type == "PROLIST" ? "Etsy Ads" : type + " fee", amount, currency);

        private EtsyAdsImporter Importer(params string[] adTypes) =>
            new(_unitOfWork, _etsy, new AuditTrail(_unitOfWork), EtsyOptionsFor.Shop(adTypes), new FixedTimeProvider(new DateTime(2026, 10, 24, 10, 0, 0)));

        private async Task<(int Imported, int Skipped)> ImportAsync(params string[] months)
        {
            var firstDays = months.Select(m => { MonthKey.TryParse(m, out var d); return d; }).ToList();
            var result = await Importer().ImportAsync(firstDays, "Tự ghi phí quảng cáo Etsy cuối tháng", CancellationToken.None);
            return (result.Imported, result.Skipped);
        }

        private LedgerEntry Single(string month) => Assert.Single(_unitOfWork.Entries, e => e.OrderCode == EtsyAdsCalculator.OrderCode(month));

        [Fact]
        public async Task A_finished_month_becomes_one_expense_of_category_quang_cao()
        {
            _etsy.LedgerEntries.AddRange([Ad(9, 3, -5.20m), Ad(9, 28, -2.80m), Ad(9, 12, -0.20m, type: "listing")]);

            var (imported, skipped) = await ImportAsync("2026-09");

            Assert.Equal((1, 0), (imported, skipped));
            var entry = Single("2026-09");
            Assert.Equal(LedgerKinds.Expense, entry.Kind);
            Assert.Equal(new DateOnly(2026, 9, 30), entry.Date);
            Assert.Equal("Quảng cáo Etsy tháng 09/2026", entry.Description);
            Assert.Equal(_unitOfWork.Categories.Single(c => c.Name == "Quảng cáo").Id, entry.CategoryId);
            Assert.Equal(8m, entry.Amount);
            Assert.Equal(0m, entry.TaxPercent);
            Assert.Equal(8m, entry.AmountAfterTax);
            Assert.Equal(EntrySources.Etsy, entry.Source);
            Assert.Equal(SalesValues.ChannelEtsy, entry.SalesChannel);
            Assert.Equal("Etsy", entry.Payee);
            Assert.Equal("ADS-2026-09", entry.Details.ReferenceCode);
        }

        [Fact]
        public async Task Each_import_is_written_to_the_history()
        {
            _etsy.LedgerEntries.Add(Ad(9, 3, -5m));

            await ImportAsync("2026-09");

            var log = Assert.Single(_unitOfWork.AuditLogs);
            Assert.Equal(AuditActions.Create, log.Action);
            Assert.Equal("Tự ghi phí quảng cáo Etsy cuối tháng", log.Detail);
            Assert.Equal(Single("2026-09").Id, log.EntityId);
        }

        [Fact]
        public async Task The_current_month_is_not_imported_yet()
        {
            _etsy.LedgerEntries.Add(Ad(10, 2, -9m));

            var (imported, skipped) = await ImportAsync("2026-10");

            Assert.Equal((0, 1), (imported, skipped));
            Assert.Empty(_unitOfWork.Entries);
        }

        [Fact]
        public async Task A_month_is_never_imported_twice_even_after_it_was_trashed()
        {
            _unitOfWork.WithEntry(new LedgerEntry
            {
                Kind = LedgerKinds.Expense, OrderCode = "ADS-2026-09", SalesChannel = SalesValues.ChannelEtsy, DeletedAt = DateTime.UtcNow,
            });
            _etsy.LedgerEntries.AddRange([Ad(8, 3, -4m), Ad(9, 3, -5m)]);

            var (imported, skipped) = await ImportAsync("2026-08", "2026-09");

            Assert.Equal((1, 1), (imported, skipped));
            Single("2026-08");
            Assert.Single(_unitOfWork.Entries, e => e.OrderCode == "ADS-2026-09");
        }

        [Fact]
        public async Task An_income_with_the_same_code_does_not_block_the_expense()
        {
            _unitOfWork.WithEntry(new LedgerEntry { Kind = LedgerKinds.Income, OrderCode = "ADS-2026-09", SalesChannel = SalesValues.ChannelEtsy });
            _etsy.LedgerEntries.Add(Ad(9, 3, -5m));

            var (imported, _) = await ImportAsync("2026-09");

            Assert.Equal(1, imported);
        }

        [Fact]
        public async Task A_month_without_ad_spend_is_skipped()
        {
            _etsy.LedgerEntries.AddRange([Ad(9, 3, -0.20m, type: "listing"), Ad(9, 4, -3m), Ad(9, 5, 3m, type: "offsite_ads_fee_refund")]);

            var (imported, skipped) = await ImportAsync("2026-09");

            Assert.Equal((0, 1), (imported, skipped));
        }

        [Fact]
        public async Task Without_a_quang_cao_category_it_falls_back_to_chi_khac()
        {
            _unitOfWork.Categories.RemoveAll(c => c.Name == "Quảng cáo");
            _etsy.LedgerEntries.Add(Ad(9, 3, -5m));

            await ImportAsync("2026-09");

            Assert.Equal(_unitOfWork.Categories.Single(c => c.Name == "Chi khác").Id, Single("2026-09").CategoryId);
        }

        [Fact]
        public async Task Without_either_category_the_entry_has_no_category()
        {
            _unitOfWork.Categories.Clear();
            _etsy.LedgerEntries.Add(Ad(9, 3, -5m));

            await ImportAsync("2026-09");

            Assert.Null(Single("2026-09").CategoryId);
        }

        [Fact]
        public async Task Eur_ads_convert_by_the_rate_of_each_day_and_say_so_in_the_note()
        {
            _unitOfWork.WithMonthlyRate("2026-09", 1.15m).WithDailyRate(new DateOnly(2026, 9, 3), 1.2m);
            _etsy.LedgerEntries.AddRange([Ad(9, 3, -10m, "EUR"), Ad(9, 4, -10m, "EUR")]);

            await ImportAsync("2026-09");

            var entry = Single("2026-09");
            Assert.Equal(23.5m, entry.Amount);
            Assert.Contains("20.00 EUR", entry.Details.Note);
            Assert.Contains("23.50 USD", entry.Details.Note);
        }

        [Fact]
        public async Task Extra_ad_types_from_the_settings_are_counted()
        {
            _etsy.LedgerEntries.Add(Ad(9, 3, -6m, type: "promo_boost"));

            var result = await Importer("promo_boost").ImportAsync([new DateOnly(2026, 9, 1)], "test", CancellationToken.None);

            Assert.Equal(1, result.Imported);
            Assert.Equal(6m, Single("2026-09").Amount);
        }

        [Fact]
        public async Task Only_the_needed_range_is_asked_from_etsy()
        {
            await ImportAsync("2026-07", "2026-09");

            Assert.Equal((new DateOnly(2026, 7, 1), new DateOnly(2026, 9, 30)), Assert.Single(_etsy.LedgerRanges));
        }

        [Fact]
        public async Task Each_month_splits_etsy_ads_offsite_ads_and_refunds()
        {
            _etsy.LedgerEntries.AddRange([
                Ad(9, 3, -5m),
                Ad(9, 4, -3m, type: "offsite_ads_fee"),
                Ad(9, 5, 1m, type: "offsite_ads_fee_refund"),
                new EtsyLedgerEntry(9, new DateOnly(2026, 9, 6), "fee", "Offsite Ads fee for order #1", -2m, "USD"),
            ]);

            var result = await new GetEtsyFeesHandler(Importer()).Handle(new GetEtsyFeesQuery { From = "2026-09-01", To = "2026-09-30" }, CancellationToken.None);

            var month = Assert.Single(result.Data!.Months);
            Assert.Equal((5m, 5m, 1m, 9m), (month.EtsyAds, month.OffsiteAds, month.Refunds, month.Ads));
        }

        [Fact]
        public async Task Fees_list_every_month_newest_first_and_mark_imported_ones()
        {
            _unitOfWork.WithEntry(new LedgerEntry { Kind = LedgerKinds.Expense, OrderCode = "ADS-2026-08", SalesChannel = SalesValues.ChannelEtsy });
            _etsy.LedgerEntries.AddRange([Ad(8, 3, -4m), Ad(10, 1, -2m)]);

            // From and To given the wrong way round are swapped.
            var result = await new GetEtsyFeesHandler(Importer()).Handle(new GetEtsyFeesQuery { From = "2026-10-31", To = "2026-08-01" }, CancellationToken.None);

            var months = result.Data!.Months;
            Assert.Equal(["2026-10", "2026-09", "2026-08"], months.Select(m => m.Month));
            Assert.Equal([false, true, true], months.Select(m => m.Complete));
            Assert.Equal([false, false, true], months.Select(m => m.Imported));
            Assert.Equal([2m, 0m, 4m], months.Select(m => m.Ads));
            Assert.Equal([2m, 0m, 4m], months.Select(m => m.EtsyAds));
            Assert.Equal((new DateOnly(2026, 8, 1), new DateOnly(2026, 10, 31)), Assert.Single(_etsy.LedgerRanges));
            Assert.Equal("2026-08-01", result.Data.From);
            Assert.Equal("2026-10-31", result.Data.To);
        }

        [Fact]
        public async Task The_range_total_counts_only_the_chosen_days_while_months_stay_whole()
        {
            _unitOfWork.WithMonthlyRate("2026-09", 1.2m);
            _etsy.LedgerEntries.AddRange([Ad(9, 3, -5m, "EUR"), Ad(9, 20, -7m, "EUR"), Ad(10, 2, -9m, "EUR")]);

            var result = await new GetEtsyFeesHandler(Importer()).Handle(new GetEtsyFeesQuery { From = "2026-09-15", To = "2026-10-10" }, CancellationToken.None);

            var fees = result.Data!;
            // 20/09 and 02/10 are inside; 03/09 is not. September at 1.2, October without a rate at 1.
            Assert.Equal((16m, 17.4m, "EUR"), (fees.RangeAds, fees.RangeAdsUsd, fees.Currency));
            Assert.Equal([9m, 12m], fees.Months.Select(m => m.Ads));
            Assert.Equal((new DateOnly(2026, 9, 1), new DateOnly(2026, 10, 31)), Assert.Single(_etsy.LedgerRanges));
        }
    }
}
