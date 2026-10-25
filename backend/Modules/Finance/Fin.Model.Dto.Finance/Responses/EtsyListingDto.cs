namespace Fin.Model.Dto.Finance.Responses
{
    public sealed class EtsyListingDto
    {
        public long ListingId { get; set; }
        public string Title { get; set; } = string.Empty;
        public string State { get; set; } = string.Empty;
        public string Url { get; set; } = string.Empty;
        public string? ImageUrl { get; set; }
        // Lifetime counts kept by Etsy since the listing was published.
        public int Views { get; set; }
        public int Favorites { get; set; }
        public int Stock { get; set; }
        public decimal Price { get; set; }
        public string Currency { get; set; } = "USD";
    }
}
