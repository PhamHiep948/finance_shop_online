namespace Fin.Domain.Finance.Entities
{
    // A listing's lifetime counts as Etsy reported them on a day (the last read of that day wins).
    // Etsy gives no counts per period, so the views of a period are the difference of two such days.
    public sealed class EtsyListingDailyStat
    {
        public long ListingId { get; set; }
        public DateOnly Date { get; set; }
        public int Views { get; set; }
        public int Favorites { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
