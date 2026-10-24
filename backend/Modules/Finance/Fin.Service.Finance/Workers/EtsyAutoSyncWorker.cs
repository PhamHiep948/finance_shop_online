using Fin.Service.Finance.Services;
using Microsoft.Extensions.Hosting;

namespace Fin.Service.Finance.Workers
{
    public sealed class EtsyAutoSyncWorker : BackgroundService
    {
        private readonly EtsyAutoSyncRunner _runner;
        private readonly TimeProvider _timeProvider;

        public EtsyAutoSyncWorker(EtsyAutoSyncRunner runner, TimeProvider timeProvider)
        {
            _runner = runner;
            _timeProvider = timeProvider;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            // Checking every minute lets a changed interval or the on/off switch take effect without a restart.
            using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1), _timeProvider);
            do
            {
                if (_runner.IsDue())
                {
                    await _runner.RunOnceAsync(stoppingToken);
                }
                if (_runner.IsAdsDue())
                {
                    await _runner.RunAdsAsync(stoppingToken);
                }
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
    }
}
