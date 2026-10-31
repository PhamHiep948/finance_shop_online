using Fin.Domain.Finance.Constants;
using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Models;
using Fin.Infrastructure.Finance.Options;
using Fin.Service.Finance.Services;
using Fin.Service.Finance.UseCases.Etsy.Commands;
using Fin.Service.Finance.UseCases.Etsy.Commands.Handlers;
using Fin.Service.Finance.UseCases.Etsy.Queries;
using Fin.Service.Finance.UseCases.Etsy.Queries.Handlers;
using Fin.Tests.Unit.Support;

namespace Fin.Tests.Unit.Services
{
    // Today is 24/10/2026: September is over, October is running.
    public sealed class EtsyAdsImportTests
    {
        private static readonly FixedTimeProvider Today = new(new DateTime(2026, 10, 24, 10, 0, 0));

        private readonly InMemoryFinanceUnitOfWork _unitOfWork = new InMemoryFinanceUnitOfWork()
            .WithCategory(CategoryKinds.Expense, "Vận chuyển")
            .WithCategory(CategoryKinds.Expense, "Quảng cáo")
            .WithCategory(CategoryKinds.Expense, "Chi khác");

        private readonly FakeEtsyClient _etsy = new();
        private bool _lockEnabled;

        private static EtsyLedgerEntry Ad(int month, int day, decimal amount, string currency = "USD", string type = "PROLIST") =>
            new(Random.Shared.NextInt64(), new DateOnly(2026, month, day), type, type == "PROLIST" ? "Etsy Ads" : type + " fee", amount, currency);

        private EtsyAdsImporter Importer(params string[] adTypes) =>
            new(_unitOfWork, _etsy, new AuditTrail(_unitOfWork), EtsyOptionsFor.Shop(adTypes), Today,
                new PeriodLockPolicy(new StaticOptionsMonitor<PeriodLockOptions>(new PeriodLockOptions { Enabled = _lockEnabled, Period = "Quarter", GraceDays = 1 }), Today));

        // Syncs the months from..to (yyyy-MM).
        private async Task<(int Created, int Updated)> SyncAsync(string fromMonth, string? toMonth = null, string[]? adTypes = null)
        {
            MonthKey.TryParse(fromMonth, out var from);
            MonthKey.TryParse(toMonth ?? fromMonth, out var to);
            var result = await Importer(adTypes ?? []).SyncAsync(from, to, "Tự cập nhật phí quảng cáo từ Etsy", CancellationToken.None);
            return (result.Created, result.Updated);
        }

        private LedgerEntry Single(string month) => Assert.Single(_unitOfWork.Entries, e => e.OrderCode == EtsyAdsCalculator.OrderCode(month));

        // ---- Tạo mới

        [Fact]
        public async Task A_month_with_ad_spend_becomes_one_expense_of_category_quang_cao()
        {
            _etsy.LedgerEntries.AddRange([Ad(9, 3, -5.20m), Ad(9, 28, -2.80m), Ad(9, 12, -0.20m, type: "listing")]);

            Assert.Equal((1, 0), await SyncAsync("2026-09"));

            var entry = Single("2026-09");
            Assert.Equal(LedgerKinds.Expense, entry.Kind);
            Assert.Equal(new DateOnly(2026, 9, 30), entry.Date);
            Assert.Equal("Quảng cáo Etsy tháng 09/2026", entry.Description);
            Assert.Equal(_unitOfWork.Categories.Single(c => c.Name == "Quảng cáo").Id, entry.CategoryId);
            Assert.Equal((8m, 0m, 8m), (entry.Amount, entry.TaxPercent, entry.AmountAfterTax));
            Assert.Equal((EntrySources.Etsy, SalesValues.ChannelEtsy, "Etsy"), (entry.Source, entry.SalesChannel, entry.Payee));
            Assert.Equal(("ADS-2026-09", 8m), (entry.Details.ReferenceCode, entry.Details.EtsyAmount));
        }

        [Fact]
        public async Task The_running_month_is_written_right_away_without_waiting_for_its_end()
        {
            _etsy.LedgerEntries.Add(Ad(10, 2, -9m));

            Assert.Equal((1, 0), await SyncAsync("2026-10"));

            var entry = Single("2026-10");
            Assert.Equal((9m, new DateOnly(2026, 10, 31)), (entry.Amount, entry.Date));
            Assert.Contains("Tháng chưa hết", entry.Details.Note);
        }

        [Fact]
        public async Task Older_months_not_yet_written_are_filled_in()
        {
            _etsy.LedgerEntries.AddRange([Ad(7, 3, -50.87m), Ad(8, 3, -63.01m), Ad(9, 3, -98.08m)]);

            Assert.Equal((3, 0), await SyncAsync("2026-07", "2026-09"));

            Assert.Equal([50.87m, 63.01m, 98.08m], new[] { "2026-07", "2026-08", "2026-09" }.Select(m => Single(m).Amount));
        }

        [Fact]
        public async Task Each_new_expense_is_written_to_the_history()
        {
            _etsy.LedgerEntries.Add(Ad(9, 3, -5m));

            await SyncAsync("2026-09");

            var log = Assert.Single(_unitOfWork.AuditLogs);
            Assert.Equal((AuditActions.Create, "Tự cập nhật phí quảng cáo từ Etsy", Single("2026-09").Id), (log.Action, log.Detail, log.EntityId));
        }

        [Fact]
        public async Task A_month_without_ad_spend_gets_no_expense()
        {
            _etsy.LedgerEntries.AddRange([Ad(9, 3, -0.20m, type: "listing"), Ad(9, 4, -3m), Ad(9, 5, 3m, type: "offsite_ads_fee_refund")]);

            Assert.Equal((0, 0), await SyncAsync("2026-09"));
            Assert.Empty(_unitOfWork.Entries);
        }

        // ---- Tự cập nhật

        [Fact]
        public async Task New_charges_of_the_running_month_update_its_expense()
        {
            _etsy.LedgerEntries.Add(Ad(10, 2, -9m));
            await SyncAsync("2026-10");

            _etsy.LedgerEntries.Add(Ad(10, 20, -6m));
            Assert.Equal((0, 1), await SyncAsync("2026-10"));

            var entry = Single("2026-10");
            Assert.Equal((15m, 15m, 15m), (entry.Amount, entry.AmountAfterTax, entry.Details.EtsyAmount));
            var update = _unitOfWork.AuditLogs.Last();
            Assert.Equal(AuditActions.Update, update.Action);
            Assert.Contains("\"amount\"", update.Changes);
        }

        [Fact]
        public async Task A_late_credit_from_etsy_lowers_a_past_month()
        {
            _etsy.LedgerEntries.Add(Ad(9, 3, -10m));
            await SyncAsync("2026-09");

            _etsy.LedgerEntries.Add(Ad(9, 29, 2m, type: "offsite_ads_fee_refund"));
            await SyncAsync("2026-09");

            Assert.Equal(8m, Single("2026-09").Amount);
        }

        [Fact]
        public async Task Nothing_changes_when_etsy_did_not_change()
        {
            _etsy.LedgerEntries.Add(Ad(9, 3, -10m));
            await SyncAsync("2026-09");
            var logs = _unitOfWork.AuditLogs.Count;

            Assert.Equal((0, 0), await SyncAsync("2026-09"));
            Assert.Equal(logs, _unitOfWork.AuditLogs.Count);
        }

        [Fact]
        public async Task An_amount_corrected_by_hand_is_never_overwritten()
        {
            _etsy.LedgerEntries.Add(Ad(10, 2, -9m));
            await SyncAsync("2026-10");
            Single("2026-10").SetAmounts(7m, 0); // the user typed another amount

            _etsy.LedgerEntries.Add(Ad(10, 20, -6m));
            Assert.Equal((0, 0), await SyncAsync("2026-10"));

            Assert.Equal(7m, Single("2026-10").Amount);
        }

        [Fact]
        public async Task A_deleted_month_is_not_written_again_nor_updated()
        {
            _unitOfWork.WithEntry(new LedgerEntry
            {
                Kind = LedgerKinds.Expense, OrderCode = "ADS-2026-09", SalesChannel = SalesValues.ChannelEtsy, DeletedAt = DateTime.UtcNow,
                Details = new LedgerDetails { EtsyAmount = 5m },
            });
            _unitOfWork.Entries[^1].SetAmounts(5m, 0);
            _etsy.LedgerEntries.AddRange([Ad(8, 3, -4m), Ad(9, 3, -9m)]);

            Assert.Equal((1, 0), await SyncAsync("2026-08", "2026-09"));

            Assert.Single(_unitOfWork.Entries, e => e.OrderCode == "ADS-2026-09");
            Assert.Equal(5m, _unitOfWork.Entries.Single(e => e.OrderCode == "ADS-2026-09").Amount);
        }

        [Fact]
        public async Task An_entry_from_the_previous_version_starts_following_etsy_when_it_still_matches()
        {
            // Written by the month-end version: no remembered Etsy amount yet.
            var old = new LedgerEntry { Kind = LedgerKinds.Expense, OrderCode = "ADS-2026-09", SalesChannel = SalesValues.ChannelEtsy, Source = EntrySources.Etsy };
            old.SetAmounts(10m, 0);
            _unitOfWork.WithEntry(old);
            _etsy.LedgerEntries.Add(Ad(9, 3, -10m));

            await SyncAsync("2026-09");
            Assert.Equal(10m, old.Details.EtsyAmount);

            _etsy.LedgerEntries.Add(Ad(9, 29, 1m, type: "offsite_ads_fee_refund"));
            await SyncAsync("2026-09");
            Assert.Equal(9m, old.Amount);
        }

        [Fact]
        public async Task An_entry_from_the_previous_version_that_differs_counts_as_corrected_by_hand()
        {
            var old = new LedgerEntry { Kind = LedgerKinds.Expense, OrderCode = "ADS-2026-09", SalesChannel = SalesValues.ChannelEtsy, Source = EntrySources.Etsy };
            old.SetAmounts(12m, 0);
            _unitOfWork.WithEntry(old);
            _etsy.LedgerEntries.Add(Ad(9, 3, -10m));

            Assert.Equal((0, 0), await SyncAsync("2026-09"));
            Assert.Equal(12m, old.Amount);
        }

        [Fact]
        public async Task A_locked_period_is_not_updated()
        {
            _etsy.LedgerEntries.Add(Ad(6, 3, -10m));
            await SyncAsync("2026-06");
            _etsy.LedgerEntries.Add(Ad(6, 20, -5m));

            // June belongs to Q2, locked since 02/07.
            _lockEnabled = true;
            Assert.Equal((0, 0), await SyncAsync("2026-06"));
            Assert.Equal(10m, Single("2026-06").Amount);
        }

        [Fact]
        public async Task An_income_with_the_same_code_does_not_block_the_expense()
        {
            _unitOfWork.WithEntry(new LedgerEntry { Kind = LedgerKinds.Income, OrderCode = "ADS-2026-09", SalesChannel = SalesValues.ChannelEtsy });
            _etsy.LedgerEntries.Add(Ad(9, 3, -5m));

            Assert.Equal((1, 0), await SyncAsync("2026-09"));
        }

        // ---- Loại chi, tỷ giá, loại phí

        [Fact]
        public async Task Without_a_quang_cao_category_it_falls_back_to_chi_khac()
        {
            _unitOfWork.Categories.RemoveAll(c => c.Name == "Quảng cáo");
            _etsy.LedgerEntries.Add(Ad(9, 3, -5m));

            await SyncAsync("2026-09");

            Assert.Equal(_unitOfWork.Categories.Single(c => c.Name == "Chi khác").Id, Single("2026-09").CategoryId);
        }

        [Fact]
        public async Task Without_either_category_the_entry_has_no_category()
        {
            _unitOfWork.Categories.Clear();
            _etsy.LedgerEntries.Add(Ad(9, 3, -5m));

            await SyncAsync("2026-09");

            Assert.Null(Single("2026-09").CategoryId);
        }

        [Fact]
        public async Task Eur_ads_convert_by_the_rate_of_each_day_and_say_so_in_the_note()
        {
            _unitOfWork.WithMonthlyRate("2026-09", 1.15m).WithDailyRate(new DateOnly(2026, 9, 3), 1.2m);
            _etsy.LedgerEntries.AddRange([Ad(9, 3, -10m, "EUR"), Ad(9, 4, -10m, "EUR")]);

            await SyncAsync("2026-09");

            var entry = Single("2026-09");
            Assert.Equal(23.5m, entry.Amount);
            Assert.Contains("20.00 EUR", entry.Details.Note);
            Assert.Contains("23.50 USD", entry.Details.Note);
        }

        [Fact]
        public async Task Extra_ad_types_from_the_settings_are_counted()
        {
            _etsy.LedgerEntries.Add(Ad(9, 3, -6m, type: "promo_boost"));

            Assert.Equal((1, 0), await SyncAsync("2026-09", adTypes: ["promo_boost"]));
            Assert.Equal(6m, Single("2026-09").Amount);
        }

        [Fact]
        public async Task Only_the_needed_range_is_asked_from_etsy()
        {
            await SyncAsync("2026-07", "2026-09");

            Assert.Equal((new DateOnly(2026, 7, 1), new DateOnly(2026, 9, 30)), Assert.Single(_etsy.LedgerRanges));
        }

        // ---- Bảng theo tháng trên trang

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
        public async Task Fees_tell_which_expense_each_month_became()
        {
            _etsy.LedgerEntries.AddRange([Ad(8, 3, -4m), Ad(9, 3, -6m), Ad(10, 1, -2m)]);
            await SyncAsync("2026-08", "2026-10");
            _unitOfWork.Entries.Single(e => e.OrderCode == "ADS-2026-09").SetAmounts(7m, 0);
            _unitOfWork.Entries.Single(e => e.OrderCode == "ADS-2026-08").DeletedAt = DateTime.UtcNow;

            // From and To given the wrong way round are swapped.
            var result = await new GetEtsyFeesHandler(Importer()).Handle(new GetEtsyFeesQuery { From = "2026-10-31", To = "2026-08-01" }, CancellationToken.None);

            var months = result.Data!.Months;
            Assert.Equal(["2026-10", "2026-09", "2026-08"], months.Select(m => m.Month));
            Assert.All(months, m => Assert.True(m.Imported));
            Assert.Equal(months.Select(m => _unitOfWork.Entries.Single(e => e.OrderCode == "ADS-" + m.Month).Id), months.Select(m => m.ExpenseId!.Value));
            Assert.Equal([false, true, false], months.Select(m => m.Edited));
            Assert.Equal([false, false, true], months.Select(m => m.Deleted));
            Assert.Equal([2m, 7m, 4m], months.Select(m => m.ExpenseAmount!.Value));
            Assert.Equal(("2026-08-01", "2026-10-31"), (result.Data.From, result.Data.To));
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
        }

        [Fact]
        public async Task The_page_can_sync_the_months_it_shows_right_away()
        {
            _etsy.LedgerEntries.AddRange([Ad(8, 3, -4m), Ad(10, 1, -2m)]);

            var result = await new SyncEtsyAdsHandler(Importer()).Handle(new SyncEtsyAdsCommand { From = "2026-10-26", To = "2026-08-15" }, CancellationToken.None);

            Assert.Equal((2, 0), (result.Data!.Created, result.Data.Updated));
            Assert.Equal((new DateOnly(2026, 8, 1), new DateOnly(2026, 10, 31)), Assert.Single(_etsy.LedgerRanges));
        }
    }
}
