namespace Fin.Model.Dto.Finance.Responses
{
    public sealed class EtsyAutoSyncResponse
    {
        public bool Enabled { get; set; }
        public int IntervalMinutes { get; set; }
        public int LookbackDays { get; set; }
        public DateTime? LastRunAt { get; set; }
        public int LastImported { get; set; }
        public int TotalImported { get; set; }
        public int LastAdsImported { get; set; }
        public DateTime? AdsLastRunAt { get; set; }
        public string? AdsError { get; set; }
        public string? LastError { get; set; }
        public bool Running { get; set; }
        public bool Ready { get; set; }
        public DateTime? NextRunAt { get; set; }
        public IReadOnlyList<int> Intervals { get; set; } = [];
    }
}
