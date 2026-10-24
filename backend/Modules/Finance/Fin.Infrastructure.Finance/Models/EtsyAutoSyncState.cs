namespace Fin.Infrastructure.Finance.Models
{
    public sealed class EtsyAutoSyncState
    {
        public bool Enabled { get; set; }
        public int IntervalMinutes { get; set; } = 60;
        public int LookbackDays { get; set; } = 14;
        public DateTime? LastRunAt { get; set; }
        public int LastImported { get; set; }
        public int TotalImported { get; set; }
        // Month-end ad spend: the last month already written as an expense (yyyy-MM), the last attempt, its result.
        public string? AdsMonthDone { get; set; }
        public DateTime? AdsLastRunAt { get; set; }
        public int LastAdsImported { get; set; }
        public string? AdsError { get; set; }
        public string? LastError { get; set; }
    }
}
