using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Finance.Models;
using Fin.Infrastructure.Finance.Options;
using Fin.Infrastructure.Shared.Exceptions;
using Fin.Model.Dto.Finance.Responses;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Fin.Service.Finance.Services
{
    public sealed class EtsyAutoSyncRunner
    {
        public static readonly IReadOnlyList<int> Intervals = [15, 30, 60, 360, 1440];
        private const int MaxLookbackDays = 90;

        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IEtsyClient _etsyClient;
        private readonly IEtsyAutoSyncStateStore _stateStore;
        private readonly IOptionsMonitor<EtsyOptions> _options;
        private readonly TimeProvider _timeProvider;
        private readonly ILogger<EtsyAutoSyncRunner> _logger;
        private readonly SemaphoreSlim _runLock = new(1, 1);
        private EtsyAutoSyncState? _state;
        // A failed month-end attempt waits an hour, except that a restart (e.g. after fixing the cause) tries again at once.
        private bool _adsTriedSinceStart;

        public EtsyAutoSyncRunner(
            IServiceScopeFactory scopeFactory,
            IEtsyClient etsyClient,
            IEtsyAutoSyncStateStore stateStore,
            IOptionsMonitor<EtsyOptions> options,
            TimeProvider timeProvider,
            ILogger<EtsyAutoSyncRunner> logger)
        {
            _scopeFactory = scopeFactory;
            _etsyClient = etsyClient;
            _stateStore = stateStore;
            _options = options;
            _timeProvider = timeProvider;
            _logger = logger;
        }

        public bool IsReady => _etsyClient.IsReady;

        private EtsyAutoSyncState State => _state ??= _stateStore.Load();

        private DateTime LocalNow => _timeProvider.GetLocalNow().DateTime;

        public EtsyAutoSyncResponse Status()
        {
            var state = State;
            DateTime? nextRun = null;
            if (state.Enabled && _etsyClient.IsReady)
            {
                nextRun = state.LastRunAt is null ? LocalNow : state.LastRunAt.Value.AddMinutes(state.IntervalMinutes);
            }

            return new EtsyAutoSyncResponse
            {
                Enabled = state.Enabled,
                IntervalMinutes = state.IntervalMinutes,
                LookbackDays = state.LookbackDays,
                LastRunAt = state.LastRunAt,
                LastImported = state.LastImported,
                TotalImported = state.TotalImported,
                LastAdsImported = state.LastAdsImported,
                AdsLastRunAt = state.AdsLastRunAt,
                AdsError = state.AdsError,
                LastError = state.LastError,
                Running = _runLock.CurrentCount == 0,
                Ready = _etsyClient.IsReady,
                NextRunAt = nextRun,
                Intervals = Intervals,
            };
        }

        public EtsyAutoSyncResponse Configure(bool enabled, int intervalMinutes)
        {
            State.Enabled = enabled;
            if (Intervals.Contains(intervalMinutes))
            {
                State.IntervalMinutes = intervalMinutes;
            }
            _stateStore.Save(State);
            return Status();
        }

        public bool IsDue()
        {
            var state = State;
            return state.Enabled && _etsyClient.IsReady
                && (state.LastRunAt is null || LocalNow - state.LastRunAt >= TimeSpan.FromMinutes(state.IntervalMinutes));
        }

        private static readonly TimeSpan AdsEvery = TimeSpan.FromHours(1);
        // How far back the ad expenses are kept in step with Etsy.
        private const int AdsMonthsBack = 11;

        // The ad spend is written as an expense as soon as Etsy charges it and kept up to date every hour,
        // whether or not the order sync is switched on; a restart checks right away.
        public bool IsAdsDue()
        {
            var state = State;
            return _etsyClient.IsReady
                && (!_adsTriedSinceStart || state.AdsLastRunAt is null || LocalNow - state.AdsLastRunAt >= AdsEvery);
        }

        // Recorded with the hourly ads run, so every day the app is on has the listings' counts,
        // even when the listings page is not opened; a failure here does not stop the ads.
        private async Task RecordListingStatsAsync(IServiceProvider services, CancellationToken cancellationToken)
        {
            try
            {
                var stats = services.GetRequiredService<EtsyListingStats>();
                await stats.RecordAsync(await _etsyClient.GetListingsAsync(cancellationToken), cancellationToken);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                _logger.LogWarning(e, "Could not record today's Etsy listing views");
            }
        }

        public async Task RunAdsAsync(CancellationToken cancellationToken)
        {
            if (!await _runLock.WaitAsync(0, cancellationToken))
            {
                return;
            }

            _adsTriedSinceStart = true;
            try
            {
                using var scope = _scopeFactory.CreateScope();
                await RecordListingStatsAsync(scope.ServiceProvider, cancellationToken);
                var importer = scope.ServiceProvider.GetRequiredService<EtsyAdsImporter>();
                var thisMonth = new DateOnly(LocalNow.Year, LocalNow.Month, 1);
                var result = await importer.SyncAsync(thisMonth.AddMonths(-AdsMonthsBack), thisMonth, "Tự cập nhật phí quảng cáo từ Etsy", cancellationToken);
                State.LastAdsImported = result.Created + result.Updated;
                State.AdsError = null;
                if (State.LastAdsImported > 0)
                {
                    _logger.LogInformation("Etsy ad spend: {Created} months written, {Updated} updated", result.Created, result.Updated);
                }
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                State.LastAdsImported = 0;
                State.AdsError = e.Message;
                _logger.LogWarning(e, "Could not bring the Etsy ad spend up to date");
            }
            finally
            {
                State.AdsLastRunAt = LocalNow;
                _stateStore.Save(State);
                _runLock.Release();
            }
        }

        public async Task RunOnceAsync(CancellationToken cancellationToken)
        {
            if (!await _runLock.WaitAsync(0, cancellationToken))
            {
                return;
            }

            try
            {
                var to = DateOnly.FromDateTime(LocalNow);
                var from = to.AddDays(-Math.Clamp(State.LookbackDays, 1, MaxLookbackDays));
                using var scope = _scopeFactory.CreateScope();
                var unitOfWork = scope.ServiceProvider.GetRequiredService<IFinanceUnitOfWork>();
                var importer = scope.ServiceProvider.GetRequiredService<EtsyOrderImporter>();

                var receipts = await _etsyClient.GetPaidReceiptsAsync(from, to, cancellationToken);
                var rates = await FxRateBook.LoadAsync(unitOfWork, cancellationToken);
                var orders = receipts.Select(r => EtsyOrderMapper.Map(r, rates, _options.CurrentValue.EuVatPercent)).ToList();
                var result = await importer.ImportAsync(orders, "Tự động đồng bộ từ Etsy", cancellationToken);

                State.LastImported = result.Imported;
                State.TotalImported += result.Imported;
                State.LastError = null;
                if (result.Imported > 0)
                {
                    _logger.LogInformation("Etsy auto sync imported {Count} new orders", result.Imported);
                }
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                State.LastImported = 0;
                State.LastError = e is ApiException or HttpRequestException ? e.Message : "Lỗi khi đồng bộ: " + e.Message;
                _logger.LogWarning(e, "Etsy auto sync failed");
            }
            finally
            {
                State.LastRunAt = LocalNow;
                _stateStore.Save(State);
                _runLock.Release();
            }
        }
    }
}
