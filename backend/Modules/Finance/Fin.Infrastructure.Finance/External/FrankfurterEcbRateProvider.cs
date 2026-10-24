using System.Globalization;
using System.Text.Json;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Finance.Models;
using Fin.Infrastructure.Finance.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Fin.Infrastructure.Finance.External
{
    public sealed class FrankfurterEcbRateProvider : IEcbRateProvider
    {
        private const string ApiBase = "https://api.frankfurter.dev/v1";
        private static readonly TimeSpan LatestTtl = TimeSpan.FromHours(6);

        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IOptionsMonitor<EtsyOptions> _options;
        private readonly TimeProvider _timeProvider;
        private readonly ILogger<FrankfurterEcbRateProvider> _logger;
        private readonly SemaphoreSlim _fetchLock = new(1, 1);
        // Rates of past days never change, so they are cached for the process lifetime; "covered" marks days already asked.
        private readonly Dictionary<DateOnly, decimal> _daily = [];
        private readonly HashSet<DateOnly> _covered = [];
        private (decimal Rate, string Date, DateTime FetchedAt)? _latest;

        public FrankfurterEcbRateProvider(
            IHttpClientFactory httpClientFactory,
            IOptionsMonitor<EtsyOptions> options,
            TimeProvider timeProvider,
            ILogger<FrankfurterEcbRateProvider> logger)
        {
            _httpClientFactory = httpClientFactory;
            _options = options;
            _timeProvider = timeProvider;
            _logger = logger;
        }

        public async Task<EcbRate> GetLatestAsync(CancellationToken cancellationToken)
        {
            await _fetchLock.WaitAsync(cancellationToken);
            try
            {
                return await GetLatestUnlockedAsync(cancellationToken);
            }
            finally
            {
                _fetchLock.Release();
            }
        }

        public async Task<Dictionary<string, decimal>> GetMonthlyAveragesAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken)
        {
            await LoadDailyAsync(from, to, cancellationToken);
            lock (_daily)
            {
                return _daily.Where(p => p.Key >= from && p.Key <= to)
                    .GroupBy(p => p.Key.ToString("yyyy-MM", CultureInfo.InvariantCulture))
                    .ToDictionary(g => g.Key, g => decimal.Round(g.Average(p => p.Value), 4));
            }
        }

        public async Task<Dictionary<DateOnly, decimal>> GetDailyAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken)
        {
            await LoadDailyAsync(from, to, cancellationToken);
            lock (_daily)
            {
                return _daily.Where(p => p.Key >= from && p.Key <= to).ToDictionary(p => p.Key, p => p.Value);
            }
        }

        private async Task<EcbRate> GetLatestUnlockedAsync(CancellationToken cancellationToken)
        {
            var now = _timeProvider.GetUtcNow().UtcDateTime;
            if (_latest is { } cached && now - cached.FetchedAt < LatestTtl)
            {
                return new EcbRate(cached.Rate, cached.Date, true);
            }

            try
            {
                using var doc = await GetJsonAsync($"{ApiBase}/latest?base=EUR&symbols=USD", cancellationToken);
                var rate = doc.RootElement.GetProperty("rates").GetProperty("USD").GetDecimal();
                var date = doc.RootElement.GetProperty("date").GetString() ?? string.Empty;
                _latest = (rate, date, now);
                return new EcbRate(rate, date, true);
            }
            catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException or KeyNotFoundException)
            {
                _logger.LogWarning(e, "Could not load the latest EUR/USD rate");
                // Reuse the last good value; without one, fall back to the configured rate.
                return _latest is { } previous
                    ? new EcbRate(previous.Rate, previous.Date, true)
                    : new EcbRate(_options.CurrentValue.EurToUsd, string.Empty, false);
            }
        }

        private async Task LoadDailyAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken)
        {
            var today = DateOnly.FromDateTime(_timeProvider.GetLocalNow().DateTime);
            if (to > today)
            {
                to = today;
            }
            // Start a week earlier so a range beginning on a weekend or holiday still has a previous rate.
            var start = from.AddDays(-7);

            await _fetchLock.WaitAsync(cancellationToken);
            try
            {
                bool missing;
                lock (_daily)
                {
                    missing = Enumerable.Range(0, Math.Max(0, to.DayNumber - start.DayNumber + 1)).Any(i => !_covered.Contains(start.AddDays(i)));
                }
                if (!missing)
                {
                    return;
                }

                try
                {
                    using var doc = await GetJsonAsync($"{ApiBase}/{Iso(start)}..{Iso(to)}?base=EUR&symbols=USD", cancellationToken);
                    lock (_daily)
                    {
                        foreach (var day in doc.RootElement.GetProperty("rates").EnumerateObject())
                        {
                            _daily[DateOnly.ParseExact(day.Name, "yyyy-MM-dd", CultureInfo.InvariantCulture)] = day.Value.GetProperty("USD").GetDecimal();
                        }
                        // Today's rate may not be published yet, so today is not marked as covered and is asked again later.
                        for (var d = start; d < today && d <= to; d = d.AddDays(1))
                        {
                            _covered.Add(d);
                        }
                    }
                }
                catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException or KeyNotFoundException)
                {
                    _logger.LogWarning(e, "Could not load daily EUR/USD rates");
                }
            }
            finally
            {
                _fetchLock.Release();
            }
        }

        private async Task<JsonDocument> GetJsonAsync(string url, CancellationToken cancellationToken)
        {
            using var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(10);
            using var response = await client.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();
            return JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
        }

        private static string Iso(DateOnly date) => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }
}
