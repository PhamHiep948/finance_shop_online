namespace Fin.Domain.Finance.Entities
{
    // A rate typed for one day; it wins over the month's rate for that day only.
    public sealed class FxDailyRate
    {
        public DateOnly Date { get; set; }
        public decimal EurToUsd { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
