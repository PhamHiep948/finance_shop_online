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
        // Ad spend kept in step with Etsy: the last run, how many months it wrote or updated, its error.
        public DateTime? AdsLastRunAt { get; set; }
        public int LastAdsImported { get; set; }
        public string? AdsError { get; set; }
        public string? LastError { get; set; }
    }
}
