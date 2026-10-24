namespace Fin.Model.Dto.Finance.Responses
{
    // One day of the rate calendar.
    public sealed class FxDayRowResponse
    {
        public string Date { get; set; } = string.Empty;
        // Rate typed for this day only.
        public decimal? Manual { get; set; }
        // Rate typed for the whole month.
        public decimal? Monthly { get; set; }
        // ECB reference rate published that day (none on weekends and holidays).
        public decimal? Ecb { get; set; }
        // Rate the app converts with on this day, and where it comes from: DAILY, MONTHLY or DEFAULT (1 EUR = 1 USD).
        public decimal Used { get; set; }
        public string Source { get; set; } = string.Empty;
    }
}
