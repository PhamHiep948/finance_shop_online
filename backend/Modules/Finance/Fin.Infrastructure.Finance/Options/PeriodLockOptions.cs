namespace Fin.Infrastructure.Finance.Options
{
    public sealed class PeriodLockOptions
    {
        public const string SectionName = "PeriodLock";

        // Off by default: entries of any past month, quarter or year stay editable.
        public bool Enabled { get; set; }
        public string Period { get; set; } = "Quarter";
        public int GraceDays { get; set; } = 1;
    }
}
