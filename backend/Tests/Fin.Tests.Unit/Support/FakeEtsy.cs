using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Finance.Models;
using Fin.Infrastructure.Finance.Options;
using Microsoft.Extensions.Options;

namespace Fin.Tests.Unit.Support
{
    // Etsy client returning prepared data and remembering the ranges it was asked for.
    public sealed class FakeEtsyClient : IEtsyClient
    {
        public List<EtsyListing> Listings { get; } = [];
        public List<EtsyReceipt> Receipts { get; } = [];
        public List<EtsyLedgerEntry> LedgerEntries { get; } = [];
        public List<(DateOnly From, DateOnly To)> ReceiptRanges { get; } = [];
        public List<(DateOnly From, DateOnly To)> LedgerRanges { get; } = [];

        public bool IsReady => true;

        public Task<IReadOnlyList<EtsyListing>> GetListingsAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<EtsyListing>>(Listings);

        public Task<IReadOnlyList<EtsyReceipt>> GetPaidReceiptsAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken)
        {
            ReceiptRanges.Add((from, to));
            return Task.FromResult<IReadOnlyList<EtsyReceipt>>(Receipts.Where(r => r.Created >= from && r.Created <= to).ToList());
        }

        // When set, reading the Etsy Payments ledger fails with this error (e.g. a token without the permission).
        public Exception? LedgerError { get; set; }

        public Task<IReadOnlyList<EtsyLedgerEntry>> GetLedgerEntriesAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken)
        {
            LedgerRanges.Add((from, to));
            if (LedgerError is not null)
            {
                return Task.FromException<IReadOnlyList<EtsyLedgerEntry>>(LedgerError);
            }
            return Task.FromResult<IReadOnlyList<EtsyLedgerEntry>>(LedgerEntries.Where(e => e.Created >= from && e.Created <= to).ToList());
        }

        public Task<EtsyConnectionStatus> GetStatusAsync(CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<string> CreateAuthorizeUrlAsync(CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task CompleteAuthorizationAsync(string code, string state, CancellationToken cancellationToken) => throw new NotSupportedException();
        public void Disconnect() => throw new NotSupportedException();
    }

    // ECB rates prepared by the test.
    public sealed class FakeEcbRateProvider : IEcbRateProvider
    {
        public Dictionary<DateOnly, decimal> Daily { get; } = [];
        public EcbRate Latest { get; set; } = new(1.1m, "2026-10-23", true);

        public Task<EcbRate> GetLatestAsync(CancellationToken cancellationToken) => Task.FromResult(Latest);

        public Task<Dictionary<string, decimal>> GetMonthlyAveragesAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken) =>
            Task.FromResult(Daily.Where(p => p.Key >= from && p.Key <= to)
                .GroupBy(p => p.Key.ToString("yyyy-MM"))
                .ToDictionary(g => g.Key, g => decimal.Round(g.Average(p => p.Value), 4)));

        public Task<Dictionary<DateOnly, decimal>> GetDailyAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken) =>
            Task.FromResult(Daily.Where(p => p.Key >= from && p.Key <= to).ToDictionary(p => p.Key, p => p.Value));
    }

    public static class EtsyOptionsFor
    {
        public static StaticOptionsMonitor<EtsyOptions> Shop(params string[] adLedgerTypes) =>
            new(new EtsyOptions { ApiKey = "key", SharedSecret = "secret", ShopId = "777", EuVatPercent = 19m, AdLedgerTypes = adLedgerTypes });
    }
}
