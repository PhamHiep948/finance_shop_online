using System.Text.Json;
using Fin.Domain.Finance.Constants;
using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Exceptions;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Finance.Models;
using Fin.Infrastructure.Finance.Options;
using Fin.Model.Dto.Finance.Requests;
using Fin.Service.Finance.Services;
using Fin.Service.Finance.UseCases.LedgerEntries.Commands;
using Fin.Service.Finance.UseCases.LedgerEntries.Commands.Handlers;
using Fin.Tests.Unit.Support;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Fin.Tests.Unit.Services
{
    // Today is 24/10/2026.
    public sealed class EtsyAdsEditAndAutoSyncTests
    {
        private static readonly FixedTimeProvider Today = new(new DateTime(2026, 10, 24, 10, 0, 0));

        private readonly InMemoryFinanceUnitOfWork _unitOfWork = new InMemoryFinanceUnitOfWork()
            .WithCategory(CategoryKinds.Expense, "Quảng cáo")
            .WithCategory(CategoryKinds.Income, "Bán hàng");

        private readonly FakeEtsyClient _etsy = new();

        private long AdsCategory => _unitOfWork.Categories.Single(c => c.Name == "Quảng cáo").Id;

        private EtsyAdsImporter Importer() =>
            new(_unitOfWork, _etsy, new AuditTrail(_unitOfWork), EtsyOptionsFor.Shop(), Today, PeriodLockOff());

        private static PeriodLockPolicy PeriodLockOff() =>
            new(new StaticOptionsMonitor<PeriodLockOptions>(new PeriodLockOptions { Enabled = false }), Today);

        private LedgerEntry SeedAdsEntry()
        {
            var entry = new LedgerEntry
            {
                Kind = LedgerKinds.Expense, Date = new DateOnly(2026, 9, 30), Description = "Quảng cáo Etsy tháng 09/2026",
                CategoryId = AdsCategory, OrderCode = "ADS-2026-09", SalesChannel = SalesValues.ChannelEtsy, Payee = "Etsy",
                Source = EntrySources.Etsy, Details = new LedgerDetails { ReferenceCode = "ADS-2026-09", EtsyAmount = 8m },
            };
            entry.SetAmounts(8m, 0);
            _unitOfWork.WithEntry(entry);
            return entry;
        }

        private async Task<Fin.Infrastructure.Shared.Wrappers.Response<Fin.Model.Dto.Finance.Responses.LedgerEntryResponse>> UpdateAsync(LedgerEntry entry, LedgerEntryRequest payload)
        {
            var periodLock = new PeriodLockPolicy(new StaticOptionsMonitor<PeriodLockOptions>(new PeriodLockOptions { Enabled = false }), Today);
            return await new UpdateLedgerEntryHandler(_unitOfWork, periodLock, new AuditTrail(_unitOfWork))
                .Handle(new UpdateLedgerEntryCommand { Kind = entry.Kind, Id = entry.Id, Payload = payload }, CancellationToken.None);
        }

        // ---- Sửa khoản quảng cáo Etsy

        [Fact]
        public async Task The_amount_of_an_etsy_ad_expense_can_be_corrected()
        {
            var entry = SeedAdsEntry();

            // The expense form does not send the order code or channel.
            var result = await UpdateAsync(entry, new LedgerEntryRequest
            {
                Date = "2026-09-30", Description = "Quảng cáo Etsy tháng 09/2026 (đã trừ hoàn phí)", CategoryId = AdsCategory,
                Amount = 9.5m, TaxPercent = 19m, Payee = "Etsy", Note = "Sửa theo sao kê",
            });

            Assert.True(result.Succeeded, result.Message);
            Assert.Equal((9.5m, 19m, 11.31m), (entry.Amount, entry.TaxPercent, entry.AmountAfterTax));
            Assert.Equal("Quảng cáo Etsy tháng 09/2026 (đã trừ hoàn phí)", entry.Description);
            Assert.Equal("Sửa theo sao kê", entry.Details.Note);
        }

        [Fact]
        public async Task Editing_keeps_the_etsy_identity_so_the_month_is_not_imported_again()
        {
            var entry = SeedAdsEntry();

            await UpdateAsync(entry, new LedgerEntryRequest { Date = "2026-09-30", Description = "QC", CategoryId = AdsCategory, Amount = 9.5m });

            Assert.Equal(("ADS-2026-09", SalesValues.ChannelEtsy, EntrySources.Etsy), (entry.OrderCode, entry.SalesChannel, entry.Source));
            _etsy.LedgerEntries.Add(new EtsyLedgerEntry(1, new DateOnly(2026, 9, 3), "PROLIST", "Etsy Ads", -8m, "USD"));
            var again = await Importer().SyncAsync(new DateOnly(2026, 9, 1), new DateOnly(2026, 9, 1), "test", CancellationToken.None);
            Assert.Equal((0, 0), (again.Created, again.Updated));
            Assert.Single(_unitOfWork.Entries, e => e.OrderCode == "ADS-2026-09");
            // The corrected amount stays, although Etsy says 8.
            Assert.Equal(9.5m, entry.Amount);
        }

        [Fact]
        public async Task The_history_keeps_the_original_etsy_amount()
        {
            var entry = SeedAdsEntry();

            await UpdateAsync(entry, new LedgerEntryRequest { Date = "2026-09-30", Description = entry.Description, CategoryId = AdsCategory, Amount = 9.5m });

            var log = Assert.Single(_unitOfWork.AuditLogs);
            Assert.Equal(AuditActions.Update, log.Action);
            using var changes = JsonDocument.Parse(log.Changes!);
            var amount = changes.RootElement.GetProperty("amount");
            // The history stores values as text.
            Assert.Equal(8m, decimal.Parse(amount.GetProperty("from").GetString()!, System.Globalization.CultureInfo.InvariantCulture));
            Assert.Equal(9.5m, decimal.Parse(amount.GetProperty("to").GetString()!, System.Globalization.CultureInfo.InvariantCulture));
        }

        [Fact]
        public async Task An_etsy_order_still_only_takes_its_product_group()
        {
            var order = new LedgerEntry
            {
                Kind = LedgerKinds.Income, Date = new DateOnly(2026, 9, 3), Description = "Lilie", OrderCode = "4136894034",
                SalesChannel = SalesValues.ChannelEtsy, Source = EntrySources.Etsy,
            };
            order.SetAmounts(20m, 0);
            _unitOfWork.WithEntry(order);
            var group = _unitOfWork.Categories.Single(c => c.Name == "Bán hàng").Id;

            await UpdateAsync(order, new LedgerEntryRequest { Date = "2026-09-03", Description = "Đổi tên", CategoryId = group, Amount = 999m });

            Assert.Equal((group, 20m, "Lilie"), (order.CategoryId, order.Amount, order.Description));
        }

        // ---- Đồng bộ tự động nhập phí quảng cáo

        private sealed class MemoryStateStore : IEtsyAutoSyncStateStore
        {
            public EtsyAutoSyncState State { get; } = new() { Enabled = true, LookbackDays = 14 };
            public EtsyAutoSyncState Load() => State;
            public void Save(EtsyAutoSyncState state) { }
        }

        private (EtsyAutoSyncRunner Runner, MemoryStateStore Store) Runner(MemoryStateStore? savedState = null)
        {
            var services = new ServiceCollection()
                .AddSingleton<IFinanceUnitOfWork>(_unitOfWork)
                .AddSingleton<IEtsyClient>(_etsy)
                .AddSingleton<IOptionsMonitor<EtsyOptions>>(EtsyOptionsFor.Shop())
                .AddSingleton<TimeProvider>(Today)
                .AddScoped<AuditTrail>()
                .AddScoped<EtsyOrderImporter>()
                .AddScoped<EtsyAdsImporter>()
                .AddScoped<EtsyListingStats>()
                .AddSingleton(PeriodLockOff())
                .BuildServiceProvider();
            var store = savedState ?? new MemoryStateStore();
            var runner = new EtsyAutoSyncRunner(services.GetRequiredService<IServiceScopeFactory>(), _etsy, store,
                EtsyOptionsFor.Shop(), Today, NullLogger<EtsyAutoSyncRunner>.Instance);
            return (runner, store);
        }

        private void SeedEtsy()
        {
            _etsy.Receipts.Add(new EtsyReceipt("5001", new DateOnly(2026, 10, 20), "USD", [new EtsyReceiptItem("Lilie", 1, 1)], 20m, 0, 20m, 0, 0, "US", 0));
            _etsy.LedgerEntries.AddRange([
                new EtsyLedgerEntry(1, new DateOnly(2026, 8, 3), "PROLIST", "Etsy Ads", -4m, "USD"),
                new EtsyLedgerEntry(2, new DateOnly(2026, 9, 3), "PROLIST", "Etsy Ads", -7m, "USD"),
                new EtsyLedgerEntry(3, new DateOnly(2026, 10, 3), "PROLIST", "Etsy Ads", -2m, "USD"),
            ]);
        }

        [Fact]
        public async Task Editing_by_hand_survives_the_next_automatic_update()
        {
            var entry = SeedAdsEntry();
            await UpdateAsync(entry, new LedgerEntryRequest { Date = "2026-09-30", Description = entry.Description, CategoryId = AdsCategory, Amount = 9.5m });
            // The form does not send the remembered Etsy amount; it is kept anyway.
            Assert.Equal(8m, entry.Details.EtsyAmount);

            _etsy.LedgerEntries.Add(new EtsyLedgerEntry(1, new DateOnly(2026, 9, 3), "PROLIST", "Etsy Ads", -12m, "USD"));
            var (runner, _) = Runner();
            await runner.RunAdsAsync(CancellationToken.None);

            Assert.Equal(9.5m, entry.Amount);
        }

        [Fact]
        public async Task The_hourly_run_writes_and_updates_ad_spend_even_with_order_sync_off()
        {
            SeedEtsy();
            var (runner, store) = Runner();
            store.State.Enabled = false;

            Assert.True(runner.IsAdsDue());
            await runner.RunAdsAsync(CancellationToken.None);

            // August, September and the running October, each its own expense.
            Assert.Equal((3, (string?)null), (store.State.LastAdsImported, store.State.AdsError));
            Assert.Equal([4m, 7m, 2m], new[] { "ADS-2026-08", "ADS-2026-09", "ADS-2026-10" }.Select(c => _unitOfWork.Entries.Single(e => e.OrderCode == c).Amount));
            // Twelve months back to the running one.
            Assert.Equal((new DateOnly(2025, 11, 1), new DateOnly(2026, 10, 31)), Assert.Single(_etsy.LedgerRanges));
            Assert.Equal(3, runner.Status().LastAdsImported);
        }

        [Fact]
        public async Task The_next_hour_brings_new_charges_of_the_running_month()
        {
            SeedEtsy();
            var (runner, store) = Runner();
            await runner.RunAdsAsync(CancellationToken.None);
            Assert.False(runner.IsAdsDue());

            _etsy.LedgerEntries.Add(new EtsyLedgerEntry(4, new DateOnly(2026, 10, 20), "PROLIST", "Etsy Ads", -5m, "USD"));
            store.State.AdsLastRunAt = store.State.AdsLastRunAt!.Value.AddHours(-1);
            Assert.True(runner.IsAdsDue());
            await runner.RunAdsAsync(CancellationToken.None);

            Assert.Equal(1, store.State.LastAdsImported);
            Assert.Equal(7m, _unitOfWork.Entries.Single(e => e.OrderCode == "ADS-2026-10").Amount);
        }

        [Fact]
        public async Task A_failure_is_reported_and_retried_an_hour_later()
        {
            SeedEtsy();
            _etsy.LedgerError = new EtsyException("Etsy không cho đọc sổ thu chi Etsy Payments của shop 777");
            var (runner, store) = Runner();

            await runner.RunAdsAsync(CancellationToken.None);

            Assert.Contains("Etsy Payments", store.State.AdsError);
            Assert.Empty(_unitOfWork.Entries);
            Assert.False(runner.IsAdsDue());
            store.State.AdsLastRunAt = store.State.AdsLastRunAt!.Value.AddHours(-1);
            Assert.True(runner.IsAdsDue());
        }

        [Fact]
        public async Task After_a_restart_the_ad_spend_is_checked_at_once()
        {
            SeedEtsy();
            // Saved by the previous run, five minutes ago.
            var saved = new MemoryStateStore();
            saved.State.AdsError = "Table 'finance.fx_daily' doesn't exist";
            saved.State.AdsLastRunAt = new DateTime(2026, 10, 24, 9, 55, 0);

            // The app restarted: a fresh runner reads that saved state.
            var (runner, store) = Runner(saved);

            Assert.True(runner.IsAdsDue());
            await runner.RunAdsAsync(CancellationToken.None);
            Assert.Null(store.State.AdsError);
            Assert.Equal(3, _unitOfWork.Entries.Count);
        }

        [Fact]
        public async Task The_order_sync_no_longer_writes_ad_spend()
        {
            SeedEtsy();
            var (runner, store) = Runner();

            await runner.RunOnceAsync(CancellationToken.None);

            Assert.Equal(1, store.State.LastImported);
            Assert.Single(_unitOfWork.Entries);
            Assert.Equal(LedgerKinds.Income, _unitOfWork.Entries[0].Kind);
            Assert.Empty(_etsy.LedgerRanges);
        }
    }
}
