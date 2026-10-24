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
                AdsMonthDone = state.AdsMonthDone,
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

        private static readonly TimeSpan AdsRetryAfter = TimeSpan.FromHours(1);

        private string LastMonth => MonthKey.Of(new DateOnly(LocalNow.Year, LocalNow.Month, 1).AddMonths(-1));

        // The ad spend of a month is written as an expense as soon as the month is over, whether or not the order sync
        // is switched on; a failed attempt is retried every hour.
        public bool IsAdsDue()
        {
            var state = State;
            return _etsyClient.IsReady
                && state.AdsMonthDone != LastMonth
                && (state.AdsError is null || state.AdsLastRunAt is null || LocalNow - state.AdsLastRunAt >= AdsRetryAfter);
        }

        // Only the month that just ended is written: an older month may already have been entered by hand, or deleted
        // on purpose (its trash entry possibly purged since), and must not come back.
        public async Task RunAdsAsync(CancellationToken cancellationToken)
        {
            if (!await _runLock.WaitAsync(0, cancellationToken))
            {
                return;
            }

            var month = LastMonth;
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var importer = scope.ServiceProvider.GetRequiredService<EtsyAdsImporter>();
                MonthKey.TryParse(month, out var first);
                var result = await importer.ImportAsync([first], "Tự ghi phí quảng cáo Etsy cuối tháng", cancellationToken);
                State.LastAdsImported = result.Imported;
                State.AdsMonthDone = month;
                State.AdsError = null;
                if (result.Imported > 0)
                {
                    _logger.LogInformation("Etsy ad spend of {Month} written as an expense", month);
                }
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                State.LastAdsImported = 0;
                State.AdsError = e.Message;
                _logger.LogWarning(e, "Could not write the Etsy ad spend of {Month}", month);
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
